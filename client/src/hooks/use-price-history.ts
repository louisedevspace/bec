import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { CandlestickData, ChartTimeframe } from "@/types/chart";

const REFETCH_INTERVALS: Record<ChartTimeframe, number> = {
  "1m": 60000,
  "5m": 120000,
  "15m": 300000,
  "1h": 600000,
  "4h": 900000,
  "1d": 1800000,
  "1w": 3600000,
};

// All REST calls go through the server proxy which calls MEXC → Binance → synthetic.
// Direct browser→MEXC is blocked by CORS.
async function fetchFromServer(symbol: string, interval: ChartTimeframe, limit: number): Promise<CandlestickData[]> {
  const res = await apiRequest("GET", `/api/crypto/price-history/${symbol}?interval=${interval}&limit=${limit}`);
  return res.json();
}

export function usePriceHistory(symbol: string, interval: ChartTimeframe = "1h", limit: number = 500) {
  return useQuery<CandlestickData[]>({
    queryKey: ["/api/crypto/price-history", symbol, interval, limit],
    queryFn: () => fetchFromServer(symbol, interval, limit),
    enabled: !!symbol,
    staleTime: 30000,
    refetchInterval: REFETCH_INTERVALS[interval] || 600000,
  });
}
