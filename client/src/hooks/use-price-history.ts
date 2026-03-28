import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { CandlestickData, ChartTimeframe } from "@/types/chart";

// CoinCap REST API — free, no key required, fast CDN
const COINCAP_API = 'https://api.coincap.io/v2/candles';

// Map our symbols to CoinCap base/quote IDs
const SYMBOL_TO_COINCAP: Record<string, { baseId: string; quoteId: string }> = {
  BTC: { baseId: 'bitcoin', quoteId: 'tether' },
  ETH: { baseId: 'ethereum', quoteId: 'tether' },
  BNB: { baseId: 'binance-coin', quoteId: 'tether' },
  SOL: { baseId: 'solana', quoteId: 'tether' },
  XRP: { baseId: 'xrp', quoteId: 'tether' },
  ADA: { baseId: 'cardano', quoteId: 'tether' },
  DOT: { baseId: 'polkadot', quoteId: 'tether' },
  DOGE: { baseId: 'dogecoin', quoteId: 'tether' },
  AVAX: { baseId: 'avalanche', quoteId: 'tether' },
  LINK: { baseId: 'chainlink', quoteId: 'tether' },
  LTC: { baseId: 'litecoin', quoteId: 'tether' },
  MATIC: { baseId: 'polygon', quoteId: 'tether' },
  ATOM: { baseId: 'cosmos', quoteId: 'tether' },
  TRX: { baseId: 'tron', quoteId: 'tether' },
  SHIB: { baseId: 'shiba-inu', quoteId: 'tether' },
  BCH: { baseId: 'bitcoin-cash', quoteId: 'tether' },
  DASH: { baseId: 'dash', quoteId: 'tether' },
  XMR: { baseId: 'monero', quoteId: 'tether' },
  XLM: { baseId: 'stellar', quoteId: 'tether' },
  FIL: { baseId: 'filecoin', quoteId: 'tether' },
  APT: { baseId: 'aptos', quoteId: 'tether' },
  SUI: { baseId: 'sui', quoteId: 'tether' },
  ARB: { baseId: 'arbitrum', quoteId: 'tether' },
  OP: { baseId: 'optimism', quoteId: 'tether' },
  PEPE: { baseId: 'pepe', quoteId: 'tether' },
  INJ: { baseId: 'injective-protocol', quoteId: 'tether' },
};

// CoinCap interval mapping
const COINCAP_INTERVALS: Record<ChartTimeframe, string> = {
  '1m': 'm1', '5m': 'm5', '15m': 'm15', '1h': 'h1',
  '4h': 'h4', '1d': 'd1', '1w': 'w1',
};

// How far back to fetch for each interval to get ~limit candles
const INTERVAL_MS: Record<ChartTimeframe, number> = {
  '1m': 60000, '5m': 300000, '15m': 900000, '1h': 3600000,
  '4h': 14400000, '1d': 86400000, '1w': 604800000,
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

async function fetchFromCoinCap(symbol: string, interval: ChartTimeframe, limit: number): Promise<CandlestickData[]> {
  const mapping = SYMBOL_TO_COINCAP[symbol.toUpperCase()];
  if (!mapping) throw new Error(`Unsupported symbol: ${symbol}`);

  const coinCapInterval = COINCAP_INTERVALS[interval];
  const now = Date.now();
  const start = now - (limit * INTERVAL_MS[interval]);

  // CoinCap uses exchange=binance for USDT pairs
  const url = `${COINCAP_API}?exchange=binance&interval=${coinCapInterval}&baseId=${mapping.baseId}&quoteId=${mapping.quoteId}&start=${start}&end=${now}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`CoinCap API failed: ${res.status}`);

  const json = await res.json();
  if (!json.data || !Array.isArray(json.data) || json.data.length === 0) {
    throw new Error('No CoinCap data');
  }

  return json.data.map((k: any) => ({
    time: k.period,       // Period start time in ms
    open: parseFloat(k.open),
    high: parseFloat(k.high),
    low: parseFloat(k.low),
    close: parseFloat(k.close),
    volume: parseFloat(k.volume),
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
        // Try CoinCap API first (free, fast, no key needed)
        return await fetchFromCoinCap(symbol, interval, limit);
      } catch {
        // Fall back to server proxy (which tries Binance then synthetic)
        return await fetchFromServer(symbol, interval, limit);
      }
    },
    enabled: !!symbol,
    staleTime: 30000,
    refetchInterval: REFETCH_INTERVALS[interval] || 600000,
  });
}
