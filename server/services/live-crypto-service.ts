import axios from 'axios';
import supabase from '../supabaseClient';
import { redisGetJSON, redisSetJSON, isRedisConnected, REDIS_KEYS } from '../utils/redis';

// In-memory cache for prices when database is unavailable
let inMemoryPriceCache: CryptoPriceData[] = [];
let dbConnectionHealthy = true;
let lastDbCheckTime = 0;
const DB_HEALTH_CHECK_INTERVAL = 60000; // 1 minute
const REDIS_SERVICE_PRICES_TTL = 60; // 60 seconds for service-level cache

// Supported cryptocurrencies
const SUPPORTED_CRYPTOS = [
  'BTC', 'ETH', 'USDT', 'BNB', 'XRP', 'ADA', 'DOGE', 'MATIC',
  'DOT', 'LTC', 'BCH', 'LINK', 'UNI', 'ATOM', 'ETC', 'XLM',
  'TRX', 'XMR', 'EOS', 'FIL', 'VET', 'THETA', 'AAVE', 'ALGO',
  'AVAX', 'SOL', 'SHIB', 'APT', 'SUI', 'ARB', 'OP', 'PEPE', 'INJ', 'DASH',
  'XAU',  // Gold spot — fetched from gold-api.com / Yahoo Finance GC=F
  'XAUT', // Tether Gold — trades on Binance/MEXC as XAUTUSDT
];

// Precious-metal symbols priced from gold-api.com (free, no key) instead of
// crypto exchanges. gold-api.com exposes XAU (gold), XAG (silver),
// XPT (platinum), XPD (palladium). Any of these added as a trading pair is
// priced automatically. (XAUT is Tether Gold, a real crypto pair — not here.)
const METAL_SYMBOLS = new Set(['XAU', 'XAG', 'XPT', 'XPD']);
const METAL_YAHOO_FUTURES: { [key: string]: string } = {
  XAU: 'GC=F', XAG: 'SI=F', XPT: 'PL=F', XPD: 'PA=F',
};

export interface CryptoPriceData {
  symbol: string;
  price: string;
  change24h: string;
  volume24h: string;
}

class LiveCryptoService {
  private static instance: LiveCryptoService;
  private lastUpdate: Date = new Date(0);
  private updateInterval: number = 30000; // 30 seconds

  // The live symbol universe = the hardcoded base set UNION whatever enabled
  // trading pairs an admin has added. Refreshed from the DB on a short cache
  // so adding any pair gets it priced automatically, with no code change.
  private activeSymbols: string[] = [...SUPPORTED_CRYPTOS];
  private activeSymbolsCacheTime = 0;

  public static getInstance(): LiveCryptoService {
    if (!LiveCryptoService.instance) {
      LiveCryptoService.instance = new LiveCryptoService();
    }
    return LiveCryptoService.instance;
  }

  /**
   * Refresh the active symbol universe from the trading_pairs table so any
   * pair an admin adds gets priced automatically. Falls back to the hardcoded
   * SUPPORTED_CRYPTOS set if the DB read fails, so pricing never breaks.
   * Cached 60s to avoid a DB hit on every 30s price cycle.
   */
  private async refreshActiveSymbols(): Promise<void> {
    const now = Date.now();
    if (this.activeSymbolsCacheTime && now - this.activeSymbolsCacheTime < 60000) return;
    try {
      const { data, error } = await supabase
        .from('trading_pairs')
        .select('base_asset')
        .eq('is_enabled', true);
      if (!error && Array.isArray(data)) {
        const dbSymbols = data
          .map((r: { base_asset: string }) => (r.base_asset || '').toUpperCase())
          .filter(Boolean);
        this.activeSymbols = Array.from(new Set([...SUPPORTED_CRYPTOS, ...dbSymbols]));
      }
      this.activeSymbolsCacheTime = now;
    } catch {
      // Keep whatever activeSymbols we already had — never break pricing.
    }
  }

  /**
   * Fetch live crypto prices with dual mechanism: MEXC first, then Binance, then CoinGecko fallback
   */
  private async fetchLivePrices(): Promise<CryptoPriceData[]> {
    let prices: CryptoPriceData[] = [];

    // Refresh the symbol universe from trading_pairs so newly-added pairs
    // get fetched this cycle (cached 60s; never throws).
    await this.refreshActiveSymbols();

    // Try MEXC first (free, no key, Binance-compatible)
    try {
      console.log('🔄 Fetching prices from MEXC...');
      const mexcPrices = await this.fetchFromMexc();
      const hasUsdt = mexcPrices.some(p => p.symbol === 'USDT');
      if (!hasUsdt) {
        mexcPrices.push({ symbol: 'USDT', price: '1.00', change24h: '0.00', volume24h: '0' });
      }
      if (mexcPrices.length > 0) {
        console.log(`✅ Successfully fetched ${mexcPrices.length} prices from MEXC`);
        prices = mexcPrices;
      }
    } catch (error) {
      console.warn('⚠️ MEXC API failed, trying Binance fallback:', error instanceof Error ? error.message : String(error));
    }

    // Fallback to Binance
    if (prices.length === 0) {
      try {
        console.log('🔄 Fetching prices from Binance (fallback)...');
        const binancePrices = await this.fetchFromBinance();
        const hasUsdt = binancePrices.some(p => p.symbol === 'USDT');
        if (!hasUsdt) {
          binancePrices.push({ symbol: 'USDT', price: '1.00', change24h: '0.00', volume24h: '0' });
        }
        if (binancePrices.length > 0) {
          console.log(`✅ Successfully fetched ${binancePrices.length} prices from Binance`);
          prices = binancePrices;
        }
      } catch (error) {
        console.warn('⚠️ Binance API failed, trying CoinGecko fallback:', error instanceof Error ? error.message : String(error));
      }
    }

    // Fallback to CoinGecko
    if (prices.length === 0) {
      try {
        console.log('🔄 Fetching prices from CoinGecko (fallback)...');
        const coingeckoPrices = await this.fetchFromCoinGecko();
        console.log(`✅ Successfully fetched ${coingeckoPrices.length} prices from CoinGecko`);
        prices = coingeckoPrices;
      } catch (error) {
        console.error('❌ All price sources failed:', error);
        throw error;
      }
    }

    // Metal prices (gold always; plus any metal an admin added as a trading
    // pair — silver XAG, platinum XPT, palladium XPD) from gold-api.com
    // (free, no key) with a Yahoo Finance futures fallback.
    const metalsToFetch = Array.from(new Set(['XAU', ...this.activeSymbols.filter(s => METAL_SYMBOLS.has(s))]));
    const metalResults = await Promise.allSettled(metalsToFetch.map(m => this.fetchMetalPrice(m)));
    const fetchedMetals: string[] = [];
    for (const r of metalResults) {
      if (r.status === 'fulfilled' && r.value) {
        const mp = r.value;
        prices = prices.filter(p => p.symbol !== mp.symbol);
        prices.push(mp);
        fetchedMetals.push(`${mp.symbol} $${mp.price}`);
      }
    }
    if (fetchedMetals.length > 0) {
      console.log(`🥇 Metal prices appended: ${fetchedMetals.join(', ')}`);
    } else {
      console.warn('⚠️ Metal price fetch failed, metals will use stale cache or be absent');
    }

    // Append custom coin prices (trading pairs with admin-provided price API URLs)
    const customPrices = await this.fetchCustomPairPrices();
    for (const cp of customPrices) {
      prices = prices.filter(p => p.symbol !== cp.symbol);
      prices.push(cp);
    }
    if (customPrices.length > 0) {
      console.log(`🔧 Custom pair prices appended: ${customPrices.map(p => p.symbol).join(', ')}`);
    }

    return prices;
  }

  /**
   * Fetch prices for trading pairs with admin-configured custom API URLs.
   * Expected response format: { price: number, change24h?: number, volume24h?: number }
   */
  private async fetchCustomPairPrices(): Promise<CryptoPriceData[]> {
    try {
      const { data, error } = await supabase
        .from('trading_pairs')
        .select('base_asset, custom_api_url')
        .not('custom_api_url', 'is', null)
        .eq('is_enabled', true);

      if (error || !data || data.length === 0) return [];

      const results: CryptoPriceData[] = [];
      await Promise.allSettled(
        data.map(async (pair: { base_asset: string; custom_api_url: string }) => {
          try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 5000);
            const res = await fetch(pair.custom_api_url, {
              headers: { Accept: 'application/json' },
              signal: controller.signal,
            });
            clearTimeout(timer);
            if (!res.ok) return;
            const json = await res.json();
            const price = typeof json?.price === 'number' ? json.price : parseFloat(json?.price);
            if (!isNaN(price) && price > 0) {
              results.push({
                symbol: pair.base_asset.toUpperCase(),
                price: price.toString(),
                change24h: typeof json?.change24h === 'number' ? json.change24h.toFixed(2) : '0.00',
                volume24h: typeof json?.volume24h === 'number' ? json.volume24h.toFixed(0) : '0',
              });
            }
          } catch { /* skip failed endpoint */ }
        })
      );
      return results;
    } catch {
      return [];
    }
  }

  /**
   * Fetch prices from MEXC API (Binance-compatible format)
   */
  private async fetchFromMexc(): Promise<CryptoPriceData[]> {
    // MEXC bulk-fetches ALL tickers, so we can include every active symbol
    // (hardcoded + admin-added) — unknown ones are simply absent, never error.
    const mexcSymbols = this.getUsdtPairs(this.activeSymbols);
    // MEXC ticker/24hr supports multiple symbols via repeated symbol params or single request for all
    // Fetch all tickers at once (weight: 40) then filter
    const response = await axios.get(
      `https://api.mexc.com/api/v3/ticker/24hr`,
      {
        timeout: 10000,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Becxus/1.0'
        }
      }
    );

    const prices: CryptoPriceData[] = [];
    const symbolSet = new Set(mexcSymbols);

    if (Array.isArray(response.data)) {
      for (const ticker of response.data) {
        if (!symbolSet.has(ticker.symbol)) continue;
        const symbol = this.getSymbolFromBinanceTicker(ticker.symbol);
        if (symbol && ticker.lastPrice) {
          prices.push({
            symbol,
            price: ticker.lastPrice,
            change24h: ticker.priceChangePercent ? parseFloat(ticker.priceChangePercent).toFixed(2) : '0.00',
            volume24h: ticker.volume ? parseFloat(ticker.volume).toFixed(0) : '0'
          });
        }
      }
    }

    return prices;
  }

  /**
   * Fetch prices from Binance API
   */
  private async fetchFromBinance(): Promise<CryptoPriceData[]> {
    // Binance's ?symbols=[...] rejects the WHOLE batch if any symbol is
    // invalid, so this fallback requests only the known-valid hardcoded set.
    // Admin-added symbols are priced via MEXC (primary, above) and the
    // metal/custom-URL paths instead.
    const binanceSymbols = this.getUsdtPairs(SUPPORTED_CRYPTOS);
    const symbolsParam = JSON.stringify(binanceSymbols);
    const response = await axios.get(
      `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(symbolsParam)}`,
      {
        timeout: 10000,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Becxus/1.0'
        }
      }
    );

    const prices: CryptoPriceData[] = [];
    
    if (Array.isArray(response.data)) {
      for (const ticker of response.data) {
        const symbol = this.getSymbolFromBinanceTicker(ticker.symbol);
        if (symbol && ticker.lastPrice) {
          prices.push({
            symbol,
            price: ticker.lastPrice,
            change24h: ticker.priceChangePercent ? parseFloat(ticker.priceChangePercent).toFixed(2) : '0.00',
            volume24h: ticker.volume ? parseFloat(ticker.volume).toFixed(0) : '0'
          });
        }
      }
    }

    return prices;
  }

  /**
   * Fetch a precious-metal spot price — primary: gold-api.com (free, no key;
   * supports XAU/XAG/XPT/XPD), fallback: Yahoo Finance futures (GC=F, SI=F, …).
   */
  private async fetchMetalPrice(symbol: string): Promise<CryptoPriceData | null> {
    // Primary: gold-api.com
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`https://api.gold-api.com/price/${symbol}`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        if (typeof data?.price === 'number' && data.price > 0) {
          return {
            symbol,
            price: data.price.toString(),
            change24h: '0.00', // gold-api.com doesn't return 24h change
            volume24h: '0',
          };
        }
      }
    } catch {
      // fall through to Yahoo Finance
    }

    // Fallback: Yahoo Finance futures for this metal
    const future = METAL_YAHOO_FUTURES[symbol];
    if (!future) return null;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(
        `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(future)}&fields=regularMarketPrice,regularMarketChangePercent,regularMarketVolume`,
        { headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' }, signal: controller.signal }
      );
      clearTimeout(timer);
      if (!res.ok) return null;
      const data = await res.json();
      const r = data?.quoteResponse?.result?.[0];
      if (!r || typeof r.regularMarketPrice !== 'number' || r.regularMarketPrice <= 0) return null;
      return {
        symbol,
        price: r.regularMarketPrice.toString(),
        change24h: typeof r.regularMarketChangePercent === 'number' ? r.regularMarketChangePercent.toFixed(2) : '0.00',
        volume24h: typeof r.regularMarketVolume === 'number' ? r.regularMarketVolume.toFixed(0) : '0',
      };
    } catch {
      return null;
    }
  }

  /**
   * Fetch prices from CoinGecko API
   */
  private async fetchFromCoinGecko(): Promise<CryptoPriceData[]> {
    const response = await axios.get(
      `https://api.coingecko.com/api/v3/simple/price?ids=${this.getCoinGeckoIds()}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`,
      {
        timeout: 10000,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Becxus/1.0'
        }
      }
    );

    const prices: CryptoPriceData[] = [];
    
    for (const [coinId, data] of Object.entries(response.data)) {
      const symbol = this.getSymbolFromCoinId(coinId);
      const coinData = data as any;
      if (symbol && coinData.usd) {
        prices.push({
          symbol,
          price: coinData.usd.toString(),
          change24h: coinData.usd_24h_change ? coinData.usd_24h_change.toFixed(2) : '0.00',
          volume24h: coinData.usd_24h_vol ? coinData.usd_24h_vol.toFixed(0) : '0'
        });
      }
    }

    return prices;
  }

  /**
   * Get CoinGecko coin IDs for supported cryptocurrencies
   */
  private getCoinGeckoIds(): string {
    const coinMap: { [key: string]: string } = {
      'BTC': 'bitcoin',
      'ETH': 'ethereum',
      'USDT': 'tether',
      'BNB': 'binancecoin',
      'XRP': 'ripple',
      'ADA': 'cardano',
      'DOGE': 'dogecoin',
      'MATIC': 'matic-network',
      'DOT': 'polkadot',
      'LTC': 'litecoin',
      'BCH': 'bitcoin-cash',
      'LINK': 'chainlink',
      'UNI': 'uniswap',
      'ATOM': 'cosmos',
      'ETC': 'ethereum-classic',
      'XLM': 'stellar',
      'TRX': 'tron',
      'XMR': 'monero',
      'EOS': 'eos',
      'FIL': 'filecoin',
      'VET': 'vechain',
      'THETA': 'theta-token',
      'AAVE': 'aave',
      'ALGO': 'algorand',
      'AVAX': 'avalanche-2',
      'SOL': 'solana',
      'SHIB': 'shiba-inu',
      'APT': 'aptos',
      'SUI': 'sui',
      'ARB': 'arbitrum',
      'OP': 'optimism',
      'PEPE': 'pepe',
      'INJ': 'injective-protocol',
      'DASH': 'dash'
    };

    return SUPPORTED_CRYPTOS.map(symbol => coinMap[symbol]).filter(Boolean).join(',');
  }

  /**
   * Get symbol from CoinGecko coin ID
   */
  private getSymbolFromCoinId(coinId: string): string | null {
    const reverseMap: { [key: string]: string } = {
      'bitcoin': 'BTC',
      'ethereum': 'ETH',
      'tether': 'USDT',
      'binancecoin': 'BNB',
      'ripple': 'XRP',
      'cardano': 'ADA',
      'dogecoin': 'DOGE',
      'matic-network': 'MATIC',
      'polkadot': 'DOT',
      'litecoin': 'LTC',
      'bitcoin-cash': 'BCH',
      'chainlink': 'LINK',
      'uniswap': 'UNI',
      'cosmos': 'ATOM',
      'ethereum-classic': 'ETC',
      'stellar': 'XLM',
      'tron': 'TRX',
      'monero': 'XMR',
      'eos': 'EOS',
      'filecoin': 'FIL',
      'vechain': 'VET',
      'theta-token': 'THETA',
      'aave': 'AAVE',
      'algorand': 'ALGO',
      'avalanche-2': 'AVAX',
      'solana': 'SOL',
      'shiba-inu': 'SHIB',
      'aptos': 'APT',
      'sui': 'SUI',
      'arbitrum': 'ARB',
      'optimism': 'OP',
      'pepe': 'PEPE',
      'injective-protocol': 'INJ',
      'dash': 'DASH'
    };

    return reverseMap[coinId] || null;
  }

  /**
   * Build {BASE}USDT exchange tickers for the given symbols. The exchange
   * pair for any asset is just its symbol followed by USDT — so this works
   * for arbitrary admin-added symbols, no per-symbol map needed. Excludes
   * USDT itself (no USDTUSDT pair) and metals (priced from gold-api.com).
   */
  private getUsdtPairs(symbols: string[]): string[] {
    return symbols
      .filter(s => s && s !== 'USDT' && !METAL_SYMBOLS.has(s))
      .map(s => `${s}USDT`);
  }

  /**
   * Reverse a {BASE}USDT exchange ticker back to its base symbol. Generic
   * (strips the trailing USDT) — safe because callers only pass tickers that
   * matched our own {BASE}USDT request set.
   */
  private getSymbolFromBinanceTicker(tickerSymbol: string): string | null {
    if (tickerSymbol && tickerSymbol.endsWith('USDT') && tickerSymbol.length > 4) {
      return tickerSymbol.slice(0, -4);
    }
    return null;
  }

  /**
   * Check if database connection is healthy
   */
  private async checkDbHealth(): Promise<boolean> {
    const now = Date.now();
    if (now - lastDbCheckTime < DB_HEALTH_CHECK_INTERVAL && !dbConnectionHealthy) {
      return false; // Skip check if we recently failed
    }
    
    try {
      const { error } = await supabase
        .from('crypto_prices')
        .select('symbol')
        .limit(1);
      
      dbConnectionHealthy = !error;
      lastDbCheckTime = now;
      
      if (error) {
        console.warn('⚠️ Database health check failed, using in-memory cache');
      } else if (!dbConnectionHealthy) {
        console.log('✅ Database connection restored');
      }
      
      return dbConnectionHealthy;
    } catch {
      dbConnectionHealthy = false;
      lastDbCheckTime = now;
      return false;
    }
  }

  /**
   * Update crypto prices in database
   */
  private async updateDatabasePrices(prices: CryptoPriceData[]): Promise<void> {
    // Always update in-memory cache
    inMemoryPriceCache = prices;
    
    // Try to write to Redis as intermediate cache
    try {
      if (isRedisConnected()) {
        await redisSetJSON(REDIS_KEYS.PRICES, prices, REDIS_SERVICE_PRICES_TTL);
        console.log('[Redis:Crypto] Service cached prices with TTL', REDIS_SERVICE_PRICES_TTL);
      }
    } catch (redisError) {
      console.warn('[Redis:Crypto] Service write error:', (redisError as Error).message);
    }
    
    // Check database health before attempting writes
    const isDbHealthy = await this.checkDbHealth();
    if (!isDbHealthy) {
      return; // Skip database writes, use in-memory cache
    }

    try {
      // Batch upsert for better performance
      const { error } = await supabase
        .from('crypto_prices')
        .upsert(
          prices.map(priceData => ({
            symbol: priceData.symbol,
            price: priceData.price,
            change24h: priceData.change24h,
            volume24h: priceData.volume24h,
            updated_at: new Date().toISOString()
          })),
          { onConflict: 'symbol' }
        );

      if (error) {
        console.warn('⚠️ Failed to update prices in database:', error.message);
        dbConnectionHealthy = false;
      }
    } catch (error) {
      console.warn('⚠️ Database connection error, using in-memory cache');
      dbConnectionHealthy = false;
    }
  }

  /**
   * Get current crypto prices (from cache or live)
   */
  public async getCurrentPrices(): Promise<CryptoPriceData[]> {
    const now = new Date();
    
    // Check if we need to update prices
    if (now.getTime() - this.lastUpdate.getTime() > this.updateInterval) {
      try {
        console.log('🔄 Fetching live crypto prices...');
        const livePrices = await this.fetchLivePrices();
        await this.updateDatabasePrices(livePrices);
        this.lastUpdate = now;
        console.log(`✅ Updated ${livePrices.length} crypto prices`);
        return livePrices;
      } catch (error) {
        console.warn('⚠️ Failed to fetch live prices, using cached data');
      }
    }

    // If database is unhealthy, try Redis first, then fall back to in-memory cache
    if (!dbConnectionHealthy) {
      // Try Redis first
      try {
        if (isRedisConnected()) {
          const redisPrices = await redisGetJSON<CryptoPriceData[]>(REDIS_KEYS.PRICES);
          if (redisPrices && redisPrices.length > 0) {
            console.log('[Redis:Crypto] Service fallback cache HIT');
            return redisPrices;
          }
        }
      } catch (redisError) {
        console.warn('[Redis:Crypto] Service read error:', (redisError as Error).message);
      }
      
      // Fall back to in-memory cache
      if (inMemoryPriceCache.length > 0) {
        return inMemoryPriceCache;
      }
    }

    // Try to get cached data from database
    try {
      const { data: cachedPrices, error } = await supabase
        .from('crypto_prices')
        .select('*')
        .order('symbol');

      if (error) {
        console.warn('⚠️ Error fetching cached prices from DB, trying Redis then in-memory cache');
        dbConnectionHealthy = false;
        
        // Try Redis first
        try {
          if (isRedisConnected()) {
            const redisPrices = await redisGetJSON<CryptoPriceData[]>(REDIS_KEYS.PRICES);
            if (redisPrices && redisPrices.length > 0) {
              console.log('[Redis:Crypto] Service fallback cache HIT after DB error');
              return redisPrices;
            }
          }
        } catch (redisError) {
          console.warn('[Redis:Crypto] Service read error:', (redisError as Error).message);
        }
        
        return inMemoryPriceCache;
      }

      dbConnectionHealthy = true;
      return cachedPrices.map(price => ({
        symbol: price.symbol,
        price: price.price,
        change24h: price.change24h,
        volume24h: price.volume24h
      }));
    } catch {
      dbConnectionHealthy = false;
      
      // Try Redis first
      try {
        if (isRedisConnected()) {
          const redisPrices = await redisGetJSON<CryptoPriceData[]>(REDIS_KEYS.PRICES);
          if (redisPrices && redisPrices.length > 0) {
            console.log('[Redis:Crypto] Service fallback cache HIT after exception');
            return redisPrices;
          }
        }
      } catch (redisError) {
        console.warn('[Redis:Crypto] Service read error:', (redisError as Error).message);
      }
      
      return inMemoryPriceCache;
    }
  }

  /**
   * Initialize crypto prices table with supported cryptocurrencies
   */
  public async initializeCryptoTable(): Promise<void> {
    try {
      console.log('🔧 Initializing crypto prices table...');
      
      // Check database health first
      const isDbHealthy = await this.checkDbHealth();
      if (!isDbHealthy) {
        console.warn('⚠️ Database unavailable, skipping table initialization. Will use in-memory cache.');
        // Initialize in-memory cache with default values
        inMemoryPriceCache = SUPPORTED_CRYPTOS.map(symbol => ({
          symbol,
          price: '0',
          change24h: '0.00',
          volume24h: '0'
        }));
        return;
      }
      
      // Insert initial records for all supported cryptos
      const initialData = SUPPORTED_CRYPTOS.map(symbol => ({
        symbol,
        price: '0',
        change24h: '0.00',
        volume24h: '0',
        updated_at: new Date().toISOString()
      }));

      const { error } = await supabase
        .from('crypto_prices')
        .upsert(initialData, {
          onConflict: 'symbol',
          ignoreDuplicates: false
        });

      if (error) {
        console.warn('⚠️ Error initializing crypto table:', error.message);
        dbConnectionHealthy = false;
      } else {
        console.log(`✅ Initialized ${SUPPORTED_CRYPTOS.length} crypto records`);
      }
    } catch (error) {
      console.warn('⚠️ Database unavailable for initialization, using in-memory cache');
      dbConnectionHealthy = false;
      // Initialize in-memory cache
      inMemoryPriceCache = SUPPORTED_CRYPTOS.map(symbol => ({
        symbol,
        price: '0',
        change24h: '0.00',
        volume24h: '0'
      }));
    }
  }

  /**
   * Start automatic price updates
   */
  public startAutoUpdate(): void {
    console.log('🚀 Starting automatic crypto price updates...');
    
    // Initial update
    this.getCurrentPrices();
    
    // Set up periodic updates
    setInterval(async () => {
      try {
        await this.getCurrentPrices();
      } catch (error) {
        // Silently handle — prices will use cached data
        console.warn('⚠️ Price update failed, will retry next cycle');
      }
    }, this.updateInterval);
  }
}

export default LiveCryptoService; 