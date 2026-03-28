import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, useRef, useCallback } from "react";
import { cryptoApi } from "@/services/crypto-api";
import { useWebSocket } from "./use-websocket";
import type { CryptoPrice } from "@/types/crypto";

// CoinCap WebSocket — free, no key, sub-second updates
const COINCAP_WS = 'wss://ws.coincap.io/prices?assets=';

// Map ticker symbols → CoinCap IDs
const SYMBOL_TO_COINCAP: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', BNB: 'binance-coin', SOL: 'solana',
  XRP: 'xrp', ADA: 'cardano', DOT: 'polkadot', DOGE: 'dogecoin',
  AVAX: 'avalanche', LINK: 'chainlink', LTC: 'litecoin', MATIC: 'polygon',
  ATOM: 'cosmos', TRX: 'tron', SHIB: 'shiba-inu', BCH: 'bitcoin-cash',
  DASH: 'dash', XMR: 'monero', XLM: 'stellar', FIL: 'filecoin',
  APT: 'aptos', SUI: 'sui', ARB: 'arbitrum', OP: 'optimism',
  PEPE: 'pepe', INJ: 'injective-protocol',
  USDT: 'tether',
};

// Reverse lookup: "bitcoin" → "BTC"
const COINCAP_TO_SYMBOL: Record<string, string> = {};
for (const [sym, coinCapId] of Object.entries(SYMBOL_TO_COINCAP)) {
  COINCAP_TO_SYMBOL[coinCapId] = sym;
}

// Build the CoinCap WebSocket URL with all asset IDs
const ALL_COINCAP_IDS = Object.values(SYMBOL_TO_COINCAP).filter(id => id !== 'tether').join(',');

export function useCryptoPrices() {
  const [prices, setPrices] = useState<CryptoPrice[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const { subscribe, isConnected: wsConnected } = useWebSocket("/ws");
  const livePricesRef = useRef<Record<string, CryptoPrice>>({});
  const coinCapWsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
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

  // Subscribe to server WebSocket (fallback if CoinCap WS fails)
  useEffect(() => {
    const unsubscribe = subscribe("price_update", (updatedPrices: CryptoPrice[]) => {
      setPrices((prev) => mergeLivePrices(updatedPrices, livePricesRef.current));
    });
    return unsubscribe;
  }, [subscribe, mergeLivePrices]);

  // CoinCap WebSocket — all assets on a single connection, ~1 update/sec
  useEffect(() => {
    mountedRef.current = true;

    function connect() {
      if (coinCapWsRef.current) {
        coinCapWsRef.current.close();
        coinCapWsRef.current = null;
      }

      try {
        const ws = new WebSocket(`${COINCAP_WS}${ALL_COINCAP_IDS}`);
        coinCapWsRef.current = ws;

        ws.onopen = () => {
          if (!mountedRef.current) return;
          setIsConnected(true);
          reconnectAttempts.current = 0;
        };

        ws.onmessage = (event) => {
          if (!mountedRef.current) return;

          // Throttle state updates to ~4fps (250ms) to avoid excessive React re-renders
          const now = performance.now();
          if (now - lastUpdateRef.current < 250) return;
          lastUpdateRef.current = now;

          try {
            // CoinCap sends { "bitcoin": "67234.12", "ethereum": "3421.50", ... }
            const data: Record<string, string> = JSON.parse(event.data);
            if (typeof data !== 'object') return;

            const updates: Record<string, Partial<CryptoPrice>> = {};
            for (const [coinCapId, priceStr] of Object.entries(data)) {
              const sym = COINCAP_TO_SYMBOL[coinCapId];
              if (!sym) continue;

              updates[sym] = {
                symbol: sym,
                price: priceStr,
                updatedAt: new Date().toISOString(),
              };
            }

            if (Object.keys(updates).length > 0) {
              Object.assign(livePricesRef.current, updates);

              setPrices((prev) => {
                if (prev.length === 0) return prev;
                return prev.map((p) => {
                  const u = updates[p.symbol];
                  return u ? { ...p, ...u } : p;
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
      if (coinCapWsRef.current) {
        coinCapWsRef.current.close();
        coinCapWsRef.current = null;
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
