import { useEffect, useRef, useState } from 'react';
import type { ChartTimeframe } from '@/types/chart';

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
  const intentionalCloseRef = useRef(false);
  const useFallbackRef = useRef(false);

  useEffect(() => { onKlineRef.current = onKlineUpdate; }, [onKlineUpdate]);
  useEffect(() => { onTickRef.current = onTick; }, [onTick]);

  useEffect(() => {
    if (!symbol) return;

    mountedRef.current = true;
    intentionalCloseRef.current = false;

    const pair = symbol.toLowerCase() + 'usdt';
    const binanceInterval = BINANCE_INTERVALS[interval];
    // Combined stream: kline + trade
    const streams = `${pair}@kline_${binanceInterval}/${pair}@trade`;

    function connect() {
      if (wsRef.current) {
        intentionalCloseRef.current = true;
        wsRef.current.close();
        wsRef.current = null;
      }

      intentionalCloseRef.current = false;

      try {
        const base = useFallbackRef.current ? WS_FALLBACK : WS_PRIMARY;
        const ws = new WebSocket(`${base}/${streams}`);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!mountedRef.current) { ws.close(); return; }
          setIsConnected(true);
          reconnectAttempts.current = 0;
          useFallbackRef.current = false;
        };

        ws.onmessage = (event) => {
          if (!mountedRef.current) return;
          try {
            const msg = JSON.parse(event.data);

            // Kline event
            if (msg.e === 'kline' && msg.k) {
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

            // Trade event
            if (msg.e === 'trade' && onTickRef.current) {
              onTickRef.current({
                price: parseFloat(msg.p),
                quantity: parseFloat(msg.q || '0'),
                time: Math.floor(msg.T / 1000),
              });
            }
          } catch { /* ignore */ }
        };

        ws.onclose = () => {
          setIsConnected(false);

          if (intentionalCloseRef.current || !mountedRef.current) return;

          useFallbackRef.current = !useFallbackRef.current;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          reconnectAttempts.current++;
          reconnectTimer.current = setTimeout(() => {
            if (mountedRef.current) connect();
          }, delay);
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch { /* ignore */ }
    }

    connect();

    return () => {
      mountedRef.current = false;
      intentionalCloseRef.current = true;
      clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [symbol, interval]);

  return { isConnected };
}
