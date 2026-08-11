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
  pending:   { color: "text-warning", bg: "bg-warning/10", icon: Clock,        label: "Pending"   },
  approved:  { color: "text-success", bg: "bg-success/10", icon: CheckCircle,  label: "Approved"  },
  rejected:  { color: "text-danger",  bg: "bg-danger/10",  icon: XCircle,      label: "Rejected"  },
  cancelled: { color: "text-muted-foreground", bg: "bg-muted", icon: AlertCircle,  label: "Cancelled" },
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
    <div className="min-h-screen bg-background p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <GoldIcon size={36} />
        <div>
          <h1 className="text-foreground text-xl font-bold">Gold Trading Management</h1>
          <p className="text-muted-foreground text-sm">
            Live price:{" "}
            <span className="text-warning font-semibold tabular-nums">
              ${goldPrice?.price?.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || "—"}/oz
            </span>
            {goldPrice?.source === "fallback" && (
              <span className="text-danger text-xs ml-2">(fallback price)</span>
            )}
          </p>
        </div>
        <button
          onClick={() => { refetchTrades(); refetchPairs(); }}
          className="ml-auto p-2 rounded-xl bg-card border border-border text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {[
          { label: "Total Trades", value: stats.total, color: "text-foreground" },
          { label: "Pending",      value: stats.pending,  color: "text-warning" },
          { label: "Approved",     value: stats.approved, color: "text-success"  },
          { label: "Rejected",     value: stats.rejected, color: "text-danger"    },
          { label: "Volume (USDT)", value: `$${stats.volume.toLocaleString("en-US", { maximumFractionDigits: 0 })}`, color: "text-info" },
          { label: "Fees Earned",  value: `$${stats.fees.toFixed(2)}`, color: "text-primary" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-card rounded-xl border border-border p-3">
            <p className="text-muted-foreground text-xs mb-1">{label}</p>
            <p className={`font-bold text-lg tabular-nums ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Gold Pairs Management */}
      <div className="bg-card rounded-xl border border-border mb-4">
        <button
          onClick={() => setExpandedPairs(!expandedPairs)}
          className="w-full flex items-center justify-between p-4 text-foreground hover:bg-muted/50 transition-colors rounded-xl"
        >
          <div className="flex items-center gap-2">
            <Settings size={16} className="text-warning" />
            <span className="font-semibold text-sm">Gold Trading Pairs ({goldPairs.length})</span>
          </div>
          {expandedPairs ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
        </button>

        {expandedPairs && (
          <div className="border-t border-border p-4 space-y-3">
            {goldPairs.length === 0 && (
              <p className="text-muted-foreground text-sm text-center py-4">No gold pairs found. Run the migration to add XAU/USDT.</p>
            )}
            {goldPairs.map((gp) => (
              <div key={gp.id} className="bg-muted/30 rounded-xl border border-border p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <GoldIcon size={20} />
                    <span className="text-foreground font-semibold text-sm">{gp.symbol}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${gp.is_enabled ? "bg-success/15 text-success" : "bg-danger/15 text-danger"}`}>
                      {gp.is_enabled ? "Active" : "Disabled"}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setEditPair(gp); setPairForm({ trading_fee: (parseFloat(gp.trading_fee) * 100).toFixed(2), min_trade_amount: gp.min_trade_amount, max_trade_amount: gp.max_trade_amount }); }}
                      className="text-xs px-3 py-1.5 rounded-lg bg-muted text-muted-foreground hover:text-foreground border border-border transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => togglePairMutation.mutate(gp.id)}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                        gp.is_enabled
                          ? "bg-danger/10 text-danger border-danger/20 hover:bg-danger/20"
                          : "bg-success/10 text-success border-success/20 hover:bg-success/20"
                      }`}
                    >
                      {gp.is_enabled ? "Disable" : "Enable"}
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-2 text-xs">
                  <span className="text-muted-foreground">Fee: <span className="text-foreground tabular-nums">{(parseFloat(gp.trading_fee) * 100).toFixed(2)}%</span></span>
                  <span className="text-muted-foreground">Min: <span className="text-foreground tabular-nums">${gp.min_trade_amount}</span></span>
                  <span className="text-muted-foreground">Max: <span className="text-foreground tabular-nums">${gp.max_trade_amount}</span></span>
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
                ? "bg-primary text-primary-foreground"
                : "bg-card border border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {f === "all" ? `All (${stats.total})` : f === "pending" ? `Pending (${stats.pending})` : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Trades Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">Loading gold trades...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
            <GoldIcon size={40} />
            <p>No {statusFilter !== "all" ? statusFilter : ""} gold trades found</p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    {["ID", "User", "Date", "Pair", "Side", "Gold (oz)", "Value (USDT)", "Price/oz", "Fee", "Status", "Actions"].map(h => (
                      <th key={h} className="text-left text-muted-foreground text-xs font-medium px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((trade) => {
                    const cfg = STATUS_CONFIG[trade.status] || STATUS_CONFIG.pending;
                    const StatusIcon = cfg.icon;
                    return (
                      <tr key={trade.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                        <td className="px-4 py-3 text-muted-foreground text-xs">#{trade.id}</td>
                        <td className="px-4 py-3">
                          <div className="text-foreground text-xs font-medium">{trade.userDetails?.email || trade.user_id.slice(0, 8) + "..."}</div>
                          {trade.userDetails?.full_name && (
                            <div className="text-muted-foreground text-[11px]">{trade.userDetails.full_name}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                          {new Date(trade.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          <br />
                          {new Date(trade.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td className="px-4 py-3 text-foreground text-xs">{trade.pair_symbol}</td>
                        <td className="px-4 py-3">
                          <span className={`flex items-center gap-1 text-xs font-bold ${trade.side === "buy" ? "text-success" : "text-danger"}`}>
                            {trade.side === "buy" ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                            {trade.side.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-foreground text-xs tabular-nums">{parseFloat(trade.gold_quantity).toFixed(6)}</td>
                        <td className="px-4 py-3 text-foreground text-xs tabular-nums">${parseFloat(trade.amount_usdt).toFixed(2)}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs tabular-nums">${parseFloat(trade.price_per_oz).toLocaleString()}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs tabular-nums">${parseFloat(trade.fee_usdt).toFixed(2)}</td>
                        <td className="px-4 py-3">
                          <span className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${cfg.bg} ${cfg.color}`}>
                            <StatusIcon size={11} />
                            {cfg.label}
                          </span>
                          {trade.reject_reason && (
                            <p className="text-danger text-[11px] mt-1 max-w-[140px] truncate" title={trade.reject_reason}>
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
                                className="px-2.5 py-1.5 rounded-lg bg-success text-success-foreground hover:opacity-90 text-xs font-semibold transition-opacity disabled:opacity-50"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => { setRejectTargetId(trade.id); setRejectDialogOpen(true); }}
                                className="px-2.5 py-1.5 rounded-lg bg-danger text-danger-foreground hover:opacity-90 text-xs font-semibold transition-opacity"
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
                  <div key={trade.id} className="bg-muted/30 rounded-xl border border-border p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold uppercase ${trade.side === "buy" ? "text-success" : "text-danger"}`}>
                          {trade.side}
                        </span>
                        <span className="text-muted-foreground text-xs">{trade.pair_symbol}</span>
                        <span className="text-muted-foreground/70 text-xs">#{trade.id}</span>
                      </div>
                      <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
                        <StatusIcon size={10} />
                        {cfg.label}
                      </span>
                    </div>

                    <div className="text-xs text-muted-foreground mb-2">
                      {trade.userDetails?.email || trade.user_id.slice(0, 12) + "..."}
                    </div>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mb-2 tabular-nums">
                      <span className="text-muted-foreground">Gold: <span className="text-foreground">{parseFloat(trade.gold_quantity).toFixed(6)} oz</span></span>
                      <span className="text-muted-foreground">Value: <span className="text-foreground">${parseFloat(trade.amount_usdt).toFixed(2)}</span></span>
                      <span className="text-muted-foreground">Price: <span className="text-foreground">${parseFloat(trade.price_per_oz).toLocaleString()}</span></span>
                      <span className="text-muted-foreground">Fee: <span className="text-foreground">${parseFloat(trade.fee_usdt).toFixed(2)}</span></span>
                    </div>

                    {trade.reject_reason && (
                      <p className="text-danger text-xs mb-2 bg-danger/10 rounded-lg px-2 py-1">{trade.reject_reason}</p>
                    )}

                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground/70 text-[11px]">
                        {new Date(trade.created_at).toLocaleString()}
                      </span>
                      {trade.status === "pending" && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => approveMutation.mutate(trade.id)}
                            disabled={approveMutation.isPending}
                            className="px-3 py-1.5 rounded-lg bg-success text-success-foreground hover:opacity-90 text-xs font-semibold transition-opacity disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => { setRejectTargetId(trade.id); setRejectDialogOpen(true); }}
                            className="px-3 py-1.5 rounded-lg bg-danger text-danger-foreground hover:opacity-90 text-xs font-semibold transition-opacity"
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
        <DialogContent className="bg-card border-border text-foreground max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Gold Trade #{rejectTargetId}</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <label className="text-muted-foreground text-sm mb-2 block">Rejection reason (optional)</label>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="e.g. Suspicious activity, Price manipulation..."
              rows={3}
              className="w-full bg-background border border-border rounded-xl px-3 py-2 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:border-danger resize-none"
            />
            <p className="text-muted-foreground text-xs mt-2">Funds will be automatically refunded to the user.</p>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => { setRejectDialogOpen(false); setRejectReason(""); setRejectTargetId(null); }}
              className="bg-transparent border-border text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              Cancel
            </Button>
            <Button
              onClick={() => rejectTargetId && rejectMutation.mutate({ id: rejectTargetId, reason: rejectReason })}
              disabled={rejectMutation.isPending}
              className="bg-danger text-danger-foreground hover:opacity-90"
            >
              {rejectMutation.isPending ? "Rejecting..." : "Confirm Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Pair Dialog */}
      <Dialog open={!!editPair} onOpenChange={(open) => { if (!open) setEditPair(null); }}>
        <DialogContent className="bg-card border-border text-foreground max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Gold Pair — {editPair?.symbol}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-muted-foreground text-xs mb-1.5 block">Trading Fee (%)</label>
              <input
                type="number"
                value={pairForm.trading_fee}
                onChange={e => setPairForm(p => ({ ...p, trading_fee: e.target.value }))}
                step="0.01"
                min="0"
                max="100"
                className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-foreground text-sm tabular-nums focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-muted-foreground text-xs mb-1.5 block">Min Trade Amount (USDT)</label>
              <input
                type="number"
                value={pairForm.min_trade_amount}
                onChange={e => setPairForm(p => ({ ...p, min_trade_amount: e.target.value }))}
                min="0"
                className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-foreground text-sm tabular-nums focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-muted-foreground text-xs mb-1.5 block">Max Trade Amount (USDT)</label>
              <input
                type="number"
                value={pairForm.max_trade_amount}
                onChange={e => setPairForm(p => ({ ...p, max_trade_amount: e.target.value }))}
                min="0"
                className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-foreground text-sm tabular-nums focus:outline-none focus:border-primary"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setEditPair(null)}
              className="bg-transparent border-border text-muted-foreground hover:text-foreground hover:bg-muted"
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
              className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
            >
              {updatePairMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
