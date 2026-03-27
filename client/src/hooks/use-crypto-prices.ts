import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, useRef, useCallback } from "react";
import { cryptoApi } from "@/services/crypto-api";
import { useWebSocket } from "./use-websocket";
import type { CryptoPrice } from "@/types/crypto";

const SYMBOL_MAP: Record<string, { binance: string; coingecko: string }> = {
  BTC: { binance: "BTCUSDT", coingecko: "bitcoin" },
  ETH: { binance: "ETHUSDT", coingecko: "ethereum" },
  USDT: { binance: "USDTUSDT", coingecko: "tether" },
  BNB: { binance: "BNBUSDT", coingecko: "binancecoin" },
  TRX: { binance: "TRXUSDT", coingecko: "tron" },
  DOGE: { binance: "DOGEUSDT", coingecko: "dogecoin" },
  BCH: { binance: "BCHUSDT", coingecko: "bitcoin-cash" },
  DASH: { binance: "DASHUSDT", coingecko: "dash" },
  DOT: { binance: "DOTUSDT", coingecko: "polkadot" },
  LTC: { binance: "LTCUSDT", coingecko: "litecoin" },
  XRP: { binance: "XRPUSDT", coingecko: "ripple" },
  ADA: { binance: "ADAUSDT", coingecko: "cardano" },
  SOL: { binance: "SOLUSDT", coingecko: "solana" },
  AVAX: { binance: "AVAXUSDT", coingecko: "avalanche-2" },
  MATIC: { binance: "MATICUSDT", coingecko: "matic-network" },
  SHIB: { binance: "SHIBUSDT", coingecko: "shiba-inu" },
  LINK: { binance: "LINKUSDT", coingecko: "chainlink" },
  XMR: { binance: "XMRUSDT", coingecko: "monero" },
  XLM: { binance: "XLMUSDT", coingecko: "stellar" },
  ATOM: { binance: "ATOMUSDT", coingecko: "cosmos" },
  FIL: { binance: "FILUSDT", coingecko: "filecoin" },
  APT: { binance: "APTUSDT", coingecko: "aptos" },
  SUI: { binance: "SUIUSDT", coingecko: "sui" },
  ARB: { binance: "ARBUSDT", coingecko: "arbitrum" },
  OP: { binance: "OPUSDT", coingecko: "optimism" },
  PEPE: { binance: "PEPEUSDT", coingecko: "pepe" },
  INJ: { binance: "INJUSDT", coingecko: "injective-protocol" }
};

// Reverse lookup: "BTCUSDT" → "BTC"
const BINANCE_TO_SYMBOL: Record<string, string> = {};
for (const [sym, val] of Object.entries(SYMBOL_MAP)) {
  BINANCE_TO_SYMBOL[val.binance] = sym;
}

const BINANCE_WS = 'wss://stream.binance.com:9443/ws/!miniTicker@arr';

export function useCryptoPrices() {
  const [prices, setPrices] = useState<CryptoPrice[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const { subscribe, isConnected: wsConnected } = useWebSocket("/ws");
  const livePricesRef = useRef<Record<string, CryptoPrice>>({});
  const binanceWsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const reconnectAttempts = useRef(0);
  const mountedRef = useRef(true);
  const lastBinanceUpdateRef = useRef(0);

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

  // Subscribe to server WebSocket (fallback if Binance WS fails)
  useEffect(() => {
    const unsubscribe = subscribe("price_update", (updatedPrices: CryptoPrice[]) => {
      setPrices((prev) => mergeLivePrices(updatedPrices, livePricesRef.current));
    });
    return unsubscribe;
  }, [subscribe, mergeLivePrices]);

  // Direct Binance WebSocket: !miniTicker@arr — all symbols, every ~1 second
  // This provides real-time price updates for all supported coins on a single connection.
  // Fields used: s (symbol), c (close/last price), P (24h price change percent), v (volume)
  useEffect(() => {
    mountedRef.current = true;

    function connect() {
      if (binanceWsRef.current) {
        binanceWsRef.current.close();
        binanceWsRef.current = null;
      }

      try {
        const ws = new WebSocket(BINANCE_WS);
        binanceWsRef.current = ws;

        ws.onopen = () => {
          if (!mountedRef.current) return;
          setIsConnected(true);
          reconnectAttempts.current = 0;
        };

        ws.onmessage = (event) => {
          if (!mountedRef.current) return;

          // Throttle state updates to ~4fps (250ms) to avoid excessive React re-renders
          // since miniTicker fires every second for ALL symbols
          const now = performance.now();
          if (now - lastBinanceUpdateRef.current < 250) return;
          lastBinanceUpdateRef.current = now;

          try {
            const tickers: any[] = JSON.parse(event.data);
            if (!Array.isArray(tickers)) return;

            const updates: Record<string, Partial<CryptoPrice>> = {};
            for (const t of tickers) {
              const sym = BINANCE_TO_SYMBOL[t.s];
              if (!sym) continue;

              // miniTicker fields: c=close, o=open, h=high, l=low, v=baseVol, q=quoteVol
              const closePrice = parseFloat(t.c);
              const openPrice = parseFloat(t.o);
              const change24h = openPrice > 0
                ? (((closePrice - openPrice) / openPrice) * 100).toFixed(2)
                : "0";

              updates[sym] = {
                symbol: sym,
                price: t.c,
                change24h,
                volume24h: t.q || "0",
                high24h: t.h,
                low24h: t.l,
                updatedAt: new Date().toISOString(),
              };
            }

            if (Object.keys(updates).length > 0) {
              Object.assign(livePricesRef.current, updates);

              setPrices((prev) => {
                if (prev.length === 0) return prev;
                return prev.map((p) => {
                  const u = updates[p.symbol];
                  return u
                    ? { ...p, ...u }
                    : p;
                });
              });
            }
          } catch {
            // Ignore parse errors
          }
        };

        ws.onclose = () => {
          if (!mountedRef.current) return;
          setIsConnected(false);
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
      if (binanceWsRef.current) {
        binanceWsRef.current.close();
        binanceWsRef.current = null;
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
