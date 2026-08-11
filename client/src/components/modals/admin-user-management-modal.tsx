import React, { useState, useEffect } from 'react';
import { formatDate, formatDateTime } from '@/lib/date-utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CreditScoreBadge } from '@/components/ui/credit-score-badge';
import { CryptoIcon } from '@/components/crypto/crypto-icon';
import { 
  Search, Edit, Save, X, User, Mail, Shield, CheckCircle, XCircle, 
  Trash2, History, Power, PowerOff, Eye, AlertTriangle, Settings
} from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { buildApiUrl } from '../../lib/config';

// Dispatch a local sync event to trigger React Query cache invalidation
function dispatchSyncEvent(action: string, userId: string) {
  window.dispatchEvent(new CustomEvent('userDataChanged', {
    detail: {
      action,
      userId,
      timestamp: new Date().toISOString(),
    }
  }));
}

interface User {
  id: string;
  username: string;
  email: string;
  full_name: string;
  role: string;
  is_verified: boolean;
  is_active: boolean;
  credit_score: number;
  created_at: string;
  display_id: string;
  profile_picture: string;
  phone: string;
  
  // Auth data
  email_confirmed_at: string;
  last_sign_in_at: string;
  
  // Financial data
  portfolio: any[];
  total_portfolio_value: number;
  trade_count: number;
  assets_count: number;
  
  // KYC data
  kyc_status: string;
  kyc_submitted_at: string;
  kyc_reviewed_at: string;
  kyc_rejection_reason: string;
  
  // Loan data
  loans: any[];
  total_loan_amount: number;
  active_loans_count: number;
  
  // Staking data
  staking_positions: any[];
  total_staking_amount: number;
  active_staking_count: number;
}

interface AdminUserManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialUserId?: string; // New prop to allow opening directly to a specific user
}

export const AdminUserManagementModal: React.FC<AdminUserManagementModalProps> = ({
  isOpen,
  onClose,
  initialUserId
}) => {
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingCreditScore, setEditingCreditScore] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showUserDetails, setShowUserDetails] = useState(false);
  const [stakingUpdatingId, setStakingUpdatingId] = useState<number | null>(null);


  // Manage Transactions state
  const [showManageTransactions, setShowManageTransactions] = useState(false);
  const [manageTransactionsData, setManageTransactionsData] = useState<Array<{ id: number; type: 'deposit' | 'withdraw'; symbol: string; amount: number; status: string; hidden_for_user?: boolean }>>([]);
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<Set<number>>(new Set());

  // Portfolio editor state
  const [showPortfolioEditor, setShowPortfolioEditor] = useState(false);
  const [portfolioBTC, setPortfolioBTC] = useState<string>('0');
  const [portfolioETH, setPortfolioETH] = useState<string>('0');
  const [portfolioUSDT, setPortfolioUSDT] = useState<string>('0');

  // Confirmation action state
  const [confirmAction, setConfirmAction] = useState<{ type: string | null; user: User | null }>({ type: null, user: null });

  useEffect(() => {
    if (isOpen) {
      fetchUsers();
    } else {
      // Reset state when modal closes
      setUsers([]);
      setSelectedUser(null);
      setError(null);
      setShowManageTransactions(false);
      setShowPortfolioEditor(false);
    }
  }, [isOpen, initialUserId]);

  useEffect(() => {
    const filtered = users.filter(user =>
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.id.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredUsers(filtered);
  }, [users, searchTerm]);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('No authentication token');

      if (initialUserId) {
        // If an initialUserId is provided, fetch only that user from admin API
        const response = await fetch(`/api/admin/users?refresh=true&t=${Date.now()}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        if (!response.ok) throw new Error('Failed to fetch users');
        const { users } = await response.json();
        const user = users.find((u: User) => u.id === initialUserId);

        if (!user) throw new Error('User not found');
        setUsers([user]); // Set the single user in the users list
        setSelectedUser(user); // Set this user as the selected user
      } else {
        // Fetch all users from admin API
        const response = await fetch(`/api/admin/users?refresh=true&t=${Date.now()}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        if (!response.ok) throw new Error('Failed to fetch users');
        const { users } = await response.json();
        setUsers(users || []);
        setSelectedUser(null); // Ensure no user is selected initially if showing all
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEditCreditScore = (user: User) => {
    setEditingUserId(user.id);
    // Credit score is now stored as direct value (0-850)
    const displayScore = user.credit_score || 60;
    setEditingCreditScore(displayScore.toString());
  };

  const handleSaveCreditScore = async () => {
    if (!editingUserId) return;

    const creditScoreValue = parseInt(editingCreditScore);
    if (isNaN(creditScoreValue) || creditScoreValue < 0 || creditScoreValue > 850) {
      setError('Credit score must be between 0 and 850');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      // Get current user session for authentication
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        throw new Error('Admin not authenticated');
      }

      // Call the admin API endpoint
      const response = await fetch(buildApiUrl('/admin/user-management/update-credit-score'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          userId: editingUserId,
          creditScore: creditScoreValue
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Failed to update credit score');
      }

      // Update local state
      setUsers(prev => prev.map(user =>
        user.id === editingUserId
          ? { ...user, credit_score: creditScoreValue }
          : user
      ));

      setEditingUserId(null);
      setEditingCreditScore('');
      dispatchSyncEvent('update-user', editingUserId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingUserId(null);
    setEditingCreditScore('');
    setError(null);
  };

  // User Management Functions
  const handleToggleUser = async (user: User) => {
    try {
      const response = await fetch(buildApiUrl('/admin/toggle-user-status'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        },
        body: JSON.stringify({
          userId: user.id,
          isActive: !user.is_active
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update user status');
      }

      const result = await response.json();

      // Update local state
      setUsers(prev => prev.map(u => 
        u.id === user.id ? { ...u, is_active: !u.is_active } : u
      ));

      // Update selected user if it's the same user
      if (selectedUser && selectedUser.id === user.id) {
        setSelectedUser({ ...selectedUser, is_active: !user.is_active });
      }

      dispatchSyncEvent('update-user', user.id);
    } catch (err: any) {
      setError(`Failed to ${user.is_active ? 'disable' : 'enable'} user: ${err.message}`);
    }
  };

  const handleDeleteUserHistory = async (user: User) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('No authentication token available');

      // Use server API to delete trades (soft-hide)
      const response = await fetch(buildApiUrl('/admin/user-management/delete-trades'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ userId: user.id }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.message || 'Failed to delete user history');
      }

      setError(null);
      dispatchSyncEvent('delete-trades', user.id);
    } catch (err: any) {
      setError(`Failed to delete user history: ${err.message}`);
    }
  };

  const handleDeleteUser = async (user: User) => {
    try {
      const reason = window.prompt('Reason for deleting this user (optional):', 'Admin requested account removal') || '';

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('No authentication token available');

      const response = await fetch(buildApiUrl('/admin/user-management/delete-user'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ userId: user.id, reason: reason.trim() })
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.message || 'Failed to delete user');
      }

      setUsers(prev => prev.filter(u => u.id !== user.id));
      setError(null);
    } catch (err: any) {
      setError(`Failed to delete user: ${err.message}`);
    }
  };

  const handleViewUserDetails = (user: User) => {
    setSelectedUser(user);
    setShowUserDetails(true);
  };

  // Hide orders (soft delete for user view) - Exchange page orders
  const handleHideOrders = async (user: User) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('No authentication token available');

      const response = await fetch(buildApiUrl('/admin/user-management/delete-trades'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ userId: user.id }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.message || 'Failed to hide orders');
      }

      setConfirmAction({ type: null, user: null });
      dispatchSyncEvent('delete-trades', user.id);
    } catch (err: any) {
      setError(`Failed to hide orders: ${err.message}`);
    }
  };

  // Hide futures trades (soft delete for user view) - Trading page futures trades
  const handleHideFuturesTrades = async (user: User) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      if (!token) {
        throw new Error('No authentication token available');
      }

      const response = await fetch('/api/admin/delete-futures-trade-history', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          userId: user.id
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to delete futures trade history');
      }
      setConfirmAction({ type: null, user: null });
      dispatchSyncEvent('delete-trades', user.id);
    } catch (err: any) {
      setError(`Failed to hide futures trades: ${err.message}`);
    }
  };

  // Reset verification (email/kyc flags)
  const handleResetVerification = async (user: User) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('No authentication token available');

      const response = await fetch(buildApiUrl('/admin/user-management/reset-verification'), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: user.id }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to reset verification');
      }

      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_verified: false } : u));
      setConfirmAction({ type: null, user: null });
      dispatchSyncEvent('update-user', user.id);
    } catch (err: any) {
      setError(`Failed to reset verification: ${err.message}`);
    }
  };



  // Manage transactions UI helpers
  const openManageTransactions = async (user: User) => {
    try {
      setSelectedUser(user);
      setShowManageTransactions(true);
      setManageTransactionsData([]);
      setSelectedTransactionIds(new Set());

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('No authentication token available');

      const [depositsRes, withdrawsRes] = await Promise.all([
        fetch(buildApiUrl('/admin/deposit-requests'), {
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        }),
        fetch(buildApiUrl('/admin/withdraw-requests'), {
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        }),
      ]);

      const depositsData = depositsRes.ok ? await depositsRes.json() : [];
      const withdrawsData = withdrawsRes.ok ? await withdrawsRes.json() : [];

      // Both endpoints return arrays directly
      const allDeposits = Array.isArray(depositsData) ? depositsData : (depositsData.requests || []);
      const allWithdraws = Array.isArray(withdrawsData) ? withdrawsData : (withdrawsData.requests || []);

      const deposits = allDeposits.filter((d: any) => d.user_id === user.id);
      const withdraws = allWithdraws.filter((w: any) => w.user_id === user.id);

      const mapped = [
        ...deposits.map((d: any) => ({ id: d.id as number, type: 'deposit' as const, symbol: d.symbol, amount: Number(d.amount), status: d.status, hidden_for_user: d.hidden_for_user })),
        ...withdraws.map((w: any) => ({ id: w.id as number, type: 'withdraw' as const, symbol: w.symbol, amount: Number(w.amount), status: w.status, hidden_for_user: w.hidden_for_user })),
      ];
      setManageTransactionsData(mapped);
    } catch (err: any) {
      setError(`Failed to load transactions: ${err.message}`);
    }
  };

  const applyHideSelectedTransactions = async () => {
    if (!selectedUser) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('No authentication token available');

      const idsToHide = Array.from(selectedTransactionIds);
      const depositIds = idsToHide.filter((id) => manageTransactionsData.find(t => t.id === id)?.type === 'deposit');
      const withdrawIds = idsToHide.filter((id) => manageTransactionsData.find(t => t.id === id)?.type === 'withdraw');

      const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };

      if (depositIds.length) {
        const res = await fetch(buildApiUrl('/admin/hide-transactions'), {
          method: 'POST',
          headers,
          body: JSON.stringify({ type: 'deposit', ids: depositIds, userId: selectedUser.id }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.message || 'Failed to hide deposit transactions');
        }
      }

      if (withdrawIds.length) {
        const res = await fetch(buildApiUrl('/admin/hide-transactions'), {
          method: 'POST',
          headers,
          body: JSON.stringify({ type: 'withdraw', ids: withdrawIds, userId: selectedUser.id }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.message || 'Failed to hide withdraw transactions');
        }
      }

      setShowManageTransactions(false);
      setSelectedTransactionIds(new Set());
      setError(null);
      dispatchSyncEvent('update-deposit-request', selectedUser.id);
      dispatchSyncEvent('update-withdraw-request', selectedUser.id);
    } catch (err: any) {
      setError(`Failed to hide selected transactions: ${err.message}`);
    }
  };

  // Portfolio editor helpers
  const openPortfolioEditor = async (user: User) => {
    try {
      setSelectedUser(user);
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('No authentication token available');

      const res = await fetch(buildApiUrl(`/admin/portfolio-balances/${user.id}`), {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      });

      if (!res.ok) throw new Error('Failed to load portfolio');
      const data = await res.json();
      const balances = data.balances || [];

      const btc = balances.find((p: any) => p.symbol === 'BTC');
      const eth = balances.find((p: any) => p.symbol === 'ETH');
      const usdt = balances.find((p: any) => p.symbol === 'USDT');
      setPortfolioBTC(btc?.available ?? '0');
      setPortfolioETH(eth?.available ?? '0');
      setPortfolioUSDT(usdt?.available ?? '0');
      setShowPortfolioEditor(true);
    } catch (err: any) {
      setError(`Failed to load portfolio: ${err.message}`);
    }
  };

  const savePortfolioEditor = async () => {
    if (!selectedUser) return;
    try {
      // Validate numeric values
      const btcVal = parseFloat(portfolioBTC);
      const ethVal = parseFloat(portfolioETH);
      const usdtVal = parseFloat(portfolioUSDT);

      if (isNaN(btcVal) || btcVal < 0) { setError('BTC balance must be a valid non-negative number'); return; }
      if (isNaN(ethVal) || ethVal < 0) { setError('ETH balance must be a valid non-negative number'); return; }
      if (isNaN(usdtVal) || usdtVal < 0) { setError('USDT balance must be a valid non-negative number'); return; }

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('No authentication token available');

      const res = await fetch(buildApiUrl('/admin/edit-portfolio-balances'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          userId: selectedUser.id,
          balances: [
            { symbol: 'BTC', available: portfolioBTC },
            { symbol: 'ETH', available: portfolioETH },
            { symbol: 'USDT', available: portfolioUSDT },
          ],
        }),
      });

      if (!res.ok) {
        const result = await res.json();
        throw new Error(result.message || 'Failed to save portfolio');
      }

      setShowPortfolioEditor(false);
      setError(null);
      dispatchSyncEvent('update-portfolio', selectedUser.id);
    } catch (err: any) {
      setError(`Failed to save portfolio: ${err.message}`);
    }
  };

  const handleDeletePortfolioData = async (user: User) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('No authentication token available');

      const res = await fetch(buildApiUrl('/admin/user-management/delete-portfolio'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ userId: user.id }),
      });

      if (!res.ok) {
        const result = await res.json();
        throw new Error(result.message || 'Failed to delete portfolio data');
      }

      setConfirmAction({ type: null, user: null });
      setError(null);
      dispatchSyncEvent('delete-portfolio', user.id);
    } catch (err: any) {
      setError(`Failed to delete portfolio data: ${err.message}`);
    }
  };


  const getVerificationBadge = (isVerified: boolean) => {
    if (isVerified) {
      return <Badge className="bg-success/10 text-success border border-success/20 flex items-center gap-1">
        <CheckCircle className="w-3 h-3" />
        Verified
      </Badge>;
    }
    return <Badge className="bg-warning/10 text-warning border border-warning/20 flex items-center gap-1">
      <XCircle className="w-3 h-3" />
      Unverified
    </Badge>;
  };

  const getStatusBadge = (isActive: boolean) => {
    if (isActive) {
      return <Badge className="bg-success/10 text-success border border-success/20 flex items-center gap-1">
        <Power className="w-3 h-3" />
        Active
      </Badge>;
    }
    return <Badge className="bg-danger/10 text-danger border border-danger/20 flex items-center gap-1">
      <PowerOff className="w-3 h-3" />
      Disabled
    </Badge>;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Shield className="w-5 h-5" />
            User Management
          </DialogTitle>
          <DialogDescription>
            Manage user accounts, credit scores, and perform administrative actions.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="Search users by email, name, or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Error Display */}
          {error && (
            <div className="bg-danger/10 border border-danger/20 rounded-lg p-3 text-danger text-sm">
              {error}
            </div>
          )}

          {/* Users List */}
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading users...</div>
          ) : (
            <div className="grid gap-4">
              {filteredUsers.map((user) => (
                <Card key={user.id} className="bg-muted/40 border-border">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                          <User className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div>
                          <CardTitle className="text-foreground text-lg">
                            {user.full_name || 'No Name'}
                          </CardTitle>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Mail className="w-3 h-3" />
                            {user.email}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getVerificationBadge(user.is_verified)}
                        {getStatusBadge(user.is_active ?? true)}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* User ID */}
                      <div>
                        <Label className="text-muted-foreground text-xs">User ID</Label>
                        <div className="text-foreground text-sm font-mono">{user.display_id || user.id.substring(0, 8)}</div>
              </div>

                      {/* Credit Score */}
                      <div>
                        <Label className="text-muted-foreground text-xs">Credit Score</Label>
                        {editingUserId === user.id ? (
                          <div className="flex items-center gap-2 mt-1">
                            <Input
                              type="number"
                              step="1"
                              min="0"
                              max="850"
                              value={editingCreditScore}
                              onChange={(e) => setEditingCreditScore(e.target.value)}
                              className="w-20 h-8 text-sm"
                            />
                            <Button
                              size="sm"
                              onClick={handleSaveCreditScore}
                              disabled={saving}
                              className="h-8 px-2"
                            >
                              <Save className="w-3 h-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handleCancelEdit}
                              className="h-8 px-2"
                            >
                              <X className="w-3 h-3" />
                            </Button>
              </div>
                        ) : (
                          <div className="flex items-center gap-2 mt-1">
                            <CreditScoreBadge creditScore={user.credit_score || 60} size="sm" />
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEditCreditScore(user)}
                              className="h-6 px-2"
                            >
                              <Edit className="w-3 h-3" />
                            </Button>
              </div>
                        )}
              </div>

                      {/* Created Date */}
                      <div>
                        <Label className="text-muted-foreground text-xs">Created</Label>
                        <div className="text-foreground text-sm">
                          {formatDate(user.created_at)}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
                    <div className="mt-4 pt-4 border-t border-border">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleViewUserDetails(user)}
                          className="text-xs"
                        >
                          <Eye className="w-3 h-3 mr-1" />
                          View Details
                        </Button>

              <Button
                size="sm"
                          variant="outline"
                          onClick={() => {
                            if (window.confirm(`Are you sure you want to ${user.is_active ? 'disable' : 'enable'} user "${user.email}"?`)) {
                              handleToggleUser(user);
                            }
                          }}
                          className={`text-xs ${user.is_active ? 'text-danger border-danger/30 bg-danger/10 hover:bg-danger/20' : 'text-success border-success/30 bg-success/10 hover:bg-success/20'}`}
                        >
                          {user.is_active ? (
                            <>
                              <PowerOff className="w-3 h-3 mr-1" />
                              Disable
                            </>
                          ) : (
                            <>
                              <Power className="w-3 h-3 mr-1" />
                              Enable
                            </>
                          )}
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            if (window.confirm(`Are you sure you want to delete all trade history for user "${user.email}"? This action cannot be undone.`)) {
                              handleDeleteUserHistory(user);
                            }
                          }}
                          className="text-xs text-warning border-warning/30 bg-warning/10 hover:bg-warning/20"
                        >
                          <History className="w-3 h-3 mr-1" />
                          Delete History
                        </Button>

                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            if (window.confirm(`Are you sure you want to delete user "${user.email}"? This will permanently remove the user and all their data.`)) {
                              handleDeleteUser(user);
                            }
                          }}
                          className="text-xs"
                        >
                          <Trash2 className="w-3 h-3 mr-1" />
                          Delete User
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            if (window.confirm(`Hide all orders from user "${user.email}" view? They will be invisible in user's order history.`)) {
                              handleHideOrders(user);
                            }
                          }}
                          className="text-xs"
                        >
                          <History className="w-3 h-3 mr-1" />
                          Delete Orders History
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            if (window.confirm(`Hide all futures trades from user "${user.email}" view? They will be invisible in user's trading history.`)) {
                              handleHideFuturesTrades(user);
                            }
                          }}
                          className="text-xs"
                        >
                          <History className="w-3 h-3 mr-1" />
                          Delete Trade History
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openManageTransactions(user)}
                          className="text-xs"
                        >
                          <History className="w-3 h-3 mr-1" />
                          Delete Transaction History
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            if (window.confirm(`Reset verification for user "${user.email}"? They will need to verify email and KYC again.`)) {
                              handleResetVerification(user);
                            }
                          }}
                          className="text-xs"
                        >
                          Reset Verification
                        </Button>



                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openPortfolioEditor(user)}
                          className="text-xs"
                        >
                          Edit Portfolio Balance
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            if (window.confirm(`Delete ALL portfolio data for user "${user.email}"? This will remove all cryptocurrency balances.`)) {
                              handleDeletePortfolioData(user);
                            }
                          }}
                          className="text-xs"
                        >
                          Delete Portfolio Data
              </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* No Results */}
          {!loading && filteredUsers.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              {searchTerm ? 'No users found matching your search.' : 'No users found.'}
            </div>
          )}
        </div>

        {/* User Details Modal */}
        <Dialog open={showUserDetails} onOpenChange={(open) => !open && setShowUserDetails(false)}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle className="text-foreground flex items-center gap-2">
                <User className="w-5 h-5" />
                User Details
              </DialogTitle>
              <DialogDescription>
                Review account information and perform quick actions.
              </DialogDescription>
            </DialogHeader>

            {selectedUser && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground text-xs">User ID</Label>
                    <div className="text-foreground text-sm font-mono bg-muted/40 border border-border p-2 rounded mt-1">
                      {selectedUser.id}
                    </div>
                  </div>

                  <div>
                    <Label className="text-muted-foreground text-xs">Email</Label>
                    <div className="text-foreground text-sm bg-muted/40 border border-border p-2 rounded mt-1">
                      {selectedUser.email}
                    </div>
                  </div>

                  <div>
                    <Label className="text-muted-foreground text-xs">Full Name</Label>
                    <div className="text-foreground text-sm bg-muted/40 border border-border p-2 rounded mt-1">
                      {selectedUser.full_name || 'Not provided'}
                    </div>
                  </div>

                  <div>
                    <Label className="text-muted-foreground text-xs">Verification Status</Label>
                    <div className="mt-1">{getVerificationBadge(selectedUser.is_verified)}</div>
                  </div>

                  <div>
                    <Label className="text-muted-foreground text-xs">Account Status</Label>
                    <div className="mt-1">{getStatusBadge(selectedUser.is_active ?? true)}</div>
                  </div>

                  <div>
                    <Label className="text-muted-foreground text-xs">Credit Score</Label>
                    <div className="mt-1">
                      <CreditScoreBadge creditScore={selectedUser.credit_score || 60} size="md" />
                    </div>
                  </div>

                  <div>
                    <Label className="text-muted-foreground text-xs">Created Date</Label>
                    <div className="text-foreground text-sm bg-muted/40 border border-border p-2 rounded mt-1">
                      {formatDateTime(selectedUser.created_at)}
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-border">
                  <h4 className="text-sm font-semibold text-foreground mb-3">Staking Overview</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="bg-muted/40 border border-border rounded-xl p-3">
                      <p className="text-[11px] text-muted-foreground mb-1">Total Staked</p>
                      <p className="text-lg font-semibold text-foreground tabular-nums">
                        {(selectedUser.total_staking_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT
                      </p>
                    </div>
                    <div className="bg-muted/40 border border-border rounded-xl p-3">
                      <p className="text-[11px] text-muted-foreground mb-1">Active Positions</p>
                      <p className="text-lg font-semibold text-success tabular-nums">
                        {selectedUser.active_staking_count || 0}
                      </p>
                    </div>
                    <div className="bg-muted/40 border border-border rounded-xl p-3">
                      <p className="text-[11px] text-muted-foreground mb-1">Positions</p>
                      <p className="text-lg font-semibold text-foreground tabular-nums">
                        {selectedUser.staking_positions?.length || 0}
                      </p>
                    </div>
                  </div>

                  {selectedUser.staking_positions && selectedUser.staking_positions.length > 0 && (
                    <div className="mt-4 border border-border rounded-xl bg-muted/40 overflow-hidden">
                      <div className="max-h-64 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-card">
                            <tr className="text-muted-foreground">
                              <th className="text-left py-2 px-3 font-medium">Asset</th>
                              <th className="text-right py-2 px-3 font-medium">Amount</th>
                              <th className="text-center py-2 px-3 font-medium">APY</th>
                              <th className="text-center py-2 px-3 font-medium">Duration</th>
                              <th className="text-center py-2 px-3 font-medium">Status</th>
                              <th className="text-center py-2 px-3 font-medium">Start</th>
                              <th className="text-center py-2 px-3 font-medium">End</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedUser.staking_positions.map((position: any) => (
                              <tr
                                key={position.id}
                                className="border-t border-border hover:bg-card transition-colors duration-200"
                              >
                                <td className="py-2 px-3 text-foreground"><span className="flex items-center gap-1.5"><CryptoIcon symbol={position.symbol} size="xs" />{position.symbol}</span></td>
                                <td className="py-2 px-3 text-right text-foreground tabular-nums">
                                  {parseFloat(position.amount || "0").toLocaleString()}
                                </td>
                                <td className="py-2 px-3 text-center text-success tabular-nums">
                                  {parseFloat(position.apy || "0").toFixed(2)}%
                                </td>
                                <td className="py-2 px-3 text-center text-foreground">
                                  {position.duration}d
                                </td>
                                <td className="py-2 px-3 text-center">
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[11px] ${
                                      position.status === "active"
                                        ? "bg-success/15 text-success border border-success/30"
                                        : "bg-muted text-muted-foreground border border-border"
                                    }`}
                                  >
                                    {position.status}
                                  </span>
                                </td>
                                <td className="py-2 px-3 text-center text-muted-foreground">
                                  {position.start_date
                                    ? new Date(position.start_date).toLocaleDateString()
                                    : "-"}
                                </td>
                                <td className="py-2 px-3 text-center text-muted-foreground">
                                  {position.end_date
                                    ? new Date(position.end_date).toLocaleDateString()
                                    : "-"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-border">
                  <h4 className="text-sm font-semibold text-foreground mb-3">Quick Actions</h4>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setShowUserDetails(false);
                        handleEditCreditScore(selectedUser);
                      }}
                      className="text-xs"
                    >
                      <Edit className="w-3 h-3 mr-1" />
                      Edit Credit Score
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setShowUserDetails(false);
                        setConfirmAction({ type: 'toggle_user', user: selectedUser });
                      }}
                      className={`text-xs ${selectedUser.is_active ? 'text-danger border-danger/30 bg-danger/10 hover:bg-danger/20' : 'text-success border-success/30 bg-success/10 hover:bg-success/20'}`}
                    >
                      {selectedUser.is_active ? (
                        <>
                          <PowerOff className="w-3 h-3 mr-1" />
                          Disable User
                        </>
                      ) : (
                        <>
                          <Power className="w-3 h-3 mr-1" />
                          Enable User
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowUserDetails(false)}
                  >
                    Close
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Manage Transactions Modal */}
        <Dialog open={showManageTransactions} onOpenChange={(open) => !open && setShowManageTransactions(false)}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle className="text-foreground flex items-center gap-2">
                <History className="w-5 h-5" />
                Manage Transactions
              </DialogTitle>
              <DialogDescription>
                Select deposit/withdraw transactions to hide from the user's view{selectedUser ? ` (${selectedUser.email})` : ''}.
              </DialogDescription>
            </DialogHeader>

            <div className="border border-border rounded-lg bg-muted/40">
              <div className="grid grid-cols-5 text-xs text-muted-foreground px-3 py-2 border-b border-border">
                <div>Type</div>
                <div>Symbol</div>
                <div>Amount</div>
                <div>Status</div>
                <div>Select</div>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {manageTransactionsData.map(t => (
                  <div key={`${t.type}-${t.id}`} className="grid grid-cols-5 items-center text-sm px-3 py-2 border-b border-border">
                    <div className="text-foreground">{t.type}</div>
                    <div className="text-foreground flex items-center gap-1"><CryptoIcon symbol={t.symbol?.split('/')[0] || t.symbol} size="xs" />{t.symbol}</div>
                    <div className="text-foreground tabular-nums">{Number(t.amount).toFixed(8)}</div>
                    <div className="text-foreground">{t.status}</div>
                    <div>
                      <input
                        type="checkbox"
                        checked={selectedTransactionIds.has(t.id)}
                        onChange={(e) => {
                          const next = new Set(selectedTransactionIds);
                          if (e.target.checked) next.add(t.id); else next.delete(t.id);
                          setSelectedTransactionIds(next);
                        }}
                        className="accent-primary"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <Button
                variant="outline"
                onClick={() => setShowManageTransactions(false)}
              >
                Cancel
              </Button>
              <Button onClick={applyHideSelectedTransactions} className="bg-warning hover:bg-warning/90 text-warning-foreground">
                Hide Selected
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Portfolio Editor Modal */}
        <Dialog open={showPortfolioEditor} onOpenChange={(open) => !open && setShowPortfolioEditor(false)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-foreground">Edit Portfolio</DialogTitle>
              <DialogDescription>
                Update balances for {selectedUser ? selectedUser.email : 'the selected user'}.
              </DialogDescription>
            </DialogHeader>

              <div className="space-y-4">
                <div>
                  <Label className="text-muted-foreground text-xs">BTC Available</Label>
                  <Input value={portfolioBTC} onChange={(e) => setPortfolioBTC(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">ETH Available</Label>
                  <Input value={portfolioETH} onChange={(e) => setPortfolioETH(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">USDT Available</Label>
                  <Input value={portfolioUSDT} onChange={(e) => setPortfolioUSDT(e.target.value)} className="mt-1" />
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <Button
                  variant="outline"
                  onClick={() => setShowPortfolioEditor(false)}
                >
                  Cancel
                </Button>
                <Button onClick={savePortfolioEditor}>
                  Save
                </Button>
              </div>
          </DialogContent>
        </Dialog>

      </DialogContent>
    </Dialog>
  );
};
