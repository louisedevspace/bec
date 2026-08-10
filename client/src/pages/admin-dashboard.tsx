import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { timeAgo as timeAgoUtil } from '@/lib/date-utils';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  CheckCircle, XCircle, Clock, TrendingUp, TrendingDown, Activity,
  BarChart3, DollarSign, AlertTriangle, ArrowUpRight,
  ArrowDownRight, RefreshCw, Search, Landmark,
  MessageSquare, FileCheck, ArrowRight
} from "lucide-react";
import { cryptoApi } from "@/services/crypto-api";
import { CryptoIcon } from "@/components/crypto/crypto-icon";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from 'wouter';
import type { Trade } from "@/types/crypto";
import AdminLayout from './admin-layout';
import { supabase } from "@/lib/supabaseClient";
import { useAdminPendingCounts } from "@/hooks/use-admin-pending-counts";

const AdminKYCManagementModal = lazy(() =>
  import("../components/modals/admin-kyc-management-modal").then((m) => ({ default: m.AdminKYCManagementModal })),
);
const AdminDepositRequestsModal = lazy(() =>
  import("../components/modals/admin-deposit-requests-modal").then((m) => ({ default: m.AdminDepositRequestsModal })),
);
const AdminWithdrawRequestsModal = lazy(() =>
  import("../components/modals/admin-withdraw-requests-modal").then((m) => ({ default: m.AdminWithdrawRequestsModal })),
);
const AdminWithdrawHistoryModal = lazy(() =>
  import("../components/modals/admin-withdraw-history-modal").then((m) => ({ default: m.AdminWithdrawHistoryModal })),
);
const AdminDepositHistoryModal = lazy(() =>
  import("../components/modals/admin-deposit-history-modal").then((m) => ({ default: m.AdminDepositHistoryModal })),
);
const AdminLoanManagementModal = lazy(() =>
  import("../components/modals/admin-loan-management-modal").then((m) => ({ default: m.AdminLoanManagementModal })),
);

interface DashboardStats {
  financial: {
    pendingDeposits: number;
    pendingWithdrawals: number;
  };
  trading: {
    pendingTrades: number;
  };
  support: { urgent: number };
  recentActivity: Array<{ type: string; description: string; time: string; status: string }>;
}

interface SupportConversationPreview {
  id: number;
  subject: string;
  unreadCount: number;
  users: {
    full_name: string;
  };
}

function timeAgo(dateStr: string): string {
  return timeAgoUtil(dateStr);
}

// === Main Component ===

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState("orders");
  const [, setLocation] = useLocation();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showKYCModal, setShowKYCModal] = useState(false);
  const [showDepositRequestsModal, setShowDepositRequestsModal] = useState(false);
  const [showWithdrawRequestsModal, setShowWithdrawRequestsModal] = useState(false);
  const [showWithdrawHistoryModal, setShowWithdrawHistoryModal] = useState(false);
  const [showDepositHistoryModal, setShowDepositHistoryModal] = useState(false);
  const [showLoanManagementModal, setShowLoanManagementModal] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { counts: pendingCounts } = useAdminPendingCounts(15000);

  const { data: unreadSupportChats = [] } = useQuery<SupportConversationPreview[]>({
    queryKey: ["/api/admin/support/conversations", "dashboard-unread-preview"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return [];

      const res = await fetch('/api/admin/support/conversations', {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        throw new Error('Failed to fetch support conversations');
      }

      const data = await res.json();
      return data
        .map((conversation: any) => ({
          id: conversation.id,
          subject: conversation.subject,
          users: {
            full_name: conversation.users?.full_name || 'Unknown User',
          },
          unreadCount: conversation.support_messages?.filter((message: any) => !message.is_read && message.sender_type === 'user').length || 0,
        }))
        .filter((conversation: SupportConversationPreview) => conversation.unreadCount > 0);
    },
    refetchInterval: 10000,
    staleTime: 5000,
  });

  const unreadSupportPreview = unreadSupportChats.slice(0, 2)
    .map((conversation) => `${conversation.users.full_name} (#${conversation.id})`)
    .join(', ');

  // Badge counts for each dashboard tab
  const tabBadges: Record<string, number> = {
    'orders': 0,
    'pending-orders': pendingCounts.trades,
    'activity': 0,
  };

  const fetchDashboardStats = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('No authentication token');

      const res = await fetch('/api/admin/dashboard-stats', {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to fetch stats');
      }
      const data = await res.json();
      setStats(data);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardStats();
    const interval = setInterval(fetchDashboardStats, 30000);
    return () => clearInterval(interval);
  }, [fetchDashboardStats]);

  // Pending orders
  const { data: pendingOrders, isLoading: ordersLoading } = useQuery({
    queryKey: ["/api/admin/pending-orders"],
    queryFn: () => cryptoApi.getPendingOrders(),
    refetchInterval: 5000,
  });

  const { data: allOrders } = useQuery({
    queryKey: ["/api/admin/all-orders"],
    queryFn: () => cryptoApi.getAllOrders(),
  });

  const approveMutation = useMutation({
    mutationFn: (orderId: number) => cryptoApi.approveOrder(orderId),
    onSuccess: () => {
      toast({ title: "Order Approved", description: "The order has been approved and executed." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/all-orders"] });
    },
    onError: () => {
      toast({ title: "Approval Failed", description: "Failed to approve the order.", variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (orderId: number) => cryptoApi.rejectOrder(orderId),
    onSuccess: () => {
      toast({ title: "Order Rejected", description: "The order has been rejected." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/all-orders"] });
    },
    onError: () => {
      toast({ title: "Rejection Failed", description: "Failed to reject the order.", variant: "destructive" });
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending_approval": case "pending": return "bg-yellow-500/20 text-yellow-400";
      case "approved": case "executed": case "filled": case "resolved": case "closed": return "bg-green-500/20 text-green-400";
      case "rejected": return "bg-red-500/20 text-red-400";
      case "open": case "in_progress": return "bg-blue-500/20 text-blue-400";
      default: return "bg-gray-500/20 text-gray-400";
    }
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'deposit': return <ArrowDownRight size={14} className="text-green-400 fill-current" />;
      case 'withdrawal': return <ArrowUpRight size={14} className="text-red-400 fill-current" />;
      case 'trade': return <BarChart3 size={14} className="text-blue-400 fill-current" />;
      case 'support': return <MessageSquare size={14} className="text-purple-400 fill-current" />;
      default: return <Activity size={14} className="text-gray-400 fill-current" />;
    }
  };

  const handleActivityClick = (type: string) => {
    switch (type) {
      case 'deposit':
      case 'withdrawal':
        setLocation('/admin/wallets');
        break;
      case 'trade':
        setActiveTab('pending-orders');
        break;
      case 'support':
        setLocation('/admin/support');
        break;
      default:
        setLocation('/admin/users');
        break;
    }
  };

  const formatPrice = (price: string | undefined) => {
    if (!price) return "Market";
    const num = parseFloat(price);
    return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  };

  const formatAmount = (amount: string, symbol: string) => {
    const num = parseFloat(amount);
    const base = symbol.split("/")[0];
    return num >= 1000 ? `${num.toLocaleString()} ${base}` : num >= 1 ? `${num.toFixed(4)} ${base}` : `${num.toFixed(8)} ${base}`;
  };

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return 'N/A';
    try {
      let date: Date;
      if (!dateString.includes('Z') && !dateString.match(/[+-]\d{2}:\d{2}$/)) {
        date = new Date(dateString + 'Z');
      } else {
        date = new Date(dateString);
      }
      if (isNaN(date.getTime())) return 'N/A';
      return date.toLocaleString(undefined, {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
      });
    } catch {
      return 'N/A';
    }
  };

  const filteredOrders = (orders: Trade[] | undefined) => {
    if (!orders) return [];
    if (!searchQuery) return orders;
    const q = searchQuery.toLowerCase();
    return orders.filter((o: any) =>
      o.symbol?.toLowerCase().includes(q) ||
      o.side?.toLowerCase().includes(q) ||
      o.status?.toLowerCase().includes(q) ||
      String(o.id).includes(q) ||
      o.userDetails?.email?.toLowerCase().includes(q) ||
      o.userDetails?.fullName?.toLowerCase().includes(q)
    );
  };

  const renderOrderList = (orders: Trade[] | undefined, showActions = false) => {
    const filtered = filteredOrders(orders);
    if (!filtered.length) {
      return (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-[#1a1a1a] rounded-full mx-auto mb-4 flex items-center justify-center">
            <BarChart3 className="h-7 w-7 text-gray-600 fill-current" />
          </div>
          <p className="text-gray-500 text-sm">{searchQuery ? "No matching orders found" : showActions ? "No pending orders" : "No orders found"}</p>
        </div>
      );
    }
    return (
      <div className="space-y-3">
        {filtered.map((order: any) => (
          <div key={order.id} className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-xl p-4 hover:border-[#2a2a2a] transition-all">
            <div className="flex flex-col lg:flex-row lg:items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  {order.side === "buy" || order.side === "long"
                    ? <TrendingUp size={14} className="text-green-400 fill-current" />
                    : <TrendingDown size={14} className="text-red-400 fill-current" />}
                  <CryptoIcon symbol={order.symbol?.split('/')[0] || order.symbol} size="xs" />
                  <span className="font-semibold text-white">{order.symbol}</span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">{order.side.toUpperCase()}</Badge>
                  <Badge className={`${getStatusColor(order.status)} text-[10px] px-1.5 py-0`}>
                    {order.status.replace('_', ' ').toUpperCase()}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
                  <span><strong>Amount:</strong> {formatAmount(order.amount, order.symbol)}</span>
                  <span><strong>Price:</strong> {formatPrice(order.price)}</span>
                  <span><strong>ID:</strong> #{order.id}</span>
                  <span><strong>Time:</strong> {formatDate((order as any).created_at || order.createdAt)}</span>
                </div>
                {order.userDetails && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mt-1">
                    <span>{order.userDetails.fullName}</span>
                    <span>{order.userDetails.email}</span>
                  </div>
                )}
              </div>
              {showActions && ["pending_approval", "pending"].includes(order.status) && (
                <div className="flex gap-2 flex-shrink-0">
                  <Button size="sm" onClick={() => approveMutation.mutate(order.id)} disabled={approveMutation.isPending}
                    className="bg-green-600 hover:bg-green-700 text-white text-xs h-8 px-3">
                    <CheckCircle size={12} className="mr-1 fill-current" />Approve
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => rejectMutation.mutate(order.id)} disabled={rejectMutation.isPending}
                    className="text-xs h-8 px-3">
                    <XCircle size={12} className="mr-1 fill-current" />Reject
                  </Button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Loading state
  if (loading) {
    return (
      <AdminLayout>
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="h-8 w-48 bg-[#1a1a1a] rounded-lg animate-pulse" />
              <div className="h-4 w-72 bg-[#1a1a1a] rounded-lg animate-pulse mt-2" />
            </div>
          </div>
          <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-5 animate-pulse h-72" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-white">Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">Platform management</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => { setLoading(true); fetchDashboardStats(); }}
              className="border-[#2a2a2a] text-gray-300 hover:bg-[#1a1a1a] text-xs h-8">
              <RefreshCw size={14} className="mr-1.5 fill-current" />Refresh
            </Button>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-red-400 text-sm flex items-center gap-2">
            <AlertTriangle size={16} className="fill-current" />{error}
          </div>
        )}

        {stats && (
          <>
            {/* Alert Banners */}
            {(unreadSupportChats.length > 0 || stats.support.urgent > 0 || stats.financial.pendingDeposits > 0 || stats.financial.pendingWithdrawals > 0 || stats.trading.pendingTrades > 0) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {unreadSupportChats.length > 0 && (
                  <button onClick={() => setLocation('/admin/support')} className="flex items-center gap-3 bg-purple-500/10 border border-purple-500/20 rounded-xl px-4 py-3 hover:bg-purple-500/15 transition-colors text-left">
                    <MessageSquare size={18} className="text-purple-400 flex-shrink-0 fill-current" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-purple-400">{unreadSupportChats.length} Unread Support Chat{unreadSupportChats.length === 1 ? '' : 's'}</p>
                      <p className="text-[10px] text-purple-400/70 truncate">{unreadSupportPreview}{unreadSupportChats.length > 2 ? ', …' : ''}</p>
                    </div>
                  </button>
                )}
                {stats.support.urgent > 0 && (
                  <a href="/admin/support" className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 hover:bg-red-500/15 transition-colors">
                    <AlertTriangle size={18} className="text-red-400 flex-shrink-0 fill-current" />
                    <div>
                      <p className="text-xs font-semibold text-red-400">{stats.support.urgent} Urgent Tickets</p>
                      <p className="text-[10px] text-red-400/60">Requires immediate attention</p>
                    </div>
                  </a>
                )}
                {stats.financial.pendingDeposits > 0 && (
                  <button onClick={() => setLocation('/admin/wallets')} className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 hover:bg-amber-500/15 transition-colors text-left">
                    <Clock size={18} className="text-amber-400 flex-shrink-0 fill-current" />
                    <div>
                      <p className="text-xs font-semibold text-amber-400">{stats.financial.pendingDeposits} Pending Deposits</p>
                      <p className="text-[10px] text-amber-400/60">Click to review</p>
                    </div>
                  </button>
                )}
                {stats.financial.pendingWithdrawals > 0 && (
                  <button onClick={() => setLocation('/admin/wallets')} className="flex items-center gap-3 bg-orange-500/10 border border-orange-500/20 rounded-xl px-4 py-3 hover:bg-orange-500/15 transition-colors text-left">
                    <Clock size={18} className="text-orange-400 flex-shrink-0 fill-current" />
                    <div>
                      <p className="text-xs font-semibold text-orange-400">{stats.financial.pendingWithdrawals} Pending Withdrawals</p>
                      <p className="text-[10px] text-orange-400/60">Click to review</p>
                    </div>
                  </button>
                )}
                {stats.trading.pendingTrades > 0 && (
                  <button onClick={() => setActiveTab('pending-orders')}
                    className="flex items-center gap-3 bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3 hover:bg-blue-500/15 transition-colors text-left">
                    <BarChart3 size={18} className="text-blue-400 flex-shrink-0 fill-current" />
                    <div>
                      <p className="text-xs font-semibold text-blue-400">{stats.trading.pendingTrades} Pending Trades</p>
                      <p className="text-[10px] text-blue-400/60">Click to review</p>
                    </div>
                  </button>
                )}
              </div>
            )}

            {/* User Management Actions */}
            <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-6 gap-1.5 sm:gap-2">
              <button
                onClick={() => setShowDepositRequestsModal(true)}
                className="group relative flex flex-col items-center gap-1 sm:gap-1.5 bg-[#0a0a0a] border border-[#1e1e1e] rounded-xl sm:rounded-2xl p-2 sm:p-3 hover:border-emerald-500/30 hover:bg-emerald-500/10 transition-all duration-200"
              >
                <div className="relative w-7 h-7 sm:w-9 sm:h-9 bg-emerald-500/10 rounded-lg sm:rounded-xl flex items-center justify-center group-hover:bg-emerald-500/20 transition-colors text-emerald-400">
                  <DollarSign className="h-3.5 w-3.5 sm:h-4 sm:w-4 fill-current" />
                  {pendingCounts.deposits > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] sm:min-w-[18px] sm:h-[18px] px-0.5 sm:px-1 bg-red-500 text-white text-[8px] sm:text-[9px] font-bold rounded-full flex items-center justify-center shadow-lg shadow-red-500/30 animate-pulse">
                      {pendingCounts.deposits > 99 ? '99+' : pendingCounts.deposits}
                    </span>
                  )}
                </div>
                <span className="text-[10px] sm:text-[11px] font-medium text-gray-400 group-hover:text-emerald-400 transition-colors text-center leading-tight">Deposit Requests</span>
              </button>

              <button
                onClick={() => setShowWithdrawRequestsModal(true)}
                className="group relative flex flex-col items-center gap-1 sm:gap-1.5 bg-[#0a0a0a] border border-[#1e1e1e] rounded-xl sm:rounded-2xl p-2 sm:p-3 hover:border-blue-500/30 hover:bg-blue-500/10 transition-all duration-200"
              >
                <div className="relative w-7 h-7 sm:w-9 sm:h-9 bg-blue-500/10 rounded-lg sm:rounded-xl flex items-center justify-center group-hover:bg-blue-500/20 transition-colors text-blue-400">
                  <DollarSign className="h-3.5 w-3.5 sm:h-4 sm:w-4 fill-current" />
                  {pendingCounts.withdrawals > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] sm:min-w-[18px] sm:h-[18px] px-0.5 sm:px-1 bg-red-500 text-white text-[8px] sm:text-[9px] font-bold rounded-full flex items-center justify-center shadow-lg shadow-red-500/30 animate-pulse">
                      {pendingCounts.withdrawals > 99 ? '99+' : pendingCounts.withdrawals}
                    </span>
                  )}
                </div>
                <span className="text-[10px] sm:text-[11px] font-medium text-gray-400 group-hover:text-blue-400 transition-colors text-center leading-tight">Withdraw Requests</span>
              </button>

              <button
                onClick={() => setShowDepositHistoryModal(true)}
                className="group relative flex flex-col items-center gap-1 sm:gap-1.5 bg-[#0a0a0a] border border-[#1e1e1e] rounded-xl sm:rounded-2xl p-2 sm:p-3 hover:border-orange-500/30 hover:bg-orange-500/10 transition-all duration-200"
              >
                <div className="relative w-7 h-7 sm:w-9 sm:h-9 bg-orange-500/10 rounded-lg sm:rounded-xl flex items-center justify-center group-hover:bg-orange-500/20 transition-colors text-orange-400">
                  <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4 fill-current" />
                </div>
                <span className="text-[10px] sm:text-[11px] font-medium text-gray-400 group-hover:text-orange-400 transition-colors text-center leading-tight">Deposit History</span>
              </button>

              <button
                onClick={() => setShowWithdrawHistoryModal(true)}
                className="group relative flex flex-col items-center gap-1 sm:gap-1.5 bg-[#0a0a0a] border border-[#1e1e1e] rounded-xl sm:rounded-2xl p-2 sm:p-3 hover:border-purple-500/30 hover:bg-purple-500/10 transition-all duration-200"
              >
                <div className="relative w-7 h-7 sm:w-9 sm:h-9 bg-purple-500/10 rounded-lg sm:rounded-xl flex items-center justify-center group-hover:bg-purple-500/20 transition-colors text-purple-400">
                  <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4 fill-current" />
                </div>
                <span className="text-[10px] sm:text-[11px] font-medium text-gray-400 group-hover:text-purple-400 transition-colors text-center leading-tight">Withdraw History</span>
              </button>

              <button
                onClick={() => setShowKYCModal(true)}
                className="group relative flex flex-col items-center gap-1 sm:gap-1.5 bg-[#0a0a0a] border border-[#1e1e1e] rounded-xl sm:rounded-2xl p-2 sm:p-3 hover:border-indigo-500/30 hover:bg-indigo-500/10 transition-all duration-200"
              >
                <div className="relative w-7 h-7 sm:w-9 sm:h-9 bg-indigo-500/10 rounded-lg sm:rounded-xl flex items-center justify-center group-hover:bg-indigo-500/20 transition-colors text-indigo-400">
                  <FileCheck className="h-3.5 w-3.5 sm:h-4 sm:w-4 fill-current" />
                  {pendingCounts.kyc > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] sm:min-w-[18px] sm:h-[18px] px-0.5 sm:px-1 bg-red-500 text-white text-[8px] sm:text-[9px] font-bold rounded-full flex items-center justify-center shadow-lg shadow-red-500/30 animate-pulse">
                      {pendingCounts.kyc > 99 ? '99+' : pendingCounts.kyc}
                    </span>
                  )}
                </div>
                <span className="text-[10px] sm:text-[11px] font-medium text-gray-400 group-hover:text-indigo-400 transition-colors text-center leading-tight">KYC Mgmt</span>
              </button>

              <button
                onClick={() => setShowLoanManagementModal(true)}
                className="group relative flex flex-col items-center gap-1 sm:gap-1.5 bg-[#0a0a0a] border border-[#1e1e1e] rounded-xl sm:rounded-2xl p-2 sm:p-3 hover:border-teal-500/30 hover:bg-teal-500/10 transition-all duration-200"
              >
                <div className="relative w-7 h-7 sm:w-9 sm:h-9 bg-teal-500/10 rounded-lg sm:rounded-xl flex items-center justify-center group-hover:bg-teal-500/20 transition-colors text-teal-400">
                  <Landmark className="h-3.5 w-3.5 sm:h-4 sm:w-4 fill-current" />
                  {pendingCounts.loans > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] sm:min-w-[18px] sm:h-[18px] px-0.5 sm:px-1 bg-red-500 text-white text-[8px] sm:text-[9px] font-bold rounded-full flex items-center justify-center shadow-lg shadow-red-500/30 animate-pulse">
                      {pendingCounts.loans > 99 ? '99+' : pendingCounts.loans}
                    </span>
                  )}
                </div>
                <span className="text-[10px] sm:text-[11px] font-medium text-gray-400 group-hover:text-teal-400 transition-colors text-center leading-tight">Loan Mgmt</span>
              </button>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="bg-[#111] border border-[#1e1e1e] rounded-xl p-1 h-auto flex flex-wrap gap-1">
                {['orders', 'pending-orders', 'activity'].map(tab => {
                  const badge = tabBadges[tab] || 0;
                  const label = tab === 'pending-orders' ? 'Pending Orders' : tab;
                  return (
                    <TabsTrigger key={tab} value={tab}
                      className="relative rounded-lg data-[state=active]:bg-blue-500/10 data-[state=active]:text-blue-400 text-gray-400 text-xs px-3 py-1.5 capitalize">
                      {label}
                      {badge > 0 && (
                        <span className="ml-1.5 min-w-[18px] h-[16px] px-1 bg-red-500 text-white text-[9px] font-bold rounded-full inline-flex items-center justify-center">
                          {badge > 99 ? '99+' : badge}
                        </span>
                      )}
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              {/* ===== ORDERS TAB (all orders with search) ===== */}
              <TabsContent value="orders" className="mt-4">
                <div className="bg-[#111] rounded-2xl border border-[#1e1e1e]">
                  <div className="p-4 border-b border-[#1e1e1e] flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1">
                      <h3 className="font-semibold text-white text-sm">All Orders</h3>
                      <p className="text-[11px] text-gray-500">{allOrders?.length || 0} total orders</p>
                    </div>
                    <div className="relative w-full sm:w-64">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 fill-current" />
                      <Input placeholder="Search orders..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                        className="pl-9 h-8 bg-[#0a0a0a] border-[#1e1e1e] text-xs text-white placeholder:text-gray-600" />
                    </div>
                  </div>
                  <div className="p-4 max-h-[600px] overflow-y-auto">{renderOrderList(allOrders)}</div>
                </div>
              </TabsContent>

              {/* ===== PENDING ORDERS TAB ===== */}
              <TabsContent value="pending-orders" className="mt-4">
                <div className="bg-[#111] rounded-2xl border border-[#1e1e1e]">
                  <div className="p-4 border-b border-[#1e1e1e] flex items-center gap-3">
                    <div className="w-8 h-8 bg-amber-500/10 rounded-lg flex items-center justify-center">
                      <Clock size={14} className="text-amber-400 fill-current" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white text-sm">Pending Approval</h3>
                      <p className="text-[11px] text-gray-500">{pendingOrders?.length || 0} orders waiting</p>
                    </div>
                  </div>
                  <div className="p-4">
                    {ordersLoading ? (
                      <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 mx-auto" />
                        <p className="mt-3 text-xs text-gray-500">Loading orders...</p>
                      </div>
                    ) : renderOrderList(pendingOrders, true)}
                  </div>
                </div>
              </TabsContent>

              {/* ===== ACTIVITY TAB ===== */}
              <TabsContent value="activity" className="mt-4">
                <div className="bg-[#111] rounded-2xl border border-[#1e1e1e]">
                  <div className="p-4 border-b border-[#1e1e1e]">
                    <h3 className="font-semibold text-white text-sm">Recent Activity</h3>
                    <p className="text-[11px] text-gray-500">Latest platform events across all modules</p>
                  </div>
                  <div className="divide-y divide-[#1e1e1e]">
                    {stats.recentActivity.length === 0 ? (
                      <div className="text-center py-12 text-gray-500 text-sm">No recent activity</div>
                    ) : (
                      stats.recentActivity.map((item, i) => (
                        <div key={i} className="flex items-center gap-3 px-4 py-3 hover:bg-[#0d0d0d] transition-colors cursor-pointer active:scale-[0.99]" onClick={() => handleActivityClick(item.type)}>
                          <div className="w-8 h-8 bg-[#1a1a1a] rounded-lg flex items-center justify-center flex-shrink-0">
                            {getActivityIcon(item.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-white truncate">{item.description}</p>
                            <p className="text-[10px] text-gray-500">{timeAgo(item.time)}</p>
                          </div>
                          <Badge className={`${getStatusColor(item.status)} text-[10px] px-1.5 py-0`}>
                            {item.status.replace('_', ' ')}
                          </Badge>
                          <ArrowRight size={10} className="text-gray-600 flex-shrink-0 fill-current" />
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <Suspense fallback={null}>
              <AdminDepositRequestsModal isOpen={showDepositRequestsModal} onClose={() => setShowDepositRequestsModal(false)} />
              <AdminWithdrawRequestsModal isOpen={showWithdrawRequestsModal} onClose={() => setShowWithdrawRequestsModal(false)} />
              <AdminDepositHistoryModal isOpen={showDepositHistoryModal} onClose={() => setShowDepositHistoryModal(false)} />
              <AdminWithdrawHistoryModal isOpen={showWithdrawHistoryModal} onClose={() => setShowWithdrawHistoryModal(false)} />
              <AdminKYCManagementModal isOpen={showKYCModal} onClose={() => setShowKYCModal(false)} />
              <AdminLoanManagementModal isOpen={showLoanManagementModal} onClose={() => setShowLoanManagementModal(false)} />
            </Suspense>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
