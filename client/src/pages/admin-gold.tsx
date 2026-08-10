import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Clock, CheckCircle, XCircle, AlertCircle, TrendingUp, TrendingDown,
  RefreshCw, Settings, ChevronDown, ChevronUp,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

async function authFetch(url: string, init?: RequestInit): Promise<Response> {
  const headers = await getAuthHeaders();
  return fetch(url, { ...init, headers: { ...(init?.headers || {}), ...headers } });
}

interface GoldTrade {
  id: number;
  user_id: string;
  pair_symbol: string;
  side: "buy" | "sell";
  amount_usdt: string;
  gold_quantity: string;
  price_per_oz: string;
  fee_usdt: string;
  trading_fee_rate: string;
  status: string;
  reject_reason: string | null;
  admin_note: string | null;
  created_at: string;
  userDetails: { email: string; full_name: string | null } | null;
}

interface GoldPair {
  id: number;
  symbol: string;
  base_asset: string;
  quote_asset: string;
  is_enabled: boolean;
  trading_fee: string;
  min_trade_amount: string;
  max_trade_amount: string;
  sort_order: number;
}

interface GoldPrice {
  price: number;
  source: string;
}

type StatusFilter = "all" | "pending" | "approved" | "rejected" | "cancelled";

const STATUS_CONFIG: Record<string, { color: string; bg: string; icon: typeof Clock; label: string }> = {
  pending:   { color: "text-yellow-500", bg: "bg-yellow-500/10", icon: Clock,        label: "Pending"   },
  approved:  { color: "text-green-500",  bg: "bg-green-500/10",  icon: CheckCircle,  label: "Approved"  },
  rejected:  { color: "text-red-500",    bg: "bg-red-500/10",    icon: XCircle,      label: "Rejected"  },
  cancelled: { color: "text-gray-500",   bg: "bg-gray-500/10",   icon: AlertCircle,  label: "Cancelled" },
};

function GoldIcon({ size = 20 }: { size?: number }) {
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

export default function AdminGoldPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectTargetId, setRejectTargetId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [expandedPairs, setExpandedPairs] = useState(false);
  const [editPair, setEditPair] = useState<GoldPair | null>(null);
  const [pairForm, setPairForm] = useState({ trading_fee: "", min_trade_amount: "", max_trade_amount: "" });

  // Current gold price
  const { data: goldPrice } = useQuery<GoldPrice>({
    queryKey: ["gold-price"],
    queryFn: () => fetch("/api/gold/price").then(r => r.json()),
    refetchInterval: 30_000,
  });

  // All gold trades
  const { data: trades = [], isLoading, refetch: refetchTrades } = useQuery<GoldTrade[]>({
    queryKey: ["admin-gold-trades"],
    queryFn: async () => {
      const res = await authFetch("/api/admin/gold/trades");
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  // Gold trading pairs
  const { data: goldPairs = [], refetch: refetchPairs } = useQuery<GoldPair[]>({
    queryKey: ["admin-gold-pairs"],
    queryFn: async () => {
      const res = await authFetch("/api/admin/trading-pairs/gold");
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 30_000,
  });

  const approveMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await authFetch(`/api/admin/gold/trades/${id}/approve`, { method: "PUT" });
      if (!res.ok) throw new Error((await res.json()).message || "Approval failed");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Trade approved", description: "Gold has been credited to user account." });
      queryClient.invalidateQueries({ queryKey: ["admin-gold-trades"] });
    },
    onError: (err: Error) => {
      toast({ title: "Approval failed", description: err.message, variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason: string }) => {
      const res = await authFetch(`/api/admin/gold/trades/${id}/reject`, {
        method: "PUT",
        body: JSON.stringify({ rejectReason: reason }),
      });
      if (!res.ok) throw new Error((await res.json()).message || "Rejection failed");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Trade rejected", description: "Funds refunded to user account." });
      setRejectDialogOpen(false);
      setRejectReason("");
      setRejectTargetId(null);
      queryClient.invalidateQueries({ queryKey: ["admin-gold-trades"] });
    },
    onError: (err: Error) => {
      toast({ title: "Rejection failed", description: err.message, variant: "destructive" });
    },
  });

  const togglePairMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await authFetch(`/api/admin/trading-pairs/${id}/toggle`, { method: "PUT" });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Pair updated" });
      refetchPairs();
    },
  });

  const updatePairMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await authFetch(`/api/admin/trading-pairs/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json()).message || "Update failed");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Pair updated successfully" });
      setEditPair(null);
      refetchPairs();
    },
    onError: (err: Error) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  const filtered = statusFilter === "all" ? trades : trades.filter(t => t.status === statusFilter);

  const stats = {
    total:     trades.length,
    pending:   trades.filter(t => t.status === "pending").length,
    approved:  trades.filter(t => t.status === "approved").length,
    rejected:  trades.filter(t => t.status === "rejected").length,
    volume:    trades.filter(t => t.status === "approved").reduce((s, t) => s + parseFloat(t.amount_usdt), 0),
    fees:      trades.filter(t => t.status === "approved").reduce((s, t) => s + parseFloat(t.fee_usdt), 0),
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <GoldIcon size={36} />
        <div>
          <h1 className="text-white text-xl font-bold">Gold Trading Management</h1>
          <p className="text-gray-500 text-sm">
            Live price:{" "}
            <span className="text-yellow-400 font-semibold">
              ${goldPrice?.price?.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || "—"}/oz
            </span>
            {goldPrice?.source === "fallback" && (
              <span className="text-red-400 text-xs ml-2">(fallback price)</span>
            )}
          </p>
        </div>
        <button
          onClick={() => { refetchTrades(); refetchPairs(); }}
          className="ml-auto p-2 rounded-xl bg-[#111] border border-[#1e1e1e] text-gray-400 hover:text-white transition-colors"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {[
          { label: "Total Trades", value: stats.total, color: "text-white" },
          { label: "Pending",      value: stats.pending,  color: "text-yellow-500" },
          { label: "Approved",     value: stats.approved, color: "text-green-500"  },
          { label: "Rejected",     value: stats.rejected, color: "text-red-500"    },
          { label: "Volume (USDT)", value: `$${stats.volume.toLocaleString("en-US", { maximumFractionDigits: 0 })}`, color: "text-blue-400" },
          { label: "Fees Earned",  value: `$${stats.fees.toFixed(2)}`, color: "text-purple-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-[#111] rounded-xl border border-[#1e1e1e] p-3">
            <p className="text-gray-500 text-xs mb-1">{label}</p>
            <p className={`font-bold text-lg ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Gold Pairs Management */}
      <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] mb-4">
        <button
          onClick={() => setExpandedPairs(!expandedPairs)}
          className="w-full flex items-center justify-between p-4 text-white hover:bg-[#151515] transition-colors rounded-2xl"
        >
          <div className="flex items-center gap-2">
            <Settings size={16} className="text-yellow-500" />
            <span className="font-semibold text-sm">Gold Trading Pairs ({goldPairs.length})</span>
          </div>
          {expandedPairs ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </button>

        {expandedPairs && (
          <div className="border-t border-[#1e1e1e] p-4 space-y-3">
            {goldPairs.length === 0 && (
              <p className="text-gray-500 text-sm text-center py-4">No gold pairs found. Run the migration to add XAU/USDT.</p>
            )}
            {goldPairs.map((gp) => (
              <div key={gp.id} className="bg-[#0f0f0f] rounded-xl border border-[#1e1e1e] p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <GoldIcon size={20} />
                    <span className="text-white font-semibold text-sm">{gp.symbol}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${gp.is_enabled ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                      {gp.is_enabled ? "Active" : "Disabled"}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setEditPair(gp); setPairForm({ trading_fee: (parseFloat(gp.trading_fee) * 100).toFixed(2), min_trade_amount: gp.min_trade_amount, max_trade_amount: gp.max_trade_amount }); }}
                      className="text-xs px-3 py-1.5 rounded-lg bg-[#1a1a1a] text-gray-300 hover:text-white border border-[#2a2a2a] transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => togglePairMutation.mutate(gp.id)}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                        gp.is_enabled
                          ? "bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20"
                          : "bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/20"
                      }`}
                    >
                      {gp.is_enabled ? "Disable" : "Enable"}
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-2 text-xs">
                  <span className="text-gray-500">Fee: <span className="text-gray-300">{(parseFloat(gp.trading_fee) * 100).toFixed(2)}%</span></span>
                  <span className="text-gray-500">Min: <span className="text-gray-300">${gp.min_trade_amount}</span></span>
                  <span className="text-gray-500">Max: <span className="text-gray-300">${gp.max_trade_amount}</span></span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {(["all", "pending", "approved", "rejected", "cancelled"] as StatusFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold capitalize whitespace-nowrap transition-colors ${
              statusFilter === f
                ? "bg-yellow-500 text-black"
                : "bg-[#111] border border-[#1e1e1e] text-gray-400 hover:text-white"
            }`}
          >
            {f === "all" ? `All (${stats.total})` : f === "pending" ? `Pending (${stats.pending})` : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Trades Table */}
      <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-gray-500">Loading gold trades...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500 gap-2">
            <GoldIcon size={40} />
            <p>No {statusFilter !== "all" ? statusFilter : ""} gold trades found</p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#1e1e1e]">
                    {["ID", "User", "Date", "Pair", "Side", "Gold (oz)", "Value (USDT)", "Price/oz", "Fee", "Status", "Actions"].map(h => (
                      <th key={h} className="text-left text-gray-500 text-xs font-medium px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((trade) => {
                    const cfg = STATUS_CONFIG[trade.status] || STATUS_CONFIG.pending;
                    const StatusIcon = cfg.icon;
                    return (
                      <tr key={trade.id} className="border-b border-[#1a1a1a] hover:bg-[#151515] transition-colors">
                        <td className="px-4 py-3 text-gray-400 text-xs">#{trade.id}</td>
                        <td className="px-4 py-3">
                          <div className="text-white text-xs font-medium">{trade.userDetails?.email || trade.user_id.slice(0, 8) + "..."}</div>
                          {trade.userDetails?.full_name && (
                            <div className="text-gray-500 text-[11px]">{trade.userDetails.full_name}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                          {new Date(trade.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          <br />
                          {new Date(trade.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td className="px-4 py-3 text-white text-xs">{trade.pair_symbol}</td>
                        <td className="px-4 py-3">
                          <span className={`flex items-center gap-1 text-xs font-bold ${trade.side === "buy" ? "text-green-400" : "text-red-400"}`}>
                            {trade.side === "buy" ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                            {trade.side.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-white text-xs tabular-nums">{parseFloat(trade.gold_quantity).toFixed(6)}</td>
                        <td className="px-4 py-3 text-white text-xs tabular-nums">${parseFloat(trade.amount_usdt).toFixed(2)}</td>
                        <td className="px-4 py-3 text-gray-300 text-xs tabular-nums">${parseFloat(trade.price_per_oz).toLocaleString()}</td>
                        <td className="px-4 py-3 text-gray-300 text-xs tabular-nums">${parseFloat(trade.fee_usdt).toFixed(2)}</td>
                        <td className="px-4 py-3">
                          <span className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${cfg.bg} ${cfg.color}`}>
                            <StatusIcon size={11} />
                            {cfg.label}
                          </span>
                          {trade.reject_reason && (
                            <p className="text-red-400 text-[11px] mt-1 max-w-[140px] truncate" title={trade.reject_reason}>
                              {trade.reject_reason}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {trade.status === "pending" && (
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => approveMutation.mutate(trade.id)}
                                disabled={approveMutation.isPending}
                                className="px-2.5 py-1.5 rounded-lg bg-green-600 hover:bg-green-500 text-white text-xs font-semibold transition-colors disabled:opacity-50"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => { setRejectTargetId(trade.id); setRejectDialogOpen(true); }}
                                className="px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition-colors"
                              >
                                Reject
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="lg:hidden p-4 space-y-3">
              {filtered.map((trade) => {
                const cfg = STATUS_CONFIG[trade.status] || STATUS_CONFIG.pending;
                const StatusIcon = cfg.icon;
                return (
                  <div key={trade.id} className="bg-[#0f0f0f] rounded-xl border border-[#1e1e1e] p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold uppercase ${trade.side === "buy" ? "text-green-400" : "text-red-400"}`}>
                          {trade.side}
                        </span>
                        <span className="text-gray-500 text-xs">{trade.pair_symbol}</span>
                        <span className="text-gray-600 text-xs">#{trade.id}</span>
                      </div>
                      <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
                        <StatusIcon size={10} />
                        {cfg.label}
                      </span>
                    </div>

                    <div className="text-xs text-gray-400 mb-2">
                      {trade.userDetails?.email || trade.user_id.slice(0, 12) + "..."}
                    </div>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mb-2">
                      <span className="text-gray-500">Gold: <span className="text-white">{parseFloat(trade.gold_quantity).toFixed(6)} oz</span></span>
                      <span className="text-gray-500">Value: <span className="text-white">${parseFloat(trade.amount_usdt).toFixed(2)}</span></span>
                      <span className="text-gray-500">Price: <span className="text-white">${parseFloat(trade.price_per_oz).toLocaleString()}</span></span>
                      <span className="text-gray-500">Fee: <span className="text-white">${parseFloat(trade.fee_usdt).toFixed(2)}</span></span>
                    </div>

                    {trade.reject_reason && (
                      <p className="text-red-400 text-xs mb-2 bg-red-950/20 rounded-lg px-2 py-1">{trade.reject_reason}</p>
                    )}

                    <div className="flex items-center justify-between">
                      <span className="text-gray-600 text-[11px]">
                        {new Date(trade.created_at).toLocaleString()}
                      </span>
                      {trade.status === "pending" && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => approveMutation.mutate(trade.id)}
                            disabled={approveMutation.isPending}
                            className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-500 text-white text-xs font-semibold transition-colors disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => { setRejectTargetId(trade.id); setRejectDialogOpen(true); }}
                            className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition-colors"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="bg-[#111] border-[#1e1e1e] text-white max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Gold Trade #{rejectTargetId}</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <label className="text-gray-400 text-sm mb-2 block">Rejection reason (optional)</label>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="e.g. Suspicious activity, Price manipulation..."
              rows={3}
              className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-red-500 resize-none"
            />
            <p className="text-gray-500 text-xs mt-2">Funds will be automatically refunded to the user.</p>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => { setRejectDialogOpen(false); setRejectReason(""); setRejectTargetId(null); }}
              className="bg-transparent border-[#2a2a2a] text-gray-300 hover:text-white hover:bg-[#1a1a1a]"
            >
              Cancel
            </Button>
            <Button
              onClick={() => rejectTargetId && rejectMutation.mutate({ id: rejectTargetId, reason: rejectReason })}
              disabled={rejectMutation.isPending}
              className="bg-red-600 hover:bg-red-500 text-white"
            >
              {rejectMutation.isPending ? "Rejecting..." : "Confirm Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Pair Dialog */}
      <Dialog open={!!editPair} onOpenChange={(open) => { if (!open) setEditPair(null); }}>
        <DialogContent className="bg-[#111] border-[#1e1e1e] text-white max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Gold Pair — {editPair?.symbol}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-gray-400 text-xs mb-1.5 block">Trading Fee (%)</label>
              <input
                type="number"
                value={pairForm.trading_fee}
                onChange={e => setPairForm(p => ({ ...p, trading_fee: e.target.value }))}
                step="0.01"
                min="0"
                max="100"
                className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-yellow-500"
              />
            </div>
            <div>
              <label className="text-gray-400 text-xs mb-1.5 block">Min Trade Amount (USDT)</label>
              <input
                type="number"
                value={pairForm.min_trade_amount}
                onChange={e => setPairForm(p => ({ ...p, min_trade_amount: e.target.value }))}
                min="0"
                className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-yellow-500"
              />
            </div>
            <div>
              <label className="text-gray-400 text-xs mb-1.5 block">Max Trade Amount (USDT)</label>
              <input
                type="number"
                value={pairForm.max_trade_amount}
                onChange={e => setPairForm(p => ({ ...p, max_trade_amount: e.target.value }))}
                min="0"
                className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-yellow-500"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setEditPair(null)}
              className="bg-transparent border-[#2a2a2a] text-gray-300 hover:text-white hover:bg-[#1a1a1a]"
            >
              Cancel
            </Button>
            <Button
              onClick={() => editPair && updatePairMutation.mutate({
                id: editPair.id,
                data: {
                  tradingFee: parseFloat(pairForm.trading_fee) / 100,
                  tradingFeeUnit: "percent",
                  minTradeAmount: parseFloat(pairForm.min_trade_amount),
                  maxTradeAmount: parseFloat(pairForm.max_trade_amount),
                },
              })}
              disabled={updatePairMutation.isPending}
              className="bg-yellow-500 hover:bg-yellow-400 text-black font-semibold"
            >
              {updatePairMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
