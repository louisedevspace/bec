import { useState, useEffect } from "react";
import { Link } from "wouter";
import { TradingForm } from "@/components/trading/trading-form";
import { OrderBook } from "@/components/trading/order-book";
import { OrderManagement } from "@/components/trading/order-management";
import { PriceChart } from "@/components/trading/price-chart";
import { MarketStatsBar } from "@/components/trading/market-stats-bar";
import { useCryptoPrices } from "@/hooks/use-crypto-prices";
import { TrendingUp, ChevronDown, BarChart3, Zap } from "lucide-react";
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
  XAU: "Gold",
};

type TradingMode = "spot" | "gold";

function GoldModeIcon({ size = 24 }: { size?: number }) {
  return (
    <div
      className="rounded-full flex items-center justify-center font-bold text-black flex-shrink-0"
      style={{
        width: size,
        height: size,
        background: "linear-gradient(135deg, #FFD700 0%, #FFA500 50%, #FFD700 100%)",
        fontSize: size * 0.38,
        boxShadow: "0 1px 4px rgba(255,215,0,0.4)",
      }}
    >
      Au
    </div>
  );
}

export default function ExchangePage() {
  const { getFormattedPrice } = useCryptoPrices();
  const [pairs, setPairs] = useState<SpotPair[]>([]);
  const [currentPair, setCurrentPair] = useState("BTC/USDT");
  const [showPairMenu, setShowPairMenu] = useState(false);
  const [selectedPrice, setSelectedPrice] = useState<string | null>(null);
  const [showMobileChart, setShowMobileChart] = useState(false);
  const [tradingMode, setTradingMode] = useState<TradingMode>("spot");
  const [goldEnabled, setGoldEnabled] = useState(false);

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

  useEffect(() => {
    fetch("/api/trading-pairs/gold")
      .then(res => res.ok ? res.json() : [])
      .then((data: SpotPair[]) => {
        const enabled = data.length > 0;
        setGoldEnabled(enabled);
        if (!enabled && tradingMode === "gold") setTradingMode("spot");
      })
      .catch(() => {});
  }, []);

  const baseAsset = currentPair.split("/")[0];
  const quoteAsset = currentPair.split("/")[1];
  const cryptoName = CRYPTO_NAMES[baseAsset] || baseAsset;
  const selectedPair = pairs.find((p) => p.symbol === currentPair);
  const tradingFeeRate = Number(selectedPair?.trading_fee || "0");

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Mode Tabs */}
      <div className="flex-shrink-0 bg-card border-b border-border px-3 py-2 overflow-x-auto">
        <div className="inline-flex items-center gap-1 bg-muted rounded-full p-1 min-w-max">
          <button
            onClick={() => setTradingMode("spot")}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-semibold transition-all duration-200 whitespace-nowrap ${
              tradingMode === "spot"
                ? "bg-card text-foreground shadow-sm animate-in fade-in zoom-in-95"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <TrendingUp size={14} />
            Spot
          </button>
          {goldEnabled && (
            <button
              onClick={() => setTradingMode("gold")}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-semibold transition-all duration-200 whitespace-nowrap ${
                tradingMode === "gold"
                  ? "bg-card text-warning shadow-sm animate-in fade-in zoom-in-95"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <GoldModeIcon size={14} />
              Gold
            </button>
          )}
          <Link
            href="/futures"
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-card/60 transition-all duration-200 whitespace-nowrap"
          >
            <Zap size={14} />
            Futures
          </Link>
        </div>
      </div>

      {/* Gold Mode */}
      {tradingMode === "gold" && (
        <>
          {/* Gold Header */}
          <div className="flex-shrink-0 bg-card border-b border-border">
            <div className="w-full px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <GoldModeIcon size={36} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-foreground text-sm font-semibold">XAU/USDT</span>
                      <span className="text-muted-foreground text-xs hidden sm:inline">Gold Spot</span>
                    </div>
                    <p className="text-muted-foreground text-[11px] mt-0.5">Gold / Tether</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <TrendingUp size={16} className="text-warning" />
                  <span className="text-warning font-bold text-lg md:text-xl tabular-nums">
                    {getFormattedPrice("XAU")}
                  </span>
                  <span className="text-muted-foreground text-xs">USDT</span>
                </div>
              </div>
            </div>
            <div className="border-t border-border">
              <MarketStatsBar symbol="XAU" />
            </div>
          </div>

          {/* Main Trading Area */}
          <div className="flex-1 w-full px-2 sm:px-3 py-2 sm:py-3 flex flex-col gap-2 sm:gap-3 min-h-0">
            {/* Top Row: Chart + Order Book */}
            <div className="flex flex-col md:flex-row gap-2 sm:gap-3 md:h-[480px] lg:h-[520px] flex-shrink-0">
              {/* Mobile Chart Toggle */}
              <button
                onClick={() => setShowMobileChart(!showMobileChart)}
                className="md:hidden flex items-center justify-center gap-2 py-2.5 rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors order-0"
              >
                <BarChart3 size={16} />
                <span className="text-xs font-medium">{showMobileChart ? "Hide Chart" : "Show Chart"}</span>
              </button>

              {/* Price Chart — Desktop/Tablet */}
              <div className="flex-1 order-1 min-h-0 relative z-10 hidden md:block md:h-full" style={{ contain: 'layout style' }}>
                <PriceChart symbol="XAU" className="h-full w-full" />
              </div>

              {/* Price Chart — Mobile */}
              {showMobileChart && (
                <div className="order-1 relative z-10 h-[350px] md:hidden">
                  <PriceChart symbol="XAU" className="h-full w-full" />
                </div>
              )}

              {/* Order Book */}
              <div className="md:w-[320px] lg:w-[380px] xl:w-[420px] flex-shrink-0 order-2 bg-card rounded-xl border border-border h-[420px] md:h-full min-h-0" style={{ contain: 'layout style' }}>
                <OrderBook pair="XAU/USDT" className="h-full" onPriceSelect={setSelectedPrice} />
              </div>
            </div>

            {/* Bottom Row: Trading Form + Order Management */}
            <div className="flex flex-col lg:flex-row lg:items-start gap-2 sm:gap-3">
              <div className="lg:w-[380px] xl:w-[440px] flex-shrink-0 lg:sticky lg:top-4">
                <TradingForm pair="XAU/USDT" type="spot" tradingFeeRate={0.002} suggestedPrice={selectedPrice} />
              </div>
              <div className="flex-1 min-w-0">
                <OrderManagement />
              </div>
            </div>
          </div>
        </>
      )}

      {/* Spot Mode */}
      {tradingMode === "spot" && (
        <>
          {/* Trading Pair Header */}
          <div className="flex-shrink-0 bg-card border-b border-border">
            <div className="w-full px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 relative min-w-0">
                  <CryptoIcon symbol={baseAsset} size="lg" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setShowPairMenu(!showPairMenu)}
                        className="bg-muted text-foreground text-sm font-semibold px-3 py-1 rounded-md border border-border hover:bg-muted/70 transition-colors flex items-center gap-1.5"
                      >
                        {currentPair}
                        <ChevronDown size={14} className={`text-muted-foreground transition-transform ${showPairMenu ? 'rotate-180' : ''}`} />
                      </button>
                      <span className="text-muted-foreground text-xs hidden sm:inline">Spot Trading</span>
                    </div>
                    <p className="text-muted-foreground text-[11px] mt-0.5">{cryptoName} / Tether</p>
                  </div>

                  {showPairMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowPairMenu(false)} />
                      <div className="absolute top-full left-0 mt-2 z-50 w-56 bg-popover border border-border rounded-xl shadow-sm overflow-hidden">
                        <div className="max-h-64 overflow-y-auto custom-scrollbar">
                          {pairs.length > 0 ? pairs.map(p => (
                            <button
                              key={p.id}
                              onClick={() => { setCurrentPair(p.symbol); setShowPairMenu(false); }}
                              className={`w-full text-left px-4 py-2.5 flex items-center justify-between hover:bg-muted transition-colors ${
                                p.symbol === currentPair ? 'bg-muted text-foreground' : 'text-foreground/80'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <CryptoIcon symbol={p.base_asset} size="xs" />
                                <span className="font-semibold text-sm">{p.base_asset}</span>
                                <span className="text-muted-foreground">/</span>
                                <span className="text-muted-foreground text-sm">{p.quote_asset}</span>
                              </div>
                              {p.symbol === currentPair && <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
                            </button>
                          )) : (
                            <div className="px-4 py-3 text-muted-foreground text-xs">No pairs available</div>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <TrendingUp size={16} className="text-buy" />
                  <span className="text-buy font-bold text-lg md:text-xl tabular-nums">
                    {getFormattedPrice(baseAsset)}
                  </span>
                  <span className="text-muted-foreground text-xs">{quoteAsset}</span>
                </div>
              </div>
            </div>
            <div className="border-t border-border">
              <MarketStatsBar symbol={baseAsset} />
            </div>
          </div>

          {/* Main Trading Area */}
          <div className="flex-1 w-full px-2 sm:px-3 py-2 sm:py-3 flex flex-col gap-2 sm:gap-3 min-h-0">
            {/* Top Row: Chart + Order Book */}
            <div className="flex flex-col md:flex-row gap-2 sm:gap-3 md:h-[480px] lg:h-[520px] flex-shrink-0">
              {/* Mobile Chart Toggle */}
              <button
                onClick={() => setShowMobileChart(!showMobileChart)}
                className="md:hidden flex items-center justify-center gap-2 py-2.5 rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors order-0"
              >
                <BarChart3 size={16} />
                <span className="text-xs font-medium">{showMobileChart ? "Hide Chart" : "Show Chart"}</span>
              </button>

              {/* Price Chart — Desktop/Tablet: always visible */}
              <div className="flex-1 order-1 min-h-0 relative z-10 hidden md:block md:h-full" style={{ contain: 'layout style' }}>
                <PriceChart symbol={baseAsset} className="h-full w-full" />
              </div>

              {/* Price Chart — Mobile: only when toggled */}
              {showMobileChart && (
                <div className="order-1 relative z-10 h-[350px] md:hidden">
                  <PriceChart symbol={baseAsset} className="h-full w-full" />
                </div>
              )}

              {/* Order Book */}
              <div className="md:w-[320px] lg:w-[380px] xl:w-[420px] flex-shrink-0 order-2 bg-card rounded-xl border border-border h-[420px] md:h-full min-h-0" style={{ contain: 'layout style' }}>
                <OrderBook pair={currentPair} className="h-full" onPriceSelect={setSelectedPrice} />
              </div>
            </div>

            {/* Bottom Row: Trading Form + Order Management */}
            <div className="flex flex-col lg:flex-row lg:items-start gap-2 sm:gap-3">
              <div className="lg:w-[380px] xl:w-[440px] flex-shrink-0 lg:sticky lg:top-4">
                <TradingForm pair={currentPair} type="spot" tradingFeeRate={tradingFeeRate} suggestedPrice={selectedPrice} />
              </div>
              <div className="flex-1 min-w-0">
                <OrderManagement />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
