import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Plus, Trash2, ToggleLeft, ToggleRight, RefreshCw, ArrowUpDown, 
  Settings, TrendingUp, Shield, Search, Edit2, Save, X, Users, Globe 
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useToast } from '@/hooks/use-toast';
import AdminLayout from './admin-layout';
import { CryptoIcon } from '@/components/crypto/crypto-icon';

interface TradingPair {
  id: number;
  symbol: string;
  base_asset: string;
  quote_asset: string;
  is_enabled: boolean;
  min_trade_amount: string;
  max_trade_amount: string;
  trading_fee: string;
  sort_order: number;
  pair_type: string;
  created_at: string;
  updated_at: string;
}

interface TradingLimit {
  id: number;
  user_id: string;
  symbol: string;
  trade_type: string;
  min_amount: string;
  max_amount: string;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface UserOption {
  id: string;
  email: string;
  username: string;
}

const AVAILABLE_ASSETS = [
  'BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOT', 'DOGE', 'AVAX', 'LINK',
  'LTC', 'MATIC', 'ATOM', 'TRX', 'SHIB', 'BCH', 'DASH', 'XMR', 'XLM', 'FIL',
  'APT', 'SUI', 'ARB', 'OP', 'PEPE', 'INJ'
];

export default function AdminTradingPairs() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'pairs' | 'limits'>('pairs');
  const [pairs, setPairs] = useState<TradingPair[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<TradingPair>>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPair, setNewPair] = useState({
    baseAsset: '',
    quoteAsset: 'USDT',
    pairType: 'both',
    minTradeAmount: '0.001',
    maxTradeAmount: '1000',
    tradingFee: '0.001',
  });

  // Trading limits state
  const [limits, setLimits] = useState<TradingLimit[]>([]);
  const [limitsLoading, setLimitsLoading] = useState(false);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [showAddLimit, setShowAddLimit] = useState(false);
  const [newLimit, setNewLimit] = useState({
    userId: '*',
    symbol: '*',
    tradeType: 'both',
    minAmount: '0',
    maxAmount: '1000000',
    isEnabled: true,
  });
  const [userSearch, setUserSearch] = useState('');

  const getAuthHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return {
      'Authorization': `Bearer ${session?.access_token}`,
      'Content-Type': 'application/json',
    };
  };

  const fetchPairs = async () => {
    try {
      setLoading(true);
      const headers = await getAuthHeaders();
      const response = await fetch('/api/admin/trading-pairs', { headers });
      if (response.ok) {
        const data = await response.json();
        setPairs(data);
      } else {
        toast({ title: 'Error', description: 'Failed to fetch trading pairs', variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to fetch trading pairs', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPairs();
    fetchUsers();
  }, []);

  const handleToggle = async (id: number) => {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/admin/trading-pairs/${id}/toggle`, {
        method: 'PUT',
        headers,
      });
      if (response.ok) {
        const updated = await response.json();
        setPairs(prev => prev.map(p => p.id === id ? updated : p));
        toast({ title: 'Success', description: `Pair ${updated.is_enabled ? 'enabled' : 'disabled'}` });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to toggle pair', variant: 'destructive' });
    }
  };

  const handleDelete = async (id: number, symbol: string) => {
    if (!confirm(`Delete ${symbol}? This cannot be undone.`)) return;
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/admin/trading-pairs/${id}`, {
        method: 'DELETE',
        headers,
      });
      if (response.ok) {
        setPairs(prev => prev.filter(p => p.id !== id));
        toast({ title: 'Deleted', description: `${symbol} removed` });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to delete pair', variant: 'destructive' });
    }
  };

  const handleAdd = async () => {
    if (!newPair.baseAsset) {
      toast({ title: 'Error', description: 'Select a base asset', variant: 'destructive' });
      return;
    }
    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/admin/trading-pairs', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          symbol: `${newPair.baseAsset}/${newPair.quoteAsset}`,
          baseAsset: newPair.baseAsset,
          quoteAsset: newPair.quoteAsset,
          pairType: newPair.pairType,
          minTradeAmount: newPair.minTradeAmount,
          maxTradeAmount: newPair.maxTradeAmount,
          tradingFee: newPair.tradingFee,
          sortOrder: pairs.length + 1,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        setPairs(prev => [...prev, data]);
        setShowAddForm(false);
        setNewPair({ baseAsset: '', quoteAsset: 'USDT', pairType: 'both', minTradeAmount: '0.001', maxTradeAmount: '1000', tradingFee: '0.001' });
        toast({ title: 'Success', description: `${data.symbol} added` });
      } else {
        const err = await response.json();
        toast({ title: 'Error', description: err.message || 'Failed to add pair', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to add pair', variant: 'destructive' });
    }
  };

  const startEdit = (pair: TradingPair) => {
    setEditingId(pair.id);
    setEditForm({
      min_trade_amount: pair.min_trade_amount,
      max_trade_amount: pair.max_trade_amount,
      trading_fee: pair.trading_fee,
      pair_type: pair.pair_type,
      sort_order: pair.sort_order,
    });
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/admin/trading-pairs/${editingId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          minTradeAmount: editForm.min_trade_amount,
          maxTradeAmount: editForm.max_trade_amount,
          tradingFee: editForm.trading_fee,
          pairType: editForm.pair_type,
          sortOrder: editForm.sort_order,
        }),
      });
      if (response.ok) {
        const updated = await response.json();
        setPairs(prev => prev.map(p => p.id === editingId ? updated : p));
        setEditingId(null);
        toast({ title: 'Saved', description: 'Pair settings updated' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to update pair', variant: 'destructive' });
    }
  };

  const handleSeed = async () => {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/admin/trading-pairs/seed', {
        method: 'POST',
        headers,
      });
      if (response.ok) {
        const result = await response.json();
        toast({ title: 'Success', description: result.message });
        fetchPairs();
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to seed pairs', variant: 'destructive' });
    }
  };

  // ========== TRADING LIMITS FUNCTIONS ==========
  const fetchUsers = async () => {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/admin/users', { headers });
      if (response.ok) {
        const data = await response.json();
        setUsers(data.map((u: any) => ({ id: u.id, email: u.email, username: u.username })));
      }
    } catch { /* ignore */ }
  };

  const fetchLimits = async () => {
    try {
      setLimitsLoading(true);
      const headers = await getAuthHeaders();
      const response = await fetch('/api/admin/trading-limits', { headers });
      if (response.ok) {
        setLimits(await response.json());
      }
    } catch { /* ignore */ }
    finally { setLimitsLoading(false); }
  };

  useEffect(() => {
    if (activeTab === 'limits') fetchLimits();
  }, [activeTab]);

  const handleAddLimit = async () => {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/admin/trading-limits', {
        method: 'POST',
        headers,
        body: JSON.stringify(newLimit),
      });
      if (response.ok) {
        const data = await response.json();
        setLimits(prev => [data, ...prev]);
        setShowAddLimit(false);
        setNewLimit({ userId: '*', symbol: '*', tradeType: 'both', minAmount: '0', maxAmount: '1000000', isEnabled: true });
        toast({ title: 'Success', description: 'Trading limit saved' });
      } else {
        const err = await response.json();
        toast({ title: 'Error', description: err.message || 'Failed to save limit', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to save limit', variant: 'destructive' });
    }
  };

  const handleToggleLimit = async (limit: TradingLimit) => {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/admin/trading-limits/${limit.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ isEnabled: !limit.is_enabled }),
      });
      if (response.ok) {
        const updated = await response.json();
        setLimits(prev => prev.map(l => l.id === limit.id ? updated : l));
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to toggle limit', variant: 'destructive' });
    }
  };

  const handleDeleteLimit = async (id: number) => {
    if (!confirm('Delete this trading limit?')) return;
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/admin/trading-limits/${id}`, {
        method: 'DELETE',
        headers,
      });
      if (response.ok) {
        setLimits(prev => prev.filter(l => l.id !== id));
        toast({ title: 'Deleted', description: 'Trading limit removed' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to delete limit', variant: 'destructive' });
    }
  };

  const getUserLabel = (userId: string) => {
    if (userId === '*') return 'All Users (Global)';
    const user = users.find(u => u.id === userId);
    return user ? `${user.username} (${user.email})` : userId.slice(0, 12) + '...';
  };

  const filteredUsers = userSearch
    ? users.filter(u => u.email.toLowerCase().includes(userSearch.toLowerCase()) || u.username.toLowerCase().includes(userSearch.toLowerCase()))
    : users;

  const filteredPairs = pairs.filter(p => 
    p.symbol.toLowerCase().includes(search.toLowerCase()) ||
    p.base_asset.toLowerCase().includes(search.toLowerCase())
  );

  const enabledCount = pairs.filter(p => p.is_enabled).length;
  const spotCount = pairs.filter(p => p.pair_type === 'spot' || p.pair_type === 'both').length;
  const futuresCount = pairs.filter(p => p.pair_type === 'futures' || p.pair_type === 'both').length;

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
              <TrendingUp size={24} className="text-blue-400" />
              Trading Configuration
            </h1>
            <p className="text-sm text-gray-500 mt-1">Manage trading pairs and user limits</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-[#111] rounded-xl p-1 border border-[#1e1e1e] w-fit">
          <button
            onClick={() => setActiveTab('pairs')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'pairs' ? 'bg-[#222] text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <TrendingUp size={14} className="inline mr-1.5 -mt-0.5" />
            Trading Pairs
          </button>
          <button
            onClick={() => setActiveTab('limits')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'limits' ? 'bg-[#222] text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <Shield size={14} className="inline mr-1.5 -mt-0.5" />
            Trading Limits
          </button>
        </div>

        {activeTab === 'pairs' && (
        <>
        {/* Pairs Header Actions */}
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={fetchPairs} className="border-[#2a2a2a] bg-[#111] text-gray-300 hover:bg-[#1a1a1a]">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </Button>
          <Button variant="outline" size="sm" onClick={handleSeed} className="border-[#2a2a2a] bg-[#111] text-gray-300 hover:bg-[#1a1a1a]">
            <Shield size={14} className="mr-1" /> Seed Defaults
          </Button>
          <Button size="sm" onClick={() => setShowAddForm(!showAddForm)} className="bg-blue-600 hover:bg-blue-700">
            <Plus size={14} className="mr-1" /> Add Pair
          </Button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-3">
            <div className="text-xs text-gray-500">Total Pairs</div>
            <div className="text-lg font-bold text-white">{pairs.length}</div>
          </div>
          <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-3">
            <div className="text-xs text-gray-500">Enabled</div>
            <div className="text-lg font-bold text-green-400">{enabledCount}</div>
          </div>
          <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-3">
            <div className="text-xs text-gray-500">Spot Pairs</div>
            <div className="text-lg font-bold text-blue-400">{spotCount}</div>
          </div>
          <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-3">
            <div className="text-xs text-gray-500">Futures Pairs</div>
            <div className="text-lg font-bold text-purple-400">{futuresCount}</div>
          </div>
        </div>

        {/* Add Pair Form */}
        {showAddForm && (
          <div className="bg-[#111] border border-blue-500/30 rounded-xl p-4 space-y-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Plus size={16} className="text-blue-400" /> Add New Trading Pair
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
              <div>
                <label className="text-[10px] text-gray-500 uppercase mb-1 block">Base Asset</label>
                <Select value={newPair.baseAsset} onValueChange={(v) => setNewPair({ ...newPair, baseAsset: v })}>
                  <SelectTrigger className="h-9 bg-[#0a0a0a] border-[#2a2a2a] text-white text-xs">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1a1a] border-[#2a2a2a]">
                    {AVAILABLE_ASSETS.filter(a => !pairs.some(p => p.base_asset === a && p.quote_asset === newPair.quoteAsset)).map(a => (
                      <SelectItem key={a} value={a}>{a}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[10px] text-gray-500 uppercase mb-1 block">Quote Asset</label>
                <Select value={newPair.quoteAsset} onValueChange={(v) => setNewPair({ ...newPair, quoteAsset: v })}>
                  <SelectTrigger className="h-9 bg-[#0a0a0a] border-[#2a2a2a] text-white text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1a1a] border-[#2a2a2a]">
                    <SelectItem value="USDT">USDT</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[10px] text-gray-500 uppercase mb-1 block">Type</label>
                <Select value={newPair.pairType} onValueChange={(v) => setNewPair({ ...newPair, pairType: v })}>
                  <SelectTrigger className="h-9 bg-[#0a0a0a] border-[#2a2a2a] text-white text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1a1a] border-[#2a2a2a]">
                    <SelectItem value="spot">Spot Only</SelectItem>
                    <SelectItem value="futures">Futures Only</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[10px] text-gray-500 uppercase mb-1 block">Min Amount</label>
                <Input
                  type="number" step="any" value={newPair.minTradeAmount}
                  onChange={(e) => setNewPair({ ...newPair, minTradeAmount: e.target.value })}
                  className="h-9 bg-[#0a0a0a] border-[#2a2a2a] text-white text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 uppercase mb-1 block">Max Amount</label>
                <Input
                  type="number" step="any" value={newPair.maxTradeAmount}
                  onChange={(e) => setNewPair({ ...newPair, maxTradeAmount: e.target.value })}
                  className="h-9 bg-[#0a0a0a] border-[#2a2a2a] text-white text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 uppercase mb-1 block">Fee</label>
                <Input
                  type="number" step="any" value={newPair.tradingFee}
                  onChange={(e) => setNewPair({ ...newPair, tradingFee: e.target.value })}
                  className="h-9 bg-[#0a0a0a] border-[#2a2a2a] text-white text-xs"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowAddForm(false)} className="border-[#2a2a2a] bg-[#0a0a0a] text-gray-400">
                Cancel
              </Button>
              <Button size="sm" onClick={handleAdd} className="bg-blue-600 hover:bg-blue-700">
                <Plus size={14} className="mr-1" /> Add Pair
              </Button>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <Input
            placeholder="Search pairs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 bg-[#111] border-[#1e1e1e] text-white text-sm"
          />
        </div>

        {/* Pairs Table */}
        <div className="bg-[#111] border border-[#1e1e1e] rounded-xl overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw size={20} className="animate-spin text-gray-500" />
            </div>
          ) : filteredPairs.length === 0 ? (
            <div className="text-center py-12">
              <TrendingUp size={32} className="mx-auto mb-3 text-gray-600" />
              <p className="text-gray-500 text-sm">No trading pairs found</p>
              <p className="text-gray-600 text-xs mt-1">Click "Seed Defaults" to add common pairs</p>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-xs text-gray-500 uppercase border-b border-[#1e1e1e] bg-[#0a0a0a]">
                      <th className="text-left py-3 px-4">Pair</th>
                      <th className="text-center py-3 px-3">Type</th>
                      <th className="text-center py-3 px-3">Status</th>
                      <th className="text-right py-3 px-3">Min Amount</th>
                      <th className="text-right py-3 px-3">Max Amount</th>
                      <th className="text-right py-3 px-3">Fee</th>
                      <th className="text-center py-3 px-3">Order</th>
                      <th className="text-center py-3 px-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPairs.map((pair) => (
                      <tr key={pair.id} className={`border-b border-[#1e1e1e] hover:bg-[#1a1a1a] transition-colors ${!pair.is_enabled ? 'opacity-50' : ''}`}>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <CryptoIcon symbol={pair.base_asset} size="xs" />
                            <span className="font-semibold text-white text-sm">{pair.base_asset}</span>
                            <span className="text-gray-600">/</span>
                            <span className="text-gray-400 text-sm">{pair.quote_asset}</span>
                          </div>
                        </td>
                        <td className="text-center py-3 px-3">
                          {editingId === pair.id ? (
                            <Select value={editForm.pair_type || pair.pair_type} onValueChange={(v) => setEditForm({ ...editForm, pair_type: v })}>
                              <SelectTrigger className="h-7 bg-[#0a0a0a] border-[#2a2a2a] text-white text-xs w-24 mx-auto">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="bg-[#1a1a1a] border-[#2a2a2a]">
                                <SelectItem value="spot">Spot</SelectItem>
                                <SelectItem value="futures">Futures</SelectItem>
                                <SelectItem value="both">Both</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              pair.pair_type === 'both' ? 'bg-purple-500/10 text-purple-400' :
                              pair.pair_type === 'futures' ? 'bg-orange-500/10 text-orange-400' :
                              'bg-blue-500/10 text-blue-400'
                            }`}>
                              {pair.pair_type === 'both' ? 'Spot + Futures' : pair.pair_type.charAt(0).toUpperCase() + pair.pair_type.slice(1)}
                            </span>
                          )}
                        </td>
                        <td className="text-center py-3 px-3">
                          <button onClick={() => handleToggle(pair.id)} className="inline-flex items-center">
                            {pair.is_enabled ? (
                              <ToggleRight size={22} className="text-green-400" />
                            ) : (
                              <ToggleLeft size={22} className="text-gray-500" />
                            )}
                          </button>
                        </td>
                        <td className="text-right py-3 px-3">
                          {editingId === pair.id ? (
                            <Input type="number" step="any" value={editForm.min_trade_amount}
                              onChange={(e) => setEditForm({ ...editForm, min_trade_amount: e.target.value })}
                              className="h-7 bg-[#0a0a0a] border-[#2a2a2a] text-white text-xs w-24 ml-auto"
                            />
                          ) : (
                            <span className="text-sm text-gray-300 tabular-nums">{parseFloat(pair.min_trade_amount).toLocaleString()}</span>
                          )}
                        </td>
                        <td className="text-right py-3 px-3">
                          {editingId === pair.id ? (
                            <Input type="number" step="any" value={editForm.max_trade_amount}
                              onChange={(e) => setEditForm({ ...editForm, max_trade_amount: e.target.value })}
                              className="h-7 bg-[#0a0a0a] border-[#2a2a2a] text-white text-xs w-24 ml-auto"
                            />
                          ) : (
                            <span className="text-sm text-gray-300 tabular-nums">{parseFloat(pair.max_trade_amount).toLocaleString()}</span>
                          )}
                        </td>
                        <td className="text-right py-3 px-3">
                          {editingId === pair.id ? (
                            <Input type="number" step="any" value={editForm.trading_fee}
                              onChange={(e) => setEditForm({ ...editForm, trading_fee: e.target.value })}
                              className="h-7 bg-[#0a0a0a] border-[#2a2a2a] text-white text-xs w-20 ml-auto"
                            />
                          ) : (
                            <span className="text-sm text-gray-300 tabular-nums">{(parseFloat(pair.trading_fee) * 100).toFixed(2)}%</span>
                          )}
                        </td>
                        <td className="text-center py-3 px-3">
                          {editingId === pair.id ? (
                            <Input type="number" step="1" value={editForm.sort_order}
                              onChange={(e) => setEditForm({ ...editForm, sort_order: parseInt(e.target.value) || 0 })}
                              className="h-7 bg-[#0a0a0a] border-[#2a2a2a] text-white text-xs w-14 mx-auto"
                            />
                          ) : (
                            <span className="text-xs text-gray-500">{pair.sort_order}</span>
                          )}
                        </td>
                        <td className="text-center py-3 px-4">
                          <div className="flex items-center justify-center gap-1.5">
                            {editingId === pair.id ? (
                              <>
                                <button onClick={handleSaveEdit} className="p-1.5 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20">
                                  <Save size={14} />
                                </button>
                                <button onClick={() => setEditingId(null)} className="p-1.5 rounded-lg bg-gray-500/10 text-gray-400 hover:bg-gray-500/20">
                                  <X size={14} />
                                </button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => startEdit(pair)} className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20">
                                  <Edit2 size={14} />
                                </button>
                                <button onClick={() => handleDelete(pair.id, pair.symbol)} className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20">
                                  <Trash2 size={14} />
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
                {filteredPairs.map((pair) => (
                  <div key={pair.id} className={`p-4 ${!pair.is_enabled ? 'opacity-50' : ''}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <CryptoIcon symbol={pair.base_asset} size="xs" />
                        <span className="font-bold text-white">{pair.base_asset}/{pair.quote_asset}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                          pair.pair_type === 'both' ? 'bg-purple-500/10 text-purple-400' :
                          pair.pair_type === 'futures' ? 'bg-orange-500/10 text-orange-400' :
                          'bg-blue-500/10 text-blue-400'
                        }`}>
                          {pair.pair_type === 'both' ? 'S+F' : pair.pair_type.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleToggle(pair.id)}>
                          {pair.is_enabled ? <ToggleRight size={20} className="text-green-400" /> : <ToggleLeft size={20} className="text-gray-500" />}
                        </button>
                        <button onClick={() => handleDelete(pair.id, pair.symbol)} className="p-1 rounded text-red-400 hover:bg-red-500/10">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="flex gap-4 text-xs text-gray-500">
                      <span>Min: {parseFloat(pair.min_trade_amount).toLocaleString()}</span>
                      <span>Max: {parseFloat(pair.max_trade_amount).toLocaleString()}</span>
                      <span>Fee: {(parseFloat(pair.trading_fee) * 100).toFixed(2)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        </>
        )}

        {/* ==================== LIMITS TAB ==================== */}
        {activeTab === 'limits' && (
        <>
          <div className="flex gap-2 justify-between items-start">
            <div>
              <p className="text-sm text-gray-400">
                Set minimum/maximum trade amounts per user or globally. 
                Use <span className="text-blue-400 font-mono">*</span> for "all users" or "all pairs".
              </p>
              <p className="text-xs text-gray-600 mt-1">
                Priority: Per-user + per-pair &gt; Per-user + all pairs &gt; Global + per-pair &gt; Global + all pairs
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={fetchLimits} className="border-[#2a2a2a] bg-[#111] text-gray-300 hover:bg-[#1a1a1a]">
                <RefreshCw size={14} className={limitsLoading ? 'animate-spin' : ''} />
              </Button>
              <Button size="sm" onClick={() => setShowAddLimit(!showAddLimit)} className="bg-blue-600 hover:bg-blue-700">
                <Plus size={14} className="mr-1" /> Add Limit
              </Button>
            </div>
          </div>

          {/* Add Limit Form */}
          {showAddLimit && (
            <div className="bg-[#111] border border-blue-500/30 rounded-xl p-4 space-y-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Plus size={16} className="text-blue-400" /> New Trading Limit
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <label className="text-[10px] text-gray-500 uppercase mb-1 block">User</label>
                  <Select value={newLimit.userId} onValueChange={(v) => setNewLimit({ ...newLimit, userId: v })}>
                    <SelectTrigger className="h-9 bg-[#0a0a0a] border-[#2a2a2a] text-white text-xs">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1a1a1a] border-[#2a2a2a] max-h-48">
                      <SelectItem value="*">
                        <span className="flex items-center gap-1"><Globe size={12} className="text-blue-400" /> All Users (Global)</span>
                      </SelectItem>
                      {users.map(u => (
                        <SelectItem key={u.id} value={u.id}>{u.username} ({u.email})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 uppercase mb-1 block">Pair</label>
                  <Select value={newLimit.symbol} onValueChange={(v) => setNewLimit({ ...newLimit, symbol: v })}>
                    <SelectTrigger className="h-9 bg-[#0a0a0a] border-[#2a2a2a] text-white text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1a1a1a] border-[#2a2a2a] max-h-48">
                      <SelectItem value="*">All Pairs (*)</SelectItem>
                      {pairs.map(p => (
                        <SelectItem key={p.id} value={p.symbol}>{p.symbol}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 uppercase mb-1 block">Type</label>
                  <Select value={newLimit.tradeType} onValueChange={(v) => setNewLimit({ ...newLimit, tradeType: v })}>
                    <SelectTrigger className="h-9 bg-[#0a0a0a] border-[#2a2a2a] text-white text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1a1a1a] border-[#2a2a2a]">
                      <SelectItem value="spot">Spot</SelectItem>
                      <SelectItem value="futures">Futures</SelectItem>
                      <SelectItem value="both">Both</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 uppercase mb-1 block">Min Amount</label>
                  <Input
                    type="number" step="any" value={newLimit.minAmount}
                    onChange={(e) => setNewLimit({ ...newLimit, minAmount: e.target.value })}
                    className="h-9 bg-[#0a0a0a] border-[#2a2a2a] text-white text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 uppercase mb-1 block">Max Amount</label>
                  <Input
                    type="number" step="any" value={newLimit.maxAmount}
                    onChange={(e) => setNewLimit({ ...newLimit, maxAmount: e.target.value })}
                    className="h-9 bg-[#0a0a0a] border-[#2a2a2a] text-white text-xs"
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => setShowAddLimit(false)} className="border-[#2a2a2a] bg-[#0a0a0a] text-gray-400">
                  Cancel
                </Button>
                <Button size="sm" onClick={handleAddLimit} className="bg-blue-600 hover:bg-blue-700">
                  <Plus size={14} className="mr-1" /> Save Limit
                </Button>
              </div>
            </div>
          )}

          {/* Limits Table */}
          <div className="bg-[#111] border border-[#1e1e1e] rounded-xl overflow-hidden">
            {limitsLoading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw size={20} className="animate-spin text-gray-500" />
              </div>
            ) : limits.length === 0 ? (
              <div className="text-center py-12">
                <Shield size={32} className="mx-auto mb-3 text-gray-600" />
                <p className="text-gray-500 text-sm">No trading limits configured</p>
                <p className="text-gray-600 text-xs mt-1">Add limits to control minimum/maximum trade amounts per user or globally</p>
              </div>
            ) : (
              <>
                {/* Desktop */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-xs text-gray-500 uppercase border-b border-[#1e1e1e] bg-[#0a0a0a]">
                        <th className="text-left py-3 px-4">User</th>
                        <th className="text-center py-3 px-3">Pair</th>
                        <th className="text-center py-3 px-3">Type</th>
                        <th className="text-right py-3 px-3">Min Amount</th>
                        <th className="text-right py-3 px-3">Max Amount</th>
                        <th className="text-center py-3 px-3">Status</th>
                        <th className="text-center py-3 px-4">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {limits.map((limit) => (
                        <tr key={limit.id} className={`border-b border-[#1e1e1e] hover:bg-[#1a1a1a] transition-colors ${!limit.is_enabled ? 'opacity-50' : ''}`}>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              {limit.user_id === '*' ? (
                                <Globe size={14} className="text-blue-400" />
                              ) : (
                                <Users size={14} className="text-gray-400" />
                              )}
                              <span className="text-sm text-white truncate max-w-[200px]">{getUserLabel(limit.user_id)}</span>
                            </div>
                          </td>
                          <td className="text-center py-3 px-3">
                            <span className={`text-sm ${limit.symbol === '*' ? 'text-blue-400 font-mono' : 'text-white font-semibold'}`}>
                              {limit.symbol === '*' ? 'All Pairs' : limit.symbol}
                            </span>
                          </td>
                          <td className="text-center py-3 px-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              limit.trade_type === 'both' ? 'bg-purple-500/10 text-purple-400' :
                              limit.trade_type === 'futures' ? 'bg-orange-500/10 text-orange-400' :
                              'bg-blue-500/10 text-blue-400'
                            }`}>
                              {limit.trade_type === 'both' ? 'Spot + Futures' : limit.trade_type.charAt(0).toUpperCase() + limit.trade_type.slice(1)}
                            </span>
                          </td>
                          <td className="text-right py-3 px-3 text-sm text-gray-300 tabular-nums">
                            {parseFloat(limit.min_amount).toLocaleString()}
                          </td>
                          <td className="text-right py-3 px-3 text-sm text-gray-300 tabular-nums">
                            {parseFloat(limit.max_amount).toLocaleString()}
                          </td>
                          <td className="text-center py-3 px-3">
                            <button onClick={() => handleToggleLimit(limit)} className="inline-flex items-center">
                              {limit.is_enabled ? (
                                <ToggleRight size={22} className="text-green-400" />
                              ) : (
                                <ToggleLeft size={22} className="text-gray-500" />
                              )}
                            </button>
                          </td>
                          <td className="text-center py-3 px-4">
                            <button onClick={() => handleDeleteLimit(limit.id)} className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20">
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile */}
                <div className="block md:hidden divide-y divide-[#1e1e1e]">
                  {limits.map((limit) => (
                    <div key={limit.id} className={`p-4 ${!limit.is_enabled ? 'opacity-50' : ''}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {limit.user_id === '*' ? <Globe size={14} className="text-blue-400" /> : <Users size={14} className="text-gray-400" />}
                          <span className="font-medium text-white text-sm truncate max-w-[180px]">{getUserLabel(limit.user_id)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => handleToggleLimit(limit)}>
                            {limit.is_enabled ? <ToggleRight size={20} className="text-green-400" /> : <ToggleLeft size={20} className="text-gray-500" />}
                          </button>
                          <button onClick={() => handleDeleteLimit(limit.id)} className="p-1 text-red-400">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      <div className="flex gap-3 text-xs text-gray-500">
                        <span>Pair: {limit.symbol === '*' ? 'All' : limit.symbol}</span>
                        <span>Min: {parseFloat(limit.min_amount).toLocaleString()}</span>
                        <span>Max: {parseFloat(limit.max_amount).toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
        )}

      </div>
    </AdminLayout>
  );
}
