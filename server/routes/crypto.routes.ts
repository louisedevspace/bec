import type { Express } from "express";
import { requireAuth, requireAdmin, supabaseAdmin } from "./middleware";
import LiveCryptoService from "../services/live-crypto-service";
import { redisGetJSON, redisSetJSON, isRedisConnected, REDIS_KEYS } from "../utils/redis";

// In-memory cache for crypto prices (fallback when Redis unavailable)
let pricesCache: any = null;
let pricesCacheTime = 0;
const CACHE_DURATION = 30000; // 30 seconds
const REDIS_PRICES_TTL = 30; // 30 seconds for Redis

// In-memory cache for price history (candlestick data) - fallback when Redis unavailable
const priceHistoryCache = new Map<string, { data: any; time: number }>();
const HISTORY_CACHE_DURATION = 60000; // 60 seconds
const REDIS_HISTORY_TTL = 60; // 60 seconds for Redis

export default function registerCryptoRoutes(app: Express) {
  // Get all crypto prices with caching
  app.get("/api/crypto/prices", async (req, res) => {
    try {
      const now = Date.now();
      
      // Try Redis first
      try {
        if (isRedisConnected()) {
          const redisPrices = await redisGetJSON<any>(REDIS_KEYS.PRICES);
          if (redisPrices) {
            console.log('[Redis:Crypto] Cache HIT for prices');
            res.setHeader('X-Cache', 'HIT');
            res.setHeader('X-Cache-Source', 'redis');
            return res.json(redisPrices);
          }
        }
      } catch (redisError) {
        console.warn('[Redis:Crypto] Read error, falling back to memory:', (redisError as Error).message);
      }
      
      // Check in-memory cache (fallback)
      if (pricesCache && (now - pricesCacheTime) < CACHE_DURATION) {
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('X-Cache-Source', 'memory');
        return res.json(pricesCache);
      }

      // Fetch fresh data
      const cryptoService = LiveCryptoService.getInstance();
      const prices = await cryptoService.getCurrentPrices();
      
      // Update in-memory cache
      pricesCache = prices;
      pricesCacheTime = now;
      
      // Try to store in Redis
      try {
        if (isRedisConnected()) {
          await redisSetJSON(REDIS_KEYS.PRICES, prices, REDIS_PRICES_TTL);
          console.log('[Redis:Crypto] Cached prices with TTL', REDIS_PRICES_TTL);
        }
      } catch (redisError) {
        console.warn('[Redis:Crypto] Write error:', (redisError as Error).message);
      }
      
      res.setHeader('X-Cache', 'MISS');
      res.setHeader('Cache-Control', 'public, max-age=30');
      res.json(prices);
    } catch (error) {
      console.error("Error fetching crypto prices:", (error as Error).message);
      // Return stale cache on error if available
      if (pricesCache) {
        res.setHeader('X-Cache', 'STALE');
        return res.json(pricesCache);
      }
      res.status(500).json({ message: "Failed to fetch crypto prices" });
    }
  });

  // Get specific crypto price with caching
  app.get("/api/crypto/prices/:symbol", async (req, res) => {
    try {
      const { symbol } = req.params;
      const now = Date.now();
      
      // Try Redis first
      try {
        if (isRedisConnected()) {
          const redisPrices = await redisGetJSON<any[]>(REDIS_KEYS.PRICES);
          if (redisPrices) {
            const price = redisPrices.find((p: any) => p.symbol === symbol.toUpperCase());
            if (price) {
              console.log('[Redis:Crypto] Cache HIT for price:', symbol);
              res.setHeader('X-Cache', 'HIT');
              res.setHeader('X-Cache-Source', 'redis');
              return res.json(price);
            }
          }
        }
      } catch (redisError) {
        console.warn('[Redis:Crypto] Read error for symbol, falling back to memory:', (redisError as Error).message);
      }
      
      // Use in-memory cache if available (fallback)
      if (pricesCache && (now - pricesCacheTime) < CACHE_DURATION) {
        const price = pricesCache.find((p: any) => p.symbol === symbol.toUpperCase());
        if (price) {
          res.setHeader('X-Cache', 'HIT');
          res.setHeader('X-Cache-Source', 'memory');
          return res.json(price);
        }
      }

      // Fetch fresh data
      const cryptoService = LiveCryptoService.getInstance();
      const prices = await cryptoService.getCurrentPrices();
      pricesCache = prices;
      pricesCacheTime = now;
      
      // Try to store in Redis
      try {
        if (isRedisConnected()) {
          await redisSetJSON(REDIS_KEYS.PRICES, prices, REDIS_PRICES_TTL);
        }
      } catch (redisError) {
        console.warn('[Redis:Crypto] Write error:', (redisError as Error).message);
      }
      
      const price = prices.find(p => p.symbol === symbol.toUpperCase());
      if (!price) {
        return res.status(404).json({ message: "Crypto not found" });
      }
      
      res.setHeader('X-Cache', 'MISS');
      res.setHeader('Cache-Control', 'public, max-age=30');
      res.json(price);
    } catch (error) {
      console.error("Error fetching specific crypto price:", (error as Error).message);
      res.status(500).json({ message: "Failed to fetch crypto price" });
    }
  });

  // Get crypto logos (batch)
  app.get("/api/crypto/logos", async (req, res) => {
    try {
      const symbols = req.query.symbols as string;
      if (!symbols) {
        return res.status(400).json({ message: "Symbols parameter is required" });
      }

      const symbolArray = symbols.split(',').map(s => s.trim().toUpperCase());

      // Try to get logos from database first
      try {
        const { data: dbLogos, error: dbError } = await supabaseAdmin
          .from('crypto_logos')
          .select('symbol, logo_url, homepage_url')
          .in('symbol', symbolArray);

        if (!dbError && dbLogos && dbLogos.length > 0) {
          const logoMap: Record<string, { logo: string; homepage: string }> = {};
          dbLogos.forEach((logo: any) => {
            logoMap[logo.symbol] = {
              logo: logo.logo_url,
              homepage: logo.homepage_url || ''
            };
          });
          return res.json(logoMap);
        }
      } catch (dbError) {
        console.warn('Database logos not available, falling back to external service:', dbError);
      }

      // Fallback to external service
      const LogoService = (await import('../services/logo-service')).default;
      const logoService = LogoService.getInstance();

      const logos = await logoService.getLogos(symbolArray);
      res.json(logos);
    } catch (error) {
      console.error("Error fetching logos:", (error as Error).message);
      res.status(500).json({ message: "Failed to fetch logos" });
    }
  });

  // Get single crypto logo
  app.get("/api/crypto/logos/:symbol", async (req, res) => {
    try {
      const symbol = req.params.symbol.toUpperCase();
      const LogoService = (await import('../services/logo-service')).default;
      const logoService = LogoService.getInstance();

      const logo = await logoService.getLogo(symbol);
      if (logo) {
        res.json(logo);
      } else {
        res.status(404).json({ message: "Logo not found" });
      }
    } catch (error) {
      console.error("Error fetching logo:", (error as Error).message);
      res.status(500).json({ message: "Failed to fetch logo" });
    }
  });

  // Get price history (candlestick/kline data) for charts
  app.get("/api/crypto/price-history/:symbol", async (req, res) => {
    try {
      const symbol = req.params.symbol.toUpperCase();
      const interval = (req.query.interval as string) || "1h";
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);

      const validIntervals = ["1m", "5m", "15m", "1h", "4h", "1d", "1w"];
      if (!validIntervals.includes(interval)) {
        return res.status(400).json({ message: "Invalid interval. Use: " + validIntervals.join(", ") });
      }

      const cacheKey = `${symbol}_${interval}_${limit}`;
      const redisKey = `${REDIS_KEYS.PRICE_HISTORY}${symbol}:${interval}:${limit}`;
      const now = Date.now();
      
      // Try Redis first
      try {
        if (isRedisConnected()) {
          const redisHistory = await redisGetJSON<any[]>(redisKey);
          if (redisHistory) {
            console.log('[Redis:Crypto] Cache HIT for price history:', symbol, interval);
            res.setHeader("X-Cache", "HIT");
            res.setHeader("X-Cache-Source", "redis");
            return res.json(redisHistory);
          }
        }
      } catch (redisError) {
        console.warn('[Redis:Crypto] Read error for history, falling back to memory:', (redisError as Error).message);
      }
      
      // Check in-memory cache (fallback)
      const cached = priceHistoryCache.get(cacheKey);
      if (cached && (now - cached.time) < HISTORY_CACHE_DURATION) {
        res.setHeader("X-Cache", "HIT");
        res.setHeader("X-Cache-Source", "memory");
        return res.json(cached.data);
      }

      // Try CoinCap candles API first (free, no key, fast)
      let candles: any[] = [];
      try {
        const COINCAP_MAP: Record<string, string> = {
          BTC: 'bitcoin', ETH: 'ethereum', BNB: 'binance-coin', SOL: 'solana',
          XRP: 'xrp', ADA: 'cardano', DOT: 'polkadot', DOGE: 'dogecoin',
          AVAX: 'avalanche', LINK: 'chainlink', LTC: 'litecoin', MATIC: 'polygon',
          ATOM: 'cosmos', TRX: 'tron', SHIB: 'shiba-inu', BCH: 'bitcoin-cash',
          DASH: 'dash', XMR: 'monero', XLM: 'stellar', FIL: 'filecoin',
          APT: 'aptos', SUI: 'sui', ARB: 'arbitrum', OP: 'optimism',
          PEPE: 'pepe', INJ: 'injective-protocol',
        };
        const COINCAP_INTERVALS: Record<string, string> = {
          '1m': 'm1', '5m': 'm5', '15m': 'm15', '1h': 'h1',
          '4h': 'h4', '1d': 'd1', '1w': 'w1',
        };
        const INTERVAL_MS: Record<string, number> = {
          '1m': 60000, '5m': 300000, '15m': 900000, '1h': 3600000,
          '4h': 14400000, '1d': 86400000, '1w': 604800000,
        };

        const baseId = COINCAP_MAP[symbol];
        const ccInterval = COINCAP_INTERVALS[interval];
        if (baseId && ccInterval) {
          const end = Date.now();
          const start = end - (limit * (INTERVAL_MS[interval] || 3600000));
          const coinCapUrl = `https://api.coincap.io/v2/candles?exchange=binance&interval=${ccInterval}&baseId=${baseId}&quoteId=tether&start=${start}&end=${end}`;
          const coinCapRes = await fetch(coinCapUrl);
          if (coinCapRes.ok) {
            const json = await coinCapRes.json();
            if (json.data && Array.isArray(json.data) && json.data.length > 0) {
              candles = json.data.map((k: any) => ({
                time: k.period,
                open: parseFloat(k.open),
                high: parseFloat(k.high),
                low: parseFloat(k.low),
                close: parseFloat(k.close),
                volume: parseFloat(k.volume),
              }));
            }
          }
        }
      } catch (e) {
        console.warn("CoinCap candles failed for", symbol, (e as Error).message);
      }

      // Fallback: try Binance klines API
      if (candles.length === 0) {
        try {
          const binanceUrl = `https://api.binance.com/api/v3/klines?symbol=${symbol}USDT&interval=${interval}&limit=${limit}`;
          const binanceRes = await fetch(binanceUrl);
          if (binanceRes.ok) {
            const raw = await binanceRes.json();
            candles = raw.map((k: any[]) => ({
              time: k[0],
              open: parseFloat(k[1]),
              high: parseFloat(k[2]),
              low: parseFloat(k[3]),
              close: parseFloat(k[4]),
              volume: parseFloat(k[5]),
            }));
          }
        } catch (e) {
          console.warn("Binance klines failed for", symbol, (e as Error).message);
        }
      }

      // Fallback: generate synthetic candles from current price if Binance fails
      if (candles.length === 0) {
        try {
          const cryptoService = LiveCryptoService.getInstance();
          const prices = await cryptoService.getCurrentPrices();
          const priceData = prices.find((p: any) => p.symbol === symbol);
          if (priceData) {
            const basePrice = parseFloat(priceData.price || "0");
            const intervalMs: Record<string, number> = {
              "1m": 60000, "5m": 300000, "15m": 900000, "1h": 3600000,
              "4h": 14400000, "1d": 86400000, "1w": 604800000,
            };
            const step = intervalMs[interval] || 3600000;
            for (let i = limit - 1; i >= 0; i--) {
              const t = now - i * step;
              const drift = (Math.random() - 0.5) * 0.02 * basePrice;
              const open = basePrice + drift;
              const close = open + (Math.random() - 0.5) * 0.01 * basePrice;
              const high = Math.max(open, close) + Math.random() * 0.005 * basePrice;
              const low = Math.min(open, close) - Math.random() * 0.005 * basePrice;
              candles.push({ time: t, open, high, low, close, volume: Math.random() * 1000 });
            }
          }
        } catch (fallbackErr) {
          console.warn("Synthetic candle generation failed:", (fallbackErr as Error).message);
        }
      }

      if (candles.length === 0) {
        return res.status(404).json({ message: "No price history available for " + symbol });
      }

      // Update in-memory cache
      priceHistoryCache.set(cacheKey, { data: candles, time: now });
      
      // Try to store in Redis
      try {
        if (isRedisConnected()) {
          await redisSetJSON(redisKey, candles, REDIS_HISTORY_TTL);
          console.log('[Redis:Crypto] Cached price history with TTL', REDIS_HISTORY_TTL, 'for', symbol, interval);
        }
      } catch (redisError) {
        console.warn('[Redis:Crypto] Write error for history:', (redisError as Error).message);
      }
      
      res.setHeader("X-Cache", "MISS");
      res.setHeader("Cache-Control", "public, max-age=60");
      res.json(candles);
    } catch (error) {
      console.error("Error fetching price history:", (error as Error).message);
      res.status(500).json({ message: "Failed to fetch price history" });
    }
  });

  // Initialize crypto logos in database (admin only)
  app.post("/api/crypto/logos/init", requireAuth, requireAdmin, async (req, res) => {
    try {
      const cryptoLogos = [
        { symbol: 'BTC', name: 'Bitcoin', logo_url: 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png', homepage_url: 'https://bitcoin.org', coingecko_id: 'bitcoin' },
        { symbol: 'ETH', name: 'Ethereum', logo_url: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png', homepage_url: 'https://ethereum.org', coingecko_id: 'ethereum' },
        { symbol: 'USDT', name: 'Tether', logo_url: 'https://assets.coingecko.com/coins/images/325/large/Tether.png', homepage_url: 'https://tether.to', coingecko_id: 'tether' },
        { symbol: 'BNB', name: 'BNB', logo_url: 'https://assets.coingecko.com/coins/images/825/large/bnb-icon2_2x.png', homepage_url: 'https://www.bnbchain.org', coingecko_id: 'binancecoin' },
        { symbol: 'TRX', name: 'TRON', logo_url: 'https://assets.coingecko.com/coins/images/1094/large/tron-logo.png', homepage_url: 'https://tron.network', coingecko_id: 'tron' },
        { symbol: 'DOGE', name: 'Dogecoin', logo_url: 'https://assets.coingecko.com/coins/images/5/large/dogecoin.png', homepage_url: 'https://dogecoin.com', coingecko_id: 'dogecoin' },
        { symbol: 'BCH', name: 'Bitcoin Cash', logo_url: 'https://assets.coingecko.com/coins/images/780/large/bitcoin-cash.png', homepage_url: 'https://www.bitcoincash.org', coingecko_id: 'bitcoin-cash' },
        { symbol: 'DASH', name: 'Dash', logo_url: 'https://assets.coingecko.com/coins/images/19/large/dash-logo.png', homepage_url: 'https://www.dash.org', coingecko_id: 'dash' },
        { symbol: 'DOT', name: 'Polkadot', logo_url: 'https://assets.coingecko.com/coins/images/12171/large/polkadot.png', homepage_url: 'https://polkadot.network', coingecko_id: 'polkadot' },
        { symbol: 'LTC', name: 'Litecoin', logo_url: 'https://assets.coingecko.com/coins/images/2/large/litecoin.png', homepage_url: 'https://litecoin.org', coingecko_id: 'litecoin' },
        { symbol: 'XRP', name: 'XRP', logo_url: 'https://assets.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png', homepage_url: 'https://xrp.com', coingecko_id: 'ripple' },
        { symbol: 'ADA', name: 'Cardano', logo_url: 'https://assets.coingecko.com/coins/images/975/large/cardano.png', homepage_url: 'https://cardano.org', coingecko_id: 'cardano' },
        { symbol: 'SOL', name: 'Solana', logo_url: 'https://assets.coingecko.com/coins/images/4128/large/solana.png', homepage_url: 'https://solana.com', coingecko_id: 'solana' },
        { symbol: 'AVAX', name: 'Avalanche', logo_url: 'https://assets.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png', homepage_url: 'https://www.avax.network', coingecko_id: 'avalanche-2' },
        { symbol: 'MATIC', name: 'Polygon', logo_url: 'https://assets.coingecko.com/coins/images/4713/large/matic-token-icon.png', homepage_url: 'https://polygon.technology', coingecko_id: 'matic-network' },
        { symbol: 'SHIB', name: 'Shiba Inu', logo_url: 'https://assets.coingecko.com/coins/images/11939/large/shiba.png', homepage_url: 'https://shibatoken.com', coingecko_id: 'shiba-inu' },
        { symbol: 'LINK', name: 'Chainlink', logo_url: 'https://assets.coingecko.com/coins/images/877/large/chainlink-new-logo.png', homepage_url: 'https://chain.link', coingecko_id: 'chainlink' },
        { symbol: 'XMR', name: 'Monero', logo_url: 'https://assets.coingecko.com/coins/images/69/large/monero_logo.png', homepage_url: 'https://www.getmonero.org', coingecko_id: 'monero' },
        { symbol: 'XLM', name: 'Stellar', logo_url: 'https://assets.coingecko.com/coins/images/100/large/Stellar_symbol_black_RGB.png', homepage_url: 'https://stellar.org', coingecko_id: 'stellar' },
        { symbol: 'ATOM', name: 'Cosmos', logo_url: 'https://assets.coingecko.com/coins/images/1481/large/cosmos_hub.png', homepage_url: 'https://cosmos.network', coingecko_id: 'cosmos' },
        { symbol: 'FIL', name: 'Filecoin', logo_url: 'https://assets.coingecko.com/coins/images/12817/large/filecoin.png', homepage_url: 'https://filecoin.io', coingecko_id: 'filecoin' },
        { symbol: 'APT', name: 'Aptos', logo_url: 'https://assets.coingecko.com/coins/images/26455/large/aptos_round.png', homepage_url: 'https://aptoslabs.com', coingecko_id: 'aptos' },
        { symbol: 'SUI', name: 'Sui', logo_url: 'https://assets.coingecko.com/coins/images/26375/large/sui_asset.jpeg', homepage_url: 'https://sui.io', coingecko_id: 'sui' },
        { symbol: 'ARB', name: 'Arbitrum', logo_url: 'https://assets.coingecko.com/coins/images/16547/large/photo_2023-03-29_21.47.00.jpeg', homepage_url: 'https://arbitrum.io', coingecko_id: 'arbitrum' },
        { symbol: 'OP', name: 'Optimism', logo_url: 'https://assets.coingecko.com/coins/images/25244/large/Optimism.png', homepage_url: 'https://optimism.io', coingecko_id: 'optimism' },
        { symbol: 'PEPE', name: 'Pepe', logo_url: 'https://assets.coingecko.com/coins/images/29850/large/pepe-token.jpeg', homepage_url: 'https://pepe.vip', coingecko_id: 'pepe' },
        { symbol: 'INJ', name: 'Injective', logo_url: 'https://assets.coingecko.com/coins/images/12882/large/Secondary_Symbol.png', homepage_url: 'https://injective.com', coingecko_id: 'injective-protocol' }
      ];

      // First, try to create the table if it doesn't exist
      const createTableSQL = `
        CREATE TABLE IF NOT EXISTS crypto_logos (
          id SERIAL PRIMARY KEY,
          symbol VARCHAR(10) NOT NULL UNIQUE,
          name VARCHAR(100) NOT NULL,
          logo_url TEXT NOT NULL,
          homepage_url TEXT,
          coingecko_id VARCHAR(100),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `;

      try {
        await supabaseAdmin.rpc('exec_sql', { sql: createTableSQL });
      } catch (tableError) {
        console.warn('Table creation via RPC failed, continuing with insert:', tableError);
      }

      // Insert/update logos
      const { data, error } = await supabaseAdmin
        .from('crypto_logos')
        .upsert(cryptoLogos, { onConflict: 'symbol' });

      if (error) {
        console.error('Error inserting crypto logos:', error);
        return res.status(500).json({ message: 'Failed to insert crypto logos' });
      }

      res.json({ message: `Successfully initialized ${cryptoLogos.length} crypto logos`, count: cryptoLogos.length });
    } catch (error) {
      console.error('Error initializing crypto logos:', (error as Error).message);
      res.status(500).json({ message: 'Failed to initialize crypto logos' });
    }
  });
}
