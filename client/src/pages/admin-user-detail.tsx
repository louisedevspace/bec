import { useState, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { CryptoIcon } from "@/components/crypto/crypto-icon";
import { StatusBadge } from "@/components/ui/status-badge";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { exportToCSV } from "@/utils/csv-export";
import { formatUsdNumber, formatCryptoNumber } from "@/utils/format-utils";
import { formatDateTime } from "@/lib/date-utils";
import {
  ArrowLeft, User, Mail, Shield, Calendar, Lock, Unlock, Snowflake,
  Sun, Key, Settings, ToggleLeft, ToggleRight, Download,
  TrendingUp, TrendingDown, DollarSign, BarChart3,
  Wallet, ArrowDownLeft, ArrowUpRight, ArrowRightLeft, Zap,
  ChevronLeft, ChevronRight, Search, AlertCircle, Activity,
} from "lucide-react";

interface UserDetail {
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

const TABS = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "assets", label: "Assets", icon: Wallet },
  { id: "deposits", label: "Deposits", icon: ArrowDownLeft },
  { id: "withdrawals", label: "Withdrawals", icon: ArrowUpRight },
  { id: "trades", label: "Trades", icon: ArrowRightLeft },
  { id: "futures", label: "Futures", icon: Zap },
  { id: "staking", label: "Staking", icon: TrendingUp },
] as const;

type TabId = typeof TABS[number]["id"];

export default function AdminUserDetailPage() {
  const [, params] = useRoute("/admin/users/:userId");
  const [, setLocation] = useLocation();
  const userId = params?.userId;
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [dateRange, setDateRange] = useState<{ from: Date | null; to: Date | null }>({ from: null, to: null });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 25;

  const { data, isLoading, error } = useQuery<UserDetail>({
    queryKey: ["/api/admin/wallets", userId],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/admin/wallets/${userId}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch user details");
      return res.json();
    },
    enabled: !!userId,
  });

  const lockMutation = useMutation({
    mutationFn: async (locked: boolean) => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/admin/wallets/${userId}/lock`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ locked }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/wallets", userId] }),
  });

  const freezeMutation = useMutation({
    mutationFn: async ({ symbol, freeze }: { symbol: string; freeze: boolean }) => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/admin/wallets/${userId}/freeze-asset`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, freeze }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/wallets", userId] }),
  });

  const bal = (v: number) => `$${formatUsdNumber(v)}`;

  // Filter and paginate data based on active tab
  const getFilteredData = (items: any[], dateField: string) => {
    let filtered = [...items];
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(item =>
        JSON.stringify(item).toLowerCase().includes(q)
      );
    }
    if (dateRange.from) {
      filtered = filtered.filter(item => new Date(item[dateField]) >= dateRange.from!);
    }
    if (dateRange.to) {
      const end = new Date(dateRange.to);
      end.setHours(23, 59, 59, 999);
      filtered = filtered.filter(item => new Date(item[dateField]) <= end);
    }
    return filtered;
  };

  const currentData = useMemo(() => {
    if (!data) return { items: [], total: 0 };
    let items: any[] = [];
    let dateField = "created_at";
    switch (activeTab) {
      case "deposits": items = data.deposits; dateField = "submitted_at"; break;
      case "withdrawals": items = data.withdrawals; dateField = "submitted_at"; break;
      case "trades": items = data.trades; dateField = "created_at"; break;
      case "futures": items = data.futures; dateField = "created_at"; break;
      default: return { items: [], total: 0 };
    }
    const filtered = getFilteredData(items, dateField);
    return { items: filtered.slice(page * pageSize, (page + 1) * pageSize), total: filtered.length };
  }, [data, activeTab, search, dateRange, page]);

  const totalPages = Math.max(1, Math.ceil(currentData.total / pageSize));

  const handleExport = () => {
    if (!data) return;
    let items: any[] = [];
    let columns: { key: string; label: string }[] = [];
    let filename = "";
    switch (activeTab) {
      case "deposits":
        items = getFilteredData(data.deposits, "submitted_at").map(d => ({
          date: formatDateTime(d.submitted_at), symbol: d.symbol, amount: d.amount,
          fee: d.fee_amount || 0, net: d.net_amount || d.amount, status: d.status,
        }));
        columns = [{ key: "date", label: "Date" }, { key: "symbol", label: "Symbol" }, { key: "amount", label: "Amount" }, { key: "fee", label: "Fee" }, { key: "net", label: "Net" }, { key: "status", label: "Status" }];
        filename = `user_${userId}_deposits`;
        break;
      case "withdrawals":
        items = getFilteredData(data.withdrawals, "submitted_at").map(w => ({
          date: formatDateTime(w.submitted_at), symbol: w.symbol, amount: w.amount,
          fee: w.fee_amount || 0, address: w.wallet_address || "", status: w.status,
        }));
        columns = [{ key: "date", label: "Date" }, { key: "symbol", label: "Symbol" }, { key: "amount", label: "Amount" }, { key: "fee", label: "Fee" }, { key: "address", label: "Address" }, { key: "status", label: "Status" }];
        filename = `user_${userId}_withdrawals`;
        break;
      case "trades":
        items = getFilteredData(data.trades, "created_at").map(t => ({
          date: formatDateTime(t.created_at), pair: t.symbol, side: t.side,
          amount: t.amount, price: t.price, fee: t.fee_amount || 0, status: t.status,
        }));
        columns = [{ key: "date", label: "Date" }, { key: "pair", label: "Pair" }, { key: "side", label: "Side" }, { key: "amount", label: "Amount" }, { key: "price", label: "Price" }, { key: "fee", label: "Fee" }, { key: "status", label: "Status" }];
        filename = `user_${userId}_trades`;
        break;
      case "futures":
        items = getFilteredData(data.futures, "created_at").map(f => ({
          date: formatDateTime(f.created_at), pair: f.symbol, side: f.side,
          amount: f.amount, result: f.final_result || 0, status: f.status,
        }));
        columns = [{ key: "date", label: "Date" }, { key: "pair", label: "Pair" }, { key: "side", label: "Side" }, { key: "amount", label: "Amount" }, { key: "result", label: "P&L" }, { key: "status", label: "Status" }];
        filename = `user_${userId}_futures`;
        break;
    }
    if (items.length > 0) exportToCSV(items, filename, columns);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-center">
          <Activity size={24} className="text-gray-600 mx-auto mb-2 animate-pulse fill-current" />
          <p className="text-gray-500 text-xs">Loading user details...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-center">
          <AlertCircle size={24} className="text-red-400 mx-auto mb-2 fill-current" />
          <p className="text-gray-400 text-sm">Failed to load user details</p>
          <button onClick={() => setLocation("/admin/users")} className="mt-3 text-blue-400 text-xs hover:text-blue-300">Back to Users</button>
        </div>
      </div>
    );
  }

  const u = data.user;

  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-20">
      {/* Header */}
      <div className="bg-[#111] border-b border-[#1e1e1e] px-4 py-4">
        <div className="max-w-6xl mx-auto">
          <button onClick={() => setLocation("/admin/users")} className="flex items-center gap-1.5 text-gray-400 hover:text-white text-xs mb-4 transition-colors">
            <ArrowLeft size={14} className="fill-current" /> Back to Users
          </button>

          <div className="flex items-start justify-between flex-wrap gap-4">
            {/* User Identity */}
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-[#2a2a2a] flex items-center justify-center text-xl font-bold text-white">
                {(u.full_name || u.username || "?")[0].toUpperCase()}
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">{u.full_name || u.username}</h1>
                <div className="flex items-center gap-2 mt-0.5">
                  <Mail size={12} className="text-gray-500 fill-current" />
                  <span className="text-xs text-gray-400">{u.email}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] text-gray-600">ID: {u.display_id || u.id?.slice(0, 8)}</span>
                  {u.is_verified && <span className="text-[10px] bg-green-500/10 text-green-400 px-1.5 py-0.5 rounded border border-green-500/20">Verified</span>}
                  {u.kyc_status === "pending" && <span className="text-[10px] bg-yellow-500/10 text-yellow-400 px-1.5 py-0.5 rounded border border-yellow-500/20">KYC Pending</span>}
                  {!u.is_active && <span className="text-[10px] bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded border border-red-500/20">Inactive</span>}
                  {data.walletLocked && <span className="text-[10px] bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded border border-red-500/20">Wallet Locked</span>}
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => lockMutation.mutate(!data.walletLocked)}
                disabled={lockMutation.isPending}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${
                  data.walletLocked
                    ? "bg-green-500/10 border-green-500/20 text-green-400 hover:bg-green-500/20"
                    : "bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20"
                }`}
              >
                {data.walletLocked ? <Unlock size={14} className="fill-current" /> : <Lock size={14} className="fill-current" />}
                {data.walletLocked ? "Unlock Wallet" : "Lock Wallet"}
              </button>
            </div>
          </div>

          {/* Financial Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mt-5">
            {[
              { label: "Portfolio", value: bal(data.totalValue), color: "text-white", icon: Wallet },
              { label: "Deposited", value: bal(data.totalDeposited), color: "text-green-400", icon: ArrowDownLeft },
              { label: "Withdrawn", value: bal(data.totalWithdrawn), color: "text-red-400", icon: ArrowUpRight },
              { label: "Trade P&L", value: `${data.tradePnl >= 0 ? '+' : ''}${bal(data.tradePnl)}`, color: data.tradePnl >= 0 ? "text-green-400" : "text-red-400", icon: ArrowRightLeft },
              { label: "Futures P&L", value: `${data.futuresPnl >= 0 ? '+' : ''}${bal(data.futuresPnl)}`, color: data.futuresPnl >= 0 ? "text-green-400" : "text-red-400", icon: Zap },
              { label: "Est. P&L", value: `${data.estimatedPnl >= 0 ? '+' : ''}${bal(data.estimatedPnl)}`, color: data.estimatedPnl >= 0 ? "text-green-400" : "text-red-400", icon: TrendingUp },
            ].map(stat => (
              <div key={stat.label} className="bg-[#0a0a0a] rounded-xl border border-[#1e1e1e] p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <stat.icon size={12} className="text-gray-500 fill-current" />
                  <span className="text-[10px] text-gray-500">{stat.label}</span>
                </div>
                <p className={`text-sm font-bold tabular-nums ${stat.color}`}>{stat.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-6xl mx-auto px-4 mt-4">
        <div className="flex gap-1 overflow-x-auto bg-[#111] rounded-xl border border-[#1e1e1e] p-1">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setPage(0); setSearch(""); }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? "bg-[#1a1a1a] text-white border border-[#2a2a2a]"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              <tab.icon size={12} className="fill-current" />
              {tab.label}
              {tab.id === "deposits" && data.deposits.length > 0 && <span className="text-[9px] bg-[#222] px-1 rounded">{data.deposits.length}</span>}
              {tab.id === "withdrawals" && data.withdrawals.length > 0 && <span className="text-[9px] bg-[#222] px-1 rounded">{data.withdrawals.length}</span>}
              {tab.id === "trades" && data.trades.length > 0 && <span className="text-[9px] bg-[#222] px-1 rounded">{data.trades.length}</span>}
              {tab.id === "futures" && data.futures.length > 0 && <span className="text-[9px] bg-[#222] px-1 rounded">{data.futures.length}</span>}
            </button>
          ))}
        </div>

        {/* Filter Bar (for transactional tabs) */}
        {["deposits", "withdrawals", "trades", "futures"].includes(activeTab) && (
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <div className="relative flex-1 min-w-[160px]">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 fill-current" />
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(0); }}
                placeholder="Search..."
                className="w-full bg-[#111] border border-[#1e1e1e] rounded-lg pl-7 pr-3 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-[#2a2a2a]"
              />
            </div>
            <DateRangePicker value={dateRange} onChange={v => { setDateRange(v); setPage(0); }} />
            <button
              onClick={handleExport}
              disabled={currentData.total === 0}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white bg-[#111] border border-[#1e1e1e] hover:border-[#2a2a2a] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download size={12} className="fill-current" />
              CSV
            </button>
          </div>
        )}

        {/* Tab Content */}
        <div className="mt-4 space-y-4">
          {/* Overview Tab */}
          {activeTab === "overview" && (
            <>
              {/* Account Info */}
              <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-4">
                <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                  <User size={14} className="text-blue-400 fill-current" />
                  Account Information
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {[
                    { label: "Username", value: u.username },
                    { label: "Email", value: u.email },
                    { label: "Full Name", value: u.full_name || "N/A" },
                    { label: "Phone", value: u.phone || "N/A" },
                    { label: "Country", value: u.country || "N/A" },
                    { label: "Joined", value: u.created_at ? formatDateTime(u.created_at) : "N/A" },
                    { label: "Role", value: u.role || "user" },
                    { label: "Verified", value: u.is_verified ? "Yes" : "No" },
                    { label: "Active", value: u.is_active !== false ? "Yes" : "No" },
                  ].map(item => (
                    <div key={item.label} className="bg-[#0a0a0a] rounded-xl border border-[#1e1e1e] p-3">
                      <p className="text-[10px] text-gray-500 mb-0.5">{item.label}</p>
                      <p className="text-xs text-white font-medium truncate">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Activity Counts */}
              <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-4">
                <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                  <Activity size={14} className="text-purple-400 fill-current" />
                  Activity Summary
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {[
                    { label: "Deposits", count: data.deposits.length, color: "text-green-400" },
                    { label: "Withdrawals", count: data.withdrawals.length, color: "text-red-400" },
                    { label: "Trades", count: data.trades.length, color: "text-blue-400" },
                    { label: "Futures", count: data.futures.length, color: "text-purple-400" },
                    { label: "Staking", count: data.staking.length, color: "text-cyan-400" },
                  ].map(a => (
                    <div key={a.label} className="bg-[#0a0a0a] rounded-xl border border-[#1e1e1e] p-3 text-center cursor-pointer hover:border-[#2a2a2a] transition-colors" onClick={() => { setActiveTab(a.label.toLowerCase() as TabId); }}>
                      <p className={`text-xl font-bold ${a.color}`}>{a.count}</p>
                      <p className="text-[10px] text-gray-500">{a.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Assets Tab */}
          {activeTab === "assets" && (
            <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] overflow-hidden">
              {data.assets.length === 0 ? (
                <div className="p-8 text-center">
                  <Wallet size={24} className="text-gray-600 mx-auto mb-2 fill-current" />
                  <p className="text-gray-500 text-sm">No assets in wallet</p>
                </div>
              ) : (
                <div className="divide-y divide-[#1e1e1e]">
                  {/* Table Header */}
                  <div className="flex items-center px-4 py-2.5 text-[10px] text-gray-500 font-medium uppercase tracking-wider bg-[#0a0a0a]">
                    <span className="flex-1">Asset</span>
                    <span className="w-24 text-right">Available</span>
                    <span className="w-24 text-right">Frozen</span>
                    <span className="w-24 text-right">Total</span>
                    <span className="w-28 text-right">USD Value</span>
                    <span className="w-24 text-right">Actions</span>
                  </div>
                  {data.assets.filter((a: any) => a.total > 0).map((asset: any) => (
                    <div key={asset.symbol} className="flex items-center px-4 py-3 hover:bg-[#1a1a1a]/50 transition-colors">
                      <div className="flex-1 flex items-center gap-2">
                        <CryptoIcon symbol={asset.symbol} size="sm" />
                        <span className="text-sm font-medium text-white">{asset.symbol}</span>
                      </div>
                      <span className="w-24 text-right text-xs text-white tabular-nums">{formatCryptoNumber(asset.available)}</span>
                      <span className={`w-24 text-right text-xs tabular-nums ${asset.frozen > 0 ? "text-yellow-400" : "text-gray-600"}`}>
                        {asset.frozen > 0 ? formatCryptoNumber(asset.frozen) : "0"}
                      </span>
                      <span className="w-24 text-right text-xs text-white tabular-nums font-medium">{formatCryptoNumber(asset.total)}</span>
                      <span className="w-28 text-right text-xs text-white tabular-nums">{bal(asset.usdValue)}</span>
                      <div className="w-24 flex justify-end">
                        <button
                          onClick={() => freezeMutation.mutate({ symbol: asset.symbol, freeze: asset.frozen <= 0 })}
                          disabled={freezeMutation.isPending}
                          className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium border transition-colors ${
                            asset.frozen > 0
                              ? "bg-green-500/10 border-green-500/20 text-green-400 hover:bg-green-500/20"
                              : "bg-yellow-500/10 border-yellow-500/20 text-yellow-400 hover:bg-yellow-500/20"
                          }`}
                        >
                          {asset.frozen > 0 ? <Sun size={10} className="fill-current" /> : <Snowflake size={10} className="fill-current" />}
                          {asset.frozen > 0 ? "Unfreeze" : "Freeze"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Deposits Tab */}
          {activeTab === "deposits" && (
            <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] overflow-hidden">
              {currentData.items.length === 0 ? (
                <EmptyState label="No deposits found" />
              ) : (
                <div className="divide-y divide-[#1e1e1e]">
                  <TableHeader columns={["Date", "Symbol", "Amount", "Fee", "Net", "Status"]} />
                  {currentData.items.map((d: any) => (
                    <div key={d.id} className="flex items-center px-4 py-3 text-xs hover:bg-[#1a1a1a]/50 transition-colors">
                      <span className="flex-1 text-gray-400">{formatDateTime(d.submitted_at)}</span>
                      <span className="w-20 flex items-center gap-1.5"><CryptoIcon symbol={d.symbol || "USDT"} size="xs" /> {d.symbol || "USDT"}</span>
                      <span className="w-28 text-right text-green-400 tabular-nums font-medium">+{formatCryptoNumber(parseFloat(d.amount || "0"))}</span>
                      <span className="w-24 text-right text-amber-400/70 tabular-nums">{d.fee_amount ? formatCryptoNumber(parseFloat(d.fee_amount)) : "0"}</span>
                      <span className="w-28 text-right text-white tabular-nums">{formatCryptoNumber(parseFloat(d.net_amount || d.amount || "0"))}</span>
                      <span className="w-24 flex justify-end"><StatusBadge status={d.status} size="sm" /></span>
                    </div>
                  ))}
                </div>
              )}
              <Pagination total={currentData.total} page={page} totalPages={totalPages} onPageChange={setPage} />
            </div>
          )}

          {/* Withdrawals Tab */}
          {activeTab === "withdrawals" && (
            <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] overflow-hidden">
              {currentData.items.length === 0 ? (
                <EmptyState label="No withdrawals found" />
              ) : (
                <div className="divide-y divide-[#1e1e1e]">
                  <TableHeader columns={["Date", "Symbol", "Amount", "Fee", "Address", "Status"]} />
                  {currentData.items.map((w: any) => (
                    <div key={w.id} className="flex items-center px-4 py-3 text-xs hover:bg-[#1a1a1a]/50 transition-colors">
                      <span className="flex-1 text-gray-400">{formatDateTime(w.submitted_at)}</span>
                      <span className="w-20 flex items-center gap-1.5"><CryptoIcon symbol={w.symbol || "USDT"} size="xs" /> {w.symbol || "USDT"}</span>
                      <span className="w-28 text-right text-red-400 tabular-nums font-medium">-{formatCryptoNumber(parseFloat(w.amount || "0"))}</span>
                      <span className="w-24 text-right text-amber-400/70 tabular-nums">{w.fee_amount ? formatCryptoNumber(parseFloat(w.fee_amount)) : "0"}</span>
                      <span className="w-28 text-right text-gray-500 text-[10px] truncate font-mono" title={w.wallet_address}>{w.wallet_address ? `${w.wallet_address.slice(0, 8)}...` : "N/A"}</span>
                      <span className="w-24 flex justify-end"><StatusBadge status={w.status} size="sm" /></span>
                    </div>
                  ))}
                </div>
              )}
              <Pagination total={currentData.total} page={page} totalPages={totalPages} onPageChange={setPage} />
            </div>
          )}

          {/* Trades Tab */}
          {activeTab === "trades" && (
            <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] overflow-hidden">
              {currentData.items.length === 0 ? (
                <EmptyState label="No trades found" />
              ) : (
                <div className="divide-y divide-[#1e1e1e]">
                  <TableHeader columns={["Date", "Pair", "Side", "Amount", "Price", "Fee", "Status"]} />
                  {currentData.items.map((t: any) => (
                    <div key={t.id} className="flex items-center px-4 py-3 text-xs hover:bg-[#1a1a1a]/50 transition-colors">
                      <span className="flex-1 text-gray-400">{formatDateTime(t.created_at)}</span>
                      <span className="w-24 flex items-center gap-1.5"><CryptoIcon symbol={t.symbol?.split("/")[0] || t.symbol} size="xs" /> {t.symbol}</span>
                      <span className={`w-16 font-semibold ${t.side === "buy" ? "text-green-400" : "text-red-400"}`}>{t.side?.toUpperCase()}</span>
                      <span className="w-24 text-right text-white tabular-nums">{formatCryptoNumber(parseFloat(t.amount || "0"))}</span>
                      <span className="w-24 text-right text-white tabular-nums">{t.price ? `$${formatUsdNumber(parseFloat(t.price))}` : "Market"}</span>
                      <span className="w-20 text-right text-amber-400/70 tabular-nums">{t.fee_amount ? formatCryptoNumber(parseFloat(t.fee_amount)) : "0"}</span>
                      <span className="w-24 flex justify-end"><StatusBadge status={t.status} size="sm" /></span>
                    </div>
                  ))}
                </div>
              )}
              <Pagination total={currentData.total} page={page} totalPages={totalPages} onPageChange={setPage} />
            </div>
          )}

          {/* Futures Tab */}
          {activeTab === "futures" && (
            <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] overflow-hidden">
              {currentData.items.length === 0 ? (
                <EmptyState label="No futures trades found" />
              ) : (
                <div className="divide-y divide-[#1e1e1e]">
                  <TableHeader columns={["Date", "Pair", "Side", "Amount", "P&L", "Status"]} />
                  {currentData.items.map((f: any) => {
                    const pnl = parseFloat(f.final_result || "0");
                    return (
                      <div key={f.id} className="flex items-center px-4 py-3 text-xs hover:bg-[#1a1a1a]/50 transition-colors">
                        <span className="flex-1 text-gray-400">{formatDateTime(f.created_at)}</span>
                        <span className="w-24 flex items-center gap-1.5"><CryptoIcon symbol={f.symbol?.split("/")[0] || f.symbol} size="xs" /> {f.symbol}</span>
                        <span className={`w-16 font-semibold ${f.side === "long" ? "text-green-400" : "text-red-400"}`}>{f.side?.toUpperCase()}</span>
                        <span className="w-24 text-right text-white tabular-nums">{formatCryptoNumber(parseFloat(f.amount || "0"))}</span>
                        <span className={`w-28 text-right tabular-nums font-medium ${pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {pnl >= 0 ? "+" : ""}{bal(pnl)}
                        </span>
                        <span className="w-24 flex justify-end"><StatusBadge status={f.status} size="sm" /></span>
                      </div>
                    );
                  })}
                </div>
              )}
              <Pagination total={currentData.total} page={page} totalPages={totalPages} onPageChange={setPage} />
            </div>
          )}

          {/* Staking Tab */}
          {activeTab === "staking" && (
            <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] overflow-hidden">
              {data.staking.length === 0 ? (
                <EmptyState label="No staking positions found" />
              ) : (
                <div className="divide-y divide-[#1e1e1e]">
                  <TableHeader columns={["Symbol", "Amount", "APY", "Duration", "Status", "Start Date"]} />
                  {data.staking.map((s: any) => (
                    <div key={s.id} className="flex items-center px-4 py-3 text-xs hover:bg-[#1a1a1a]/50 transition-colors">
                      <span className="flex-1 flex items-center gap-1.5"><CryptoIcon symbol={s.symbol} size="xs" /> {s.symbol}</span>
                      <span className="w-28 text-right text-white tabular-nums">{formatCryptoNumber(parseFloat(s.amount || "0"))}</span>
                      <span className="w-20 text-right text-green-400 tabular-nums">{s.apy}%</span>
                      <span className="w-20 text-right text-gray-400">{s.duration}d</span>
                      <span className="w-24 flex justify-end"><StatusBadge status={s.status} size="sm" /></span>
                      <span className="w-32 text-right text-gray-500">{formatDateTime(s.created_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TableHeader({ columns }: { columns: string[] }) {
  return (
    <div className="flex items-center px-4 py-2.5 text-[10px] text-gray-500 font-medium uppercase tracking-wider bg-[#0a0a0a]">
      {columns.map((col, i) => (
        <span key={col} className={i === 0 ? "flex-1" : "w-24 text-right"}>{col}</span>
      ))}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="p-8 text-center">
      <AlertCircle size={20} className="text-gray-600 mx-auto mb-2 fill-current" />
      <p className="text-gray-500 text-sm">{label}</p>
    </div>
  );
}

function Pagination({ total, page, totalPages, onPageChange }: { total: number; page: number; totalPages: number; onPageChange: (p: number) => void }) {
  if (total === 0) return null;
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-t border-[#1e1e1e] bg-[#0a0a0a]">
      <span className="text-[10px] text-gray-600">{total} records</span>
      <div className="flex items-center gap-1">
        <button onClick={() => onPageChange(Math.max(0, page - 1))} disabled={page === 0} className="p-1 rounded hover:bg-[#1a1a1a] disabled:opacity-30 transition-colors">
          <ChevronLeft size={14} className="text-gray-400 fill-current" />
        </button>
        <span className="text-[10px] text-gray-500 px-2">{page + 1} / {totalPages}</span>
        <button onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1} className="p-1 rounded hover:bg-[#1a1a1a] disabled:opacity-30 transition-colors">
          <ChevronRight size={14} className="text-gray-400 fill-current" />
        </button>
      </div>
    </div>
  );
}
