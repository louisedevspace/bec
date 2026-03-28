import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUser } from '@/hooks/use-user';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { TrendingUp, TrendingDown, RefreshCw, Info, ChevronDown } from 'lucide-react';
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

  const baseAsset = currentPair.split('/')[0];
  const quoteAsset = currentPair.split('/')[1];

  // Get live current price for selected pair
  const livePrice = getPriceBySymbol(baseAsset);
  const currentPrice = livePrice ? parseFloat(livePrice.price) : 0;

  const selectedDuration = durationOptions.find(d => d.value === duration);
  const profitRatio = selectedDuration?.profitRatio || 30;

  // Calculate effective minimum based on time-based limits only
  const getEffectiveMinimum = (durationValue: number) => {
    if (!timeLimitsConfig?.enabled) return timeLimitsConfig?.defaultMinAmount ?? 50;
    const limitForDuration = timeLimitsConfig.limits.find(l => l.duration === durationValue && l.isActive);
    return limitForDuration?.minAmount ?? timeLimitsConfig.defaultMinAmount;
  };

  const effectiveMinAmount = getEffectiveMinimum(duration);

  // Check if a duration is active (available for selection)
  const isDurationActive = (durationValue: number) => {
    if (!timeLimitsConfig?.enabled) return true;
    const limitForDuration = timeLimitsConfig.limits.find(l => l.duration === durationValue);
    return limitForDuration?.isActive ?? true;
  };

  const fetchTrades = async () => {
    if (!user) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      if (!token) {
        throw new Error('No authentication token available');
      }

      console.log('🔄 Fetching futures trades...');
      const response = await fetch(`/api/future-trades?t=${Date.now()}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        throw new Error('Failed to fetch trades');
      }
      const data = await response.json();
      setTrades(data || []);
    } catch (error) {
      console.error('Error fetching trades:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch trades.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchBalance = async () => {
    if (!user) return;
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      if (!token) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(`/api/portfolio/${user.id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        const usdtBalance = data.find((p: any) => p.symbol === 'USDT');
        const balance = usdtBalance ? parseFloat(usdtBalance.available) : 0;
        setAvailableBalance(balance);
      } else {
        console.error('Portfolio API error:', response.status);
      }
    } catch (error) {
      console.error('Error fetching balance:', error);
    }
  };


  // Fetch trading limits for current pair
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
        // Use the higher of old min setting and new limits min
        if (data?.min_amount) {
          // Trading limits from admin can still apply as a floor
        }
      }
    } catch { /* keep defaults */ }
  };

  // Fetch time-based limits
  const fetchTimeLimits = async () => {
    try {
      const res = await fetch('/api/futures-time-limits');
      if (res.ok) {
        const data = await res.json();
        setTimeLimitsConfig(data);
      }
    } catch { /* keep defaults */ }
  };

  // Fetch available futures pairs
  useEffect(() => {
    fetch('/api/trading-pairs/futures')
      .then(res => res.ok ? res.json() : [])
      .then((data: FuturesPairOption[]) => {
        if (data.length > 0) {
          setFuturesPairs(data);
          if (!data.find(p => p.symbol === currentPair)) {
            setCurrentPair(data[0].symbol);
          }
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchTrades();
    fetchBalance();
    fetchTimeLimits();
  }, [user]);

  // Fetch trading limits when user or pair changes
  useEffect(() => {
    fetchTradingLimits();
  }, [user, currentPair]);

  // Auto-refresh trades every 10 seconds to show real-time updates
  useEffect(() => {
    if (!user) return;
    
    const interval = setInterval(() => {
      fetchTrades();
    }, 10000); // Refresh every 10 seconds

    return () => clearInterval(interval);
  }, [user]);

  // Refresh trades when user returns to the tab
  useEffect(() => {
    if (!user) return;
    
    const handleFocus = () => {
      fetchTrades();
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [user]);

  const handleTradeSubmitted = () => {
    fetchTrades();
    fetchBalance();
  };

  const handleShowTradeDetails = (trade: FuturesTrade, tradeNumber: number) => {
    setSelectedTrade(trade);
    setSelectedTradeNumber(tradeNumber);
    setShowTradeDetailsModal(true);
  };

  // Helper function to format dates consistently in user's timezone
  const formatDateTime = (dateString: string | undefined) => {
    if (!dateString) return 'N/A';
    
    try {
      let date;
      
      // Normalize to UTC interpretation
      if (!dateString.includes('Z')) {
        const cleanDateString = dateString.replace(/[+-]\d{2}:\d{2}$/, '');
        date = new Date(cleanDateString + 'Z');
      } else {
        date = new Date(dateString);
      }
      
      if (isNaN(date.getTime())) return 'Invalid Date';
      
      return date.toLocaleString(undefined, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });
    } catch {
      return 'Invalid Date';
    }
  };

  const handleSubmitTrade = async () => {
    if (!user) {
      toast({
        title: 'Error',
        description: 'You must be logged in to place a trade.',
        variant: 'destructive',
      });
      return;
    }

    const tradeAmount = parseFloat(amount);

    // Check trading limits from admin settings
    if (tradeLimits && !tradeLimits.is_enabled) {
      toast({
        title: 'Trading Restricted',
        description: `Futures trading is currently disabled for ${currentPair}.`,
        variant: 'destructive',
      });
      return;
    }

    // Check if selected duration is active
    if (!isDurationActive(duration)) {
      toast({
        title: 'Error',
        description: 'Selected duration is not available.',
        variant: 'destructive',
      });
      return;
    }

    const effectiveMin = tradeLimits?.min_amount 
      ? Math.max(effectiveMinAmount, tradeLimits.min_amount) 
      : effectiveMinAmount;
    if (!amount || isNaN(tradeAmount) || tradeAmount < effectiveMin) {
      toast({
        title: 'Error',
        description: `Minimum trade amount is ${effectiveMin} USDT for ${duration}s duration.`,
        variant: 'destructive',
      });
      return;
    }

    if (tradeLimits?.max_amount && tradeAmount > tradeLimits.max_amount) {
      toast({
        title: 'Error',
        description: `Maximum trade amount is ${tradeLimits.max_amount} USDT.`,
        variant: 'destructive',
      });
      return;
    }

    if (tradeAmount > availableBalance) {
      toast({
        title: 'Error',
        description: 'Insufficient balance.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      if (!token) {
        throw new Error('No authentication token available');
      }

      // Optimistically update UI immediately
      setAmount('');
      
      const response = await fetch('/api/future-trade/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          symbol: currentPair,
          amount: tradeAmount,
          duration,
          side,
          profitRatio,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to submit trade');
      }

      const responseData = await response.json();
      
      // Show timer modal with trade data
      setTimerTradeData({
        id: responseData.trade?.id || Date.now(),
        symbol: currentPair,
        side,
        amount: tradeAmount.toString(),
        price: currentPrice.toString(),
        duration,
        currentPrice: currentPrice.toString(),
        profit_ratio: profitRatio // Add the profit ratio from selected duration
      });
      setShowTimerModal(true);

      handleTradeSubmitted();

      // Refresh trades and balance in background
      fetchTrades();
      fetchBalance();
    } catch (error) {
      console.error('Error submitting trade:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to submit trade.',
        variant: 'destructive',
      });
      // Restore amount on error
      setAmount(tradeAmount.toString());
    }
  };



  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col">
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
                  <span className="text-gray-500 text-xs hidden sm:inline">Futures Trading</span>
                </div>
                <p className="text-gray-500 text-[11px] mt-0.5">{baseAsset} / Tether</p>
              </div>

              {/* Pair Dropdown */}
              {showPairMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowPairMenu(false)} />
                  <div className="absolute top-full left-0 mt-2 z-50 w-56 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl shadow-xl overflow-hidden">
                    <div className="max-h-64 overflow-y-auto">
                      {futuresPairs.length > 0 ? futuresPairs.map(p => (
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
                          {p.symbol === currentPair && (
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                          )}
                        </button>
                      )) : (
                        <div className="px-4 py-3 text-gray-500 text-xs">No futures pairs available</div>
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
        {/* Market Stats Bar */}
        <div className="border-t border-[#1e1e1e]">
          <MarketStatsBar symbol={baseAsset} />
        </div>
      </div>

      {/* Main Trading Area - Binance-like Layout */}
      <div className="flex-1 w-full px-2 py-2 flex flex-col gap-2 min-h-0 overflow-hidden">
        {/* Top Row: Price Chart + Order Book - fixed height prevents layout shifts */}
        <div className="flex flex-col lg:flex-row gap-2 lg:h-[520px] flex-shrink-0">
          {/* Price Chart - Center/Main - explicit heights per breakpoint */}
          <div className="flex-1 order-1 h-[350px] lg:h-full min-h-0 overflow-hidden" style={{ contain: 'layout style' }}>
            <PriceChart symbol={baseAsset} className="h-full w-full" />
          </div>

          {/* Order Book - Right Sidebar - explicit heights per breakpoint */}
          <div className="lg:w-[480px] xl:w-[560px] flex-shrink-0 order-2 bg-[#111] rounded-2xl border border-[#1e1e1e] p-2 h-[380px] lg:h-full min-h-0 overflow-hidden" style={{ contain: 'layout style' }}>
            <OrderBook pair={currentPair} className="h-full" />
          </div>
        </div>

        {/* Bottom Row: Trading Form + Order Management */}
        <div className="flex flex-col lg:flex-row gap-2">
          {/* Trading Form */}
          <div className="lg:w-[400px] xl:w-[440px] flex-shrink-0">
            <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-4">
              <h3 className="text-sm font-semibold text-white mb-4">Futures Trading</h3>
              <div className="space-y-4">
                {/* Long/Short Buttons */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSide('long')}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                      side === 'long'
                        ? 'bg-green-500 text-white shadow-lg shadow-green-500/25'
                        : 'bg-[#1a1a1a] text-gray-400 border border-[#2a2a2a] hover:bg-[#222]'
                    }`}
                  >
                    LONG
                  </button>
                  <button
                    type="button"
                    onClick={() => setSide('short')}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                      side === 'short'
                        ? 'bg-red-500 text-white shadow-lg shadow-red-500/25'
                        : 'bg-[#1a1a1a] text-gray-400 border border-[#2a2a2a] hover:bg-[#222]'
                    }`}
                  >
                    SHORT
                  </button>
                </div>

                {/* Trade Description */}
                <div className="bg-[#0a0a0a] rounded-xl px-3 py-2 border border-[#1e1e1e]">
                  <p className="text-[11px] text-gray-400">
                    {side === 'long' ? `Open Long position on ${baseAsset}` : `Open Short position on ${baseAsset}`} at market price
                  </p>
                  <p className="text-[11px] text-gray-500 mt-1">Profit Rate: {profitRatio.toFixed(2)}%</p>
                </div>

                {/* Transaction Mode */}
                <div>
                  <label className="text-[11px] text-gray-500 uppercase tracking-wider mb-1.5 block">Transaction Mode</label>
                  <Select defaultValue="usdt">
                    <SelectTrigger className="h-10 bg-[#0a0a0a] border-[#2a2a2a] rounded-xl text-white text-sm focus:ring-1 focus:ring-gray-600">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1a1a1a] border-[#2a2a2a]">
                      <SelectItem value="usdt">USDT</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Amount */}
                <div>
                  <label className="text-[11px] text-gray-500 uppercase tracking-wider mb-1.5 block">Amount (USDT)</label>
                  <Input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="h-10 bg-[#0a0a0a] border-[#2a2a2a] rounded-xl text-white text-sm placeholder:text-gray-600 focus:ring-1 focus:ring-gray-600"
                  />
                </div>

                {/* Duration */}
                <div>
                  <label className="text-[11px] text-gray-500 uppercase tracking-wider mb-1.5 block">Duration</label>
                  <Select value={duration.toString()} onValueChange={(value) => setDuration(parseInt(value))}>
                    <SelectTrigger className="h-10 bg-[#0a0a0a] border-[#2a2a2a] rounded-xl text-white text-sm focus:ring-1 focus:ring-gray-600">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1a1a1a] border-[#2a2a2a]">
                      {durationOptions.map((option) => {
                        const isActive = isDurationActive(option.value);
                        const minForDuration = getEffectiveMinimum(option.value);
                        return (
                          <SelectItem
                            key={option.value}
                            value={option.value.toString()}
                            disabled={!isActive}
                            className={!isActive ? 'opacity-50 cursor-not-allowed' : ''}
                          >
                            <span className="flex items-center justify-between w-full gap-2">
                              <span>{option.label}</span>
                              {timeLimitsConfig?.enabled && (
                                <span className="text-[10px] text-gray-500">min ${minForDuration}</span>
                              )}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                {/* Available Balance */}
                <div className="flex justify-between items-center bg-[#0a0a0a] rounded-xl px-3 py-2.5 border border-[#1e1e1e]">
                  <span className="text-gray-500 text-xs">Available</span>
                  <span className="text-white text-xs font-medium tabular-nums">
                    {formatUsdNumber(availableBalance)} USDT
                  </span>
                </div>

                {/* Min Limit Info */}
                <div className="flex justify-between items-center bg-[#0a0a0a] rounded-xl px-3 py-2.5 border border-[#1e1e1e]">
                  <span className="text-gray-500 text-xs">Minimum</span>
                  <span className="text-gray-300 text-xs font-medium tabular-nums">
                    {formatUsdNumber(effectiveMinAmount)} USDT
                  </span>
                </div>

                {/* Submit Button */}
                <button
                  type="button"
                  onClick={handleSubmitTrade}
                  disabled={!amount || parseFloat(amount) < effectiveMinAmount || parseFloat(amount) > availableBalance || !isDurationActive(duration)}
                  className={`w-full py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 ${
                    side === 'long'
                      ? 'bg-green-500 hover:bg-green-600 text-white shadow-lg shadow-green-500/25'
                      : 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/25'
                  }`}
                >
                  {!isDurationActive(duration)
                    ? 'Duration Not Available'
                    : !amount || parseFloat(amount) < effectiveMinAmount
                    ? `Min ${effectiveMinAmount} USDT`
                    : parseFloat(amount) > availableBalance
                    ? 'Insufficient Balance'
                    : `CONFIRM ${side.toUpperCase()}`}
                </button>
              </div>
            </div>
          </div>

          {/* Order Management */}
          <div className="flex-1">
            <div className="bg-[#111] rounded-2xl border border-[#1e1e1e]">
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-white">Order Management</h3>
                  <button onClick={() => { fetchTrades(); fetchBalance(); }} className="p-1.5 rounded-lg hover:bg-[#222] transition-colors" title="Refresh">
                    <RefreshCw className="w-3.5 h-3.5 text-gray-400" />
                  </button>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 bg-[#0a0a0a] rounded-xl p-1 border border-[#1e1e1e]">
                  <button
                    onClick={() => setActiveTradeTab("open")}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                      activeTradeTab === "open"
                        ? "bg-[#1a1a1a] text-white shadow-sm border border-[#2a2a2a]"
                        : "text-gray-500 hover:text-gray-300"
                    }`}
                  >
                    Open Positions
                    {trades.filter(t => t.status === 'pending').length > 0 && (
                      <span className="ml-1.5 text-[10px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded-full">
                        {trades.filter(t => t.status === 'pending').length}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setActiveTradeTab("closed")}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                      activeTradeTab === "closed"
                        ? "bg-[#1a1a1a] text-white shadow-sm border border-[#2a2a2a]"
                        : "text-gray-500 hover:text-gray-300"
                    }`}
                  >
                    Trade History
                  </button>
                </div>

                {/* Filters Row */}
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  {/* Side Filter */}
                  <select
                    value={sideFilter}
                    onChange={e => setSideFilter(e.target.value)}
                    className="px-2 py-1.5 rounded-lg text-xs bg-[#111] border border-[#1e1e1e] text-gray-400 hover:text-gray-300 hover:border-[#2a2a2a] transition-colors focus:outline-none appearance-none cursor-pointer"
                  >
                    <option value="all">All Sides</option>
                    <option value="long">Long</option>
                    <option value="short">Short</option>
                  </select>

                  {/* Status Filter (history tab only) */}
                  {activeTradeTab === "closed" && (
                    <select
                      value={statusFilter}
                      onChange={e => setStatusFilter(e.target.value)}
                      className="px-2 py-1.5 rounded-lg text-xs bg-[#111] border border-[#1e1e1e] text-gray-400 hover:text-gray-300 hover:border-[#2a2a2a] transition-colors focus:outline-none appearance-none cursor-pointer"
                    >
                      <option value="all">All Status</option>
                      <option value="completed">Completed</option>
                      <option value="approved">Approved</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  )}

                  {/* Sort */}
                  <button
                    onClick={() => setSortOrder(s => s === "newest" ? "oldest" : "newest")}
                    className="px-2 py-1.5 rounded-lg text-xs bg-[#111] border border-[#1e1e1e] text-gray-400 hover:text-gray-300 hover:border-[#2a2a2a] transition-colors"
                  >
                    {sortOrder === "newest" ? "Newest" : "Oldest"}
                  </button>
                </div>
              </div>

              {/* Order List */}
              <div className="px-4 pb-2">
                {isLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="bg-[#0a0a0a] rounded-xl p-4 border border-[#1e1e1e] animate-pulse">
                        <div className="flex items-center justify-between">
                          <div className="space-y-2">
                            <div className="h-4 w-28 bg-[#1a1a1a] rounded" />
                            <div className="h-3 w-20 bg-[#1a1a1a] rounded" />
                          </div>
                          <div className="h-5 w-16 bg-[#1a1a1a] rounded-full" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (() => {
                  let filtered = activeTradeTab === "open"
                    ? trades.filter(t => t.status === 'pending')
                    : trades.filter(t => t.status !== 'pending');

                  // Apply side filter
                  if (sideFilter !== "all") {
                    filtered = filtered.filter(t => t.side === sideFilter);
                  }

                  // Apply status filter (history tab only)
                  if (activeTradeTab === "closed" && statusFilter !== "all") {
                    filtered = filtered.filter(t => t.status === statusFilter);
                  }

                  // Apply sort
                  filtered.sort((a, b) => {
                    const da = new Date(a.created_at).getTime();
                    const db = new Date(b.created_at).getTime();
                    return sortOrder === "newest" ? db - da : da - db;
                  });

                  if (filtered.length === 0) {
                    return (
                      <div className="text-center py-10">
                        <div className="w-12 h-12 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl mx-auto mb-3 flex items-center justify-center">
                          <Info size={20} className="text-gray-600" />
                        </div>
                        <p className="text-gray-400 text-sm">
                          {activeTradeTab === "open" ? "No open positions" : "No trade history"}
                        </p>
                        <p className="text-gray-600 text-xs mt-1">
                          {activeTradeTab === "open"
                            ? "Your active futures positions will appear here"
                            : "Your completed futures trades will appear here"
                          }
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1 custom-scrollbar">
                      {filtered.map((trade) => (
                        <div key={trade.id} className="bg-[#0a0a0a] rounded-xl p-3 border border-[#1e1e1e] hover:border-[#2a2a2a] transition-colors">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                                trade.side === 'long' ? 'bg-green-500/10' : 'bg-red-500/10'
                              }`}>
                                {trade.side === 'long'
                                  ? <TrendingUp size={14} className="text-green-500" />
                                  : <TrendingDown size={14} className="text-red-500" />
                                }
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <CryptoIcon symbol={trade.symbol.split('/')[0]} size="xs" />
                                  <span className="text-white font-medium text-sm">{trade.symbol}</span>
                                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                                    trade.side === 'long' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                                  }`}>
                                    {trade.side.toUpperCase()}
                                  </span>
                                </div>
                                <div className="text-[11px] text-gray-500 mt-0.5 tabular-nums">
                                  {formatUsdNumber(trade.amount)} USDT · {trade.duration}s
                                  {trade.profit_loss !== undefined && trade.status !== 'pending' && (
                                    <span className={`ml-2 font-medium ${
                                      trade.profit_loss >= 0 ? 'text-green-400' : 'text-red-400'
                                    }`}>
                                      {trade.profit_loss >= 0 ? '+' : ''}{formatUsdNumber(Math.abs(trade.profit_loss))}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <div className="text-right mr-1">
                                <div className="text-[10px] text-gray-600">{formatDateTime(trade.created_at)}</div>
                              </div>
                              <span className={`text-[10px] font-medium px-2 py-1 rounded-full ${
                                trade.status === 'pending' ? 'bg-yellow-500/10 text-yellow-400' :
                                trade.status === 'completed' ? 'bg-green-500/10 text-green-400' :
                                trade.status === 'rejected' ? 'bg-red-500/10 text-red-400' : 'bg-blue-500/10 text-blue-400'
                              }`}>
                                {trade.status.charAt(0).toUpperCase() + trade.status.slice(1)}
                              </span>
                              <button
                                onClick={() => handleShowTradeDetails(trade, trades.length - trades.indexOf(trade))}
                                className="p-1 rounded-lg hover:bg-[#222] transition-colors"
                                title="Trade details"
                              >
                                <Info className="h-3.5 w-3.5 text-gray-500" />
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
          onClose={() => {
            setShowTimerModal(false);
            setTimerTradeData(null);
          }}
          onComplete={() => {
            // Refresh trades and balance when trade completes
            handleTradeSubmitted();
          }}
          tradeData={timerTradeData}
        />
      )}

      {/* Trade Details Modal */}
      {selectedTrade && (
        <div className={`fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 ${showTradeDetailsModal ? 'block' : 'hidden'}`}>
          <div className="bg-[#111] border border-[#2a2a2a] rounded-2xl p-5 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-base font-semibold text-white">Trade Details</h3>
              <button
                onClick={() => setShowTradeDetailsModal(false)}
                className="h-7 w-7 flex items-center justify-center rounded-lg bg-[#1e1e1e] hover:bg-[#2a2a2a] text-gray-400 transition-colors text-lg"
              >
                ×
              </button>
            </div>

            <div className="space-y-3">
              {/* Trade Header */}
              <div className="flex items-center gap-3 bg-[#0a0a0a] rounded-xl p-3 border border-[#1e1e1e]">
                <CryptoIcon symbol={selectedTrade.symbol.split('/')[0]} size="sm" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-semibold text-sm">{selectedTrade.symbol}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                      selectedTrade.side === 'long' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                    }`}>
                      {selectedTrade.side.toUpperCase()}
                    </span>
                  </div>
                  <span className="text-[10px] text-gray-500">Trade #{selectedTradeNumber}</span>
                </div>
                <div className={`text-xs font-medium px-2 py-1 rounded ${
                  selectedTrade.status === 'completed' ? 'bg-green-500/10 text-green-400' :
                  selectedTrade.status === 'rejected' ? 'bg-red-500/10 text-red-400' :
                  selectedTrade.status === 'pending' ? 'bg-yellow-500/10 text-yellow-400' : 'bg-blue-500/10 text-blue-400'
                }`}>
                  {selectedTrade.status.charAt(0).toUpperCase() + selectedTrade.status.slice(1)}
                </div>
              </div>

              {/* Timestamps */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#0a0a0a] rounded-xl p-3 border border-[#1e1e1e]">
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider">Opened</label>
                  <div className="text-white text-xs mt-0.5">
                    {formatDateTime(selectedTrade.created_at)}
                  </div>
                </div>
                <div className="bg-[#0a0a0a] rounded-xl p-3 border border-[#1e1e1e]">
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider">Closed</label>
                  <div className="text-white text-xs mt-0.5">
                    {formatDateTime(selectedTrade.expires_at)}
                  </div>
                </div>
              </div>

              {/* Trade Parameters */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-[#0a0a0a] rounded-xl p-3 border border-[#1e1e1e] text-center">
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider">Amount</label>
                  <div className="text-white font-semibold text-sm mt-0.5 tabular-nums">
                    {formatUsdNumber(selectedTrade.amount)}
                  </div>
                  <span className="text-[10px] text-gray-600">USDT</span>
                </div>
                <div className="bg-[#0a0a0a] rounded-xl p-3 border border-[#1e1e1e] text-center">
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider">Duration</label>
                  <div className="text-white font-semibold text-sm mt-0.5">{selectedTrade.duration || 0}s</div>
                </div>
                <div className="bg-[#0a0a0a] rounded-xl p-3 border border-[#1e1e1e] text-center">
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider">Profit Ratio</label>
                  <div className="text-green-400 font-semibold text-sm mt-0.5">{selectedTrade.profit_ratio || 0}%</div>
                </div>
              </div>

              {/* Price Info */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#0a0a0a] rounded-xl p-3 border border-[#1e1e1e]">
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider">Entry Price</label>
                  <div className="text-white font-medium text-sm mt-0.5 tabular-nums">
                    ${selectedTrade.entry_price ? formatUsdNumber(selectedTrade.entry_price) : 'N/A'}
                  </div>
                </div>
                <div className="bg-[#0a0a0a] rounded-xl p-3 border border-[#1e1e1e]">
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider">Exit Price</label>
                  <div className="text-white font-medium text-sm mt-0.5 tabular-nums">
                    ${selectedTrade.exit_price ? formatUsdNumber(selectedTrade.exit_price) : 'N/A'}
                  </div>
                </div>
              </div>

              {/* Trade Result - only for completed trades */}
              {selectedTrade.status === 'completed' && selectedTrade.profit_loss !== undefined && selectedTrade.profit_loss !== null && (
                <>
                  <div className="border-t border-[#1e1e1e] my-2" />

                  {/* Result Card */}
                  <div className={`rounded-xl p-3 border ${
                    selectedTrade.profit_loss >= 0
                      ? 'bg-green-500/5 border-green-500/20'
                      : 'bg-red-500/5 border-red-500/20'
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
                        {selectedTrade.profit_loss >= 0 ? 'Profit' : 'Loss'}
                      </span>
                      <span className={`text-base tabular-nums font-bold ${selectedTrade.profit_loss >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {selectedTrade.profit_loss >= 0 ? '+' : ''}{formatUsdNumber(selectedTrade.profit_loss)} USDT
                      </span>
                    </div>

                    {/* Fee info (subtle) */}
                    {parseFloat(selectedTrade.fee_amount || '0') > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-gray-500">Fee {selectedTrade.fee_rate ? `(${(parseFloat(selectedTrade.fee_rate) * 100).toFixed(2)}%)` : ''}</span>
                        <span className="text-[10px] text-gray-500 tabular-nums">
                          -{formatUsdNumber(parseFloat(selectedTrade.fee_amount || '0'))} USDT
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Balance Impact */}
                  {selectedTrade.trade_intervals?.balance_before != null && (
                  <div className="bg-[#0a0a0a] rounded-xl p-3 border border-[#1e1e1e]">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-gray-500 uppercase tracking-wider">Balance Before</span>
                        <span className="text-xs text-gray-300 tabular-nums">
                          {formatUsdNumber(selectedTrade.trade_intervals.balance_before!)} USDT
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Balance After</span>
                        <span className="text-sm text-white font-bold tabular-nums">
                          {formatUsdNumber(selectedTrade.trade_intervals.balance_after ?? (selectedTrade.trade_intervals.balance_before! + selectedTrade.profit_loss))} USDT
                        </span>
                      </div>
                    </div>
                  </div>
                  )}
                </>
              )}

              {/* Simple P&L for non-completed or trades without breakdown */}
              {selectedTrade.status !== 'completed' && selectedTrade.profit_loss !== undefined && selectedTrade.profit_loss !== null && (
                <div className={`rounded-xl p-3 border ${
                  selectedTrade.profit_loss >= 0
                    ? 'bg-green-500/5 border-green-500/20'
                    : 'bg-red-500/5 border-red-500/20'
                }`}>
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider">Profit/Loss</label>
                  <div className={`font-semibold text-base mt-0.5 tabular-nums ${
                    selectedTrade.profit_loss >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {selectedTrade.profit_loss >= 0 ? '+' : ''}{formatUsdNumber(Math.abs(selectedTrade.profit_loss))} USDT
                  </div>
                </div>
              )}
            </div>

            <div className="mt-5">
              <Button
                onClick={() => setShowTradeDetailsModal(false)}
                className="w-full bg-[#1e1e1e] hover:bg-[#2a2a2a] text-white rounded-xl py-2.5 text-sm border border-[#2a2a2a]"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
