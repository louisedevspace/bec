import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { CandlestickData, ChartTimeframe } from "@/types/chart";

// MEXC REST API — free, no key required for market data
const MEXC_API = 'https://api.mexc.com';

// MEXC uses the same interval notation as Binance
const MEXC_INTERVALS: Record<ChartTimeframe, string> = {
  '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h',
  '4h': '4h', '1d': '1d', '1w': '1W',
};

const REFETCH_INTERVALS: Record<ChartTimeframe, number> = {
  "1m": 60000,
  "5m": 120000,
  "15m": 300000,
  "1h": 600000,
  "4h": 900000,
  "1d": 1800000,
  "1w": 3600000,
};

async function fetchFromMexc(symbol: string, interval: ChartTimeframe, limit: number): Promise<CandlestickData[]> {
  const mexcInterval = MEXC_INTERVALS[interval];
  const pair = `${symbol.toUpperCase()}USDT`;
  const url = `${MEXC_API}/api/v3/klines?symbol=${pair}&interval=${mexcInterval}&limit=${limit}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`MEXC API failed: ${res.status}`);

  const raw = await res.json();
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('No MEXC kline data');
  }

  // MEXC klines response: [openTime, open, high, low, close, volume, closeTime, quoteVolume]
  return raw.map((k: any[]) => ({
    time: k[0],                  // Open time in ms
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }));
}

async function fetchFromServer(symbol: string, interval: ChartTimeframe, limit: number): Promise<CandlestickData[]> {
  const res = await apiRequest("GET", `/api/crypto/price-history/${symbol}?interval=${interval}&limit=${limit}`);
  return res.json();
}

export function usePriceHistory(symbol: string, interval: ChartTimeframe = "1h", limit: number = 500) {
  return useQuery<CandlestickData[]>({
    queryKey: ["/api/crypto/price-history", symbol, interval, limit],
    queryFn: async () => {
      try {
        // Try MEXC API first (free, fast, no key needed, Binance-compatible format)
        return await fetchFromMexc(symbol, interval, limit);
      } catch {
        // Fall back to server proxy
        return await fetchFromServer(symbol, interval, limit);
      }
    },
    enabled: !!symbol,
    staleTime: 30000,
    refetchInterval: REFETCH_INTERVALS[interval] || 600000,
  });
}
