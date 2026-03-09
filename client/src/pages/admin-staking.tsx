import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Coins, Users, TrendingUp, Clock, DollarSign, Search, RefreshCw,
  ChevronDown, ChevronUp, Filter, MoreHorizontal, CheckCircle,
  XCircle, Timer, Trash2, ArrowRight, Shield, AlertTriangle,
  BarChart3, Activity, Lock, Unlock, Plus, Save, X, Calendar
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import AdminLayout from "./admin-layout";
import { apiRequest } from "@/lib/queryClient";
import { formatDateTime } from "@/lib/date-utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface StakingUser {
  id: string;
  email: string;
  full_name: string;
  username: string;
  display_id: string;
}

interface StakingPosition {
  id: number;
  userId: string;
  symbol: string;
  amount: string;
  apy: string;
  duration: number;
  startDate: string;
  endDate: string;
  status: "active" | "completed";
  user: StakingUser | null;
}

interface StakingStats {
  activePositions: number;
  completedPositions: number;
  totalPositions: number;
  totalActiveStaked: number;
  totalCompletedStaked: number;
  estimatedRewardsPaid: number;
  uniqueStakers: number;
  activeStakers: number;
  averageApy: number;
  averageDuration: number;
}

interface StakingLimit {
  id: number;
  userId: string;
  maxStakeAmount: string | null;
  maxTotalStaked: string | null;
  maxDuration: number | null;
  minStakeAmount: string | null;
  isEnabled: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
  user: StakingUser | null;
}

// ─── Helper ─────────────────────────────────────────────────────────────────

function fmt(n: number | string, dec = 2): string {
  const v = typeof n === "string" ? parseFloat(n) : n;
  if (isNaN(v)) return "0.00";
  return v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function daysRemaining(endDate: string): number {
  const diff = new Date(endDate).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function progressPercent(startDate: string, endDate: string): number {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const now = Date.now();
  if (now >= end) return 100;
  if (now <= start) return 0;
  return Math.round(((now - start) / (end - start)) * 100);
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function AdminStakingPage() {
  const [tab, setTab] = useState("overview");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "completed">("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [extendDays, setExtendDays] = useState<Record<number, string>>({});

  // Limit editor state
  const [limitEditorOpen, setLimitEditorOpen] = useState(false);
  const [limitUserId, setLimitUserId] = useState("");
  const [limitForm, setLimitForm] = useState({
    maxStakeAmount: "",
    maxTotalStaked: "",
    maxDuration: "",
    minStakeAmount: "",
    isEnabled: true,
    notes: "",
  });

  const { toast } = useToast();
  const qc = useQueryClient();

  // ─── Queries ────────────────────────────────

  const { data: stats, isLoading: statsLoading } = useQuery<StakingStats>({
    queryKey: ["/api/admin/staking/stats"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/staking/stats");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const { data: positionsData, isLoading: positionsLoading, refetch: refetchPositions } = useQuery<{
    positions: StakingPosition[];
    total: number;
  }>({
    queryKey: ["/api/admin/staking/positions", statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      params.set("limit", "200");
      const res = await apiRequest("GET", `/api/admin/staking/positions?${params}`);
      return res.json();
    },
    refetchInterval: 30000,
  });

  const { data: limits, isLoading: limitsLoading, refetch: refetchLimits } = useQuery<StakingLimit[]>({
    queryKey: ["/api/admin/staking/limits"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/staking/limits");
      return res.json();
    },
  });

  // ─── Mutations ──────────────────────────────

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PUT", `/api/admin/staking/positions/${id}/status`, { status });
      return res.json();
    },
    onSuccess: (_, vars) => {
      toast({ title: "Status Updated", description: `Position #${vars.id} set to ${vars.status}` });
      qc.invalidateQueries({ queryKey: ["/api/admin/staking"] });
      refetchPositions();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to update status", variant: "destructive" });
    },
  });

  const extendMutation = useMutation({
    mutationFn: async ({ id, additionalDays }: { id: number; additionalDays: number }) => {
      const res = await apiRequest("PUT", `/api/admin/staking/positions/${id}/extend`, { additionalDays });
      return res.json();
    },
    onSuccess: (_, vars) => {
      toast({ title: "Position Extended", description: `Position #${vars.id} extended by ${vars.additionalDays} days` });
      qc.invalidateQueries({ queryKey: ["/api/admin/staking"] });
      refetchPositions();
      setExtendDays({});
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to extend position", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/admin/staking/positions/${id}`);
      return res.json();
    },
    onSuccess: (_, id) => {
      toast({ title: "Position Deleted", description: `Position #${id} cancelled and funds returned` });
      qc.invalidateQueries({ queryKey: ["/api/admin/staking"] });
      refetchPositions();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to delete position", variant: "destructive" });
    },
  });

  const limitMutation = useMutation({
    mutationFn: async ({ userId, data }: { userId: string; data: any }) => {
      const res = await apiRequest("PUT", `/api/admin/staking/limits/${userId}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Limit Saved", description: "Staking limit updated successfully" });
      refetchLimits();
      setLimitEditorOpen(false);
      resetLimitForm();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to save limit", variant: "destructive" });
    },
  });

  const deleteLimitMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("DELETE", `/api/admin/staking/limits/${userId}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Limit Removed", description: "User staking limit has been removed" });
      refetchLimits();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to remove limit", variant: "destructive" });
    },
  });

  // ─── Helpers ────────────────────────────────

  const positions = positionsData?.positions || [];

  const filteredPositions = positions.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.user?.email?.toLowerCase().includes(q) ||
      p.user?.full_name?.toLowerCase().includes(q) ||
      p.user?.username?.toLowerCase().includes(q) ||
      p.user?.display_id?.toLowerCase().includes(q) ||
      p.userId?.toLowerCase().includes(q) ||
      String(p.id).includes(q)
    );
  });

  const resetLimitForm = useCallback(() => {
    setLimitUserId("");
    setLimitForm({ maxStakeAmount: "", maxTotalStaked: "", maxDuration: "", minStakeAmount: "", isEnabled: true, notes: "" });
  }, []);

  const openEditLimit = useCallback((limit: StakingLimit) => {
    setLimitUserId(limit.userId);
    setLimitForm({
      maxStakeAmount: limit.maxStakeAmount || "",
      maxTotalStaked: limit.maxTotalStaked || "",
      maxDuration: limit.maxDuration?.toString() || "",
      minStakeAmount: limit.minStakeAmount || "",
      isEnabled: limit.isEnabled,
      notes: limit.notes || "",
    });
    setLimitEditorOpen(true);
  }, []);

  const handleSaveLimit = () => {
    if (!limitUserId.trim()) {
      toast({ title: "Error", description: "User ID is required", variant: "destructive" });
      return;
    }
    limitMutation.mutate({
      userId: limitUserId.trim(),
      data: {
        maxStakeAmount: limitForm.maxStakeAmount || null,
        maxTotalStaked: limitForm.maxTotalStaked || null,
        maxDuration: limitForm.maxDuration ? parseInt(limitForm.maxDuration) : null,
        minStakeAmount: limitForm.minStakeAmount || null,
        isEnabled: limitForm.isEnabled,
        notes: limitForm.notes || null,
      },
    });
  };

  // ─── Render ─────────────────────────────────

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-500/10 rounded-xl flex items-center justify-center">
                <Coins size={22} className="text-purple-400" />
              </div>
              Staking Management
            </h1>
            <p className="text-sm text-gray-500 mt-1">Monitor and manage all staking positions & user limits</p>
          </div>
          <Button
            onClick={() => { refetchPositions(); refetchLimits(); }}
            variant="outline"
            size="sm"
            className="bg-[#1a1a1a] border-[#2a2a2a] text-gray-300 hover:bg-[#222] hover:text-white"
          >
            <RefreshCw size={14} className="mr-2" /> Refresh
          </Button>
        </div>

        {/* Stats Grid */}
        {!statsLoading && stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
            <StatCard icon={Activity} label="Active Positions" value={stats.activePositions} color="green" />
            <StatCard icon={CheckCircle} label="Completed" value={stats.completedPositions} color="blue" />
            <StatCard icon={DollarSign} label="Total Active Staked" value={`$${fmt(stats.totalActiveStaked)}`} color="purple" />
            <StatCard icon={TrendingUp} label="Rewards Paid" value={`$${fmt(stats.estimatedRewardsPaid)}`} color="yellow" />
            <StatCard icon={Users} label="Active Stakers" value={stats.activeStakers} color="cyan" />
          </div>
        )}

        {/* Secondary Stats */}
        {!statsLoading && stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MiniStat label="Total Positions" value={stats.totalPositions} />
            <MiniStat label="Unique Stakers" value={stats.uniqueStakers} />
            <MiniStat label="Avg APY" value={`${fmt(stats.averageApy)}%`} />
            <MiniStat label="Avg Duration" value={`${stats.averageDuration} days`} />
          </div>
        )}

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="bg-[#111] border border-[#1e1e1e] h-10 p-1 w-full md:w-auto">
            <TabsTrigger value="overview" className="data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-400 text-xs md:text-sm">
              <BarChart3 size={14} className="mr-1.5" /> All Positions
            </TabsTrigger>
            <TabsTrigger value="active" className="data-[state=active]:bg-green-500/20 data-[state=active]:text-green-400 text-xs md:text-sm">
              <Activity size={14} className="mr-1.5" /> Active
            </TabsTrigger>
            <TabsTrigger value="completed" className="data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-400 text-xs md:text-sm">
              <CheckCircle size={14} className="mr-1.5" /> Completed
            </TabsTrigger>
            <TabsTrigger value="limits" className="data-[state=active]:bg-yellow-500/20 data-[state=active]:text-yellow-400 text-xs md:text-sm">
              <Shield size={14} className="mr-1.5" /> User Limits
            </TabsTrigger>
          </TabsList>

          {/* All / Active / Completed → same positions list with filter */}
          {["overview", "active", "completed"].map((tabKey) => (
            <TabsContent key={tabKey} value={tabKey} className="mt-4 space-y-4">
              {/* Filter bar */}
              <div className="flex flex-col md:flex-row gap-3">
                <div className="relative flex-1">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <Input
                    placeholder="Search by name, email, ID..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10 bg-[#111] border-[#1e1e1e] text-white placeholder:text-gray-600 h-10"
                  />
                </div>
                {tabKey === "overview" && (
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                    className="h-10 px-3 bg-[#111] border border-[#1e1e1e] rounded-lg text-sm text-gray-300 focus:outline-none focus:ring-1 focus:ring-purple-500/30"
                  >
                    <option value="all">All Status</option>
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                  </select>
                )}
              </div>

              {/* Positions List */}
              <PositionsList
                positions={tabKey === "active"
                  ? filteredPositions.filter((p) => p.status === "active")
                  : tabKey === "completed"
                  ? filteredPositions.filter((p) => p.status === "completed")
                  : filteredPositions
                }
                loading={positionsLoading}
                expandedId={expandedId}
                setExpandedId={setExpandedId}
                extendDays={extendDays}
                setExtendDays={setExtendDays}
                onStatusChange={(id, status) => statusMutation.mutate({ id, status })}
                onExtend={(id) => {
                  const days = parseInt(extendDays[id] || "0");
                  if (days > 0) extendMutation.mutate({ id, additionalDays: days });
                }}
                onDelete={(id) => {
                  if (confirm(`Delete position #${id}? Funds will be returned to the user.`)) {
                    deleteMutation.mutate(id);
                  }
                }}
                onSetLimit={(userId) => {
                  setLimitUserId(userId);
                  setLimitEditorOpen(true);
                  setTab("limits");
                }}
              />
            </TabsContent>
          ))}

          {/* Limits Tab */}
          <TabsContent value="limits" className="mt-4 space-y-4">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
              <p className="text-sm text-gray-400">Set per-user staking limits to control maximum amounts, durations, and enable/disable staking.</p>
              <Button
                onClick={() => { resetLimitForm(); setLimitEditorOpen(true); }}
                size="sm"
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                <Plus size={14} className="mr-1.5" /> Add Limit
              </Button>
            </div>

            {/* Limit Editor Dialog */}
            {limitEditorOpen && (
              <Card className="bg-[#0f0f0f] border-purple-500/30">
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <Shield size={16} className="text-purple-400" />
                      {limitUserId ? "Edit Staking Limit" : "New Staking Limit"}
                    </h3>
                    <button onClick={() => { setLimitEditorOpen(false); resetLimitForm(); }} className="p-1 rounded hover:bg-[#1a1a1a]">
                      <X size={16} className="text-gray-400" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">User ID</label>
                      <Input
                        value={limitUserId}
                        onChange={(e) => setLimitUserId(e.target.value)}
                        placeholder="Paste user UUID"
                        className="bg-[#111] border-[#1e1e1e] text-white h-9 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Min Stake Amount (USDT)</label>
                      <Input
                        type="number"
                        value={limitForm.minStakeAmount}
                        onChange={(e) => setLimitForm({ ...limitForm, minStakeAmount: e.target.value })}
                        placeholder="e.g. 10"
                        className="bg-[#111] border-[#1e1e1e] text-white h-9 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Max Single Stake (USDT)</label>
                      <Input
                        type="number"
                        value={limitForm.maxStakeAmount}
                        onChange={(e) => setLimitForm({ ...limitForm, maxStakeAmount: e.target.value })}
                        placeholder="e.g. 100000"
                        className="bg-[#111] border-[#1e1e1e] text-white h-9 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Max Total Staked (USDT)</label>
                      <Input
                        type="number"
                        value={limitForm.maxTotalStaked}
                        onChange={(e) => setLimitForm({ ...limitForm, maxTotalStaked: e.target.value })}
                        placeholder="e.g. 500000"
                        className="bg-[#111] border-[#1e1e1e] text-white h-9 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Max Duration (days)</label>
                      <Input
                        type="number"
                        value={limitForm.maxDuration}
                        onChange={(e) => setLimitForm({ ...limitForm, maxDuration: e.target.value })}
                        placeholder="e.g. 180"
                        className="bg-[#111] border-[#1e1e1e] text-white h-9 text-sm"
                      />
                    </div>
                    <div className="flex items-center gap-3 pt-4">
                      <label className="text-xs text-gray-500">Staking Enabled</label>
                      <button
                        onClick={() => setLimitForm({ ...limitForm, isEnabled: !limitForm.isEnabled })}
                        className={`w-10 h-5 rounded-full transition-colors ${limitForm.isEnabled ? "bg-green-500" : "bg-red-500/50"}`}
                      >
                        <div className={`w-4 h-4 bg-white rounded-full transition-transform mx-0.5 ${limitForm.isEnabled ? "translate-x-5" : ""}`} />
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Admin Notes</label>
                    <Input
                      value={limitForm.notes}
                      onChange={(e) => setLimitForm({ ...limitForm, notes: e.target.value })}
                      placeholder="Optional notes..."
                      className="bg-[#111] border-[#1e1e1e] text-white h-9 text-sm"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setLimitEditorOpen(false); resetLimitForm(); }}
                      className="bg-[#1a1a1a] border-[#2a2a2a] text-gray-300"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSaveLimit}
                      disabled={limitMutation.isPending || !limitUserId.trim()}
                      className="bg-purple-600 hover:bg-purple-700 text-white"
                    >
                      <Save size={14} className="mr-1.5" />
                      {limitMutation.isPending ? "Saving..." : "Save Limit"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Limits Table */}
            {limitsLoading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw size={20} className="text-gray-500 animate-spin" />
              </div>
            ) : !limits || limits.length === 0 ? (
              <Card className="bg-[#0f0f0f] border-[#1e1e1e]">
                <CardContent className="flex flex-col items-center justify-center py-12 text-gray-500">
                  <Shield size={32} className="mb-2 opacity-30" />
                  <p className="text-sm">No staking limits configured</p>
                  <p className="text-xs text-gray-600 mt-1">Users can stake without restrictions</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {limits.map((limit) => (
                  <Card key={limit.id} className="bg-[#0f0f0f] border-[#1e1e1e] hover:border-[#2a2a2a] transition-colors">
                    <CardContent className="p-4">
                      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${limit.isEnabled ? "bg-green-500/10" : "bg-red-500/10"}`}>
                            {limit.isEnabled ? <Unlock size={16} className="text-green-400" /> : <Lock size={16} className="text-red-400" />}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-white">
                              {limit.user?.full_name || limit.user?.email || limit.userId.slice(0, 12) + "..."}
                            </p>
                            <p className="text-xs text-gray-500">{limit.user?.email || limit.userId}</p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {limit.minStakeAmount && (
                            <Badge variant="outline" className="text-[10px] border-blue-500/30 text-blue-400 bg-blue-500/5">
                              Min: ${fmt(limit.minStakeAmount)}
                            </Badge>
                          )}
                          {limit.maxStakeAmount && (
                            <Badge variant="outline" className="text-[10px] border-purple-500/30 text-purple-400 bg-purple-500/5">
                              Max Stake: ${fmt(limit.maxStakeAmount)}
                            </Badge>
                          )}
                          {limit.maxTotalStaked && (
                            <Badge variant="outline" className="text-[10px] border-yellow-500/30 text-yellow-400 bg-yellow-500/5">
                              Max Total: ${fmt(limit.maxTotalStaked)}
                            </Badge>
                          )}
                          {limit.maxDuration && (
                            <Badge variant="outline" className="text-[10px] border-cyan-500/30 text-cyan-400 bg-cyan-500/5">
                              Max {limit.maxDuration}d
                            </Badge>
                          )}
                          <Badge variant="outline" className={`text-[10px] ${limit.isEnabled ? "border-green-500/30 text-green-400 bg-green-500/5" : "border-red-500/30 text-red-400 bg-red-500/5"}`}>
                            {limit.isEnabled ? "Enabled" : "Blocked"}
                          </Badge>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditLimit(limit)}
                            className="h-7 px-2 text-xs text-gray-400 hover:text-white"
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (confirm("Remove this staking limit? The user will revert to default limits.")) {
                                deleteLimitMutation.mutate(limit.userId);
                              }
                            }}
                            className="h-7 px-2 text-xs text-red-400 hover:text-red-300"
                          >
                            <Trash2 size={12} />
                          </Button>
                        </div>
                      </div>
                      {limit.notes && (
                        <p className="text-xs text-gray-500 mt-2 ml-11">Note: {limit.notes}</p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, color }: {
  icon: any;
  label: string;
  value: string | number;
  color: string;
}) {
  const colors: Record<string, string> = {
    green: "bg-green-500/10 text-green-400",
    blue: "bg-blue-500/10 text-blue-400",
    purple: "bg-purple-500/10 text-purple-400",
    yellow: "bg-yellow-500/10 text-yellow-400",
    cyan: "bg-cyan-500/10 text-cyan-400",
    red: "bg-red-500/10 text-red-400",
  };

  return (
    <Card className="bg-[#0f0f0f] border-[#1e1e1e]">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${colors[color] || colors.blue}`}>
            <Icon size={18} />
          </div>
          <div>
            <p className="text-xs text-gray-500">{label}</p>
            <p className="text-lg font-bold text-white">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-[#0f0f0f] border border-[#1e1e1e] rounded-xl px-4 py-3">
      <p className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</p>
      <p className="text-sm font-semibold text-white mt-0.5">{value}</p>
    </div>
  );
}

function PositionsList({
  positions,
  loading,
  expandedId,
  setExpandedId,
  extendDays,
  setExtendDays,
  onStatusChange,
  onExtend,
  onDelete,
  onSetLimit,
}: {
  positions: StakingPosition[];
  loading: boolean;
  expandedId: number | null;
  setExpandedId: (id: number | null) => void;
  extendDays: Record<number, string>;
  setExtendDays: (val: Record<number, string>) => void;
  onStatusChange: (id: number, status: string) => void;
  onExtend: (id: number) => void;
  onDelete: (id: number) => void;
  onSetLimit: (userId: string) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw size={20} className="text-gray-500 animate-spin" />
      </div>
    );
  }

  if (positions.length === 0) {
    return (
      <Card className="bg-[#0f0f0f] border-[#1e1e1e]">
        <CardContent className="flex flex-col items-center justify-center py-12 text-gray-500">
          <Coins size={32} className="mb-2 opacity-30" />
          <p className="text-sm">No staking positions found</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {positions.map((p) => {
        const isExpanded = expandedId === p.id;
        const days = daysRemaining(p.endDate);
        const progress = progressPercent(p.startDate, p.endDate);
        const isActive = p.status === "active";
        const stakeAmount = parseFloat(p.amount);
        const apy = parseFloat(p.apy);
        const estimatedReward = stakeAmount * (apy / 100) * (p.duration / 365);

        return (
          <Card key={p.id} className={`bg-[#0f0f0f] border-[#1e1e1e] hover:border-[#2a2a2a] transition-colors ${isExpanded ? "ring-1 ring-purple-500/30" : ""}`}>
            <CardContent className="p-0">
              {/* Main Row */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : p.id)}
                className="w-full flex items-center gap-3 p-4 text-left"
              >
                {/* Status indicator */}
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? "bg-green-500 animate-pulse" : "bg-gray-500"}`} />

                {/* User Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-white truncate">
                      {p.user?.full_name || p.user?.email || p.userId.slice(0, 12) + "..."}
                    </p>
                    <Badge variant="outline" className={`text-[10px] px-1.5 ${isActive ? "border-green-500/30 text-green-400 bg-green-500/5" : "border-gray-500/30 text-gray-400 bg-gray-500/5"}`}>
                      {p.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-500 truncate">
                    {p.user?.email || p.userId}
                    {p.user?.display_id ? ` • #${p.user.display_id}` : ""}
                  </p>
                </div>

                {/* Amount */}
                <div className="text-right flex-shrink-0 hidden sm:block">
                  <p className="text-sm font-bold text-white">${fmt(stakeAmount)}</p>
                  <p className="text-[10px] text-gray-500">USDT</p>
                </div>

                {/* APY */}
                <div className="text-right flex-shrink-0 hidden md:block">
                  <p className="text-sm font-semibold text-green-400">{p.apy}%</p>
                  <p className="text-[10px] text-gray-500">APY</p>
                </div>

                {/* Duration / Days Left */}
                <div className="text-right flex-shrink-0 hidden lg:block">
                  <p className="text-sm text-white">{isActive ? `${days}d left` : `${p.duration}d`}</p>
                  <p className="text-[10px] text-gray-500">{p.duration}d total</p>
                </div>

                {/* Expand icon */}
                {isExpanded ? <ChevronUp size={16} className="text-gray-400 flex-shrink-0" /> : <ChevronDown size={16} className="text-gray-400 flex-shrink-0" />}
              </button>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="border-t border-[#1e1e1e] p-4 space-y-4">
                  {/* Info grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-[#0a0a0a] rounded-lg p-3">
                      <p className="text-[10px] text-gray-500 uppercase">Position ID</p>
                      <p className="text-sm font-semibold text-white mt-0.5">#{p.id}</p>
                    </div>
                    <div className="bg-[#0a0a0a] rounded-lg p-3">
                      <p className="text-[10px] text-gray-500 uppercase">Amount</p>
                      <p className="text-sm font-semibold text-white mt-0.5">${fmt(stakeAmount)}</p>
                    </div>
                    <div className="bg-[#0a0a0a] rounded-lg p-3">
                      <p className="text-[10px] text-gray-500 uppercase">APY</p>
                      <p className="text-sm font-semibold text-green-400 mt-0.5">{p.apy}%</p>
                    </div>
                    <div className="bg-[#0a0a0a] rounded-lg p-3">
                      <p className="text-[10px] text-gray-500 uppercase">Est. Reward</p>
                      <p className="text-sm font-semibold text-yellow-400 mt-0.5">${fmt(estimatedReward)}</p>
                    </div>
                  </div>

                  {/* Dates */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div className="bg-[#0a0a0a] rounded-lg p-3">
                      <p className="text-[10px] text-gray-500 uppercase">Start Date</p>
                      <p className="text-xs text-white mt-0.5">{formatDateTime(p.startDate)}</p>
                    </div>
                    <div className="bg-[#0a0a0a] rounded-lg p-3">
                      <p className="text-[10px] text-gray-500 uppercase">End Date</p>
                      <p className="text-xs text-white mt-0.5">{formatDateTime(p.endDate)}</p>
                    </div>
                    <div className="bg-[#0a0a0a] rounded-lg p-3">
                      <p className="text-[10px] text-gray-500 uppercase">Duration</p>
                      <p className="text-xs text-white mt-0.5">{p.duration} days</p>
                    </div>
                  </div>

                  {/* Progress bar for active */}
                  {isActive && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-gray-500">Progress</span>
                        <span className="text-[10px] text-gray-400">{progress}%</span>
                      </div>
                      <div className="h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#1a1a1a]">
                    {isActive && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onStatusChange(p.id, "completed")}
                          className="h-7 text-xs bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20"
                        >
                          <CheckCircle size={12} className="mr-1" /> Complete
                        </Button>

                        {/* Extend */}
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min={1}
                            max={365}
                            placeholder="days"
                            value={extendDays[p.id] || ""}
                            onChange={(e) => setExtendDays({ ...extendDays, [p.id]: e.target.value })}
                            className="w-20 h-7 text-xs bg-[#111] border-[#1e1e1e] text-white"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onExtend(p.id)}
                            disabled={!extendDays[p.id] || parseInt(extendDays[p.id]) <= 0}
                            className="h-7 text-xs bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20"
                          >
                            <Timer size={12} className="mr-1" /> Extend
                          </Button>
                        </div>
                      </>
                    )}

                    {!isActive && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onStatusChange(p.id, "active")}
                        className="h-7 text-xs bg-yellow-500/10 border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/20"
                      >
                        <Activity size={12} className="mr-1" /> Reactivate
                      </Button>
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onSetLimit(p.userId)}
                      className="h-7 text-xs bg-purple-500/10 border-purple-500/30 text-purple-400 hover:bg-purple-500/20"
                    >
                      <Shield size={12} className="mr-1" /> Set Limit
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDelete(p.id)}
                      className="h-7 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 ml-auto"
                    >
                      <Trash2 size={12} className="mr-1" /> Delete
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
