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

const BINANCE_WS_BASE = 'wss://stream.binance.com:9443';

/**
 * Direct Binance combined WebSocket stream for real-time chart data.
 * Uses the combined streams endpoint to subscribe to both:
 *   - <pair>@kline_<interval>  — full OHLCV snapshot every ~2s
 *   - <pair>@aggTrade          — every aggregated trade for sub-second price updates
 *
 * Combined stream URL: /stream?streams=<stream1>/<stream2>
 * Messages arrive wrapped: { "stream": "<name>", "data": <payload> }
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

    // Build Binance stream names (lowercase per Binance spec)
    const pair = symbol.toLowerCase().includes('usdt')
      ? symbol.toLowerCase()
      : `${symbol.toLowerCase()}usdt`;

    const klineStream = `${pair}@kline_${interval}`;
    const tradeStream = `${pair}@aggTrade`;
    // Combined stream endpoint — single connection, multiple streams
    const url = `${BINANCE_WS_BASE}/stream?streams=${klineStream}/${tradeStream}`;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        setIsConnected(true);
        reconnectAttempts.current = 0;
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        try {
          // Combined stream wraps each message: { stream, data }
          const wrapper = JSON.parse(event.data);
          const msg = wrapper.data;
          if (!msg) return;

          if (msg.e === 'kline' && msg.k) {
            const k = msg.k;
            onKlineRef.current({
              time: Math.floor(k.t / 1000),  // Open time → seconds
              open: parseFloat(k.o),
              high: parseFloat(k.h),
              low: parseFloat(k.l),
              close: parseFloat(k.c),
              volume: parseFloat(k.v),
              isClosed: k.x,
            });
          } else if (msg.e === 'aggTrade' && onTickRef.current) {
            onTickRef.current({
              price: parseFloat(msg.p),
              quantity: parseFloat(msg.q),
              time: Math.floor(msg.T / 1000),
            });
          }
        } catch {
          // Ignore parse errors
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setIsConnected(false);
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
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return { isConnected };
}
