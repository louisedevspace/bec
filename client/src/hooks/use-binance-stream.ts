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

const BINANCE_WS_BASE = 'wss://stream.binance.com:9443/ws';

/**
 * Direct Binance WebSocket stream for real-time kline (candlestick) data.
 * Connects to: wss://stream.binance.com:9443/ws/<symbol>@kline_<interval>
 */
export function useBinanceStream(
  symbol: string,
  interval: ChartTimeframe,
  onUpdate: (kline: BinanceKlineUpdate) => void
) {
  const wsRef = useRef<WebSocket | null>(null);
  const onUpdateRef = useRef(onUpdate);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const mountedRef = useRef(true);

  // Keep callback ref updated without causing reconnect
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  const connect = useCallback(() => {
    if (!symbol) return;

    // Clean up any existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    // Build Binance stream name: e.g. btcusdt@kline_1h
    const pair = symbol.toLowerCase().includes('usdt')
      ? symbol.toLowerCase()
      : `${symbol.toLowerCase()}usdt`;
    const streamName = `${pair}@kline_${interval}`;
    const url = `${BINANCE_WS_BASE}/${streamName}`;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        try {
          const msg = JSON.parse(event.data);
          if (msg.e === 'kline' && msg.k) {
            const k = msg.k;
            onUpdateRef.current({
              time: Math.floor(k.t / 1000),  // Open time in seconds
              open: parseFloat(k.o),
              high: parseFloat(k.h),
              low: parseFloat(k.l),
              close: parseFloat(k.c),
              volume: parseFloat(k.v),
              isClosed: k.x,
            });
          }
        } catch {
          // Ignore parse errors
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setIsConnected(false);
        // Auto-reconnect after 3 seconds
        reconnectTimer.current = setTimeout(() => {
          if (mountedRef.current) connect();
        }, 3000);
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
