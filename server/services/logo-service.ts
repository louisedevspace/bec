import axios from 'axios';

interface LogoData {
  symbol: string;
  logo: string;
  homepage: string;
}

class LogoService {
  private static instance: LogoService;
  private logoCache: Map<string, LogoData> = new Map();
  private lastUpdate: Date = new Date(0);
  private updateInterval: number = 24 * 60 * 60 * 1000; // 24 hours

  private constructor() {}

  public static getInstance(): LogoService {
    if (!LogoService.instance) {
      LogoService.instance = new LogoService();
    }
    return LogoService.instance;
  }

  /**
   * Get logos for cryptocurrencies
   */
  public async getLogos(symbols: string[]): Promise<Record<string, { logo: string; homepage: string }>> {
    const now = new Date();
    
    // Check if we need to update logos
    if (now.getTime() - this.lastUpdate.getTime() > this.updateInterval) {
      try {
        console.log('🔄 Fetching live crypto logos...');
        await this.fetchAndCacheLogos(symbols);
        this.lastUpdate = now;
        console.log(`✅ Updated logos for ${symbols.length} cryptocurrencies`);
      } catch (error) {
        console.warn('⚠️ Failed to fetch live logos, using cached data:', error instanceof Error ? error.message : String(error));
      }
    }

    // Return cached logos
    const result: Record<string, { logo: string; homepage: string }> = {};
    symbols.forEach(symbol => {
      const cached = this.logoCache.get(symbol.toUpperCase());
      if (cached) {
        result[symbol.toUpperCase()] = {
          logo: cached.logo,
          homepage: cached.homepage
        };
      }
    });

    return result;
  }

  /**
   * Fetch and cache logos from CoinGecko
   */
  private async fetchAndCacheLogos(symbols: string[]): Promise<void> {
    try {
      // Get CoinGecko coin list to map symbols to IDs
      const coinListResponse = await axios.get(
        'https://api.coingecko.com/api/v3/coins/list',
        {
          timeout: 15000,
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Becxus/1.0'
          }
        }
      );

      const allCoins = coinListResponse.data;
      const symbolToId: Record<string, string> = {};

      // Map symbols to CoinGecko IDs
      symbols.forEach(symbol => {
        const found = allCoins.find((coin: any) => 
          coin.symbol.toLowerCase() === symbol.toLowerCase()
        );
        if (found) {
          symbolToId[symbol.toUpperCase()] = found.id;
        }
      });

      // Fetch market data for found coins (includes logos)
      const ids = Object.values(symbolToId);
      if (ids.length === 0) {
        console.warn('No CoinGecko IDs found for requested symbols');
        return;
      }

      // Fetch in batches of 100 (CoinGecko limit)
      for (let i = 0; i < ids.length; i += 100) {
        const batch = ids.slice(i, i + 100);
        const marketResponse = await axios.get(
          `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${batch.join(',')}&order=market_cap_desc&per_page=100&page=1&sparkline=false`,
          {
            timeout: 15000,
            headers: {
              'Accept': 'application/json',
              'User-Agent': 'Becxus/1.0'
            }
          }
        );

        // Cache the logos
        marketResponse.data.forEach((coin: any) => {
          const symbol = this.getSymbolFromCoinId(coin.id, symbolToId);
          if (symbol) {
            this.logoCache.set(symbol, {
              symbol,
              logo: coin.image || '',
              homepage: coin.homepage || ''
            });
          }
        });
      }

    } catch (error) {
      console.error('Error fetching live logos:', error);
      throw error;
    }
  }

  /**
   * Get symbol from CoinGecko coin ID
   */
  private getSymbolFromCoinId(coinId: string, symbolToId: Record<string, string>): string | null {
    for (const [symbol, id] of Object.entries(symbolToId)) {
      if (id === coinId) {
        return symbol;
      }
    }
    return null;
  }

  /**
   * Get a single logo for a symbol
   */
  public async getLogo(symbol: string): Promise<{ logo: string; homepage: string } | null> {
    const logos = await this.getLogos([symbol]);
    return logos[symbol.toUpperCase()] || null;
  }
}

export default LogoService;
