import { useCryptoPrices } from "@/hooks/use-crypto-prices";
import { TrendingUp, TrendingDown } from "lucide-react";
import type { CryptoPrice } from "@/types/crypto";
import { useEffect, useState } from "react";

const CRYPTO_LOGOS: Record<string, { logo: string; homepage: string }> = {
  BTC: { logo: 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png', homepage: 'https://bitcoin.org' },
  ETH: { logo: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png', homepage: 'https://ethereum.org' },
  USDT: { logo: 'https://assets.coingecko.com/coins/images/325/large/Tether.png', homepage: 'https://tether.to' },
  BNB: { logo: 'https://assets.coingecko.com/coins/images/825/large/bnb-icon2_2x.png', homepage: 'https://www.bnbchain.org' },
  TRX: { logo: 'https://assets.coingecko.com/coins/images/1094/large/tron-logo.png', homepage: 'https://tron.network' },
  DOGE: { logo: 'https://assets.coingecko.com/coins/images/5/large/dogecoin.png', homepage: 'https://dogecoin.com' },
  BCH: { logo: 'https://assets.coingecko.com/coins/images/780/large/bitcoin-cash.png', homepage: 'https://www.bitcoincash.org' },
  DASH: { logo: 'https://assets.coingecko.com/coins/images/19/large/dash-logo.png', homepage: 'https://www.dash.org' },
  DOT: { logo: 'https://assets.coingecko.com/coins/images/12171/large/polkadot.png', homepage: 'https://polkadot.network' },
  LTC: { logo: 'https://assets.coingecko.com/coins/images/2/large/litecoin.png', homepage: 'https://litecoin.org' },
  XRP: { logo: 'https://assets.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png', homepage: 'https://xrp.com' },
  ADA: { logo: 'https://assets.coingecko.com/coins/images/975/large/cardano.png', homepage: 'https://cardano.org' },
  SOL: { logo: 'https://assets.coingecko.com/coins/images/4128/large/solana.png', homepage: 'https://solana.com' },
  AVAX: { logo: 'https://assets.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png', homepage: 'https://www.avax.network' },
  MATIC: { logo: 'https://assets.coingecko.com/coins/images/4713/large/matic-token-icon.png', homepage: 'https://polygon.technology' },
  SHIB: { logo: 'https://assets.coingecko.com/coins/images/11939/large/shiba.png', homepage: 'https://shibatoken.com' },
  LINK: { logo: 'https://assets.coingecko.com/coins/images/877/large/chainlink-new-logo.png', homepage: 'https://chain.link' },
  XMR: { logo: 'https://assets.coingecko.com/coins/images/69/large/monero_logo.png', homepage: 'https://www.getmonero.org' },
  XLM: { logo: 'https://assets.coingecko.com/coins/images/100/large/Stellar_symbol_black_RGB.png', homepage: 'https://stellar.org' },
  ATOM: { logo: 'https://assets.coingecko.com/coins/images/1481/large/cosmos_hub.png', homepage: 'https://cosmos.network' },
  FIL: { logo: 'https://assets.coingecko.com/coins/images/12817/large/filecoin.png', homepage: 'https://filecoin.io' },
  APT: { logo: 'https://assets.coingecko.com/coins/images/26455/large/aptos_round.png', homepage: 'https://aptoslabs.com' },
  SUI: { logo: 'https://assets.coingecko.com/coins/images/26375/large/sui_asset.jpeg', homepage: 'https://sui.io' },
  ARB: { logo: 'https://assets.coingecko.com/coins/images/16547/large/photo_2023-03-29_21.47.00.jpeg', homepage: 'https://arbitrum.io' },
  OP: { logo: 'https://assets.coingecko.com/coins/images/25244/large/Optimism.png', homepage: 'https://optimism.io' },
  PEPE: { logo: 'https://assets.coingecko.com/coins/images/29850/large/pepe-token.jpeg', homepage: 'https://pepe.vip' },
  INJ: { logo: 'https://assets.coingecko.com/coins/images/12882/large/Secondary_Symbol.png', homepage: 'https://injective.com' },
  AAVE: { logo: 'https://assets.coingecko.com/coins/images/12645/large/AAVE.png', homepage: 'https://aave.com' },
  ALGO: { logo: 'https://assets.coingecko.com/coins/images/4380/large/download.png', homepage: 'https://algorand.com' },
  ETC: { logo: 'https://assets.coingecko.com/coins/images/453/large/ethereum-classic-logo.png', homepage: 'https://ethereumclassic.org' },
  EOS: { logo: 'https://assets.coingecko.com/coins/images/738/large/eos-eos-logo.png', homepage: 'https://eos.io' },
  THETA: { logo: 'https://assets.coingecko.com/coins/images/2538/large/theta-token-logo.png', homepage: 'https://www.thetatoken.org' },
  UNI: { logo: 'https://assets.coingecko.com/coins/images/12504/large/uniswap-uni.png', homepage: 'https://uniswap.org' },
  VET: { logo: 'https://assets.coingecko.com/coins/images/116/large/VeChain-Logo-768x725.png', homepage: 'https://www.vechain.org' }
};

function useCoinGeckoLogos(symbols: string[]) {
  const [logos, setLogos] = useState<Record<string, { logo: string; homepage: string }>>({});

  useEffect(() => {
    if (!symbols.length) return;
    
    // Use hardcoded logos directly for reliability
    const logoMap: Record<string, { logo: string; homepage: string }> = {};
    symbols.forEach((symbol) => {
      const upperSymbol = symbol.toUpperCase();
      if (CRYPTO_LOGOS[upperSymbol]) {
        logoMap[upperSymbol] = CRYPTO_LOGOS[upperSymbol];
      } else {
        console.warn(`No logo found for symbol: ${upperSymbol}`);
      }
    });
    
    console.log('Available symbols:', symbols);
    console.log('Logo map:', logoMap);
    setLogos(logoMap);
  }, [symbols.join(",")]);
  
  return logos;
}

interface CryptoListProps {
  limit?: number;
  showVolume?: boolean;
  className?: string;
}

export function CryptoList({ limit, showVolume = true, className = "" }: CryptoListProps) {
  const { prices, isLoading, getFormattedPrice, getChangeColor } = useCryptoPrices();
  const symbols = prices.map((p) => p.symbol);
  const logos = useCoinGeckoLogos(symbols);

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
                logos={logos}
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
  logos: Record<string, { logo: string; homepage: string }>;
}

function CryptoRow({ crypto, showVolume, getFormattedPrice, getChangeColor, logos }: CryptoRowProps) {
  const change = parseFloat(crypto.change24h);
  const isPositive = change >= 0;
  const volume = parseFloat(crypto.volume24h);
  const logoData = logos[crypto.symbol];
  
  // Debug logging
  if (!logoData) {
    console.warn(`No logo data for ${crypto.symbol}. Available logos:`, Object.keys(logos));
  }

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
          {logoData && logoData.logo ? (
            <a href={logoData.homepage} target="_blank" rel="noopener noreferrer">
              <img
                src={logoData.logo}
                alt={crypto.symbol}
                className="w-7 h-7 rounded-lg object-contain border border-[#2a2a2a]"
                style={{ background: "#111" }}
              />
            </a>
          ) : (
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
              isBTC ? 'bg-orange-500' : 'bg-[#1a1a1a] border border-[#2a2a2a]'
            }`}>
              <span className={`text-[10px] font-bold ${
                isBTC ? 'text-white' : 'text-gray-400'
              }`}>
                {isBTC ? '₿' : crypto.symbol[0]}
              </span>
            </div>
          )}
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
