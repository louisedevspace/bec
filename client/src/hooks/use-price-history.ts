import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { CandlestickData, ChartTimeframe } from "@/types/chart";

const REFETCH_INTERVALS: Record<ChartTimeframe, number> = {
  "1m": 60000,
  "5m": 60000,
  "15m": 120000,
  "1h": 300000,
  "4h": 600000,
  "1d": 900000,
  "1w": 1800000,
};

export function usePriceHistory(symbol: string, interval: ChartTimeframe = "1h", limit: number = 100) {
  return useQuery<CandlestickData[]>({
    queryKey: ["/api/crypto/price-history", symbol, interval, limit],
    queryFn: () =>
      apiRequest("GET", `/api/crypto/price-history/${symbol}?interval=${interval}&limit=${limit}`)
        .then((r) => r.json()),
    enabled: !!symbol,
    staleTime: 30000,
    refetchInterval: REFETCH_INTERVALS[interval] || 300000,
  });
}
