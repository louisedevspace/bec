import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Plus, Trash2, ToggleLeft, ToggleRight, RefreshCw,
  Coins, Search, Edit2, Save, X
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useToast } from '@/hooks/use-toast';
import AdminLayout from './admin-layout';

interface StakingProduct {
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

export default function AdminStakingPairs() {
  const { toast } = useToast();
  const [products, setProducts] = useState<StakingProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<StakingProduct>>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProduct, setNewProduct] = useState({
    title: '',
    duration: '30',
    apy: '1.00',
    minAmount: '100',
    maxAmount: '100000',
  });

  const getAuthHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return {
      'Authorization': `Bearer ${session?.access_token}`,
      'Content-Type': 'application/json',
    };
  };

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const headers = await getAuthHeaders();
      const response = await fetch('/api/admin/staking-products', { headers });
      if (response.ok) {
        const data = await response.json();
        setProducts(data);
      } else {
        toast({ title: 'Error', description: 'Failed to fetch staking products', variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to fetch staking products', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleToggle = async (id: number) => {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/admin/staking-products/${id}/toggle`, {
        method: 'PUT',
        headers,
      });
      if (response.ok) {
        const updated = await response.json();
        setProducts(prev => prev.map(p => p.id === id ? updated : p));
        toast({ title: 'Success', description: `Product ${updated.is_enabled ? 'enabled' : 'disabled'}` });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to toggle product', variant: 'destructive' });
    }
  };

  const handleDelete = async (id: number, title: string) => {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/admin/staking-products/${id}`, {
        method: 'DELETE',
        headers,
      });
      if (response.ok) {
        setProducts(prev => prev.filter(p => p.id !== id));
        toast({ title: 'Deleted', description: `${title} removed` });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to delete product', variant: 'destructive' });
    }
  };

  const handleAdd = async () => {
    if (!newProduct.title.trim()) {
      toast({ title: 'Error', description: 'Enter a product title', variant: 'destructive' });
      return;
    }
    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/admin/staking-products', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: newProduct.title,
          duration: parseInt(newProduct.duration),
          apy: newProduct.apy,
          minAmount: newProduct.minAmount,
          maxAmount: newProduct.maxAmount,
          sortOrder: products.length + 1,
        }),
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
    } catch {
      toast({ title: 'Error', description: 'Failed to add product', variant: 'destructive' });
    }
  };

  const startEdit = (product: StakingProduct) => {
    setEditingId(product.id);
    setEditForm({
      title: product.title,
      duration: product.duration,
      apy: product.apy,
      min_amount: product.min_amount,
      max_amount: product.max_amount,
      sort_order: product.sort_order,
    });
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/admin/staking-products/${editingId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          title: editForm.title,
          duration: editForm.duration,
          apy: editForm.apy,
          minAmount: editForm.min_amount,
          maxAmount: editForm.max_amount,
          sortOrder: editForm.sort_order,
        }),
      });
      if (response.ok) {
        const updated = await response.json();
        setProducts(prev => prev.map(p => p.id === editingId ? updated : p));
        setEditingId(null);
        toast({ title: 'Saved', description: 'Product settings updated' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to update product', variant: 'destructive' });
    }
  };

  const handleSeed = async () => {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/admin/staking-products/seed', {
        method: 'POST',
        headers,
      });
      if (response.ok) {
        const result = await response.json();
        toast({ title: 'Success', description: result.message });
        fetchProducts();
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to seed products', variant: 'destructive' });
    }
  };

  const filteredProducts = products.filter(p =>
    p.title.toLowerCase().includes(search.toLowerCase()) ||
    p.duration.toString().includes(search)
  );

  const enabledCount = products.filter(p => p.is_enabled).length;
  const maxApy = products.length > 0 ? Math.max(...products.filter(p => p.is_enabled).map(p => parseFloat(p.apy) || 0)) : 0;
  const minStake = products.length > 0 ? Math.min(...products.filter(p => p.is_enabled).map(p => parseFloat(p.min_amount) || 0)) : 0;

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
              <Coins size={24} className="text-yellow-400 fill-current" />
              Staking Products
            </h1>
            <p className="text-sm text-gray-500 mt-1">Manage staking duration plans and APY rates</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={fetchProducts} className="border-[#2a2a2a] bg-[#111] text-gray-300 hover:bg-[#1a1a1a]">
            <RefreshCw size={14} className={`${loading ? 'animate-spin' : ''} fill-current`} />
          </Button>
          <Button variant="outline" size="sm" onClick={handleSeed} className="border-[#2a2a2a] bg-[#111] text-gray-300 hover:bg-[#1a1a1a]">
            Seed Defaults
          </Button>
          <Button size="sm" onClick={() => setShowAddForm(!showAddForm)} className="bg-blue-600 hover:bg-blue-700">
            <Plus size={14} className="mr-1 fill-current" /> Add Product
          </Button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-3">
            <div className="text-xs text-gray-500">Total Products</div>
            <div className="text-lg font-bold text-white">{products.length}</div>
          </div>
          <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-3">
            <div className="text-xs text-gray-500">Enabled</div>
            <div className="text-lg font-bold text-green-400">{enabledCount}</div>
          </div>
          <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-3">
            <div className="text-xs text-gray-500">Max APY</div>
            <div className="text-lg font-bold text-yellow-400">{maxApy.toFixed(2)}%</div>
          </div>
          <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-3">
            <div className="text-xs text-gray-500">Min Stake</div>
            <div className="text-lg font-bold text-blue-400">${minStake.toLocaleString()}</div>
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
                <Input
                  value={newProduct.title}
                  onChange={(e) => setNewProduct({ ...newProduct, title: e.target.value })}
                  placeholder="e.g. 30 Days"
                  className="h-9 bg-[#0a0a0a] border-[#2a2a2a] text-white text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 uppercase mb-1 block">Duration (Days)</label>
                <Input
                  type="number" min="1" value={newProduct.duration}
                  onChange={(e) => setNewProduct({ ...newProduct, duration: e.target.value })}
                  className="h-9 bg-[#0a0a0a] border-[#2a2a2a] text-white text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 uppercase mb-1 block">APY (%)</label>
                <Input
                  type="number" step="0.01" min="0" value={newProduct.apy}
                  onChange={(e) => setNewProduct({ ...newProduct, apy: e.target.value })}
                  className="h-9 bg-[#0a0a0a] border-[#2a2a2a] text-white text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 uppercase mb-1 block">Min Amount</label>
                <Input
                  type="number" step="any" value={newProduct.minAmount}
                  onChange={(e) => setNewProduct({ ...newProduct, minAmount: e.target.value })}
                  className="h-9 bg-[#0a0a0a] border-[#2a2a2a] text-white text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 uppercase mb-1 block">Max Amount</label>
                <Input
                  type="number" step="any" value={newProduct.maxAmount}
                  onChange={(e) => setNewProduct({ ...newProduct, maxAmount: e.target.value })}
                  className="h-9 bg-[#0a0a0a] border-[#2a2a2a] text-white text-xs"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowAddForm(false)} className="border-[#2a2a2a] bg-[#0a0a0a] text-gray-400">
                Cancel
              </Button>
              <Button size="sm" onClick={handleAdd} className="bg-blue-600 hover:bg-blue-700">
                <Plus size={14} className="mr-1 fill-current" /> Add Product
              </Button>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 fill-current" />
          <Input
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 bg-[#111] border-[#1e1e1e] text-white text-sm"
          />
        </div>

        {/* Products Table */}
        <div className="bg-[#111] border border-[#1e1e1e] rounded-xl overflow-hidden">
          {loading ? (
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
                          {editingId === product.id ? (
                            <Input value={editForm.title || ''}
                              onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                              className="h-7 bg-[#0a0a0a] border-[#2a2a2a] text-white text-xs w-32"
                            />
                          ) : (
                            <span className="font-semibold text-white text-sm">{product.title}</span>
                          )}
                        </td>
                        <td className="text-center py-3 px-3">
                          {editingId === product.id ? (
                            <Input type="number" min="1" value={editForm.duration || ''}
                              onChange={(e) => setEditForm({ ...editForm, duration: parseInt(e.target.value) || 0 })}
                              className="h-7 bg-[#0a0a0a] border-[#2a2a2a] text-white text-xs w-20 mx-auto"
                            />
                          ) : (
                            <span className="text-sm text-gray-300">{product.duration} days</span>
                          )}
                        </td>
                        <td className="text-center py-3 px-3">
                          {editingId === product.id ? (
                            <Input type="number" step="0.01" value={editForm.apy || ''}
                              onChange={(e) => setEditForm({ ...editForm, apy: e.target.value })}
                              className="h-7 bg-[#0a0a0a] border-[#2a2a2a] text-white text-xs w-20 mx-auto"
                            />
                          ) : (
                            <span className="text-sm font-medium text-yellow-400">{parseFloat(product.apy).toFixed(2)}%</span>
                          )}
                        </td>
                        <td className="text-center py-3 px-3">
                          <button onClick={() => handleToggle(product.id)} className="inline-flex items-center">
                            {product.is_enabled ? (
                              <ToggleRight size={22} className="text-green-400 fill-current" />
                            ) : (
                              <ToggleLeft size={22} className="text-gray-500 fill-current" />
                            )}
                          </button>
                        </td>
                        <td className="text-right py-3 px-3">
                          {editingId === product.id ? (
                            <Input type="number" step="any" value={editForm.min_amount || ''}
                              onChange={(e) => setEditForm({ ...editForm, min_amount: e.target.value })}
                              className="h-7 bg-[#0a0a0a] border-[#2a2a2a] text-white text-xs w-28 ml-auto"
                            />
                          ) : (
                            <span className="text-sm text-gray-300 tabular-nums">${parseFloat(product.min_amount).toLocaleString()}</span>
                          )}
                        </td>
                        <td className="text-right py-3 px-3">
                          {editingId === product.id ? (
                            <Input type="number" step="any" value={editForm.max_amount || ''}
                              onChange={(e) => setEditForm({ ...editForm, max_amount: e.target.value })}
                              className="h-7 bg-[#0a0a0a] border-[#2a2a2a] text-white text-xs w-28 ml-auto"
                            />
                          ) : (
                            <span className="text-sm text-gray-300 tabular-nums">${parseFloat(product.max_amount).toLocaleString()}</span>
                          )}
                        </td>
                        <td className="text-center py-3 px-3">
                          {editingId === product.id ? (
                            <Input type="number" step="1" value={editForm.sort_order || 0}
                              onChange={(e) => setEditForm({ ...editForm, sort_order: parseInt(e.target.value) || 0 })}
                              className="h-7 bg-[#0a0a0a] border-[#2a2a2a] text-white text-xs w-14 mx-auto"
                            />
                          ) : (
                            <span className="text-xs text-gray-500">{product.sort_order}</span>
                          )}
                        </td>
                        <td className="text-center py-3 px-4">
                          <div className="flex items-center justify-center gap-1.5">
                            {editingId === product.id ? (
                              <>
                                <button onClick={handleSaveEdit} className="p-1.5 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20">
                                  <Save size={14} className="fill-current" />
                                </button>
                                <button onClick={() => setEditingId(null)} className="p-1.5 rounded-lg bg-gray-500/10 text-gray-400 hover:bg-gray-500/20">
                                  <X size={14} className="fill-current" />
                                </button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => startEdit(product)} className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20">
                                  <Edit2 size={14} className="fill-current" />
                                </button>
                                <button onClick={() => handleDelete(product.id, product.title)} className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20">
                                  <Trash2 size={14} className="fill-current" />
                                </button>
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
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400">
                          {parseFloat(product.apy).toFixed(2)}% APY
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleToggle(product.id)}>
                          {product.is_enabled ? <ToggleRight size={20} className="text-green-400 fill-current" /> : <ToggleLeft size={20} className="text-gray-500 fill-current" />}
                        </button>
                        <button onClick={() => startEdit(product)} className="p-1 rounded text-blue-400 hover:bg-blue-500/10">
                          <Edit2 size={14} className="fill-current" />
                        </button>
                        <button onClick={() => handleDelete(product.id, product.title)} className="p-1 rounded text-red-400 hover:bg-red-500/10">
                          <Trash2 size={14} className="fill-current" />
                        </button>
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
      </div>
    </AdminLayout>
  );
}
