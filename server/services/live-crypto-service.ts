import axios from 'axios';
import supabase from '../supabaseClient';

// In-memory cache for prices when database is unavailable
let inMemoryPriceCache: CryptoPriceData[] = [];
let dbConnectionHealthy = true;
let lastDbCheckTime = 0;
const DB_HEALTH_CHECK_INTERVAL = 60000; // 1 minute

// Supported cryptocurrencies
const SUPPORTED_CRYPTOS = [
  'BTC', 'ETH', 'USDT', 'BNB', 'XRP', 'ADA', 'DOGE', 'MATIC', 
  'DOT', 'LTC', 'BCH', 'LINK', 'UNI', 'ATOM', 'ETC', 'XLM',
  'TRX', 'XMR', 'EOS', 'FIL', 'VET', 'THETA', 'AAVE', 'ALGO',
  'AVAX', 'SOL', 'SHIB', 'APT', 'SUI', 'ARB', 'OP', 'PEPE', 'INJ', 'DASH'
];

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

  public static getInstance(): LiveCryptoService {
    if (!LiveCryptoService.instance) {
      LiveCryptoService.instance = new LiveCryptoService();
    }
    return LiveCryptoService.instance;
  }

  /**
   * Fetch live crypto prices with dual mechanism: Binance first, then CoinGecko fallback
   */
  private async fetchLivePrices(): Promise<CryptoPriceData[]> {
    // Try Binance first
    try {
      console.log('🔄 Fetching prices from Binance...');
      const binancePrices = await this.fetchFromBinance();
      // Always add USDT as $1.00 (no Binance pair for it)
      const hasUsdt = binancePrices.some(p => p.symbol === 'USDT');
      if (!hasUsdt) {
        binancePrices.push({ symbol: 'USDT', price: '1.00', change24h: '0.00', volume24h: '0' });
      }
      if (binancePrices.length > 0) {
        console.log(`✅ Successfully fetched ${binancePrices.length} prices from Binance`);
        return binancePrices;
      }
    } catch (error) {
      console.warn('⚠️ Binance API failed, trying CoinGecko fallback:', error instanceof Error ? error.message : String(error));
    }

    // Fallback to CoinGecko
    try {
      console.log('🔄 Fetching prices from CoinGecko (fallback)...');
      const coingeckoPrices = await this.fetchFromCoinGecko();
      console.log(`✅ Successfully fetched ${coingeckoPrices.length} prices from CoinGecko`);
      return coingeckoPrices;
    } catch (error) {
      console.error('❌ Both Binance and CoinGecko failed:', error);
      throw error;
    }
  }

  /**
   * Fetch prices from Binance API
   */
  private async fetchFromBinance(): Promise<CryptoPriceData[]> {
    const binanceSymbols = this.getBinanceSymbols();
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
      'algorand': 'ALGO'
    };

    return reverseMap[coinId] || null;
  }

  /**
   * Get Binance symbols for supported cryptocurrencies
   */
  private getBinanceSymbols(): string[] {
    const binanceMap: { [key: string]: string } = {
      'BTC': 'BTCUSDT',
      'ETH': 'ETHUSDT',
      // USDT is always 1.00 — no Binance pair exists for USDTUSDT
      'BNB': 'BNBUSDT',
      'XRP': 'XRPUSDT',
      'ADA': 'ADAUSDT',
      'DOGE': 'DOGEUSDT',
      'MATIC': 'MATICUSDT',
      'DOT': 'DOTUSDT',
      'LTC': 'LTCUSDT',
      'BCH': 'BCHUSDT',
      'LINK': 'LINKUSDT',
      'UNI': 'UNIUSDT',
      'ATOM': 'ATOMUSDT',
      'ETC': 'ETCUSDT',
      'XLM': 'XLMUSDT',
      'TRX': 'TRXUSDT',
      'XMR': 'XMRUSDT',
      'EOS': 'EOSUSDT',
      'FIL': 'FILUSDT',
      'VET': 'VETUSDT',
      'THETA': 'THETAUSDT',
      'AAVE': 'AAVEUSDT',
      'ALGO': 'ALGOUSDT',
      'AVAX': 'AVAXUSDT',
      'SOL': 'SOLUSDT',
      'SHIB': 'SHIBUSDT',
      'APT': 'APTUSDT',
      'SUI': 'SUIUSDT',
      'ARB': 'ARBUSDT',
      'OP': 'OPUSDT',
      'PEPE': 'PEPEUSDT',
      'INJ': 'INJUSDT',
      'DASH': 'DASHUSDT'
    };

    return SUPPORTED_CRYPTOS.map(symbol => binanceMap[symbol]).filter(Boolean);
  }

  /**
   * Get symbol from Binance ticker symbol
   */
  private getSymbolFromBinanceTicker(tickerSymbol: string): string | null {
    const reverseMap: { [key: string]: string } = {
      'BTCUSDT': 'BTC',
      'ETHUSDT': 'ETH',
      'BNBUSDT': 'BNB',
      'XRPUSDT': 'XRP',
      'ADAUSDT': 'ADA',
      'DOGEUSDT': 'DOGE',
      'MATICUSDT': 'MATIC',
      'DOTUSDT': 'DOT',
      'LTCUSDT': 'LTC',
      'BCHUSDT': 'BCH',
      'LINKUSDT': 'LINK',
      'UNIUSDT': 'UNI',
      'ATOMUSDT': 'ATOM',
      'ETCUSDT': 'ETC',
      'XLMUSDT': 'XLM',
      'TRXUSDT': 'TRX',
      'XMRUSDT': 'XMR',
      'EOSUSDT': 'EOS',
      'FILUSDT': 'FIL',
      'VETUSDT': 'VET',
      'THETAUSDT': 'THETA',
      'AAVEUSDT': 'AAVE',
      'ALGOUSDT': 'ALGO'
    };

    return reverseMap[tickerSymbol] || null;
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

    // If database is unhealthy, return in-memory cache
    if (!dbConnectionHealthy && inMemoryPriceCache.length > 0) {
      return inMemoryPriceCache;
    }

    // Try to get cached data from database
    try {
      const { data: cachedPrices, error } = await supabase
        .from('crypto_prices')
        .select('*')
        .order('symbol');

      if (error) {
        console.warn('⚠️ Error fetching cached prices from DB, using in-memory cache');
        dbConnectionHealthy = false;
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