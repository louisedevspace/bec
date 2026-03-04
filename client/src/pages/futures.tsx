import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUser } from '@/hooks/use-user';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { Settings, TrendingUp, TrendingDown, BarChart3, User, Home, PieChart, RefreshCw, Info } from 'lucide-react';
import { OrderBook } from '@/components/trading/order-book';
import { useCryptoPrices } from '@/hooks/use-crypto-prices';
import { FutureTradeTimerModal } from '@/components/modals/future-trade-timer-modal';
import { formatUsdNumber } from '@/utils/format-utils';

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
  created_at: string;
  expires_at?: string;
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
  const [minTradeAmount, setMinTradeAmount] = useState<number>(50);

  // Trade details modal state
  const [showTradeDetailsModal, setShowTradeDetailsModal] = useState(false);
  const [selectedTrade, setSelectedTrade] = useState<FuturesTrade | null>(null);

  // Get live current price for BTC
  const btcPrice = getPriceBySymbol('BTC');
  const currentPrice = btcPrice ? parseFloat(btcPrice.price) : 106055.09;

  const selectedDuration = durationOptions.find(d => d.value === duration);
  const profitRatio = selectedDuration?.profitRatio || 30;

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
      console.log('📊 Received futures trades:', data?.length || 0, 'trades');
      console.log('📋 Trades data:', data);
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

  const fetchFuturesSettings = async () => {
    if (!user) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      const response = await fetch('/api/futures-settings', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (response.ok) {
        const data = await response.json();
        setMinTradeAmount(data.futures_min_amount || 50);
      }
    } catch {
      // keep default
    }
  };

  useEffect(() => {
    fetchTrades();
    fetchBalance();
    fetchFuturesSettings();
  }, [user]);

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

  const handleShowTradeDetails = (trade: FuturesTrade) => {
    console.log('🔍 Trade data for debugging:', {
      created_at: trade.created_at,
      expires_at: trade.expires_at,
      created_at_type: typeof trade.created_at,
      expires_at_type: typeof trade.expires_at
    });
    setSelectedTrade(trade);
    setShowTradeDetailsModal(true);
  };

  // Helper function to format dates consistently in user's timezone
  const formatDateTime = (dateString: string | undefined) => {
    if (!dateString) return 'N/A';
    
    try {
      console.log('🔍 formatDateTime input:', dateString);
      
      // FORCE ALL DATES TO BE TREATED AS UTC FIRST
      let date;
      
      // Always append 'Z' to force UTC interpretation, regardless of existing timezone info
      if (!dateString.includes('Z')) {
        // Remove any existing timezone info and append 'Z' for UTC
        const cleanDateString = dateString.replace(/[+-]\d{2}:\d{2}$/, '');
        date = new Date(cleanDateString + 'Z');
        console.log('✅ FORCED UTC:', cleanDateString + 'Z', '->', date);
      } else {
        // Already has Z, parse as-is
        date = new Date(dateString);
        console.log('✅ Already UTC:', dateString, '->', date);
      }
      
      // Convert to user's local timezone
      const result = date.toLocaleString(undefined, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      });
      
      console.log('🎯 Final result:', result);
      return result;
    } catch (error) {
      console.error('❌ Error formatting date:', error, 'Input:', dateString);
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
    if (!amount || isNaN(tradeAmount) || tradeAmount < minTradeAmount) {
      toast({
        title: 'Error',
        description: `Minimum trade amount is ${minTradeAmount} USDT.`,
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

      console.log('🔍 Frontend sending trade data:', {
        symbol: 'BTC/USDT',
        amount: tradeAmount,
        duration,
        side,
        profitRatio,
        profitRatio_type: typeof profitRatio
      });

      // Optimistically update UI immediately
      setAmount('');
      
      const response = await fetch('/api/future-trade/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          symbol: 'BTC/USDT',
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
        id: responseData.trade?.id || Date.now(), // Use trade ID from response or generate one
        symbol: 'BTC/USDT',
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



  // Trading pair for order book
  const currentPair = "BTC/USDT";

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col">
      {/* Top Header */}
      <div className="bg-[#111] border-b border-[#222] px-4 md:px-6 py-2.5 flex-shrink-0">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3 md:space-x-4">
            <span className="text-sm font-semibold text-gray-300">Futures</span>
            <div className="flex items-center space-x-2 bg-[#1a1a1a] px-3 py-1.5 rounded-lg border border-[#2a2a2a]">
              <BarChart3 className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-sm font-medium text-white">BTC/USDT</span>
            </div>
          </div>
          <div className="text-center">
            <div className="text-base md:text-lg font-bold text-green-400 tabular-nums">
              {getFormattedPrice("BTC")} <span className="text-xs text-gray-500 font-normal">USDT</span>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button onClick={() => { fetchTrades(); fetchBalance(); }} className="p-1.5 rounded-lg hover:bg-[#222] transition-colors">
              <RefreshCw className="w-3.5 h-3.5 text-gray-400" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col max-w-[1600px] mx-auto w-full">
        {/* Trading Area - grows to fill available space */}
        <div className="flex flex-col lg:flex-row flex-1 min-h-0">
          {/* Left Section - Trading Form */}
          <div className="lg:w-[420px] xl:w-[460px] flex-shrink-0 border-r border-[#1a1a1a] p-3 lg:p-5 flex flex-col">
            <div className="space-y-3 lg:space-y-4 flex-1 flex flex-col">
              {/* Trade Type Selection */}
              <div className="flex space-x-2">
                <Button
                  onClick={() => setSide('long')}
                  className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-all ${
                    side === 'long' 
                      ? 'bg-green-600 hover:bg-green-700 shadow-lg shadow-green-600/20' 
                      : 'bg-[#1a1a1a] hover:bg-[#252525] text-gray-400 border border-[#2a2a2a]'
                  }`}
                >
                  <TrendingUp className="w-4 h-4 mr-1.5" />
                  LONG
                </Button>
                <Button
                  onClick={() => setSide('short')}
                  className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-all ${
                    side === 'short' 
                      ? 'bg-red-600 hover:bg-red-700 shadow-lg shadow-red-600/20' 
                      : 'bg-[#1a1a1a] hover:bg-[#252525] text-gray-400 border border-[#2a2a2a]'
                  }`}
                >
                  <TrendingDown className="w-4 h-4 mr-1.5" />
                  SHORT
                </Button>
              </div>

              {/* Transaction Mode */}
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-500 uppercase tracking-wider">Transaction mode</Label>
                <Select defaultValue="usdt">
                  <SelectTrigger className="bg-[#111] border-[#2a2a2a] h-10 rounded-xl text-sm hover:border-[#3a3a3a] transition-colors">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#111] border-[#2a2a2a]">
                    <SelectItem value="usdt">USDT</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Purchase Quantity */}
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-500 uppercase tracking-wider">Purchase quantity</Label>
                <div className="relative">
                  <Input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="bg-[#111] border-[#2a2a2a] pr-14 h-10 rounded-xl text-sm hover:border-[#3a3a3a] focus:border-blue-500/50 transition-colors"
                  />
                  <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 text-xs font-medium">
                    USDT
                  </span>
                </div>
              </div>

              {/* Choose the node (Duration) */}
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-500 uppercase tracking-wider">Choose the node</Label>
                <Select value={duration.toString()} onValueChange={(value) => setDuration(parseInt(value))}>
                  <SelectTrigger className="bg-[#111] border-[#2a2a2a] h-10 rounded-xl text-sm hover:border-[#3a3a3a] transition-colors">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#111] border-[#2a2a2a]">
                    {durationOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value.toString()}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Profit Rate */}
              <div className="bg-[#111] p-3 rounded-xl border border-[#2a2a2a]">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Profit rate</span>
                  <span className="text-sm font-semibold text-green-400">{profitRatio.toFixed(2)}%</span>
                </div>
              </div>

              {/* Limits and Availability */}
              <div className="bg-[#111] p-3 rounded-xl border border-[#2a2a2a] space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Minimum limit</span>
                  <span className="text-gray-300 tabular-nums">{formatUsdNumber(minTradeAmount)} USDT</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Available</span>
                  <span className="text-white font-medium tabular-nums">{formatUsdNumber(availableBalance)} USDT</span>
                </div>
              </div>

              {/* Spacer to push button to bottom on desktop */}
              <div className="flex-1 min-h-2" />

              {/* Action Button */}
              <Button
                onClick={handleSubmitTrade}
                disabled={!amount || parseFloat(amount) < minTradeAmount || parseFloat(amount) > availableBalance}
                className={`w-full font-bold py-3.5 text-sm rounded-xl transition-all shadow-lg ${
                  side === 'long'
                    ? 'bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 shadow-green-600/20'
                    : 'bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:text-gray-500 shadow-red-600/20'
                }`}
              >
                {!amount || parseFloat(amount) < minTradeAmount
                  ? `Min ${minTradeAmount} USDT`
                  : parseFloat(amount) > availableBalance
                  ? 'Insufficient Balance'
                  : `CONFIRM ${side.toUpperCase()}`}
              </Button>
            </div>
          </div>

          {/* Right Section - Order Book */}
          <div className="flex-1 p-3 lg:p-5 flex flex-col min-h-[300px] lg:min-h-0">
            <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] flex-1 flex flex-col overflow-hidden">
              <div className="px-4 py-3 border-b border-[#1e1e1e] flex items-center justify-between flex-shrink-0">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <BarChart3 className="w-3.5 h-3.5 text-blue-400" />
                  Order Book
                </h3>
                <span className="text-[10px] text-gray-600 uppercase tracking-wider">Live</span>
              </div>
              <div className="flex-1 min-h-0">
                <OrderBook pair={currentPair} className="h-full border-0 bg-transparent" />
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Section - Transaction History */}
        <div className="flex-shrink-0 border-t border-[#1a1a1a]">
          <div className="p-3 lg:p-5">
            <Tabs defaultValue="transaction" className="w-full">
              <TabsList className="grid w-full grid-cols-2 bg-[#111] mb-3 h-9 rounded-xl p-0.5">
                <TabsTrigger value="transaction" className="data-[state=active]:bg-[#2a2a2a] data-[state=active]:text-white text-xs rounded-lg text-gray-500 transition-all h-full">
                  Open Positions
                </TabsTrigger>
                <TabsTrigger value="closed" className="data-[state=active]:bg-[#2a2a2a] data-[state=active]:text-white text-xs rounded-lg text-gray-500 transition-all h-full">
                  Closed Trades
                </TabsTrigger>
              </TabsList>

              <TabsContent value="transaction" className="mt-0">
                {isLoading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-400 mx-auto"></div>
                    <div className="text-gray-500 mt-2 text-xs">Loading...</div>
                  </div>
                ) : trades.filter(trade => trade.status === 'pending').length === 0 ? (
                  <div className="text-center py-8">
                    <div className="text-gray-600 text-sm">No open positions</div>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-48 lg:max-h-64 overflow-y-auto pr-1 custom-scrollbar">
                    {trades.filter(trade => trade.status === 'pending').map((trade) => (
                      <div key={trade.id} className="bg-[#111] border border-[#1e1e1e] p-3 rounded-xl hover:border-[#2a2a2a] transition-colors">
                        <div className="flex justify-between items-center gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm text-white">{trade.symbol}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                trade.side === 'long' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                              }`}>
                                {trade.side.toUpperCase()}
                              </span>
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5 tabular-nums">
                              {formatUsdNumber(trade.amount)} USDT
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-xs text-yellow-500 font-medium bg-yellow-500/10 px-2 py-0.5 rounded">Pending</span>
                            <button
                              onClick={() => handleShowTradeDetails(trade)}
                              className="p-1 rounded-lg hover:bg-[#222] transition-colors"
                            >
                              <Info className="h-3.5 w-3.5 text-gray-500" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="closed" className="mt-0">
                {isLoading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-400 mx-auto"></div>
                    <div className="text-gray-500 mt-2 text-xs">Loading...</div>
                  </div>
                ) : (() => {
                  const closedTrades = trades.filter(trade => trade.status !== 'pending');
                  return closedTrades.length === 0;
                })() ? (
                  <div className="text-center py-8">
                    <div className="text-gray-600 text-sm">No closed trades</div>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-48 lg:max-h-64 overflow-y-auto pr-1 custom-scrollbar">
                    {trades.filter(trade => trade.status !== 'pending').map((trade) => (
                      <div key={trade.id} className="bg-[#111] border border-[#1e1e1e] p-3 rounded-xl hover:border-[#2a2a2a] transition-colors">
                        <div className="flex justify-between items-center gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm text-white">{trade.symbol}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                trade.side === 'long' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                              }`}>
                                {trade.side.toUpperCase()}
                              </span>
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5 tabular-nums">
                              {formatUsdNumber(trade.amount)} USDT
                              {trade.profit_loss !== undefined && (
                                <span className={`ml-2 font-medium ${
                                  trade.profit_loss >= 0 ? 'text-green-400' : 'text-red-400'
                                }`}>
                                  {trade.profit_loss >= 0 ? '+' : ''}{formatUsdNumber(Math.abs(trade.profit_loss))}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                              trade.status === 'completed' ? 'bg-green-500/10 text-green-400' : 
                              trade.status === 'rejected' ? 'bg-red-500/10 text-red-400' : 'bg-blue-500/10 text-blue-400'
                            }`}>
                              {trade.status.charAt(0).toUpperCase() + trade.status.slice(1)}
                            </span>
                            <button
                              onClick={() => handleShowTradeDetails(trade)}
                              className="p-1 rounded-lg hover:bg-[#222] transition-colors"
                            >
                              <Info className="h-3.5 w-3.5 text-gray-500" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
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
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#0a0a0a] rounded-xl p-3 border border-[#1e1e1e]">
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider">Trade ID</label>
                  <div className="text-white font-medium text-sm mt-0.5">#{selectedTrade.id}</div>
                </div>
                <div className="bg-[#0a0a0a] rounded-xl p-3 border border-[#1e1e1e]">
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider">Symbol</label>
                  <div className="text-white font-medium text-sm mt-0.5">{selectedTrade.symbol}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#0a0a0a] rounded-xl p-3 border border-[#1e1e1e]">
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider">Side</label>
                  <div className={`font-medium text-sm mt-0.5 ${selectedTrade.side === 'long' ? 'text-green-400' : 'text-red-400'}`}>
                    {selectedTrade.side.toUpperCase()}
                  </div>
                </div>
                <div className="bg-[#0a0a0a] rounded-xl p-3 border border-[#1e1e1e]">
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider">Amount</label>
                  <div className="text-white font-medium text-sm mt-0.5 tabular-nums">
                    {selectedTrade.amount ? formatUsdNumber(selectedTrade.amount) : '0.00'} USDT
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#0a0a0a] rounded-xl p-3 border border-[#1e1e1e]">
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider">Duration</label>
                  <div className="text-white font-medium text-sm mt-0.5">{selectedTrade.duration || 0}s</div>
                </div>
                <div className="bg-[#0a0a0a] rounded-xl p-3 border border-[#1e1e1e]">
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider">Profit Ratio</label>
                  <div className="text-green-400 font-medium text-sm mt-0.5">{selectedTrade.profit_ratio || 0}%</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#0a0a0a] rounded-xl p-3 border border-[#1e1e1e]">
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider">Entry Price</label>
                  <div className="text-white font-medium text-sm mt-0.5 tabular-nums">
                    {selectedTrade.entry_price ? formatUsdNumber(selectedTrade.entry_price) : 'N/A'}
                  </div>
                </div>
                <div className="bg-[#0a0a0a] rounded-xl p-3 border border-[#1e1e1e]">
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider">Exit Price</label>
                  <div className="text-white font-medium text-sm mt-0.5 tabular-nums">
                    {selectedTrade.exit_price ? formatUsdNumber(selectedTrade.exit_price) : 'N/A'}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#0a0a0a] rounded-xl p-3 border border-[#1e1e1e]">
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider">Start Time</label>
                  <div className="text-white text-xs mt-0.5">
                    {formatDateTime(selectedTrade.created_at)}
                  </div>
                </div>
                <div className="bg-[#0a0a0a] rounded-xl p-3 border border-[#1e1e1e]">
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider">End Time</label>
                  <div className="text-white text-xs mt-0.5">
                    {formatDateTime(selectedTrade.expires_at)}
                  </div>
                </div>
              </div>

              <div className="bg-[#0a0a0a] rounded-xl p-3 border border-[#1e1e1e]">
                <label className="text-[10px] text-gray-500 uppercase tracking-wider">Status</label>
                <div className={`font-medium text-sm mt-0.5 ${
                  selectedTrade.status === 'completed' ? 'text-green-400' : 
                  selectedTrade.status === 'rejected' ? 'text-red-400' : 
                  selectedTrade.status === 'pending' ? 'text-yellow-400' : 'text-blue-400'
                }`}>
                  {selectedTrade.status ? selectedTrade.status.charAt(0).toUpperCase() + selectedTrade.status.slice(1) : 'Unknown'}
                </div>
              </div>

              {selectedTrade.final_amount !== undefined && selectedTrade.final_amount !== null && (
                <div className="bg-[#0a0a0a] rounded-xl p-3 border border-[#1e1e1e]">
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider">Final Amount</label>
                  <div className="text-white font-medium text-sm mt-0.5 tabular-nums">{formatUsdNumber(selectedTrade.final_amount)} USDT</div>
                </div>
              )}

              {selectedTrade.profit_loss !== undefined && selectedTrade.profit_loss !== null && (
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
