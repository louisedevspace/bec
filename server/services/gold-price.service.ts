// Gold spot price — primary: gold-api.com (free, no key, no rate limit with 1-min cache)
// Fallback: Yahoo Finance GC=F, then static approximation

const GOLD_API_URL = 'https://api.gold-api.com/price/XAU';
const YAHOO_URL = 'https://query1.finance.yahoo.com/v7/finance/quote?symbols=GC%3DF&fields=regularMarketPrice,regularMarketChangePercent';
const CACHE_TTL_MS = 60_000; // 1 minute — matches gold-api.com recommendation

export interface GoldPriceData {
  price: number;
  change24h: number;
  timestamp: number;
  source: string;
}

let cache: GoldPriceData | null = null;

async function fetchWithTimeout(url: string, ms = 6000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function tryGoldApi(): Promise<{ price: number; change24h: number } | null> {
  try {
    const res = await fetchWithTimeout(GOLD_API_URL, 5000);
    if (!res.ok) return null;
    const data = await res.json();
    if (typeof data?.price === 'number' && data.price > 0) {
      return { price: data.price, change24h: 0 };
    }
    return null;
  } catch {
    return null;
  }
}

async function tryYahooFinance(): Promise<{ price: number; change24h: number } | null> {
  try {
    const res = await fetchWithTimeout(YAHOO_URL, 6000);
    if (!res.ok) return null;
    const data = await res.json();
    const r = data?.quoteResponse?.result?.[0];
    if (!r || typeof r.regularMarketPrice !== 'number' || r.regularMarketPrice <= 0) return null;
    return {
      price: r.regularMarketPrice,
      change24h: typeof r.regularMarketChangePercent === 'number' ? r.regularMarketChangePercent : 0,
    };
  } catch {
    return null;
  }
}

export async function getGoldPrice(): Promise<GoldPriceData> {
  const now = Date.now();
  if (cache && now - cache.timestamp < CACHE_TTL_MS) return cache;

  // Primary: gold-api.com
  let result = await tryGoldApi();
  let source = 'gold-api.com';

  // Fallback: Yahoo Finance GC=F
  if (!result) {
    result = await tryYahooFinance();
    source = 'yahoo-finance';
  }

  if (result) {
    cache = { price: result.price, change24h: result.change24h, timestamp: now, source };
    return cache;
  }

  console.error('[GoldPrice] All sources failed, using stale cache or static fallback');
  if (cache) return { ...cache, timestamp: now };
  return { price: 3300.00, change24h: 0, timestamp: now, source: 'fallback' };
}
