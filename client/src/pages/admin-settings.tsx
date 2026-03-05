import { useEffect, useState } from 'react';
import { formatDate } from '@/lib/date-utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AdminUserManagementModal } from '@/components/modals/admin-user-management-modal';
import { Users, Wallet, Edit, Save, X, Copy, CheckCircle, RefreshCw } from 'lucide-react';
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
  created_at: string;
  updated_at: string;
  updated_by?: string;
}

export default function AdminSettings() {
  const [users, setUsers] = useState<User[]>([]);
  const [depositAddresses, setDepositAddresses] = useState<DepositAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUserManagement, setShowUserManagement] = useState(false);
  const [editingAddress, setEditingAddress] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ address: '', network: '' });
  const [newAddressForm, setNewAddressForm] = useState({ asset_symbol: '', address: '', network: '' });
  const { copied, copyToClipboard } = useCopyToClipboard();

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

        setLoading(false);
      } catch (err) {
        setError('Failed to load data');
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const toggleUser = async (user: User) => {
    const updated = { ...user, is_active: !user.is_active };
    // Update on server
    await fetch(`/api/users/${user.id}/toggle`, { method: 'POST' });
    // Update locally
    setUsers(users => users.map(u => u.id === user.id ? updated : u));
  };

  const startEditingAddress = (address: DepositAddress) => {
    setEditingAddress(address.asset_symbol);
    setEditForm({ address: address.address, network: address.network });
  };

  const cancelEditing = () => {
    setEditingAddress(null);
    setEditForm({ address: '', network: '' });
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
        body: JSON.stringify(editForm)
      });

      if (response.ok) {
        const result = await response.json();
        setDepositAddresses(addresses => 
          addresses.map(addr => 
            addr.asset_symbol === assetSymbol 
              ? { ...addr, address: editForm.address, network: editForm.network, updated_at: new Date().toISOString() }
              : addr
          )
        );
        setEditingAddress(null);
        setEditForm({ address: '', network: '' });
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

      setNewAddressForm({ asset_symbol: '', address: '', network: '' });
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
        <div className="bg-red-50 text-red-700 rounded-2xl p-6 text-sm">{error}</div>
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
                <Wallet className="h-5 w-5 text-orange-400" />
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
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
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
                  <Button
                    size="sm"
                    className="h-9 rounded-lg bg-orange-500 hover:bg-orange-600"
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
                  <Wallet className="h-7 w-7 text-gray-500" />
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
                            <Save className="w-3.5 h-3.5" />
                          </Button>
                          <button onClick={cancelEditing} className="inline-flex items-center justify-center rounded-lg h-7 w-7 p-0 border border-[#1e1e1e] bg-[#111] text-gray-400 hover:bg-[#1a1a1a] hover:text-white transition-colors">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-1.5">
                          <button onClick={() => startEditingAddress(address)} className="inline-flex items-center justify-center rounded-lg h-7 w-7 p-0 text-gray-500 hover:text-white hover:bg-[#1a1a1a] transition-colors">
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => deleteAddress(address.asset_symbol)}
                            className="inline-flex items-center justify-center rounded-lg h-7 w-7 p-0 border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
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
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] text-gray-400 uppercase font-medium">Address</span>
                            <button
                              onClick={() => handleCopyAddress(address.address, address.asset_symbol)}
                              className="p-0.5 hover:bg-gray-200 rounded transition-colors"
                            >
                              {copied ? (
                                <CheckCircle size={12} className="text-green-500" />
                              ) : (
                                <Copy size={12} className="text-gray-400" />
                              )}
                            </button>
                          </div>
                          <p 
                            className="font-mono text-xs text-gray-700 break-all cursor-pointer hover:text-blue-600 transition-colors bg-white px-2.5 py-1.5 rounded-lg border border-gray-100"
                            onClick={() => handleCopyAddress(address.address, address.asset_symbol)}
                          >
                            {address.address}
                          </p>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <div>
                            <span className="text-gray-400">Network: </span>
                            <span className="text-gray-700 font-medium">{address.network}</span>
                          </div>
                          <span className="text-[10px] text-gray-400">{formatDate(address.updated_at)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* User Management Section */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900 text-sm">User Management</h2>
                <p className="text-[11px] text-gray-400">View and manage all user accounts</p>
              </div>
            </div>
            <Button 
              onClick={() => setShowUserManagement(true)}
              className="rounded-xl text-xs bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
              size="sm"
            >
              <Users className="h-3.5 w-3.5 mr-1.5" />
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
