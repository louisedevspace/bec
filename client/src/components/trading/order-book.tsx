import { useState, useEffect, useMemo } from "react";
import { useCryptoPrices } from "@/hooks/use-crypto-prices";
import OrderBookService from "@/services/order-book-service";
import type { OrderBookEntry } from "@/types/crypto";

interface OrderBookProps {
  pair: string;
  className?: string;
  onPriceSelect?: (price: string) => void;
}

export function OrderBook({ pair, className = "", onPriceSelect }: OrderBookProps) {
  const { prices } = useCryptoPrices();
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
    totalAskVolume: "0",
  });
  const [rows] = useState(15);

  useEffect(() => {
    const symbol = pair.split("/")[0];
    const currentPriceData = prices.find((p) => p.symbol === symbol);
    if (!currentPriceData) return;

    const currentPrice = parseFloat(currentPriceData.price);
    const orderBookService = OrderBookService.getInstance();

    const generateOrderBook = () => {
      const data = orderBookService.generateRealisticOrderBook(currentPrice, symbol);
      setOrderBook(data);
    };

    generateOrderBook();
    const interval = setInterval(generateOrderBook, 2000);
    return () => clearInterval(interval);
  }, [pair, prices]);

  // Calculate depth data
  const { displayAsks, displayBids, spreadPct, maxAskVol, maxBidVol, bidRatio } = useMemo(() => {
    const asks = orderBook.asks.slice(0, rows).reverse();
    const bids = orderBook.bids.slice(0, rows);

    let cumAsk = 0;
    const asksWithCum = asks.map((a) => {
      const amt = parseFloat(a.amount);
      cumAsk += amt;
      return { ...a, cumTotal: cumAsk, numAmount: amt };
    });

    let cumBid = 0;
    const bidsWithCum = bids.map((b) => {
      const amt = parseFloat(b.amount);
      cumBid += amt;
      return { ...b, cumTotal: cumBid, numAmount: amt };
    });

    const maxA = Math.max(...asksWithCum.map((a) => a.cumTotal), 1);
    const maxB = Math.max(...bidsWithCum.map((b) => b.cumTotal), 1);

    const bestAsk = asks.length > 0 ? parseFloat(asks[asks.length - 1].price) : 0;
    const bestBid = bids.length > 0 ? parseFloat(bids[0].price) : 0;
    const mid = (bestAsk + bestBid) / 2;
    const spreadPctVal = mid > 0 ? ((bestAsk - bestBid) / mid) * 100 : 0;

    const totalBidVol = parseFloat(orderBook.totalBidVolume || "0");
    const totalAskVol = parseFloat(orderBook.totalAskVolume || "0");
    const totalVol = totalBidVol + totalAskVol;
    const ratio = totalVol > 0 ? (totalBidVol / totalVol) * 100 : 50;

    return {
      displayAsks: asksWithCum,
      displayBids: bidsWithCum,
      spreadPct: spreadPctVal,
      maxAskVol: maxA,
      maxBidVol: maxB,
      bidRatio: ratio,
    };
  }, [orderBook, rows]);

  const handleClick = (price: string) => {
    onPriceSelect?.(price);
  };

  return (
    <div className={`${className} flex flex-col`}>
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1.5 flex-shrink-0">
        <span className="text-xs font-semibold text-white">Order Book</span>
      </div>

      {/* Buy/Sell Imbalance Bar */}
      <div className="px-2 pb-1.5 flex-shrink-0">
        <div className="flex h-1.5 rounded-full overflow-hidden bg-[#1a1a1a]">
          <div className="bg-green-500/60 transition-all" style={{ width: `${bidRatio}%` }} />
          <div className="bg-red-500/60 transition-all" style={{ width: `${100 - bidRatio}%` }} />
        </div>
        <div className="flex justify-between mt-0.5">
          <span className="text-[9px] text-green-400">{bidRatio.toFixed(1)}% Buy</span>
          <span className="text-[9px] text-red-400">{(100 - bidRatio).toFixed(1)}% Sell</span>
        </div>
      </div>

      {/* Column Headers */}
      <div className="flex text-[10px] text-gray-500 px-2 py-1 border-b border-[#1e1e1e] flex-shrink-0">
        <span className="flex-1">Price</span>
        <span className="flex-1 text-right">Amount</span>
        <span className="flex-1 text-right">Total</span>
      </div>

      {/* Order Book Content */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Asks (Sell Orders) - reversed so closest to spread is at bottom */}
        <div className="flex-1 min-h-0 flex flex-col justify-end overflow-hidden">
          {displayAsks.map((ask, i) => {
            const depthPct = (ask.cumTotal / maxAskVol) * 100;
            return (
              <div
                key={i}
                onClick={() => handleClick(ask.price)}
                className="relative flex text-[11px] px-2 py-[3px] cursor-pointer hover:brightness-125 transition-all"
              >
                {/* Volume depth bar */}
                <div
                  className="absolute inset-y-0 right-0 bg-red-500/10"
                  style={{ width: `${depthPct}%` }}
                />
                <span className="relative flex-1 text-red-400 font-medium tabular-nums">{ask.price}</span>
                <span className="relative flex-1 text-right text-gray-300 tabular-nums">{ask.amount}</span>
                <span className="relative flex-1 text-right text-gray-500 tabular-nums">{ask.cumTotal.toFixed(4)}</span>
              </div>
            );
          })}
        </div>

        {/* Spread Indicator */}
        <div className="flex items-center justify-between px-2 py-1.5 bg-[#0a0a0a] border-y border-[#1e1e1e] flex-shrink-0">
          <span className="text-xs font-semibold text-white tabular-nums">{orderBook.lastPrice}</span>
          <span className="text-[10px] text-gray-500">
            Spread: {orderBook.spread} ({spreadPct.toFixed(3)}%)
          </span>
        </div>

        {/* Bids (Buy Orders) - closest to spread at top */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {displayBids.map((bid, i) => {
            const depthPct = (bid.cumTotal / maxBidVol) * 100;
            return (
              <div
                key={i}
                onClick={() => handleClick(bid.price)}
                className="relative flex text-[11px] px-2 py-[3px] cursor-pointer hover:brightness-125 transition-all"
              >
                {/* Volume depth bar */}
                <div
                  className="absolute inset-y-0 right-0 bg-green-500/10"
                  style={{ width: `${depthPct}%` }}
                />
                <span className="relative flex-1 text-green-400 font-medium tabular-nums">{bid.price}</span>
                <span className="relative flex-1 text-right text-gray-300 tabular-nums">{bid.amount}</span>
                <span className="relative flex-1 text-right text-gray-500 tabular-nums">{bid.cumTotal.toFixed(4)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
