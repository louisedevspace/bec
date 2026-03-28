import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, useRef, useCallback, useSyncExternalStore } from "react";
import { cryptoApi } from "@/services/crypto-api";
import { useWebSocket } from "./use-websocket";
import type { CryptoPrice } from "@/types/crypto";

// MEXC WebSocket — free, no key, real-time miniTicker
const MEXC_WS = 'wss://wbs.mexc.com/ws';

const SUPPORTED_SYMBOLS = [
  'BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOT', 'DOGE',
  'AVAX', 'LINK', 'LTC', 'MATIC', 'ATOM', 'TRX', 'SHIB', 'BCH',
  'DASH', 'XMR', 'XLM', 'FIL', 'APT', 'SUI', 'ARB', 'OP',
  'PEPE', 'INJ',
];

// ── Singleton MEXC WebSocket manager ──
// Shared across all useCryptoPrices() consumers — only ONE connection.
type Listener = () => void;

const shared = {
  ws: null as WebSocket | null,
  pingTimer: undefined as ReturnType<typeof setInterval> | undefined,
  reconnectTimer: undefined as ReturnType<typeof setTimeout> | undefined,
  reconnectAttempts: 0,
  connected: false,
  intentionalClose: false,
  livePrices: {} as Record<string, Partial<CryptoPrice>>,
  lastUpdate: 0,
  subscribers: new Set<Listener>(),
  refCount: 0,
};

function notifySubscribers() {
  shared.subscribers.forEach((fn) => fn());
}

function connectShared() {
  if (shared.ws) {
    shared.intentionalClose = true;
    shared.ws.close();
    shared.ws = null;
  }
  if (shared.pingTimer) {
    clearInterval(shared.pingTimer);
    shared.pingTimer = undefined;
  }

  shared.intentionalClose = false;

  try {
    const ws = new WebSocket(MEXC_WS);
    shared.ws = ws;

    ws.onopen = () => {
      shared.connected = true;
      shared.reconnectAttempts = 0;

      ws.send(JSON.stringify({
        method: 'SUBSCRIPTION',
        params: ['spot@public.miniTickers.v3.api'],
      }));

      shared.pingTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ method: 'PING' }));
        }
      }, 20000);

      notifySubscribers();
    };

    ws.onmessage = (event) => {
      // Throttle to ~4fps
      const now = performance.now();
      if (now - shared.lastUpdate < 250) return;
      shared.lastUpdate = now;

      try {
        const msg = JSON.parse(event.data);
        if (msg.msg === 'PONG' || msg.id !== undefined) return;

        if (msg.c && msg.c.includes('miniTicker') && msg.d) {
          const tickers = Array.isArray(msg.d) ? msg.d : [msg.d];
          let changed = false;

          for (const d of tickers) {
            const pairStr = d.s || '';
            if (!pairStr.endsWith('USDT')) continue;
            const sym = pairStr.replace('USDT', '');
            if (!sym || !SUPPORTED_SYMBOLS.includes(sym)) continue;

            shared.livePrices[sym] = {
              symbol: sym,
              price: d.c || d.p || '',
              updatedAt: new Date().toISOString(),
            };
            changed = true;
          }

          if (changed) notifySubscribers();
        }
      } catch { /* ignore */ }
    };

    ws.onclose = () => {
      shared.connected = false;
      if (shared.pingTimer) {
        clearInterval(shared.pingTimer);
        shared.pingTimer = undefined;
      }
      notifySubscribers();

      // Only reconnect if close was not intentional and there are active subscribers
      if (shared.intentionalClose || shared.refCount <= 0) return;
      const delay = Math.min(1000 * Math.pow(2, shared.reconnectAttempts), 30000);
      shared.reconnectAttempts++;
      shared.reconnectTimer = setTimeout(connectShared, delay);
    };

    ws.onerror = () => {
      shared.intentionalClose = false;
      ws.close();
    };
  } catch { /* ignore */ }
}

function subscribeSingleton(listener: Listener) {
  shared.subscribers.add(listener);
  shared.refCount++;

  // Open connection on first subscriber
  if (shared.refCount === 1 && !shared.ws) {
    connectShared();
  }

  return () => {
    shared.subscribers.delete(listener);
    shared.refCount--;

    // Close connection when last subscriber leaves
    if (shared.refCount <= 0) {
      shared.refCount = 0;
      shared.intentionalClose = true;
      clearTimeout(shared.reconnectTimer);
      if (shared.pingTimer) {
        clearInterval(shared.pingTimer);
        shared.pingTimer = undefined;
      }
      if (shared.ws) {
        shared.ws.close();
        shared.ws = null;
      }
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

  // Subscribe to singleton MEXC WS
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
