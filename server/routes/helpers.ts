import { supabaseAdmin } from './middleware';
import LiveCryptoService from '../services/live-crypto-service';

/**
 * Validate a financial amount — must be a finite positive number.
 * Returns an error message if invalid, or null if valid.
 */
export function validateFinancialAmount(value: any, fieldName: string = "amount"): string | null {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (typeof num !== "number" || isNaN(num) || !isFinite(num)) {
    return `${fieldName} must be a valid number`;
  }
  if (num <= 0) {
    return `${fieldName} must be a positive number`;
  }
  if (num > 1e15) {
    return `${fieldName} exceeds maximum allowed value`;
  }
  return null;
}

/**
 * SECURITY FIX M1: Check if an amount is a valid decimal (not NaN, Infinity, or negative)
 */
export function isValidFinancialAmount(amount: any): boolean {
  if (amount === null || amount === undefined) return false;
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return typeof num === 'number' && isFinite(num) && num > 0 && num < 1e15;
}

export async function getTradingFeeRate(symbol: string): Promise<number> {
  const { data: pairData } = await supabaseAdmin
    .from('trading_pairs')
    .select('trading_fee')
    .eq('symbol', symbol)
    .maybeSingle();

  const rawRate = parseFloat(pairData?.trading_fee || '0.001');
  if (!Number.isFinite(rawRate) || rawRate < 0) return 0.001;
  return rawRate;
}

/**
 * Upsert a portfolio entry — update if exists, create if not.
 */
export async function updatePortfolioBalance(userId: string, symbol: string, newAvailable: string, newFrozen: string = '0') {
  const { data: existingPortfolio, error: fetchError } = await supabaseAdmin
    .from('portfolios')
    .select('id, available, frozen')
    .eq('user_id', userId)
    .eq('symbol', symbol)
    .maybeSingle();

  if (fetchError) {
    console.error('Error fetching existing portfolio:', fetchError);
    throw fetchError;
  }

  if (existingPortfolio && existingPortfolio.id) {
    const { data, error } = await supabaseAdmin
      .from('portfolios')
      .update({ available: newAvailable, frozen: newFrozen, updated_at: new Date().toISOString() })
      .eq('id', existingPortfolio.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  } else if (existingPortfolio && !existingPortfolio.id) {
    const { data, error } = await supabaseAdmin
      .from('portfolios')
      .update({ available: newAvailable, frozen: newFrozen, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('symbol', symbol)
      .select()
      .single();
    if (error) throw error;
    return data;
  } else {
    const { data, error } = await supabaseAdmin
      .from('portfolios')
      .insert({ user_id: userId, symbol, available: newAvailable, frozen: newFrozen })
      .select()
      .single();
    if (error) throw error;
    return data;
  }
}

/**
 * Ensure a portfolio row exists for a given user+symbol; creates with zero balance if missing.
 */
export async function ensurePortfolioExists(userId: string, symbol: string) {
  const { data: existing, error } = await supabaseAdmin
    .from('portfolios')
    .select('id')
    .eq('user_id', userId)
    .eq('symbol', symbol)
    .maybeSingle();

  if (error && (error as any).code !== 'PGRST116') throw error;

  if (!existing) {
    const { error: createError } = await supabaseAdmin
      .from('portfolios')
      .insert({ user_id: userId, symbol, available: '0', frozen: '0' });
    if (createError) throw createError;
  }
}

/**
 * Execute an approved trade — adjusts USDT and crypto balances.
 * Applies trading fees from trading_pairs table (deducted from the receiving side).
 */
export async function executeTradeAndUpdatePortfolio(trade: any) {
  const userId = trade.user_id;
  const cryptoSymbol = trade.symbol.split('/')[0];
  const side = trade.side;
  const amount = parseFloat(trade.amount);

  if (isNaN(amount) || amount <= 0) throw new Error(`Invalid amount: ${trade.amount}`);

  let price: number;
  if (trade.price === null) {
    const { data: cryptoPrice, error: priceError } = await supabaseAdmin
      .from('crypto_prices')
      .select('price')
      .eq('symbol', cryptoSymbol)
      .single();
    if (priceError || !cryptoPrice) throw new Error(`Could not fetch price for ${cryptoSymbol}`);
    price = parseFloat(cryptoPrice.price);
  } else {
    price = parseFloat(trade.price);
    if (isNaN(price) || price <= 0) throw new Error(`Invalid price: ${trade.price}`);
  }

  const totalValue = amount * price;
  if (isNaN(totalValue) || totalValue <= 0) throw new Error(`Invalid total value: ${totalValue}`);

  const feeRate = await getTradingFeeRate(trade.symbol);

  const { data: existingPortfolio } = await supabaseAdmin
    .from('portfolios')
    .select('*')
    .eq('user_id', userId)
    .eq('symbol', cryptoSymbol)
    .maybeSingle();

  let feeAmount = 0;
  let feeSymbol = '';

  if (side === 'buy') {
    // Buying crypto: deduct USDT, receive crypto (fee taken from USDT cost)
    const fee = totalValue * feeRate;
    feeAmount = fee;
    feeSymbol = 'USDT';
    const totalCost = totalValue + fee;

    const { data: usdtPortfolio } = await supabaseAdmin
      .from('portfolios')
      .select('available')
      .eq('user_id', userId)
      .eq('symbol', 'USDT')
      .maybeSingle();

    const currentUsdt = usdtPortfolio ? parseFloat(usdtPortfolio.available) : 0;
    if (currentUsdt < totalCost) throw new Error('Insufficient USDT balance (including fee)');
    await updatePortfolioBalance(userId, 'USDT', (currentUsdt - totalCost).toString());

    const currentCrypto = existingPortfolio ? parseFloat(existingPortfolio.available) : 0;
    await updatePortfolioBalance(userId, cryptoSymbol, (currentCrypto + amount).toString());

  } else if (side === 'sell') {
    // Selling crypto: deduct crypto, receive USDT (fee taken from USDT proceeds)
    const fee = totalValue * feeRate;
    feeAmount = fee;
    feeSymbol = 'USDT';
    const netProceeds = totalValue - fee;

    const currentCrypto = existingPortfolio ? parseFloat(existingPortfolio.available) : 0;
    if (currentCrypto < amount) throw new Error(`Insufficient ${cryptoSymbol} balance`);
    await updatePortfolioBalance(userId, cryptoSymbol, (currentCrypto - amount).toString());

    const { data: usdtPortfolio } = await supabaseAdmin
      .from('portfolios')
      .select('available')
      .eq('user_id', userId)
      .eq('symbol', 'USDT')
      .maybeSingle();

    const currentUsdt = usdtPortfolio ? parseFloat(usdtPortfolio.available) : 0;
    await updatePortfolioBalance(userId, 'USDT', (currentUsdt + netProceeds).toString());
  }

  // Record fee as platform revenue (if fee > 0)
  if (feeAmount > 0) {
    await supabaseAdmin.from('platform_fees').insert({
      user_id: userId,
      trade_id: trade.id,
      trade_type: 'spot',
      symbol: trade.symbol,
      fee_amount: feeAmount.toFixed(8),
      fee_symbol: feeSymbol,
      fee_rate: feeRate.toString(),
    }).then(() => {}).catch((err: any) => {
      // Non-critical: don't fail the trade if fee logging fails
      console.error('Failed to log platform fee:', err);
    });
  }

  return {
    feeAmount,
    feeRate,
    feeSymbol: feeSymbol || 'USDT',
  };
}

/**
 * Validate that the user has enough balance to execute a trade.
 */
export async function validateTradeBalance(tradeData: any) {
  const { userId, symbol, side, amount, price } = tradeData;

  try {
    let tradePrice = price;
    if (!tradePrice) {
      const liveCryptoService = new LiveCryptoService();
      const livePrices = await liveCryptoService.getCurrentPrices();
      const symbolKey = symbol.split('/')[0];
      const priceData = livePrices.find((p: any) => p.symbol === symbolKey);
      tradePrice = priceData?.price;
      if (!tradePrice) return { valid: false, error: 'Unable to get current price for this symbol' };
    }

    const totalValue = parseFloat(amount) * parseFloat(tradePrice);
    const feeRate = await getTradingFeeRate(symbol);
    const estimatedFee = totalValue * feeRate;

    if (side === 'buy') {
      const { data: usdtPortfolio, error } = await supabaseAdmin
        .from('portfolios')
        .select('available')
        .eq('user_id', userId)
        .eq('symbol', 'USDT')
        .maybeSingle();
      if (error && (error as any).code !== 'PGRST116') return { valid: false, error: 'Failed to check USDT balance' };
      const balance = usdtPortfolio ? parseFloat(usdtPortfolio.available) : 0;
      const requiredWithFee = totalValue + estimatedFee;
      if (balance < requiredWithFee) {
        return { valid: false, error: `Insufficient USDT balance. Required: ${requiredWithFee.toFixed(2)} (incl. fee ${estimatedFee.toFixed(2)}), Available: ${balance.toFixed(2)}` };
      }
    } else if (side === 'sell') {
      const crypto = symbol.split('/')[0];
      const { data: cryptoPortfolio, error } = await supabaseAdmin
        .from('portfolios')
        .select('available')
        .eq('user_id', userId)
        .eq('symbol', crypto)
        .maybeSingle();
      if (error && (error as any).code !== 'PGRST116') return { valid: false, error: 'Failed to check crypto balance' };
      const balance = cryptoPortfolio ? parseFloat(cryptoPortfolio.available) : 0;
      if (balance < parseFloat(amount)) {
        return { valid: false, error: `Insufficient ${crypto} balance. Required: ${amount}, Available: ${balance.toFixed(8)}` };
      }
    }

    return { valid: true };
  } catch (error) {
    console.error('Error validating trade balance:', error);
    return { valid: false, error: 'Failed to validate balance' };
  }
}

/**
 * Generate a unique 8-char alphanumeric display ID for a user.
 */
export async function generateDisplayId(): Promise<string> {
  let displayId = Math.random().toString(36).substring(2, 10).toUpperCase();
  let exists = true;

  while (exists) {
    displayId = Math.random().toString(36).substring(2, 10).toUpperCase();
    const { data } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('display_id', displayId)
      .maybeSingle();
    exists = !!data;
  }

  return displayId;
}

/**
 * SECURITY FIX L2: Validate and constrain pagination parameters
 */
export function validatePaginationParams(page: any, limit: any, maxLimit: number = 100): { offset: number; limit: number } {
  let limitNum = typeof limit === 'string' ? parseInt(limit) : (typeof limit === 'number' ? limit : 50);
  let pageNum = typeof page === 'string' ? parseInt(page) : (typeof page === 'number' ? page : 1);

  // Validate limits
  if (isNaN(limitNum) || limitNum < 1) limitNum = 50;
  if (limitNum > maxLimit) limitNum = maxLimit;

  // Validate page
  if (isNaN(pageNum) || pageNum < 1) pageNum = 1;

  const offset = (pageNum - 1) * limitNum;
  return { offset, limit: limitNum };
}
