import { useState, useEffect } from "react";
import { TradingForm } from "@/components/trading/trading-form";
import { OrderBook } from "@/components/trading/order-book";
import { OrderManagement } from "@/components/trading/order-management";
import { PriceChart } from "@/components/trading/price-chart";
import { MarketStatsBar } from "@/components/trading/market-stats-bar";
import { useCryptoPrices } from "@/hooks/use-crypto-prices";
import { TrendingUp, ChevronDown } from "lucide-react";
import { CryptoIcon } from "@/components/crypto/crypto-icon";

interface SpotPair {
  id: number;
  symbol: string;
  base_asset: string;
  quote_asset: string;
  is_enabled: boolean;
  trading_fee: string;
}

const CRYPTO_NAMES: Record<string, string> = {
  BTC: "Bitcoin", ETH: "Ethereum", BNB: "BNB", SOL: "Solana", XRP: "Ripple",
  ADA: "Cardano", DOT: "Polkadot", DOGE: "Dogecoin", AVAX: "Avalanche", LINK: "Chainlink",
  LTC: "Litecoin", MATIC: "Polygon", ATOM: "Cosmos", TRX: "TRON", SHIB: "Shiba Inu",
  BCH: "Bitcoin Cash", DASH: "Dash", XMR: "Monero", XLM: "Stellar", FIL: "Filecoin",
  APT: "Aptos", SUI: "Sui", ARB: "Arbitrum", OP: "Optimism", PEPE: "Pepe", INJ: "Injective",
};

export default function ExchangePage() {
  const { getFormattedPrice } = useCryptoPrices();
  const [pairs, setPairs] = useState<SpotPair[]>([]);
  const [currentPair, setCurrentPair] = useState("BTC/USDT");
  const [showPairMenu, setShowPairMenu] = useState(false);
  const [selectedPrice, setSelectedPrice] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/trading-pairs/spot")
      .then(res => res.ok ? res.json() : [])
      .then((data: SpotPair[]) => {
        if (data.length > 0) {
          setPairs(data);
          if (!data.find(p => p.symbol === currentPair)) {
            setCurrentPair(data[0].symbol);
          }
        }
      })
      .catch(() => {});
  }, []);

  const baseAsset = currentPair.split("/")[0];
  const quoteAsset = currentPair.split("/")[1];
  const cryptoName = CRYPTO_NAMES[baseAsset] || baseAsset;
  const selectedPair = pairs.find((p) => p.symbol === currentPair);
  const tradingFeeRate = Number(selectedPair?.trading_fee || "0");

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      {/* Trading Pair Header */}
      <div className="flex-shrink-0 bg-[#111] border-b border-[#1e1e1e]">
        <div className="w-full px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 relative">
              <CryptoIcon symbol={baseAsset} size="lg" />
              <div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowPairMenu(!showPairMenu)}
                    className="bg-[#1a1a1a] text-white text-sm font-semibold px-3 py-1 rounded-lg border border-[#2a2a2a] hover:bg-[#222] transition-colors flex items-center gap-1.5"
                  >
                    {currentPair}
                    <ChevronDown size={14} className={`text-gray-400 transition-transform ${showPairMenu ? 'rotate-180' : ''}`} />
                  </button>
                  <span className="text-gray-500 text-xs hidden sm:inline">Spot Trading</span>
                </div>
                <p className="text-gray-500 text-[11px] mt-0.5">{cryptoName} / Tether</p>
              </div>

              {showPairMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowPairMenu(false)} />
                  <div className="absolute top-full left-0 mt-2 z-50 w-56 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl shadow-xl overflow-hidden">
                    <div className="max-h-64 overflow-y-auto">
                      {pairs.length > 0 ? pairs.map(p => (
                        <button
                          key={p.id}
                          onClick={() => { setCurrentPair(p.symbol); setShowPairMenu(false); }}
                          className={`w-full text-left px-4 py-2.5 flex items-center justify-between hover:bg-[#222] transition-colors ${
                            p.symbol === currentPair ? 'bg-[#222] text-white' : 'text-gray-300'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <CryptoIcon symbol={p.base_asset} size="xs" />
                            <span className="font-semibold text-sm">{p.base_asset}</span>
                            <span className="text-gray-600">/</span>
                            <span className="text-gray-400 text-sm">{p.quote_asset}</span>
                          </div>
                          {p.symbol === currentPair && <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />}
                        </button>
                      )) : (
                        <div className="px-4 py-3 text-gray-500 text-xs">No pairs available</div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp size={16} className="text-green-400" />
              <span className="text-green-400 font-bold text-lg md:text-xl tabular-nums">
                {getFormattedPrice(baseAsset)}
              </span>
              <span className="text-gray-500 text-xs">{quoteAsset}</span>
            </div>
          </div>
        </div>
        <div className="border-t border-[#1e1e1e]">
          <MarketStatsBar symbol={baseAsset} />
        </div>
      </div>

      {/* Main Trading Area */}
      <div className="flex-1 w-full px-2 py-2 flex flex-col gap-2 min-h-0">
        {/* Top Row: Chart + Order Book */}
        <div className="flex flex-col lg:flex-row gap-2 lg:h-[520px] flex-shrink-0">
          {/* Price Chart */}
          <div className="flex-1 order-1 h-[350px] lg:h-full min-h-0" style={{ contain: 'layout style' }}>
            <PriceChart symbol={baseAsset} className="h-full w-full" />
          </div>

          {/* Order Book */}
          <div className="lg:w-[380px] xl:w-[420px] flex-shrink-0 order-2 bg-[#111] rounded-2xl border border-[#1e1e1e] h-[420px] lg:h-full min-h-0" style={{ contain: 'layout style' }}>
            <OrderBook pair={currentPair} className="h-full" onPriceSelect={setSelectedPrice} />
          </div>
        </div>

        {/* Bottom Row: Trading Form + Order Management */}
        <div className="flex flex-col lg:flex-row gap-2">
          <div className="lg:w-[400px] xl:w-[440px] flex-shrink-0">
            <TradingForm pair={currentPair} type="spot" tradingFeeRate={tradingFeeRate} suggestedPrice={selectedPrice} />
          </div>
          <div className="flex-1">
            <OrderManagement />
          </div>
        </div>
      </div>
    </div>
  );
}
