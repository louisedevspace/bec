import AdminLayout from "./admin-layout";
import { useEffect, useState, lazy, Suspense } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  RefreshCw,
  Eye,
  EyeOff,
  Shield,
  Mail,
  Phone,
  MapPin,
  Calendar,
  User,
  Users,
  Key,
  DollarSign,
  TrendingUp,
  Coins,
  Settings,
  FileText,
  History,
  Search,
  Copy,
  Check,
} from "lucide-react";
import { Input } from "@/components/ui/input";

const AdminChangePasswordModal = lazy(() =>
  import("../components/modals/admin-change-password-modal").then((m) => ({
    default: m.AdminChangePasswordModal,
  })),
);
const AdminUserManagementModal = lazy(() =>
  import("../components/modals/admin-user-management-modal").then((m) => ({
    default: m.AdminUserManagementModal,
  })),
);
const AdminKYCManagementModal = lazy(() =>
  import("../components/modals/admin-kyc-management-modal").then((m) => ({
    default: m.AdminKYCManagementModal,
  })),
);
const AdminDepositRequestsModal = lazy(() =>
  import("../components/modals/admin-deposit-requests-modal").then((m) => ({
    default: m.AdminDepositRequestsModal,
  })),
);
const AdminWithdrawRequestsModal = lazy(() =>
  import("../components/modals/admin-withdraw-requests-modal").then((m) => ({
    default: m.AdminWithdrawRequestsModal,
  })),
);
const AdminWithdrawHistoryModal = lazy(() =>
  import("../components/modals/admin-withdraw-history-modal").then((m) => ({
    default: m.AdminWithdrawHistoryModal,
  })),
);
const AdminDepositHistoryModal = lazy(() =>
  import("../components/modals/admin-deposit-history-modal").then((m) => ({
    default: m.AdminDepositHistoryModal,
  })),
);
const AdminLoanManagementModal = lazy(() =>
  import("../components/modals/admin-loan-management-modal").then((m) => ({
    default: m.AdminLoanManagementModal,
  })),
);
const AdminFuturesSettingsModal = lazy(() =>
  import("../components/modals/admin-futures-settings-modal").then((m) => ({
    default: m.AdminFuturesSettingsModal,
  })),
);
const ProfilePictureViewerModal = lazy(() =>
  import("../components/modals/profile-picture-viewer-modal").then((m) => ({
    default: m.ProfilePictureViewerModal,
  })),
);
import { formatGenericCryptoBalance } from '../utils/format-utils';

export default function AdminUsers() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPasswords, setShowPasswords] = useState(false);
  const [selectedUser, setSelectedUser] = useState<{ id: string; email: string } | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [selectedManagementUser, setSelectedManagementUser] = useState<any>(null);
  const [showManagementModal, setShowManagementModal] = useState(false);
  const [showKYCModal, setShowKYCModal] = useState(false);
  const [showDepositRequestsModal, setShowDepositRequestsModal] = useState(false);
  const [showWithdrawRequestsModal, setShowWithdrawRequestsModal] = useState(false);
  const [showWithdrawHistoryModal, setShowWithdrawHistoryModal] = useState(false);
  const [showDepositHistoryModal, setShowDepositHistoryModal] = useState(false);
  const [showLoanManagementModal, setShowLoanManagementModal] = useState(false);
  const [showFuturesSettingsModal, setShowFuturesSettingsModal] = useState(false);
  const [selectedFuturesUser, setSelectedFuturesUser] = useState<any>(null);


  const [showProfilePictureModal, setShowProfilePictureModal] = useState(false);
  const [selectedProfilePicture, setSelectedProfilePicture] = useState<{ url: string; userName: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filteredUsers = users.filter(user => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (user.username || '').toLowerCase().includes(q) ||
      (user.email || '').toLowerCase().includes(q) ||
      (user.full_name || '').toLowerCase().includes(q) ||
      (user.display_id || '').toLowerCase().includes(q) ||
      (user.id || '').toLowerCase().includes(q)
    );
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('No authentication token');

      const res = await fetch(`/api/admin/users?t=${Date.now()}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) throw new Error('Failed to fetch users');
      const { users } = await res.json();
      setUsers(users || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  const getStatusBadge = (user: any) => {
    // Only show "Verified" badge when both email is confirmed AND KYC is approved
    if (user.email_confirmed_at && user.is_verified) {
      return <Badge className="bg-green-500/10 text-green-400 border-green-500/20">Verified</Badge>;
    }
    return <Badge variant="outline" className="text-orange-400 border-orange-500/20 bg-orange-500/10">Pending</Badge>;
  };

  const handleChangePassword = (user: any) => {
    setSelectedUser({ id: user.id, email: user.email });
    setShowPasswordModal(true);
  };

  const handlePasswordModalClose = () => {
    setShowPasswordModal(false);
    setSelectedUser(null);
    // Refresh users to show updated password status
    fetchUsers();
  };

  const handleManagementModalClose = () => {
    setShowManagementModal(false);
    setSelectedManagementUser(null);
    // Refresh users to show updated data
    fetchUsers();
  };

  const handleOpenManagement = (user: any) => {
    setSelectedManagementUser(user);
    setShowManagementModal(true);
  };

  const handleOpenKYCManagement = () => {
    setShowKYCModal(true);
  };

  const handleOpenDepositRequests = () => {
    setShowDepositRequestsModal(true);
  };

  const handleOpenWithdrawRequests = () => {
    setShowWithdrawRequestsModal(true);
  };

  const handleOpenWithdrawHistory = () => {
    setShowWithdrawHistoryModal(true);
  };

  const handleOpenDepositHistory = () => {
    setShowDepositHistoryModal(true);
  };

  const handleOpenLoanManagement = () => {
    setShowLoanManagementModal(true);
  };



  const handleViewProfilePicture = (profilePictureUrl: string, userName: string) => {
    setSelectedProfilePicture({ url: profilePictureUrl, userName });
    setShowProfilePictureModal(true);
  };

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-white">User Management</h1>
              <p className="text-sm text-gray-500 mt-1">{users.length} total users registered</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowPasswords(!showPasswords)}
                className="inline-flex items-center rounded-xl text-xs font-medium border border-[#1e1e1e] bg-[#0a0a0a] text-gray-300 hover:bg-[#1a1a1a] hover:border-[#2a2a2a] hover:text-white h-9 px-3 transition-colors"
              >
                {showPasswords ? <EyeOff className="h-3.5 w-3.5 mr-1.5" /> : <Eye className="h-3.5 w-3.5 mr-1.5" />}
                {showPasswords ? 'Hide' : 'Show'} Auth
              </button>
              <Button
                onClick={fetchUsers}
                size="sm"
                className="rounded-xl text-xs bg-blue-600 hover:bg-blue-700"
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Refresh
              </Button>
            </div>
          </div>

          {/* Action Buttons Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <button
              onClick={handleOpenDepositRequests}
              className="group flex flex-col items-center gap-1.5 bg-[#0a0a0a] border border-[#1e1e1e] rounded-2xl p-3 hover:border-emerald-500/30 hover:bg-emerald-500/10 transition-all duration-200"
            >
              <div className="w-9 h-9 bg-emerald-500/10 rounded-xl flex items-center justify-center group-hover:bg-emerald-500/20 transition-colors">
                <DollarSign className="h-4 w-4 text-emerald-400" />
              </div>
              <span className="text-[11px] font-medium text-gray-400 group-hover:text-emerald-400 transition-colors text-center leading-tight">Deposit<br className="sm:hidden" /> Requests</span>
            </button>
            <button
              onClick={handleOpenWithdrawRequests}
              className="group flex flex-col items-center gap-1.5 bg-[#0a0a0a] border border-[#1e1e1e] rounded-2xl p-3 hover:border-blue-500/30 hover:bg-blue-500/10 transition-all duration-200"
            >
              <div className="w-9 h-9 bg-blue-500/10 rounded-xl flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                <DollarSign className="h-4 w-4 text-blue-400" />
              </div>
              <span className="text-[11px] font-medium text-gray-400 group-hover:text-blue-400 transition-colors text-center leading-tight">Withdraw<br className="sm:hidden" /> Requests</span>
            </button>
            <button
              onClick={handleOpenDepositHistory}
              className="group flex flex-col items-center gap-1.5 bg-[#0a0a0a] border border-[#1e1e1e] rounded-2xl p-3 hover:border-orange-500/30 hover:bg-orange-500/10 transition-all duration-200"
            >
              <div className="w-9 h-9 bg-orange-500/10 rounded-xl flex items-center justify-center group-hover:bg-orange-500/20 transition-colors">
                <History className="h-4 w-4 text-orange-400" />
              </div>
              <span className="text-[11px] font-medium text-gray-400 group-hover:text-orange-400 transition-colors text-center leading-tight">Deposit<br className="sm:hidden" /> History</span>
            </button>
            <button
              onClick={handleOpenWithdrawHistory}
              className="group flex flex-col items-center gap-1.5 bg-[#0a0a0a] border border-[#1e1e1e] rounded-2xl p-3 hover:border-purple-500/30 hover:bg-purple-500/10 transition-all duration-200"
            >
              <div className="w-9 h-9 bg-purple-500/10 rounded-xl flex items-center justify-center group-hover:bg-purple-500/20 transition-colors">
                <History className="h-4 w-4 text-purple-400" />
              </div>
              <span className="text-[11px] font-medium text-gray-400 group-hover:text-purple-400 transition-colors text-center leading-tight">Withdraw<br className="sm:hidden" /> History</span>
            </button>
            <button
              onClick={handleOpenKYCManagement}
              className="group flex flex-col items-center gap-1.5 bg-[#0a0a0a] border border-[#1e1e1e] rounded-2xl p-3 hover:border-indigo-500/30 hover:bg-indigo-500/10 transition-all duration-200"
            >
              <div className="w-9 h-9 bg-indigo-500/10 rounded-xl flex items-center justify-center group-hover:bg-indigo-500/20 transition-colors">
                <FileText className="h-4 w-4 text-indigo-400" />
              </div>
              <span className="text-[11px] font-medium text-gray-400 group-hover:text-indigo-400 transition-colors text-center leading-tight">KYC<br className="sm:hidden" /> Mgmt</span>
            </button>
            <button
              onClick={handleOpenLoanManagement}
              className="group flex flex-col items-center gap-1.5 bg-[#0a0a0a] border border-[#1e1e1e] rounded-2xl p-3 hover:border-teal-500/30 hover:bg-teal-500/10 transition-all duration-200"
            >
              <div className="w-9 h-9 bg-teal-500/10 rounded-xl flex items-center justify-center group-hover:bg-teal-500/20 transition-colors">
                <DollarSign className="h-4 w-4 text-teal-400" />
              </div>
              <span className="text-[11px] font-medium text-gray-400 group-hover:text-teal-400 transition-colors text-center leading-tight">Loan<br className="sm:hidden" /> Mgmt</span>
            </button>
          </div>
        </div>

        {/* Search + Users List */}
        <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] overflow-hidden">
          {/* Search Header */}
          <div className="p-4 md:p-5 border-b border-[#1e1e1e]">
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center">
                  <Users className="h-4 w-4 text-blue-400" />
                </div>
                <span className="font-semibold text-white text-sm">
                  {searchQuery ? `${filteredUsers.length} of ${users.length} users` : `${users.length} Users`}
                </span>
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
                <Input
                  placeholder="Search users..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-9 rounded-xl border-[#1e1e1e] bg-[#0a0a0a] text-sm h-9 text-white placeholder:text-gray-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Users List */}
          <div className="p-4 md:p-5">
            {loading ? (
              <div className="text-center py-16">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 mx-auto"></div>
                <p className="mt-3 text-sm text-gray-500">Loading users...</p>
              </div>
            ) : error ? (
              <div className="text-center py-8">
                <div className="bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl p-4 text-sm inline-block">{error}</div>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 bg-[#1a1a1a] rounded-2xl mx-auto mb-4 flex items-center justify-center">
                  <Users className="h-8 w-8 text-gray-500" />
                </div>
                <p className="text-gray-500 text-sm">No users found</p>
              </div>
            ) : (
              <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1 custom-scrollbar">
                {filteredUsers.map(user => (
                  <div key={user.id} className="bg-[#0a0a0a] border border-[#1e1e1e] rounded-2xl p-4 md:p-5 hover:border-[#2a2a2a] transition-all duration-200">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                      {/* Left Column - User Info */}
                      <div>
                        {/* User Header */}
                        <div className="flex items-center gap-3 mb-4">
                          <div className="relative flex-shrink-0">
                            <div 
                              className={`w-11 h-11 bg-gradient-to-br from-blue-500/20 to-indigo-500/20 rounded-xl flex items-center justify-center overflow-hidden ring-2 ring-[#111] ${user.profile_picture ? 'cursor-pointer hover:ring-blue-500/50' : ''}`}
                              onClick={() => user.profile_picture && handleViewProfilePicture(user.profile_picture, user.full_name || user.email)}
                            >
                              {user.profile_picture ? (
                                <img src={user.profile_picture} alt="Profile" className="w-full h-full object-cover" />
                              ) : (
                                <User className="h-5 w-5 text-blue-400" />
                              )}
                            </div>
                            {user.is_active !== false && (
                              <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full ring-2 ring-[#111]" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className="font-semibold text-white text-sm truncate">{user.full_name || user.email}</h3>
                            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                              {getStatusBadge(user)}
                              <span className="text-xs font-mono text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded-md">
                                @{user.username || user.email?.split('@')[0] || 'unknown'}
                              </span>
                              <span className="text-[10px] text-gray-500">#{user.display_id || user.id.substring(0, 8)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Contact Info */}
                        <div className="space-y-1.5 text-xs">
                          <div className="flex items-center gap-2 text-gray-400">
                            <Mail className="h-3.5 w-3.5 text-gray-500 flex-shrink-0" />
                            <span className="truncate">{user.email}</span>
                          </div>
                          <div className="flex items-center gap-2 text-gray-400">
                            <Calendar className="h-3.5 w-3.5 text-gray-500 flex-shrink-0" />
                            <span>Joined {formatDate(user.created_at)}</span>
                          </div>
                          {user.last_sign_in_at && (
                            <div className="flex items-center gap-2 text-gray-400">
                              <Calendar className="h-3.5 w-3.5 text-gray-500 flex-shrink-0" />
                              <span>Last login {formatDate(user.last_sign_in_at)}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2 text-gray-400">
                            <Phone className="h-3.5 w-3.5 text-gray-500 flex-shrink-0" />
                            <span>{user.phone || 'No phone'}</span>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex flex-wrap gap-2 mt-4">
                          <button
                            onClick={() => handleChangePassword(user)}
                            className="inline-flex items-center gap-1 rounded-xl text-xs font-medium bg-red-600 text-white hover:bg-red-700 h-8 px-3 transition-colors"
                          >
                            <Key className="h-3 w-3" />
                            Password
                          </button>
                          <button
                            onClick={() => handleOpenManagement(user)}
                            className="inline-flex items-center gap-1 rounded-xl text-xs font-medium border border-blue-500/30 text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 hover:border-blue-500/50 h-8 px-3 transition-colors"
                          >
                            <Settings className="h-3 w-3" />
                            Manage
                          </button>
                          <button
                            onClick={() => {
                              setSelectedFuturesUser(user);
                              setShowFuturesSettingsModal(true);
                            }}
                            className="inline-flex items-center gap-1 rounded-xl text-xs font-medium border border-purple-500/30 text-purple-400 bg-purple-500/10 hover:bg-purple-500/20 hover:border-purple-500/50 h-8 px-3 transition-colors"
                          >
                            <TrendingUp className="h-3 w-3" />
                            Futures
                          </button>
                        </div>
                      </div>

                      {/* Right Column - Portfolio & Status */}
                      <div className="space-y-3">
                        {/* Portfolio Card */}
                        <div className="bg-[#0a0a0a] rounded-xl border border-[#1e1e1e] p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <Coins className="h-3.5 w-3.5 text-blue-400" />
                            <span className="text-xs font-semibold text-gray-300">Portfolio & Trading</span>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div className="text-center">
                              <p className="text-lg font-bold text-white">{user.assets_count || 0}</p>
                              <p className="text-[10px] text-gray-500">Assets</p>
                            </div>
                            <div className="text-center">
                              <p className="text-lg font-bold text-white">{formatCurrency(user.total_portfolio_value || 0)}</p>
                              <p className="text-[10px] text-gray-500">Portfolio</p>
                            </div>
                            <div className="text-center">
                              <p className="text-lg font-bold text-white">{user.trade_count || 0}</p>
                              <p className="text-[10px] text-gray-500">Trades</p>
                            </div>
                          </div>
                          {/* Portfolio Assets */}
                          {user.portfolio && user.portfolio.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-[#1e1e1e]">
                              <div className="space-y-1">
                                {user.portfolio.slice(0, 5).map((asset: any, index: number) => (
                                  <div key={index} className="flex justify-between text-[11px]">
                                    <span className="font-semibold text-gray-300">{asset.symbol}</span>
                                    <span className="text-gray-500">{formatGenericCryptoBalance(asset.available || '0', asset.symbol)}</span>
                                  </div>
                                ))}
                                {user.portfolio.length > 5 && (
                                  <p className="text-[10px] text-gray-500 text-center">+{user.portfolio.length - 5} more</p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Status Grid */}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-[#0a0a0a] rounded-xl border border-[#1e1e1e] p-2.5 text-center">
                            <p className="text-[10px] text-gray-500 mb-0.5">Email</p>
                            <Badge variant={user.email_confirmed_at ? "default" : "outline"} className={`text-[10px] px-1.5 py-0 ${user.email_confirmed_at ? 'bg-green-500/10 text-green-400 hover:bg-green-500/10' : 'text-orange-400 bg-orange-500/10'}`}>
                              {user.email_confirmed_at ? 'Confirmed' : 'Pending'}
                            </Badge>
                          </div>
                          <div className="bg-[#0a0a0a] rounded-xl border border-[#1e1e1e] p-2.5 text-center">
                            <p className="text-[10px] text-gray-500 mb-0.5">KYC</p>
                            <Badge variant={user.kyc_status === 'approved' ? "default" : "outline"} className={`text-[10px] px-1.5 py-0 ${user.kyc_status === 'approved' ? 'bg-green-500/10 text-green-400 hover:bg-green-500/10' : 'text-orange-400 bg-orange-500/10'}`}>
                              {user.kyc_status === 'approved' ? 'Approved' : user.kyc_status === 'pending' ? 'Pending' : user.kyc_status === 'rejected' ? 'Rejected' : 'None'}
                            </Badge>
                          </div>
                          <div className="bg-[#0a0a0a] rounded-xl border border-[#1e1e1e] p-2.5 text-center">
                            <p className="text-[10px] text-gray-500 mb-0.5">Loans</p>
                            <span className="text-sm font-semibold text-white">{user.active_loans_count || 0}</span>
                          </div>
                          <div className="bg-[#0a0a0a] rounded-xl border border-[#1e1e1e] p-2.5 text-center">
                            <p className="text-[10px] text-gray-500 mb-0.5">Staking</p>
                            <span className="text-sm font-semibold text-white">{user.active_staking_count || 0}</span>
                          </div>
                        </div>

                        {/* Auth Details (expandable) */}
                        {showPasswords && (
                          <div className="bg-amber-500/10 rounded-xl border border-amber-500/20 p-3 space-y-2">
                            <div className="flex items-center gap-1.5">
                              <Shield className="h-3.5 w-3.5 text-amber-400" />
                              <span className="text-xs font-semibold text-amber-300">Auth Details</span>
                            </div>
                            <div className="space-y-1.5 text-[11px]">
                              <div className="flex items-center justify-between">
                                <span className="text-amber-400">Username</span>
                                <span className="font-mono text-amber-200 bg-[#111] px-1.5 py-0.5 rounded">@{user.username || 'N/A'}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-amber-400">Provider</span>
                                <span className="text-amber-200 bg-[#111] px-1.5 py-0.5 rounded">{user.app_metadata?.provider || 'email'}</span>
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-amber-400 flex-shrink-0">User ID</span>
                                <div className="flex items-center gap-1 min-w-0">
                                  <code className="text-[10px] text-amber-200 bg-[#111] px-1.5 py-0.5 rounded truncate block">{user.id}</code>
                                  <button
                                    onClick={() => copyToClipboard(user.id)}
                                    className="p-0.5 hover:bg-amber-500/20 rounded flex-shrink-0"
                                  >
                                    {copiedId === user.id ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3 text-amber-400" />}
                                  </button>
                                </div>
                              </div>
                              {/* Password */}
                              <div className="bg-red-500/10 rounded-lg p-2 border border-red-500/20 mt-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-red-400 font-medium">Password</span>
                                  <span className="font-mono text-red-200 bg-[#111] px-1.5 py-0.5 rounded text-[11px] max-w-[200px] truncate" title={user.password || 'Not set'}>
                                    {user.password 
                                      ? (user.password.includes(':') && user.password.length > 100 
                                          ? '***HASHED***' 
                                          : user.password)
                                      : 'Not set'}
                                  </span>
                                </div>
                                {user.password_last_updated && (
                                  <p className="text-[10px] text-red-400 mt-1">Updated: {formatDate(user.password_last_updated)}</p>
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
        </div>
      </div>

      {selectedUser && (
        <Suspense fallback={null}>
          <AdminChangePasswordModal
            isOpen={showPasswordModal}
            onClose={handlePasswordModalClose}
            user={selectedUser}
          />
        </Suspense>
      )}

      <Suspense fallback={null}>
        <AdminUserManagementModal
          isOpen={showManagementModal}
          onClose={handleManagementModalClose}
          initialUserId={selectedManagementUser?.id}
        />

        <AdminKYCManagementModal
          isOpen={showKYCModal}
          onClose={() => setShowKYCModal(false)}
        />

        <AdminDepositRequestsModal
          isOpen={showDepositRequestsModal}
          onClose={() => setShowDepositRequestsModal(false)}
        />
        <AdminWithdrawRequestsModal
          isOpen={showWithdrawRequestsModal}
          onClose={() => setShowWithdrawRequestsModal(false)}
        />
        <AdminWithdrawHistoryModal
          isOpen={showWithdrawHistoryModal}
          onClose={() => setShowWithdrawHistoryModal(false)}
        />
        <AdminDepositHistoryModal
          isOpen={showDepositHistoryModal}
          onClose={() => setShowDepositHistoryModal(false)}
        />

        <AdminLoanManagementModal
          isOpen={showLoanManagementModal}
          onClose={() => setShowLoanManagementModal(false)}
        />

        {selectedProfilePicture && (
          <ProfilePictureViewerModal
            isOpen={showProfilePictureModal}
            onClose={() => {
              setShowProfilePictureModal(false);
              setSelectedProfilePicture(null);
            }}
            profilePictureUrl={selectedProfilePicture.url}
            userName={selectedProfilePicture.userName}
          />
        )}

        {selectedFuturesUser && (
          <AdminFuturesSettingsModal
            isOpen={showFuturesSettingsModal}
            onClose={() => {
              setShowFuturesSettingsModal(false);
              setSelectedFuturesUser(null);
              fetchUsers();
            }}
            userId={selectedFuturesUser.id}
            userEmail={selectedFuturesUser.email}
            userName={selectedFuturesUser.full_name || selectedFuturesUser.email}
            currentMinAmount={parseFloat(selectedFuturesUser.futures_min_amount) || 50}
            currentTradeResult={selectedFuturesUser.futures_trade_result}
          />
        )}
      </Suspense>
    </AdminLayout>
  );
} 
