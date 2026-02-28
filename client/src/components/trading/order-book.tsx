import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCryptoPrices } from "@/hooks/use-crypto-prices";
import OrderBookService from "@/services/order-book-service";
import type { OrderBookEntry } from "@/types/crypto";

interface OrderBookProps {
  pair: string;
  className?: string;
}

export function OrderBook({ pair, className = "" }: OrderBookProps) {
  const { prices, getFormattedPrice } = useCryptoPrices();
  const [orderBook, setOrderBook] = useState<{
    bids: OrderBookEntry[];
    asks: OrderBookEntry[];
    lastPrice: string;
    spread: string;
    totalBidVolume: string;
    totalAskVolume: string;
  }>({
    bids: [],
    asks: [],
    lastPrice: "0",
    spread: "0",
    totalBidVolume: "0",
    totalAskVolume: "0"
  });

  useEffect(() => {
    // Extract symbol from pair (e.g., "BTC/USDT" -> "BTC")
    const symbol = pair.split('/')[0];
    const currentPriceData = prices.find(p => p.symbol === symbol);
    
    if (!currentPriceData) return;
    
    const currentPrice = parseFloat(currentPriceData.price);
    const orderBookService = OrderBookService.getInstance();
    
    const generateOrderBook = () => {
      const orderBookData = orderBookService.generateRealisticOrderBook(currentPrice, symbol);
      setOrderBook(orderBookData);
    };

    generateOrderBook();
    
    // Update order book every 2 seconds
    const interval = setInterval(generateOrderBook, 2000);
    
    return () => clearInterval(interval);
  }, [pair, prices]);

  return (
    <div className={`${className} h-full flex flex-col`}>
      {/* Header with Unit Price and Number */}
      <div className="flex justify-between text-xs lg:text-sm text-gray-400 px-1 lg:px-2 py-1 lg:py-2 flex-shrink-0">
        <span>Unit Price</span>
        <span>Number</span>
      </div>
      
      {/* Order Book Content - Takes remaining height */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Asks (Sell Orders) - Red background - Top Half */}
        <div className="flex-1 min-h-0 flex flex-col">
          {orderBook.asks.slice(0, 6).reverse().map((ask, index) => (
            <div
              key={index}
              className="flex justify-between text-xs lg:text-sm px-1 lg:px-2 py-0.5 lg:py-1.5 bg-red-500/10 hover:bg-red-500/20 transition-colors cursor-pointer flex-1"
            >
              <span className="text-red-500 font-medium truncate">{ask.price}</span>
              <span className="text-white truncate ml-1 lg:ml-2">{ask.amount}</span>
            </div>
          ))}
        </div>

        {/* Bids (Buy Orders) - Green background - Bottom Half - Directly adjacent */}
        <div className="flex-1 min-h-0 flex flex-col">
          {orderBook.bids.slice(0, 6).map((bid, index) => (
            <div
              key={index}
              className="flex justify-between text-xs lg:text-sm px-1 lg:px-2 py-0.5 lg:py-1.5 bg-green-500/10 hover:bg-green-500/20 transition-colors cursor-pointer flex-1"
            >
              <span className="text-green-500 font-medium truncate">{bid.price}</span>
              <span className="text-white truncate ml-1 lg:ml-2">{bid.amount}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
