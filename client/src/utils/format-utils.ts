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

