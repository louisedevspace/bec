import type { OrderBookEntry } from "@/types/crypto";

interface OrderBookData {
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
  lastPrice: string;
  spread: string;
  totalBidVolume: string;
  totalAskVolume: string;
}

export class OrderBookService {
  private static instance: OrderBookService;
  private lastUpdate: number = 0;
  private updateInterval: number = 2000; // 2 seconds

  public static getInstance(): OrderBookService {
    if (!OrderBookService.instance) {
      OrderBookService.instance = new OrderBookService();
    }
    return OrderBookService.instance;
  }

  /**
   * Generate realistic order book based on current price
   */
  public generateRealisticOrderBook(currentPrice: number, symbol: string): OrderBookData {
    const now = Date.now();
    
    // Only update if enough time has passed
    if (now - this.lastUpdate < this.updateInterval) {
      return this.getCachedOrderBook(currentPrice, symbol);
    }

    this.lastUpdate = now;

    const bids: OrderBookEntry[] = [];
    const asks: OrderBookEntry[] = [];
    
    // Calculate realistic price ranges based on current price
    const priceVolatility = this.getPriceVolatility(symbol);
    const maxSpread = currentPrice * 0.002; // 0.2% max spread
    const minSpread = currentPrice * 0.0005; // 0.05% min spread
    
    // Generate realistic spread
    const spread = minSpread + Math.random() * (maxSpread - minSpread);
    const midPrice = currentPrice;
    
    // Generate asks (sell orders) - prices above current price
    let cumulativeAskVolume = 0;
    for (let i = 0; i < 12; i++) {
      const priceOffset = spread / 2 + (i * spread / 24) + (Math.random() * spread / 48);
      const price = midPrice + priceOffset;
      
      // Realistic volume distribution (more volume near current price)
      const volumeMultiplier = Math.exp(-i * 0.3) + Math.random() * 0.5;
      const baseVolume = this.getBaseVolume(symbol);
      const amount = (baseVolume * volumeMultiplier * (0.5 + Math.random() * 1.5));
      
      cumulativeAskVolume += amount;
      
      asks.push({
        price: price.toFixed(4),
        amount: amount.toFixed(4),
        total: cumulativeAskVolume.toFixed(4)
      });
    }
    
    // Generate bids (buy orders) - prices below current price
    let cumulativeBidVolume = 0;
    for (let i = 0; i < 12; i++) {
      const priceOffset = spread / 2 + (i * spread / 24) + (Math.random() * spread / 48);
      const price = midPrice - priceOffset;
      
      // Realistic volume distribution (more volume near current price)
      const volumeMultiplier = Math.exp(-i * 0.3) + Math.random() * 0.5;
      const baseVolume = this.getBaseVolume(symbol);
      const amount = (baseVolume * volumeMultiplier * (0.5 + Math.random() * 1.5));
      
      cumulativeBidVolume += amount;
      
      bids.push({
        price: price.toFixed(4),
        amount: amount.toFixed(4),
        total: cumulativeBidVolume.toFixed(4)
      });
    }
    
    // Sort asks by price (ascending) and bids by price (descending)
    asks.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
    bids.sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
    
    // Add some market depth variations
    this.addMarketDepthVariations(asks, bids, currentPrice);
    
    return {
      bids,
      asks,
      lastPrice: currentPrice.toFixed(4),
      spread: spread.toFixed(4),
      totalBidVolume: cumulativeBidVolume.toFixed(4),
      totalAskVolume: cumulativeAskVolume.toFixed(4)
    };
  }

  /**
   * Get price volatility based on cryptocurrency
   */
  private getPriceVolatility(symbol: string): number {
    const volatilityMap: { [key: string]: number } = {
      'BTC': 0.015, // 1.5% volatility
      'ETH': 0.025, // 2.5% volatility
      'USDT': 0.001, // 0.1% volatility (stablecoin)
      'BNB': 0.03, // 3% volatility
      'XRP': 0.04, // 4% volatility
      'ADA': 0.035, // 3.5% volatility
      'DOGE': 0.06, // 6% volatility
      'MATIC': 0.045, // 4.5% volatility
      'DOT': 0.035, // 3.5% volatility
      'LTC': 0.03, // 3% volatility
      'BCH': 0.04, // 4% volatility
      'LINK': 0.04, // 4% volatility
      'UNI': 0.04, // 4% volatility
      'ATOM': 0.035, // 3.5% volatility
      'ETC': 0.04, // 4% volatility
      'XLM': 0.035, // 3.5% volatility
      'TRX': 0.03, // 3% volatility
      'XMR': 0.035, // 3.5% volatility
      'EOS': 0.04, // 4% volatility
      'FIL': 0.05, // 5% volatility
      'VET': 0.045, // 4.5% volatility
      'THETA': 0.05, // 5% volatility
      'AAVE': 0.045, // 4.5% volatility
      'ALGO': 0.04, // 4% volatility
    };
    
    return volatilityMap[symbol] || 0.03; // Default 3% volatility
  }

  /**
   * Get base volume based on cryptocurrency
   */
  private getBaseVolume(symbol: string): number {
    const volumeMap: { [key: string]: number } = {
      'BTC': 0.1, // 0.1 BTC base volume
      'ETH': 0.5, // 0.5 ETH base volume
      'USDT': 1000, // 1000 USDT base volume
      'BNB': 2, // 2 BNB base volume
      'XRP': 1000, // 1000 XRP base volume
      'ADA': 500, // 500 ADA base volume
      'DOGE': 10000, // 10000 DOGE base volume
      'MATIC': 500, // 500 MATIC base volume
      'DOT': 100, // 100 DOT base volume
      'LTC': 5, // 5 LTC base volume
      'BCH': 2, // 2 BCH base volume
      'LINK': 50, // 50 LINK base volume
      'UNI': 20, // 20 UNI base volume
      'ATOM': 30, // 30 ATOM base volume
      'ETC': 10, // 10 ETC base volume
      'XLM': 200, // 200 XLM base volume
      'TRX': 1000, // 1000 TRX base volume
      'XMR': 5, // 5 XMR base volume
      'EOS': 100, // 100 EOS base volume
      'FIL': 20, // 20 FIL base volume
      'VET': 500, // 500 VET base volume
      'THETA': 100, // 100 THETA base volume
      'AAVE': 5, // 5 AAVE base volume
      'ALGO': 200, // 200 ALGO base volume
    };
    
    return volumeMap[symbol] || 10; // Default base volume
  }

  /**
   * Add realistic market depth variations
   */
  private addMarketDepthVariations(asks: OrderBookEntry[], bids: OrderBookEntry[], currentPrice: number): void {
    // Add some large orders (whales)
    if (asks.length > 3 && Math.random() > 0.7) {
      const whaleIndex = Math.floor(Math.random() * 3);
      const whaleAmount = parseFloat(asks[whaleIndex].amount) * (3 + Math.random() * 2);
      asks[whaleIndex].amount = whaleAmount.toFixed(4);
    }
    
    if (bids.length > 3 && Math.random() > 0.7) {
      const whaleIndex = Math.floor(Math.random() * 3);
      const whaleAmount = parseFloat(bids[whaleIndex].amount) * (3 + Math.random() * 2);
      bids[whaleIndex].amount = whaleAmount.toFixed(4);
    }
    
    // Add some small orders (retail traders)
    if (asks.length > 6 && Math.random() > 0.8) {
      const retailIndex = 6 + Math.floor(Math.random() * 3);
      if (retailIndex < asks.length) {
        const retailAmount = parseFloat(asks[retailIndex].amount) * (0.1 + Math.random() * 0.3);
        asks[retailIndex].amount = retailAmount.toFixed(4);
      }
    }
    
    if (bids.length > 6 && Math.random() > 0.8) {
      const retailIndex = 6 + Math.floor(Math.random() * 3);
      if (retailIndex < bids.length) {
        const retailAmount = parseFloat(bids[retailIndex].amount) * (0.1 + Math.random() * 0.3);
        bids[retailIndex].amount = retailAmount.toFixed(4);
      }
    }
  }

  /**
   * Get cached order book (for performance)
   */
  private getCachedOrderBook(currentPrice: number, symbol: string): OrderBookData {
    // Return a simple cached version to avoid excessive updates
    const spread = currentPrice * 0.001; // 0.1% spread
    const midPrice = currentPrice;
    
    const bids: OrderBookEntry[] = [];
    const asks: OrderBookEntry[] = [];
    
    // Simple cached version
    for (let i = 0; i < 8; i++) {
      const askPrice = midPrice + (spread / 2) + (i * spread / 16);
      const bidPrice = midPrice - (spread / 2) - (i * spread / 16);
      
      asks.push({
        price: askPrice.toFixed(4),
        amount: (Math.random() * 0.5 + 0.01).toFixed(4),
        total: ((i + 1) * 0.1).toFixed(4)
      });
      
      bids.push({
        price: bidPrice.toFixed(4),
        amount: (Math.random() * 0.5 + 0.01).toFixed(4),
        total: ((i + 1) * 0.1).toFixed(4)
      });
    }
    
    return {
      bids,
      asks,
      lastPrice: currentPrice.toFixed(4),
      spread: spread.toFixed(4),
      totalBidVolume: "1.2",
      totalAskVolume: "1.1"
    };
  }
}

export default OrderBookService; 