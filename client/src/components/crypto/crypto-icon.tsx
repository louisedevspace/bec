import { useState, useEffect, memo } from 'react';

// ===== CoinCap CDN — reliable, simple pattern, no auth, no CORS issues =====
// Pattern: https://assets.coincap.io/assets/icons/{symbol_lowercase}@2x.png
// Covers all major crypto. XAU/XAG (commodities) use special handling.
const COINCAP_URL = (sym: string) =>
  `https://assets.coincap.io/assets/icons/${sym.toLowerCase()}@2x.png`;

// Special-case overrides (commodities, rebranded tokens)
const ICON_OVERRIDES: Record<string, string> = {
  XAU: 'https://assets.coincap.io/assets/icons/xaut@2x.png', // Tether Gold icon for gold
  // XAG has no CDN icon — uses fallback circle
};

// ===== Module-level caches (shared across all component instances) =====
const imageCache = new Map<string, string>();   // symbol → verified URL
const failedSet = new Set<string>();            // symbols that failed to load
const pendingMap = new Map<string, Promise<string>>(); // in-flight loads

/**
 * Get the icon URL for a symbol, using overrides or the CoinCap CDN pattern.
 */
function getIconUrl(symbol: string): string | null {
  const key = symbol.toUpperCase();
  if (ICON_OVERRIDES[key]) return ICON_OVERRIDES[key];
  // Skip known missing symbols (commodities without icons)
  if (key === 'XAG') return null;
  return COINCAP_URL(key);
}

/**
 * Preload an image for a symbol. Deduplicates concurrent requests.
 * Once resolved, the URL is stored in `imageCache` for instant re-use.
 */
function preloadImage(symbol: string): Promise<string> {
  const key = symbol.toUpperCase();

  if (imageCache.has(key)) return Promise.resolve(imageCache.get(key)!);
  if (failedSet.has(key)) return Promise.reject(new Error('failed'));
  if (pendingMap.has(key)) return pendingMap.get(key)!;

  const url = getIconUrl(key);
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
    // NOTE: Do NOT set img.crossOrigin — it forces a CORS preflight check
    // which fails on CDNs that don't send Access-Control-Allow-Origin headers.
    // <img> tags display fine without CORS for display-only use.
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
