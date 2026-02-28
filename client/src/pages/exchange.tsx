import { TradingForm } from "@/components/trading/trading-form";
import { OrderBook } from "@/components/trading/order-book";
import { OrderManagement } from "@/components/trading/order-management";
import { useCryptoPrices } from "@/hooks/use-crypto-prices";
import { TrendingUp } from "lucide-react";

export default function ExchangePage() {
  const { getFormattedPrice } = useCryptoPrices();
  const currentPair = "BTC/USDT";

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      {/* Trading Pair Header */}
      <div className="flex-shrink-0 bg-[#111] border-b border-[#1e1e1e] px-4 py-3">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-orange-400 to-orange-600 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/20">
              <span className="text-white font-bold text-sm">₿</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="bg-[#1a1a1a] text-white text-sm font-semibold px-3 py-1 rounded-lg border border-[#2a2a2a]">
                  {currentPair}
                </span>
                <span className="text-gray-500 text-xs hidden sm:inline">Spot Trading</span>
              </div>
              <p className="text-gray-500 text-[11px] mt-0.5">Bitcoin / Tether</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <TrendingUp size={16} className="text-green-400" />
            <span className="text-green-400 font-bold text-lg md:text-xl tabular-nums">
              {getFormattedPrice("BTC")}
            </span>
            <span className="text-gray-500 text-xs">USDT</span>
          </div>
        </div>
      </div>

      {/* Main Trading Area */}
      <div className="flex-1 max-w-[1600px] mx-auto w-full px-3 py-3 flex flex-col gap-3 min-h-0">
        <div className="flex flex-col lg:flex-row gap-3 flex-1 min-h-0">
          {/* Trading Form - Left Sidebar */}
          <div className="lg:w-[400px] xl:w-[440px] flex-shrink-0 order-2 lg:order-1">
            <TradingForm pair={currentPair} type="spot" />
          </div>

          {/* Order Book - Main Area */}
          <div className="flex-1 order-1 lg:order-2 bg-[#111] rounded-2xl border border-[#1e1e1e] p-3 min-h-[300px] lg:min-h-0">
            <OrderBook pair={currentPair} className="h-full" />
          </div>
        </div>

        {/* Order Management - Bottom */}
        <div className="flex-shrink-0">
          <OrderManagement />
        </div>
      </div>
    </div>
  );
}
