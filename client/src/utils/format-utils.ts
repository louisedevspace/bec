/**
 * Currency symbol mapping for supported assets
 */
const CURRENCY_SYMBOLS: Record<string, string> = {
  BTC: '₿',
  ETH: 'Ξ',
  USDT: '$',
  USDC: '$',
  DAI: '$',
  LTC: 'Ł',
  XRP: 'XRP',
  DOGE: 'DOGE',
  TRX: 'TRX',
  BNB: 'BNB',
  DOT: 'DOT',
  BCH: 'BCH',
  ETC: 'ETC',
  EOS: 'EOS',
  XAU: 'XAU',
  XAG: 'XAG',
};

const STABLECOIN_SYMBOLS = new Set(['USDT', 'USDC', 'DAI', 'BUSD', 'TUSD']);

/**
 * Returns the proper currency symbol for a given asset.
 * For stablecoins (USDT, USDC, etc.) returns '$'.
 * For BTC returns '₿'. For ETH returns 'Ξ'. Etc.
 */
export function getCurrencySymbol(symbol: string): string {
  const upper = symbol.toUpperCase();
  return CURRENCY_SYMBOLS[upper] || upper;
}

/**
 * Returns true if the symbol represents a stablecoin pegged ~1:1 to USD.
 */
export function isStablecoin(symbol: string): boolean {
  return STABLECOIN_SYMBOLS.has(symbol.toUpperCase());
}

/**
 * Primary balance formatter — always pairs the correct symbol with the value.
 *
 * @param value     Numeric amount (in the asset's native unit)
 * @param symbol    Asset ticker, e.g. 'BTC', 'USDT', 'ETH'
 * @param mode      'usd' = show the USD-converted value with $,
 *                  'crypto' = show original amount with native symbol
 * @param usdRate   Current price of (symbol → USD). Required when mode='usd' for non-stablecoins.
 *
 * Examples:
 *   formatBalance(0.5, 'BTC', 'usd', 98000)   → "$49,000.00"
 *   formatBalance(0.5, 'BTC', 'crypto')         → "₿0.50000000"
 *   formatBalance(1500, 'USDT', 'usd')          → "$1,500.00"
 *   formatBalance(1500, 'USDT', 'crypto')        → "$1,500.00"  (USDT ≈ USD)
 *   formatBalance(2.35, 'ETH', 'usd', 3800)    → "$8,930.00"
 *   formatBalance(2.35, 'ETH', 'crypto')         → "Ξ2.35000000"
 */
export function formatBalance(
  value: number | string,
  symbol: string,
  mode: 'usd' | 'crypto' = 'usd',
  usdRate?: number,
): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return mode === 'usd' ? '$0.00' : `${getCurrencySymbol(symbol)}0.00`;

  const upper = symbol.toUpperCase();
  const stable = isStablecoin(upper);

  // USD display mode
  if (mode === 'usd') {
    // Stablecoins: value is already ~USD
    if (stable) {
      return '$' + formatUsdNumber(num);
    }
    // Non-stablecoins: convert using rate
    const rate = usdRate ?? 0;
    const usdValue = num * rate;
    return '$' + formatUsdNumber(usdValue);
  }

  // Crypto display mode — show native symbol + raw amount
  const sym = getCurrencySymbol(upper);
  if (stable) {
    // Stablecoins still show $ even in "crypto" mode since they ARE dollars
    return '$' + formatUsdNumber(num);
  }

  return sym + formatCryptoNumber(num);
}

/**
 * Format a USD-denominated number for display (always 2dp, thousands separators).
 */
export function formatUsdNumber(value: number): string {
  if (Math.abs(value) < 0.01 && value !== 0) return value.toFixed(4);
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Format a crypto amount for display (adaptive decimal places).
 */
export function formatCryptoNumber(value: number): string {
  if (value === 0) return '0.00000000';
  if (Math.abs(value) < 0.000001) return value.toFixed(8);
  if (Math.abs(value) < 0.01) return value.toFixed(6);
  if (Math.abs(value) < 1) return value.toFixed(4);
  if (Math.abs(value) < 1000) return value.toFixed(2);
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Format a market price with $ symbol. For display next to asset names.
 * e.g. "$98,234.56" for BTC, "$0.9998" for USDT
 */
export function formatPrice(price: number | string): string {
  const num = typeof price === 'string' ? parseFloat(price) : price;
  if (isNaN(num)) return '$0.00';
  if (num >= 1000) return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (num >= 1) return '$' + num.toFixed(4);
  return '$' + num.toFixed(6);
}

/**
 * Flexible decimal formatting utility for crypto balances
 * Automatically adjusts decimal places based on value size for better readability
 */

export function formatCryptoBalance(value: number | string, symbol: string = ''): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  
  if (isNaN(num)) return `0.00000000 ${symbol}`.trim();
  
  // Handle zero values
  if (num === 0) return `0.00000000 ${symbol}`.trim();
  
  // Handle very small values (less than 0.000001)
  if (num < 0.000001 && num > 0) {
    return `${num.toFixed(8)} ${symbol}`.trim();
  }
  
  // Handle small values (less than 0.01)
  if (num < 0.01) {
    return `${num.toFixed(6)} ${symbol}`.trim();
  }
  
  // Handle medium values (less than 1)
  if (num < 1) {
    return `${num.toFixed(4)} ${symbol}`.trim();
  }
  
  // Handle large values (less than 1000)
  if (num < 1000) {
    return `${num.toFixed(2)} ${symbol}`.trim();
  }
  
  // Handle very large values (1000+)
  return `${num.toLocaleString('en-US', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  })} ${symbol}`.trim();
}

export function formatUSDTBalance(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  
  if (isNaN(num)) return '0.00 USDT';
  
  // USDT typically uses 2 decimal places for readability
  if (num < 1000) {
    return `${num.toFixed(2)} USDT`;
  }
  
  // For large USDT amounts, use locale formatting
  return `${num.toLocaleString('en-US', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  })} USDT`;
}

export function formatBTCBalance(value: number | string): string {
  return formatCryptoBalance(value, 'BTC');
}

export function formatETHBalance(value: number | string): string {
  return formatCryptoBalance(value, 'ETH');
}

export function formatGenericCryptoBalance(value: number | string, symbol: string): string {
  return formatCryptoBalance(value, symbol);
}

// For error messages and precise calculations, use full precision
export function formatPreciseBalance(value: number | string, symbol: string = ''): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  
  if (isNaN(num)) return `0.00000000 ${symbol}`.trim();
  
  return `${num.toFixed(8)} ${symbol}`.trim();
}

// For trading forms and inputs, use appropriate step values
export function getStepValue(symbol: string): string {
  switch (symbol.toUpperCase()) {
    case 'BTC':
    case 'ETH':
    case 'LTC':
    case 'BCH':
      return '0.00000001'; // 8 decimal places for major cryptos
    case 'USDT':
    case 'USDC':
    case 'DAI':
      return '0.01'; // 2 decimal places for stablecoins
    default:
      return '0.00000001'; // Default to 8 decimal places
  }
}

// For display purposes, get appropriate placeholder
export function getPlaceholder(symbol: string): string {
  switch (symbol.toUpperCase()) {
    case 'BTC':
    case 'ETH':
    case 'LTC':
    case 'BCH':
      return '0.00000000'; // 8 decimal places
    case 'USDT':
    case 'USDC':
    case 'DAI':
      return '0.00'; // 2 decimal places
    default:
      return '0.00000000'; // Default to 8 decimal places
  }
}

