import { useEffect, useState } from 'react';
import { formatDateTime } from '@/lib/date-utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabase';
import { Landmark, Plus, Pencil, Trash2, X, Check, Loader2 } from 'lucide-react';
import AdminLayout from './admin-layout';

interface MerchantAccount {
  id: number;
  country: string;
  bank_name: string;
  account_name: string;
  account_number: string;
  routing_info: string | null;
  instructions: string | null;
  is_active: boolean;
  sort_order: number;
}

interface BankDepositRequest {
  id: number;
  user_id: string;
  country: string;
  amount_usd: string;
  bank_name: string;
  status: 'pending' | 'approved' | 'rejected';
  admin_notes: string | null;
  rejection_reason: string | null;
  submitted_at: string;
  users: { email: string; full_name?: string; display_id?: string } | null;
}

const EMPTY_FORM = { country: '', bankName: '', accountName: '', accountNumber: '', routingInfo: '', instructions: '' };

export default function AdminBankDeposits() {
  const [loading, setLoading] = useState(true);
  const [isEnabled, setIsEnabled] = useState(false);
  const [togglingEnabled, setTogglingEnabled] = useState(false);
  const [accounts, setAccounts] = useState<MerchantAccount[]>([]);
  const [requests, setRequests] = useState<BankDepositRequest[]>([]);

  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [savingAccount, setSavingAccount] = useState(false);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [reviewingId, setReviewingId] = useState<number | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);

  const authHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' };
  };

  const loadAll = async () => {
    try {
      const headers = await authHeaders();
      const [settingsRes, accountsRes, requestsRes] = await Promise.all([
        fetch('/api/admin/bank-deposit-settings', { headers }),
        fetch('/api/admin/bank-merchant-accounts', { headers }),
        fetch('/api/admin/bank-deposit-requests', { headers }),
      ]);
      if (settingsRes.ok) setIsEnabled((await settingsRes.json()).isEnabled);
      if (accountsRes.ok) setAccounts((await accountsRes.json()).accounts || []);
      if (requestsRes.ok) setRequests(await requestsRes.json());
    } catch (err) {
      console.error('Failed to load bank deposit data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  const toggleEnabled = async (checked: boolean) => {
    setTogglingEnabled(true);
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/admin/bank-deposit-settings', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ isEnabled: checked }),
      });
      if (res.ok) setIsEnabled((await res.json()).isEnabled);
    } finally {
      setTogglingEnabled(false);
    }
  };

  const startEdit = (account: MerchantAccount) => {
    setEditingId(account.id);
    setForm({
      country: account.country,
      bankName: account.bank_name,
      accountName: account.account_name,
      accountNumber: account.account_number,
      routingInfo: account.routing_info || '',
      instructions: account.instructions || '',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const saveAccount = async () => {
    if (!form.country.trim() || !form.bankName.trim() || !form.accountName.trim() || !form.accountNumber.trim()) return;
    setSavingAccount(true);
    setAccountError(null);
    try {
      const headers = await authHeaders();
      const url = editingId ? `/api/admin/bank-merchant-accounts/${editingId}` : '/api/admin/bank-merchant-accounts';
      const res = await fetch(url, { method: editingId ? 'PUT' : 'POST', headers, body: JSON.stringify(form) });
      if (res.ok) {
        cancelEdit();
        await loadAll();
      } else {
        const err = await res.json().catch(() => ({}));
        setAccountError(err.message || 'Failed to save merchant account');
      }
    } catch {
      setAccountError('Failed to save merchant account');
    } finally {
      setSavingAccount(false);
    }
  };

  const toggleAccountActive = async (account: MerchantAccount) => {
    setAccountError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/admin/bank-merchant-accounts/${account.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          country: account.country,
          bankName: account.bank_name,
          accountName: account.account_name,
          accountNumber: account.account_number,
          routingInfo: account.routing_info,
          instructions: account.instructions,
          isActive: !account.is_active,
          sortOrder: account.sort_order,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setAccountError(err.message || 'Failed to update merchant account');
        return;
      }
      await loadAll();
    } catch {
      setAccountError('Failed to update merchant account');
    }
  };

  const deleteAccount = async (id: number) => {
    if (!confirm('Delete this merchant account?')) return;
    setAccountError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/admin/bank-merchant-accounts/${id}`, { method: 'DELETE', headers });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setAccountError(err.message || 'Failed to delete merchant account');
        return;
      }
      await loadAll();
    } catch {
      setAccountError('Failed to delete merchant account');
    }
  };

  const reviewRequest = async (id: number, action: 'approve' | 'reject') => {
    setReviewingId(id);
    try {
      const headers = await authHeaders();
      await fetch(`/api/admin/bank-deposit-requests/${id}/review`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ action, rejectionReason: action === 'reject' ? rejectionReason : undefined }),
      });
      setRejectingId(null);
      setRejectionReason('');
      await loadAll();
    } finally {
      setReviewingId(null);
    }
  };

  const pendingRequests = requests.filter(r => r.status === 'pending');
  const reviewedRequests = requests.filter(r => r.status !== 'pending');

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Bank Deposits</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage manual bank-transfer deposit requests</p>
        </div>

        {/* Enable toggle */}
        <div className="bg-card rounded-xl border border-border p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-success/10 rounded-xl flex items-center justify-center">
              <Landmark className="h-5 w-5 text-success" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground text-sm">Bank Deposits {isEnabled ? 'Enabled' : 'Disabled'}</h2>
              <p className="text-[11px] text-muted-foreground">
                {isEnabled ? 'Users can see and submit bank transfer deposit requests.' : 'Hidden from users — configure and test merchant accounts below, then enable.'}
              </p>
            </div>
          </div>
          <Switch checked={isEnabled} onCheckedChange={toggleEnabled} disabled={togglingEnabled} />
        </div>

        {/* Merchant accounts */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="p-5 border-b border-border">
            <h2 className="font-semibold text-foreground text-sm">Merchant Accounts</h2>
            <p className="text-[11px] text-muted-foreground">The bank account shown to users when they pick a country</p>
          </div>

          <div className="p-5 space-y-4">
            {accountError && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                <span>{accountError}</span>
                <button onClick={() => setAccountError(null)} className="text-danger hover:text-danger/80">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-muted/40 border border-border rounded-xl p-4">
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Country</Label>
                <Input value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} placeholder="e.g. United Kingdom" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Bank Name</Label>
                <Input value={form.bankName} onChange={e => setForm({ ...form, bankName: e.target.value })} placeholder="e.g. Barclays" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Account Holder Name</Label>
                <Input value={form.accountName} onChange={e => setForm({ ...form, accountName: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Account Number</Label>
                <Input value={form.accountNumber} onChange={e => setForm({ ...form, accountNumber: e.target.value })} className="tabular-nums" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">IBAN / SWIFT (optional)</Label>
                <Input value={form.routingInfo} onChange={e => setForm({ ...form, routingInfo: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Instructions (optional)</Label>
                <Input value={form.instructions} onChange={e => setForm({ ...form, instructions: e.target.value })} placeholder="Shown to the user under the account details" />
              </div>
              <div className="md:col-span-2 flex items-center gap-2">
                <Button onClick={saveAccount} disabled={savingAccount} size="sm">
                  {editingId ? <Pencil className="h-3.5 w-3.5 mr-1.5" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
                  {editingId ? 'Save Changes' : 'Add Account'}
                </Button>
                {editingId && (
                  <Button onClick={cancelEdit} variant="ghost" size="sm">
                    <X className="h-3.5 w-3.5 mr-1.5" /> Cancel
                  </Button>
                )}
              </div>
            </div>

            {accounts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No merchant accounts configured yet.</p>
            ) : (
              <div className="space-y-2">
                {accounts.map(account => (
                  <div key={account.id} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{account.country}</span>
                        <span className="text-xs text-muted-foreground">·</span>
                        <span className="text-xs text-muted-foreground">{account.bank_name}</span>
                      </div>
                      <p className="text-xs text-muted-foreground tabular-nums truncate">{account.account_name} — {account.account_number}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Switch checked={account.is_active} onCheckedChange={() => toggleAccountActive(account)} />
                      <Button onClick={() => startEdit(account)} variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button onClick={() => deleteAccount(account.id)} variant="ghost" size="sm" className="h-8 w-8 p-0 text-danger hover:text-danger">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Pending requests */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="p-5 border-b border-border">
            <h2 className="font-semibold text-foreground text-sm">Pending Requests ({pendingRequests.length})</h2>
          </div>
          <div className="p-5 space-y-2">
            {pendingRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No pending bank deposit requests.</p>
            ) : (
              pendingRequests.map(req => (
                <div key={req.id} className="rounded-xl border border-border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{req.users?.email || req.user_id}</p>
                      <p className="text-xs text-muted-foreground">{req.country} · {req.bank_name} · {formatDateTime(req.submitted_at)}</p>
                    </div>
                    <span className="text-sm font-semibold text-foreground tabular-nums flex-shrink-0">${Number(req.amount_usd).toFixed(2)}</span>
                  </div>

                  {rejectingId === req.id ? (
                    <div className="space-y-2">
                      <Textarea
                        value={rejectionReason}
                        onChange={e => setRejectionReason(e.target.value)}
                        placeholder="Reason for rejection (shown to the user)"
                        className="text-sm"
                        rows={2}
                      />
                      <div className="flex items-center gap-2">
                        <Button onClick={() => reviewRequest(req.id, 'reject')} disabled={reviewingId === req.id} size="sm" variant="destructive">
                          Confirm Reject
                        </Button>
                        <Button onClick={() => { setRejectingId(null); setRejectionReason(''); }} variant="ghost" size="sm">Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Button onClick={() => reviewRequest(req.id, 'approve')} disabled={reviewingId === req.id} size="sm" className="bg-success hover:bg-success/90 text-success-foreground">
                        <Check className="h-3.5 w-3.5 mr-1.5" /> Approve & Credit
                      </Button>
                      <Button onClick={() => setRejectingId(req.id)} disabled={reviewingId === req.id} size="sm" variant="outline">
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Reviewed history */}
        {reviewedRequests.length > 0 && (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="p-5 border-b border-border">
              <h2 className="font-semibold text-foreground text-sm">History</h2>
            </div>
            <div className="divide-y divide-border">
              {reviewedRequests.slice(0, 50).map(req => (
                <div key={req.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm text-foreground truncate">{req.users?.email || req.user_id}</p>
                    <p className="text-xs text-muted-foreground">{req.country} · {req.bank_name}</p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-sm font-medium text-foreground tabular-nums">${Number(req.amount_usd).toFixed(2)}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${req.status === 'approved' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                      {req.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
