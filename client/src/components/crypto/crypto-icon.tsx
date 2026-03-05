import { useState, useEffect, memo } from 'react';

// ===== Hardcoded CoinGecko image URLs for all supported coins =====
// Using /large/ variant for quality; browser will cache after first load
const ICON_URLS: Record<string, string> = {
  BTC: 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png',
  ETH: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png',
  USDT: 'https://assets.coingecko.com/coins/images/325/large/Tether.png',
  BNB: 'https://assets.coingecko.com/coins/images/825/large/bnb-icon2_2x.png',
  TRX: 'https://assets.coingecko.com/coins/images/1094/large/tron-logo.png',
  DOGE: 'https://assets.coingecko.com/coins/images/5/large/dogecoin.png',
  BCH: 'https://assets.coingecko.com/coins/images/780/large/bitcoin-cash.png',
  DASH: 'https://assets.coingecko.com/coins/images/19/large/dash-logo.png',
  DOT: 'https://assets.coingecko.com/coins/images/12171/large/polkadot.png',
  LTC: 'https://assets.coingecko.com/coins/images/2/large/litecoin.png',
  XRP: 'https://assets.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png',
  ADA: 'https://assets.coingecko.com/coins/images/975/large/cardano.png',
  SOL: 'https://assets.coingecko.com/coins/images/4128/large/solana.png',
  AVAX: 'https://assets.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png',
  MATIC: 'https://assets.coingecko.com/coins/images/4713/large/matic-token-icon.png',
  SHIB: 'https://assets.coingecko.com/coins/images/11939/large/shiba.png',
  LINK: 'https://assets.coingecko.com/coins/images/877/large/chainlink-new-logo.png',
  XMR: 'https://assets.coingecko.com/coins/images/69/large/monero_logo.png',
  XLM: 'https://assets.coingecko.com/coins/images/100/large/Stellar_symbol_black_RGB.png',
  ATOM: 'https://assets.coingecko.com/coins/images/1481/large/cosmos_hub.png',
  FIL: 'https://assets.coingecko.com/coins/images/12817/large/filecoin.png',
  APT: 'https://assets.coingecko.com/coins/images/26455/large/aptos_round.png',
  SUI: 'https://assets.coingecko.com/coins/images/26375/large/sui_asset.jpeg',
  ARB: 'https://assets.coingecko.com/coins/images/16547/large/photo_2023-03-29_21.47.00.jpeg',
  OP: 'https://assets.coingecko.com/coins/images/25244/large/Optimism.png',
  PEPE: 'https://assets.coingecko.com/coins/images/29850/large/pepe-token.jpeg',
  INJ: 'https://assets.coingecko.com/coins/images/12882/large/Secondary_Symbol.png',
  AAVE: 'https://assets.coingecko.com/coins/images/12645/large/AAVE.png',
  ALGO: 'https://assets.coingecko.com/coins/images/4380/large/download.png',
  ETC: 'https://assets.coingecko.com/coins/images/453/large/ethereum-classic-logo.png',
  EOS: 'https://assets.coingecko.com/coins/images/738/large/eos-eos-logo.png',
  THETA: 'https://assets.coingecko.com/coins/images/2538/large/theta-token-logo.png',
  UNI: 'https://assets.coingecko.com/coins/images/12504/large/uniswap-uni.png',
  VET: 'https://assets.coingecko.com/coins/images/116/large/VeChain-Logo-768x725.png',
  XAU: 'https://assets.coingecko.com/coins/images/25263/large/xaut.png',
  XAG: 'https://assets.coingecko.com/coins/images/30463/large/slvr.png',
};

// ===== Module-level caches (shared across all component instances) =====
const imageCache = new Map<string, string>();   // symbol → verified URL
const failedSet = new Set<string>();            // symbols that failed to load
const pendingMap = new Map<string, Promise<string>>(); // in-flight loads

/**
 * Preload an image for a symbol. Deduplicates concurrent requests.
 * Once resolved, the URL is stored in `imageCache` for instant re-use.
 */
function preloadImage(symbol: string): Promise<string> {
  const key = symbol.toUpperCase();

  if (imageCache.has(key)) return Promise.resolve(imageCache.get(key)!);
  if (failedSet.has(key)) return Promise.reject(new Error('failed'));
  if (pendingMap.has(key)) return pendingMap.get(key)!;

  const url = ICON_URLS[key];
  if (!url) {
    failedSet.add(key);
    return Promise.reject(new Error('no url'));
  }

  const promise = new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      imageCache.set(key, url);
      pendingMap.delete(key);
      resolve(url);
    };
    img.onerror = () => {
      failedSet.add(key);
      pendingMap.delete(key);
      reject(new Error('load error'));
    };
    img.crossOrigin = 'anonymous';
    img.src = url;
  });

  pendingMap.set(key, promise);
  return promise;
}

/**
 * Batch-preload icons for a list of symbols. Call once (e.g. on app mount)
 * to warm the cache so icons display instantly when components render.
 */
export function preloadCryptoIcons(symbols: string[]): void {
  symbols.forEach((s) => preloadImage(s).catch(() => {}));
}

// ===== Brand colors for fallback circles =====
const BRAND_COLORS: Record<string, string> = {
  BTC: '#f7931a', ETH: '#627eea', USDT: '#26a17b', BNB: '#f3ba2f',
  SOL: '#9945ff', XRP: '#23292f', ADA: '#0033ad', DOGE: '#c2a633',
  DOT: '#e6007a', LTC: '#bfbbbb', AVAX: '#e84142', MATIC: '#8247e5',
  LINK: '#2a5ada', SHIB: '#ffa409', TRX: '#ff0013', ATOM: '#2e3148',
  BCH: '#8dc351', DASH: '#008ce7', XMR: '#ff6600', XLM: '#14b6e7',
  FIL: '#0090ff', APT: '#4cd4a1', SUI: '#4da2ff', ARB: '#28a0f0',
  OP: '#ff0420', PEPE: '#3caa1e', INJ: '#00a3ff', AAVE: '#b6509e',
  ALGO: '#000000', ETC: '#328332', EOS: '#000000', THETA: '#2ab8e6',
  UNI: '#ff007a', VET: '#15bdff', XAU: '#cfb53b', XAG: '#c0c0c0',
};

// ===== Size presets =====
const SIZE_MAP = { xs: 16, sm: 20, md: 28, lg: 36, xl: 44 } as const;
type IconSize = keyof typeof SIZE_MAP;

interface CryptoIconProps {
  /** Coin ticker symbol, e.g. "BTC", "ETH" */
  symbol: string;
  /** Predefined size preset */
  size?: IconSize;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Displays a cryptocurrency icon with efficient module-level caching.
 * - First render checks the in-memory cache (instant if previously loaded)
 * - Falls back to a branded colored circle with the coin's initial letter
 * - Failed loads are remembered so we never retry broken URLs
 */
export const CryptoIcon = memo(function CryptoIcon({
  symbol,
  size = 'sm',
  className = '',
}: CryptoIconProps) {
  const upper = symbol.toUpperCase();
  const px = SIZE_MAP[size];

  // Synchronously check cache — if available, render immediately without flicker
  const cachedUrl = imageCache.get(upper);
  const [imageUrl, setImageUrl] = useState<string | null>(cachedUrl || null);
  const [hasFailed, setHasFailed] = useState(failedSet.has(upper));

  useEffect(() => {
    // If already resolved (from cache or previous effect), skip
    if (imageCache.has(upper)) {
      setImageUrl(imageCache.get(upper)!);
      return;
    }
    if (failedSet.has(upper)) {
      setHasFailed(true);
      return;
    }

    let cancelled = false;
    preloadImage(upper)
      .then((url) => { if (!cancelled) setImageUrl(url); })
      .catch(() => { if (!cancelled) setHasFailed(true); });

    return () => { cancelled = true; };
  }, [upper]);

  // Loaded icon
  if (imageUrl && !hasFailed) {
    return (
      <img
        src={imageUrl}
        alt={upper}
        width={px}
        height={px}
        loading="lazy"
        decoding="async"
        className={`rounded-full object-contain flex-shrink-0 ${className}`}
        style={{ width: px, height: px, minWidth: px, minHeight: px }}
        onError={() => {
          failedSet.add(upper);
          setHasFailed(true);
        }}
      />
    );
  }

  // Fallback: branded colored circle with initial letter
  const bg = BRAND_COLORS[upper] || '#6366f1';
  const fontSize = Math.max(9, Math.round(px * 0.38));

  return (
    <div
      className={`rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 ${className}`}
      style={{
        width: px,
        height: px,
        minWidth: px,
        minHeight: px,
        backgroundColor: bg,
        fontSize,
        lineHeight: 1,
      }}
    >
      {upper[0] || '?'}
    </div>
  );
});

export default CryptoIcon;
