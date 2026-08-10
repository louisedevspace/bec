import AdminLayout from "./admin-layout";
import { formatDate as formatDateUtil, formatDateTime, formatShortDate as formatShortDateUtil, timeAgo as timeAgoUtil } from '@/lib/date-utils';
import { useEffect, useState, useMemo, lazy, Suspense } from "react";
import { supabase } from "../lib/supabaseClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  RefreshCw, Eye, EyeOff, Shield, Mail, Phone, Calendar, User, Users, Key,
  DollarSign, TrendingUp, Coins, Settings, FileText, History, Search, Copy,
  Check, Download, ChevronLeft, ChevronRight, ArrowUpDown, Filter, UserCheck,
  UserX, Clock, Activity, BarChart3, AlertTriangle, Globe, ChevronsUpDown,
  SortAsc, SortDesc, X,
} from "lucide-react";
import { CryptoIcon } from "@/components/crypto/crypto-icon";
import { Input } from "@/components/ui/input";
import { useAdminPendingCounts } from "@/hooks/use-admin-pending-counts";
import { getImageDisplayUrl } from "@/lib/image";

const AdminChangePasswordModal = lazy(() =>
  import("../components/modals/admin-change-password-modal").then((m) => ({ default: m.AdminChangePasswordModal })),
);
const AdminUserManagementModal = lazy(() =>
  import("../components/modals/admin-user-management-modal").then((m) => ({ default: m.AdminUserManagementModal })),
);
const AdminDepositRequestsModal = lazy(() =>
  import("../components/modals/admin-deposit-requests-modal").then((m) => ({ default: m.AdminDepositRequestsModal })),
);
const AdminWithdrawRequestsModal = lazy(() =>
  import("../components/modals/admin-withdraw-requests-modal").then((m) => ({ default: m.AdminWithdrawRequestsModal })),
);
const AdminFuturesSettingsModal = lazy(() =>
  import("../components/modals/admin-futures-settings-modal").then((m) => ({ default: m.AdminFuturesSettingsModal })),
);
const ProfilePictureViewerModal = lazy(() =>
  import("../components/modals/profile-picture-viewer-modal").then((m) => ({ default: m.ProfilePictureViewerModal })),
);
import { formatGenericCryptoBalance } from '../utils/format-utils';

type SortField = 'name' | 'email' | 'date' | 'portfolio' | 'trades' | 'status';
type SortDir = 'asc' | 'desc';
type StatusFilter = 'all' | 'active' | 'inactive' | 'verified' | 'pending' | 'kyc_pending' | 'deleted';
type DeletionType = 'admin' | 'self';

interface DeletedUserRow {
  id: number;
  deleted_at: string;
  deletion_type: DeletionType;
  reason: string | null;
  target_user_id: string | null;
  target_email: string | null;
  target_full_name: string | null;
  target_display_id: string | null;
  actor_user_id: string | null;
  actor_email: string | null;
  actor_full_name: string | null;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export default function AdminUsers() {
  const [users, setUsers] = useState<any[]>([]);
  const [deletedUsers, setDeletedUsers] = useState<DeletedUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPasswords, setShowPasswords] = useState(false);
  const [selectedUser, setSelectedUser] = useState<{ id: string; email: string } | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [selectedManagementUser, setSelectedManagementUser] = useState<any>(null);
  const [showManagementModal, setShowManagementModal] = useState(false);
  const [showDepositRequestsModal, setShowDepositRequestsModal] = useState(false);
  const [showWithdrawRequestsModal, setShowWithdrawRequestsModal] = useState(false);
  const [showFuturesSettingsModal, setShowFuturesSettingsModal] = useState(false);
  const [selectedFuturesUser, setSelectedFuturesUser] = useState<any>(null);
  const [showProfilePictureModal, setShowProfilePictureModal] = useState(false);
  const [selectedProfilePicture, setSelectedProfilePicture] = useState<{ url: string; userName: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, string>>({});
  const [revealingPasswordFor, setRevealingPasswordFor] = useState<string | null>(null);

  // New state for enhanced features
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [viewMode, setViewMode] = useState<'cards' | 'compact'>('cards');
  const [deletedUsersCount, setDeletedUsersCount] = useState(0);
  const [deletedTypeFilter, setDeletedTypeFilter] = useState<'all' | DeletionType>('all');

  const { counts: pendingCounts } = useAdminPendingCounts(15000);

  // Computed stats
  const stats = useMemo(() => {
    const total = users.length;
    const active = users.filter(u => u.is_active !== false).length;
    const inactive = total - active;
    const verified = users.filter(u => u.email_confirmed_at && u.is_verified).length;
    const kycPending = users.filter(u => u.kyc_status === 'pending').length;
    const totalPortfolio = users.reduce((sum, u) => sum + (u.total_portfolio_value || 0), 0);
    const totalTrades = users.reduce((sum, u) => sum + (u.trade_count || 0), 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const newToday = users.filter(u => new Date(u.created_at) >= today).length;
    return { total, active, inactive, verified, kycPending, totalPortfolio, totalTrades, newToday };
  }, [users]);

  // Filtering
  const filteredUsers = useMemo(() => {
    let result = users;

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter(u => {
        switch (statusFilter) {
          case 'active': return u.is_active !== false;
          case 'inactive': return u.is_active === false;
          case 'verified': return u.email_confirmed_at && u.is_verified;
          case 'pending': return !u.email_confirmed_at || !u.is_verified;
          case 'kyc_pending': return u.kyc_status === 'pending';
          case 'deleted': return false;
          default: return true;
        }
      });
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(u =>
        (u.username || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.full_name || '').toLowerCase().includes(q) ||
        (u.display_id || '').toLowerCase().includes(q) ||
        (u.id || '').toLowerCase().includes(q) ||
        (u.phone || '').toLowerCase().includes(q)
      );
    }

    // Sort
    result = [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name':
          cmp = (a.full_name || a.email || '').localeCompare(b.full_name || b.email || '');
          break;
        case 'email':
          cmp = (a.email || '').localeCompare(b.email || '');
          break;
        case 'date':
          cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        case 'portfolio':
          cmp = (a.total_portfolio_value || 0) - (b.total_portfolio_value || 0);
          break;
        case 'trades':
          cmp = (a.trade_count || 0) - (b.trade_count || 0);
          break;
        case 'status':
          const statusA = a.email_confirmed_at && a.is_verified ? 1 : 0;
          const statusB = b.email_confirmed_at && b.is_verified ? 1 : 0;
          cmp = statusA - statusB;
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [users, statusFilter, searchQuery, sortField, sortDir]);

  const filteredDeletedUsers = useMemo(() => {
    let result = deletedUsers;

    if (deletedTypeFilter !== 'all') {
      result = result.filter((row) => row.deletion_type === deletedTypeFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((row) => {
        const haystack = [
          row.target_email,
          row.target_full_name,
          row.target_display_id,
          row.target_user_id,
          row.actor_email,
          row.actor_full_name,
          row.reason,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return haystack.includes(q);
      });
    }

    return [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name':
          cmp = (a.target_full_name || a.target_email || '').localeCompare(b.target_full_name || b.target_email || '');
          break;
        case 'email':
          cmp = (a.target_email || '').localeCompare(b.target_email || '');
          break;
        case 'status':
          cmp = a.deletion_type.localeCompare(b.deletion_type);
          break;
        case 'date':
        default:
          cmp = new Date(a.deleted_at).getTime() - new Date(b.deleted_at).getTime();
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [deletedUsers, deletedTypeFilter, searchQuery, sortField, sortDir]);

  // Pagination
  const activeResultCount = statusFilter === 'deleted' ? filteredDeletedUsers.length : filteredUsers.length;
  const totalPages = Math.max(1, Math.ceil(activeResultCount / pageSize));
  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }, [filteredUsers, currentPage, pageSize]);
  const paginatedDeletedUsers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredDeletedUsers.slice(start, start + pageSize);
  }, [filteredDeletedUsers, currentPage, pageSize]);

  // Reset page when filters change
  useEffect(() => { setCurrentPage(1); }, [searchQuery, statusFilter, deletedTypeFilter, sortField, sortDir, pageSize]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const revealPassword = async (userId: string) => {
    const reason = window.prompt('Enter reason for password access (required for audit log):', 'Account recovery assistance');
    if (!reason || reason.trim().length < 6) {
      return;
    }

    setRevealingPasswordFor(userId);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('No authentication token');

      const res = await fetch(`/api/admin/users/${userId}/reveal-password`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: reason.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        // Show the error inline instead of alert
        setRevealedPasswords(prev => ({ ...prev, [userId]: data?.message || 'Not available' }));
        return;
      }

      setRevealedPasswords(prev => ({ ...prev, [userId]: data.password || 'Empty' }));
    } catch (err: any) {
      setRevealedPasswords(prev => ({ ...prev, [userId]: 'Error: ' + (err?.message || 'Failed') }));
    } finally {
      setRevealingPasswordFor(null);
    }
  };

  const hideRevealedPassword = (userId: string) => {
    setRevealedPasswords(prev => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
  };

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('No authentication token');

      const res = await fetch(`/api/admin/users?refresh=true&t=${Date.now()}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error('Failed to fetch users');
      const { users } = await res.json();
      setUsers(users || []);

      const deletedRes = await fetch('/api/admin/deleted-users', {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (deletedRes.ok) {
        const deletedData = await deletedRes.json();
        const deletedRows = Array.isArray(deletedData?.deletedUsers) ? deletedData.deletedUsers : [];
        setDeletedUsers(deletedRows);
        setDeletedUsersCount(deletedRows.length);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const formatDate = (dateString: string) => formatDateUtil(dateString);

  const formatShortDate = (dateString: string) => formatShortDateUtil(dateString);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(value);
  };

  const timeAgo = (dateStr: string) => timeAgoUtil(dateStr);

  const getStatusBadge = (user: any) => {
    if (user.email_confirmed_at && user.is_verified) {
      return <Badge className="bg-green-500/10 text-green-400 border-green-500/20 text-[10px]">Verified</Badge>;
    }
    return <Badge variant="outline" className="text-orange-400 border-orange-500/20 bg-orange-500/10 text-[10px]">Pending</Badge>;
  };

  const getActivityBadge = (user: any) => {
    if (user.is_active === false) {
      return <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" title="Inactive" />;
    }
    return <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" title="Active" />;
  };

  const handleToggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir(field === 'date' ? 'desc' : 'asc');
    }
  };

  const handleExportCSV = () => {
    const rows = [
      ['Name', 'Email', 'Username', 'Display ID', 'Status', 'KYC', 'Active', 'Portfolio Value', 'Trades', 'Assets', 'Loans', 'Staking', 'Joined', 'Last Login'],
      ...filteredUsers.map(u => [
        u.full_name || '', u.email || '', u.username || '', u.display_id || u.id?.substring(0, 8) || '',
        u.email_confirmed_at && u.is_verified ? 'Verified' : 'Pending',
        u.kyc_status || 'none', u.is_active !== false ? 'Yes' : 'No',
        (u.total_portfolio_value || 0).toFixed(2), u.trade_count || 0, u.assets_count || 0,
        u.active_loans_count || 0, u.active_staking_count || 0,
        u.created_at ? new Date(u.created_at).toISOString() : '',
        u.last_sign_in_at ? new Date(u.last_sign_in_at).toISOString() : '',
      ])
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `users-export-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Modal handlers (unchanged behavior)
  const handleChangePassword = (user: any) => {
    setSelectedUser({ id: user.id, email: user.email });
    setShowPasswordModal(true);
  };

  const handlePasswordModalClose = () => {
    setShowPasswordModal(false);
    setSelectedUser(null);
    fetchUsers();
  };

  const handleManagementModalClose = () => {
    setShowManagementModal(false);
    setSelectedManagementUser(null);
    fetchUsers();
  };

  const handleOpenManagement = (user: any) => {
    setSelectedManagementUser(user);
    setShowManagementModal(true);
  };

  const handleViewProfilePicture = (profilePictureUrl: string, userName: string) => {
    setSelectedProfilePicture({ url: profilePictureUrl, userName });
    setShowProfilePictureModal(true);
  };

  // Status filter tabs config
  const filterTabs: { key: StatusFilter; label: string; icon: React.ReactNode; count: number }[] = [
    { key: 'all', label: 'All', icon: <Users size={13} className="fill-current" />, count: stats.total },
    { key: 'active', label: 'Active', icon: <Activity size={13} className="fill-current" />, count: stats.active },
    { key: 'inactive', label: 'Inactive', icon: <UserX size={13} className="fill-current" />, count: stats.inactive },
    { key: 'verified', label: 'Verified', icon: <UserCheck size={13} className="fill-current" />, count: stats.verified },
    { key: 'pending', label: 'Pending', icon: <Clock size={13} className="fill-current" />, count: stats.total - stats.verified },
    { key: 'kyc_pending', label: 'KYC Pending', icon: <FileText size={13} className="fill-current" />, count: stats.kycPending },
    { key: 'deleted', label: 'Deleted', icon: <Shield size={13} className="fill-current" />, count: deletedUsersCount },
  ];

  // Sort options
  const sortOptions: { field: SortField; label: string }[] = [
    { field: 'date', label: 'Join Date' },
    { field: 'name', label: 'Name' },
    { field: 'email', label: 'Email' },
    { field: 'portfolio', label: 'Portfolio' },
    { field: 'trades', label: 'Trades' },
    { field: 'status', label: 'Status' },
  ];

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto space-y-5">
        {/* ---- Header ---- */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white">User Management</h1>
            <p className="text-xs sm:text-sm text-gray-500 mt-1">
              {stats.total} total users &middot; {stats.newToday > 0 && <span className="text-green-400">{stats.newToday} new today</span>}
            </p>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <button
              onClick={() => setViewMode(v => v === 'cards' ? 'compact' : 'cards')}
              className="inline-flex items-center rounded-xl text-[11px] sm:text-xs font-medium border border-[#1e1e1e] bg-[#0a0a0a] text-gray-400 hover:bg-[#1a1a1a] hover:text-white h-7 sm:h-8 px-2 sm:px-3 transition-colors"
              title={viewMode === 'cards' ? 'Switch to compact view' : 'Switch to card view'}
            >
              <BarChart3 className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1 sm:mr-1.5 fill-current" />
              {viewMode === 'cards' ? 'Compact' : 'Cards'}
            </button>
            <button
              onClick={() => setShowPasswords(!showPasswords)}
              className="inline-flex items-center rounded-xl text-[11px] sm:text-xs font-medium border border-[#1e1e1e] bg-[#0a0a0a] text-gray-400 hover:bg-[#1a1a1a] hover:text-white h-7 sm:h-8 px-2 sm:px-3 transition-colors"
            >
              {showPasswords ? <EyeOff className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1 sm:mr-1.5 fill-current" /> : <Eye className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1 sm:mr-1.5 fill-current" />}
              {showPasswords ? 'Hide' : 'Show'} Auth
            </button>
            <button
              onClick={handleExportCSV}
              className="inline-flex items-center rounded-xl text-[11px] sm:text-xs font-medium border border-[#1e1e1e] bg-[#0a0a0a] text-gray-400 hover:bg-[#1a1a1a] hover:text-white h-7 sm:h-8 px-2 sm:px-3 transition-colors"
            >
              <Download className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1 sm:mr-1.5 fill-current" />Export
            </button>
            <Button onClick={fetchUsers} size="sm" className="rounded-xl text-[11px] sm:text-xs bg-blue-600 hover:bg-blue-700 h-7 sm:h-8">
              <RefreshCw className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1 sm:mr-1.5 fill-current" />Refresh
            </Button>
          </div>
        </div>

        {/* ---- Action Buttons Grid ---- */}
        <div className="grid grid-cols-2 sm:grid-cols-2 gap-1.5 sm:gap-2">
          {[
            { onClick: () => setShowDepositRequestsModal(true), icon: <DollarSign className="h-3.5 w-3.5 sm:h-4 sm:w-4 fill-current" />, label: 'Deposit Requests', color: 'emerald', badge: pendingCounts.deposits },
            { onClick: () => setShowWithdrawRequestsModal(true), icon: <DollarSign className="h-3.5 w-3.5 sm:h-4 sm:w-4 fill-current" />, label: 'Withdraw Requests', color: 'blue', badge: pendingCounts.withdrawals },
          ].map((btn, i) => {
            const colorClasses = btn.color === 'emerald' ? {
              hoverBorder: 'hover:border-emerald-500/30', hoverBg: 'hover:bg-emerald-500/10',
              bg: 'bg-emerald-500/10', groupHoverBg: 'group-hover:bg-emerald-500/20', text: 'text-emerald-400', groupHoverText: 'group-hover:text-emerald-400',
            } : {
              hoverBorder: 'hover:border-blue-500/30', hoverBg: 'hover:bg-blue-500/10',
              bg: 'bg-blue-500/10', groupHoverBg: 'group-hover:bg-blue-500/20', text: 'text-blue-400', groupHoverText: 'group-hover:text-blue-400',
            };
            return (
            <button
              key={i}
              onClick={btn.onClick}
              className={`group relative flex flex-col items-center gap-1 sm:gap-1.5 bg-[#0a0a0a] border border-[#1e1e1e] rounded-xl sm:rounded-2xl p-2 sm:p-3 ${colorClasses.hoverBorder} ${colorClasses.hoverBg} transition-all duration-200`}
            >
              <div className={`relative w-7 h-7 sm:w-9 sm:h-9 ${colorClasses.bg} rounded-lg sm:rounded-xl flex items-center justify-center ${colorClasses.groupHoverBg} transition-colors ${colorClasses.text}`}>
                {btn.icon}
                {btn.badge > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] sm:min-w-[18px] sm:h-[18px] px-0.5 sm:px-1 bg-red-500 text-white text-[8px] sm:text-[9px] font-bold rounded-full flex items-center justify-center shadow-lg shadow-red-500/30 animate-pulse">
                    {btn.badge > 99 ? '99+' : btn.badge}
                  </span>
                )}
              </div>
              <span className={`text-[10px] sm:text-[11px] font-medium text-gray-400 ${colorClasses.groupHoverText} transition-colors text-center leading-tight`}>
                {btn.label}
              </span>
            </button>
            );
          })}
        </div>

        {/* ---- Filter & Search Bar ---- */}
        <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] overflow-hidden">
          {/* Status Filter Tabs */}
          <div className="border-b border-[#1e1e1e] px-4 pt-3 pb-0 overflow-x-auto">
            <div className="flex gap-1 min-w-max">
              {filterTabs.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setStatusFilter(tab.key)}
                  className={`inline-flex items-center gap-1.5 rounded-t-lg text-xs font-medium px-3 py-2 border-b-2 transition-all
                    ${statusFilter === tab.key
                      ? 'border-blue-500 text-blue-400 bg-blue-500/5'
                      : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-[#1a1a1a]'}`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                  <span className={`text-[10px] px-1.5 py-0 rounded-full font-semibold
                    ${statusFilter === tab.key ? 'bg-blue-500/20 text-blue-400' : 'bg-[#1a1a1a] text-gray-500'}`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Search + Sort + Page Size */}
          <div className="p-3 sm:p-4 border-b border-[#1e1e1e]">
            <div className="flex flex-col gap-3">
              <div className="relative w-full sm:max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 fill-current" />
                <Input
                  placeholder="Search name, email, ID, phone..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-9 pr-8 rounded-xl border-[#1e1e1e] bg-[#0a0a0a] text-sm h-9 text-white placeholder:text-gray-600 focus:border-blue-500"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                    <X size={14} className="fill-current" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {statusFilter !== 'deleted' ? (
                  <div className="flex items-center bg-[#0a0a0a] border border-[#1e1e1e] rounded-xl overflow-hidden flex-shrink-0">
                    <span className="text-[10px] text-gray-500 px-2 sm:px-2.5 flex-shrink-0 uppercase tracking-wide">Sort</span>
                    {sortOptions.map(opt => (
                      <button
                        key={opt.field}
                        onClick={() => handleToggleSort(opt.field)}
                        className={`text-[10px] sm:text-[11px] px-1.5 sm:px-2 py-1.5 transition-colors flex items-center gap-0.5 sm:gap-1 whitespace-nowrap
                          ${sortField === opt.field
                            ? 'bg-blue-500/10 text-blue-400 font-semibold'
                            : 'text-gray-500 hover:text-gray-300 hover:bg-[#1a1a1a]'}`}
                      >
                        {opt.label}
                        {sortField === opt.field && (
                          sortDir === 'asc' ? <SortAsc size={10} className="fill-current" /> : <SortDesc size={10} className="fill-current" />
                        )}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center bg-[#0a0a0a] border border-[#1e1e1e] rounded-xl overflow-hidden flex-shrink-0">
                    <span className="text-[10px] text-gray-500 px-2 sm:px-2.5 flex-shrink-0 uppercase tracking-wide">Type</span>
                    {[
                      { key: 'all', label: 'All' },
                      { key: 'admin', label: 'Admin Deleted' },
                      { key: 'self', label: 'Self Deleted' },
                    ].map(option => (
                      <button
                        key={option.key}
                        onClick={() => setDeletedTypeFilter(option.key as 'all' | DeletionType)}
                        className={`text-[10px] sm:text-[11px] px-1.5 sm:px-2 py-1.5 transition-colors whitespace-nowrap
                          ${deletedTypeFilter === option.key
                            ? 'bg-blue-500/10 text-blue-400 font-semibold'
                            : 'text-gray-500 hover:text-gray-300 hover:bg-[#1a1a1a]'}`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
                {/* Page size */}
                <div className="flex items-center bg-[#0a0a0a] border border-[#1e1e1e] rounded-xl overflow-hidden flex-shrink-0">
                  <span className="text-[10px] text-gray-500 px-2 sm:px-2.5 flex-shrink-0 uppercase tracking-wide">Show</span>
                  {PAGE_SIZE_OPTIONS.map(size => (
                    <button
                      key={size}
                      onClick={() => setPageSize(size)}
                      className={`text-[10px] sm:text-[11px] px-1.5 sm:px-2 py-1.5 transition-colors whitespace-nowrap
                        ${pageSize === size ? 'bg-blue-500/10 text-blue-400 font-semibold' : 'text-gray-500 hover:text-gray-300 hover:bg-[#1a1a1a]'}`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
                {/* Result count */}
                <span className="text-[10px] sm:text-[11px] text-gray-500 flex-shrink-0">
                  {activeResultCount} result{activeResultCount !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          </div>

          {/* ---- Users List ---- */}
          <div className="p-4">
            {loading ? (
              <div className="text-center py-16">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 mx-auto" />
                <p className="mt-3 text-sm text-gray-500">Loading users...</p>
              </div>
            ) : error ? (
              <div className="text-center py-8">
                <div className="bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl p-4 text-sm inline-flex items-center gap-2">
                  <AlertTriangle size={16} className="fill-current" />{error}
                </div>
              </div>
            ) : activeResultCount === 0 ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 bg-[#1a1a1a] rounded-2xl mx-auto mb-4 flex items-center justify-center">
                  {statusFilter === 'deleted' ? <Shield className="h-8 w-8 text-gray-600 fill-current" /> : <Users className="h-8 w-8 text-gray-600 fill-current" />}
                </div>
                <p className="text-gray-500 text-sm mb-1">{statusFilter === 'deleted' ? 'No deleted records found' : 'No users found'}</p>
                <p className="text-gray-600 text-xs">
                  {searchQuery ? 'Try adjusting your search or filters' : statusFilter === 'deleted' ? 'No deleted users match the current filter' : 'No users match the current filter'}
                </p>
              </div>
            ) : statusFilter === 'deleted' ? (
              <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1 custom-scrollbar">
                {paginatedDeletedUsers.map((row) => (
                  <div key={row.id} className="bg-[#0a0a0a] border border-[#1e1e1e] rounded-xl sm:rounded-2xl p-3 sm:p-4 md:p-5 hover:border-[#2a2a2a] transition-all duration-200">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={row.deletion_type === 'admin' ? 'bg-orange-500/15 text-orange-300 border-orange-500/30' : 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'}>
                          {row.deletion_type === 'admin' ? 'Admin Deleted' : 'Self Deleted'}
                        </Badge>
                        <span className="text-xs text-gray-500">{timeAgo(row.deleted_at)}</span>
                      </div>
                      <span className="text-xs text-gray-500">{formatDateTime(row.deleted_at)}</span>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-sm">
                      <div className="rounded-md bg-[#0d0d0d] border border-[#1f1f1f] p-3">
                        <p className="text-xs text-gray-500 mb-1">Deleted Account</p>
                        <p className="text-white font-medium">{row.target_full_name || 'Unknown user'}</p>
                        <p className="text-gray-300">{row.target_email || 'No email snapshot'}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          ID: {row.target_display_id || row.target_user_id || 'Unavailable'}
                        </p>
                      </div>

                      <div className="rounded-md bg-[#0d0d0d] border border-[#1f1f1f] p-3">
                        <p className="text-xs text-gray-500 mb-1">Deletion Source</p>
                        {row.deletion_type === 'admin' ? (
                          <>
                            <p className="text-white font-medium">Admin action</p>
                            <p className="text-gray-300">{row.actor_full_name || row.actor_email || 'Unknown admin'}</p>
                            <p className="text-xs text-gray-500 mt-1">Admin ID: {row.actor_user_id || 'Unavailable'}</p>
                          </>
                        ) : (
                          <>
                            <p className="text-white font-medium">User self-deleted</p>
                            <p className="text-gray-300">Initiated by the account owner</p>
                          </>
                        )}
                      </div>
                    </div>

                    {row.reason && (
                      <div className="text-xs text-gray-400 border-t border-[#1f1f1f] pt-3 mt-3">
                        Reason: {row.reason}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : viewMode === 'compact' ? (
              /* ===== COMPACT TABLE VIEW ===== */
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#1e1e1e]">
                      {['User', 'Email', 'Status', 'KYC', 'Portfolio', 'Trades', 'Joined', 'Actions'].map(h => (
                        <th key={h} className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-3 py-2.5">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#141414]">
                    {paginatedUsers.map(user => (
                      <tr key={user.id} className="hover:bg-[#0d0d0d] transition-colors group">
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <div className="relative flex-shrink-0">
                              <div
                                className={`w-8 h-8 bg-gradient-to-br from-blue-500/20 to-indigo-500/20 rounded-lg flex items-center justify-center overflow-hidden ${user.profile_picture ? 'cursor-pointer hover:ring-1 hover:ring-blue-500/50' : ''}`}
                                onClick={() => user.profile_picture && handleViewProfilePicture(user.profile_picture, user.full_name || user.email)}
                              >
                                {user.profile_picture
                                  ? <img src={getImageDisplayUrl(user.profile_picture)} alt="" className="w-full h-full object-cover" />
                                  : <User className="h-3.5 w-3.5 text-blue-400 fill-current" />}
                              </div>
                              {getActivityBadge(user)}
                            </div>
                            <div className="min-w-0">
                              <p className="text-white font-medium truncate text-[12px]">{user.full_name || user.email?.split('@')[0]}</p>
                              <p className="text-gray-600 text-[10px] font-mono">@{user.username || user.email?.split('@')[0]}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-gray-400 truncate max-w-[180px]">{user.email}</td>
                        <td className="px-3 py-2.5">{getStatusBadge(user)}</td>
                        <td className="px-3 py-2.5">
                          <Badge className={`text-[10px] px-1.5 py-0 ${
                            user.kyc_status === 'approved' ? 'bg-green-500/10 text-green-400' :
                            user.kyc_status === 'pending' ? 'bg-amber-500/10 text-amber-400' :
                            user.kyc_status === 'rejected' ? 'bg-red-500/10 text-red-400' :
                            'bg-gray-500/10 text-gray-500'
                          }`}>
                            {user.kyc_status || 'None'}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5 text-white font-semibold">{formatCurrency(user.total_portfolio_value || 0)}</td>
                        <td className="px-3 py-2.5 text-gray-400">{user.trade_count || 0}</td>
                        <td className="px-3 py-2.5 text-gray-500">{timeAgo(user.created_at)}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1 max-sm:opacity-100 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                            <button onClick={() => handleChangePassword(user)}
                              className="w-7 h-7 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 flex items-center justify-center transition-colors" title="Change Password">
                              <Key size={12} className="fill-current" />
                            </button>
                            <button onClick={() => handleOpenManagement(user)}
                              className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 flex items-center justify-center transition-colors" title="Manage User">
                              <Settings size={12} className="fill-current" />
                            </button>
                            <button onClick={() => { setSelectedFuturesUser(user); setShowFuturesSettingsModal(true); }}
                              className="w-7 h-7 rounded-lg bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 flex items-center justify-center transition-colors" title="Futures Settings">
                              <TrendingUp size={12} className="fill-current" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              /* ===== CARD VIEW ===== */
              <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1 custom-scrollbar">
                {paginatedUsers.map(user => (
                  <div key={user.id} className="bg-[#0a0a0a] border border-[#1e1e1e] rounded-xl sm:rounded-2xl p-3 sm:p-4 md:p-5 hover:border-[#2a2a2a] transition-all duration-200">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-5">
                      {/* Left Column - User Info */}
                      <div>
                        {/* User Header */}
                        <div className="flex items-center gap-2.5 sm:gap-3 mb-3 sm:mb-4">
                          <div className="relative flex-shrink-0">
                            <div
                              className={`w-9 h-9 sm:w-11 sm:h-11 bg-gradient-to-br from-blue-500/20 to-indigo-500/20 rounded-lg sm:rounded-xl flex items-center justify-center overflow-hidden ring-2 ring-[#111] ${user.profile_picture ? 'cursor-pointer hover:ring-blue-500/50' : ''}`}
                              onClick={() => user.profile_picture && handleViewProfilePicture(user.profile_picture, user.full_name || user.email)}
                            >
                              {user.profile_picture
                                ? <img src={getImageDisplayUrl(user.profile_picture)} alt="Profile" className="w-full h-full object-cover" />
                                : <User className="h-4 w-4 sm:h-5 sm:w-5 text-blue-400 fill-current" />}
                            </div>
                            {user.is_active !== false && (
                              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 sm:w-3.5 sm:h-3.5 bg-green-500 rounded-full ring-2 ring-[#111]" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className="font-semibold text-white text-xs sm:text-sm truncate">{user.full_name || user.email}</h3>
                            <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap mt-0.5">
                              {getStatusBadge(user)}
                              <span className="text-[10px] sm:text-xs font-mono text-blue-400 bg-blue-500/10 px-1 sm:px-1.5 py-0.5 rounded-md truncate max-w-[120px] sm:max-w-none">
                                @{user.username || user.email?.split('@')[0] || 'unknown'}
                              </span>
                              <span className="text-[9px] sm:text-[10px] text-gray-500 hidden sm:inline">#{user.display_id || user.id.substring(0, 8)}</span>
                            </div>
                          </div>
                          {/* Role Badge */}
                          {user.role === 'admin' && (
                            <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-[9px] sm:text-[10px] flex-shrink-0">
                              <Shield size={10} className="mr-0.5 sm:mr-1 fill-current" />Admin
                            </Badge>
                          )}
                        </div>

                        {/* Contact Info */}
                        <div className="space-y-1 sm:space-y-1.5 text-[11px] sm:text-xs">
                          <div className="flex items-center gap-1.5 sm:gap-2 text-gray-400">
                            <Mail className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-gray-500 flex-shrink-0 fill-current" />
                            <span className="truncate">{user.email}</span>
                          </div>
                          <div className="flex items-center gap-1.5 sm:gap-2 text-gray-400">
                            <Calendar className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-gray-500 flex-shrink-0 fill-current" />
                            <span className="truncate">Joined {formatDate(user.created_at)}</span>
                            <span className="text-gray-600 text-[9px] sm:text-[10px] hidden sm:inline">({timeAgo(user.created_at)})</span>
                          </div>
                          {user.last_sign_in_at && (
                            <div className="flex items-center gap-1.5 sm:gap-2 text-gray-400">
                              <Activity className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-gray-500 flex-shrink-0 fill-current" />
                              <span className="truncate">Last login {timeAgo(user.last_sign_in_at)}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1.5 sm:gap-2 text-gray-400">
                            <Phone className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-gray-500 flex-shrink-0 fill-current" />
                            <span>{user.phone || 'No phone'}</span>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex flex-wrap gap-1.5 sm:gap-2 mt-3 sm:mt-4">
                          <button onClick={() => handleChangePassword(user)}
                            className="inline-flex items-center gap-1 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-medium bg-red-600 text-white hover:bg-red-700 h-7 sm:h-8 px-2 sm:px-3 transition-colors">
                            <Key className="h-3 w-3 fill-current" />Password
                          </button>
                          <button onClick={() => handleOpenManagement(user)}
                            className="inline-flex items-center gap-1 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-medium border border-blue-500/30 text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 hover:border-blue-500/50 h-7 sm:h-8 px-2 sm:px-3 transition-colors">
                            <Settings className="h-3 w-3 fill-current" />Manage
                          </button>
                          <button onClick={() => { setSelectedFuturesUser(user); setShowFuturesSettingsModal(true); }}
                            className="inline-flex items-center gap-1 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-medium border border-purple-500/30 text-purple-400 bg-purple-500/10 hover:bg-purple-500/20 hover:border-purple-500/50 h-7 sm:h-8 px-2 sm:px-3 transition-colors">
                            <TrendingUp className="h-3 w-3 fill-current" />Futures
                          </button>
                          <button onClick={() => copyToClipboard(user.id)}
                            className="inline-flex items-center gap-1 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-medium border border-[#1e1e1e] text-gray-500 bg-[#0a0a0a] hover:bg-[#1a1a1a] hover:text-gray-300 h-7 sm:h-8 px-2 sm:px-2.5 transition-colors"
                            title="Copy User ID">
                            {copiedId === user.id ? <Check className="h-3 w-3 text-green-400 fill-current" /> : <Copy className="h-3 w-3 fill-current" />}
                          </button>
                          <a href={`/admin/users/${user.id}`}
                            className="inline-flex items-center gap-1 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-medium border border-[#1e1e1e] text-gray-500 bg-[#0a0a0a] hover:bg-[#1a1a1a] hover:text-gray-300 h-7 sm:h-8 px-2 sm:px-2.5 transition-colors"
                            title="View Details">
                            <Eye className="h-3 w-3 fill-current" />
                          </a>
                        </div>
                      </div>

                      {/* Right Column - Portfolio & Status */}
                      <div className="space-y-3">
                        {/* Portfolio Card */}
                        <div className="bg-[#0d0d0d] rounded-xl border border-[#1a1a1a] p-2.5 sm:p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-5 h-5 bg-blue-500/10 rounded flex items-center justify-center">
                              <Coins className="h-3 w-3 text-blue-400 fill-current" />
                            </div>
                            <span className="text-[11px] sm:text-xs font-semibold text-gray-300">Portfolio & Trading</span>
                          </div>
                          <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                            <div className="bg-[#0a0a0a] rounded-lg p-1.5 sm:p-2 text-center">
                              <p className="text-sm sm:text-base font-bold text-white">{user.assets_count || 0}</p>
                              <p className="text-[9px] sm:text-[10px] text-gray-500">Assets</p>
                            </div>
                            <div className="bg-[#0a0a0a] rounded-lg p-1.5 sm:p-2 text-center">
                              <p className="text-[11px] sm:text-base font-bold text-white truncate">{formatCurrency(user.total_portfolio_value || 0)}</p>
                              <p className="text-[9px] sm:text-[10px] text-gray-500">Value</p>
                            </div>
                            <div className="bg-[#0a0a0a] rounded-lg p-1.5 sm:p-2 text-center">
                              <p className="text-sm sm:text-base font-bold text-white">{user.trade_count || 0}</p>
                              <p className="text-[9px] sm:text-[10px] text-gray-500">Trades</p>
                            </div>
                          </div>
                          {user.portfolio && user.portfolio.length > 0 && (
                            <div className="mt-2.5 pt-2.5 border-t border-[#1a1a1a]">
                              <div className="space-y-1">
                                {user.portfolio.slice(0, 5).map((asset: any, index: number) => (
                                  <div key={index} className="flex justify-between text-[11px]">
                                    <span className="font-semibold text-gray-300 flex items-center gap-1.5"><CryptoIcon symbol={asset.symbol} size="xs" />{asset.symbol}</span>
                                    <span className="text-gray-500">
                                      {formatGenericCryptoBalance(asset.available || '0', asset.symbol)}
                                      {parseFloat(asset.frozen || '0') > 0 && (
                                        <span className="text-amber-500/70 ml-1">(+{formatGenericCryptoBalance(asset.frozen, asset.symbol)} frozen)</span>
                                      )}
                                    </span>
                                  </div>
                                ))}
                                {user.portfolio.length > 5 && (
                                  <p className="text-[10px] text-gray-600 text-center pt-1">+{user.portfolio.length - 5} more assets</p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Status Grid */}
                        <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                          <div className="bg-[#0d0d0d] rounded-lg sm:rounded-xl border border-[#1a1a1a] p-2 sm:p-2.5 text-center">
                            <p className="text-[9px] sm:text-[10px] text-gray-500 mb-0.5">Email</p>
                            <Badge variant={user.email_confirmed_at ? "default" : "outline"} className={`text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0 ${user.email_confirmed_at ? 'bg-green-500/10 text-green-400 hover:bg-green-500/10' : 'text-orange-400 bg-orange-500/10'}`}>
                              {user.email_confirmed_at ? 'Confirmed' : 'Pending'}
                            </Badge>
                          </div>
                          <div className="bg-[#0d0d0d] rounded-lg sm:rounded-xl border border-[#1a1a1a] p-2 sm:p-2.5 text-center">
                            <p className="text-[9px] sm:text-[10px] text-gray-500 mb-0.5">KYC</p>
                            <Badge variant={user.kyc_status === 'approved' ? "default" : "outline"} className={`text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0 ${user.kyc_status === 'approved' ? 'bg-green-500/10 text-green-400 hover:bg-green-500/10' : user.kyc_status === 'rejected' ? 'text-red-400 bg-red-500/10' : 'text-orange-400 bg-orange-500/10'}`}>
                              {user.kyc_status === 'approved' ? 'Approved' : user.kyc_status === 'pending' ? 'Pending' : user.kyc_status === 'rejected' ? 'Rejected' : 'None'}
                            </Badge>
                          </div>
                          <div className="bg-[#0d0d0d] rounded-lg sm:rounded-xl border border-[#1a1a1a] p-2 sm:p-2.5 text-center">
                            <p className="text-[9px] sm:text-[10px] text-gray-500 mb-0.5">Loans</p>
                            <span className="text-xs sm:text-sm font-semibold text-white">{user.active_loans_count || 0}</span>
                          </div>
                          <div className="bg-[#0d0d0d] rounded-lg sm:rounded-xl border border-[#1a1a1a] p-2 sm:p-2.5 text-center">
                            <p className="text-[9px] sm:text-[10px] text-gray-500 mb-0.5">Staking</p>
                            <span className="text-xs sm:text-sm font-semibold text-white">{user.active_staking_count || 0}</span>
                          </div>
                        </div>

                        {/* Auth Details (expandable) */}
                        {showPasswords && (
                          <div className="bg-amber-500/5 rounded-xl border border-amber-500/10 p-3 space-y-2">
                            <div className="flex items-center gap-1.5">
                              <Shield className="h-3.5 w-3.5 text-amber-400 fill-current" />
                              <span className="text-xs font-semibold text-amber-300">Auth Details</span>
                            </div>
                            <div className="space-y-1.5 text-[11px]">
                              <div className="flex items-center justify-between">
                                <span className="text-amber-400/80">Username</span>
                                <span className="font-mono text-amber-200 bg-[#111] px-1.5 py-0.5 rounded">@{user.username || 'N/A'}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-amber-400/80">Provider</span>
                                <span className="text-amber-200 bg-[#111] px-1.5 py-0.5 rounded">{user.app_metadata?.provider || 'email'}</span>
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-amber-400/80 flex-shrink-0">User ID</span>
                                <div className="flex items-center gap-1 min-w-0">
                                  <code className="text-[10px] text-amber-200 bg-[#111] px-1.5 py-0.5 rounded truncate block">{user.id}</code>
                                  <button onClick={() => copyToClipboard(user.id)} className="p-0.5 hover:bg-amber-500/20 rounded flex-shrink-0 transition-colors">
                                    {copiedId === user.id ? <Check className="h-3 w-3 text-green-400 fill-current" /> : <Copy className="h-3 w-3 text-amber-400 fill-current" />}
                                  </button>
                                </div>
                              </div>
                              <div className="bg-red-500/10 rounded-lg p-2 border border-red-500/15 mt-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-red-400 font-medium">Password Access</span>
                                  <div className="flex items-center gap-1">
                                    {revealedPasswords[user.id] ? (
                                      <>
                                        <span className="font-mono text-red-200 bg-[#111] px-1.5 py-0.5 rounded text-[11px] max-w-[200px] truncate" title={revealedPasswords[user.id]}>
                                          {revealedPasswords[user.id]}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => hideRevealedPassword(user.id)}
                                          className="text-[10px] px-1.5 py-0.5 rounded bg-[#111] text-red-300 border border-red-500/20 hover:bg-red-500/20 transition-colors"
                                        >
                                          Hide
                                        </button>
                                      </>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => revealPassword(user.id)}
                                        disabled={revealingPasswordFor === user.id}
                                        className="text-[10px] px-1.5 py-0.5 rounded bg-[#111] text-red-300 border border-red-500/20 hover:bg-red-500/20 disabled:opacity-60 transition-colors"
                                      >
                                        {revealingPasswordFor === user.id ? 'Loading...' : 'Reveal'}
                                      </button>
                                    )}
                                  </div>
                                </div>
                                {user.password_last_updated && (
                                  <p className="text-[10px] text-red-400/60 mt-1">Updated: {formatDate(user.password_last_updated)}</p>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ---- Pagination ---- */}
          {activeResultCount > 0 && (
            <div className="p-3 sm:p-4 border-t border-[#1e1e1e] flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-3">
              <p className="text-[10px] sm:text-[11px] text-gray-500">
                Showing {((currentPage - 1) * pageSize) + 1}–{Math.min(currentPage * pageSize, activeResultCount)} of {activeResultCount} {statusFilter === 'deleted' ? 'deleted records' : 'users'}
              </p>
              <div className="flex items-center gap-1 sm:gap-1.5">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage <= 1}
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[#0a0a0a] border border-[#1e1e1e] flex items-center justify-center text-gray-500 hover:text-white hover:border-[#2a2a2a] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={12} className="sm:hidden fill-current" />
                  <ChevronLeft size={14} className="hidden sm:block fill-current" />
                  <ChevronLeft size={12} className="-ml-1.5 sm:hidden fill-current" />
                  <ChevronLeft size={14} className="-ml-2 hidden sm:block fill-current" />
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[#0a0a0a] border border-[#1e1e1e] flex items-center justify-center text-gray-500 hover:text-white hover:border-[#2a2a2a] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={12} className="sm:hidden fill-current" />
                  <ChevronLeft size={14} className="hidden sm:block fill-current" />
                </button>
                {/* Page numbers */}
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg text-[10px] sm:text-[11px] font-medium transition-colors
                        ${currentPage === pageNum
                          ? 'bg-blue-600 text-white border border-blue-500'
                          : 'bg-[#0a0a0a] border border-[#1e1e1e] text-gray-500 hover:text-white hover:border-[#2a2a2a]'}`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[#0a0a0a] border border-[#1e1e1e] flex items-center justify-center text-gray-500 hover:text-white hover:border-[#2a2a2a] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight size={12} className="sm:hidden fill-current" />
                  <ChevronRight size={14} className="hidden sm:block fill-current" />
                </button>
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage >= totalPages}
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[#0a0a0a] border border-[#1e1e1e] flex items-center justify-center text-gray-500 hover:text-white hover:border-[#2a2a2a] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight size={12} className="sm:hidden fill-current" />
                  <ChevronRight size={14} className="hidden sm:block fill-current" />
                  <ChevronRight size={12} className="-ml-1.5 sm:hidden fill-current" />
                  <ChevronRight size={14} className="-ml-2 hidden sm:block fill-current" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ---- All Modals (unchanged behavior) ---- */}
      {selectedUser && (
        <Suspense fallback={null}>
          <AdminChangePasswordModal isOpen={showPasswordModal} onClose={handlePasswordModalClose} user={selectedUser} />
        </Suspense>
      )}

      <Suspense fallback={null}>
        <AdminUserManagementModal isOpen={showManagementModal} onClose={handleManagementModalClose} initialUserId={selectedManagementUser?.id} />
        <AdminDepositRequestsModal isOpen={showDepositRequestsModal} onClose={() => setShowDepositRequestsModal(false)} />
        <AdminWithdrawRequestsModal isOpen={showWithdrawRequestsModal} onClose={() => setShowWithdrawRequestsModal(false)} />
        {selectedProfilePicture && (
          <ProfilePictureViewerModal
            isOpen={showProfilePictureModal}
            onClose={() => { setShowProfilePictureModal(false); setSelectedProfilePicture(null); }}
            profilePictureUrl={selectedProfilePicture.url}
            userName={selectedProfilePicture.userName}
          />
        )}
        {selectedFuturesUser && (
          <AdminFuturesSettingsModal
            isOpen={showFuturesSettingsModal}
            onClose={() => { setShowFuturesSettingsModal(false); setSelectedFuturesUser(null); fetchUsers(); }}
            userId={selectedFuturesUser.id}
            userEmail={selectedFuturesUser.email}
            userName={selectedFuturesUser.full_name || selectedFuturesUser.email}
            currentTradeResult={selectedFuturesUser.futures_trade_result}
          />
        )}
      </Suspense>
    </AdminLayout>
  );
}
