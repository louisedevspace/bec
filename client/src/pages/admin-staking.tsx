import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Coins, Users, TrendingUp, Clock, DollarSign, Search, RefreshCw,
  ChevronDown, ChevronUp, CheckCircle, Timer, Trash2, BarChart3, Activity,
  Plus, ToggleLeft, ToggleRight, Edit2, Save, X, Settings2, Zap, Lock
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import AdminLayout from "./admin-layout";
import { apiRequest } from "@/lib/queryClient";
import { formatDateTime } from "@/lib/date-utils";
import { supabase } from "@/lib/supabaseClient";

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
  status: "active" | "completed" | "pending_approval";
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

interface StakingProductConfig {
  id: number;
  title: string;
  duration: number;
  apy: string;
  apyMax?: string | null;
  type: "fixed" | "flexible";
  min_amount: string;
  max_amount: string;
  maxParticipants?: number | null;
  requiresApproval?: boolean;
  participantCount?: number;
  is_enabled: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
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

  // ─── Helpers ────────────────────────────────

  const positions = positionsData?.positions || [];

  // ─── Staking Products State ────────────────
  const [products, setProducts] = useState<StakingProductConfig[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productSearch, setProductSearch] = useState('');
  const [editingProductId, setEditingProductId] = useState<number | null>(null);
  const [productEditForm, setProductEditForm] = useState<Partial<StakingProductConfig>>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProduct, setNewProduct] = useState({ title: '', duration: '30', apy: '1.00', apyMax: '', type: 'fixed' as 'fixed' | 'flexible', minAmount: '100', maxAmount: '100000', maxParticipants: '', requiresApproval: false });

  const getAuthHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' };
  };

  const fetchProducts = async () => {
    try {
      setProductsLoading(true);
      const headers = await getAuthHeaders();
      const response = await fetch('/api/admin/staking-products', { headers });
      if (response.ok) setProducts(await response.json());
    } catch { /* ignore */ } finally { setProductsLoading(false); }
  };

  useEffect(() => { fetchProducts(); }, []);

  const handleProductToggle = async (id: number) => {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/admin/staking-products/${id}/toggle`, { method: 'PUT', headers });
      if (response.ok) {
        const updated = await response.json();
        setProducts(prev => prev.map(p => p.id === id ? updated : p));
        toast({ title: 'Success', description: `Product ${updated.is_enabled ? 'enabled' : 'disabled'}` });
      }
    } catch { toast({ title: 'Error', description: 'Failed to toggle product', variant: 'destructive' }); }
  };

  const handleProductDelete = async (id: number, title: string) => {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/admin/staking-products/${id}`, { method: 'DELETE', headers });
      if (response.ok) {
        setProducts(prev => prev.filter(p => p.id !== id));
        toast({ title: 'Deleted', description: `${title} removed` });
      }
    } catch { toast({ title: 'Error', description: 'Failed to delete product', variant: 'destructive' }); }
  };

  const handleProductAdd = async () => {
    if (!newProduct.title.trim()) { toast({ title: 'Error', description: 'Enter a product title', variant: 'destructive' }); return; }
    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/admin/staking-products', {
        method: 'POST', headers,
        body: JSON.stringify({
          title: newProduct.title,
          duration: parseInt(newProduct.duration),
          apy: newProduct.apy,
          apyMax: newProduct.apyMax.trim() ? newProduct.apyMax : null,
          type: newProduct.type,
          minAmount: newProduct.minAmount,
          maxAmount: newProduct.maxAmount,
          maxParticipants: newProduct.maxParticipants.trim() ? parseInt(newProduct.maxParticipants) : null,
          requiresApproval: newProduct.requiresApproval,
          sortOrder: products.length + 1,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        setProducts(prev => [...prev, data]);
        setShowAddForm(false);
        setNewProduct({ title: '', duration: '30', apy: '1.00', apyMax: '', type: 'fixed', minAmount: '100', maxAmount: '100000', maxParticipants: '', requiresApproval: false });
        toast({ title: 'Success', description: `${data.title} added` });
      } else {
        const err = await response.json();
        toast({ title: 'Error', description: err.message || 'Failed to add product', variant: 'destructive' });
      }
    } catch { toast({ title: 'Error', description: 'Failed to add product', variant: 'destructive' }); }
  };

  const startProductEdit = (product: StakingProductConfig) => {
    setEditingProductId(product.id);
    setProductEditForm({
      title: product.title,
      duration: product.duration,
      apy: product.apy,
      apyMax: product.apyMax ?? null,
      type: product.type,
      min_amount: product.min_amount,
      max_amount: product.max_amount,
      maxParticipants: product.maxParticipants ?? null,
      requiresApproval: product.requiresApproval ?? false,
      sort_order: product.sort_order,
    });
  };

  const handleProductSaveEdit = async () => {
    if (!editingProductId) return;
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/admin/staking-products/${editingProductId}`, {
        method: 'PUT', headers,
        body: JSON.stringify({
          title: productEditForm.title,
          duration: productEditForm.duration,
          apy: productEditForm.apy,
          apyMax: productEditForm.apyMax === '' || productEditForm.apyMax == null ? null : productEditForm.apyMax,
          type: productEditForm.type,
          minAmount: productEditForm.min_amount,
          maxAmount: productEditForm.max_amount,
          maxParticipants: productEditForm.maxParticipants == null ? null : productEditForm.maxParticipants,
          requiresApproval: productEditForm.requiresApproval ?? false,
          sortOrder: productEditForm.sort_order,
        }),
      });
      if (response.ok) {
        const updated = await response.json();
        setProducts(prev => prev.map(p => p.id === editingProductId ? updated : p));
        setEditingProductId(null);
        toast({ title: 'Saved', description: 'Product settings updated' });
      }
    } catch { toast({ title: 'Error', description: 'Failed to update product', variant: 'destructive' }); }
  };

  const handleProductSeed = async () => {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/admin/staking-products/seed', { method: 'POST', headers });
      if (response.ok) { const result = await response.json(); toast({ title: 'Success', description: result.message }); fetchProducts(); }
    } catch { toast({ title: 'Error', description: 'Failed to seed products', variant: 'destructive' }); }
  };

  const filteredProducts = products.filter(p => p.title.toLowerCase().includes(productSearch.toLowerCase()) || p.duration.toString().includes(productSearch));
  const enabledProductCount = products.filter(p => p.is_enabled).length;

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

  // ─── Render ─────────────────────────────────

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-3 flex-wrap">
              <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0">
                <Coins size={20} className="text-primary" />
              </div>
              <span className="min-w-0">Staking Management</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Monitor and manage all staking positions</p>
          </div>
          <Button
            onClick={() => refetchPositions()}
            variant="outline"
            size="sm"
            className="bg-card border-border text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <RefreshCw size={14} className="mr-2" /> Refresh
          </Button>
        </div>

        {/* Stats Grid */}
        {!statsLoading && stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
            <StatCard icon={Activity} label="Active Positions" value={stats.activePositions} color="success" />
            <StatCard icon={CheckCircle} label="Completed" value={stats.completedPositions} color="info" />
            <StatCard icon={DollarSign} label="Total Active Staked" value={`$${fmt(stats.totalActiveStaked)}`} color="primary" />
            <StatCard icon={TrendingUp} label="Rewards Paid" value={`$${fmt(stats.estimatedRewardsPaid)}`} color="warning" />
            <StatCard icon={Users} label="Active Stakers" value={stats.activeStakers} color="info" />
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
        <Tabs value={tab} onValueChange={(newTab) => { setTab(newTab); setStatusFilter("all"); }} className="w-full">
          <TabsList className="bg-card border border-border h-10 p-1 w-full md:w-auto">
            <TabsTrigger value="overview" className="data-[state=active]:bg-primary/15 data-[state=active]:text-primary text-xs md:text-sm">
              <BarChart3 size={14} className="mr-1.5" /> All Positions
            </TabsTrigger>
            <TabsTrigger value="active" className="data-[state=active]:bg-success/15 data-[state=active]:text-success text-xs md:text-sm">
              <Activity size={14} className="mr-1.5" /> Active
            </TabsTrigger>
            <TabsTrigger value="pending" className="data-[state=active]:bg-warning/15 data-[state=active]:text-warning text-xs md:text-sm">
              <Clock size={14} className="mr-1.5" /> Pending Approval
            </TabsTrigger>
            <TabsTrigger value="completed" className="data-[state=active]:bg-info/15 data-[state=active]:text-info text-xs md:text-sm">
              <CheckCircle size={14} className="mr-1.5" /> Completed
            </TabsTrigger>
            <TabsTrigger value="products" className="data-[state=active]:bg-warning/15 data-[state=active]:text-warning text-xs md:text-sm">
              <Settings2 size={14} className="mr-1.5" /> Products
            </TabsTrigger>
          </TabsList>

          {/* All / Active / Pending / Completed → same positions list with filter */}
          {["overview", "active", "pending", "completed"].map((tabKey) => (
            <TabsContent key={tabKey} value={tabKey} className="mt-4 space-y-4">
              {/* Filter bar */}
              <div className="flex flex-col md:flex-row gap-3">
                <div className="relative flex-1">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, email, ID..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10 bg-card border-border text-foreground h-10"
                  />
                </div>
                {tabKey === "overview" && (
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                    className="h-10 px-3 bg-card border border-border rounded-lg text-sm text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
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
                  : tabKey === "pending"
                  ? filteredPositions.filter((p) => p.status === "pending_approval")
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
              />
            </TabsContent>
          ))}

          {/* Products Tab */}
          <TabsContent value="products" className="mt-4 space-y-4">
            {/* Actions */}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={fetchProducts} className="border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground">
                <RefreshCw size={14} className={productsLoading ? 'animate-spin' : ''} />
              </Button>
              <Button variant="outline" size="sm" onClick={handleProductSeed} className="border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground">
                Seed Defaults
              </Button>
              <Button size="sm" onClick={() => setShowAddForm(!showAddForm)}>
                <Plus size={14} className="mr-1" /> Add Product
              </Button>
            </div>

            {/* Product Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-card border border-border rounded-xl p-3">
                <div className="text-xs text-muted-foreground">Total Products</div>
                <div className="text-lg font-bold text-foreground tabular-nums">{products.length}</div>
              </div>
              <div className="bg-card border border-border rounded-xl p-3">
                <div className="text-xs text-muted-foreground">Enabled</div>
                <div className="text-lg font-bold text-success tabular-nums">{enabledProductCount}</div>
              </div>
              <div className="bg-card border border-border rounded-xl p-3">
                <div className="text-xs text-muted-foreground">Max APY</div>
                <div className="text-lg font-bold text-warning tabular-nums">{products.length > 0 ? Math.max(...products.filter(p => p.is_enabled).map(p => parseFloat(p.apy) || 0)).toFixed(2) : '0.00'}%</div>
              </div>
              <div className="bg-card border border-border rounded-xl p-3">
                <div className="text-xs text-muted-foreground">Min Stake</div>
                <div className="text-lg font-bold text-info tabular-nums">${products.length > 0 ? Math.min(...products.filter(p => p.is_enabled).map(p => parseFloat(p.min_amount) || 0)).toLocaleString() : '0'}</div>
              </div>
            </div>

            {/* Add Product Form */}
            {showAddForm && (
              <div className="bg-card border border-primary/30 rounded-xl p-4 space-y-4">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Plus size={16} className="text-primary" /> Add New Staking Product
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase mb-1 block">Title</label>
                    <Input value={newProduct.title} onChange={(e) => setNewProduct({ ...newProduct, title: e.target.value })} placeholder="e.g. 30 Days" className="h-9 bg-background border-border text-foreground text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase mb-1 block">Type</label>
                    <select
                      value={newProduct.type}
                      onChange={(e) => setNewProduct({ ...newProduct, type: e.target.value as 'fixed' | 'flexible' })}
                      className="h-9 w-full px-2 bg-background border border-border rounded-md text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="fixed">Fixed</option>
                      <option value="flexible">Flexible</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase mb-1 block">Duration (Days)</label>
                    <Input type="number" min="1" value={newProduct.duration} onChange={(e) => setNewProduct({ ...newProduct, duration: e.target.value })} disabled={newProduct.type === 'flexible'} className="h-9 bg-background border-border text-foreground text-xs tabular-nums disabled:opacity-50" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase mb-1 block">APY (%)</label>
                    <Input type="number" step="0.01" min="0" value={newProduct.apy} onChange={(e) => setNewProduct({ ...newProduct, apy: e.target.value })} className="h-9 bg-background border-border text-foreground text-xs tabular-nums" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase mb-1 block">Min Amount</label>
                    <Input type="number" step="any" value={newProduct.minAmount} onChange={(e) => setNewProduct({ ...newProduct, minAmount: e.target.value })} className="h-9 bg-background border-border text-foreground text-xs tabular-nums" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase mb-1 block">Max Amount</label>
                    <Input type="number" step="any" value={newProduct.maxAmount} onChange={(e) => setNewProduct({ ...newProduct, maxAmount: e.target.value })} className="h-9 bg-background border-border text-foreground text-xs tabular-nums" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase mb-1 block">Max APY (optional)</label>
                    <Input type="number" step="0.01" min="0" value={newProduct.apyMax} onChange={(e) => setNewProduct({ ...newProduct, apyMax: e.target.value })} placeholder="Blank = fixed rate" className="h-9 bg-background border-border text-foreground text-xs tabular-nums" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase mb-1 block">Max Participants (optional)</label>
                    <Input type="number" min="1" value={newProduct.maxParticipants} onChange={(e) => setNewProduct({ ...newProduct, maxParticipants: e.target.value })} placeholder="Unlimited" className="h-9 bg-background border-border text-foreground text-xs tabular-nums" />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={newProduct.requiresApproval}
                    onChange={(e) => setNewProduct({ ...newProduct, requiresApproval: e.target.checked })}
                    className="h-4 w-4 rounded border-border accent-primary"
                  />
                  Requires admin approval (Book instead of instant Stake)
                </label>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={() => setShowAddForm(false)} className="border-border bg-background text-muted-foreground">Cancel</Button>
                  <Button size="sm" onClick={handleProductAdd}><Plus size={14} className="mr-1" /> Add Product</Button>
                </div>
              </div>
            )}

            {/* Search */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search products..." value={productSearch} onChange={(e) => setProductSearch(e.target.value)} className="pl-9 h-9 bg-card border-border text-foreground text-sm" />
            </div>

            {/* Products Table */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              {productsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw size={20} className="animate-spin text-muted-foreground" />
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="text-center py-12">
                  <Coins size={32} className="mx-auto mb-3 text-muted-foreground/60" />
                  <p className="text-muted-foreground text-sm">No staking products found</p>
                  <p className="text-muted-foreground/70 text-xs mt-1">Click "Seed Defaults" to add default products</p>
                </div>
              ) : (
                <>
                  {/* Desktop Table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="text-xs text-muted-foreground uppercase border-b border-border bg-muted/40">
                          <th className="text-left py-3 px-4">Product</th>
                          <th className="text-center py-3 px-3">Type</th>
                          <th className="text-center py-3 px-3">Duration</th>
                          <th className="text-center py-3 px-3">APY</th>
                          <th className="text-center py-3 px-3">Status</th>
                          <th className="text-right py-3 px-3">Min Amount</th>
                          <th className="text-right py-3 px-3">Max Amount</th>
                          <th className="text-center py-3 px-3">Order</th>
                          <th className="text-center py-3 px-4">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredProducts.map((product) => (
                          <tr key={product.id} className={`border-b border-border hover:bg-muted/50 transition-colors ${!product.is_enabled ? 'opacity-50' : ''}`}>
                            <td className="py-3 px-4">
                              {editingProductId === product.id ? (
                                <div className="space-y-1.5">
                                  <Input value={productEditForm.title || ''} onChange={(e) => setProductEditForm({ ...productEditForm, title: e.target.value })} className="h-7 bg-background border-border text-foreground text-xs w-36" placeholder="Title" />
                                  <Input
                                    type="number"
                                    min="1"
                                    value={productEditForm.maxParticipants ?? ''}
                                    onChange={(e) => setProductEditForm({ ...productEditForm, maxParticipants: e.target.value === '' ? null : (parseInt(e.target.value) || 0) })}
                                    placeholder="Max participants"
                                    className="h-7 bg-background border-border text-foreground text-xs w-36 tabular-nums"
                                  />
                                  <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                    <input
                                      type="checkbox"
                                      checked={!!productEditForm.requiresApproval}
                                      onChange={(e) => setProductEditForm({ ...productEditForm, requiresApproval: e.target.checked })}
                                      className="h-3.5 w-3.5 rounded border-border accent-primary"
                                    />
                                    Requires Approval
                                  </label>
                                </div>
                              ) : (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-semibold text-foreground text-sm">{product.title}</span>
                                    {product.requiresApproval && (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-warning/15 text-warning">Approval Required</span>
                                    )}
                                  </div>
                                  {product.maxParticipants != null && (
                                    <span className="block text-[10px] text-muted-foreground tabular-nums">{product.participantCount ?? 0}/{product.maxParticipants} participants</span>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="text-center py-3 px-3">
                              {editingProductId === product.id ? (
                                <select
                                  value={productEditForm.type || 'fixed'}
                                  onChange={(e) => setProductEditForm({ ...productEditForm, type: e.target.value as 'fixed' | 'flexible' })}
                                  className="h-7 px-1.5 bg-background border border-border rounded-md text-foreground text-xs mx-auto focus:outline-none focus:ring-1 focus:ring-ring"
                                >
                                  <option value="fixed">Fixed</option>
                                  <option value="flexible">Flexible</option>
                                </select>
                              ) : (
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${product.type === 'flexible' ? 'bg-info/15 text-info' : 'bg-primary/15 text-primary'}`}>
                                  {product.type === 'flexible' ? <Zap size={9} /> : <Lock size={9} />}
                                  {product.type === 'flexible' ? 'Flexible' : 'Fixed'}
                                </span>
                              )}
                            </td>
                            <td className="text-center py-3 px-3">
                              {editingProductId === product.id ? (
                                <Input type="number" min="1" value={productEditForm.duration || ''} onChange={(e) => setProductEditForm({ ...productEditForm, duration: parseInt(e.target.value) || 0 })} disabled={productEditForm.type === 'flexible'} className="h-7 bg-background border-border text-foreground text-xs w-20 mx-auto tabular-nums disabled:opacity-50" />
                              ) : (
                                <span className="text-sm text-muted-foreground tabular-nums">{product.type === 'flexible' ? 'None' : `${product.duration} days`}</span>
                              )}
                            </td>
                            <td className="text-center py-3 px-3">
                              {editingProductId === product.id ? (
                                <div className="flex items-center gap-1 justify-center">
                                  <Input type="number" step="0.01" value={productEditForm.apy || ''} onChange={(e) => setProductEditForm({ ...productEditForm, apy: e.target.value })} placeholder="APY" className="h-7 bg-background border-border text-foreground text-xs w-16 tabular-nums" />
                                  <span className="text-muted-foreground text-xs">–</span>
                                  <Input type="number" step="0.01" min="0" value={productEditForm.apyMax ?? ''} onChange={(e) => setProductEditForm({ ...productEditForm, apyMax: e.target.value === '' ? null : e.target.value })} placeholder="Max" className="h-7 bg-background border-border text-foreground text-xs w-16 tabular-nums" />
                                </div>
                              ) : (
                                <span className="text-sm font-medium text-warning tabular-nums">
                                  {parseFloat(product.apy).toFixed(2)}%{product.apyMax ? `–${parseFloat(product.apyMax).toFixed(2)}%` : ''}
                                </span>
                              )}
                            </td>
                            <td className="text-center py-3 px-3">
                              <button onClick={() => handleProductToggle(product.id)} className="inline-flex items-center">
                                {product.is_enabled ? <ToggleRight size={22} className="text-success" /> : <ToggleLeft size={22} className="text-muted-foreground" />}
                              </button>
                            </td>
                            <td className="text-right py-3 px-3">
                              {editingProductId === product.id ? (
                                <Input type="number" step="any" value={productEditForm.min_amount || ''} onChange={(e) => setProductEditForm({ ...productEditForm, min_amount: e.target.value })} className="h-7 bg-background border-border text-foreground text-xs w-28 ml-auto tabular-nums" />
                              ) : (
                                <span className="text-sm text-muted-foreground tabular-nums">${parseFloat(product.min_amount).toLocaleString()}</span>
                              )}
                            </td>
                            <td className="text-right py-3 px-3">
                              {editingProductId === product.id ? (
                                <Input type="number" step="any" value={productEditForm.max_amount || ''} onChange={(e) => setProductEditForm({ ...productEditForm, max_amount: e.target.value })} className="h-7 bg-background border-border text-foreground text-xs w-28 ml-auto tabular-nums" />
                              ) : (
                                <span className="text-sm text-muted-foreground tabular-nums">${parseFloat(product.max_amount).toLocaleString()}</span>
                              )}
                            </td>
                            <td className="text-center py-3 px-3">
                              {editingProductId === product.id ? (
                                <Input type="number" step="1" value={productEditForm.sort_order || 0} onChange={(e) => setProductEditForm({ ...productEditForm, sort_order: parseInt(e.target.value) || 0 })} className="h-7 bg-background border-border text-foreground text-xs w-14 mx-auto tabular-nums" />
                              ) : (
                                <span className="text-xs text-muted-foreground tabular-nums">{product.sort_order}</span>
                              )}
                            </td>
                            <td className="text-center py-3 px-4">
                              <div className="flex items-center justify-center gap-1.5">
                                {editingProductId === product.id ? (
                                  <>
                                    <button onClick={handleProductSaveEdit} className="p-1.5 rounded-lg bg-success/10 text-success hover:bg-success/20"><Save size={14} /></button>
                                    <button onClick={() => setEditingProductId(null)} className="p-1.5 rounded-lg bg-muted text-muted-foreground hover:bg-muted/70"><X size={14} /></button>
                                  </>
                                ) : (
                                  <>
                                    <button onClick={() => startProductEdit(product)} className="p-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20"><Edit2 size={14} /></button>
                                    <button onClick={() => handleProductDelete(product.id, product.title)} className="p-1.5 rounded-lg bg-danger/10 text-danger hover:bg-danger/20"><Trash2 size={14} /></button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile List */}
                  <div className="block md:hidden divide-y divide-border">
                    {filteredProducts.map((product) => (
                      <div key={product.id} className={`p-4 ${!product.is_enabled ? 'opacity-50' : ''}`}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Coins size={16} className="text-warning" />
                            <span className="font-bold text-foreground">{product.title}</span>
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${product.type === 'flexible' ? 'bg-info/15 text-info' : 'bg-primary/15 text-primary'}`}>
                              {product.type === 'flexible' ? <Zap size={9} /> : <Lock size={9} />}
                              {product.type === 'flexible' ? 'Flexible' : 'Fixed'}
                            </span>
                            <span className="text-xs px-1.5 py-0.5 rounded-full bg-warning/10 text-warning tabular-nums">
                              {parseFloat(product.apy).toFixed(2)}{product.apyMax ? `–${parseFloat(product.apyMax).toFixed(2)}` : ''}% APY
                            </span>
                            {product.requiresApproval && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-warning/15 text-warning">Approval Required</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={() => handleProductToggle(product.id)}>
                              {product.is_enabled ? <ToggleRight size={20} className="text-success" /> : <ToggleLeft size={20} className="text-muted-foreground" />}
                            </button>
                            <button onClick={() => startProductEdit(product)} className="p-1 rounded text-primary hover:bg-primary/10"><Edit2 size={14} /></button>
                            <button onClick={() => handleProductDelete(product.id, product.title)} className="p-1 rounded text-danger hover:bg-danger/10"><Trash2 size={14} /></button>
                          </div>
                        </div>
                        <div className="flex gap-4 text-xs text-muted-foreground tabular-nums flex-wrap">
                          <span>{product.type === 'flexible' ? 'No lock-up' : `${product.duration} days`}</span>
                          <span>Min: ${parseFloat(product.min_amount).toLocaleString()}</span>
                          <span>Max: ${parseFloat(product.max_amount).toLocaleString()}</span>
                          {product.maxParticipants != null && (
                            <span>{product.participantCount ?? 0}/{product.maxParticipants} participants</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
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
    success: "bg-success/10 text-success",
    info: "bg-info/10 text-info",
    primary: "bg-primary/10 text-primary",
    warning: "bg-warning/10 text-warning",
    danger: "bg-danger/10 text-danger",
  };

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${colors[color] || colors.info}`}>
            <Icon size={18} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-lg font-bold text-foreground tabular-nums">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-card border border-border rounded-xl px-4 py-3">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-sm font-semibold text-foreground mt-0.5 tabular-nums">{value}</p>
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
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw size={20} className="text-muted-foreground animate-spin" />
      </div>
    );
  }

  if (positions.length === 0) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
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
        const isPendingApproval = p.status === "pending_approval";
        const stakeAmount = parseFloat(p.amount);
        const apy = parseFloat(p.apy);
        const estimatedReward = stakeAmount * (apy / 100) * (p.duration / 365);

        return (
          <Card key={p.id} className={`bg-card border-border hover:border-primary/30 transition-colors ${isExpanded ? "ring-1 ring-primary/30" : ""}`}>
            <CardContent className="p-0">
              {/* Main Row */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : p.id)}
                className="w-full flex items-center gap-3 p-4 text-left"
              >
                {/* Status indicator */}
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? "bg-success" : isPendingApproval ? "bg-warning" : "bg-muted-foreground"}`} />

                {/* User Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground truncate">
                      {p.user?.full_name || p.user?.email || p.userId.slice(0, 12) + "..."}
                    </p>
                    <Badge variant="outline" className={`text-[10px] px-1.5 ${isActive ? "border-success/30 text-success bg-success/5" : isPendingApproval ? "border-warning/30 text-warning bg-warning/5" : "border-border text-muted-foreground bg-muted/50"}`}>
                      {isPendingApproval ? "Pending Approval" : p.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {p.user?.email || p.userId}
                    {p.user?.display_id ? ` • #${p.user.display_id}` : ""}
                  </p>
                </div>

                {/* Amount */}
                <div className="text-right flex-shrink-0 hidden sm:block">
                  <p className="text-sm font-bold text-foreground tabular-nums">${fmt(stakeAmount)}</p>
                  <p className="text-[10px] text-muted-foreground">USDT</p>
                </div>

                {/* APY */}
                <div className="text-right flex-shrink-0 hidden md:block">
                  <p className="text-sm font-semibold text-success tabular-nums">{p.apy}%</p>
                  <p className="text-[10px] text-muted-foreground">APY</p>
                </div>

                {/* Duration / Days Left */}
                <div className="text-right flex-shrink-0 hidden lg:block">
                  <p className="text-sm text-foreground tabular-nums">{isActive ? `${days}d left` : `${p.duration}d`}</p>
                  <p className="text-[10px] text-muted-foreground">{p.duration}d total</p>
                </div>

                {/* Expand icon */}
                {isExpanded ? <ChevronUp size={16} className="text-muted-foreground flex-shrink-0" /> : <ChevronDown size={16} className="text-muted-foreground flex-shrink-0" />}
              </button>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="border-t border-border p-4 space-y-4">
                  {/* Info grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-muted/40 rounded-lg p-3">
                      <p className="text-[10px] text-muted-foreground uppercase">Position ID</p>
                      <p className="text-sm font-semibold text-foreground mt-0.5">#{p.id}</p>
                    </div>
                    <div className="bg-muted/40 rounded-lg p-3">
                      <p className="text-[10px] text-muted-foreground uppercase">Amount</p>
                      <p className="text-sm font-semibold text-foreground mt-0.5 tabular-nums">${fmt(stakeAmount)}</p>
                    </div>
                    <div className="bg-muted/40 rounded-lg p-3">
                      <p className="text-[10px] text-muted-foreground uppercase">APY</p>
                      <p className="text-sm font-semibold text-success mt-0.5 tabular-nums">{p.apy}%</p>
                    </div>
                    <div className="bg-muted/40 rounded-lg p-3">
                      <p className="text-[10px] text-muted-foreground uppercase">Est. Reward</p>
                      <p className="text-sm font-semibold text-warning mt-0.5 tabular-nums">${fmt(estimatedReward)}</p>
                    </div>
                  </div>

                  {/* Dates */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div className="bg-muted/40 rounded-lg p-3">
                      <p className="text-[10px] text-muted-foreground uppercase">Start Date</p>
                      <p className="text-xs text-foreground mt-0.5">{formatDateTime(p.startDate)}</p>
                    </div>
                    <div className="bg-muted/40 rounded-lg p-3">
                      <p className="text-[10px] text-muted-foreground uppercase">End Date</p>
                      <p className="text-xs text-foreground mt-0.5">{formatDateTime(p.endDate)}</p>
                    </div>
                    <div className="bg-muted/40 rounded-lg p-3">
                      <p className="text-[10px] text-muted-foreground uppercase">Duration</p>
                      <p className="text-xs text-foreground mt-0.5">{p.duration} days</p>
                    </div>
                  </div>

                  {/* Progress bar for active */}
                  {isActive && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-muted-foreground">Progress</span>
                        <span className="text-[10px] text-muted-foreground tabular-nums">{progress}%</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
                    {isPendingApproval && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onStatusChange(p.id, "active")}
                        className="h-7 text-xs bg-warning/10 border-warning/30 text-warning hover:bg-warning/20"
                      >
                        <CheckCircle size={12} className="mr-1" /> Approve
                      </Button>
                    )}

                    {isActive && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onStatusChange(p.id, "completed")}
                          className="h-7 text-xs bg-success/10 border-success/30 text-success hover:bg-success/20"
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
                            className="w-20 h-7 text-xs bg-card border-border text-foreground"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onExtend(p.id)}
                            disabled={!extendDays[p.id] || parseInt(extendDays[p.id]) <= 0}
                            className="h-7 text-xs bg-info/10 border-info/30 text-info hover:bg-info/20"
                          >
                            <Timer size={12} className="mr-1" /> Extend
                          </Button>
                        </div>
                      </>
                    )}

                    {p.status === "completed" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onStatusChange(p.id, "active")}
                        className="h-7 text-xs bg-warning/10 border-warning/30 text-warning hover:bg-warning/20"
                      >
                        <Activity size={12} className="mr-1" /> Reactivate
                      </Button>
                    )}

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDelete(p.id)}
                      className="h-7 text-xs text-danger hover:text-danger hover:bg-danger/10 ml-auto"
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
