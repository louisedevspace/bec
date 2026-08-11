import { useCryptoPrices } from "@/hooks/use-crypto-prices";
import { TrendingUp, TrendingDown } from "lucide-react";
import type { CryptoPrice } from "@/types/crypto";
import { CryptoIcon } from "@/components/crypto/crypto-icon";

interface CryptoListProps {
  limit?: number;
  showVolume?: boolean;
  className?: string;
}

export function CryptoList({ limit, showVolume = true, className = "" }: CryptoListProps) {
  const { prices, isLoading, getFormattedPrice, getChangeColor } = useCryptoPrices();

  if (isLoading) {
    return (
      <div className={className}>
        <div className="space-y-1 p-3">
          {Array.from({ length: limit || 5 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between py-3 px-3 bg-background rounded-lg animate-pulse">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-muted" />
                <div className="h-4 w-16 bg-muted rounded" />
              </div>
              <div className="flex items-center gap-4">
                <div className="h-4 w-20 bg-muted rounded" />
                <div className="h-5 w-16 bg-muted rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const displayPrices = limit ? prices.slice(0, limit) : prices;

  return (
    <div className={className}>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-[10px] text-muted-foreground uppercase tracking-wider border-b border-border">
              <th className="text-left py-2.5 px-4">Name</th>
              <th className="text-right py-2.5 px-4">Price</th>
              <th className="text-right py-2.5 px-4">Change</th>
              {showVolume && <th className="text-right py-2.5 px-4 hidden md:table-cell">Volume</th>}
            </tr>
          </thead>
          <tbody>
            {displayPrices.map((crypto) => (
              <CryptoRow 
                key={crypto.symbol} 
                crypto={crypto} 
                showVolume={showVolume}
                getFormattedPrice={getFormattedPrice}
                getChangeColor={getChangeColor}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface CryptoRowProps {
  crypto: CryptoPrice;
  showVolume: boolean;
  getFormattedPrice: (symbol: string) => string;
  getChangeColor: (symbol: string) => string;
}

function CryptoRow({ crypto, showVolume, getFormattedPrice, getChangeColor }: CryptoRowProps) {
  const change = parseFloat(crypto.change24h);
  const isPositive = change >= 0;
  const volume = parseFloat(crypto.volume24h);

  const formatVolume = (vol: number) => {
    if (vol >= 1000000) {
      return `${(vol / 1000000).toFixed(1)}M`;
    } else if (vol >= 1000) {
      return `${(vol / 1000).toFixed(1)}K`;
    }
    return vol.toFixed(0);
  };

  const isBTC = crypto.symbol === 'BTC';

  return (
    <tr className={`border-b border-border transition-colors cursor-pointer ${
      isBTC
        ? 'bg-primary/5 hover:bg-primary/10'
        : 'hover:bg-muted/50'
    }`}>
      <td className="py-3 px-4">
        <div className="flex items-center gap-2.5">
          <CryptoIcon symbol={crypto.symbol} size="md" />
          <div className="min-w-0 flex-1">
            <div className="font-medium flex items-center gap-1.5 text-sm text-foreground">
              <span className="truncate">{crypto.symbol}</span>
              {isBTC && (
                <span className="px-1.5 py-0.5 bg-primary/15 text-primary text-[9px] rounded font-bold whitespace-nowrap">
                  KING
                </span>
              )}
            </div>
            <div className="text-[11px] text-muted-foreground truncate">{crypto.symbol}/USDT</div>
          </div>
        </div>
      </td>
      <td className="text-right py-3 px-4">
        <div className={`font-semibold text-sm tabular-nums ${isBTC ? 'text-primary' : 'text-foreground'}`}>
          {getFormattedPrice(crypto.symbol)}
        </div>
        <div className="text-[11px] text-muted-foreground">USDT</div>
      </td>
      <td className="text-right py-3 px-4">
        <div className="flex items-center justify-end gap-1">
          {isPositive ? (
            <TrendingUp size={10} className="text-success" />
          ) : (
            <TrendingDown size={10} className="text-danger" />
          )}
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-medium tabular-nums ${
              isPositive
                ? "bg-success/10 text-success"
                : "bg-danger/10 text-danger"
            }`}
          >
            {isPositive ? "+" : ""}{change.toFixed(2)}%
          </span>
        </div>
      </td>
      {showVolume && (
        <td className="text-right py-3 px-4 hidden md:table-cell">
          <div className="font-medium text-sm text-foreground tabular-nums">{formatVolume(volume)}</div>
          <div className="text-[11px] text-muted-foreground">24h Vol</div>
        </td>
      )}
    </tr>
  );
}
