import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { CandlestickData, ChartTimeframe } from "@/types/chart";

const BINANCE_API = 'https://api.binance.com/api/v3/klines';

const REFETCH_INTERVALS: Record<ChartTimeframe, number> = {
  "1m": 60000,
  "5m": 120000,
  "15m": 300000,
  "1h": 600000,
  "4h": 900000,
  "1d": 1800000,
  "1w": 3600000,
};

async function fetchFromBinance(symbol: string, interval: ChartTimeframe, limit: number): Promise<CandlestickData[]> {
  const pair = symbol.toUpperCase().includes('USDT')
    ? symbol.toUpperCase()
    : `${symbol.toUpperCase()}USDT`;

  const res = await fetch(`${BINANCE_API}?symbol=${pair}&interval=${interval}&limit=${limit}`);
  if (!res.ok) throw new Error('Binance API failed');

  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) throw new Error('No data');

  return data.map((k: any[]) => ({
    time: k[0],        // Open time in ms
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
        // Try direct Binance API first (faster, no server hop)
        return await fetchFromBinance(symbol, interval, limit);
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
