import { useEffect, useState } from 'react';
import { formatDate } from '@/lib/date-utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AdminUserManagementModal } from '@/components/modals/admin-user-management-modal';
import { Users, Wallet, Edit, Save, X, Copy, CheckCircle, RefreshCw, Timer, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';
import AdminLayout from './admin-layout';

interface User {
  id: string;
  email: string;
  full_name?: string;
  is_active?: boolean;
}

interface DepositAddress {
  id: number;
  asset_symbol: string;
  address: string;
  network: string;
  is_active: boolean;
  min_deposit: number | null;
  max_deposit: number | null;
  deposit_fee_rate: number | null;
  withdrawal_fee_rate: number | null;
  created_at: string;
  updated_at: string;
  updated_by?: string;
}

interface TimeLimit {
  duration: number;
  minAmount: number;
  isActive: boolean;
}

interface TimeLimitsConfig {
  limits: TimeLimit[];
  defaultMinAmount: number;
  enabled: boolean;
}

export default function AdminSettings() {
  const [users, setUsers] = useState<User[]>([]);
  const [depositAddresses, setDepositAddresses] = useState<DepositAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUserManagement, setShowUserManagement] = useState(false);
  const [editingAddress, setEditingAddress] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ address: '', network: '', min_deposit: '', max_deposit: '', deposit_fee_rate: '', withdrawal_fee_rate: '' });
  const [newAddressForm, setNewAddressForm] = useState({ asset_symbol: '', address: '', network: '', min_deposit: '', max_deposit: '', deposit_fee_rate: '', withdrawal_fee_rate: '' });
  const { copied, copyToClipboard } = useCopyToClipboard();

  // Futures time limits state
  const [timeLimits, setTimeLimits] = useState<TimeLimitsConfig | null>(null);
  const [timeLimitsLoading, setTimeLimitsLoading] = useState(true);
  const [editingLimit, setEditingLimit] = useState<number | null>(null);
  const [editLimitForm, setEditLimitForm] = useState({ minAmount: '' });
  const [newLimitForm, setNewLimitForm] = useState({ duration: '', minAmount: '' });
  const [showAddLimit, setShowAddLimit] = useState(false);
  const [timeLimitsSaving, setTimeLimitsSaving] = useState(false);

  // Standard durations that cannot be removed (only toggled)
  const standardDurations = [60, 120, 180, 240, 360, 480, 600];

  const refreshDepositAddresses = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const addressesResponse = await fetch('/api/admin/deposit-addresses', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });
      const addressesData = await addressesResponse.json();
      setDepositAddresses(addressesData.addresses || []);
    } catch (err) {
      console.error('Failed to refresh deposit addresses:', err);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Get auth token
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          setError('Not authenticated');
          setLoading(false);
          return;
        }

        // Fetch users
        const usersResponse = await fetch('/api/admin/users', {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          }
        });
        const usersData = await usersResponse.json();
        setUsers(usersData.users || []);

        // Fetch deposit addresses
        const addressesResponse = await fetch('/api/admin/deposit-addresses', {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          }
        });
        const addressesData = await addressesResponse.json();
        setDepositAddresses(addressesData.addresses || []);

        // Fetch futures time limits
        try {
          const timeLimitsResponse = await fetch('/api/admin/futures-time-limits', {
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json'
            }
          });
          if (timeLimitsResponse.ok) {
            const timeLimitsData = await timeLimitsResponse.json();
            setTimeLimits(timeLimitsData);
          }
        } catch (err) {
          console.error('Failed to fetch time limits:', err);
        } finally {
          setTimeLimitsLoading(false);
        }

        setLoading(false);
      } catch (err) {
        setError('Failed to load data');
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const toggleUser = async (user: User) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      const res = await fetch('/api/admin/toggle-user-status', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, isActive: !user.is_active }),
      });
      if (res.ok) {
        setUsers(users => users.map(u => u.id === user.id ? { ...u, is_active: !u.is_active } : u));
      }
    } catch (err) {
      console.error('Failed to toggle user status:', err);
    }
  };

  const startEditingAddress = (address: DepositAddress) => {
    setEditingAddress(address.asset_symbol);
    setEditForm({
      address: address.address,
      network: address.network,
      min_deposit: address.min_deposit != null ? String(address.min_deposit) : '',
      max_deposit: address.max_deposit != null ? String(address.max_deposit) : '',
      deposit_fee_rate: address.deposit_fee_rate != null && address.deposit_fee_rate > 0 ? String(address.deposit_fee_rate * 100) : '',
      withdrawal_fee_rate: address.withdrawal_fee_rate != null && address.withdrawal_fee_rate > 0 ? String(address.withdrawal_fee_rate * 100) : '',
    });
  };

  const cancelEditing = () => {
    setEditingAddress(null);
    setEditForm({ address: '', network: '', min_deposit: '', max_deposit: '', deposit_fee_rate: '', withdrawal_fee_rate: '' });
  };

  const handleCopyAddress = async (address: string, assetSymbol: string) => {
    await copyToClipboard(address, `${assetSymbol} deposit address copied to clipboard.`);
  };

  const saveAddress = async (assetSymbol: string) => {
    try {
      // Get auth token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError('Not authenticated');
        return;
      }

      const response = await fetch(`/api/admin/deposit-addresses/${assetSymbol}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          address: editForm.address,
          network: editForm.network,
          min_deposit: editForm.min_deposit || null,
          max_deposit: editForm.max_deposit || null,
          deposit_fee_rate: editForm.deposit_fee_rate ? parseFloat(editForm.deposit_fee_rate) / 100 : 0,
          withdrawal_fee_rate: editForm.withdrawal_fee_rate ? parseFloat(editForm.withdrawal_fee_rate) / 100 : 0,
        })
      });

      if (response.ok) {
        const result = await response.json();
        setDepositAddresses(addresses =>
          addresses.map(addr =>
            addr.asset_symbol === assetSymbol
              ? {
                  ...addr,
                  address: editForm.address,
                  network: editForm.network,
                  min_deposit: editForm.min_deposit ? parseFloat(editForm.min_deposit) : null,
                  max_deposit: editForm.max_deposit ? parseFloat(editForm.max_deposit) : null,
                  deposit_fee_rate: editForm.deposit_fee_rate ? parseFloat(editForm.deposit_fee_rate) / 100 : 0,
                  withdrawal_fee_rate: editForm.withdrawal_fee_rate ? parseFloat(editForm.withdrawal_fee_rate) / 100 : 0,
                  updated_at: new Date().toISOString()
                }
              : addr
          )
        );
        setEditingAddress(null);
        setEditForm({ address: '', network: '', min_deposit: '', max_deposit: '', deposit_fee_rate: '', withdrawal_fee_rate: '' });
      } else {
        const error = await response.json();
        setError(error.message || 'Failed to update address');
      }
    } catch (err) {
      setError('Failed to update address');
    }
  };

  const createAddress = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError('Not authenticated');
        return;
      }

      const assetSymbol = newAddressForm.asset_symbol.trim().toUpperCase();
      const body = {
        address: newAddressForm.address.trim(),
        network: newAddressForm.network.trim(),
        min_deposit: newAddressForm.min_deposit || null,
        max_deposit: newAddressForm.max_deposit || null,
        deposit_fee_rate: newAddressForm.deposit_fee_rate ? parseFloat(newAddressForm.deposit_fee_rate) / 100 : 0,
        withdrawal_fee_rate: newAddressForm.withdrawal_fee_rate ? parseFloat(newAddressForm.withdrawal_fee_rate) / 100 : 0,
      };

      const response = await fetch(`/api/admin/deposit-addresses/${assetSymbol}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify(body)
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.message || 'Failed to create address');
        return;
      }

      setDepositAddresses(addresses => {
        const existing = addresses.find(a => a.asset_symbol === assetSymbol);
        if (existing) {
          return addresses.map(a =>
            a.asset_symbol === assetSymbol
              ? { ...a, address: result.address.address, network: result.address.network, updated_at: result.address.updated_at }
              : a
          );
        }
        return [...addresses, result.address];
      });

      setNewAddressForm({ asset_symbol: '', address: '', network: '', min_deposit: '', max_deposit: '', deposit_fee_rate: '', withdrawal_fee_rate: '' });
    } catch {
      setError('Failed to create address');
    }
  };

  const deleteAddress = async (assetSymbol: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError('Not authenticated');
        return;
      }

      const response = await fetch(`/api/admin/deposit-addresses/${assetSymbol}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        setError(errorData.message || 'Failed to delete address');
        return;
      }

      setDepositAddresses(addresses => addresses.filter(a => a.asset_symbol !== assetSymbol));
    } catch {
      setError('Failed to delete address');
    }
  };

  // Time limits handlers
  const saveTimeLimits = async (updatedConfig: TimeLimitsConfig) => {
    setTimeLimitsSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError('Not authenticated');
        return;
      }

      const response = await fetch('/api/admin/futures-time-limits', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updatedConfig)
      });

      if (response.ok) {
        const data = await response.json();
        setTimeLimits(data);
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'Failed to save time limits');
      }
    } catch {
      setError('Failed to save time limits');
    } finally {
      setTimeLimitsSaving(false);
    }
  };

  const toggleTimeLimitsEnabled = () => {
    if (!timeLimits) return;
    const updated = { ...timeLimits, enabled: !timeLimits.enabled };
    setTimeLimits(updated);
    saveTimeLimits(updated);
  };

  const toggleLimitActive = (duration: number) => {
    if (!timeLimits) return;
    const updated = {
      ...timeLimits,
      limits: timeLimits.limits.map(l =>
        l.duration === duration ? { ...l, isActive: !l.isActive } : l
      )
    };
    setTimeLimits(updated);
    saveTimeLimits(updated);
  };

  const startEditingLimit = (limit: TimeLimit) => {
    setEditingLimit(limit.duration);
    setEditLimitForm({ minAmount: limit.minAmount.toString() });
  };

  const cancelEditingLimit = () => {
    setEditingLimit(null);
    setEditLimitForm({ minAmount: '' });
  };

  const saveLimitEdit = (duration: number) => {
    if (!timeLimits) return;
    const minAmount = parseFloat(editLimitForm.minAmount);
    if (isNaN(minAmount) || minAmount < 0) {
      setError('Invalid minimum amount');
      return;
    }
    const updated = {
      ...timeLimits,
      limits: timeLimits.limits.map(l =>
        l.duration === duration ? { ...l, minAmount } : l
      )
    };
    setTimeLimits(updated);
    saveTimeLimits(updated);
    setEditingLimit(null);
    setEditLimitForm({ minAmount: '' });
  };

  const updateDefaultMinAmount = (value: string) => {
    if (!timeLimits) return;
    const defaultMinAmount = parseFloat(value);
    if (isNaN(defaultMinAmount) || defaultMinAmount < 0) return;
    const updated = { ...timeLimits, defaultMinAmount };
    setTimeLimits(updated);
  };

  const saveDefaultMinAmount = () => {
    if (!timeLimits) return;
    saveTimeLimits(timeLimits);
  };

  const addCustomLimit = () => {
    if (!timeLimits) return;
    const duration = parseInt(newLimitForm.duration);
    const minAmount = parseFloat(newLimitForm.minAmount);

    if (isNaN(duration) || duration <= 0) {
      setError('Duration must be a positive integer');
      return;
    }
    if (isNaN(minAmount) || minAmount < 0) {
      setError('Invalid minimum amount');
      return;
    }
    if (timeLimits.limits.some(l => l.duration === duration)) {
      setError('Duration already exists');
      return;
    }

    const updated = {
      ...timeLimits,
      limits: [...timeLimits.limits, { duration, minAmount, isActive: true }].sort((a, b) => a.duration - b.duration)
    };
    setTimeLimits(updated);
    saveTimeLimits(updated);
    setNewLimitForm({ duration: '', minAmount: '' });
    setShowAddLimit(false);
  };

  const removeLimit = (duration: number) => {
    if (!timeLimits) return;
    if (standardDurations.includes(duration)) {
      setError('Cannot remove standard durations. You can only toggle them.');
      return;
    }
    const updated = {
      ...timeLimits,
      limits: timeLimits.limits.filter(l => l.duration !== duration)
    };
    setTimeLimits(updated);
    saveTimeLimits(updated);
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSecs = seconds % 60;
    return remainingSecs > 0 ? `${minutes}m ${remainingSecs}s` : `${minutes}m`;
  };

  if (loading) return (
    <AdminLayout>
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-sm text-gray-500">Loading settings...</p>
        </div>
      </div>
    </AdminLayout>
  );
  if (error) return (
    <AdminLayout>
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-2xl p-6 text-sm flex flex-col items-center gap-3">
          <span>{error}</span>
          <Button size="sm" variant="outline" className="text-xs border-red-500/30 text-red-400 hover:bg-red-500/10" onClick={() => { setError(null); setLoading(true); window.location.reload(); }}>
            Retry
          </Button>
        </div>
      </div>
    </AdminLayout>
  );

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-white">Settings</h1>
          <p className="text-sm text-gray-500 mt-1">Configure platform deposit addresses and manage users</p>
        </div>

        {/* Deposit Address Management */}
        <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] overflow-hidden">
          <div className="p-5 border-b border-[#1e1e1e] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-orange-500/10 rounded-xl flex items-center justify-center">
                <Wallet className="h-5 w-5 text-orange-400 fill-current" />
              </div>
              <div>
                <h2 className="font-semibold text-white text-sm">Deposit Addresses</h2>
                <p className="text-[11px] text-gray-500">Addresses shown to all users for deposits</p>
              </div>
            </div>
            <button 
              onClick={refreshDepositAddresses}
              className="inline-flex items-center rounded-xl text-xs font-medium border border-[#1e1e1e] bg-[#0a0a0a] text-gray-300 hover:bg-[#1a1a1a] hover:border-[#2a2a2a] hover:text-white h-9 px-3 transition-colors w-full sm:w-auto justify-center"
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5 fill-current" />
              Refresh
            </button>
          </div>
          
          <div className="p-5 space-y-5">
            <div className="bg-[#0a0a0a] border border-[#1e1e1e] rounded-xl p-4 mb-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">Asset Symbol</Label>
                  <Input
                    value={newAddressForm.asset_symbol}
                    onChange={(e) => setNewAddressForm({ ...newAddressForm, asset_symbol: e.target.value })}
                    className="rounded-lg border-[#1e1e1e] bg-[#111] text-sm h-9 text-white placeholder:text-gray-500 focus:border-blue-500"
                    placeholder="e.g., BTC, ETH, USDT"
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">Address</Label>
                  <Input
                    value={newAddressForm.address}
                    onChange={(e) => setNewAddressForm({ ...newAddressForm, address: e.target.value })}
                    className="rounded-lg border-[#1e1e1e] bg-[#111] text-sm h-9 text-white placeholder:text-gray-500 focus:border-blue-500"
                    placeholder="Enter deposit address"
                  />
                </div>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Label className="text-xs text-gray-500 mb-1 block">Network</Label>
                    <Input
                      value={newAddressForm.network}
                      onChange={(e) => setNewAddressForm({ ...newAddressForm, network: e.target.value })}
                      className="rounded-lg border-[#1e1e1e] bg-[#111] text-sm h-9 text-white placeholder:text-gray-500 focus:border-blue-500"
                      placeholder="e.g., mainnet, ethereum, trc20"
                    />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">Min Deposit</Label>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    value={newAddressForm.min_deposit}
                    onChange={(e) => setNewAddressForm({ ...newAddressForm, min_deposit: e.target.value })}
                    className="rounded-lg border-[#1e1e1e] bg-[#111] text-sm h-9 text-white placeholder:text-gray-500 focus:border-blue-500"
                    placeholder="e.g., 0.001"
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">Max Deposit</Label>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    value={newAddressForm.max_deposit}
                    onChange={(e) => setNewAddressForm({ ...newAddressForm, max_deposit: e.target.value })}
                    className="rounded-lg border-[#1e1e1e] bg-[#111] text-sm h-9 text-white placeholder:text-gray-500 focus:border-blue-500"
                    placeholder="e.g., 100"
                  />
                </div>
                <div className="flex items-end">
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">Deposit Fee (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={newAddressForm.deposit_fee_rate}
                    onChange={(e) => setNewAddressForm({ ...newAddressForm, deposit_fee_rate: e.target.value })}
                    className="rounded-lg border-[#1e1e1e] bg-[#111] text-sm h-9 text-white placeholder:text-gray-500 focus:border-blue-500"
                    placeholder="e.g., 1.5"
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">Withdrawal Fee (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={newAddressForm.withdrawal_fee_rate}
                    onChange={(e) => setNewAddressForm({ ...newAddressForm, withdrawal_fee_rate: e.target.value })}
                    className="rounded-lg border-[#1e1e1e] bg-[#111] text-sm h-9 text-white placeholder:text-gray-500 focus:border-blue-500"
                    placeholder="e.g., 0.5"
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    size="sm"
                    className="h-9 rounded-lg bg-orange-500 hover:bg-orange-600 w-full md:w-auto"
                    onClick={createAddress}
                    disabled={!newAddressForm.asset_symbol || !newAddressForm.address || !newAddressForm.network}
                  >
                    Add
                  </Button>
                </div>
              </div>
            </div>

            {depositAddresses.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-14 h-14 bg-[#1a1a1a] rounded-2xl mx-auto mb-4 flex items-center justify-center">
                  <Wallet className="h-7 w-7 text-gray-500 fill-current" />
                </div>
                <p className="text-sm text-gray-500">No deposit addresses configured</p>
                <p className="text-xs text-gray-500 mt-1">Add addresses in the database to get started</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {depositAddresses.map((address) => (
                  <div key={address.id} className="bg-[#0a0a0a] border border-[#1e1e1e] rounded-xl p-4 hover:border-[#2a2a2a] transition-all">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-blue-400 text-sm">{address.asset_symbol}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          address.is_active 
                            ? 'bg-green-500/10 text-green-400' 
                            : 'bg-red-500/10 text-red-400'
                        }`}>
                          {address.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      {editingAddress === address.asset_symbol ? (
                        <div className="flex gap-1.5">
                          <Button size="sm" onClick={() => saveAddress(address.asset_symbol)} className="rounded-lg h-7 w-7 p-0 bg-green-600 hover:bg-green-700">
                            <Save className="w-3.5 h-3.5 fill-current" />
                          </Button>
                          <button onClick={cancelEditing} className="inline-flex items-center justify-center rounded-lg h-7 w-7 p-0 border border-[#1e1e1e] bg-[#111] text-gray-400 hover:bg-[#1a1a1a] hover:text-white transition-colors">
                            <X className="w-3.5 h-3.5 fill-current" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-1.5">
                          <button onClick={() => startEditingAddress(address)} className="inline-flex items-center justify-center rounded-lg h-7 w-7 p-0 text-gray-500 hover:text-white hover:bg-[#1a1a1a] transition-colors">
                            <Edit className="w-3.5 h-3.5 fill-current" />
                          </button>
                          <button
                            onClick={() => deleteAddress(address.asset_symbol)}
                            className="inline-flex items-center justify-center rounded-lg h-7 w-7 p-0 border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors"
                          >
                            <X className="w-3.5 h-3.5 fill-current" />
                          </button>
                        </div>
                      )}
                    </div>
                    
                    {editingAddress === address.asset_symbol ? (
                      <div className="space-y-3">
                        <div>
                          <Label className="text-xs text-gray-500 mb-1 block">Address</Label>
                          <Input
                            value={editForm.address}
                            onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                            className="rounded-lg border-[#1e1e1e] bg-[#111] text-sm h-9 text-white placeholder:text-gray-500 focus:border-blue-500"
                            placeholder="Enter deposit address"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-gray-500 mb-1 block">Network</Label>
                          <Input
                            value={editForm.network}
                            onChange={(e) => setEditForm({ ...editForm, network: e.target.value })}
                            className="rounded-lg border-[#1e1e1e] bg-[#111] text-sm h-9 text-white placeholder:text-gray-500 focus:border-blue-500"
                            placeholder="e.g., mainnet, trc20"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs text-gray-500 mb-1 block">Min Deposit</Label>
                            <Input
                              type="number"
                              step="any"
                              min="0"
                              value={editForm.min_deposit}
                              onChange={(e) => setEditForm({ ...editForm, min_deposit: e.target.value })}
                              className="rounded-lg border-[#1e1e1e] bg-[#111] text-sm h-9 text-white placeholder:text-gray-500 focus:border-blue-500"
                              placeholder="e.g., 0.001"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-gray-500 mb-1 block">Max Deposit</Label>
                            <Input
                              type="number"
                              step="any"
                              min="0"
                              value={editForm.max_deposit}
                              onChange={(e) => setEditForm({ ...editForm, max_deposit: e.target.value })}
                              className="rounded-lg border-[#1e1e1e] bg-[#111] text-sm h-9 text-white placeholder:text-gray-500 focus:border-blue-500"
                              placeholder="e.g., 100"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs text-gray-500 mb-1 block">Deposit Fee (%)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              max="100"
                              value={editForm.deposit_fee_rate}
                              onChange={(e) => setEditForm({ ...editForm, deposit_fee_rate: e.target.value })}
                              className="rounded-lg border-[#1e1e1e] bg-[#111] text-sm h-9 text-white placeholder:text-gray-500 focus:border-blue-500"
                              placeholder="e.g., 1.5"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-gray-500 mb-1 block">Withdrawal Fee (%)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              max="100"
                              value={editForm.withdrawal_fee_rate}
                              onChange={(e) => setEditForm({ ...editForm, withdrawal_fee_rate: e.target.value })}
                              className="rounded-lg border-[#1e1e1e] bg-[#111] text-sm h-9 text-white placeholder:text-gray-500 focus:border-blue-500"
                              placeholder="e.g., 0.5"
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] text-gray-400 uppercase font-medium">Address</span>
                            <button
                              onClick={() => handleCopyAddress(address.address, address.asset_symbol)}
                              className="p-0.5 hover:bg-[#1a1a1a] rounded transition-colors"
                            >
                              {copied ? (
                                <CheckCircle size={12} className="text-green-500 fill-current" />
                              ) : (
                                <Copy size={12} className="text-gray-400 fill-current" />
                              )}
                            </button>
                          </div>
                          <p 
                            className="font-mono text-xs text-gray-300 break-all cursor-pointer hover:text-blue-400 transition-colors bg-[#0d0d0d] px-2.5 py-1.5 rounded-lg border border-[#1e1e1e]"
                            onClick={() => handleCopyAddress(address.address, address.asset_symbol)}
                          >
                            {address.address}
                          </p>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <div>
                            <span className="text-gray-400">Network: </span>
                            <span className="text-gray-300 font-medium">{address.network}</span>
                          </div>
                          <span className="text-[10px] text-gray-400">{formatDate(address.updated_at)}</span>
                        </div>
                        {(address.min_deposit != null || address.max_deposit != null) && (
                          <div className="flex items-center gap-3 text-xs mt-1 pt-1 border-t border-[#1e1e1e]">
                            {address.min_deposit != null && (
                              <div>
                                <span className="text-gray-400">Min: </span>
                                <span className="text-orange-400 font-medium">{address.min_deposit} {address.asset_symbol}</span>
                              </div>
                            )}
                            {address.max_deposit != null && (
                              <div>
                                <span className="text-gray-400">Max: </span>
                                <span className="text-orange-400 font-medium">{address.max_deposit} {address.asset_symbol}</span>
                              </div>
                            )}
                          </div>
                        )}
                        {((address.deposit_fee_rate != null && address.deposit_fee_rate > 0) || (address.withdrawal_fee_rate != null && address.withdrawal_fee_rate > 0)) && (
                          <div className="flex items-center gap-3 text-xs mt-1 pt-1 border-t border-[#1e1e1e]">
                            {address.deposit_fee_rate != null && address.deposit_fee_rate > 0 && (
                              <div>
                                <span className="text-gray-400">Deposit Fee: </span>
                                <span className="text-amber-400 font-medium">{(address.deposit_fee_rate * 100).toFixed(2)}%</span>
                              </div>
                            )}
                            {address.withdrawal_fee_rate != null && address.withdrawal_fee_rate > 0 && (
                              <div>
                                <span className="text-gray-400">Withdrawal Fee: </span>
                                <span className="text-amber-400 font-medium">{(address.withdrawal_fee_rate * 100).toFixed(2)}%</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Futures Time Limits Section */}
        <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] overflow-hidden">
          <div className="p-5 border-b border-[#1e1e1e] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-purple-500/10 rounded-xl flex items-center justify-center">
                <Timer className="h-5 w-5 text-purple-400 fill-current" />
              </div>
              <div>
                <h2 className="font-semibold text-white text-sm">Futures Time Limits</h2>
                <p className="text-[11px] text-gray-500">Configure minimum trade amounts based on time duration</p>
              </div>
            </div>
            {timeLimits && (
              <button
                onClick={toggleTimeLimitsEnabled}
                disabled={timeLimitsSaving}
                className={`inline-flex items-center rounded-xl text-xs font-medium border h-9 px-4 transition-colors w-full sm:w-auto justify-center ${
                  timeLimits.enabled
                    ? 'bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20'
                    : 'bg-[#0a0a0a] border-[#1e1e1e] text-gray-400 hover:bg-[#1a1a1a]'
                }`}
              >
                {timeLimits.enabled ? 'Enabled' : 'Disabled'}
              </button>
            )}
          </div>

          <div className="p-5 space-y-5">
            {timeLimitsLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-400 mx-auto"></div>
                <div className="text-gray-500 mt-2 text-xs">Loading time limits...</div>
              </div>
            ) : !timeLimits ? (
              <div className="text-center py-8">
                <div className="w-14 h-14 bg-[#1a1a1a] rounded-2xl mx-auto mb-4 flex items-center justify-center">
                  <Timer className="h-7 w-7 text-gray-500 fill-current" />
                </div>
                <p className="text-sm text-gray-500">Unable to load time limits</p>
              </div>
            ) : (
              <>
                {/* Default Min Amount */}
                <div className="bg-[#0a0a0a] border border-[#1e1e1e] rounded-xl p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1">
                      <Label className="text-xs text-gray-500 mb-1 block">Default Minimum Amount (USDT)</Label>
                      <Input
                        type="number"
                        step="1"
                        min="0"
                        value={timeLimits.defaultMinAmount}
                        onChange={(e) => updateDefaultMinAmount(e.target.value)}
                        onBlur={saveDefaultMinAmount}
                        className="rounded-lg border-[#1e1e1e] bg-[#111] text-sm h-9 text-white placeholder:text-gray-500 focus:border-purple-500 max-w-[200px]"
                        placeholder="e.g., 50"
                      />
                      <p className="text-[10px] text-gray-500 mt-1">Fallback minimum when no specific duration limit applies</p>
                    </div>
                  </div>
                </div>

                {/* Limits Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#1e1e1e]">
                        <th className="text-left py-3 px-3 text-gray-500 font-medium text-xs uppercase tracking-wider">Duration</th>
                        <th className="text-left py-3 px-3 text-gray-500 font-medium text-xs uppercase tracking-wider">Min Amount (USDT)</th>
                        <th className="text-center py-3 px-3 text-gray-500 font-medium text-xs uppercase tracking-wider">Active</th>
                        <th className="text-right py-3 px-3 text-gray-500 font-medium text-xs uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {timeLimits.limits.map((limit) => (
                        <tr key={limit.duration} className="border-b border-[#1e1e1e] hover:bg-[#0a0a0a]">
                          <td className="py-3 px-3">
                            <span className="text-white font-medium">{formatDuration(limit.duration)}</span>
                            <span className="text-gray-500 text-xs ml-2">({limit.duration}s)</span>
                          </td>
                          <td className="py-3 px-3">
                            {editingLimit === limit.duration ? (
                              <Input
                                type="number"
                                step="1"
                                min="0"
                                value={editLimitForm.minAmount}
                                onChange={(e) => setEditLimitForm({ minAmount: e.target.value })}
                                className="rounded-lg border-[#1e1e1e] bg-[#111] text-sm h-8 text-white w-24 focus:border-purple-500"
                                autoFocus
                              />
                            ) : (
                              <span className="text-purple-400 font-semibold">${limit.minAmount}</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <button
                              onClick={() => toggleLimitActive(limit.duration)}
                              disabled={timeLimitsSaving}
                              className={`w-10 h-5 rounded-full transition-colors relative ${
                                limit.isActive ? 'bg-green-500' : 'bg-gray-600'
                              }`}
                            >
                              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                                limit.isActive ? 'left-5' : 'left-0.5'
                              }`} />
                            </button>
                          </td>
                          <td className="py-3 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {editingLimit === limit.duration ? (
                                <>
                                  <button
                                    onClick={() => saveLimitEdit(limit.duration)}
                                    className="inline-flex items-center justify-center rounded-lg h-7 w-7 p-0 bg-green-600 hover:bg-green-700 text-white transition-colors"
                                  >
                                    <Save className="w-3.5 h-3.5 fill-current" />
                                  </button>
                                  <button
                                    onClick={cancelEditingLimit}
                                    className="inline-flex items-center justify-center rounded-lg h-7 w-7 p-0 border border-[#1e1e1e] bg-[#111] text-gray-400 hover:bg-[#1a1a1a] hover:text-white transition-colors"
                                  >
                                    <X className="w-3.5 h-3.5 fill-current" />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={() => startEditingLimit(limit)}
                                    className="inline-flex items-center justify-center rounded-lg h-7 w-7 p-0 text-gray-500 hover:text-white hover:bg-[#1a1a1a] transition-colors"
                                  >
                                    <Edit className="w-3.5 h-3.5 fill-current" />
                                  </button>
                                  {!standardDurations.includes(limit.duration) && (
                                    <button
                                      onClick={() => removeLimit(limit.duration)}
                                      className="inline-flex items-center justify-center rounded-lg h-7 w-7 p-0 text-red-400 hover:bg-red-500/10 transition-colors"
                                    >
                                      <Trash2 className="w-3.5 h-3.5 fill-current" />
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Add Custom Duration */}
                {showAddLimit ? (
                  <div className="bg-[#0a0a0a] border border-[#1e1e1e] rounded-xl p-4">
                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="flex-1">
                        <Label className="text-xs text-gray-500 mb-1 block">Duration (seconds)</Label>
                        <Input
                          type="number"
                          step="1"
                          min="1"
                          value={newLimitForm.duration}
                          onChange={(e) => setNewLimitForm({ ...newLimitForm, duration: e.target.value })}
                          className="rounded-lg border-[#1e1e1e] bg-[#111] text-sm h-9 text-white placeholder:text-gray-500 focus:border-purple-500"
                          placeholder="e.g., 300"
                        />
                      </div>
                      <div className="flex-1">
                        <Label className="text-xs text-gray-500 mb-1 block">Min Amount (USDT)</Label>
                        <Input
                          type="number"
                          step="1"
                          min="0"
                          value={newLimitForm.minAmount}
                          onChange={(e) => setNewLimitForm({ ...newLimitForm, minAmount: e.target.value })}
                          className="rounded-lg border-[#1e1e1e] bg-[#111] text-sm h-9 text-white placeholder:text-gray-500 focus:border-purple-500"
                          placeholder="e.g., 100"
                        />
                      </div>
                      <div className="flex items-end gap-2">
                        <Button
                          size="sm"
                          onClick={addCustomLimit}
                          disabled={!newLimitForm.duration || !newLimitForm.minAmount || timeLimitsSaving}
                          className="h-9 rounded-lg bg-purple-600 hover:bg-purple-700"
                        >
                          Add
                        </Button>
                        <button
                          onClick={() => { setShowAddLimit(false); setNewLimitForm({ duration: '', minAmount: '' }); }}
                          className="inline-flex items-center justify-center rounded-lg h-9 w-9 p-0 border border-[#1e1e1e] bg-[#111] text-gray-400 hover:bg-[#1a1a1a] hover:text-white transition-colors"
                        >
                          <X className="w-4 h-4 fill-current" />
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowAddLimit(true)}
                    className="inline-flex items-center rounded-xl text-xs font-medium border border-dashed border-[#2a2a2a] bg-transparent text-gray-400 hover:bg-[#1a1a1a] hover:text-white hover:border-[#3a3a3a] h-10 px-4 transition-colors w-full justify-center"
                  >
                    <Plus className="h-4 w-4 mr-2 fill-current" />
                    Add Custom Duration
                  </button>
                )}

                {/* Saving indicator */}
                {timeLimitsSaving && (
                  <div className="flex items-center justify-center gap-2 text-xs text-purple-400">
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-purple-400"></div>
                    Saving changes...
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* User Management Section */}
        <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] overflow-hidden">
          <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-blue-500/10 rounded-xl flex items-center justify-center">
                <Users className="h-5 w-5 text-blue-400 fill-current" />
              </div>
              <div>
                <h2 className="font-semibold text-white text-sm">User Management</h2>
                <p className="text-[11px] text-gray-500">View and manage all user accounts</p>
              </div>
            </div>
            <Button 
              onClick={() => setShowUserManagement(true)}
              className="rounded-xl text-xs bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
              size="sm"
            >
              <Users className="h-3.5 w-3.5 mr-1.5 fill-current" />
              Manage Users
            </Button>
          </div>
        </div>

      </div>

      {/* User Management Modal */}
      <AdminUserManagementModal
        isOpen={showUserManagement}
        onClose={() => setShowUserManagement(false)}
      />
    </AdminLayout>
  );
} 
