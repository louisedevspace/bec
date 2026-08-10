import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useCryptoPrices } from "@/hooks/use-crypto-prices";
import OrderBookService from "@/services/order-book-service";
import type { OrderBookEntry } from "@/types/crypto";

interface OrderBookProps {
  pair: string;
  className?: string;
  onPriceSelect?: (price: string) => void;
}

const FIXED_ROWS = 12;

function formatPrice(p: number): string {
  if (p >= 10000) return p.toFixed(2);
  if (p >= 100) return p.toFixed(3);
  if (p >= 1) return p.toFixed(4);
  if (p >= 0.01) return p.toFixed(6);
  return p.toFixed(8);
}

function formatAmount(a: number): string {
  if (a >= 1000) return a.toFixed(2);
  if (a >= 1) return a.toFixed(4);
  return a.toFixed(6);
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
    bids: [], asks: [],
    lastPrice: "0", spread: "0",
    totalBidVolume: "0", totalAskVolume: "0",
  });

  const prevLastPriceRef = useRef<number>(0);

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

  const { displayAsks, displayBids, spreadPct, maxAskCum, maxBidCum, bidRatio, lastPriceNum, priceDirection } = useMemo(() => {
    const asks = orderBook.asks.slice(0, FIXED_ROWS);
    const bids = orderBook.bids.slice(0, FIXED_ROWS);

    // Asks: lowest price at bottom (closest to spread), highest at top
    const sortedAsks = [...asks].sort((a, b) => parseFloat(b.price) - parseFloat(a.price));

    let cumAsk = 0;
    const asksWithCum = sortedAsks.map((a) => {
      const amt = parseFloat(a.amount);
      cumAsk += amt;
      return { price: parseFloat(a.price), amount: amt, cumTotal: cumAsk, isEmpty: false };
    });
    // Reverse cumulation so bottom ask has highest cumTotal
    const totalAskCum = cumAsk;
    let runCum = 0;
    for (let i = asksWithCum.length - 1; i >= 0; i--) {
      runCum += asksWithCum[i].amount;
      asksWithCum[i].cumTotal = runCum;
    }

    let cumBid = 0;
    const bidsWithCum = bids.map((b) => {
      const amt = parseFloat(b.amount);
      cumBid += amt;
      return { price: parseFloat(b.price), amount: amt, cumTotal: cumBid, isEmpty: false };
    });

    // Pad with empty rows
    const emptyEntry = { price: 0, amount: 0, cumTotal: 0, isEmpty: true };
    while (asksWithCum.length < FIXED_ROWS) asksWithCum.unshift({ ...emptyEntry });
    while (bidsWithCum.length < FIXED_ROWS) bidsWithCum.push({ ...emptyEntry });

    const maxA = Math.max(...asksWithCum.filter(a => !a.isEmpty).map(a => a.cumTotal), 1);
    const maxB = Math.max(...bidsWithCum.filter(b => !b.isEmpty).map(b => b.cumTotal), 1);

    const bestAsk = asks.length > 0 ? Math.min(...asks.map(a => parseFloat(a.price))) : 0;
    const bestBid = bids.length > 0 ? Math.max(...bids.map(b => parseFloat(b.price))) : 0;
    const mid = (bestAsk + bestBid) / 2;
    const spreadPctVal = mid > 0 ? ((bestAsk - bestBid) / mid) * 100 : 0;

    const totalBidVol = parseFloat(orderBook.totalBidVolume || "0");
    const totalAskVol = parseFloat(orderBook.totalAskVolume || "0");
    const totalVol = totalBidVol + totalAskVol;
    const ratio = totalVol > 0 ? (totalBidVol / totalVol) * 100 : 50;

    const lp = parseFloat(orderBook.lastPrice || "0");
    const dir = lp > prevLastPriceRef.current ? "up" : lp < prevLastPriceRef.current ? "down" : "neutral";
    prevLastPriceRef.current = lp;

    return {
      displayAsks: asksWithCum,
      displayBids: bidsWithCum,
      spreadPct: spreadPctVal,
      maxAskCum: maxA,
      maxBidCum: maxB,
      bidRatio: ratio,
      lastPriceNum: lp,
      priceDirection: dir,
    };
  }, [orderBook]);

  const handleClick = useCallback((price: number) => {
    if (price > 0) onPriceSelect?.(formatPrice(price));
  }, [onPriceSelect]);

  return (
    <div className={`${className} flex flex-col h-full overflow-hidden`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 flex-shrink-0">
        <span className="text-xs font-semibold text-white tracking-wide">Order Book</span>
        <span className="text-[10px] text-gray-600">{pair}</span>
      </div>

      {/* Column Headers */}
      <div className="grid grid-cols-3 text-[10px] text-gray-500 px-3 py-1.5 border-b border-[#1e1e1e] flex-shrink-0 font-medium">
        <span>Price</span>
        <span className="text-right">Amount</span>
        <span className="text-right">Total</span>
      </div>

      {/* Asks (Sell orders) - highest price at top, lowest near spread */}
      <div className="flex-1 min-h-0 flex flex-col justify-end overflow-hidden">
        {displayAsks.map((ask, i) => {
          if (ask.isEmpty) {
            return (
              <div key={`ask-e-${i}`} className="grid grid-cols-3 text-[11px] px-3" style={{ height: `${100 / FIXED_ROWS}%` }}>
                <span className="flex items-center text-transparent select-none tabular-nums">-</span>
                <span className="flex items-center justify-end text-transparent select-none tabular-nums">-</span>
                <span className="flex items-center justify-end text-transparent select-none tabular-nums">-</span>
              </div>
            );
          }
          const depthPct = (ask.cumTotal / maxAskCum) * 100;
          return (
            <div
              key={`ask-${i}`}
              onClick={() => handleClick(ask.price)}
              className="relative grid grid-cols-3 text-[11px] px-3 cursor-pointer hover:bg-red-500/5 transition-colors"
              style={{ height: `${100 / FIXED_ROWS}%` }}
            >
              <div className="absolute inset-y-0 right-0 bg-red-500/8 transition-all duration-300" style={{ width: `${depthPct}%` }} />
              <span className="relative flex items-center text-red-400 font-medium tabular-nums">{formatPrice(ask.price)}</span>
              <span className="relative flex items-center justify-end text-gray-400 tabular-nums">{formatAmount(ask.amount)}</span>
              <span className="relative flex items-center justify-end text-gray-600 tabular-nums">{formatAmount(ask.cumTotal)}</span>
            </div>
          );
        })}
      </div>

      {/* Spread / Last Price Bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#0a0a0a] border-y border-[#1a1a1a] flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-bold tabular-nums ${
            priceDirection === "up" ? "text-green-400" : priceDirection === "down" ? "text-red-400" : "text-white"
          }`}>
            {formatPrice(lastPriceNum)}
          </span>
          {priceDirection === "up" && <span className="text-green-400 text-xs">&#9650;</span>}
          {priceDirection === "down" && <span className="text-red-400 text-xs">&#9660;</span>}
        </div>
        <span className="text-[10px] text-gray-600">
          Spread {spreadPct.toFixed(3)}%
        </span>
      </div>

      {/* Bids (Buy orders) - highest price near spread, lowest at bottom */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {displayBids.map((bid, i) => {
          if (bid.isEmpty) {
            return (
              <div key={`bid-e-${i}`} className="grid grid-cols-3 text-[11px] px-3" style={{ height: `${100 / FIXED_ROWS}%` }}>
                <span className="flex items-center text-transparent select-none tabular-nums">-</span>
                <span className="flex items-center justify-end text-transparent select-none tabular-nums">-</span>
                <span className="flex items-center justify-end text-transparent select-none tabular-nums">-</span>
              </div>
            );
          }
          const depthPct = (bid.cumTotal / maxBidCum) * 100;
          return (
            <div
              key={`bid-${i}`}
              onClick={() => handleClick(bid.price)}
              className="relative grid grid-cols-3 text-[11px] px-3 cursor-pointer hover:bg-green-500/5 transition-colors"
              style={{ height: `${100 / FIXED_ROWS}%` }}
            >
              <div className="absolute inset-y-0 right-0 bg-green-500/8 transition-all duration-300" style={{ width: `${depthPct}%` }} />
              <span className="relative flex items-center text-green-400 font-medium tabular-nums">{formatPrice(bid.price)}</span>
              <span className="relative flex items-center justify-end text-gray-400 tabular-nums">{formatAmount(bid.amount)}</span>
              <span className="relative flex items-center justify-end text-gray-600 tabular-nums">{formatAmount(bid.cumTotal)}</span>
            </div>
          );
        })}
      </div>

      {/* Buy/Sell Ratio Bar */}
      <div className="px-3 py-2 flex-shrink-0 border-t border-[#1a1a1a]">
        <div className="flex h-1 rounded-full overflow-hidden bg-[#1a1a1a]">
          <div className="bg-green-500/50 transition-all duration-500" style={{ width: `${bidRatio}%` }} />
          <div className="bg-red-500/50 transition-all duration-500" style={{ width: `${100 - bidRatio}%` }} />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[9px] text-green-500/70 tabular-nums">{bidRatio.toFixed(1)}% Buy</span>
          <span className="text-[9px] text-red-500/70 tabular-nums">{(100 - bidRatio).toFixed(1)}% Sell</span>
        </div>
      </div>
    </div>
  );
}
