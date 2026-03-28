import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, useRef, useCallback } from "react";
import { cryptoApi } from "@/services/crypto-api";
import { useWebSocket } from "./use-websocket";
import type { CryptoPrice } from "@/types/crypto";

// MEXC WebSocket — free, no key, real-time miniTicker
const MEXC_WS = 'wss://wbs.mexc.com/ws';

// All supported trading pairs for MEXC subscription
const SUPPORTED_SYMBOLS = [
  'BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOT', 'DOGE',
  'AVAX', 'LINK', 'LTC', 'MATIC', 'ATOM', 'TRX', 'SHIB', 'BCH',
  'DASH', 'XMR', 'XLM', 'FIL', 'APT', 'SUI', 'ARB', 'OP',
  'PEPE', 'INJ',
];

export function useCryptoPrices() {
  const [prices, setPrices] = useState<CryptoPrice[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const { subscribe, isConnected: wsConnected } = useWebSocket("/ws");
  const livePricesRef = useRef<Record<string, CryptoPrice>>({});
  const mexcWsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const pingTimer = useRef<ReturnType<typeof setInterval>>();
  const reconnectAttempts = useRef(0);
  const mountedRef = useRef(true);
  const lastUpdateRef = useRef(0);

  // Initial price fetch (also provides change24h and volume24h)
  const { data: initialPrices, isLoading, error } = useQuery({
    queryKey: ["/api/crypto/prices"],
    queryFn: cryptoApi.getPrices,
    refetchInterval: 60000, // Refetch every 60s for 24h change/volume data
  });

  // Helper to merge live prices into any price array
  const mergeLivePrices = useCallback((pricesArr: CryptoPrice[], live: Record<string, CryptoPrice>): CryptoPrice[] => {
    let merged = pricesArr.map((p) =>
      live[p.symbol] ? { ...p, price: live[p.symbol].price, updatedAt: live[p.symbol].updatedAt } : p
    );
    Object.keys(live).forEach((symbol) => {
      if (!merged.find((p) => p.symbol === symbol)) {
        merged.push(live[symbol]);
      }
    });
    return merged;
  }, []);

  // Set initial prices
  useEffect(() => {
    if (initialPrices) {
      setPrices((prev) => mergeLivePrices(initialPrices, livePricesRef.current));
    }
  }, [initialPrices, mergeLivePrices]);

  // Subscribe to server WebSocket (fallback)
  useEffect(() => {
    const unsubscribe = subscribe("price_update", (updatedPrices: CryptoPrice[]) => {
      setPrices((prev) => mergeLivePrices(updatedPrices, livePricesRef.current));
    });
    return unsubscribe;
  }, [subscribe, mergeLivePrices]);

  // MEXC WebSocket — subscribe to miniTicker for all pairs
  useEffect(() => {
    mountedRef.current = true;

    function connect() {
      if (mexcWsRef.current) {
        mexcWsRef.current.close();
        mexcWsRef.current = null;
      }
      if (pingTimer.current) {
        clearInterval(pingTimer.current);
        pingTimer.current = undefined;
      }

      try {
        const ws = new WebSocket(MEXC_WS);
        mexcWsRef.current = ws;

        ws.onopen = () => {
          if (!mountedRef.current) return;
          setIsConnected(true);
          reconnectAttempts.current = 0;

          // Subscribe to miniTicker for each pair
          const params = SUPPORTED_SYMBOLS.map(s => `spot@public.miniTicker.v3.api@${s}USDT`);
          ws.send(JSON.stringify({
            method: 'SUBSCRIPTION',
            params,
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

          // Throttle state updates to ~4fps (250ms)
          const now = performance.now();
          if (now - lastUpdateRef.current < 250) return;
          lastUpdateRef.current = now;

          try {
            const msg = JSON.parse(event.data);

            // Ignore PONG and subscription confirmations
            if (msg.msg === 'PONG' || msg.id !== undefined) return;

            // Handle miniTicker data
            // MEXC miniTicker: { c: "spot@public.miniTicker.v3.api@BTCUSDT", d: { s: "BTCUSDT", p: "67234.12", ... } }
            if (msg.c && msg.c.includes('miniTicker') && msg.d) {
              const d = msg.d;
              const pairStr = d.s || ''; // e.g. "BTCUSDT"
              const sym = pairStr.replace('USDT', '');
              if (!sym || !SUPPORTED_SYMBOLS.includes(sym)) return;

              const update: Partial<CryptoPrice> = {
                symbol: sym,
                price: d.c || d.p || '', // c = close/last price
                updatedAt: new Date().toISOString(),
              };

              livePricesRef.current[sym] = update as CryptoPrice;

              setPrices((prev) => {
                if (prev.length === 0) return prev;
                return prev.map((p) => p.symbol === sym ? { ...p, ...update } : p);
              });
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
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          reconnectAttempts.current++;
          reconnectTimer.current = setTimeout(() => {
            if (mountedRef.current) connect();
          }, delay);
        };

        ws.onerror = () => {
          if (!mountedRef.current) return;
          ws.close();
        };
      } catch {
        // Failed to create WebSocket
      }
    }

    connect();

    return () => {
      mountedRef.current = false;
      clearTimeout(reconnectTimer.current);
      if (pingTimer.current) {
        clearInterval(pingTimer.current);
        pingTimer.current = undefined;
      }
      if (mexcWsRef.current) {
        mexcWsRef.current.close();
        mexcWsRef.current = null;
      }
    };
  }, []);

  // Update connection status from server WS as additional signal
  useEffect(() => {
    if (wsConnected && !isConnected) setIsConnected(true);
  }, [wsConnected, isConnected]);

  const getPriceBySymbol = (symbol: string): CryptoPrice | undefined => {
    return prices.find(price => price.symbol === symbol);
  };

  const getFormattedPrice = (symbol: string): string => {
    const price = getPriceBySymbol(symbol);
    if (!price) return "0.00";

    const numPrice = parseFloat(price.price);
    if (numPrice >= 1000) {
      return numPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } else if (numPrice >= 1) {
      return numPrice.toFixed(4);
    } else {
      return numPrice.toFixed(6);
    }
  };

  const getChangeColor = (symbol: string): string => {
    const price = getPriceBySymbol(symbol);
    if (!price) return "text-muted-foreground";

    const change = parseFloat(price.change24h);
    if (change > 0) return "text-green-500";
    if (change < 0) return "text-red-500";
    return "text-muted-foreground";
  };

  return {
    prices,
    isLoading,
    error,
    isConnected,
    getPriceBySymbol,
    getFormattedPrice,
    getChangeColor,
  };
}
