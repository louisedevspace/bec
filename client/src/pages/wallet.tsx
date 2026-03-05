import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { CryptoIcon } from "@/components/crypto/crypto-icon";
import { formatUsdNumber, formatCryptoNumber } from "@/utils/format-utils";
import {
  Wallet, TrendingUp, TrendingDown, ArrowDownLeft, ArrowUpRight,
  RefreshCw, Lock, Eye, EyeOff, Clock, Filter, Search, PieChart,
  BarChart3, History, Zap, ArrowRightLeft, ChevronDown, ChevronUp
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
}

export default function WalletPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [hideBalances, setHideBalances] = useState(false);
  const [activeTab, setActiveTab] = useState<"assets" | "history" | "overview">("overview");
  const [txFilter, setTxFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedAsset, setExpandedAsset] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
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
    if (txFilter === "all") return wallet.transactions;
    return wallet.transactions.filter(t => t.type === txFilter);
  }, [wallet?.transactions, txFilter]);

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

            {/* Mini Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatBox icon={ArrowDownLeft} label="Deposited" value={bal(wallet.totalDeposited)} color="text-green-400" />
              <StatBox icon={ArrowUpRight} label="Withdrawn" value={bal(wallet.totalWithdrawn)} color="text-red-400" />
              <StatBox icon={BarChart3} label="Trade P&L" value={bal(wallet.tradePnl)} color={wallet.tradePnl >= 0 ? "text-green-400" : "text-red-400"} />
              <StatBox icon={Zap} label="Futures P&L" value={bal(wallet.futuresPnl)} color={wallet.futuresPnl >= 0 ? "text-green-400" : "text-red-400"} />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-5xl mx-auto px-4">
        <div className="flex gap-1 mt-4 bg-[#111] rounded-xl border border-[#1e1e1e] p-1">
          {[
            { id: "overview", label: "Overview", icon: PieChart },
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

            {/* Transaction Summary */}
            <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-4">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <History size={14} className="text-gray-400" />
                Activity Summary
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#0a0a0a] rounded-xl border border-[#1e1e1e] p-3 text-center">
                  <p className="text-xl font-bold text-white">{wallet.transactionCounts.deposits}</p>
                  <p className="text-[10px] text-gray-500">Deposits</p>
                </div>
                <div className="bg-[#0a0a0a] rounded-xl border border-[#1e1e1e] p-3 text-center">
                  <p className="text-xl font-bold text-white">{wallet.transactionCounts.withdrawals}</p>
                  <p className="text-[10px] text-gray-500">Withdrawals</p>
                </div>
                <div className="bg-[#0a0a0a] rounded-xl border border-[#1e1e1e] p-3 text-center">
                  <p className="text-xl font-bold text-white">{wallet.transactionCounts.trades}</p>
                  <p className="text-[10px] text-gray-500">Spot Trades</p>
                </div>
                <div className="bg-[#0a0a0a] rounded-xl border border-[#1e1e1e] p-3 text-center">
                  <p className="text-xl font-bold text-white">{wallet.transactionCounts.futures}</p>
                  <p className="text-[10px] text-gray-500">Futures Trades</p>
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
                            <p className="text-sm font-semibold text-white">{asset.symbol}</p>
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
            {/* Filter Tabs */}
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
              <TransactionList transactions={filteredTransactions} hideBalances={hideBalances} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatBox({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <div className="bg-[#0a0a0a] rounded-xl border border-[#1e1e1e] p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={12} className={color} />
        <span className="text-[10px] text-gray-500">{label}</span>
      </div>
      <p className="text-sm font-semibold text-white tabular-nums">{value}</p>
    </div>
  );
}

function TransactionList({ transactions, hideBalances }: { transactions: WalletTransaction[]; hideBalances: boolean }) {
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
                  {new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${getStatusColor(tx.status)}`}>
                  {tx.status}
                </span>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <p className={`text-sm font-medium tabular-nums ${
                tx.type === "deposit" ? "text-green-400" :
                tx.type === "withdrawal" ? "text-red-400" : "text-white"
              }`}>
                {hideBalances ? "••••" : `${tx.type === "deposit" ? '+' : tx.type === "withdrawal" ? '-' : ''}${formatCryptoNumber(tx.amount)}`}
              </p>
              {tx.price && !hideBalances && (
                <p className="text-[10px] text-gray-600">@${formatUsdNumber(tx.price)}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
