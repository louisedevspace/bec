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

const COINCAP_WS = 'wss://ws.coincap.io/prices?assets=';

// CoinCap uses lowercase full names; map from our ticker symbols
const SYMBOL_TO_COINCAP: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', BNB: 'binance-coin', SOL: 'solana',
  XRP: 'xrp', ADA: 'cardano', DOT: 'polkadot', DOGE: 'dogecoin',
  AVAX: 'avalanche', LINK: 'chainlink', LTC: 'litecoin', MATIC: 'polygon',
  ATOM: 'cosmos', TRX: 'tron', SHIB: 'shiba-inu', BCH: 'bitcoin-cash',
  DASH: 'dash', XMR: 'monero', XLM: 'stellar', FIL: 'filecoin',
  APT: 'aptos', SUI: 'sui', ARB: 'arbitrum', OP: 'optimism',
  PEPE: 'pepe', INJ: 'injective-protocol',
};

const INTERVAL_SECONDS: Record<ChartTimeframe, number> = {
  '1m': 60, '5m': 300, '15m': 900, '1h': 3600,
  '4h': 14400, '1d': 86400, '1w': 604800,
};

/**
 * Real-time price stream using CoinCap WebSocket.
 * Builds OHLCV candles locally from price ticks — this eliminates the
 * wick desync bug caused by Binance kline snapshots overwriting tick data.
 *
 * CoinCap sends price updates every ~500ms per asset, completely free,
 * no API key required.
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

  // Local candle builder state
  const currentCandleRef = useRef<{
    time: number; open: number; high: number; low: number; close: number; volume: number;
  } | null>(null);
  const intervalRef = useRef(interval);
  const symbolRef = useRef(symbol);

  // Keep callback refs updated without causing reconnect
  useEffect(() => { onKlineRef.current = onKlineUpdate; }, [onKlineUpdate]);
  useEffect(() => { onTickRef.current = onTick; }, [onTick]);
  useEffect(() => { intervalRef.current = interval; }, [interval]);
  useEffect(() => { symbolRef.current = symbol; }, [symbol]);

  // Reset candle when interval or symbol changes
  useEffect(() => {
    currentCandleRef.current = null;
  }, [interval, symbol]);

  const connect = useCallback(() => {
    if (!symbol) return;

    // Clean up any existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const coincapId = SYMBOL_TO_COINCAP[symbol.toUpperCase()] || symbol.toLowerCase();
    const url = `${COINCAP_WS}${coincapId}`;

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
          const data = JSON.parse(event.data);
          // CoinCap sends { "<coincap-id>": "<price>" }
          const coincapId = SYMBOL_TO_COINCAP[symbolRef.current.toUpperCase()] || symbolRef.current.toLowerCase();
          const priceStr = data[coincapId];
          if (!priceStr) return;

          const price = parseFloat(priceStr);
          if (isNaN(price) || price <= 0) return;

          const nowSec = Math.floor(Date.now() / 1000);

          // Emit tick
          if (onTickRef.current) {
            onTickRef.current({
              price,
              quantity: 0,
              time: nowSec,
            });
          }

          // Build candle locally
          const intSec = INTERVAL_SECONDS[intervalRef.current] || 60;
          const candleStart = Math.floor(nowSec / intSec) * intSec;
          const candle = currentCandleRef.current;

          if (!candle || candle.time !== candleStart) {
            // Emit closing signal for previous candle
            if (candle) {
              onKlineRef.current({
                ...candle,
                isClosed: true,
              });
            }
            // Start new candle
            currentCandleRef.current = {
              time: candleStart,
              open: price,
              high: price,
              low: price,
              close: price,
              volume: 0,
            };
          } else {
            // Update current candle — only GROW high/low, never shrink
            candle.high = Math.max(candle.high, price);
            candle.low = Math.min(candle.low, price);
            candle.close = price;
          }

          // Emit in-progress kline update
          onKlineRef.current({
            ...currentCandleRef.current!,
            isClosed: false,
          });
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
