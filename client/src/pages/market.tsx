import { CryptoList } from "@/components/crypto/crypto-list";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Search, TrendingUp, BarChart3, Globe, Activity } from "lucide-react";

export default function MarketPage() {
  const [searchTerm, setSearchTerm] = useState("");

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Header */}
      <div className="bg-[#111] border-b border-[#1e1e1e] px-4 py-5">
        <div className="max-w-[1200px] mx-auto">
          <h1 className="text-lg font-bold text-white mb-1">Market Rates</h1>
          <p className="text-gray-500 text-xs">Real-time cryptocurrency prices and market data</p>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-4 py-5 space-y-4">
        {/* Search */}
        <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600" size={16} />
            <Input
              placeholder="Search cryptocurrencies..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-10 bg-[#0a0a0a] border-[#2a2a2a] rounded-xl text-white text-sm placeholder:text-gray-600 focus:ring-1 focus:ring-gray-600"
            />
          </div>
        </div>

        {/* Market Overview Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 bg-green-500/10 rounded-lg flex items-center justify-center">
                <Activity size={12} className="text-green-400" />
              </div>
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">Total Assets</span>
            </div>
            <div className="text-xl font-bold text-green-400 tabular-nums">20</div>
          </div>
          <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 bg-blue-500/10 rounded-lg flex items-center justify-center">
                <Globe size={12} className="text-blue-400" />
              </div>
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">Market Cap</span>
            </div>
            <div className="text-xl font-bold text-blue-400 tabular-nums">$2.1T</div>
          </div>
          <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 bg-purple-500/10 rounded-lg flex items-center justify-center">
                <BarChart3 size={12} className="text-purple-400" />
              </div>
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">24h Volume</span>
            </div>
            <div className="text-xl font-bold text-purple-400 tabular-nums">$89B</div>
          </div>
          <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 bg-orange-500/10 rounded-lg flex items-center justify-center">
                <TrendingUp size={12} className="text-orange-400" />
              </div>
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">BTC Dominance</span>
            </div>
            <div className="text-xl font-bold text-orange-400 tabular-nums">47.3%</div>
          </div>
        </div>

        {/* Crypto List */}
        <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1e1e1e]">
            <span className="text-sm font-semibold text-white">All Cryptocurrencies</span>
          </div>
          <CryptoList showVolume={true} />
        </div>
      </div>
    </div>
  );
}
