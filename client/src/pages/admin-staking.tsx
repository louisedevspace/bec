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
  Plus, ToggleLeft, ToggleRight, Edit2, Save, X, Settings2
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

interface StakingProductConfig {
  id: number;
  title: string;
  duration: number;
  apy: string;
  min_amount: string;
  max_amount: string;
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
  const [newProduct, setNewProduct] = useState({ title: '', duration: '30', apy: '1.00', minAmount: '100', maxAmount: '100000' });

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
        body: JSON.stringify({ title: newProduct.title, duration: parseInt(newProduct.duration), apy: newProduct.apy, minAmount: newProduct.minAmount, maxAmount: newProduct.maxAmount, sortOrder: products.length + 1 }),
      });
      if (response.ok) {
        const data = await response.json();
        setProducts(prev => [...prev, data]);
        setShowAddForm(false);
        setNewProduct({ title: '', duration: '30', apy: '1.00', minAmount: '100', maxAmount: '100000' });
        toast({ title: 'Success', description: `${data.title} added` });
      } else {
        const err = await response.json();
        toast({ title: 'Error', description: err.message || 'Failed to add product', variant: 'destructive' });
      }
    } catch { toast({ title: 'Error', description: 'Failed to add product', variant: 'destructive' }); }
  };

  const startProductEdit = (product: StakingProductConfig) => {
    setEditingProductId(product.id);
    setProductEditForm({ title: product.title, duration: product.duration, apy: product.apy, min_amount: product.min_amount, max_amount: product.max_amount, sort_order: product.sort_order });
  };

  const handleProductSaveEdit = async () => {
    if (!editingProductId) return;
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/admin/staking-products/${editingProductId}`, {
        method: 'PUT', headers,
        body: JSON.stringify({ title: productEditForm.title, duration: productEditForm.duration, apy: productEditForm.apy, minAmount: productEditForm.min_amount, maxAmount: productEditForm.max_amount, sortOrder: productEditForm.sort_order }),
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
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-white flex items-center gap-3 flex-wrap">
              <div className="w-10 h-10 bg-purple-500/10 rounded-xl flex items-center justify-center flex-shrink-0">
                <Coins size={22} className="text-purple-400 fill-current" />
              </div>
              <span className="min-w-0">Staking Management</span>
            </h1>
            <p className="text-sm text-gray-500 mt-1">Monitor and manage all staking positions</p>
          </div>
          <Button
            onClick={() => refetchPositions()}
            variant="outline"
            size="sm"
            className="bg-[#1a1a1a] border-[#2a2a2a] text-gray-300 hover:bg-[#222] hover:text-white"
          >
            <RefreshCw size={14} className="mr-2 fill-current" /> Refresh
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
        <Tabs value={tab} onValueChange={(newTab) => { setTab(newTab); setStatusFilter("all"); }} className="w-full">
          <TabsList className="bg-[#111] border border-[#1e1e1e] h-10 p-1 w-full md:w-auto">
            <TabsTrigger value="overview" className="data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-400 text-xs md:text-sm">
              <BarChart3 size={14} className="mr-1.5 fill-current" /> All Positions
            </TabsTrigger>
            <TabsTrigger value="active" className="data-[state=active]:bg-green-500/20 data-[state=active]:text-green-400 text-xs md:text-sm">
              <Activity size={14} className="mr-1.5 fill-current" /> Active
            </TabsTrigger>
            <TabsTrigger value="completed" className="data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-400 text-xs md:text-sm">
              <CheckCircle size={14} className="mr-1.5 fill-current" /> Completed
            </TabsTrigger>
            <TabsTrigger value="products" className="data-[state=active]:bg-yellow-500/20 data-[state=active]:text-yellow-400 text-xs md:text-sm">
              <Settings2 size={14} className="mr-1.5 fill-current" /> Products
            </TabsTrigger>
          </TabsList>

          {/* All / Active / Completed → same positions list with filter */}
          {["overview", "active", "completed"].map((tabKey) => (
            <TabsContent key={tabKey} value={tabKey} className="mt-4 space-y-4">
              {/* Filter bar */}
              <div className="flex flex-col md:flex-row gap-3">
                <div className="relative flex-1">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 fill-current" />
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
              />
            </TabsContent>
          ))}

          {/* Products Tab */}
          <TabsContent value="products" className="mt-4 space-y-4">
            {/* Actions */}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={fetchProducts} className="border-[#2a2a2a] bg-[#111] text-gray-300 hover:bg-[#1a1a1a]">
                <RefreshCw size={14} className={`${productsLoading ? 'animate-spin' : ''} fill-current`} />
              </Button>
              <Button variant="outline" size="sm" onClick={handleProductSeed} className="border-[#2a2a2a] bg-[#111] text-gray-300 hover:bg-[#1a1a1a]">
                Seed Defaults
              </Button>
              <Button size="sm" onClick={() => setShowAddForm(!showAddForm)} className="bg-blue-600 hover:bg-blue-700">
                <Plus size={14} className="mr-1 fill-current" /> Add Product
              </Button>
            </div>

            {/* Product Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-3">
                <div className="text-xs text-gray-500">Total Products</div>
                <div className="text-lg font-bold text-white">{products.length}</div>
              </div>
              <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-3">
                <div className="text-xs text-gray-500">Enabled</div>
                <div className="text-lg font-bold text-green-400">{enabledProductCount}</div>
              </div>
              <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-3">
                <div className="text-xs text-gray-500">Max APY</div>
                <div className="text-lg font-bold text-yellow-400">{products.length > 0 ? Math.max(...products.filter(p => p.is_enabled).map(p => parseFloat(p.apy) || 0)).toFixed(2) : '0.00'}%</div>
              </div>
              <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-3">
                <div className="text-xs text-gray-500">Min Stake</div>
                <div className="text-lg font-bold text-blue-400">${products.length > 0 ? Math.min(...products.filter(p => p.is_enabled).map(p => parseFloat(p.min_amount) || 0)).toLocaleString() : '0'}</div>
              </div>
            </div>

            {/* Add Product Form */}
            {showAddForm && (
              <div className="bg-[#111] border border-blue-500/30 rounded-xl p-4 space-y-4">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Plus size={16} className="text-blue-400 fill-current" /> Add New Staking Product
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                  <div>
                    <label className="text-[10px] text-gray-500 uppercase mb-1 block">Title</label>
                    <Input value={newProduct.title} onChange={(e) => setNewProduct({ ...newProduct, title: e.target.value })} placeholder="e.g. 30 Days" className="h-9 bg-[#0a0a0a] border-[#2a2a2a] text-white text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 uppercase mb-1 block">Duration (Days)</label>
                    <Input type="number" min="1" value={newProduct.duration} onChange={(e) => setNewProduct({ ...newProduct, duration: e.target.value })} className="h-9 bg-[#0a0a0a] border-[#2a2a2a] text-white text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 uppercase mb-1 block">APY (%)</label>
                    <Input type="number" step="0.01" min="0" value={newProduct.apy} onChange={(e) => setNewProduct({ ...newProduct, apy: e.target.value })} className="h-9 bg-[#0a0a0a] border-[#2a2a2a] text-white text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 uppercase mb-1 block">Min Amount</label>
                    <Input type="number" step="any" value={newProduct.minAmount} onChange={(e) => setNewProduct({ ...newProduct, minAmount: e.target.value })} className="h-9 bg-[#0a0a0a] border-[#2a2a2a] text-white text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 uppercase mb-1 block">Max Amount</label>
                    <Input type="number" step="any" value={newProduct.maxAmount} onChange={(e) => setNewProduct({ ...newProduct, maxAmount: e.target.value })} className="h-9 bg-[#0a0a0a] border-[#2a2a2a] text-white text-xs" />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={() => setShowAddForm(false)} className="border-[#2a2a2a] bg-[#0a0a0a] text-gray-400">Cancel</Button>
                  <Button size="sm" onClick={handleProductAdd} className="bg-blue-600 hover:bg-blue-700"><Plus size={14} className="mr-1 fill-current" /> Add Product</Button>
                </div>
              </div>
            )}

            {/* Search */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 fill-current" />
              <Input placeholder="Search products..." value={productSearch} onChange={(e) => setProductSearch(e.target.value)} className="pl-9 h-9 bg-[#111] border-[#1e1e1e] text-white text-sm" />
            </div>

            {/* Products Table */}
            <div className="bg-[#111] border border-[#1e1e1e] rounded-xl overflow-hidden">
              {productsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw size={20} className="animate-spin text-gray-500 fill-current" />
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="text-center py-12">
                  <Coins size={32} className="mx-auto mb-3 text-gray-600 fill-current" />
                  <p className="text-gray-500 text-sm">No staking products found</p>
                  <p className="text-gray-600 text-xs mt-1">Click "Seed Defaults" to add default products</p>
                </div>
              ) : (
                <>
                  {/* Desktop Table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="text-xs text-gray-500 uppercase border-b border-[#1e1e1e] bg-[#0a0a0a]">
                          <th className="text-left py-3 px-4">Product</th>
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
                          <tr key={product.id} className={`border-b border-[#1e1e1e] hover:bg-[#1a1a1a] transition-colors ${!product.is_enabled ? 'opacity-50' : ''}`}>
                            <td className="py-3 px-4">
                              {editingProductId === product.id ? (
                                <Input value={productEditForm.title || ''} onChange={(e) => setProductEditForm({ ...productEditForm, title: e.target.value })} className="h-7 bg-[#0a0a0a] border-[#2a2a2a] text-white text-xs w-32" />
                              ) : (
                                <span className="font-semibold text-white text-sm">{product.title}</span>
                              )}
                            </td>
                            <td className="text-center py-3 px-3">
                              {editingProductId === product.id ? (
                                <Input type="number" min="1" value={productEditForm.duration || ''} onChange={(e) => setProductEditForm({ ...productEditForm, duration: parseInt(e.target.value) || 0 })} className="h-7 bg-[#0a0a0a] border-[#2a2a2a] text-white text-xs w-20 mx-auto" />
                              ) : (
                                <span className="text-sm text-gray-300">{product.duration} days</span>
                              )}
                            </td>
                            <td className="text-center py-3 px-3">
                              {editingProductId === product.id ? (
                                <Input type="number" step="0.01" value={productEditForm.apy || ''} onChange={(e) => setProductEditForm({ ...productEditForm, apy: e.target.value })} className="h-7 bg-[#0a0a0a] border-[#2a2a2a] text-white text-xs w-20 mx-auto" />
                              ) : (
                                <span className="text-sm font-medium text-yellow-400">{parseFloat(product.apy).toFixed(2)}%</span>
                              )}
                            </td>
                            <td className="text-center py-3 px-3">
                              <button onClick={() => handleProductToggle(product.id)} className="inline-flex items-center">
                                {product.is_enabled ? <ToggleRight size={22} className="text-green-400 fill-current" /> : <ToggleLeft size={22} className="text-gray-500 fill-current" />}
                              </button>
                            </td>
                            <td className="text-right py-3 px-3">
                              {editingProductId === product.id ? (
                                <Input type="number" step="any" value={productEditForm.min_amount || ''} onChange={(e) => setProductEditForm({ ...productEditForm, min_amount: e.target.value })} className="h-7 bg-[#0a0a0a] border-[#2a2a2a] text-white text-xs w-28 ml-auto" />
                              ) : (
                                <span className="text-sm text-gray-300 tabular-nums">${parseFloat(product.min_amount).toLocaleString()}</span>
                              )}
                            </td>
                            <td className="text-right py-3 px-3">
                              {editingProductId === product.id ? (
                                <Input type="number" step="any" value={productEditForm.max_amount || ''} onChange={(e) => setProductEditForm({ ...productEditForm, max_amount: e.target.value })} className="h-7 bg-[#0a0a0a] border-[#2a2a2a] text-white text-xs w-28 ml-auto" />
                              ) : (
                                <span className="text-sm text-gray-300 tabular-nums">${parseFloat(product.max_amount).toLocaleString()}</span>
                              )}
                            </td>
                            <td className="text-center py-3 px-3">
                              {editingProductId === product.id ? (
                                <Input type="number" step="1" value={productEditForm.sort_order || 0} onChange={(e) => setProductEditForm({ ...productEditForm, sort_order: parseInt(e.target.value) || 0 })} className="h-7 bg-[#0a0a0a] border-[#2a2a2a] text-white text-xs w-14 mx-auto" />
                              ) : (
                                <span className="text-xs text-gray-500">{product.sort_order}</span>
                              )}
                            </td>
                            <td className="text-center py-3 px-4">
                              <div className="flex items-center justify-center gap-1.5">
                                {editingProductId === product.id ? (
                                  <>
                                    <button onClick={handleProductSaveEdit} className="p-1.5 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20"><Save size={14} className="fill-current" /></button>
                                    <button onClick={() => setEditingProductId(null)} className="p-1.5 rounded-lg bg-gray-500/10 text-gray-400 hover:bg-gray-500/20"><X size={14} className="fill-current" /></button>
                                  </>
                                ) : (
                                  <>
                                    <button onClick={() => startProductEdit(product)} className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20"><Edit2 size={14} className="fill-current" /></button>
                                    <button onClick={() => handleProductDelete(product.id, product.title)} className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20"><Trash2 size={14} className="fill-current" /></button>
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
                  <div className="block md:hidden divide-y divide-[#1e1e1e]">
                    {filteredProducts.map((product) => (
                      <div key={product.id} className={`p-4 ${!product.is_enabled ? 'opacity-50' : ''}`}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Coins size={16} className="text-yellow-400 fill-current" />
                            <span className="font-bold text-white">{product.title}</span>
                            <span className="text-xs px-1.5 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400">{parseFloat(product.apy).toFixed(2)}% APY</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={() => handleProductToggle(product.id)}>
                              {product.is_enabled ? <ToggleRight size={20} className="text-green-400 fill-current" /> : <ToggleLeft size={20} className="text-gray-500 fill-current" />}
                            </button>
                            <button onClick={() => startProductEdit(product)} className="p-1 rounded text-blue-400 hover:bg-blue-500/10"><Edit2 size={14} className="fill-current" /></button>
                            <button onClick={() => handleProductDelete(product.id, product.title)} className="p-1 rounded text-red-400 hover:bg-red-500/10"><Trash2 size={14} className="fill-current" /></button>
                          </div>
                        </div>
                        <div className="flex gap-4 text-xs text-gray-500">
                          <span>{product.duration} days</span>
                          <span>Min: ${parseFloat(product.min_amount).toLocaleString()}</span>
                          <span>Max: ${parseFloat(product.max_amount).toLocaleString()}</span>
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
            <Icon size={18} className="fill-current" />
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
        <RefreshCw size={20} className="text-gray-500 animate-spin fill-current" />
      </div>
    );
  }

  if (positions.length === 0) {
    return (
      <Card className="bg-[#0f0f0f] border-[#1e1e1e]">
        <CardContent className="flex flex-col items-center justify-center py-12 text-gray-500">
          <Coins size={32} className="mb-2 opacity-30 fill-current" />
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
                {isExpanded ? <ChevronUp size={16} className="text-gray-400 flex-shrink-0 fill-current" /> : <ChevronDown size={16} className="text-gray-400 flex-shrink-0 fill-current" />}
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
                          <CheckCircle size={12} className="mr-1 fill-current" /> Complete
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
                            <Timer size={12} className="mr-1 fill-current" /> Extend
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
                        <Activity size={12} className="mr-1 fill-current" /> Reactivate
                      </Button>
                    )}

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDelete(p.id)}
                      className="h-7 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 ml-auto"
                    >
                      <Trash2 size={12} className="mr-1 fill-current" /> Delete
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
