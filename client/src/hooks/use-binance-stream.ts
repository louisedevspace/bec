import { useEffect, useRef, useCallback, useState } from 'react';
import type { ChartTimeframe } from '@/types/chart';

export interface BinanceKlineUpdate {
  time: number;      // Kline open time (seconds for lightweight-charts)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isClosed: boolean; // Whether this kline is closed (final)
}

export interface BinanceTick {
  price: number;
  quantity: number;
  time: number;      // Trade time in seconds
}

// MEXC WebSocket — free, no API key, real-time klines + trades
const MEXC_WS = 'wss://wbs.mexc.com/ws';

// MEXC uses same interval strings as Binance for klines
const MEXC_INTERVALS: Record<ChartTimeframe, string> = {
  '1m': 'Min1', '5m': 'Min5', '15m': 'Min15', '1h': 'Min60',
  '4h': 'Hour4', '1d': 'Day1', '1w': 'Week1',
};

/**
 * Real-time price stream using MEXC WebSocket.
 * MEXC provides proper kline streams with OHLCV data directly,
 * eliminating wick desync issues.
 */
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
  const pingTimer = useRef<ReturnType<typeof setInterval>>();
  const reconnectAttempts = useRef(0);
  const mountedRef = useRef(true);

  // Keep callback refs updated without causing reconnect
  useEffect(() => { onKlineRef.current = onKlineUpdate; }, [onKlineUpdate]);
  useEffect(() => { onTickRef.current = onTick; }, [onTick]);

  const connect = useCallback(() => {
    if (!symbol) return;

    // Clean up any existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (pingTimer.current) {
      clearInterval(pingTimer.current);
      pingTimer.current = undefined;
    }

    const pair = `${symbol.toUpperCase()}USDT`;
    const mexcInterval = MEXC_INTERVALS[interval];

    try {
      const ws = new WebSocket(MEXC_WS);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        setIsConnected(true);
        reconnectAttempts.current = 0;

        // Subscribe to kline stream
        ws.send(JSON.stringify({
          method: 'SUBSCRIPTION',
          params: [`spot@public.kline.v3.api@${pair}@${mexcInterval}`],
        }));

        // Subscribe to deals/trades stream for ticks
        ws.send(JSON.stringify({
          method: 'SUBSCRIPTION',
          params: [`spot@public.deals.v3.api@${pair}`],
        }));

        // MEXC requires ping every 30s to keep connection alive
        pingTimer.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ method: 'PING' }));
          }
        }, 20000);
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        try {
          const msg = JSON.parse(event.data);

          // Handle PONG response (ignore)
          if (msg.msg === 'PONG' || msg.id !== undefined) return;

          // Handle kline data
          if (msg.c && msg.c.includes('kline')) {
            const k = msg.d?.k;
            if (!k) return;

            const kline: BinanceKlineUpdate = {
              time: Math.floor(k.t / 1000),  // Convert ms → seconds for lightweight-charts
              open: parseFloat(k.o),
              high: parseFloat(k.h),
              low: parseFloat(k.l),
              close: parseFloat(k.c),
              volume: parseFloat(k.v || '0'),
              isClosed: k.x === true,
            };
            onKlineRef.current(kline);
          }

          // Handle trade/deals data for ticks
          if (msg.c && msg.c.includes('deals')) {
            const deals = msg.d?.deals;
            if (!deals || !Array.isArray(deals) || deals.length === 0) return;

            // Use the most recent trade
            const latest = deals[deals.length - 1];
            if (onTickRef.current && latest) {
              onTickRef.current({
                price: parseFloat(latest.p),
                quantity: parseFloat(latest.v || '0'),
                time: Math.floor((latest.t || Date.now()) / 1000),
              });
            }
          }
        } catch {
          // Ignore parse errors
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setIsConnected(false);
        if (pingTimer.current) {
          clearInterval(pingTimer.current);
          pingTimer.current = undefined;
        }
        // Exponential backoff: 1s, 2s, 4s, 8s … max 30s
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
        reconnectAttempts.current++;
        reconnectTimer.current = setTimeout(() => {
          if (mountedRef.current) connect();
        }, delay);
      };

      ws.onerror = () => {
        if (!mountedRef.current) return;
        setIsConnected(false);
        ws.close();
      };
    } catch {
      // Failed to create WebSocket
    }
  }, [symbol, interval]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      clearTimeout(reconnectTimer.current);
      if (pingTimer.current) {
        clearInterval(pingTimer.current);
        pingTimer.current = undefined;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return { isConnected };
}
