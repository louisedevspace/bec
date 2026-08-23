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
import { BankDepositModal } from "@/components/modals/bank-deposit-modal";
import { useBankDepositStatus } from "@/hooks/use-bank-deposit-status";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { StatusBadge } from "@/components/ui/status-badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";

import {
  Wallet, ArrowDownLeft, ArrowUpRight,
  RefreshCw, Lock, Eye, EyeOff, Clock, Search, PieChart,
  History, Zap, ArrowRightLeft, ChevronDown, ChevronUp,
  Plus, Send, Snowflake, Info, X,
  ChevronLeft, ChevronRight, Landmark
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
  const [activeTab, setActiveTab] = useState<"assets" | "history">("assets");
  const [txFilter, setTxFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedAsset, setExpandedAsset] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const bankDepositStatus = useBankDepositStatus();
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
    if (tab && ["assets", "history"].includes(tab)) {
      setActiveTab(tab as "assets" | "history");
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

  

  const bal = (v: number) => hideBalances ? "••••••" : `$${formatUsdNumber(v)}`;
  const cryptoBal = (v: number) => hideBalances ? "••••" : formatCryptoNumber(v);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="max-w-5xl mx-auto w-full px-4 py-6 space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-card rounded-xl border border-border p-4 animate-pulse">
              <div className="h-6 w-32 bg-muted rounded mb-3" />
              <div className="h-8 w-48 bg-muted rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!wallet) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Wallet size={48} className="text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Unable to load wallet</p>
          <button onClick={() => refetch()} className="mt-4 text-primary text-sm hover:text-primary/80">Try again</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20 lg:pb-12">
      <div className="max-w-6xl mx-auto px-4 lg:px-6 pt-4 lg:pt-8 lg:grid lg:grid-cols-[320px_1fr] lg:gap-6 lg:items-start">

        {/* Balance rail */}
        <aside className="bg-card rounded-2xl border border-border p-5 shadow-sm lg:sticky lg:top-24">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0">
                <Wallet size={18} className="text-primary" />
              </div>
              <div className="min-w-0">
                <h1 className="text-sm font-bold text-foreground">My Wallet</h1>
                <p className="text-[11px] text-muted-foreground truncate">Portfolio &amp; Transactions</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button onClick={() => setHideBalances(!hideBalances)} className="p-2 rounded-xl bg-muted border border-border hover:bg-muted/70 transition-colors">
                {hideBalances ? <EyeOff size={14} className="text-muted-foreground" /> : <Eye size={14} className="text-muted-foreground" />}
              </button>
              <button onClick={() => refetch()} className="p-2 rounded-xl bg-muted border border-border hover:bg-muted/70 transition-colors">
                <RefreshCw size={14} className="text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* Wallet Lock Warning */}
          {wallet.walletLocked && (
            <div className="bg-danger/10 border border-danger/20 rounded-xl px-3 py-2.5 mb-4 flex items-start gap-2">
              <Lock size={14} className="text-danger flex-shrink-0 mt-0.5" />
              <span className="text-danger text-xs font-medium">Your wallet is currently locked. Contact support for assistance.</span>
            </div>
          )}

          {/* Total Balance */}
          <p className="text-xs text-muted-foreground mb-1">Total Portfolio Value</p>
          <div className="flex items-baseline gap-2 flex-wrap mb-5">
            <span className="text-3xl font-bold text-foreground tabular-nums">{bal(wallet.totalValue)}</span>
            <span className={`text-xs font-semibold tabular-nums px-1.5 py-0.5 rounded-full ${wallet.estimatedPnl >= 0 ? 'text-success bg-success/10' : 'text-danger bg-danger/10'}`}>
              {wallet.estimatedPnl >= 0 ? '+' : ''}{hideBalances ? '••••' : `$${formatUsdNumber(Math.abs(wallet.estimatedPnl))}`}
            </span>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => !wallet.walletLocked && setActiveModal("deposit")}
              disabled={wallet.walletLocked}
              className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border transition-colors ${
                wallet.walletLocked
                  ? 'bg-muted/50 border-border opacity-50 cursor-not-allowed'
                  : 'bg-success/10 border-success/20 hover:bg-success/20'
              }`}
            >
              <Plus size={18} className={wallet.walletLocked ? "text-muted-foreground" : "text-success"} />
              <span className={`text-xs font-medium ${wallet.walletLocked ? "text-muted-foreground" : "text-success"}`}>Deposit</span>
            </button>
            <button
              onClick={() => !wallet.walletLocked && setActiveModal("withdraw")}
              disabled={wallet.walletLocked}
              className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border transition-colors ${
                wallet.walletLocked
                  ? 'bg-muted/50 border-border opacity-50 cursor-not-allowed'
                  : 'bg-danger/10 border-danger/20 hover:bg-danger/20'
              }`}
            >
              <Send size={18} className={wallet.walletLocked ? "text-muted-foreground" : "text-danger"} />
              <span className={`text-xs font-medium ${wallet.walletLocked ? "text-muted-foreground" : "text-danger"}`}>Withdraw</span>
            </button>
            <button
              onClick={() => !wallet.walletLocked && setActiveModal("convert")}
              disabled={wallet.walletLocked}
              className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border transition-colors ${
                wallet.walletLocked
                  ? 'bg-muted/50 border-border opacity-50 cursor-not-allowed'
                  : 'bg-info/10 border-info/20 hover:bg-info/20'
              }`}
            >
              <ArrowRightLeft size={18} className={wallet.walletLocked ? "text-muted-foreground" : "text-info"} />
              <span className={`text-xs font-medium ${wallet.walletLocked ? "text-muted-foreground" : "text-info"}`}>Convert</span>
            </button>
            <button
              onClick={() => setActiveModal("portfolio")}
              className="flex flex-col items-center gap-1.5 py-3 rounded-xl border bg-primary/10 border-primary/20 hover:bg-primary/20 transition-colors"
            >
              <PieChart size={18} className="text-primary" />
              <span className="text-xs font-medium text-primary">Portfolio</span>
            </button>
            {bankDepositStatus.data?.isEnabled && (
              <button
                onClick={() => !wallet.walletLocked && setActiveModal("bank-deposit")}
                disabled={wallet.walletLocked}
                className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border transition-colors ${
                  wallet.walletLocked
                    ? 'bg-muted/50 border-border opacity-50 cursor-not-allowed'
                    : 'bg-success/10 border-success/20 hover:bg-success/20'
                }`}
              >
                <Landmark size={18} className={wallet.walletLocked ? "text-muted-foreground" : "text-success"} />
                <span className={`text-xs font-medium ${wallet.walletLocked ? "text-muted-foreground" : "text-success"}`}>Bank Transfer</span>
              </button>
            )}
          </div>
        </aside>

        {/* Content */}
        <div className="mt-4 lg:mt-0">
          {/* Tabs */}
          <div className="inline-flex bg-muted rounded-full p-1 gap-1">
            {[
              { id: "assets", label: "Assets", icon: Wallet },
              { id: "history", label: "History", icon: History },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-2 rounded-full text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                  activeTab === tab.id
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <tab.icon size={12} />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Assets Tab */}
          {activeTab === "assets" && (
            <div className="mt-4 space-y-3">
              {/* Search */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search assets..."
                  className="w-full bg-card border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/40"
                />
              </div>

              {/* Asset Grid — two columns on desktop to use the extra width */}
              {filteredAssets.length === 0 ? (
                <div className="bg-card rounded-2xl border border-border p-8 text-center">
                  <Wallet size={32} className="text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground text-sm">No assets found</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredAssets.map(asset => (
                    <div key={asset.symbol} className="bg-card rounded-2xl border border-border overflow-hidden hover:border-primary/40 transition-colors">
                      <button
                        onClick={() => setExpandedAsset(expandedAsset === asset.symbol ? null : asset.symbol)}
                        className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <CryptoIcon symbol={asset.symbol} size="md" />
                          <div className="text-left min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-semibold text-foreground">{asset.symbol}</p>
                              {asset.frozen > 0 && (
                                <span className="flex items-center gap-0.5 text-[10px] text-warning bg-warning/10 px-1.5 py-0.5 rounded-full">
                                  <Snowflake size={10} /> Frozen
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground tabular-nums">{cryptoBal(asset.total)} {asset.symbol}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <div className="text-right">
                            <p className="text-sm font-semibold text-foreground tabular-nums">{bal(asset.usdValue)}</p>
                            <p className={`text-xs tabular-nums ${asset.change24h >= 0 ? 'text-success' : 'text-danger'}`}>
                              {asset.change24h >= 0 ? '+' : ''}{asset.change24h.toFixed(2)}%
                            </p>
                          </div>
                          {expandedAsset === asset.symbol ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
                        </div>
                      </button>

                      {/* Expanded Detail */}
                      {expandedAsset === asset.symbol && (
                        <div className="px-4 pb-3 bg-muted/30 border-t border-border">
                          <div className="grid grid-cols-3 gap-3 pt-3">
                            <div>
                              <p className="text-[10px] text-muted-foreground mb-0.5">Available</p>
                              <p className="text-xs font-medium text-foreground tabular-nums">{cryptoBal(asset.available)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground mb-0.5">Frozen</p>
                              <p className="text-xs font-medium text-warning tabular-nums">{asset.frozen > 0 ? cryptoBal(asset.frozen) : '0'}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground mb-0.5">Price</p>
                              <p className="text-xs font-medium text-foreground tabular-nums">${formatUsdNumber(asset.price)}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* History Tab */}
          {activeTab === "history" && (
            <div className="mt-4 space-y-3">
              {/* Filter Row */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Search */}
                <div className="relative flex-1 min-w-[160px]">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={historySearch}
                    onChange={e => setHistorySearch(e.target.value)}
                    placeholder="Search symbol, type..."
                    className="w-full bg-card border border-border rounded-lg pl-7 pr-3 py-1.5 text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/40"
                  />
                </div>
                <DateRangePicker value={historyDateRange} onChange={setHistoryDateRange} />
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
                    className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                      txFilter === f.id
                        ? 'bg-primary/10 text-primary border border-primary/20'
                        : 'bg-card text-muted-foreground border border-border hover:text-foreground'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Transaction List */}
              <div className="bg-card rounded-2xl border border-border p-4 shadow-sm">
                <TransactionList transactions={paginatedTransactions} hideBalances={hideBalances} />

                {/* Pagination */}
                {filteredTransactions.length > 0 && (
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground">{filteredTransactions.length} total</span>
                      <select
                        value={historyPageSize}
                        onChange={e => setHistoryPageSize(Number(e.target.value))}
                        className="px-1.5 py-0.5 rounded text-[10px] bg-muted border border-border text-muted-foreground focus:outline-none"
                      >
                        {[10, 25, 50].map(s => <option key={s} value={s}>{s}/page</option>)}
                      </select>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setHistoryPage(p => Math.max(0, p - 1))}
                        disabled={historyPage === 0}
                        className="p-1 rounded hover:bg-muted disabled:opacity-30 transition-colors"
                      >
                        <ChevronLeft size={14} className="text-muted-foreground" />
                      </button>
                      <span className="text-[10px] text-muted-foreground px-2">{historyPage + 1} / {historyTotalPages}</span>
                      <button
                        onClick={() => setHistoryPage(p => Math.min(historyTotalPages - 1, p + 1))}
                        disabled={historyPage >= historyTotalPages - 1}
                        className="p-1 rounded hover:bg-muted disabled:opacity-30 transition-colors"
                      >
                        <ChevronRight size={14} className="text-muted-foreground" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
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
      <BankDepositModal
        isOpen={activeModal === "bank-deposit"}
        onClose={() => setActiveModal(null)}
      />
    </div>
  );
}

function TransactionList({ transactions, hideBalances }: { transactions: WalletTransaction[]; hideBalances: boolean }) {
  const [selectedTx, setSelectedTx] = useState<WalletTransaction | null>(null);

  if (transactions.length === 0) {
    return <p className="text-muted-foreground text-sm text-center py-6">No transactions found</p>;
  }

  const getTypeConfig = (tx: WalletTransaction) => {
    switch (tx.type) {
      case "deposit":
        return { icon: ArrowDownLeft, color: "text-success", bg: "bg-success/10", label: "Deposit" };
      case "withdrawal":
        return { icon: ArrowUpRight, color: "text-danger", bg: "bg-danger/10", label: "Withdrawal" };
      case "trade":
        return { icon: ArrowRightLeft, color: "text-info", bg: "bg-info/10", label: `${tx.side?.toUpperCase()} Trade` };
      case "futures":
        return { icon: Zap, color: "text-primary", bg: "bg-primary/10", label: `Futures ${tx.side?.toUpperCase() || ''}` };
      default:
        return { icon: Clock, color: "text-muted-foreground", bg: "bg-muted", label: tx.type };
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "approved": case "completed": case "closed": return "text-success bg-success/10";
      case "pending": return "text-warning bg-warning/10";
      case "rejected": case "failed": return "text-danger bg-danger/10";
      default: return "text-muted-foreground bg-muted";
    }
  };

  return (
    <>
      <div className="space-y-2">
        {transactions.map(tx => {
          const config = getTypeConfig(tx);
          const Icon = config.icon;
          return (
            <div key={tx.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted/50 transition-colors">
              <div className={`w-8 h-8 rounded-lg ${config.bg} flex items-center justify-center flex-shrink-0`}>
                <Icon size={16} className={config.color} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-foreground">{config.label}</span>
                  <CryptoIcon symbol={tx.symbol?.split("/")[0] || tx.symbol} size="xs" />
                  <span className="text-xs text-muted-foreground">{tx.symbol}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-muted-foreground">
                    {formatDateTime(tx.date)}
                  </span>
                  <StatusBadge status={tx.status} size="sm" showIcon={false} />
                </div>
              </div>
              <div className="text-right flex-shrink-0 flex items-center gap-2">
                <div>
                  <p className={`text-sm font-medium tabular-nums ${
                    tx.type === "deposit" ? "text-success" :
                    tx.type === "withdrawal" ? "text-danger" : "text-foreground"
                  }`}>
                    {hideBalances ? "••••" : `${tx.type === "deposit" ? '+' : tx.type === "withdrawal" ? '-' : ''}${formatCryptoNumber(tx.amount)}`}
                  </p>
                  {!hideBalances && typeof tx.feeAmount === "number" && tx.feeAmount > 0 && (
                    <p className="text-[10px] text-warning tabular-nums">
                      Fee: {formatCryptoNumber(tx.feeAmount)} {tx.feeSymbol || tx.symbol}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setSelectedTx(tx)}
                  className="w-6 h-6 rounded-lg bg-muted border border-border flex items-center justify-center hover:bg-muted/70 transition-colors flex-shrink-0"
                >
                  <Info size={12} className="text-muted-foreground" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Transaction Detail Modal */}
      <Dialog open={!!selectedTx} onOpenChange={(open) => !open && setSelectedTx(null)}>
        <DialogContent className="max-w-md p-0" hideCloseButton>
          {selectedTx && (<>
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl ${getTypeConfig(selectedTx).bg} flex items-center justify-center`}>
                  {(() => { const Ic = getTypeConfig(selectedTx).icon; return <Ic size={18} className={getTypeConfig(selectedTx).color} />; })()}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{getTypeConfig(selectedTx).label}</h3>
                  <p className="text-[10px] text-muted-foreground">ID: #{selectedTx.id}</p>
                </div>
              </div>
              <button onClick={() => setSelectedTx(null)} className="w-7 h-7 rounded-lg bg-muted border border-border flex items-center justify-center hover:bg-muted/70 transition-colors">
                <X size={14} className="text-muted-foreground" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 space-y-4">
              {/* Status & Date */}
              <div className="flex items-center justify-between">
                <StatusBadge status={selectedTx.status} size="md" />
                <span className="text-xs text-muted-foreground">{formatDateTime(selectedTx.date)}</span>
              </div>

              {/* Asset Info */}
              <div className="bg-muted/50 rounded-xl border border-border p-3">
                <div className="flex items-center gap-2 mb-3">
                  <CryptoIcon symbol={selectedTx.symbol?.split("/")[0] || selectedTx.symbol} size="sm" />
                  <span className="text-sm font-medium text-foreground">{selectedTx.symbol}</span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Amount</span>
                    <span className={`font-medium tabular-nums ${selectedTx.type === "deposit" ? "text-success" : selectedTx.type === "withdrawal" ? "text-danger" : "text-foreground"}`}>
                      {selectedTx.type === "deposit" ? "+" : selectedTx.type === "withdrawal" ? "-" : ""}{formatCryptoNumber(selectedTx.amount)} {selectedTx.symbol?.split("/")[0] || selectedTx.symbol}
                    </span>
                  </div>
                  {selectedTx.price != null && selectedTx.price > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Price</span>
                      <span className="text-foreground tabular-nums">${formatUsdNumber(selectedTx.price)}</span>
                    </div>
                  )}
                  {selectedTx.price != null && selectedTx.price > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Total Value</span>
                      <span className="text-foreground tabular-nums">${formatUsdNumber(selectedTx.amount * selectedTx.price)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Fee Breakdown */}
              {typeof selectedTx.feeAmount === "number" && selectedTx.feeAmount > 0 && (
                <div className="bg-muted/50 rounded-xl border border-border p-3">
                  <p className="text-[10px] text-muted-foreground uppercase font-medium mb-2">Fee Breakdown</p>
                  <div className="space-y-2">
                    {selectedTx.feeRate != null && selectedTx.feeRate > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Fee Rate</span>
                        <span className="text-warning tabular-nums">{(selectedTx.feeRate * 100).toFixed(2)}%</span>
                      </div>
                    )}
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Fee Amount</span>
                      <span className="text-warning tabular-nums">-{formatCryptoNumber(selectedTx.feeAmount)} {selectedTx.feeSymbol || selectedTx.symbol}</span>
                    </div>
                    {typeof selectedTx.netAmount === "number" && selectedTx.netAmount > 0 && (
                      <div className="flex justify-between text-xs pt-2 border-t border-border">
                        <span className="text-muted-foreground">Net Amount</span>
                        <span className="text-foreground font-medium tabular-nums">{formatCryptoNumber(selectedTx.netAmount)} {selectedTx.symbol?.split("/")[0] || selectedTx.symbol}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* No Fee Info */}
              {(selectedTx.feeAmount == null || selectedTx.feeAmount === 0) && (
                <div className="bg-muted/50 rounded-xl border border-border p-3">
                  <p className="text-[10px] text-muted-foreground uppercase font-medium mb-2">Fee Info</p>
                  <p className="text-xs text-success">No fee applied to this transaction</p>
                </div>
              )}

              {/* Additional Info */}
              {(selectedTx.walletAddress || selectedTx.result || selectedTx.side) && (
                <div className="bg-muted/50 rounded-xl border border-border p-3">
                  <p className="text-[10px] text-muted-foreground uppercase font-medium mb-2">Additional Details</p>
                  <div className="space-y-2">
                    {selectedTx.side && (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Side</span>
                        <span className="text-foreground">{selectedTx.side.toUpperCase()}</span>
                      </div>
                    )}
                    {selectedTx.result && (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Result</span>
                        <span className={selectedTx.result === "win" ? "text-success" : "text-danger"}>{selectedTx.result.toUpperCase()}</span>
                      </div>
                    )}
                    {selectedTx.walletAddress && (
                      <div className="text-xs">
                        <span className="text-muted-foreground block mb-1">Wallet Address</span>
                        <span className="text-foreground font-mono text-[10px] break-all bg-card px-2 py-1 rounded-lg border border-border block">{selectedTx.walletAddress}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>)}
        </DialogContent>
      </Dialog>
    </>
  );
}
