import { useEffect, useMemo, useState } from "react";
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
  const FIXED_ROWS = 12;

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

  // Calculate depth data — always pad to FIXED_ROWS entries
  const { displayAsks, displayBids, spreadPct, maxAskVol, maxBidVol, bidRatio } = useMemo(() => {
    const asks = orderBook.asks.slice(0, FIXED_ROWS).reverse();
    const bids = orderBook.bids.slice(0, FIXED_ROWS);

    let cumAsk = 0;
    const asksWithCum = asks.map((a) => {
      const amt = parseFloat(a.amount);
      cumAsk += amt;
      return { ...a, cumTotal: cumAsk, numAmount: amt, isEmpty: false };
    });

    let cumBid = 0;
    const bidsWithCum = bids.map((b) => {
      const amt = parseFloat(b.amount);
      cumBid += amt;
      return { ...b, cumTotal: cumBid, numAmount: amt, isEmpty: false };
    });

    // Pad with empty placeholders to always have FIXED_ROWS entries
    const emptyEntry = { price: "", amount: "", cumTotal: 0, numAmount: 0, isEmpty: true };
    while (asksWithCum.length < FIXED_ROWS) asksWithCum.unshift({ ...emptyEntry });
    while (bidsWithCum.length < FIXED_ROWS) bidsWithCum.push({ ...emptyEntry });

    const maxA = Math.max(...asksWithCum.filter(a => !a.isEmpty).map((a) => a.cumTotal), 1);
    const maxB = Math.max(...bidsWithCum.filter(b => !b.isEmpty).map((b) => b.cumTotal), 1);

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
  }, [orderBook]);

  const handleClick = (price: string) => {
    onPriceSelect?.(price);
  };

  return (
    <div className={`${className} flex flex-col h-full overflow-hidden`}>
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1.5 flex-shrink-0">
        <span className="text-xs font-semibold text-white">Order Book</span>
      </div>

      {/* Spread Indicator - Centered between panels */}
      <div className="flex items-center justify-center gap-3 px-2 py-1.5 bg-[#0a0a0a] border-y border-[#1e1e1e] flex-shrink-0">
        <span className="text-xs font-semibold text-white tabular-nums">{orderBook.lastPrice}</span>
        <span className="text-[10px] text-gray-500">
          Spread: {orderBook.spread} ({spreadPct.toFixed(3)}%)
        </span>
      </div>

      {/* Buy/Sell Imbalance Bar */}
      <div className="px-2 py-1.5 flex-shrink-0">
        <div className="flex h-1.5 rounded-full overflow-hidden bg-[#1a1a1a]">
          <div className="bg-red-500/60 transition-all" style={{ width: `${100 - bidRatio}%` }} />
          <div className="bg-green-500/60 transition-all" style={{ width: `${bidRatio}%` }} />
        </div>
        <div className="flex justify-between mt-0.5">
          <span className="text-[9px] text-red-400">{(100 - bidRatio).toFixed(1)}% Sell</span>
          <span className="text-[9px] text-green-400">{bidRatio.toFixed(1)}% Buy</span>
        </div>
      </div>

      {/* Order Book Content - Side by Side, fixed layout */}
      <div className="flex-1 flex flex-row gap-1 min-h-0 overflow-hidden">
        {/* Sell Orders Panel (Asks) - Left */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-[#1e1e1e]">
          {/* Panel Header */}
          <div className="flex items-center justify-center px-1 py-1 bg-red-500/10 flex-shrink-0">
            <span className="text-[10px] font-semibold text-red-400">Sell Orders</span>
          </div>
          {/* Column Headers */}
          <div className="flex text-[9px] text-gray-500 px-1 py-1 border-b border-[#1e1e1e] flex-shrink-0">
            <span className="flex-1">Price</span>
            <span className="flex-1 text-right">Amt</span>
            <span className="flex-1 text-right">Total</span>
          </div>
          {/* Asks List - fixed row height prevents layout shift */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {[...displayAsks].reverse().map((ask, i) => {
              if (ask.isEmpty) {
                return (
                  <div
                    key={`ask-empty-${i}`}
                    className="relative flex text-[11px] px-1"
                    style={{ height: `${100 / FIXED_ROWS}%` }}
                  >
                    <span className="flex-1 flex items-center text-transparent select-none tabular-nums">—</span>
                    <span className="flex-1 flex items-center justify-end text-transparent select-none tabular-nums">—</span>
                    <span className="flex-1 flex items-center justify-end text-transparent select-none tabular-nums">—</span>
                  </div>
                );
              }
              const depthPct = (ask.cumTotal / maxAskVol) * 100;
              return (
                <div
                  key={i}
                  onClick={() => handleClick(ask.price)}
                  className="relative flex text-[11px] px-1 cursor-pointer hover:brightness-125 transition-all"
                  style={{ height: `${100 / FIXED_ROWS}%` }}
                >
                  {/* Volume depth bar */}
                  <div
                    className="absolute inset-y-0 right-0 bg-red-500/10"
                    style={{ width: `${depthPct}%` }}
                  />
                  <span className="relative flex-1 text-red-400 font-medium tabular-nums truncate flex items-center">{ask.price}</span>
                  <span className="relative flex-1 text-right text-gray-300 tabular-nums truncate flex items-center justify-end">{ask.amount}</span>
                  <span className="relative flex-1 text-right text-gray-500 tabular-nums truncate flex items-center justify-end">{ask.cumTotal.toFixed(2)}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Buy Orders Panel (Bids) - Right */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Panel Header */}
          <div className="flex items-center justify-center px-1 py-1 bg-green-500/10 flex-shrink-0">
            <span className="text-[10px] font-semibold text-green-400">Buy Orders</span>
          </div>
          {/* Column Headers */}
          <div className="flex text-[9px] text-gray-500 px-1 py-1 border-b border-[#1e1e1e] flex-shrink-0">
            <span className="flex-1">Price</span>
            <span className="flex-1 text-right">Amt</span>
            <span className="flex-1 text-right">Total</span>
          </div>
          {/* Bids List - fixed row height prevents layout shift */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {displayBids.map((bid, i) => {
              if (bid.isEmpty) {
                return (
                  <div
                    key={`bid-empty-${i}`}
                    className="relative flex text-[11px] px-1"
                    style={{ height: `${100 / FIXED_ROWS}%` }}
                  >
                    <span className="flex-1 flex items-center text-transparent select-none tabular-nums">—</span>
                    <span className="flex-1 flex items-center justify-end text-transparent select-none tabular-nums">—</span>
                    <span className="flex-1 flex items-center justify-end text-transparent select-none tabular-nums">—</span>
                  </div>
                );
              }
              const depthPct = (bid.cumTotal / maxBidVol) * 100;
              return (
                <div
                  key={i}
                  onClick={() => handleClick(bid.price)}
                  className="relative flex text-[11px] px-1 cursor-pointer hover:brightness-125 transition-all"
                  style={{ height: `${100 / FIXED_ROWS}%` }}
                >
                  {/* Volume depth bar */}
                  <div
                    className="absolute inset-y-0 right-0 bg-green-500/10"
                    style={{ width: `${depthPct}%` }}
                  />
                  <span className="relative flex-1 text-green-400 font-medium tabular-nums truncate flex items-center">{bid.price}</span>
                  <span className="relative flex-1 text-right text-gray-300 tabular-nums truncate flex items-center justify-end">{bid.amount}</span>
                  <span className="relative flex-1 text-right text-gray-500 tabular-nums truncate flex items-center justify-end">{bid.cumTotal.toFixed(2)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
