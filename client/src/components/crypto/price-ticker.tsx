import { memo } from "react";
import { useCryptoPrices } from "@/hooks/use-crypto-prices";
import { TrendingUp, TrendingDown } from "lucide-react";
import { CryptoIcon } from "@/components/crypto/crypto-icon";

interface PriceTickerProps {
  symbols: string[];
  className?: string;
}

export const PriceTicker = memo(function PriceTicker({ symbols, className = "" }: PriceTickerProps) {
  const { getPriceBySymbol, getFormattedPrice, isLoading } = useCryptoPrices();

  if (isLoading) {
    return (
      <div className={`bg-card rounded-xl border border-border p-4 ${className}`}>
        <div className="grid grid-cols-3 gap-3">
          {symbols.map((symbol) => (
            <div key={symbol} className="bg-background rounded-lg p-3 border border-border animate-pulse">
              <div className="h-3 w-12 bg-muted rounded mb-2" />
              <div className="h-5 w-16 bg-muted rounded mb-1.5" />
              <div className="h-3 w-10 bg-muted rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-card rounded-xl border border-border p-4 ${className}`}>
      <div className="grid grid-cols-3 gap-3">
        {symbols.map((symbol) => {
          const price = getPriceBySymbol(symbol);
          const change = price ? parseFloat(price.change24h) : 0;
          const isPositive = change >= 0;
          const volume = price ? parseFloat(price.volume24h) : 0;

          return (
            <div key={symbol} className="bg-background rounded-lg p-3 border border-border hover:border-primary/30 transition-colors">
              <div className="text-[11px] text-muted-foreground mb-1 flex items-center gap-1.5">
                <CryptoIcon symbol={symbol} size="xs" />
                {symbol}/USDT
              </div>
              <div className="text-base font-semibold text-foreground tabular-nums mb-1">
                {getFormattedPrice(symbol)}
              </div>
              <div className="flex items-center gap-1 mb-1">
                {isPositive ? (
                  <TrendingUp size={10} className="text-success" />
                ) : (
                  <TrendingDown size={10} className="text-danger" />
                )}
                <span
                  className={`text-xs font-medium tabular-nums ${
                    isPositive ? "text-success" : "text-danger"
                  }`}
                >
                  {isPositive ? "+" : ""}{change.toFixed(2)}%
                </span>
              </div>
              <div className="text-[10px] text-muted-foreground">
                Vol: {volume.toLocaleString()}M
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});
