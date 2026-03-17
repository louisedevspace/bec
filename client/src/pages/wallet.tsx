import { useState, useEffect, useMemo } from "react";
import { formatDateTime } from '@/lib/date-utils';
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { CryptoIcon } from "@/components/crypto/crypto-icon";
import { formatUsdNumber, formatCryptoNumber } from "@/utils/format-utils";
import { DepositModal } from "@/components/modals/deposit-modal";
import { WithdrawModal } from "@/components/modals/withdraw-modal";
import { ConvertModal } from "@/components/modals/convert-modal";
import { PortfolioModal } from "@/components/modals/portfolio-modal";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { StatusBadge } from "@/components/ui/status-badge";
import { exportToCSV } from "@/utils/csv-export";
import {
  Wallet, TrendingUp, TrendingDown, ArrowDownLeft, ArrowUpRight,
  RefreshCw, Lock, Eye, EyeOff, Clock, Filter, Search, PieChart,
  History, Zap, ArrowRightLeft, ChevronDown, ChevronUp,
  Plus, Send, CreditCard, Snowflake, BarChart3, Activity,
  DollarSign, Target, Award, Percent, ArrowDown, ArrowUp, Info, X,
  Download, ChevronLeft, ChevronRight
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

interface WalletAsset {
  symbol: string;
  available: number;
  frozen: number;
  total: number;
  price: number;
  usdValue: number;
  change24h: number;
}

interface WalletTransaction {
  id: string;
  type: "deposit" | "withdrawal" | "trade" | "futures";
  symbol: string;
  amount: number;
  feeAmount?: number;
  feeSymbol?: string;
  feeRate?: number;
  netAmount?: number;
  price?: number;
  side?: string;
  status: string;
  date: string;
  result?: number;
  walletAddress?: string;
}

interface WalletSummary {
  assets: WalletAsset[];
  totalValue: number;
  totalDeposited: number;
  totalWithdrawn: number;
  tradePnl: number;
  futuresPnl: number;
  estimatedPnl: number;
  totalPnl: number;
  walletLocked: boolean;
  staking: any[];
  transactions: WalletTransaction[];
  transactionCounts: {
    deposits: number;
    withdrawals: number;
    trades: number;
    futures: number;
  };
  analytics?: {
    fees: {
      total: number;
      trading: number;
      deposit: number;
      withdrawal: number;
    };
    trading: {
      totalTrades: number;
      executedTrades: number;
      pendingTrades: number;
      cancelledTrades: number;
      buyCount: number;
      sellCount: number;
      buyVolume: number;
      sellVolume: number;
      totalVolume: number;
      avgTradeSize: number;
      profitableTrades: number;
      topTradedPairs: { symbol: string; count: number; volume: number }[];
    };
    futures: {
      totalFutures: number;
      completedFutures: number;
      wins: number;
      losses: number;
      winRate: number;
      totalVolume: number;
      pnl: number;
      biggestWin: number;
      biggestLoss: number;
    };
    portfolio: {
      totalAssets: number;
      totalValue: number;
      totalDeposited: number;
      totalWithdrawn: number;
      netFlow: number;
    };
    monthlyPerformance: { month: string; trades: number; volume: number; pnl: number; fees: number }[];
  };
}

export default function WalletPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [hideBalances, setHideBalances] = useState(false);
  const [activeTab, setActiveTab] = useState<"assets" | "history" | "overview" | "analytics">("overview");
  const [txFilter, setTxFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedAsset, setExpandedAsset] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [historyDateRange, setHistoryDateRange] = useState<{ from: Date | null; to: Date | null }>({ from: null, to: null });
  const [historySearch, setHistorySearch] = useState("");
  const [historyPage, setHistoryPage] = useState(0);
  const [historyPageSize, setHistoryPageSize] = useState(25);

  // Parse URL params for deep-linking (e.g. /wallet?action=deposit&tab=history)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const action = params.get("action");
    const tab = params.get("tab");
    if (action && ["deposit", "withdraw", "convert", "portfolio"].includes(action)) {
      setActiveModal(action);
    }
    if (tab && ["overview", "assets", "history", "analytics"].includes(tab)) {
      setActiveTab(tab as "overview" | "assets" | "history" | "analytics");
    }
    // Clean URL params after reading
    if (action || tab) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, []);

  // Clear notification badge when visiting wallet page
  useEffect(() => {
    const markDepositsSeen = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        
        await fetch("/api/deposit-requests/mark-seen", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
          },
        });
      } catch {
        // Silent - non-critical
      }
    };
    markDepositsSeen();
  }, []);

  const { data: wallet, isLoading, refetch } = useQuery<WalletSummary>({
    queryKey: ["/api/wallet/summary"],
    queryFn: () => apiRequest("GET", "/api/wallet/summary").then(r => r.json()),
    enabled: !!userId,
    staleTime: 30000,
    refetchInterval: 60000,
  });

  const filteredAssets = useMemo(() => {
    if (!wallet?.assets) return [];
    let items = wallet.assets.filter(a => a.total > 0 || a.usdValue > 0);
    if (searchQuery) {
      items = items.filter(a => a.symbol.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    return items;
  }, [wallet?.assets, searchQuery]);

  const filteredTransactions = useMemo(() => {
    if (!wallet?.transactions) return [];
    let items = wallet.transactions;
    if (txFilter !== "all") {
      items = items.filter(t => t.type === txFilter);
    }
    if (historySearch) {
      const q = historySearch.toLowerCase();
      items = items.filter(t => t.symbol.toLowerCase().includes(q) || t.type.toLowerCase().includes(q) || t.status.toLowerCase().includes(q));
    }
    if (historyDateRange.from) {
      items = items.filter(t => new Date(t.date) >= historyDateRange.from!);
    }
    if (historyDateRange.to) {
      const endOfDay = new Date(historyDateRange.to);
      endOfDay.setHours(23, 59, 59, 999);
      items = items.filter(t => new Date(t.date) <= endOfDay);
    }
    return items;
  }, [wallet?.transactions, txFilter, historySearch, historyDateRange]);

  const historyTotalPages = Math.max(1, Math.ceil(filteredTransactions.length / historyPageSize));
  const paginatedTransactions = filteredTransactions.slice(historyPage * historyPageSize, (historyPage + 1) * historyPageSize);

  useEffect(() => { setHistoryPage(0); }, [txFilter, historySearch, historyDateRange, historyPageSize]);

  const handleExportHistory = () => {
    if (filteredTransactions.length === 0) return;
    const csvData = filteredTransactions.map(tx => ({
      date: formatDateTime(tx.date),
      type: tx.type,
      symbol: tx.symbol,
      side: tx.side || "",
      amount: tx.amount,
      price: tx.price || "",
      fee: tx.feeAmount || 0,
      status: tx.status,
    }));
    exportToCSV(csvData, "wallet_history", [
      { key: "date", label: "Date" },
      { key: "type", label: "Type" },
      { key: "symbol", label: "Symbol" },
      { key: "side", label: "Side" },
      { key: "amount", label: "Amount" },
      { key: "price", label: "Price" },
      { key: "fee", label: "Fee" },
      { key: "status", label: "Status" },
    ]);
  };

  const bal = (v: number) => hideBalances ? "••••••" : `$${formatUsdNumber(v)}`;
  const cryptoBal = (v: number) => hideBalances ? "••••" : formatCryptoNumber(v);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
        <div className="max-w-5xl mx-auto w-full px-4 py-6 space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-4 animate-pulse">
              <div className="h-6 w-32 bg-[#1a1a1a] rounded mb-3" />
              <div className="h-8 w-48 bg-[#1a1a1a] rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!wallet) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-center">
          <Wallet size={48} className="text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">Unable to load wallet</p>
          <button onClick={() => refetch()} className="mt-4 text-blue-400 text-sm hover:text-blue-300">Try again</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-20">
      {/* Header */}
      <div className="bg-gradient-to-b from-[#111] to-[#0a0a0a] border-b border-[#1e1e1e] px-4 py-5">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center">
                <Wallet size={20} className="text-blue-400" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">My Wallet</h1>
                <p className="text-xs text-gray-500">Portfolio & Transactions</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setHideBalances(!hideBalances)} className="p-2 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] hover:bg-[#222] transition-colors">
                {hideBalances ? <EyeOff size={16} className="text-gray-400" /> : <Eye size={16} className="text-gray-400" />}
              </button>
              <button onClick={() => refetch()} className="p-2 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] hover:bg-[#222] transition-colors">
                <RefreshCw size={16} className="text-gray-400" />
              </button>
            </div>
          </div>

          {/* Wallet Lock Warning */}
          {wallet.walletLocked && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-4 flex items-center gap-2">
              <Lock size={16} className="text-red-400" />
              <span className="text-red-400 text-sm font-medium">Your wallet is currently locked. Contact support for assistance.</span>
            </div>
          )}

          {/* Total Balance Card */}
          <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-5">
            <p className="text-xs text-gray-500 mb-1">Total Portfolio Value</p>
            <div className="flex items-baseline gap-3 mb-4">
              <span className="text-3xl font-bold text-white tabular-nums">{bal(wallet.totalValue)}</span>
              <span className={`text-sm font-medium ${wallet.estimatedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {wallet.estimatedPnl >= 0 ? '+' : ''}{hideBalances ? '••••' : `$${formatUsdNumber(Math.abs(wallet.estimatedPnl))}`}
              </span>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-4 gap-3 mt-4">
              <button
                onClick={() => !wallet.walletLocked && setActiveModal("deposit")}
                disabled={wallet.walletLocked}
                className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border transition-colors ${
                  wallet.walletLocked
                    ? 'bg-[#0a0a0a] border-[#1e1e1e] opacity-50 cursor-not-allowed'
                    : 'bg-green-500/10 border-green-500/20 hover:bg-green-500/20'
                }`}
              >
                <Plus size={18} className={wallet.walletLocked ? "text-gray-500" : "text-green-400"} />
                <span className={`text-xs font-medium ${wallet.walletLocked ? "text-gray-500" : "text-green-400"}`}>Deposit</span>
              </button>
              <button
                onClick={() => !wallet.walletLocked && setActiveModal("withdraw")}
                disabled={wallet.walletLocked}
                className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border transition-colors ${
                  wallet.walletLocked
                    ? 'bg-[#0a0a0a] border-[#1e1e1e] opacity-50 cursor-not-allowed'
                    : 'bg-red-500/10 border-red-500/20 hover:bg-red-500/20'
                }`}
              >
                <Send size={18} className={wallet.walletLocked ? "text-gray-500" : "text-red-400"} />
                <span className={`text-xs font-medium ${wallet.walletLocked ? "text-gray-500" : "text-red-400"}`}>Withdraw</span>
              </button>
              <button
                onClick={() => !wallet.walletLocked && setActiveModal("convert")}
                disabled={wallet.walletLocked}
                className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border transition-colors ${
                  wallet.walletLocked
                    ? 'bg-[#0a0a0a] border-[#1e1e1e] opacity-50 cursor-not-allowed'
                    : 'bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/20'
                }`}
              >
                <ArrowRightLeft size={18} className={wallet.walletLocked ? "text-gray-500" : "text-blue-400"} />
                <span className={`text-xs font-medium ${wallet.walletLocked ? "text-gray-500" : "text-blue-400"}`}>Convert</span>
              </button>
              <button
                onClick={() => setActiveModal("portfolio")}
                className="flex flex-col items-center gap-1.5 py-3 rounded-xl border bg-purple-500/10 border-purple-500/20 hover:bg-purple-500/20 transition-colors"
              >
                <PieChart size={18} className="text-purple-400" />
                <span className="text-xs font-medium text-purple-400">Portfolio</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-5xl mx-auto px-4">
        <div className="flex gap-1 mt-4 bg-[#111] rounded-xl border border-[#1e1e1e] p-1">
          {[
            { id: "overview", label: "Overview", icon: PieChart },
            { id: "analytics", label: "Analytics", icon: BarChart3 },
            { id: "assets", label: "Assets", icon: Wallet },
            { id: "history", label: "History", icon: History },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-[#1a1a1a] text-white border border-[#2a2a2a]'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === "overview" && (
          <div className="mt-4 space-y-4">
            {/* Portfolio Performance */}
            <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-4">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <TrendingUp size={14} className="text-green-400" />
                Portfolio Performance
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#0a0a0a] rounded-xl border border-[#1e1e1e] p-3">
                  <p className="text-[10px] text-gray-500 mb-0.5">Total Deposited</p>
                  <p className="text-sm font-bold text-green-400">{bal(wallet.totalDeposited)}</p>
                </div>
                <div className="bg-[#0a0a0a] rounded-xl border border-[#1e1e1e] p-3">
                  <p className="text-[10px] text-gray-500 mb-0.5">Total Withdrawn</p>
                  <p className="text-sm font-bold text-red-400">{bal(wallet.totalWithdrawn)}</p>
                </div>
                <div className="bg-[#0a0a0a] rounded-xl border border-[#1e1e1e] p-3">
                  <p className="text-[10px] text-gray-500 mb-0.5">Trade P&L</p>
                  <p className={`text-sm font-bold ${wallet.tradePnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {wallet.tradePnl >= 0 ? '+' : ''}{bal(wallet.tradePnl)}
                  </p>
                </div>
                <div className="bg-[#0a0a0a] rounded-xl border border-[#1e1e1e] p-3">
                  <p className="text-[10px] text-gray-500 mb-0.5">Futures P&L</p>
                  <p className={`text-sm font-bold ${wallet.futuresPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {wallet.futuresPnl >= 0 ? '+' : ''}{bal(wallet.futuresPnl)}
                  </p>
                </div>
              </div>
              {/* Net P&L bar */}
              <div className="mt-3 bg-[#0a0a0a] rounded-xl border border-[#1e1e1e] p-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-gray-500">Estimated P&L</p>
                  <p className={`text-base font-bold ${wallet.estimatedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {wallet.estimatedPnl >= 0 ? '+' : ''}{bal(wallet.estimatedPnl)}
                  </p>
                </div>
              </div>
            </div>

            {/* Fee Summary */}
            {wallet.analytics?.fees && (
              <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-4">
                <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                  <DollarSign size={14} className="text-amber-400" />
                  Total Fees Paid
                </h3>
                <div className="bg-amber-500/5 rounded-xl border border-amber-500/10 p-3 mb-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">All-time fees</span>
                    <span className="text-lg font-bold text-amber-400">{bal(wallet.analytics.fees.total)}</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-[#0a0a0a] rounded-lg border border-[#1e1e1e] p-2.5 text-center">
                    <p className="text-xs font-bold text-white">{bal(wallet.analytics.fees.trading)}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">Trading</p>
                  </div>
                  <div className="bg-[#0a0a0a] rounded-lg border border-[#1e1e1e] p-2.5 text-center">
                    <p className="text-xs font-bold text-white">{bal(wallet.analytics.fees.deposit)}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">Deposit</p>
                  </div>
                  <div className="bg-[#0a0a0a] rounded-lg border border-[#1e1e1e] p-2.5 text-center">
                    <p className="text-xs font-bold text-white">{bal(wallet.analytics.fees.withdrawal)}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">Withdrawal</p>
                  </div>
                </div>
              </div>
            )}

            {/* Top Assets */}
            <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-4">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <PieChart size={14} className="text-blue-400" />
                Asset Allocation
              </h3>
              <div className="space-y-3">
                {filteredAssets.slice(0, 5).map(asset => {
                  const pct = wallet.totalValue > 0 ? (asset.usdValue / wallet.totalValue) * 100 : 0;
                  return (
                    <div key={asset.symbol} className="flex items-center gap-3">
                      <CryptoIcon symbol={asset.symbol} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-white">{asset.symbol}</span>
                          <span className="text-sm text-white tabular-nums">{bal(asset.usdValue)}</span>
                        </div>
                        <div className="h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${Math.min(100, pct)}%` }} />
                        </div>
                      </div>
                      <span className="text-xs text-gray-500 w-10 text-right">{pct.toFixed(1)}%</span>
                    </div>
                  );
                })}
                {filteredAssets.length === 0 && (
                  <p className="text-gray-600 text-sm text-center py-4">No assets in wallet</p>
                )}
              </div>
            </div>

            {/* Activity Summary */}
            <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-4">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <Activity size={14} className="text-gray-400" />
                Activity Summary
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#0a0a0a] rounded-xl border border-[#1e1e1e] p-3 text-center">
                  <p className="text-xl font-bold text-white">{wallet.analytics?.portfolio?.totalAssets || filteredAssets.length}</p>
                  <p className="text-[10px] text-gray-500">Assets Held</p>
                </div>
                <div className="bg-[#0a0a0a] rounded-xl border border-[#1e1e1e] p-3 text-center">
                  <p className="text-xl font-bold text-white">{wallet.analytics?.trading?.totalTrades || wallet.transactionCounts.trades}</p>
                  <p className="text-[10px] text-gray-500">Total Trades</p>
                </div>
                <div className="bg-[#0a0a0a] rounded-xl border border-[#1e1e1e] p-3 text-center">
                  <p className="text-xl font-bold text-white">{wallet.transactionCounts.deposits}</p>
                  <p className="text-[10px] text-gray-500">Deposits</p>
                </div>
                <div className="bg-[#0a0a0a] rounded-xl border border-[#1e1e1e] p-3 text-center">
                  <p className="text-xl font-bold text-white">{wallet.transactionCounts.withdrawals}</p>
                  <p className="text-[10px] text-gray-500">Withdrawals</p>
                </div>
              </div>
            </div>

            {/* Staking Positions */}
            {wallet.staking.length > 0 && (
              <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-4">
                <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                  <TrendingUp size={14} className="text-purple-400" />
                  Active Staking
                </h3>
                <div className="space-y-2">
                  {wallet.staking.filter((s: any) => s.status === "active").map((s: any, i: number) => (
                    <div key={i} className="flex items-center justify-between bg-[#0a0a0a] rounded-xl border border-[#1e1e1e] p-3">
                      <div className="flex items-center gap-2">
                        <CryptoIcon symbol={s.symbol} size="xs" />
                        <div>
                          <p className="text-sm font-medium text-white">{formatCryptoNumber(s.amount)} {s.symbol}</p>
                          <p className="text-[10px] text-gray-500">{s.apy}% APY • {s.duration}d</p>
                        </div>
                      </div>
                      <span className="text-xs text-green-400 bg-green-500/10 px-2 py-1 rounded">Active</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Transactions */}
            <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Clock size={14} className="text-gray-400" />
                  Recent Transactions
                </h3>
                <button onClick={() => setActiveTab("history")} className="text-xs text-blue-400 hover:text-blue-300">View All →</button>
              </div>
              <TransactionList transactions={wallet.transactions.slice(0, 5)} hideBalances={hideBalances} />
            </div>
          </div>
        )}

        {/* Analytics Tab */}
        {activeTab === "analytics" && wallet.analytics && (
          <div className="mt-4 space-y-4">
            {/* Trading Overview */}
            <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-4">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <BarChart3 size={14} className="text-blue-400" />
                Trading Overview
              </h3>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="bg-[#0a0a0a] rounded-xl border border-[#1e1e1e] p-3 text-center">
                  <p className="text-lg font-bold text-white">{wallet.analytics.trading.executedTrades}</p>
                  <p className="text-[10px] text-gray-500">Executed</p>
                </div>
                <div className="bg-[#0a0a0a] rounded-xl border border-[#1e1e1e] p-3 text-center">
                  <p className="text-lg font-bold text-yellow-400">{wallet.analytics.trading.pendingTrades}</p>
                  <p className="text-[10px] text-gray-500">Pending</p>
                </div>
                <div className="bg-[#0a0a0a] rounded-xl border border-[#1e1e1e] p-3 text-center">
                  <p className="text-lg font-bold text-gray-500">{wallet.analytics.trading.cancelledTrades}</p>
                  <p className="text-[10px] text-gray-500">Cancelled</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-green-500/5 rounded-xl border border-green-500/10 p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <ArrowDown size={12} className="text-green-400" />
                    <span className="text-[10px] text-gray-500">Buy Orders</span>
                  </div>
                  <p className="text-sm font-bold text-green-400">{wallet.analytics.trading.buyCount}</p>
                  <p className="text-[10px] text-gray-600">Vol: {hideBalances ? '••••' : `$${formatUsdNumber(wallet.analytics.trading.buyVolume)}`}</p>
                </div>
                <div className="bg-red-500/5 rounded-xl border border-red-500/10 p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <ArrowUp size={12} className="text-red-400" />
                    <span className="text-[10px] text-gray-500">Sell Orders</span>
                  </div>
                  <p className="text-sm font-bold text-red-400">{wallet.analytics.trading.sellCount}</p>
                  <p className="text-[10px] text-gray-600">Vol: {hideBalances ? '••••' : `$${formatUsdNumber(wallet.analytics.trading.sellVolume)}`}</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="bg-[#0a0a0a] rounded-xl border border-[#1e1e1e] p-3">
                  <p className="text-[10px] text-gray-500 mb-0.5">Total Volume</p>
                  <p className="text-sm font-bold text-white">{bal(wallet.analytics.trading.totalVolume)}</p>
                </div>
                <div className="bg-[#0a0a0a] rounded-xl border border-[#1e1e1e] p-3">
                  <p className="text-[10px] text-gray-500 mb-0.5">Avg Trade Size</p>
                  <p className="text-sm font-bold text-white">{bal(wallet.analytics.trading.avgTradeSize)}</p>
                </div>
              </div>
            </div>

            {/* Top Traded Pairs */}
            {wallet.analytics.trading.topTradedPairs.length > 0 && (
              <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-4">
                <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                  <Target size={14} className="text-purple-400" />
                  Most Traded Pairs
                </h3>
                <div className="space-y-2">
                  {wallet.analytics.trading.topTradedPairs.map((pair, i) => {
                    const maxVol = wallet.analytics!.trading.topTradedPairs[0]?.volume || 1;
                    const pct = (pair.volume / maxVol) * 100;
                    return (
                      <div key={pair.symbol} className="flex items-center gap-3">
                        <span className="text-xs text-gray-600 w-4">{i + 1}</span>
                        <CryptoIcon symbol={pair.symbol.split("/")[0]} size="xs" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-white">{pair.symbol}</span>
                            <span className="text-xs text-gray-400">{pair.count} trades</span>
                          </div>
                          <div className="h-1 bg-[#1a1a1a] rounded-full overflow-hidden">
                            <div className="h-full bg-purple-500 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                        <span className="text-xs text-white tabular-nums w-20 text-right">{bal(pair.volume)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Futures Performance */}
            {wallet.analytics.futures.totalFutures > 0 && (
              <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-4">
                <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                  <Zap size={14} className="text-purple-400" />
                  Futures Performance
                </h3>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="bg-[#0a0a0a] rounded-xl border border-[#1e1e1e] p-3 text-center">
                    <p className="text-lg font-bold text-white">{wallet.analytics.futures.completedFutures}</p>
                    <p className="text-[10px] text-gray-500">Completed</p>
                  </div>
                  <div className="bg-[#0a0a0a] rounded-xl border border-[#1e1e1e] p-3 text-center">
                    <p className="text-lg font-bold text-green-400">{wallet.analytics.futures.wins}</p>
                    <p className="text-[10px] text-gray-500">Wins</p>
                  </div>
                  <div className="bg-[#0a0a0a] rounded-xl border border-[#1e1e1e] p-3 text-center">
                    <p className="text-lg font-bold text-red-400">{wallet.analytics.futures.losses}</p>
                    <p className="text-[10px] text-gray-500">Losses</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-[#0a0a0a] rounded-xl border border-[#1e1e1e] p-3">
                    <p className="text-[10px] text-gray-500 mb-0.5">Win Rate</p>
                    <p className="text-sm font-bold text-white">{wallet.analytics.futures.winRate.toFixed(1)}%</p>
                  </div>
                  <div className="bg-[#0a0a0a] rounded-xl border border-[#1e1e1e] p-3">
                    <p className="text-[10px] text-gray-500 mb-0.5">Total P&L</p>
                    <p className={`text-sm font-bold ${wallet.analytics.futures.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {wallet.analytics.futures.pnl >= 0 ? '+' : ''}{bal(wallet.analytics.futures.pnl)}
                    </p>
                  </div>
                  <div className="bg-green-500/5 rounded-xl border border-green-500/10 p-3">
                    <p className="text-[10px] text-gray-500 mb-0.5">Biggest Win</p>
                    <p className="text-sm font-bold text-green-400">+{bal(wallet.analytics.futures.biggestWin)}</p>
                  </div>
                  <div className="bg-red-500/5 rounded-xl border border-red-500/10 p-3">
                    <p className="text-[10px] text-gray-500 mb-0.5">Biggest Loss</p>
                    <p className="text-sm font-bold text-red-400">{bal(wallet.analytics.futures.biggestLoss)}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Monthly Performance */}
            {wallet.analytics.monthlyPerformance.length > 0 && (
              <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-4">
                <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                  <Activity size={14} className="text-cyan-400" />
                  Monthly Performance
                </h3>
                <div className="space-y-2">
                  {wallet.analytics.monthlyPerformance.map(m => {
                    const maxVol = Math.max(...wallet.analytics!.monthlyPerformance.map(p => p.volume), 1);
                    const pct = (m.volume / maxVol) * 100;
                    return (
                      <div key={m.month} className="bg-[#0a0a0a] rounded-xl border border-[#1e1e1e] p-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-medium text-white">{m.month}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] text-gray-500">{m.trades} trades</span>
                            <span className={`text-xs font-semibold ${m.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {m.pnl >= 0 ? '+' : ''}{hideBalances ? '••••' : `$${formatUsdNumber(Math.abs(m.pnl))}`}
                            </span>
                          </div>
                        </div>
                        <div className="h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${m.pnl >= 0 ? 'bg-green-500' : 'bg-red-500'}`}
                            style={{ width: `${Math.max(2, pct)}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-[10px] text-gray-600">
                            Vol: {hideBalances ? '••••' : `$${formatUsdNumber(m.volume)}`}
                          </span>
                          <span className="text-[10px] text-amber-400/60">
                            Fees: {hideBalances ? '••••' : `$${formatUsdNumber(m.fees)}`}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Net Flow & Fees Summary */}
            <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-4">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <DollarSign size={14} className="text-amber-400" />
                Financial Summary
              </h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between bg-[#0a0a0a] rounded-xl border border-[#1e1e1e] p-3">
                  <span className="text-xs text-gray-400">Net Deposit Flow</span>
                  <span className={`text-sm font-bold ${wallet.analytics.portfolio.netFlow >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {wallet.analytics.portfolio.netFlow >= 0 ? '+' : ''}{bal(wallet.analytics.portfolio.netFlow)}
                  </span>
                </div>
                <div className="flex items-center justify-between bg-[#0a0a0a] rounded-xl border border-[#1e1e1e] p-3">
                  <span className="text-xs text-gray-400">Total Fees Paid</span>
                  <span className="text-sm font-bold text-amber-400">{bal(wallet.analytics.fees.total)}</span>
                </div>
                <div className="flex items-center justify-between bg-[#0a0a0a] rounded-xl border border-[#1e1e1e] p-3">
                  <span className="text-xs text-gray-400">Trading Fees</span>
                  <span className="text-sm font-bold text-white">{bal(wallet.analytics.fees.trading)}</span>
                </div>
                <div className="flex items-center justify-between bg-[#0a0a0a] rounded-xl border border-[#1e1e1e] p-3">
                  <span className="text-xs text-gray-400">Deposit Fees</span>
                  <span className="text-sm font-bold text-white">{bal(wallet.analytics.fees.deposit)}</span>
                </div>
                <div className="flex items-center justify-between bg-[#0a0a0a] rounded-xl border border-[#1e1e1e] p-3">
                  <span className="text-xs text-gray-400">Withdrawal Fees</span>
                  <span className="text-sm font-bold text-white">{bal(wallet.analytics.fees.withdrawal)}</span>
                </div>
                <div className="flex items-center justify-between bg-[#0a0a0a] rounded-xl border border-[#1e1e1e] p-3">
                  <span className="text-xs text-gray-400">Estimated P&L</span>
                  <span className={`text-sm font-bold ${wallet.estimatedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {wallet.estimatedPnl >= 0 ? '+' : ''}{bal(wallet.estimatedPnl)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Analytics Tab - Empty State */}
        {activeTab === "analytics" && !wallet.analytics && (
          <div className="mt-4">
            <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-8 text-center">
              <BarChart3 size={32} className="text-gray-600 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">Analytics data is loading...</p>
              <button onClick={() => refetch()} className="mt-3 text-blue-400 text-xs hover:text-blue-300">Refresh</button>
            </div>
          </div>
        )}

        {/* Assets Tab */}
        {activeTab === "assets" && (
          <div className="mt-4 space-y-3">
            {/* Search */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search assets..."
                className="w-full bg-[#111] border border-[#1e1e1e] rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#2a2a2a]"
              />
            </div>

            {/* Asset List */}
            <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] overflow-hidden">
              {filteredAssets.length === 0 ? (
                <div className="p-8 text-center">
                  <Wallet size={32} className="text-gray-600 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">No assets found</p>
                </div>
              ) : (
                <div className="divide-y divide-[#1e1e1e]">
                  {filteredAssets.map(asset => (
                    <div key={asset.symbol}>
                      <button
                        onClick={() => setExpandedAsset(expandedAsset === asset.symbol ? null : asset.symbol)}
                        className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-[#1a1a1a]/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <CryptoIcon symbol={asset.symbol} size="md" />
                          <div className="text-left">
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-semibold text-white">{asset.symbol}</p>
                              {asset.frozen > 0 && (
                                <span className="flex items-center gap-0.5 text-[10px] text-yellow-400 bg-yellow-500/10 px-1.5 py-0.5 rounded">
                                  <Snowflake size={10} /> Frozen
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-500">{cryptoBal(asset.total)} {asset.symbol}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <p className="text-sm font-semibold text-white tabular-nums">{bal(asset.usdValue)}</p>
                            <p className={`text-xs ${asset.change24h >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {asset.change24h >= 0 ? '+' : ''}{asset.change24h.toFixed(2)}%
                            </p>
                          </div>
                          {expandedAsset === asset.symbol ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
                        </div>
                      </button>

                      {/* Expanded Detail */}
                      {expandedAsset === asset.symbol && (
                        <div className="px-4 pb-3 bg-[#0a0a0a] border-t border-[#1e1e1e]">
                          <div className="grid grid-cols-3 gap-3 pt-3">
                            <div>
                              <p className="text-[10px] text-gray-500 mb-0.5">Available</p>
                              <p className="text-xs font-medium text-white">{cryptoBal(asset.available)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-gray-500 mb-0.5">Frozen</p>
                              <p className="text-xs font-medium text-yellow-400">{asset.frozen > 0 ? cryptoBal(asset.frozen) : '0'}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-gray-500 mb-0.5">Price</p>
                              <p className="text-xs font-medium text-white">${formatUsdNumber(asset.price)}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* History Tab */}
        {activeTab === "history" && (
          <div className="mt-4 space-y-3">
            {/* Filter Row */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Search */}
              <div className="relative flex-1 min-w-[160px]">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  value={historySearch}
                  onChange={e => setHistorySearch(e.target.value)}
                  placeholder="Search symbol, type..."
                  className="w-full bg-[#111] border border-[#1e1e1e] rounded-lg pl-7 pr-3 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-[#2a2a2a]"
                />
              </div>
              <DateRangePicker value={historyDateRange} onChange={setHistoryDateRange} />
              <button
                onClick={handleExportHistory}
                disabled={filteredTransactions.length === 0}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white bg-[#111] border border-[#1e1e1e] hover:border-[#2a2a2a] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Download size={12} />
                CSV
              </button>
            </div>

            {/* Type Filter Tabs */}
            <div className="flex gap-1 overflow-x-auto pb-1">
              {[
                { id: "all", label: "All" },
                { id: "deposit", label: "Deposits" },
                { id: "withdrawal", label: "Withdrawals" },
                { id: "trade", label: "Trades" },
                { id: "futures", label: "Futures" },
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setTxFilter(f.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                    txFilter === f.id
                      ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                      : 'bg-[#111] text-gray-500 border border-[#1e1e1e] hover:text-gray-300'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Transaction List */}
            <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-4">
              <TransactionList transactions={paginatedTransactions} hideBalances={hideBalances} />

              {/* Pagination */}
              {filteredTransactions.length > 0 && (
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#1e1e1e]">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-600">{filteredTransactions.length} total</span>
                    <select
                      value={historyPageSize}
                      onChange={e => setHistoryPageSize(Number(e.target.value))}
                      className="px-1.5 py-0.5 rounded text-[10px] bg-[#0a0a0a] border border-[#1e1e1e] text-gray-500 focus:outline-none"
                    >
                      {[10, 25, 50].map(s => <option key={s} value={s}>{s}/page</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setHistoryPage(p => Math.max(0, p - 1))}
                      disabled={historyPage === 0}
                      className="p-1 rounded hover:bg-[#1a1a1a] disabled:opacity-30 transition-colors"
                    >
                      <ChevronLeft size={14} className="text-gray-400" />
                    </button>
                    <span className="text-[10px] text-gray-500 px-2">{historyPage + 1} / {historyTotalPages}</span>
                    <button
                      onClick={() => setHistoryPage(p => Math.min(historyTotalPages - 1, p + 1))}
                      disabled={historyPage >= historyTotalPages - 1}
                      className="p-1 rounded hover:bg-[#1a1a1a] disabled:opacity-30 transition-colors"
                    >
                      <ChevronRight size={14} className="text-gray-400" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <DepositModal
        isOpen={activeModal === "deposit"}
        onClose={() => setActiveModal(null)}
      />
      <WithdrawModal
        isOpen={activeModal === "withdraw"}
        onClose={() => setActiveModal(null)}
      />
      <ConvertModal
        isOpen={activeModal === "convert"}
        onClose={() => setActiveModal(null)}
        userId={userId}
      />
      <PortfolioModal
        isOpen={activeModal === "portfolio"}
        onClose={() => setActiveModal(null)}
      />
    </div>
  );
}

function TransactionList({ transactions, hideBalances }: { transactions: WalletTransaction[]; hideBalances: boolean }) {
  const [selectedTx, setSelectedTx] = useState<WalletTransaction | null>(null);

  if (transactions.length === 0) {
    return <p className="text-gray-600 text-sm text-center py-6">No transactions found</p>;
  }

  const getTypeConfig = (tx: WalletTransaction) => {
    switch (tx.type) {
      case "deposit":
        return { icon: ArrowDownLeft, color: "text-green-400", bg: "bg-green-500/10", label: "Deposit" };
      case "withdrawal":
        return { icon: ArrowUpRight, color: "text-red-400", bg: "bg-red-500/10", label: "Withdrawal" };
      case "trade":
        return { icon: ArrowRightLeft, color: "text-blue-400", bg: "bg-blue-500/10", label: `${tx.side?.toUpperCase()} Trade` };
      case "futures":
        return { icon: Zap, color: "text-purple-400", bg: "bg-purple-500/10", label: `Futures ${tx.side?.toUpperCase() || ''}` };
      default:
        return { icon: Clock, color: "text-gray-400", bg: "bg-gray-500/10", label: tx.type };
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "approved": case "completed": case "closed": return "text-green-400 bg-green-500/10";
      case "pending": return "text-yellow-400 bg-yellow-500/10";
      case "rejected": case "failed": return "text-red-400 bg-red-500/10";
      default: return "text-gray-400 bg-gray-500/10";
    }
  };

  return (
    <>
      <div className="space-y-2">
        {transactions.map(tx => {
          const config = getTypeConfig(tx);
          const Icon = config.icon;
          return (
            <div key={tx.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-[#1a1a1a]/50 transition-colors">
              <div className={`w-8 h-8 rounded-lg ${config.bg} flex items-center justify-center flex-shrink-0`}>
                <Icon size={16} className={config.color} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-white">{config.label}</span>
                  <CryptoIcon symbol={tx.symbol?.split("/")[0] || tx.symbol} size="xs" />
                  <span className="text-xs text-gray-500">{tx.symbol}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-gray-600">
                    {formatDateTime(tx.date)}
                  </span>
                  <StatusBadge status={tx.status} size="sm" showIcon={false} />
                </div>
              </div>
              <div className="text-right flex-shrink-0 flex items-center gap-2">
                <div>
                  <p className={`text-sm font-medium tabular-nums ${
                    tx.type === "deposit" ? "text-green-400" :
                    tx.type === "withdrawal" ? "text-red-400" : "text-white"
                  }`}>
                    {hideBalances ? "••••" : `${tx.type === "deposit" ? '+' : tx.type === "withdrawal" ? '-' : ''}${formatCryptoNumber(tx.amount)}`}
                  </p>
                  {!hideBalances && typeof tx.feeAmount === "number" && tx.feeAmount > 0 && (
                    <p className="text-[10px] text-amber-400">
                      Fee: {formatCryptoNumber(tx.feeAmount)} {tx.feeSymbol || tx.symbol}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setSelectedTx(tx)}
                  className="w-6 h-6 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center hover:bg-[#222] transition-colors flex-shrink-0"
                >
                  <Info size={12} className="text-gray-400" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Transaction Detail Modal */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setSelectedTx(null)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative bg-[#111] border border-[#1e1e1e] rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-[#1e1e1e]">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl ${getTypeConfig(selectedTx).bg} flex items-center justify-center`}>
                  {(() => { const Ic = getTypeConfig(selectedTx).icon; return <Ic size={18} className={getTypeConfig(selectedTx).color} />; })()}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">{getTypeConfig(selectedTx).label}</h3>
                  <p className="text-[10px] text-gray-500">ID: #{selectedTx.id}</p>
                </div>
              </div>
              <button onClick={() => setSelectedTx(null)} className="w-7 h-7 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center hover:bg-[#222] transition-colors">
                <X size={14} className="text-gray-400" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 space-y-4">
              {/* Status & Date */}
              <div className="flex items-center justify-between">
                <StatusBadge status={selectedTx.status} size="md" />
                <span className="text-xs text-gray-500">{formatDateTime(selectedTx.date)}</span>
              </div>

              {/* Asset Info */}
              <div className="bg-[#0a0a0a] rounded-xl border border-[#1e1e1e] p-3">
                <div className="flex items-center gap-2 mb-3">
                  <CryptoIcon symbol={selectedTx.symbol?.split("/")[0] || selectedTx.symbol} size="sm" />
                  <span className="text-sm font-medium text-white">{selectedTx.symbol}</span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Amount</span>
                    <span className={`font-medium ${selectedTx.type === "deposit" ? "text-green-400" : selectedTx.type === "withdrawal" ? "text-red-400" : "text-white"}`}>
                      {selectedTx.type === "deposit" ? "+" : selectedTx.type === "withdrawal" ? "-" : ""}{formatCryptoNumber(selectedTx.amount)} {selectedTx.symbol?.split("/")[0] || selectedTx.symbol}
                    </span>
                  </div>
                  {selectedTx.price != null && selectedTx.price > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">Price</span>
                      <span className="text-white">${formatUsdNumber(selectedTx.price)}</span>
                    </div>
                  )}
                  {selectedTx.price != null && selectedTx.price > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">Total Value</span>
                      <span className="text-white">${formatUsdNumber(selectedTx.amount * selectedTx.price)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Fee Breakdown */}
              {typeof selectedTx.feeAmount === "number" && selectedTx.feeAmount > 0 && (
                <div className="bg-[#0a0a0a] rounded-xl border border-[#1e1e1e] p-3">
                  <p className="text-[10px] text-gray-400 uppercase font-medium mb-2">Fee Breakdown</p>
                  <div className="space-y-2">
                    {selectedTx.feeRate != null && selectedTx.feeRate > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">Fee Rate</span>
                        <span className="text-amber-400">{(selectedTx.feeRate * 100).toFixed(2)}%</span>
                      </div>
                    )}
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">Fee Amount</span>
                      <span className="text-amber-400">-{formatCryptoNumber(selectedTx.feeAmount)} {selectedTx.feeSymbol || selectedTx.symbol}</span>
                    </div>
                    {typeof selectedTx.netAmount === "number" && selectedTx.netAmount > 0 && (
                      <div className="flex justify-between text-xs pt-2 border-t border-[#1e1e1e]">
                        <span className="text-gray-500">Net Amount</span>
                        <span className="text-white font-medium">{formatCryptoNumber(selectedTx.netAmount)} {selectedTx.symbol?.split("/")[0] || selectedTx.symbol}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* No Fee Info */}
              {(selectedTx.feeAmount == null || selectedTx.feeAmount === 0) && (
                <div className="bg-[#0a0a0a] rounded-xl border border-[#1e1e1e] p-3">
                  <p className="text-[10px] text-gray-400 uppercase font-medium mb-2">Fee Info</p>
                  <p className="text-xs text-green-400">No fee applied to this transaction</p>
                </div>
              )}

              {/* Additional Info */}
              {(selectedTx.walletAddress || selectedTx.result || selectedTx.side) && (
                <div className="bg-[#0a0a0a] rounded-xl border border-[#1e1e1e] p-3">
                  <p className="text-[10px] text-gray-400 uppercase font-medium mb-2">Additional Details</p>
                  <div className="space-y-2">
                    {selectedTx.side && (
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">Side</span>
                        <span className="text-white">{selectedTx.side.toUpperCase()}</span>
                      </div>
                    )}
                    {selectedTx.result && (
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">Result</span>
                        <span className={selectedTx.result === "win" ? "text-green-400" : "text-red-400"}>{selectedTx.result.toUpperCase()}</span>
                      </div>
                    )}
                    {selectedTx.walletAddress && (
                      <div className="text-xs">
                        <span className="text-gray-500 block mb-1">Wallet Address</span>
                        <span className="text-gray-300 font-mono text-[10px] break-all bg-[#0d0d0d] px-2 py-1 rounded-lg border border-[#1e1e1e] block">{selectedTx.walletAddress}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
