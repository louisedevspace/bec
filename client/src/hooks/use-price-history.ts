import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { CandlestickData, ChartTimeframe } from "@/types/chart";

const REFETCH_INTERVALS: Record<ChartTimeframe, number> = {
  "1s": 10000,
  "1m": 60000,
  "5m": 120000,
  "15m": 300000,
  "1h": 600000,
  "4h": 900000,
  "1d": 1800000,
  "1w": 3600000,
};

export function usePriceHistory(symbol: string, interval: ChartTimeframe = "1h", limit: number = 500) {
  // Map 1s → 1m on the server (no exchange supports 1s klines)
  const serverInterval = interval === "1s" ? "1m" : interval;

  return useQuery<CandlestickData[]>({
    queryKey: ["/api/crypto/price-history", symbol, interval, serverInterval, limit],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/crypto/price-history/${symbol}?interval=${serverInterval}&limit=${limit}`);
      return res.json();
    },
    enabled: !!symbol,
    staleTime: 30000,
    refetchInterval: REFETCH_INTERVALS[interval] || 600000,
  });
}
