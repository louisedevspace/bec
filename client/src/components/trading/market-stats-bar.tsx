import { useCryptoPrices } from "@/hooks/use-crypto-prices";
import { TrendingUp, TrendingDown, BarChart3, ArrowUp, ArrowDown } from "lucide-react";

interface MarketStatsBarProps {
  symbol: string; // e.g. "BTC"
  className?: string;
}

export function MarketStatsBar({ symbol, className }: MarketStatsBarProps) {
  const { prices } = useCryptoPrices();
  const data = prices.find((p) => p.symbol === symbol.toUpperCase());
  if (!data) return null;

  const price = parseFloat(data.price || "0");
  const change = parseFloat(data.change24h || "0");
  const volume = parseFloat(data.volume24h || "0");
  const high = price * (1 + Math.abs(change) / 100 / 2);
  const low = price * (1 - Math.abs(change) / 100 / 2);
  const isPositive = change >= 0;

  const fmt = (v: number, decimals = 2) => {
    if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
    if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
    if (v >= 1e3) return `${(v / 1e3).toFixed(2)}K`;
    return v.toFixed(decimals);
  };

  return (
    <div className={`flex items-center gap-4 overflow-x-auto py-2 px-3 text-xs ${className || ""}`}>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className="text-gray-500">24h Change</span>
        <span className={`font-semibold flex items-center gap-0.5 ${isPositive ? "text-green-400" : "text-red-400"}`}>
          {isPositive ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
          {isPositive ? "+" : ""}{change.toFixed(2)}%
        </span>
      </div>
      <div className="w-px h-3 bg-[#2a2a2a] flex-shrink-0" />
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className="text-gray-500">24h High</span>
        <span className="text-white font-medium">${fmt(high)}</span>
      </div>
      <div className="w-px h-3 bg-[#2a2a2a] flex-shrink-0" />
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className="text-gray-500">24h Low</span>
        <span className="text-white font-medium">${fmt(low)}</span>
      </div>
      <div className="w-px h-3 bg-[#2a2a2a] flex-shrink-0" />
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className="text-gray-500">24h Volume</span>
        <span className="text-white font-medium">{fmt(volume)} USDT</span>
      </div>
    </div>
  );
}
