import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, useCallback, useSyncExternalStore } from "react";
import { cryptoApi } from "@/services/crypto-api";
import { useWebSocket } from "./use-websocket";
import type { CryptoPrice } from "@/types/crypto";

// Binance WebSocket — all miniTickers in one stream
const BINANCE_WS_PRIMARY = 'wss://stream.binance.com:9443/ws/!miniTicker@arr';
const BINANCE_WS_FALLBACK = 'wss://stream.binance.com:443/ws/!miniTicker@arr';

const SUPPORTED_SYMBOLS = [
  'BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOT', 'DOGE',
  'AVAX', 'LINK', 'LTC', 'MATIC', 'ATOM', 'TRX', 'SHIB', 'BCH',
  'DASH', 'XMR', 'XLM', 'FIL', 'APT', 'SUI', 'ARB', 'OP',
  'PEPE', 'INJ',
];

// ── Singleton Binance WebSocket manager ──
// Shared across all useCryptoPrices() consumers — only ONE connection.
type Listener = () => void;

const shared = {
  ws: null as WebSocket | null,
  reconnectTimer: undefined as ReturnType<typeof setTimeout> | undefined,
  teardownTimer: undefined as ReturnType<typeof setTimeout> | undefined,
  reconnectAttempts: 0,
  connected: false,
  useFallback: false,
  livePrices: {} as Record<string, Partial<CryptoPrice>>,
  lastUpdate: 0,
  subscribers: new Set<Listener>(),
  refCount: 0,
};

function notifySubscribers() {
  shared.subscribers.forEach((fn) => fn());
}

function connectShared() {
  // Detach old socket — its onclose/onerror become no-ops
  if (shared.ws) {
    const old = shared.ws;
    old.onopen = null;
    old.onmessage = null;
    old.onclose = null;
    old.onerror = null;
    if (old.readyState === WebSocket.OPEN || old.readyState === WebSocket.CONNECTING) {
      old.close();
    }
    shared.ws = null;
  }

  if (shared.refCount <= 0) return;

  try {
    const url = shared.useFallback ? BINANCE_WS_FALLBACK : BINANCE_WS_PRIMARY;
    const ws = new WebSocket(url);
    shared.ws = ws;

    ws.onopen = () => {
      if (shared.ws !== ws) return; // stale socket
      shared.connected = true;
      shared.reconnectAttempts = 0;
      shared.useFallback = false;
      notifySubscribers();
    };

    ws.onmessage = (event) => {
      if (shared.ws !== ws) return;

      // Throttle to ~4fps
      const now = performance.now();
      if (now - shared.lastUpdate < 250) return;
      shared.lastUpdate = now;

      try {
        const tickers: any[] = JSON.parse(event.data);
        if (!Array.isArray(tickers)) return;

        let changed = false;

        for (const d of tickers) {
          const pairStr = d.s || ''; // e.g. "BTCUSDT"
          if (!pairStr.endsWith('USDT')) continue;
          const sym = pairStr.replace('USDT', '');
          if (!sym || !SUPPORTED_SYMBOLS.includes(sym)) continue;

          shared.livePrices[sym] = {
            symbol: sym,
            price: d.c || '', // c = close price
            updatedAt: new Date().toISOString(),
          };
          changed = true;
        }

        if (changed) notifySubscribers();
      } catch { /* ignore */ }
    };

    ws.onclose = () => {
      // Ignore if this is a stale (replaced) socket
      if (shared.ws !== ws) return;
      shared.ws = null;
      shared.connected = false;
      notifySubscribers();

      if (shared.refCount <= 0) return;

      shared.useFallback = !shared.useFallback;
      const delay = Math.min(1000 * Math.pow(2, shared.reconnectAttempts), 30000);
      shared.reconnectAttempts++;
      shared.reconnectTimer = setTimeout(connectShared, delay);
    };

    ws.onerror = () => {
      if (shared.ws !== ws) return;
      ws.close(); // will trigger onclose above
    };
  } catch { /* ignore */ }
}

function subscribeSingleton(listener: Listener) {
  shared.subscribers.add(listener);
  shared.refCount++;

  // Cancel any pending teardown (React strict-mode unsubscribe/resubscribe cycle)
  if (shared.teardownTimer) {
    clearTimeout(shared.teardownTimer);
    shared.teardownTimer = undefined;
  }

  if (shared.refCount === 1 && !shared.ws) {
    connectShared();
  }

  return () => {
    shared.subscribers.delete(listener);
    shared.refCount--;

    if (shared.refCount <= 0) {
      shared.refCount = 0;
      // Debounce teardown — React strict-mode will resubscribe within ~50ms
      shared.teardownTimer = setTimeout(() => {
        if (shared.refCount > 0) return; // resubscribed in time
        clearTimeout(shared.reconnectTimer);
        if (shared.ws) {
          const old = shared.ws;
          old.onopen = null;
          old.onmessage = null;
          old.onclose = null;
          old.onerror = null;
          if (old.readyState === WebSocket.OPEN || old.readyState === WebSocket.CONNECTING) {
            old.close();
          }
          shared.ws = null;
        }
      }, 100);
    }
  };
}

function getLivePricesSnapshot() {
  return shared.livePrices;
}

// ── Hook ──

export function useCryptoPrices() {
  const [prices, setPrices] = useState<CryptoPrice[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const { subscribe, isConnected: wsConnected } = useWebSocket("/ws");

  // Subscribe to singleton Binance WS
  const livePrices = useSyncExternalStore(subscribeSingleton, getLivePricesSnapshot);

  // Sync connection state
  useEffect(() => {
    setIsConnected(shared.connected);
    const cb = () => setIsConnected(shared.connected);
    shared.subscribers.add(cb);
    return () => { shared.subscribers.delete(cb); };
  }, []);

  // Initial price fetch
  const { data: initialPrices, isLoading, error } = useQuery({
    queryKey: ["/api/crypto/prices"],
    queryFn: cryptoApi.getPrices,
    refetchInterval: 60000,
  });

  const mergeLivePrices = useCallback((pricesArr: CryptoPrice[], live: Record<string, Partial<CryptoPrice>>): CryptoPrice[] => {
    let merged = pricesArr.map((p) =>
      live[p.symbol] ? { ...p, price: live[p.symbol].price!, updatedAt: live[p.symbol].updatedAt! } : p
    );
    Object.keys(live).forEach((symbol) => {
      if (!merged.find((p) => p.symbol === symbol)) {
        merged.push(live[symbol] as CryptoPrice);
      }
    });
    return merged;
  }, []);

  // Merge initial + live prices
  useEffect(() => {
    if (initialPrices) {
      setPrices(mergeLivePrices(initialPrices, livePrices));
    }
  }, [initialPrices, livePrices, mergeLivePrices]);

  // Subscribe to server WebSocket (fallback)
  useEffect(() => {
    const unsubscribe = subscribe("price_update", (updatedPrices: CryptoPrice[]) => {
      setPrices((prev) => mergeLivePrices(updatedPrices, livePrices));
    });
    return unsubscribe;
  }, [subscribe, mergeLivePrices, livePrices]);

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
