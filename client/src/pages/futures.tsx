import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useUser } from '@/hooks/use-user';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { TrendingUp, TrendingDown, RefreshCw, Info, ChevronDown, BarChart3 } from 'lucide-react';
import { OrderBook } from '@/components/trading/order-book';
import { PriceChart } from '@/components/trading/price-chart';
import { useCryptoPrices } from '@/hooks/use-crypto-prices';
import { FutureTradeTimerModal } from '@/components/modals/future-trade-timer-modal';
import { formatUsdNumber } from '@/utils/format-utils';
import { CryptoIcon } from '@/components/crypto/crypto-icon';
import { MarketStatsBar } from '@/components/trading/market-stats-bar';

interface FuturesTrade {
  id: number;
  symbol: string;
  amount: number;
  duration: number;
  side: 'long' | 'short';
  profit_ratio: number;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  entry_price: number;
  exit_price?: number;
  final_amount?: number;
  is_loss?: boolean;
  loss_amount?: number;
  profit_loss?: number;
  final_result?: 'win' | 'loss';
  final_profit?: number;
  fee_amount?: string;
  fee_rate?: string;
  trade_intervals?: { balance_before?: number; balance_after?: number };
  created_at: string;
  expires_at?: string;
}

interface FuturesPairOption {
  id: number;
  symbol: string;
  base_asset: string;
  quote_asset: string;
}

interface TimeLimitConfig {
  duration: number;
  minAmount: number;
  isActive: boolean;
}

interface TimeLimitsResponse {
  limits: TimeLimitConfig[];
  defaultMinAmount: number;
  enabled: boolean;
}

const durationOptions = [
  { value: 60, label: '60 Sec', profitRatio: 30 },
  { value: 120, label: '120 Sec', profitRatio: 40 },
  { value: 180, label: '180 Sec', profitRatio: 50 },
  { value: 240, label: '240 Sec', profitRatio: 60 },
  { value: 360, label: '360 Sec', profitRatio: 70 },
  { value: 480, label: '480 Sec', profitRatio: 80 },
  { value: 600, label: '600 Sec', profitRatio: 100 },
];

export default function FuturesPage() {
  const { user } = useUser();
  const { toast } = useToast();
  const { getFormattedPrice, getPriceBySymbol } = useCryptoPrices();
  const [trades, setTrades] = useState<FuturesTrade[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Trading form state
  const [side, setSide] = useState<'long' | 'short'>('long');
  const [amount, setAmount] = useState('');

  // Timer modal state
  const [showTimerModal, setShowTimerModal] = useState(false);
  const [timerTradeData, setTimerTradeData] = useState<any>(null);
  const [duration, setDuration] = useState<number>(60);
  const [availableBalance, setAvailableBalance] = useState<number>(0);
  const [tradeLimits, setTradeLimits] = useState<{ is_enabled: boolean; min_amount: number; max_amount: number } | null>(null);

  // Time-based limits state
  const [timeLimitsConfig, setTimeLimitsConfig] = useState<TimeLimitsResponse | null>(null);

  // Trade details modal state
  const [showTradeDetailsModal, setShowTradeDetailsModal] = useState(false);
  const [selectedTrade, setSelectedTrade] = useState<FuturesTrade | null>(null);
  const [selectedTradeNumber, setSelectedTradeNumber] = useState<number>(0);
  const [activeTradeTab, setActiveTradeTab] = useState<"open" | "closed">("open");
  const [sideFilter, setSideFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");

  // Dynamic pair state
  const [futuresPairs, setFuturesPairs] = useState<FuturesPairOption[]>([]);
  const [currentPair, setCurrentPair] = useState('BTC/USDT');
  const [showPairMenu, setShowPairMenu] = useState(false);
  const [showMobileChart, setShowMobileChart] = useState(false);

  const baseAsset = currentPair.split('/')[0];
  const quoteAsset = currentPair.split('/')[1];

  const livePrice = getPriceBySymbol(baseAsset);
  const currentPrice = livePrice ? parseFloat(livePrice.price) : 0;

  const selectedDuration = durationOptions.find(d => d.value === duration);
  const profitRatio = selectedDuration?.profitRatio || 30;

  const getEffectiveMinimum = (durationValue: number) => {
    if (!timeLimitsConfig?.enabled) return timeLimitsConfig?.defaultMinAmount ?? 50;
    const limitForDuration = timeLimitsConfig.limits.find(l => l.duration === durationValue && l.isActive);
    return limitForDuration?.minAmount ?? timeLimitsConfig.defaultMinAmount;
  };

  const effectiveMinAmount = getEffectiveMinimum(duration);

  const isDurationActive = (durationValue: number) => {
    if (!timeLimitsConfig?.enabled) return true;
    const limitForDuration = timeLimitsConfig.limits.find(l => l.duration === durationValue);
    return limitForDuration?.isActive ?? true;
  };

  // Helper: determine if a completed trade was a win
  const isTradeWin = (trade: FuturesTrade) => {
    if (trade.final_result === 'win') return true;
    if (trade.final_result === 'loss') return false;
    return (trade.profit_loss ?? 0) >= 0;
  };

  const fetchTrades = async () => {
    if (!user) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('No authentication token available');

      const response = await fetch(`/api/future-trades?t=${Date.now()}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (!response.ok) throw new Error('Failed to fetch trades');
      const data = await response.json();
      setTrades(data || []);
    } catch (error) {
      console.error('Error fetching trades:', error);
      toast({ title: 'Error', description: 'Failed to fetch trades.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchBalance = async () => {
    if (!user) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('No authentication token available');

      const response = await fetch(`/api/portfolio/${user.id}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (response.ok) {
        const data = await response.json();
        const usdtBalance = data.find((p: any) => p.symbol === 'USDT');
        setAvailableBalance(usdtBalance ? parseFloat(usdtBalance.available) : 0);
      }
    } catch (error) {
      console.error('Error fetching balance:', error);
    }
  };

  const fetchTradingLimits = async () => {
    if (!user) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch(`/api/trading-limits/me?symbol=${encodeURIComponent(currentPair)}&type=futures`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTradeLimits(data);
      }
    } catch { /* keep defaults */ }
  };

  const fetchTimeLimits = async () => {
    try {
      const res = await fetch('/api/futures-time-limits');
      if (res.ok) {
        const data = await res.json();
        setTimeLimitsConfig(data);
      }
    } catch { /* keep defaults */ }
  };

  useEffect(() => {
    fetch('/api/trading-pairs/futures')
      .then(res => res.ok ? res.json() : [])
      .then((data: FuturesPairOption[]) => {
        if (data.length > 0) {
          setFuturesPairs(data);
          if (!data.find(p => p.symbol === currentPair)) setCurrentPair(data[0].symbol);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => { fetchTrades(); fetchBalance(); fetchTimeLimits(); }, [user]);
  useEffect(() => { fetchTradingLimits(); }, [user, currentPair]);
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(fetchTrades, 10000);
    return () => clearInterval(interval);
  }, [user]);
  useEffect(() => {
    if (!user) return;
    const handleFocus = () => fetchTrades();
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [user]);

  const handleTradeSubmitted = () => { fetchTrades(); fetchBalance(); };

  const handleShowTradeDetails = (trade: FuturesTrade, tradeNumber: number) => {
    setSelectedTrade(trade);
    setSelectedTradeNumber(tradeNumber);
    setShowTradeDetailsModal(true);
  };

  const formatDateTime = (dateString: string | undefined) => {
    if (!dateString) return 'N/A';
    try {
      let date;
      if (!dateString.includes('Z')) {
        const cleanDateString = dateString.replace(/[+-]\d{2}:\d{2}$/, '');
        date = new Date(cleanDateString + 'Z');
      } else {
        date = new Date(dateString);
      }
      if (isNaN(date.getTime())) return 'Invalid Date';
      return date.toLocaleString(undefined, {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
      });
    } catch { return 'Invalid Date'; }
  };

  const handleSubmitTrade = async () => {
    if (!user) {
      toast({ title: 'Error', description: 'You must be logged in to place a trade.', variant: 'destructive' });
      return;
    }

    const tradeAmount = parseFloat(amount);

    if (tradeLimits && !tradeLimits.is_enabled) {
      toast({ title: 'Trading Restricted', description: `Futures trading is currently disabled for ${currentPair}.`, variant: 'destructive' });
      return;
    }

    if (!isDurationActive(duration)) {
      toast({ title: 'Error', description: 'Selected duration is not available.', variant: 'destructive' });
      return;
    }

    const effectiveMin = tradeLimits?.min_amount
      ? Math.max(effectiveMinAmount, tradeLimits.min_amount)
      : effectiveMinAmount;
    if (!amount || isNaN(tradeAmount) || tradeAmount < effectiveMin) {
      toast({ title: 'Error', description: `Minimum trade amount is ${effectiveMin} USDT for ${duration}s duration.`, variant: 'destructive' });
      return;
    }

    if (tradeLimits?.max_amount && tradeAmount > tradeLimits.max_amount) {
      toast({ title: 'Error', description: `Maximum trade amount is ${tradeLimits.max_amount} USDT.`, variant: 'destructive' });
      return;
    }

    if (tradeAmount > availableBalance) {
      toast({ title: 'Error', description: 'Insufficient balance.', variant: 'destructive' });
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('No authentication token available');

      setAmount('');

      const response = await fetch('/api/future-trade/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ symbol: currentPair, amount: tradeAmount, duration, side, profitRatio }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to submit trade');
      }

      const responseData = await response.json();

      setTimerTradeData({
        id: responseData.trade?.id || Date.now(),
        symbol: currentPair, side, amount: tradeAmount.toString(),
        price: currentPrice.toString(), duration,
        currentPrice: currentPrice.toString(),
        profit_ratio: profitRatio,
      });
      setShowTimerModal(true);
      handleTradeSubmitted();
      fetchTrades();
      fetchBalance();
    } catch (error) {
      console.error('Error submitting trade:', error);
      toast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to submit trade.', variant: 'destructive' });
      setAmount(tradeAmount.toString());
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
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
                  <span className="text-muted-foreground text-xs hidden sm:inline">Futures Trading</span>
                </div>
                <p className="text-muted-foreground text-[11px] mt-0.5">{baseAsset} / Tether</p>
              </div>

              {showPairMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowPairMenu(false)} />
                  <div className="absolute top-full left-0 mt-2 z-50 w-56 bg-popover border border-border rounded-xl shadow-sm overflow-hidden">
                    <div className="max-h-64 overflow-y-auto custom-scrollbar">
                      {futuresPairs.length > 0 ? futuresPairs.map(p => (
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
                        <div className="px-4 py-3 text-muted-foreground text-xs">No futures pairs available</div>
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
        {/* Top Row: Chart + Order Book - same responsive pattern as spot exchange */}
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

          {/* Price Chart — Mobile: only when toggled (mounts fresh with real 350px height) */}
          {showMobileChart && (
            <div className="order-1 relative z-10 h-[350px] md:hidden">
              <PriceChart symbol={baseAsset} className="h-full w-full" />
            </div>
          )}

          {/* Order Book */}
          <div className="md:w-[320px] lg:w-[380px] xl:w-[420px] flex-shrink-0 order-2 bg-card rounded-xl border border-border h-[420px] md:h-full min-h-0" style={{ contain: 'layout style' }}>
            <OrderBook pair={currentPair} className="h-full" />
          </div>
        </div>

        {/* Bottom Row: Futures Trading Form + Order Management */}
        <div className="flex flex-col lg:flex-row lg:items-start gap-2 sm:gap-3">
          {/* Futures Trading Form */}
          <div className="lg:w-[380px] xl:w-[440px] flex-shrink-0 lg:sticky lg:top-4">
            <div className="bg-card rounded-xl border border-border p-4">
              <h3 className="text-sm font-semibold text-foreground mb-4">Futures Trading</h3>
              <div className="space-y-4">
                {/* Long/Short Buttons */}
                <div className="flex gap-2">
                  <button type="button" onClick={() => setSide('long')}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                      side === 'long' ? 'bg-buy text-success-foreground' : 'bg-muted text-muted-foreground border border-border hover:text-foreground'
                    }`}>LONG</button>
                  <button type="button" onClick={() => setSide('short')}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                      side === 'short' ? 'bg-sell text-danger-foreground' : 'bg-muted text-muted-foreground border border-border hover:text-foreground'
                    }`}>SHORT</button>
                </div>

                {/* Trade Description */}
                <div className="bg-muted/40 rounded-lg px-3 py-2 border border-border">
                  <p className="text-[11px] text-muted-foreground">
                    {side === 'long' ? `Open Long position on ${baseAsset}` : `Open Short position on ${baseAsset}`} at market price
                  </p>
                  <p className="text-[11px] text-muted-foreground/70 mt-1 tabular-nums">Profit Rate: {profitRatio.toFixed(2)}%</p>
                </div>

                {/* Transaction Mode */}
                <div>
                  <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block">Transaction Mode</label>
                  <Select defaultValue="usdt">
                    <SelectTrigger className="h-10 bg-background border-border rounded-lg text-foreground text-sm focus:ring-1 focus:ring-ring">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border">
                      <SelectItem value="usdt">USDT</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Amount */}
                <div>
                  <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block">Amount (USDT)</label>
                  <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="h-10 bg-background border-border rounded-lg text-foreground text-sm tabular-nums focus:ring-1 focus:ring-ring" />
                </div>

                {/* Duration */}
                <div>
                  <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block">Duration</label>
                  <Select value={duration.toString()} onValueChange={(value) => setDuration(parseInt(value))}>
                    <SelectTrigger className="h-10 bg-background border-border rounded-lg text-foreground text-sm focus:ring-1 focus:ring-ring">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border">
                      {durationOptions.map((option) => {
                        const isActive = isDurationActive(option.value);
                        const minForDuration = getEffectiveMinimum(option.value);
                        return (
                          <SelectItem key={option.value} value={option.value.toString()}
                            disabled={!isActive} className={!isActive ? 'opacity-50 cursor-not-allowed' : ''}>
                            <span className="flex items-center justify-between w-full gap-2">
                              <span>{option.label}</span>
                              {timeLimitsConfig?.enabled && (
                                <span className="text-[10px] text-muted-foreground tabular-nums">min ${minForDuration}</span>
                              )}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                {/* Available Balance */}
                <div className="flex justify-between items-center bg-muted/40 rounded-lg px-3 py-2.5 border border-border">
                  <span className="text-muted-foreground text-xs">Available</span>
                  <span className="text-foreground text-xs font-medium tabular-nums">{formatUsdNumber(availableBalance)} USDT</span>
                </div>

                {/* Min Limit Info */}
                <div className="flex justify-between items-center bg-muted/40 rounded-lg px-3 py-2.5 border border-border">
                  <span className="text-muted-foreground text-xs">Minimum</span>
                  <span className="text-foreground/80 text-xs font-medium tabular-nums">{formatUsdNumber(effectiveMinAmount)} USDT</span>
                </div>

                {/* Submit Button */}
                <button type="button" onClick={handleSubmitTrade}
                  disabled={!amount || parseFloat(amount) < effectiveMinAmount || parseFloat(amount) > availableBalance || !isDurationActive(duration)}
                  className={`w-full py-3 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${
                    side === 'long' ? 'bg-buy hover:bg-buy/90 text-success-foreground' : 'bg-sell hover:bg-sell/90 text-danger-foreground'
                  }`}>
                  {!isDurationActive(duration) ? 'Duration Not Available'
                    : !amount || parseFloat(amount) < effectiveMinAmount ? `Min ${effectiveMinAmount} USDT`
                    : parseFloat(amount) > availableBalance ? 'Insufficient Balance'
                    : `CONFIRM ${side.toUpperCase()}`}
                </button>
              </div>
            </div>
          </div>

          {/* Order Management */}
          <div className="flex-1 min-w-0">
            <div className="bg-card rounded-xl border border-border">
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-foreground">Order Management</h3>
                  <button onClick={() => { fetchTrades(); fetchBalance(); }} className="p-1.5 rounded-md hover:bg-muted transition-colors" title="Refresh">
                    <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 bg-muted/60 rounded-full p-1">
                  <button onClick={() => setActiveTradeTab("open")}
                    className={`flex-1 py-2 rounded-full text-xs font-medium transition-all duration-200 ${
                      activeTradeTab === "open" ? "bg-card text-foreground shadow-sm animate-in fade-in zoom-in-95" : "text-muted-foreground hover:text-foreground"
                    }`}>
                    Open Positions
                    {trades.filter(t => t.status === 'pending').length > 0 && (
                      <span className="ml-1.5 text-[10px] bg-warning/15 text-warning px-1.5 py-0.5 rounded-full">
                        {trades.filter(t => t.status === 'pending').length}
                      </span>
                    )}
                  </button>
                  <button onClick={() => setActiveTradeTab("closed")}
                    className={`flex-1 py-2 rounded-full text-xs font-medium transition-all duration-200 ${
                      activeTradeTab === "closed" ? "bg-card text-foreground shadow-sm animate-in fade-in zoom-in-95" : "text-muted-foreground hover:text-foreground"
                    }`}>
                    Trade History
                  </button>
                </div>

                {/* Filters Row */}
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <select value={sideFilter} onChange={e => setSideFilter(e.target.value)}
                    className="px-2 py-1.5 rounded-md text-xs bg-card border border-border text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors focus:outline-none appearance-none cursor-pointer">
                    <option value="all">All Sides</option>
                    <option value="long">Long</option>
                    <option value="short">Short</option>
                  </select>
                  {activeTradeTab === "closed" && (
                    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                      className="px-2 py-1.5 rounded-md text-xs bg-card border border-border text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors focus:outline-none appearance-none cursor-pointer">
                      <option value="all">All Status</option>
                      <option value="completed">Completed</option>
                      <option value="approved">Approved</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  )}
                  <button onClick={() => setSortOrder(s => s === "newest" ? "oldest" : "newest")}
                    className="px-2 py-1.5 rounded-md text-xs bg-card border border-border text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors">
                    {sortOrder === "newest" ? "Newest" : "Oldest"}
                  </button>
                </div>
              </div>

              {/* Order List */}
              <div className="px-4 pb-2">
                {isLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="bg-muted/40 rounded-lg p-4 border border-border animate-pulse">
                        <div className="flex items-center justify-between">
                          <div className="space-y-2">
                            <div className="h-4 w-28 bg-muted rounded" />
                            <div className="h-3 w-20 bg-muted rounded" />
                          </div>
                          <div className="h-5 w-16 bg-muted rounded-full" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (() => {
                  let filtered = activeTradeTab === "open"
                    ? trades.filter(t => t.status === 'pending')
                    : trades.filter(t => t.status !== 'pending');

                  if (sideFilter !== "all") filtered = filtered.filter(t => t.side === sideFilter);
                  if (activeTradeTab === "closed" && statusFilter !== "all") filtered = filtered.filter(t => t.status === statusFilter);

                  filtered.sort((a, b) => {
                    const da = new Date(a.created_at).getTime();
                    const db = new Date(b.created_at).getTime();
                    return sortOrder === "newest" ? db - da : da - db;
                  });

                  if (filtered.length === 0) {
                    return (
                      <div className="text-center py-10">
                        <div className="w-12 h-12 bg-muted border border-border rounded-lg mx-auto mb-3 flex items-center justify-center">
                          <Info size={20} className="text-muted-foreground" />
                        </div>
                        <p className="text-muted-foreground text-sm">{activeTradeTab === "open" ? "No open positions" : "No trade history"}</p>
                        <p className="text-muted-foreground/70 text-xs mt-1">
                          {activeTradeTab === "open" ? "Your active futures positions will appear here" : "Your completed futures trades will appear here"}
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1 custom-scrollbar">
                      {filtered.map((trade) => (
                        <div key={trade.id} className="bg-muted/40 rounded-lg p-3 border border-border hover:border-foreground/20 transition-colors">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <div className={`w-7 h-7 rounded-md flex items-center justify-center ${trade.side === 'long' ? 'bg-buy/10' : 'bg-sell/10'}`}>
                                {trade.side === 'long' ? <TrendingUp size={14} className="text-buy" /> : <TrendingDown size={14} className="text-sell" />}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <CryptoIcon symbol={trade.symbol.split('/')[0]} size="xs" />
                                  <span className="text-foreground font-medium text-sm">{trade.symbol}</span>
                                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${trade.side === 'long' ? 'bg-buy/10 text-buy' : 'bg-sell/10 text-sell'}`}>
                                    {trade.side.toUpperCase()}
                                  </span>
                                </div>
                                <div className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">
                                  {formatUsdNumber(trade.amount)} USDT · {trade.duration}s
                                  {trade.profit_loss !== undefined && trade.status !== 'pending' && (
                                    <span className={`ml-2 font-medium ${isTradeWin(trade) ? 'text-buy' : 'text-sell'}`}>
                                      {isTradeWin(trade) ? '+' : '-'}{formatUsdNumber(Math.abs(trade.profit_loss))}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="text-right mr-1">
                                <div className="text-[10px] text-muted-foreground/70 tabular-nums">{formatDateTime(trade.created_at)}</div>
                              </div>
                              <span className={`text-[10px] font-medium px-2 py-1 rounded-full ${
                                trade.status === 'pending' ? 'bg-warning/15 text-warning' :
                                trade.status === 'completed' ? 'bg-buy/10 text-buy' :
                                trade.status === 'rejected' ? 'bg-sell/10 text-sell' : 'bg-info/10 text-info'
                              }`}>
                                {trade.status.charAt(0).toUpperCase() + trade.status.slice(1)}
                              </span>
                              <button onClick={() => handleShowTradeDetails(trade, trades.length - trades.indexOf(trade))}
                                className="p-1 rounded-md hover:bg-muted transition-colors" title="Trade details">
                                <Info className="h-3.5 w-3.5 text-muted-foreground" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Future Trade Timer Modal */}
      {timerTradeData && (
        <FutureTradeTimerModal
          isOpen={showTimerModal}
          onClose={() => { setShowTimerModal(false); setTimerTradeData(null); }}
          onComplete={() => handleTradeSubmitted()}
          tradeData={timerTradeData}
        />
      )}

      {/* Trade Details Modal */}
      {selectedTrade && (
        <Dialog open={showTradeDetailsModal} onOpenChange={(open) => { if (!open) setShowTradeDetailsModal(false); }}>
          <DialogContent className="max-w-md p-5" hideCloseButton>
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-base font-semibold text-foreground">Trade Details</h3>
              <button onClick={() => setShowTradeDetailsModal(false)}
                className="h-7 w-7 flex items-center justify-center rounded-md bg-muted hover:bg-muted/70 text-muted-foreground transition-colors text-lg">
                ×
              </button>
            </div>

            <div className="space-y-3">
              {/* Trade Header */}
              <div className="flex items-center gap-3 bg-muted/40 rounded-lg p-3 border border-border">
                <CryptoIcon symbol={selectedTrade.symbol.split('/')[0]} size="sm" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-foreground font-semibold text-sm">{selectedTrade.symbol}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                      selectedTrade.side === 'long' ? 'bg-buy/10 text-buy' : 'bg-sell/10 text-sell'
                    }`}>{selectedTrade.side.toUpperCase()}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">Trade #{selectedTradeNumber}</span>
                </div>
                <div className={`text-xs font-medium px-2 py-1 rounded ${
                  selectedTrade.status === 'completed' ? 'bg-buy/10 text-buy' :
                  selectedTrade.status === 'rejected' ? 'bg-sell/10 text-sell' :
                  selectedTrade.status === 'pending' ? 'bg-warning/15 text-warning' : 'bg-info/10 text-info'
                }`}>{selectedTrade.status.charAt(0).toUpperCase() + selectedTrade.status.slice(1)}</div>
              </div>

              {/* Timestamps */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted/40 rounded-lg p-3 border border-border">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Opened</label>
                  <div className="text-foreground text-xs mt-0.5">{formatDateTime(selectedTrade.created_at)}</div>
                </div>
                <div className="bg-muted/40 rounded-lg p-3 border border-border">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Closed</label>
                  <div className="text-foreground text-xs mt-0.5">{formatDateTime(selectedTrade.expires_at)}</div>
                </div>
              </div>

              {/* Trade Parameters */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-muted/40 rounded-lg p-3 border border-border text-center">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Amount</label>
                  <div className="text-foreground font-semibold text-sm mt-0.5 tabular-nums">{formatUsdNumber(selectedTrade.amount)}</div>
                  <span className="text-[10px] text-muted-foreground/70">USDT</span>
                </div>
                <div className="bg-muted/40 rounded-lg p-3 border border-border text-center">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Duration</label>
                  <div className="text-foreground font-semibold text-sm mt-0.5">{selectedTrade.duration || 0}s</div>
                </div>
                <div className="bg-muted/40 rounded-lg p-3 border border-border text-center">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Profit Ratio</label>
                  <div className="text-buy font-semibold text-sm mt-0.5 tabular-nums">{selectedTrade.profit_ratio || 0}%</div>
                </div>
              </div>

              {/* Price Info */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted/40 rounded-lg p-3 border border-border">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Entry Price</label>
                  <div className="text-foreground font-medium text-sm mt-0.5 tabular-nums">
                    ${selectedTrade.entry_price ? formatUsdNumber(selectedTrade.entry_price) : 'N/A'}
                  </div>
                </div>
                <div className="bg-muted/40 rounded-lg p-3 border border-border">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Exit Price</label>
                  <div className="text-foreground font-medium text-sm mt-0.5 tabular-nums">
                    ${selectedTrade.exit_price ? formatUsdNumber(selectedTrade.exit_price) : 'N/A'}
                  </div>
                </div>
              </div>

              {/* Trade Result - completed trades */}
              {selectedTrade.status === 'completed' && selectedTrade.profit_loss !== undefined && selectedTrade.profit_loss !== null && (
                <>
                  <div className="border-t border-border my-2" />
                  <div className={`rounded-lg p-3 border ${
                    isTradeWin(selectedTrade) ? 'bg-buy/5 border-buy/20' : 'bg-sell/5 border-sell/20'
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                        {isTradeWin(selectedTrade) ? 'Profit' : 'Loss'}
                      </span>
                      <span className={`text-base tabular-nums font-bold ${isTradeWin(selectedTrade) ? 'text-buy' : 'text-sell'}`}>
                        {isTradeWin(selectedTrade) ? '+' : '-'}{formatUsdNumber(Math.abs(selectedTrade.profit_loss!))} USDT
                      </span>
                    </div>
                    {parseFloat(selectedTrade.fee_amount || '0') > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground">Fee {selectedTrade.fee_rate ? `(${(parseFloat(selectedTrade.fee_rate) * 100).toFixed(2)}%)` : ''}</span>
                        <span className="text-[10px] text-muted-foreground tabular-nums">-{formatUsdNumber(parseFloat(selectedTrade.fee_amount || '0'))} USDT</span>
                      </div>
                    )}
                  </div>

                  {selectedTrade.trade_intervals?.balance_before != null && (
                    <div className="bg-muted/40 rounded-lg p-3 border border-border">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Balance Before</span>
                          <span className="text-xs text-foreground/80 tabular-nums">{formatUsdNumber(selectedTrade.trade_intervals.balance_before!)} USDT</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Balance After</span>
                          <span className="text-sm text-foreground font-bold tabular-nums">
                            {formatUsdNumber(selectedTrade.trade_intervals.balance_after ?? (selectedTrade.trade_intervals.balance_before! + selectedTrade.profit_loss))} USDT
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Simple P&L for non-completed */}
              {selectedTrade.status !== 'completed' && selectedTrade.profit_loss !== undefined && selectedTrade.profit_loss !== null && (
                <div className={`rounded-lg p-3 border ${
                  isTradeWin(selectedTrade) ? 'bg-buy/5 border-buy/20' : 'bg-sell/5 border-sell/20'
                }`}>
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Profit/Loss</label>
                  <div className={`font-semibold text-base mt-0.5 tabular-nums ${isTradeWin(selectedTrade) ? 'text-buy' : 'text-sell'}`}>
                    {isTradeWin(selectedTrade) ? '+' : '-'}{formatUsdNumber(Math.abs(selectedTrade.profit_loss))} USDT
                  </div>
                </div>
              )}
            </div>

            <div className="mt-5">
              <Button onClick={() => setShowTradeDetailsModal(false)}
                className="w-full bg-muted hover:bg-muted/70 text-foreground rounded-lg py-2.5 text-sm border border-border">
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
