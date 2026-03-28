import { useEffect, useRef, useCallback, useState } from 'react';
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

const MEXC_WS = 'wss://wbs.mexc.com/ws';

const MEXC_INTERVALS: Record<ChartTimeframe, string> = {
  '1s': 'Min1', '1m': 'Min1', '5m': 'Min5', '15m': 'Min15', '1h': 'Min60',
  '4h': 'Hour4', '1d': 'Day1', '1w': 'Week1',
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
  const pingTimer = useRef<ReturnType<typeof setInterval>>();
  const reconnectAttempts = useRef(0);
  const mountedRef = useRef(true);
  const lastKlineTimeRef = useRef(0);

  useEffect(() => { onKlineRef.current = onKlineUpdate; }, [onKlineUpdate]);
  useEffect(() => { onTickRef.current = onTick; }, [onTick]);

  const connect = useCallback(() => {
    if (!symbol) return;

    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    if (pingTimer.current) { clearInterval(pingTimer.current); pingTimer.current = undefined; }

    const pair = `${symbol.toUpperCase()}USDT`;
    const mexcInterval = MEXC_INTERVALS[interval];

    try {
      const ws = new WebSocket(MEXC_WS);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        setIsConnected(true);
        reconnectAttempts.current = 0;
        lastKlineTimeRef.current = 0;

        ws.send(JSON.stringify({
          method: 'SUBSCRIPTION',
          params: [`spot@public.kline.v3.api@${mexcInterval}@${pair}`],
        }));
        ws.send(JSON.stringify({
          method: 'SUBSCRIPTION',
          params: [`spot@public.deals.v3.api@${pair}`],
        }));

        pingTimer.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ method: 'PING' }));
        }, 20000);
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        try {
          const msg = JSON.parse(event.data);
          if (msg.msg === 'PONG' || msg.id !== undefined) return;

          if (msg.c && msg.c.includes('kline') && msg.d?.k) {
            const k = msg.d.k;
            const openTimeMs = typeof k.t === 'number' ? k.t : parseInt(k.t);
            const openTimeSec = Math.floor(openTimeMs / 1000);
            const isClosed = lastKlineTimeRef.current > 0 && openTimeSec !== lastKlineTimeRef.current;
            lastKlineTimeRef.current = openTimeSec;

            onKlineRef.current({
              time: openTimeSec,
              open: parseFloat(k.o),
              high: parseFloat(k.h),
              low: parseFloat(k.l),
              close: parseFloat(k.c),
              volume: parseFloat(k.v || k.q || '0'),
              isClosed,
            });
          }

          if (msg.c && msg.c.includes('deals') && msg.d?.deals) {
            const deals = msg.d.deals;
            if (!Array.isArray(deals) || deals.length === 0) return;
            const latest = deals[deals.length - 1];
            if (onTickRef.current && latest) {
              onTickRef.current({
                price: parseFloat(latest.p),
                quantity: parseFloat(latest.v || '0'),
                time: Math.floor((latest.t || Date.now()) / 1000),
              });
            }
          }
        } catch { /* ignore */ }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setIsConnected(false);
        if (pingTimer.current) { clearInterval(pingTimer.current); pingTimer.current = undefined; }
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
        reconnectAttempts.current++;
        reconnectTimer.current = setTimeout(() => { if (mountedRef.current) connect(); }, delay);
      };

      ws.onerror = () => { if (!mountedRef.current) return; ws.close(); };
    } catch { /* ignore */ }
  }, [symbol, interval]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      clearTimeout(reconnectTimer.current);
      if (pingTimer.current) clearInterval(pingTimer.current);
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    };
  }, [connect]);

  return { isConnected };
}
