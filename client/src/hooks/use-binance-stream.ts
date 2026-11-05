import { useEffect, useRef, useState } from 'react';
import type { ChartTimeframe } from '@/types/chart';
import { useWebSocket } from './use-websocket';
import { safeCloseWebSocket } from "@/lib/safe-close-websocket";

export interface BinanceKlineUpdate {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isClosed: boolean;
}

export interface BinanceTick {
  price: number;
  quantity: number;
  time: number;
}

const WS_PRIMARY = 'wss://stream.binance.com:9443/ws';
const WS_FALLBACK = 'wss://stream.binance.com:443/ws';

const BINANCE_INTERVALS: Record<ChartTimeframe, string> = {
  '1s': '1s', '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h',
  '4h': '4h', '1d': '1d', '1w': '1w',
};

function killSocket(ws: WebSocket | null) {
  if (!ws) return;
  ws.onopen = null;
  ws.onmessage = null;
  ws.onclose = null;
  ws.onerror = null;
  if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
    safeCloseWebSocket(ws);
  }
}

export function useBinanceStream(
  symbol: string,
  interval: ChartTimeframe,
  onKlineUpdate: (kline: BinanceKlineUpdate) => void,
  onTick?: (tick: BinanceTick) => void
) {
  const wsRef = useRef<WebSocket | null>(null);
  const onKlineRef = useRef(onKlineUpdate);
  const onTickRef = useRef(onTick);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const reconnectAttempts = useRef(0);
  const mountedRef = useRef(true);
  const useFallbackRef = useRef(false);
  // When the direct Binance socket last delivered a real message. Binance
  // accepts the connection even for a symbol it doesn't list (socket reads
  // OPEN) but then sends nothing — so "readyState === OPEN" is NOT proof the
  // feed is alive. Tracking real data lets us hand off to the server relay
  // whenever the direct feed goes silent, instead of freezing the chart.
  const lastDirectDataAt = useRef(0);

  // Server-side relay fallback — used only while the direct Binance socket
  // above is down (regional block, CORS, ad-blocker). The server already
  // polls MEXC for live prices via live-crypto-service.ts; kline-relay-service.ts
  // reuses that same reachable pipeline for kline data.
  const { subscribe: subscribeRelay, sendMessage: sendRelayMessage, isConnected: relayWsConnected } = useWebSocket('/ws');

  useEffect(() => { onKlineRef.current = onKlineUpdate; }, [onKlineUpdate]);
  useEffect(() => { onTickRef.current = onTick; }, [onTick]);

  useEffect(() => {
    if (!symbol) return;

    mountedRef.current = true;

    const pair = symbol.toLowerCase() + 'usdt';
    const binanceInterval = BINANCE_INTERVALS[interval];
    const streams = `${pair}@kline_${binanceInterval}/${pair}@trade`;

    function connect() {
      // Detach old socket — handlers nulled so its onclose/onerror become no-ops
      killSocket(wsRef.current);
      wsRef.current = null;

      if (!mountedRef.current) return;

      try {
        const base = useFallbackRef.current ? WS_FALLBACK : WS_PRIMARY;
        const ws = new WebSocket(`${base}/${streams}`);
        wsRef.current = ws;

        ws.onopen = () => {
          if (wsRef.current !== ws) return;
          setIsConnected(true);
          reconnectAttempts.current = 0;
          useFallbackRef.current = false;
        };

        ws.onmessage = (event) => {
          if (wsRef.current !== ws) return;
          try {
            const msg = JSON.parse(event.data);

            if (msg.e === 'kline' && msg.k) {
              lastDirectDataAt.current = Date.now();
              const k = msg.k;
              onKlineRef.current({
                time: Math.floor(k.t / 1000),
                open: parseFloat(k.o),
                high: parseFloat(k.h),
                low: parseFloat(k.l),
                close: parseFloat(k.c),
                volume: parseFloat(k.v || '0'),
                isClosed: k.x === true,
              });
            }

            if (msg.e === 'trade') {
              lastDirectDataAt.current = Date.now();
              if (onTickRef.current) {
                onTickRef.current({
                  price: parseFloat(msg.p),
                  quantity: parseFloat(msg.q || '0'),
                  time: Math.floor(msg.T / 1000),
                });
              }
            }
          } catch { /* ignore */ }
        };

        ws.onclose = () => {
          if (wsRef.current !== ws) return; // stale socket, ignore
          wsRef.current = null;
          setIsConnected(false);

          if (!mountedRef.current) return;

          useFallbackRef.current = !useFallbackRef.current;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          reconnectAttempts.current++;
          reconnectTimer.current = setTimeout(connect, delay);
        };

        ws.onerror = () => {
          if (wsRef.current !== ws) return;
          safeCloseWebSocket(ws);
        };
      } catch { /* ignore */ }
    }

    connect();

    return () => {
      mountedRef.current = false;
      clearTimeout(reconnectTimer.current);
      killSocket(wsRef.current);
      wsRef.current = null;
    };
  }, [symbol, interval]);

  // Subscribe the server relay for the current symbol/interval — kept alive
  // in parallel with the direct Binance attempt so it's already warm the
  // moment Binance fails, instead of only kicking in after a delay.
  useEffect(() => {
    if (!symbol || !relayWsConnected) return;
    const relaySymbol = symbol.toUpperCase();
    sendRelayMessage({ type: 'subscribe_kline', symbol: relaySymbol, interval });
    return () => sendRelayMessage({ type: 'unsubscribe_kline', symbol: relaySymbol, interval });
  }, [symbol, interval, relayWsConnected, sendRelayMessage]);

  useEffect(() => {
    return subscribeRelay('kline_relay', (payload: { symbol: string; interval: string; data: BinanceKlineUpdate }) => {
      if (!payload || payload.symbol !== symbol.toUpperCase() || payload.interval !== interval) return;
      // Use the relay unless the DIRECT Binance feed is actually alive — i.e.
      // it's not enough that the socket is OPEN; it must have delivered real
      // data within the last few seconds. This lets the MEXC-backed relay take
      // over whenever Binance is open-but-silent (unlisted symbol, regional
      // block), instead of the chart sitting frozen showing "Live".
      const directAlive =
        wsRef.current &&
        wsRef.current.readyState === WebSocket.OPEN &&
        Date.now() - lastDirectDataAt.current < 8000;
      if (directAlive) return;
      onKlineRef.current(payload.data);
    });
  }, [subscribeRelay, symbol, interval]);

  return { isConnected: isConnected || relayWsConnected, isFallback: !isConnected && relayWsConnected };
}
