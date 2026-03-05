import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { CryptoIcon } from "@/components/crypto/crypto-icon";
import { formatUsdNumber, formatCryptoNumber } from "@/utils/format-utils";
import AdminLayout from "./admin-layout";
import {
  Search, Wallet, Lock, Unlock, Eye, RefreshCw, Users, DollarSign,
  TrendingUp, ArrowDownLeft, ArrowUpRight, BarChart3, Zap, ChevronRight,
  ArrowLeft, Snowflake, Sun, AlertTriangle, Shield, X, Filter, ChevronDown
} from "lucide-react";

interface AdminWalletUser {
  userId: string;
  username: string;
  email: string;
  fullName: string;
  isActive: boolean;
  isVerified: boolean;
  walletLocked: boolean;
  createdAt: string;
  assets: Array<{ symbol: string; available: number; frozen: number; total: number; usdValue: number }>;
  totalValue: number;
  totalDeposited: number;
  totalWithdrawn: number;
  tradeEarnings: number;
  futuresPnl: number;
  estimatedPnl: number;
  depositCount: number;
  withdrawalCount: number;
  tradeCount: number;
  futuresCount: number;
}

interface PlatformStats {
  totalPlatformValue: number;
  totalPlatformDeposited: number;
  totalPlatformWithdrawn: number;
  totalUsers: number;
  lockedWallets: number;
  activeWallets: number;
  totalTradeEarnings: number;
  totalFuturesPnl: number;
}

interface AdminWalletsResponse {
  users: AdminWalletUser[];
  platformStats: PlatformStats;
}

interface UserWalletDetail {
  user: any;
  assets: any[];
  totalValue: number;
  totalDeposited: number;
  totalWithdrawn: number;
  tradePnl: number;
  futuresPnl: number;
  estimatedPnl: number;
  walletLocked: boolean;
  deposits: any[];
  withdrawals: any[];
  trades: any[];
  futures: any[];
  staking: any[];
}

export default function AdminWalletPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"value" | "name" | "deposits">("value");
  const [showLocked, setShowLocked] = useState<"all" | "locked" | "unlocked">("all");
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery<AdminWalletsResponse>({
    queryKey: ["/api/admin/wallets"],
    queryFn: () => apiRequest("GET", "/api/admin/wallets").then(r => r.json()),
    staleTime: 30000,
  });

  const { data: userDetail, isLoading: detailLoading } = useQuery<UserWalletDetail>({
    queryKey: ["/api/admin/wallets", selectedUserId],
    queryFn: () => apiRequest("GET", `/api/admin/wallets/${selectedUserId}`).then(r => r.json()),
    enabled: !!selectedUserId,
    staleTime: 15000,
  });

  const lockMutation = useMutation({
    mutationFn: async ({ userId, lock }: { userId: string; lock: boolean }) => {
      return apiRequest("POST", `/api/admin/wallets/${userId}/lock`, { lock }).then(r => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/wallets"] });
    },
  });

  const freezeMutation = useMutation({
    mutationFn: async ({ userId, symbol, freeze }: { userId: string; symbol: string; freeze: boolean }) => {
      return apiRequest("POST", `/api/admin/wallets/${userId}/freeze-asset`, { symbol, freeze }).then(r => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/wallets", selectedUserId] });
    },
  });

  const filteredUsers = useMemo(() => {
    if (!data?.users) return [];
    let users = data.users;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      users = users.filter(u =>
        u.username?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.fullName?.toLowerCase().includes(q)
      );
    }

    if (showLocked === "locked") users = users.filter(u => u.walletLocked);
    if (showLocked === "unlocked") users = users.filter(u => !u.walletLocked);

    switch (sortBy) {
      case "value": users = [...users].sort((a, b) => b.totalValue - a.totalValue); break;
      case "name": users = [...users].sort((a, b) => (a.username || "").localeCompare(b.username || "")); break;
      case "deposits": users = [...users].sort((a, b) => b.totalDeposited - a.totalDeposited); break;
    }

    return users;
  }, [data?.users, searchQuery, sortBy, showLocked]);

  const stats = data?.platformStats;

  // Detail view for a selected user
  if (selectedUserId) {
    return (
      <AdminLayout>
        <div className="max-w-6xl mx-auto px-4 py-6 mt-14 lg:mt-0 pb-24">
          {/* Back Header */}
          <button
            onClick={() => setSelectedUserId(null)}
            className="flex items-center gap-2 text-gray-400 hover:text-white mb-4 transition-colors text-sm"
          >
            <ArrowLeft size={16} />
            Back to All Wallets
          </button>

          {detailLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-4 animate-pulse">
                  <div className="h-6 w-40 bg-[#1a1a1a] rounded mb-3" />
                  <div className="h-8 w-56 bg-[#1a1a1a] rounded" />
                </div>
              ))}
            </div>
          ) : userDetail ? (
            <UserDetailView
              detail={userDetail}
              onLock={(lock) => lockMutation.mutate({ userId: selectedUserId, lock })}
              onFreezeAsset={(symbol, freeze) => freezeMutation.mutate({ userId: selectedUserId, symbol, freeze })}
              lockLoading={lockMutation.isPending}
              freezeLoading={freezeMutation.isPending}
            />
          ) : (
            <div className="text-center text-gray-500 py-12">Failed to load user wallet</div>
          )}
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 mt-14 lg:mt-0 pb-24">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center">
              <Wallet size={20} className="text-blue-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Wallet Management</h1>
              <p className="text-xs text-gray-500">Monitor & manage user wallets</p>
            </div>
          </div>
          <button onClick={() => refetch()} className="p-2 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] hover:bg-[#222] transition-colors">
            <RefreshCw size={16} className="text-gray-400" />
          </button>
        </div>

        {/* Platform Stats */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <StatCard icon={DollarSign} label="Platform Value" value={`$${formatUsdNumber(stats.totalPlatformValue)}`} color="text-green-400" />
            <StatCard icon={Users} label="Total Users" value={String(stats.totalUsers)} color="text-blue-400" />
            <StatCard icon={Lock} label="Locked Wallets" value={String(stats.lockedWallets)} color="text-red-400" />
            <StatCard icon={TrendingUp} label="Active Wallets" value={String(stats.activeWallets)} color="text-emerald-400" />
            <StatCard icon={ArrowDownLeft} label="Total Deposits" value={`$${formatUsdNumber(stats.totalPlatformDeposited)}`} color="text-green-400" />
            <StatCard icon={ArrowUpRight} label="Total Withdrawals" value={`$${formatUsdNumber(stats.totalPlatformWithdrawn)}`} color="text-red-400" />
            <StatCard icon={BarChart3} label="Trade Earnings" value={`$${formatUsdNumber(stats.totalTradeEarnings)}`} color="text-blue-400" />
            <StatCard icon={Zap} label="Futures P&L" value={`$${formatUsdNumber(stats.totalFuturesPnl)}`} color="text-purple-400" />
          </div>
        )}

        {/* Search & Filters */}
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by username, email, or name..."
              className="w-full bg-[#111] border border-[#1e1e1e] rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#2a2a2a]"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-[#111] border border-[#1e1e1e] rounded-xl px-3 py-2 text-xs text-gray-400 focus:outline-none"
            >
              <option value="value">Sort: Value</option>
              <option value="deposits">Sort: Deposits</option>
              <option value="name">Sort: Name</option>
            </select>
            <select
              value={showLocked}
              onChange={(e) => setShowLocked(e.target.value as any)}
              className="bg-[#111] border border-[#1e1e1e] rounded-xl px-3 py-2 text-xs text-gray-400 focus:outline-none"
            >
              <option value="all">All Wallets</option>
              <option value="locked">Locked Only</option>
              <option value="unlocked">Unlocked Only</option>
            </select>
          </div>
        </div>

        {/* User Wallet List */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-4 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#1a1a1a] rounded-xl" />
                  <div className="flex-1">
                    <div className="h-4 w-32 bg-[#1a1a1a] rounded mb-2" />
                    <div className="h-3 w-48 bg-[#1a1a1a] rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-8 text-center">
            <Users size={32} className="text-gray-600 mx-auto mb-2" />
            <p className="text-gray-500 text-sm">No wallets found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredUsers.map(user => (
              <button
                key={user.userId}
                onClick={() => setSelectedUserId(user.userId)}
                className="w-full bg-[#111] rounded-2xl border border-[#1e1e1e] hover:border-[#2a2a2a] p-4 transition-colors text-left"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-white">{(user.username || user.email || "?")[0].toUpperCase()}</span>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white truncate">{user.username || user.email}</span>
                        {user.walletLocked && (
                          <span className="flex items-center gap-1 text-[10px] text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">
                            <Lock size={10} /> Locked
                          </span>
                        )}
                        {user.isVerified && (
                          <span className="flex items-center gap-1 text-[10px] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded">
                            <Shield size={10} /> Verified
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-500 truncate">{user.email} • {user.assets.length} assets</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right hidden sm:block">
                      <p className="text-sm font-semibold text-white tabular-nums">${formatUsdNumber(user.totalValue)}</p>
                      <p className="text-[10px] text-gray-500">{user.depositCount}D / {user.withdrawalCount}W / {user.tradeCount}T</p>
                    </div>
                    <ChevronRight size={16} className="text-gray-600" />
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <div className="bg-[#111] rounded-xl border border-[#1e1e1e] p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={12} className={color} />
        <span className="text-[10px] text-gray-500">{label}</span>
      </div>
      <p className="text-sm font-semibold text-white tabular-nums">{value}</p>
    </div>
  );
}

function UserDetailView({
  detail,
  onLock,
  onFreezeAsset,
  lockLoading,
  freezeLoading,
}: {
  detail: UserWalletDetail;
  onLock: (lock: boolean) => void;
  onFreezeAsset: (symbol: string, freeze: boolean) => void;
  lockLoading: boolean;
  freezeLoading: boolean;
}) {
  const [activeTab, setActiveTab] = useState<"overview" | "deposits" | "withdrawals" | "trades" | "futures" | "staking">("overview");

  return (
    <div className="space-y-4">
      {/* User Header */}
      <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl flex items-center justify-center">
              <span className="text-lg font-bold text-white">{(detail.user?.username || detail.user?.email || "?")[0].toUpperCase()}</span>
            </div>
            <div>
              <h2 className="text-base font-bold text-white">{detail.user?.username || detail.user?.email}</h2>
              <p className="text-xs text-gray-500">{detail.user?.email} • {detail.user?.full_name || 'N/A'}</p>
            </div>
          </div>
          <button
            onClick={() => onLock(!detail.walletLocked)}
            disabled={lockLoading}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-colors ${
              detail.walletLocked
                ? 'bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20'
                : 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20'
            }`}
          >
            {detail.walletLocked ? <Unlock size={14} /> : <Lock size={14} />}
            {lockLoading ? "..." : detail.walletLocked ? "Unlock Wallet" : "Lock Wallet"}
          </button>
        </div>

        {detail.walletLocked && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2 flex items-center gap-2 mb-4">
            <AlertTriangle size={14} className="text-red-400" />
            <span className="text-red-400 text-xs">This wallet is currently locked</span>
          </div>
        )}

        {/* Financial Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <MiniStat label="Portfolio" value={`$${formatUsdNumber(detail.totalValue)}`} />
          <MiniStat label="Deposited" value={`$${formatUsdNumber(detail.totalDeposited)}`} />
          <MiniStat label="Withdrawn" value={`$${formatUsdNumber(detail.totalWithdrawn)}`} />
          <MiniStat label="Trade P&L" value={`$${formatUsdNumber(detail.tradePnl)}`} />
          <MiniStat label="Futures P&L" value={`$${formatUsdNumber(detail.futuresPnl)}`} />
          <MiniStat label="Est. P&L" value={`$${formatUsdNumber(detail.estimatedPnl)}`} />
        </div>
      </div>

      {/* Assets with Freeze */}
      <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-4">
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Wallet size={14} className="text-blue-400" />
          Assets ({detail.assets.length})
        </h3>
        {detail.assets.length === 0 ? (
          <p className="text-gray-600 text-sm text-center py-4">No assets</p>
        ) : (
          <div className="space-y-2">
            {detail.assets.map((asset: any) => (
              <div key={asset.symbol} className="flex items-center justify-between bg-[#0a0a0a] rounded-xl border border-[#1e1e1e] p-3">
                <div className="flex items-center gap-3">
                  <CryptoIcon symbol={asset.symbol} size="sm" />
                  <div>
                    <p className="text-sm font-medium text-white">{asset.symbol}</p>
                    <p className="text-[10px] text-gray-500">
                      Avail: {formatCryptoNumber(asset.available)} | Frozen: {formatCryptoNumber(asset.frozen)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white tabular-nums">${formatUsdNumber(asset.usdValue)}</span>
                  <button
                    onClick={() => onFreezeAsset(asset.symbol, asset.frozen <= 0)}
                    disabled={freezeLoading}
                    className={`p-1.5 rounded-lg text-xs transition-colors ${
                      asset.frozen > 0
                        ? 'bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20'
                        : 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20'
                    }`}
                    title={asset.frozen > 0 ? "Unfreeze asset" : "Freeze asset"}
                  >
                    {asset.frozen > 0 ? <Sun size={14} /> : <Snowflake size={14} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Transaction Tabs */}
      <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] overflow-hidden">
        <div className="flex gap-1 p-1 border-b border-[#1e1e1e] overflow-x-auto">
          {[
            { id: "overview", label: "Overview" },
            { id: "deposits", label: `Deposits (${detail.deposits?.length || 0})` },
            { id: "withdrawals", label: `Withdrawals (${detail.withdrawals?.length || 0})` },
            { id: "trades", label: `Trades (${detail.trades?.length || 0})` },
            { id: "futures", label: `Futures (${detail.futures?.length || 0})` },
            { id: "staking", label: `Staking (${detail.staking?.length || 0})` },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'bg-blue-500/10 text-blue-400'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-4">
          {activeTab === "overview" && (
            <div className="space-y-3">
              <OverviewRow label="Total Deposits" count={detail.deposits?.length || 0} value={`$${formatUsdNumber(detail.totalDeposited)}`} icon={ArrowDownLeft} color="text-green-400" />
              <OverviewRow label="Total Withdrawals" count={detail.withdrawals?.length || 0} value={`$${formatUsdNumber(detail.totalWithdrawn)}`} icon={ArrowUpRight} color="text-red-400" />
              <OverviewRow label="Spot Trades" count={detail.trades?.length || 0} value={`$${formatUsdNumber(Math.abs(detail.tradePnl))}`} icon={BarChart3} color="text-blue-400" />
              <OverviewRow label="Futures Trades" count={detail.futures?.length || 0} value={`$${formatUsdNumber(Math.abs(detail.futuresPnl))}`} icon={Zap} color="text-purple-400" />
              <OverviewRow label="Staking Positions" count={detail.staking?.length || 0} value={`${detail.staking?.filter((s: any) => s.status === 'active').length || 0} active`} icon={TrendingUp} color="text-emerald-400" />
            </div>
          )}

          {activeTab === "deposits" && (
            <TransactionTable
              items={detail.deposits || []}
              columns={["Date", "Symbol", "Amount", "Status"]}
              renderRow={(d: any) => (
                <tr key={d.id} className="border-b border-[#1e1e1e] hover:bg-[#0a0a0a] transition-colors">
                  <td className="py-2 px-3 text-xs text-gray-400">{new Date(d.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}</td>
                  <td className="py-2 px-3 text-xs text-white flex items-center gap-1.5"><CryptoIcon symbol={d.symbol || "USDT"} size="xs" />{d.symbol || "USDT"}</td>
                  <td className="py-2 px-3 text-xs text-green-400 tabular-nums">+{formatCryptoNumber(parseFloat(d.amount || "0"))}</td>
                  <td className="py-2 px-3"><StatusBadge status={d.status} /></td>
                </tr>
              )}
            />
          )}

          {activeTab === "withdrawals" && (
            <TransactionTable
              items={detail.withdrawals || []}
              columns={["Date", "Symbol", "Amount", "Status"]}
              renderRow={(w: any) => (
                <tr key={w.id} className="border-b border-[#1e1e1e] hover:bg-[#0a0a0a] transition-colors">
                  <td className="py-2 px-3 text-xs text-gray-400">{new Date(w.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}</td>
                  <td className="py-2 px-3 text-xs text-white flex items-center gap-1.5"><CryptoIcon symbol={w.symbol || "USDT"} size="xs" />{w.symbol || "USDT"}</td>
                  <td className="py-2 px-3 text-xs text-red-400 tabular-nums">-{formatCryptoNumber(parseFloat(w.amount || "0"))}</td>
                  <td className="py-2 px-3"><StatusBadge status={w.status} /></td>
                </tr>
              )}
            />
          )}

          {activeTab === "trades" && (
            <TransactionTable
              items={detail.trades || []}
              columns={["Date", "Pair", "Side", "Amount", "Price", "Status"]}
              renderRow={(t: any) => (
                <tr key={t.id} className="border-b border-[#1e1e1e] hover:bg-[#0a0a0a] transition-colors">
                  <td className="py-2 px-3 text-xs text-gray-400">{new Date(t.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}</td>
                  <td className="py-2 px-3 text-xs text-white">{t.symbol}</td>
                  <td className="py-2 px-3"><span className={`text-xs font-medium ${t.side === 'buy' ? 'text-green-400' : 'text-red-400'}`}>{t.side?.toUpperCase()}</span></td>
                  <td className="py-2 px-3 text-xs text-white tabular-nums">{formatCryptoNumber(parseFloat(t.amount || "0"))}</td>
                  <td className="py-2 px-3 text-xs text-gray-400 tabular-nums">${formatUsdNumber(parseFloat(t.price || "0"))}</td>
                  <td className="py-2 px-3"><StatusBadge status={t.status} /></td>
                </tr>
              )}
            />
          )}

          {activeTab === "futures" && (
            <TransactionTable
              items={detail.futures || []}
              columns={["Date", "Pair", "Side", "Amount", "Result", "Status"]}
              renderRow={(f: any) => {
                const result = parseFloat(f.final_result || "0");
                return (
                  <tr key={f.id} className="border-b border-[#1e1e1e] hover:bg-[#0a0a0a] transition-colors">
                    <td className="py-2 px-3 text-xs text-gray-400">{new Date(f.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}</td>
                    <td className="py-2 px-3 text-xs text-white">{f.symbol}</td>
                    <td className="py-2 px-3"><span className={`text-xs font-medium ${f.side === 'long' ? 'text-green-400' : 'text-red-400'}`}>{f.side?.toUpperCase()}</span></td>
                    <td className="py-2 px-3 text-xs text-white tabular-nums">{formatCryptoNumber(parseFloat(f.amount || "0"))}</td>
                    <td className="py-2 px-3 text-xs tabular-nums"><span className={result >= 0 ? 'text-green-400' : 'text-red-400'}>${formatUsdNumber(Math.abs(result))}</span></td>
                    <td className="py-2 px-3"><StatusBadge status={f.status} /></td>
                  </tr>
                );
              }}
            />
          )}

          {activeTab === "staking" && (
            <TransactionTable
              items={detail.staking || []}
              columns={["Symbol", "Amount", "APY", "Duration", "Status"]}
              renderRow={(s: any) => (
                <tr key={s.id} className="border-b border-[#1e1e1e] hover:bg-[#0a0a0a] transition-colors">
                  <td className="py-2 px-3 text-xs text-white flex items-center gap-1.5"><CryptoIcon symbol={s.symbol || "USDT"} size="xs" />{s.symbol}</td>
                  <td className="py-2 px-3 text-xs text-white tabular-nums">{formatCryptoNumber(parseFloat(s.amount || "0"))}</td>
                  <td className="py-2 px-3 text-xs text-green-400">{s.apy}%</td>
                  <td className="py-2 px-3 text-xs text-gray-400">{s.duration}d</td>
                  <td className="py-2 px-3"><StatusBadge status={s.status} /></td>
                </tr>
              )}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#0a0a0a] rounded-xl border border-[#1e1e1e] p-2.5">
      <p className="text-[10px] text-gray-500 mb-0.5">{label}</p>
      <p className="text-xs font-semibold text-white tabular-nums">{value}</p>
    </div>
  );
}

function OverviewRow({ label, count, value, icon: Icon, color }: { label: string; count: number; value: string; icon: any; color: string }) {
  return (
    <div className="flex items-center justify-between bg-[#0a0a0a] rounded-xl border border-[#1e1e1e] p-3">
      <div className="flex items-center gap-2.5">
        <div className={`w-8 h-8 rounded-lg bg-opacity-10 flex items-center justify-center`} style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
          <Icon size={16} className={color} />
        </div>
        <div>
          <p className="text-sm text-white">{label}</p>
          <p className="text-[10px] text-gray-500">{count} total</p>
        </div>
      </div>
      <span className="text-sm font-medium text-white tabular-nums">{value}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, string> = {
    approved: "text-green-400 bg-green-500/10",
    completed: "text-green-400 bg-green-500/10",
    closed: "text-green-400 bg-green-500/10",
    active: "text-blue-400 bg-blue-500/10",
    pending: "text-yellow-400 bg-yellow-500/10",
    rejected: "text-red-400 bg-red-500/10",
    failed: "text-red-400 bg-red-500/10",
    liquidated: "text-red-400 bg-red-500/10",
  };
  const cls = config[status] || "text-gray-400 bg-gray-500/10";
  return <span className={`text-[10px] px-1.5 py-0.5 rounded ${cls}`}>{status}</span>;
}

function TransactionTable({ items, columns, renderRow }: { items: any[]; columns: string[]; renderRow: (item: any) => React.ReactNode }) {
  if (items.length === 0) {
    return <p className="text-gray-600 text-sm text-center py-6">No records found</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-[#1e1e1e]">
            {columns.map(col => (
              <th key={col} className="text-left py-2 px-3 text-[10px] text-gray-500 font-medium">{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>{items.map(renderRow)}</tbody>
      </table>
    </div>
  );
}
