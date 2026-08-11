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
import { ACCENT_THEMES, ACCENT_THEME_KEYS, DEFAULT_ACCENT_THEME, type AccentThemeKey } from '@shared/accent-themes';

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

  // Branding — exchange display name
  const [exchangeName, setExchangeName] = useState('');
  const [exchangeNameSaving, setExchangeNameSaving] = useState(false);
  const [exchangeNameMessage, setExchangeNameMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [accentTheme, setAccentTheme] = useState<AccentThemeKey>(DEFAULT_ACCENT_THEME);

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

  const saveExchangeName = async () => {
    const trimmed = exchangeName.trim();
    if (!trimmed) {
      setExchangeNameMessage({ type: 'error', text: 'Exchange name cannot be empty' });
      return;
    }
    setExchangeNameSaving(true);
    setExchangeNameMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setExchangeNameMessage({ type: 'error', text: 'Not authenticated' });
        return;
      }
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ exchangeName: trimmed, accentTheme })
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.message || 'Failed to save');
      }
      const data = await response.json();
      setExchangeName(data.exchangeName);
      if (data.accentTheme && ACCENT_THEME_KEYS.includes(data.accentTheme)) {
        setAccentTheme(data.accentTheme);
      }
      setExchangeNameMessage({ type: 'success', text: 'Branding updated' });
    } catch (err: any) {
      setExchangeNameMessage({ type: 'error', text: err.message || 'Failed to save exchange name' });
    } finally {
      setExchangeNameSaving(false);
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

        // Fetch current exchange name
        try {
          const settingsResponse = await fetch('/api/settings');
          if (settingsResponse.ok) {
            const settingsData = await settingsResponse.json();
            setExchangeName(settingsData.exchangeName || '');
            if (settingsData.accentTheme && ACCENT_THEME_KEYS.includes(settingsData.accentTheme)) {
              setAccentTheme(settingsData.accentTheme);
            }
          }
        } catch (err) {
          console.error('Failed to fetch app settings:', err);
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
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-border border-t-primary mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Loading settings...</p>
        </div>
      </div>
    </AdminLayout>
  );
  if (error) return (
    <AdminLayout>
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="bg-danger/10 border border-danger/30 text-danger rounded-xl p-6 text-sm flex flex-col items-center gap-3 max-w-sm text-center">
          <span>{error}</span>
          <Button size="sm" variant="outline" className="text-xs border-danger/30 text-danger hover:bg-danger/10" onClick={() => { setError(null); setLoading(true); window.location.reload(); }}>
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
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">Configure platform deposit addresses and manage users</p>
        </div>

        {/* Branding */}
        <div className="bg-card rounded-xl border border-border overflow-hidden shadow-sm">
          <div className="p-5 border-b border-border">
            <h2 className="font-semibold text-foreground text-sm">Branding</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Controls the exchange name shown across the app, notifications, and support replies</p>
          </div>
          <div className="p-5 space-y-5">
            <div>
              <Label htmlFor="exchangeName" className="text-xs text-muted-foreground mb-1.5 block">Exchange Name</Label>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  id="exchangeName"
                  value={exchangeName}
                  onChange={(e) => setExchangeName(e.target.value)}
                  maxLength={60}
                  placeholder="e.g. Becxus"
                  className="rounded-lg"
                />
                <Button
                  onClick={saveExchangeName}
                  disabled={exchangeNameSaving}
                  className="rounded-lg whitespace-nowrap"
                >
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                  {exchangeNameSaving ? 'Saving...' : 'Save'}
                </Button>
              </div>
              {exchangeNameMessage && (
                <p className={`text-xs mt-2 ${exchangeNameMessage.type === 'success' ? 'text-success' : 'text-danger'}`}>
                  {exchangeNameMessage.text}
                </p>
              )}
            </div>

            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">Accent Color</Label>
              <div className="flex flex-wrap gap-2">
                {ACCENT_THEME_KEYS.map((key) => {
                  const preset = ACCENT_THEMES[key];
                  const isSelected = accentTheme === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setAccentTheme(key)}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                        isSelected
                          ? 'border-primary/50 bg-primary/10 text-foreground'
                          : 'border-border bg-background text-muted-foreground hover:border-foreground/20 hover:text-foreground'
                      }`}
                    >
                      <span
                        className="h-4 w-4 rounded-full border border-border"
                        style={{ backgroundColor: `hsl(${preset.primary})` }}
                      />
                      {preset.label}
                      {isSelected && <CheckCircle className="h-3.5 w-3.5" />}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-2">Applies as the primary accent across buttons, links, and highlights app-wide. Click Save above to apply.</p>
            </div>
          </div>
        </div>

        {/* Deposit Address Management */}
        <div className="bg-card rounded-xl border border-border overflow-hidden shadow-sm">
          <div className="p-5 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
                <Wallet className="h-5 w-5 text-foreground" />
              </div>
              <div>
                <h2 className="font-semibold text-foreground text-sm">Deposit Addresses</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Addresses shown to all users for deposits</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={refreshDepositAddresses}
              className="rounded-lg w-full sm:w-auto"
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Refresh
            </Button>
          </div>

          <div className="p-5 space-y-5">
            <div className="bg-background border border-border rounded-lg p-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Asset Symbol</Label>
                  <Input
                    value={newAddressForm.asset_symbol}
                    onChange={(e) => setNewAddressForm({ ...newAddressForm, asset_symbol: e.target.value })}
                    className="rounded-lg h-9 text-sm"
                    placeholder="e.g., BTC, ETH, USDT"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Address</Label>
                  <Input
                    value={newAddressForm.address}
                    onChange={(e) => setNewAddressForm({ ...newAddressForm, address: e.target.value })}
                    className="rounded-lg h-9 text-sm"
                    placeholder="Enter deposit address"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Network</Label>
                  <Input
                    value={newAddressForm.network}
                    onChange={(e) => setNewAddressForm({ ...newAddressForm, network: e.target.value })}
                    className="rounded-lg h-9 text-sm"
                    placeholder="e.g., mainnet, ethereum, trc20"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Min Deposit</Label>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    value={newAddressForm.min_deposit}
                    onChange={(e) => setNewAddressForm({ ...newAddressForm, min_deposit: e.target.value })}
                    className="rounded-lg h-9 text-sm"
                    placeholder="e.g., 0.001"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Max Deposit</Label>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    value={newAddressForm.max_deposit}
                    onChange={(e) => setNewAddressForm({ ...newAddressForm, max_deposit: e.target.value })}
                    className="rounded-lg h-9 text-sm"
                    placeholder="e.g., 100"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Deposit Fee (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={newAddressForm.deposit_fee_rate}
                    onChange={(e) => setNewAddressForm({ ...newAddressForm, deposit_fee_rate: e.target.value })}
                    className="rounded-lg h-9 text-sm"
                    placeholder="e.g., 1.5"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Withdrawal Fee (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={newAddressForm.withdrawal_fee_rate}
                    onChange={(e) => setNewAddressForm({ ...newAddressForm, withdrawal_fee_rate: e.target.value })}
                    className="rounded-lg h-9 text-sm"
                    placeholder="e.g., 0.5"
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    size="sm"
                    className="rounded-lg h-9 w-full md:w-auto"
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
                <div className="w-14 h-14 bg-muted rounded-xl mx-auto mb-4 flex items-center justify-center">
                  <Wallet className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">No deposit addresses configured</p>
                <p className="text-xs text-muted-foreground mt-1">Add addresses in the database to get started</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {depositAddresses.map((address) => (
                  <div key={address.id} className="bg-background border border-border rounded-lg p-4 hover:border-foreground/20 transition-colors">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground text-sm">{address.asset_symbol}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          address.is_active
                            ? 'bg-success/10 text-success'
                            : 'bg-danger/10 text-danger'
                        }`}>
                          {address.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      {editingAddress === address.asset_symbol ? (
                        <div className="flex gap-1.5">
                          <Button size="sm" onClick={() => saveAddress(address.asset_symbol)} className="rounded-lg h-7 w-7 p-0 bg-success hover:bg-success/90 text-success-foreground">
                            <Save className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={cancelEditing} className="rounded-lg h-7 w-7 p-0">
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex gap-1.5">
                          <Button size="sm" variant="ghost" onClick={() => startEditingAddress(address)} className="rounded-lg h-7 w-7 p-0 text-muted-foreground hover:text-foreground">
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => deleteAddress(address.asset_symbol)}
                            className="rounded-lg h-7 w-7 p-0 border-danger/40 text-danger hover:bg-danger/10"
                          >
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>

                    {editingAddress === address.asset_symbol ? (
                      <div className="space-y-3">
                        <div>
                          <Label className="text-xs text-muted-foreground mb-1.5 block">Address</Label>
                          <Input
                            value={editForm.address}
                            onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                            className="rounded-lg h-9 text-sm"
                            placeholder="Enter deposit address"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground mb-1.5 block">Network</Label>
                          <Input
                            value={editForm.network}
                            onChange={(e) => setEditForm({ ...editForm, network: e.target.value })}
                            className="rounded-lg h-9 text-sm"
                            placeholder="e.g., mainnet, trc20"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs text-muted-foreground mb-1.5 block">Min Deposit</Label>
                            <Input
                              type="number"
                              step="any"
                              min="0"
                              value={editForm.min_deposit}
                              onChange={(e) => setEditForm({ ...editForm, min_deposit: e.target.value })}
                              className="rounded-lg h-9 text-sm"
                              placeholder="e.g., 0.001"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground mb-1.5 block">Max Deposit</Label>
                            <Input
                              type="number"
                              step="any"
                              min="0"
                              value={editForm.max_deposit}
                              onChange={(e) => setEditForm({ ...editForm, max_deposit: e.target.value })}
                              className="rounded-lg h-9 text-sm"
                              placeholder="e.g., 100"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs text-muted-foreground mb-1.5 block">Deposit Fee (%)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              max="100"
                              value={editForm.deposit_fee_rate}
                              onChange={(e) => setEditForm({ ...editForm, deposit_fee_rate: e.target.value })}
                              className="rounded-lg h-9 text-sm"
                              placeholder="e.g., 1.5"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground mb-1.5 block">Withdrawal Fee (%)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              max="100"
                              value={editForm.withdrawal_fee_rate}
                              onChange={(e) => setEditForm({ ...editForm, withdrawal_fee_rate: e.target.value })}
                              className="rounded-lg h-9 text-sm"
                              placeholder="e.g., 0.5"
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] text-muted-foreground uppercase font-medium tracking-wide">Address</span>
                            <button
                              onClick={() => handleCopyAddress(address.address, address.asset_symbol)}
                              className="p-0.5 hover:bg-muted rounded transition-colors"
                            >
                              {copied ? (
                                <CheckCircle size={12} className="text-success" />
                              ) : (
                                <Copy size={12} className="text-muted-foreground" />
                              )}
                            </button>
                          </div>
                          <p
                            className="font-mono text-xs text-foreground break-all cursor-pointer hover:text-primary transition-colors bg-muted px-2.5 py-1.5 rounded-lg border border-border"
                            onClick={() => handleCopyAddress(address.address, address.asset_symbol)}
                          >
                            {address.address}
                          </p>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <div>
                            <span className="text-muted-foreground">Network: </span>
                            <span className="text-foreground font-medium">{address.network}</span>
                          </div>
                          <span className="text-[10px] text-muted-foreground">{formatDate(address.updated_at)}</span>
                        </div>
                        {(address.min_deposit != null || address.max_deposit != null) && (
                          <div className="flex items-center gap-3 text-xs pt-2 border-t border-border">
                            {address.min_deposit != null && (
                              <div>
                                <span className="text-muted-foreground">Min: </span>
                                <span className="text-foreground font-medium">{address.min_deposit} {address.asset_symbol}</span>
                              </div>
                            )}
                            {address.max_deposit != null && (
                              <div>
                                <span className="text-muted-foreground">Max: </span>
                                <span className="text-foreground font-medium">{address.max_deposit} {address.asset_symbol}</span>
                              </div>
                            )}
                          </div>
                        )}
                        {((address.deposit_fee_rate != null && address.deposit_fee_rate > 0) || (address.withdrawal_fee_rate != null && address.withdrawal_fee_rate > 0)) && (
                          <div className="flex items-center gap-3 text-xs pt-2 border-t border-border">
                            {address.deposit_fee_rate != null && address.deposit_fee_rate > 0 && (
                              <div>
                                <span className="text-muted-foreground">Deposit Fee: </span>
                                <span className="text-warning font-medium">{(address.deposit_fee_rate * 100).toFixed(2)}%</span>
                              </div>
                            )}
                            {address.withdrawal_fee_rate != null && address.withdrawal_fee_rate > 0 && (
                              <div>
                                <span className="text-muted-foreground">Withdrawal Fee: </span>
                                <span className="text-warning font-medium">{(address.withdrawal_fee_rate * 100).toFixed(2)}%</span>
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
        <div className="bg-card rounded-xl border border-border overflow-hidden shadow-sm">
          <div className="p-5 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
                <Timer className="h-5 w-5 text-foreground" />
              </div>
              <div>
                <h2 className="font-semibold text-foreground text-sm">Futures Time Limits</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Configure minimum trade amounts based on time duration</p>
              </div>
            </div>
            {timeLimits && (
              <button
                onClick={toggleTimeLimitsEnabled}
                disabled={timeLimitsSaving}
                className={`inline-flex items-center justify-center rounded-lg text-xs font-medium border h-9 px-4 transition-colors w-full sm:w-auto ${
                  timeLimits.enabled
                    ? 'bg-success/10 border-success/30 text-success hover:bg-success/20'
                    : 'bg-background border-border text-muted-foreground hover:bg-muted'
                }`}
              >
                {timeLimits.enabled ? 'Enabled' : 'Disabled'}
              </button>
            )}
          </div>

          <div className="p-5 space-y-5">
            {timeLimitsLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-border border-t-primary mx-auto" />
                <div className="text-muted-foreground mt-2 text-xs">Loading time limits...</div>
              </div>
            ) : !timeLimits ? (
              <div className="text-center py-8">
                <div className="w-14 h-14 bg-muted rounded-xl mx-auto mb-4 flex items-center justify-center">
                  <Timer className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">Unable to load time limits</p>
              </div>
            ) : (
              <>
                {/* Default Min Amount */}
                <div className="bg-background border border-border rounded-lg p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1">
                      <Label className="text-xs text-muted-foreground mb-1.5 block">Default Minimum Amount (USDT)</Label>
                      <Input
                        type="number"
                        step="1"
                        min="0"
                        value={timeLimits.defaultMinAmount}
                        onChange={(e) => updateDefaultMinAmount(e.target.value)}
                        onBlur={saveDefaultMinAmount}
                        className="rounded-lg h-9 text-sm max-w-[200px]"
                        placeholder="e.g., 50"
                      />
                      <p className="text-xs text-muted-foreground mt-1.5">Fallback minimum when no specific duration limit applies</p>
                    </div>
                  </div>
                </div>

                {/* Limits Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-3 px-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">Duration</th>
                        <th className="text-left py-3 px-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">Min Amount (USDT)</th>
                        <th className="text-center py-3 px-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">Active</th>
                        <th className="text-right py-3 px-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {timeLimits.limits.map((limit) => (
                        <tr key={limit.duration} className="border-b border-border hover:bg-muted/50">
                          <td className="py-3 px-3">
                            <span className="text-foreground font-medium">{formatDuration(limit.duration)}</span>
                            <span className="text-muted-foreground text-xs ml-2">({limit.duration}s)</span>
                          </td>
                          <td className="py-3 px-3">
                            {editingLimit === limit.duration ? (
                              <Input
                                type="number"
                                step="1"
                                min="0"
                                value={editLimitForm.minAmount}
                                onChange={(e) => setEditLimitForm({ minAmount: e.target.value })}
                                className="rounded-lg h-8 w-24 text-sm"
                                autoFocus
                              />
                            ) : (
                              <span className="text-primary font-semibold">${limit.minAmount}</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <button
                              onClick={() => toggleLimitActive(limit.duration)}
                              disabled={timeLimitsSaving}
                              className={`w-10 h-5 rounded-full transition-colors relative ${
                                limit.isActive ? 'bg-success' : 'bg-muted'
                              }`}
                            >
                              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-primary-foreground transition-transform ${
                                limit.isActive ? 'left-5' : 'left-0.5'
                              }`} />
                            </button>
                          </td>
                          <td className="py-3 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {editingLimit === limit.duration ? (
                                <>
                                  <Button
                                    size="sm"
                                    onClick={() => saveLimitEdit(limit.duration)}
                                    className="rounded-lg h-7 w-7 p-0 bg-success hover:bg-success/90 text-success-foreground"
                                  >
                                    <Save className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={cancelEditingLimit}
                                    className="rounded-lg h-7 w-7 p-0"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => startEditingLimit(limit)}
                                    className="rounded-lg h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                  >
                                    <Edit className="w-3.5 h-3.5" />
                                  </Button>
                                  {!standardDurations.includes(limit.duration) && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => removeLimit(limit.duration)}
                                      className="rounded-lg h-7 w-7 p-0 text-danger hover:bg-danger/10"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
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
                  <div className="bg-background border border-border rounded-lg p-4">
                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="flex-1">
                        <Label className="text-xs text-muted-foreground mb-1.5 block">Duration (seconds)</Label>
                        <Input
                          type="number"
                          step="1"
                          min="1"
                          value={newLimitForm.duration}
                          onChange={(e) => setNewLimitForm({ ...newLimitForm, duration: e.target.value })}
                          className="rounded-lg h-9 text-sm"
                          placeholder="e.g., 300"
                        />
                      </div>
                      <div className="flex-1">
                        <Label className="text-xs text-muted-foreground mb-1.5 block">Min Amount (USDT)</Label>
                        <Input
                          type="number"
                          step="1"
                          min="0"
                          value={newLimitForm.minAmount}
                          onChange={(e) => setNewLimitForm({ ...newLimitForm, minAmount: e.target.value })}
                          className="rounded-lg h-9 text-sm"
                          placeholder="e.g., 100"
                        />
                      </div>
                      <div className="flex items-end gap-2">
                        <Button
                          size="sm"
                          onClick={addCustomLimit}
                          disabled={!newLimitForm.duration || !newLimitForm.minAmount || timeLimitsSaving}
                          className="rounded-lg h-9"
                        >
                          Add
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { setShowAddLimit(false); setNewLimitForm({ duration: '', minAmount: '' }); }}
                          className="rounded-lg h-9 w-9 p-0"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowAddLimit(true)}
                    className="inline-flex items-center justify-center rounded-lg text-xs font-medium border border-dashed border-border bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground hover:border-foreground/30 h-10 px-4 transition-colors w-full"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Custom Duration
                  </button>
                )}

                {/* Saving indicator */}
                {timeLimitsSaving && (
                  <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                    <div className="animate-spin rounded-full h-3 w-3 border-2 border-border border-t-primary" />
                    Saving changes...
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* User Management Section */}
        <div className="bg-card rounded-xl border border-border overflow-hidden shadow-sm">
          <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
                <Users className="h-5 w-5 text-foreground" />
              </div>
              <div>
                <h2 className="font-semibold text-foreground text-sm">User Management</h2>
                <p className="text-xs text-muted-foreground mt-0.5">View and manage all user accounts</p>
              </div>
            </div>
            <Button
              onClick={() => setShowUserManagement(true)}
              className="rounded-lg text-xs w-full sm:w-auto"
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
