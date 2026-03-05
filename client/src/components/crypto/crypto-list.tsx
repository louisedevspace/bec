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
            <div key={i} className="flex items-center justify-between py-3 px-3 bg-[#0a0a0a] rounded-xl animate-pulse">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-xl bg-[#1a1a1a]" />
                <div className="h-4 w-16 bg-[#1a1a1a] rounded" />
              </div>
              <div className="flex items-center gap-4">
                <div className="h-4 w-20 bg-[#1a1a1a] rounded" />
                <div className="h-5 w-16 bg-[#1a1a1a] rounded-full" />
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
            <tr className="text-[10px] text-gray-600 uppercase tracking-wider border-b border-[#1e1e1e]">
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
    <tr className={`border-b border-[#1e1e1e] transition-colors cursor-pointer ${
      isBTC 
        ? 'bg-gradient-to-r from-orange-500/5 to-yellow-500/5 hover:from-orange-500/10 hover:to-yellow-500/10' 
        : 'hover:bg-[#1a1a1a]/50'
    }`}>
      <td className="py-3 px-4">
        <div className="flex items-center gap-2.5">
          <CryptoIcon symbol={crypto.symbol} size="md" />
          <div className="min-w-0 flex-1">
            <div className="font-medium flex items-center gap-1.5 text-sm text-white">
              <span className="truncate">{crypto.symbol}</span>
              {isBTC && (
                <span className="px-1.5 py-0.5 bg-orange-500/20 text-orange-400 text-[9px] rounded font-bold whitespace-nowrap">
                  KING
                </span>
              )}
            </div>
            <div className="text-[11px] text-gray-600 truncate">{crypto.symbol}/USDT</div>
          </div>
        </div>
      </td>
      <td className="text-right py-3 px-4">
        <div className={`font-semibold text-sm tabular-nums ${isBTC ? 'text-orange-400' : 'text-white'}`}>
          {getFormattedPrice(crypto.symbol)}
        </div>
        <div className="text-[11px] text-gray-600">USDT</div>
      </td>
      <td className="text-right py-3 px-4">
        <div className="flex items-center justify-end gap-1">
          {isPositive ? (
            <TrendingUp size={10} className="text-green-400" />
          ) : (
            <TrendingDown size={10} className="text-red-400" />
          )}
          <span 
            className={`px-2 py-0.5 rounded-full text-xs font-medium tabular-nums ${
              isPositive 
                ? "bg-green-500/10 text-green-400" 
                : "bg-red-500/10 text-red-400"
            }`}
          >
            {isPositive ? "+" : ""}{change.toFixed(2)}%
          </span>
        </div>
      </td>
      {showVolume && (
        <td className="text-right py-3 px-4 hidden md:table-cell">
          <div className="font-medium text-sm text-white tabular-nums">{formatVolume(volume)}</div>
          <div className="text-[11px] text-gray-600">24h Vol</div>
        </td>
      )}
    </tr>
  );
}
