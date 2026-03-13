import { useState, useEffect, useCallback } from "react";
import { timeAgo as timeAgoUtil, formatChartDate } from '@/lib/date-utils';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  CheckCircle, XCircle, Clock, TrendingUp, TrendingDown, Users, Activity,
  BarChart3, DollarSign, Shield, AlertTriangle, ArrowUpRight,
  ArrowDownRight, RefreshCw, Search, Download, Wallet, Landmark,
  MessageSquare, FileCheck, Zap, Globe, ArrowRight, Bell
} from "lucide-react";
import { cryptoApi } from "@/services/crypto-api";
import { CryptoIcon } from "@/components/crypto/crypto-icon";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from 'wouter';
import type { Trade } from "@/types/crypto";
import AdminLayout from './admin-layout';
import { supabase } from "@/lib/supabaseClient";
import { useAdminPendingCounts } from "@/hooks/use-admin-pending-counts";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, ComposedChart,
  XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart as RechartsPie, Pie, Cell, Legend
} from 'recharts';

interface DashboardStats {
  users: {
    total: number; active: number; inactive: number; verified: number;
    newToday: number; newYesterday: number; newThisWeek: number; newThisMonth: number;
    usersWithPortfolio: number;
  };
  financial: {
    totalDeposits: number; pendingDeposits: number; totalDepositsCount: number;
    totalWithdrawals: number; pendingWithdrawals: number; totalWithdrawalsCount: number;
    totalPlatformValue: number; netFlow: number;
    fees: {
      total: number;
      byType: { deposits: number; withdrawals: number; trading: number };
      trends: {
        daily: Array<{ date: string; deposits: number; withdrawals: number; trading: number; total: number }>;
        monthly: Array<{ month: string; deposits: number; withdrawals: number; trading: number; total: number }>;
      };
      byUser: Array<{
        userId: string;
        username: string;
        email: string;
        totalFees: number;
        depositFees: number;
        withdrawalFees: number;
        tradingFees: number;
      }>;
    };
  };
  trading: {
    totalTrades: number; pendingTrades: number; completedTrades: number;
    totalVolume: number; totalFutures: number; activeFutures: number;
    completedFutures: number; futuresWins: number; futuresLosses: number;
    futuresWinRate: string;
  };
  staking: { activePositions: number; totalStaked: number };
  loans: { pending: number; approved: number; totalValue: number };
  support: { open: number; inProgress: number; resolved: number; urgent: number; total: number };
  kyc: { pending: number; approved: number; rejected: number };
  charts: {
    registrationTrend: Array<{ date: string; count: number }>;
    volumeTrend: Array<{ date: string; volume: number; count: number }>;
    financialTrend: Array<{ date: string; deposits: number; withdrawals: number }>;
  };
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

interface AnalyticsData {
  depositDaily: Array<{ date: string; amount: number; count: number; usdt: number; btc: number; eth: number; other: number }>;
  withdrawalDaily: Array<{ date: string; amount: number; count: number; usdt: number; btc: number; eth: number; other: number }>;
  profitDaily: Array<{ date: string; netFlow: number; cumulativeProfit: number; deposits: number; withdrawals: number; futuresRevenue: number }>;
  monthlyData: Array<{
    month: string; monthLabel: string; deposits: number; withdrawals: number;
    netFlow: number; profit: number; depositCount: number; withdrawalCount: number;
    dailyBreakdown: Array<{ day: number; deposits: number; withdrawals: number; net: number }>;
  }>;
  dayComparison: {
    today: { label: string; deposits: number; withdrawals: number; netFlow: number; depositCount: number; withdrawalCount: number };
    yesterday: { label: string; deposits: number; withdrawals: number; netFlow: number; depositCount: number; withdrawalCount: number };
    weekAgo: { label: string; deposits: number; withdrawals: number; netFlow: number; depositCount: number; withdrawalCount: number };
  };
  summary: {
    totalDeposits: number; totalWithdrawals: number; totalNetFlow: number;
    totalFuturesRevenue: number; totalProfit: number;
    depositsBySymbol: Record<string, number>; withdrawalsBySymbol: Record<string, number>;
    totalDepositCount: number; totalWithdrawalCount: number;
    allTimeDepositCount: number; allTimeWithdrawalCount: number;
  };
}

// Crypto symbol map for display
const CRYPTO_SYMBOLS: Record<string, string> = {
  BTC: '₿', ETH: 'Ξ', USDT: '$', BNB: 'BNB', SOL: 'SOL', XRP: 'XRP',
  ADA: 'ADA', DOGE: 'Ð', DOT: 'DOT', LINK: 'LINK', AVAX: 'AVAX',
  MATIC: 'MATIC', SHIB: 'SHIB', LTC: 'Ł', TRX: 'TRX', ATOM: 'ATOM',
  APT: 'APT', SUI: 'SUI', ARB: 'ARB', OP: 'OP', PEPE: 'PEPE', INJ: 'INJ',
};

function getCryptoSymbol(name: string): string {
  // name could be "BTC", "USDT", or display name like "Total"
  const upper = name.toUpperCase();
  return CRYPTO_SYMBOLS[upper] || upper;
}

function formatCryptoAmount(value: number, cryptoName: string): string {
  const sym = getCryptoSymbol(cryptoName);
  // For USD-like values (USDT, Total, Deposits, Withdrawals, Profit, etc.) use $ prefix
  const usdNames = ['USDT', 'TOTAL', 'DEPOSITS', 'WITHDRAWALS', 'PROFIT', 'NET FLOW',
    'DAILY NET FLOW', 'CUMULATIVE PROFIT', 'FUTURES REVENUE'];
  if (usdNames.includes(cryptoName.toUpperCase()) || sym === '$') {
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  // For crypto values, show symbol after number
  return `${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ${sym}`;
}

function formatCurrency(value: number): string {
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
}

function formatNumber(value: number): string {
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toString();
}

function timeAgo(dateStr: string): string {
  return timeAgoUtil(dateStr);
}

function ChartTooltipContent({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-2 shadow-xl">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} className="text-xs font-medium" style={{ color: entry.color }}>
          {entry.name}: {typeof entry.value === 'number' && entry.value > 100
            ? formatCurrency(entry.value)
            : entry.value}
        </p>
      ))}
    </div>
  );
}

// === Sub-components ===

function StatCard({ icon, iconBg, iconColor, label, value, sub, trend, pendingBadge, onClick }: {
  icon: React.ReactNode; iconBg: string; iconColor: string;
  label: string; value: string; sub?: string; trend?: 'up' | 'down' | 'neutral'; pendingBadge?: number; onClick?: () => void;
}) {
  return (
    <div
      className={`bg-[#111] rounded-2xl border border-[#1e1e1e] p-4 hover:border-[#2a2a2a] transition-all ${onClick ? 'cursor-pointer hover:bg-[#151515] active:scale-[0.98]' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <p className="text-[11px] font-medium text-gray-400 truncate">{label}</p>
          {pendingBadge !== undefined && pendingBadge > 0 && (
            <span className="min-w-[18px] h-[16px] px-1 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center flex-shrink-0 animate-pulse">
              {pendingBadge > 99 ? '99+' : pendingBadge}
            </span>
          )}
        </div>
        <div className={`w-8 h-8 ${iconBg} rounded-lg flex items-center justify-center flex-shrink-0 ${iconColor}`}>
          {icon}
        </div>
      </div>
      <div className="flex items-end gap-2">
        <p className="text-xl font-bold text-white leading-none">{value}</p>
        {trend === 'up' && <ArrowUpRight size={14} className="text-green-400 mb-0.5" />}
        {trend === 'down' && <ArrowDownRight size={14} className="text-red-400 mb-0.5" />}
      </div>
      {sub && <p className="text-[10px] text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

function MetricRow({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-gray-400">{label}</span>
        <span className="text-white font-semibold">{value} <span className="text-gray-500 font-normal">({pct.toFixed(0)}%)</span></span>
      </div>
      <div className="h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function QuickActionLink({ href, icon, label, count, colorClasses }: {
  href: string; icon: React.ReactNode; label: string; count?: number;
  colorClasses: { bg: string; text: string; badge: string };
}) {
  return (
    <a href={href}
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[#0a0a0a] border border-[#1e1e1e] hover:border-[#2a2a2a] transition-all group">
      <div className={`w-8 h-8 ${colorClasses.bg} rounded-lg flex items-center justify-center flex-shrink-0 ${colorClasses.text}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-300 group-hover:text-white transition-colors">{label}</p>
      </div>
      {count !== undefined && count > 0 && (
        <span className={`text-[10px] font-bold ${colorClasses.badge} px-1.5 py-0.5 rounded-md`}>{count}</span>
      )}
      <ArrowRight size={12} className="text-gray-600 group-hover:text-gray-400 transition-colors" />
    </a>
  );
}

// === Main Component ===

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState("overview");
  const [, setLocation] = useLocation();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsPeriod, setAnalyticsPeriod] = useState<'30' | '60' | '90'>('30');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
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
  const unreadSupportSummary = unreadSupportChats.length > 0
    ? `${unreadSupportChats.length} unread chat${unreadSupportChats.length === 1 ? '' : 's'}${unreadSupportPreview ? `: ${unreadSupportPreview}${unreadSupportChats.length > 2 ? ', …' : ''}` : ''}`
    : `${stats?.support.open || 0} open, ${stats?.support.inProgress || 0} active`;

  // Badge counts for each dashboard tab
  const tabBadges: Record<string, number> = {
    'overview': 0,
    'analytics': 0,
    'financial': pendingCounts.deposits + pendingCounts.withdrawals,
    'trading': pendingCounts.trades + pendingCounts.futures,
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

  const fetchAnalytics = useCallback(async () => {
    try {
      setAnalyticsLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch('/api/admin/analytics', {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        setAnalytics(data);
      }
    } catch (err) {
      console.error('Analytics fetch error:', err);
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardStats();
    const interval = setInterval(fetchDashboardStats, 30000);
    return () => clearInterval(interval);
  }, [fetchDashboardStats]);

  // Fetch analytics when the analytics tab is selected
  useEffect(() => {
    if (activeTab === 'analytics' && !analytics) {
      fetchAnalytics();
    }
  }, [activeTab, analytics, fetchAnalytics]);

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
      case 'deposit': return <ArrowDownRight size={14} className="text-green-400" />;
      case 'withdrawal': return <ArrowUpRight size={14} className="text-red-400" />;
      case 'trade': return <BarChart3 size={14} className="text-blue-400" />;
      case 'support': return <MessageSquare size={14} className="text-purple-400" />;
      default: return <Activity size={14} className="text-gray-400" />;
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

  const handleExportCSV = () => {
    if (!stats) return;
    const rows = [
      ['Metric', 'Value'],
      ['Total Users', stats.users.total],
      ['Active Users', stats.users.active],
      ['Verified Users', stats.users.verified],
      ['New Users (Today)', stats.users.newToday],
      ['New Users (7d)', stats.users.newThisWeek],
      ['Total Deposits', stats.financial.totalDeposits.toFixed(2)],
      ['Total Withdrawals', stats.financial.totalWithdrawals.toFixed(2)],
      ['Platform Value', stats.financial.totalPlatformValue.toFixed(2)],
      ['Total Trades', stats.trading.totalTrades],
      ['Trade Volume', stats.trading.totalVolume.toFixed(2)],
      ['Active Staking', stats.staking.activePositions],
      ['Open Support Tickets', stats.support.open],
      ['Pending KYC', stats.kyc.pending],
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `dashboard-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast({ title: "Export Complete", description: "Dashboard report downloaded." });
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
            <BarChart3 className="h-7 w-7 text-gray-600" />
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
                    ? <TrendingUp size={14} className="text-green-400" />
                    : <TrendingDown size={14} className="text-red-400" />}
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
                    <CheckCircle size={12} className="mr-1" />Approve
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => rejectMutation.mutate(order.id)} disabled={rejectMutation.isPending}
                    className="text-xs h-8 px-3">
                    <XCircle size={12} className="mr-1" />Reject
                  </Button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Chart data formatting
  const chartRegTrend = stats?.charts.registrationTrend.map(d => ({
    date: formatChartDate(d.date),
    Users: d.count
  })) || [];

  const chartVolTrend = stats?.charts.volumeTrend.map(d => ({
    date: formatChartDate(d.date),
    Volume: d.volume,
    Trades: d.count
  })) || [];

  const chartFinTrend = stats?.charts.financialTrend.map(d => ({
    date: formatChartDate(d.date),
    Deposits: d.deposits,
    Withdrawals: d.withdrawals
  })) || [];

  const chartFeeDailyTrend = stats?.financial.fees?.trends.daily.map(d => ({
    date: formatChartDate(d.date),
    Deposits: d.deposits,
    Withdrawals: d.withdrawals,
    Trading: d.trading,
    Total: d.total,
  })) || [];

  const chartFeeMonthlyTrend = stats?.financial.fees?.trends.monthly.map(d => ({
    month: d.month,
    Deposits: d.deposits,
    Withdrawals: d.withdrawals,
    Trading: d.trading,
    Total: d.total,
  })) || [];

  const pieKycData = stats ? [
    { name: 'Approved', value: stats.kyc.approved, color: '#10b981' },
    { name: 'Pending', value: stats.kyc.pending, color: '#f59e0b' },
    { name: 'Rejected', value: stats.kyc.rejected, color: '#ef4444' },
  ].filter(d => d.value > 0) : [];

  const pieSupportData = stats ? [
    { name: 'Open', value: stats.support.open, color: '#3b82f6' },
    { name: 'In Progress', value: stats.support.inProgress, color: '#f59e0b' },
    { name: 'Resolved', value: stats.support.resolved, color: '#10b981' },
  ].filter(d => d.value > 0) : [];

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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-4 animate-pulse">
                <div className="h-3 bg-[#1a1a1a] rounded w-16 mb-3" />
                <div className="h-6 bg-[#1a1a1a] rounded w-12" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-5 animate-pulse h-72" />
            ))}
          </div>
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
            <p className="text-sm text-gray-500 mt-1">Real-time platform overview & management</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExportCSV}
              className="border-[#2a2a2a] text-gray-300 hover:bg-[#1a1a1a] text-xs h-8">
              <Download size={14} className="mr-1.5" />Export
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setLoading(true); fetchDashboardStats(); }}
              className="border-[#2a2a2a] text-gray-300 hover:bg-[#1a1a1a] text-xs h-8">
              <RefreshCw size={14} className="mr-1.5" />Refresh
            </Button>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-red-400 text-sm flex items-center gap-2">
            <AlertTriangle size={16} />{error}
          </div>
        )}

        {stats && (
          <>
            {/* Alert Banners */}
            {(unreadSupportChats.length > 0 || stats.support.urgent > 0 || stats.financial.pendingDeposits > 0 || stats.financial.pendingWithdrawals > 0 || stats.trading.pendingTrades > 0) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {unreadSupportChats.length > 0 && (
                  <button onClick={() => setLocation('/admin/support')} className="flex items-center gap-3 bg-purple-500/10 border border-purple-500/20 rounded-xl px-4 py-3 hover:bg-purple-500/15 transition-colors text-left">
                    <MessageSquare size={18} className="text-purple-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-purple-400">{unreadSupportChats.length} Unread Support Chat{unreadSupportChats.length === 1 ? '' : 's'}</p>
                      <p className="text-[10px] text-purple-400/70 truncate">{unreadSupportPreview}{unreadSupportChats.length > 2 ? ', …' : ''}</p>
                    </div>
                  </button>
                )}
                {stats.support.urgent > 0 && (
                  <a href="/admin/support" className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 hover:bg-red-500/15 transition-colors">
                    <AlertTriangle size={18} className="text-red-400 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-red-400">{stats.support.urgent} Urgent Tickets</p>
                      <p className="text-[10px] text-red-400/60">Requires immediate attention</p>
                    </div>
                  </a>
                )}
                {stats.financial.pendingDeposits > 0 && (
                  <button onClick={() => setLocation('/admin/wallets')} className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 hover:bg-amber-500/15 transition-colors text-left">
                    <Clock size={18} className="text-amber-400 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-amber-400">{stats.financial.pendingDeposits} Pending Deposits</p>
                      <p className="text-[10px] text-amber-400/60">Click to review</p>
                    </div>
                  </button>
                )}
                {stats.financial.pendingWithdrawals > 0 && (
                  <button onClick={() => setLocation('/admin/wallets')} className="flex items-center gap-3 bg-orange-500/10 border border-orange-500/20 rounded-xl px-4 py-3 hover:bg-orange-500/15 transition-colors text-left">
                    <Clock size={18} className="text-orange-400 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-orange-400">{stats.financial.pendingWithdrawals} Pending Withdrawals</p>
                      <p className="text-[10px] text-orange-400/60">Click to review</p>
                    </div>
                  </button>
                )}
                {stats.trading.pendingTrades > 0 && (
                  <button onClick={() => setActiveTab('pending-orders')}
                    className="flex items-center gap-3 bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3 hover:bg-blue-500/15 transition-colors text-left">
                    <BarChart3 size={18} className="text-blue-400 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-blue-400">{stats.trading.pendingTrades} Pending Trades</p>
                      <p className="text-[10px] text-blue-400/60">Click to review</p>
                    </div>
                  </button>
                )}
              </div>
            )}

            {/* Primary Stats Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <StatCard icon={<Users size={18} />} iconBg="bg-blue-500/10" iconColor="text-blue-400"
                label="Total Users" value={formatNumber(stats.users.total)}
                sub={`${stats.users.newToday} today`} trend={stats.users.newToday > stats.users.newYesterday ? 'up' : stats.users.newToday < stats.users.newYesterday ? 'down' : 'neutral'}
                onClick={() => setLocation('/admin/users')} />
              <StatCard icon={<Activity size={18} />} iconBg="bg-green-500/10" iconColor="text-green-400"
                label="Active Users" value={formatNumber(stats.users.active)}
                sub={`${stats.users.total > 0 ? ((stats.users.active / stats.users.total) * 100).toFixed(0) : 0}% of total`}
                onClick={() => setLocation('/admin/users')} />
              <StatCard icon={<DollarSign size={18} />} iconBg="bg-emerald-500/10" iconColor="text-emerald-400"
                label="Platform Value" value={formatCurrency(stats.financial.totalPlatformValue)}
                sub={`${stats.users.usersWithPortfolio} portfolios`}
                onClick={() => setLocation('/admin/wallets')} />
              <StatCard icon={<BarChart3 size={18} />} iconBg="bg-purple-500/10" iconColor="text-purple-400"
                label="Trade Volume" value={formatCurrency(stats.trading.totalVolume)}
                sub={`${stats.trading.totalTrades} trades`} pendingBadge={pendingCounts.trades + pendingCounts.futures}
                onClick={() => setActiveTab('pending-orders')} />
              <StatCard icon={<MessageSquare size={18} />} iconBg="bg-amber-500/10" iconColor="text-amber-400"
                label="Support" value={String(stats.support.open + stats.support.inProgress)}
                sub={unreadSupportSummary} pendingBadge={pendingCounts.support}
                onClick={() => setLocation('/admin/support')} />
              <StatCard icon={<FileCheck size={18} />} iconBg="bg-cyan-500/10" iconColor="text-cyan-400"
                label="KYC Pending" value={String(stats.kyc.pending)}
                sub={`${stats.kyc.approved} approved`} pendingBadge={pendingCounts.kyc}
                onClick={() => setLocation('/admin/users')} />
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="bg-[#111] border border-[#1e1e1e] rounded-xl p-1 h-auto flex flex-wrap gap-1">
                {['overview', 'analytics', 'financial', 'trading', 'orders', 'pending-orders', 'activity'].map(tab => {
                  const badge = tabBadges[tab] || 0;
                  const label = tab === 'pending-orders' ? 'Pending Orders' : tab === 'analytics' ? '📊 Analytics' : tab;
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

              {/* ===== OVERVIEW TAB ===== */}
              <TabsContent value="overview" className="space-y-5 mt-4">
                {/* Charts Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* User Registration Trend */}
                  <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-sm font-semibold text-white">User Registrations</h3>
                        <p className="text-[11px] text-gray-500">Last 30 days</p>
                      </div>
                      <div className="flex items-center gap-1.5 bg-green-500/10 px-2 py-1 rounded-lg">
                        <TrendingUp size={12} className="text-green-400" />
                        <span className="text-[11px] text-green-400 font-medium">{stats.users.newThisMonth} this month</span>
                      </div>
                    </div>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartRegTrend}>
                          <defs>
                            <linearGradient id="regGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#666' }} interval="preserveStartEnd" />
                          <YAxis tick={{ fontSize: 10, fill: '#666' }} allowDecimals={false} />
                          <Tooltip content={<ChartTooltipContent />} />
                          <Area type="monotone" dataKey="Users" stroke="#3b82f6" fill="url(#regGrad)" strokeWidth={2} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Financial Flow */}
                  <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-sm font-semibold text-white">Deposit & Withdrawal Flow</h3>
                        <p className="text-[11px] text-gray-500">Last 30 days</p>
                      </div>
                      <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg ${stats.financial.netFlow >= 0 ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                        {stats.financial.netFlow >= 0
                          ? <ArrowUpRight size={12} className="text-green-400" />
                          : <ArrowDownRight size={12} className="text-red-400" />}
                        <span className={`text-[11px] font-medium ${stats.financial.netFlow >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          Net: {formatCurrency(Math.abs(stats.financial.netFlow))}
                        </span>
                      </div>
                    </div>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartFinTrend}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#666' }} interval="preserveStartEnd" />
                          <YAxis tick={{ fontSize: 10, fill: '#666' }} />
                          <Tooltip content={<ChartTooltipContent />} />
                          <Bar dataKey="Deposits" fill="#10b981" radius={[2, 2, 0, 0]} />
                          <Bar dataKey="Withdrawals" fill="#ef4444" radius={[2, 2, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* Secondary Stats & Quick Actions */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {/* Detailed User Stats */}
                  <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <Users size={16} className="text-blue-400" />
                      <h3 className="text-sm font-semibold text-white">User Breakdown</h3>
                    </div>
                    <div className="space-y-3">
                      <MetricRow label="Active Users" value={stats.users.active} total={stats.users.total} color="bg-green-500" />
                      <MetricRow label="Inactive Users" value={stats.users.inactive} total={stats.users.total} color="bg-red-500" />
                      <MetricRow label="Verified (KYC)" value={stats.users.verified} total={stats.users.total} color="bg-blue-500" />
                      <MetricRow label="With Portfolio" value={stats.users.usersWithPortfolio} total={stats.users.total} color="bg-purple-500" />
                      <div className="border-t border-[#1e1e1e] pt-3 mt-3">
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="bg-[#0a0a0a] rounded-lg p-2 text-center">
                            <p className="text-gray-500">Today</p>
                            <p className="text-white font-bold text-lg">{stats.users.newToday}</p>
                          </div>
                          <div className="bg-[#0a0a0a] rounded-lg p-2 text-center">
                            <p className="text-gray-500">This Week</p>
                            <p className="text-white font-bold text-lg">{stats.users.newThisWeek}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Trading & Futures */}
                  <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <BarChart3 size={16} className="text-purple-400" />
                      <h3 className="text-sm font-semibold text-white">Trading Overview</h3>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-400">Total Trades</span>
                        <span className="text-white font-semibold">{stats.trading.totalTrades}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-400">Completed</span>
                        <span className="text-green-400 font-semibold">{stats.trading.completedTrades}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-400">Pending Approval</span>
                        <span className="text-amber-400 font-semibold">{stats.trading.pendingTrades}</span>
                      </div>
                      <div className="border-t border-[#1e1e1e] pt-3">
                        <p className="text-[11px] text-gray-500 mb-2">Futures Trading</p>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-400">Active</span>
                          <span className="text-blue-400 font-semibold">{stats.trading.activeFutures}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs mt-1">
                          <span className="text-gray-400">Win Rate</span>
                          <span className="text-green-400 font-semibold">{stats.trading.futuresWinRate}%</span>
                        </div>
                        <div className="flex items-center justify-between text-xs mt-1">
                          <span className="text-gray-400">W/L</span>
                          <span className="text-white font-semibold">{stats.trading.futuresWins}/{stats.trading.futuresLosses}</span>
                        </div>
                      </div>
                      <div className="border-t border-[#1e1e1e] pt-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-400">Active Staking</span>
                          <span className="text-cyan-400 font-semibold">{stats.staking.activePositions}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs mt-1">
                          <span className="text-gray-400">Total Staked</span>
                          <span className="text-white font-semibold">{formatCurrency(stats.staking.totalStaked)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <Zap size={16} className="text-amber-400" />
                      <h3 className="text-sm font-semibold text-white">Quick Actions</h3>
                    </div>
                    <div className="space-y-2">
                      <QuickActionLink href="/admin/users" icon={<Users size={16} />} label="Manage Users" count={stats.users.total}
                        colorClasses={{ bg: 'bg-blue-500/10', text: 'text-blue-400', badge: 'bg-blue-500/20 text-blue-400' }} />
                      <QuickActionLink href="/admin/support" icon={<MessageSquare size={16} />} label="Support Tickets" count={pendingCounts.support}
                        colorClasses={{ bg: 'bg-amber-500/10', text: 'text-amber-400', badge: 'bg-red-500/20 text-red-400' }} />
                      {unreadSupportChats.length > 0 && (
                        <div className="px-3 py-2 rounded-xl bg-[#0a0a0a] border border-purple-500/20">
                          <p className="text-[10px] font-semibold text-purple-400 mb-1">Unread support chats</p>
                          <div className="space-y-1">
                            {unreadSupportChats.slice(0, 3).map((conversation) => (
                              <button
                                key={conversation.id}
                                onClick={() => setLocation('/admin/support')}
                                className="w-full text-left text-[11px] text-gray-300 hover:text-white transition-colors truncate"
                              >
                                {conversation.users.full_name} · #{conversation.id} · {conversation.unreadCount} new
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <QuickActionLink href="/admin/analytics" icon={<BarChart3 size={16} />} label="Full Analytics"
                        colorClasses={{ bg: 'bg-purple-500/10', text: 'text-purple-400', badge: 'bg-purple-500/20 text-purple-400' }} />
                      <QuickActionLink href="/admin/news" icon={<Globe size={16} />} label="News & Broadcasts"
                        colorClasses={{ bg: 'bg-green-500/10', text: 'text-green-400', badge: 'bg-green-500/20 text-green-400' }} />
                      <QuickActionLink href="/admin/notifications/simple" icon={<Bell size={16} />} label="Notifications"
                        colorClasses={{ bg: 'bg-cyan-500/10', text: 'text-cyan-400', badge: 'bg-cyan-500/20 text-cyan-400' }} />
                      <QuickActionLink href="/admin/wallets" icon={<Wallet size={16} />} label="Wallets" count={pendingCounts.deposits + pendingCounts.withdrawals}
                        colorClasses={{ bg: 'bg-emerald-500/10', text: 'text-emerald-400', badge: 'bg-red-500/20 text-red-400' }} />
                      <button onClick={() => setActiveTab('pending-orders')}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[#0a0a0a] border border-[#1e1e1e] hover:border-amber-500/30 transition-all text-left group">
                        <div className="w-8 h-8 bg-amber-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Clock size={16} className="text-amber-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-300 group-hover:text-white transition-colors">Pending Orders</p>
                        </div>
                        {(pendingOrders?.length || 0) > 0 && (
                          <span className="text-[10px] font-bold bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-md">{pendingOrders?.length}</span>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* KYC & Support Pies + Loans */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* KYC Distribution */}
                  <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-5 cursor-pointer hover:border-[#2a2a2a] hover:bg-[#151515] transition-all" onClick={() => setLocation('/admin/users')}>
                    <div className="flex items-center gap-2 mb-4">
                      <FileCheck size={16} className="text-cyan-400" />
                      <h3 className="text-sm font-semibold text-white">KYC Status</h3>
                      <ArrowRight size={12} className="text-gray-600 ml-auto" />
                    </div>
                    {pieKycData.length > 0 ? (
                      <div className="flex items-center gap-4">
                        <div className="w-24 h-24 flex-shrink-0">
                          <ResponsiveContainer width="100%" height="100%">
                            <RechartsPie>
                              <Pie data={pieKycData} dataKey="value" cx="50%" cy="50%" innerRadius={25} outerRadius={40} strokeWidth={0}>
                                {pieKycData.map((d, i) => <Cell key={i} fill={d.color} />)}
                              </Pie>
                            </RechartsPie>
                          </ResponsiveContainer>
                        </div>
                        <div className="space-y-2">
                          {pieKycData.map((d, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                              <span className="text-gray-400">{d.name}</span>
                              <span className="text-white font-semibold ml-auto">{d.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500 text-center py-6">No KYC submissions</p>
                    )}
                  </div>

                  {/* Support Distribution */}
                  <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-5 cursor-pointer hover:border-[#2a2a2a] hover:bg-[#151515] transition-all" onClick={() => setLocation('/admin/support')}>
                    <div className="flex items-center gap-2 mb-4">
                      <MessageSquare size={16} className="text-purple-400" />
                      <h3 className="text-sm font-semibold text-white">Support Tickets</h3>
                      <ArrowRight size={12} className="text-gray-600 ml-auto" />
                    </div>
                    {pieSupportData.length > 0 ? (
                      <div className="flex items-center gap-4">
                        <div className="w-24 h-24 flex-shrink-0">
                          <ResponsiveContainer width="100%" height="100%">
                            <RechartsPie>
                              <Pie data={pieSupportData} dataKey="value" cx="50%" cy="50%" innerRadius={25} outerRadius={40} strokeWidth={0}>
                                {pieSupportData.map((d, i) => <Cell key={i} fill={d.color} />)}
                              </Pie>
                            </RechartsPie>
                          </ResponsiveContainer>
                        </div>
                        <div className="space-y-2">
                          {pieSupportData.map((d, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                              <span className="text-gray-400">{d.name}</span>
                              <span className="text-white font-semibold ml-auto">{d.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500 text-center py-6">No support tickets</p>
                    )}
                  </div>

                  {/* Loans & Financial Summary */}
                  <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-5 cursor-pointer hover:border-[#2a2a2a] hover:bg-[#151515] transition-all" onClick={() => setLocation('/admin/users')}>
                    <div className="flex items-center gap-2 mb-4">
                      <Landmark size={16} className="text-emerald-400" />
                      <h3 className="text-sm font-semibold text-white">Loans & Finance</h3>
                      <ArrowRight size={12} className="text-gray-600 ml-auto" />
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-400">Pending Loans</span>
                        <span className="text-amber-400 font-semibold">{stats.loans.pending}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-400">Active Loans</span>
                        <span className="text-green-400 font-semibold">{stats.loans.approved}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-400">Total Loan Value</span>
                        <span className="text-white font-semibold">{formatCurrency(stats.loans.totalValue)}</span>
                      </div>
                      <div className="border-t border-[#1e1e1e] pt-3 mt-1">
                        <p className="text-[11px] text-gray-500 mb-2">Financial Summary</p>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-400">Total Deposits</span>
                          <span className="text-green-400 font-semibold">{formatCurrency(stats.financial.totalDeposits)}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs mt-1">
                          <span className="text-gray-400">Total Withdrawals</span>
                          <span className="text-red-400 font-semibold">{formatCurrency(stats.financial.totalWithdrawals)}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs mt-1">
                          <span className="text-gray-400">Net Flow</span>
                          <span className={`font-semibold ${stats.financial.netFlow >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {stats.financial.netFlow >= 0 ? '+' : ''}{formatCurrency(stats.financial.netFlow)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* ===== ANALYTICS TAB ===== */}
              <TabsContent value="analytics" className="space-y-5 mt-4">
                {analyticsLoading || !analytics ? (
                  <div className="flex flex-col items-center justify-center py-20">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-400 mb-4" />
                    <p className="text-sm text-gray-500">Loading analytics data...</p>
                  </div>
                ) : (
                  <>
                    {/* Period Selector + Summary Cards */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-white">Financial Analytics</h3>
                        <span className="text-[10px] text-gray-500 bg-[#1a1a1a] px-2 py-0.5 rounded-full">Last {analyticsPeriod} days</span>
                      </div>
                      <div className="flex gap-1 bg-[#111] border border-[#1e1e1e] rounded-lg p-0.5">
                        {(['30', '60', '90'] as const).map(p => (
                          <button key={p} onClick={() => setAnalyticsPeriod(p)}
                            className={`px-3 py-1 text-xs rounded-md transition-colors ${analyticsPeriod === p ? 'bg-blue-500/20 text-blue-400 font-medium' : 'text-gray-500 hover:text-gray-300'}`}>
                            {p}D
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Summary Cards Row */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                      <StatCard icon={<ArrowDownRight size={18} />} iconBg="bg-green-500/10" iconColor="text-green-400"
                        label="Total Deposits" value={formatCurrency(analytics.summary.totalDeposits)}
                        sub={`${analytics.summary.totalDepositCount} approved`} trend="up" />
                      <StatCard icon={<ArrowUpRight size={18} />} iconBg="bg-red-500/10" iconColor="text-red-400"
                        label="Total Withdrawals" value={formatCurrency(analytics.summary.totalWithdrawals)}
                        sub={`${analytics.summary.totalWithdrawalCount} processed`} trend="down" />
                      <StatCard icon={<TrendingUp size={18} />} iconBg="bg-emerald-500/10" iconColor="text-emerald-400"
                        label="Net Flow" value={formatCurrency(Math.abs(analytics.summary.totalNetFlow))}
                        sub={analytics.summary.totalNetFlow >= 0 ? 'Positive inflow' : 'Net outflow'}
                        trend={analytics.summary.totalNetFlow >= 0 ? 'up' : 'down'} />
                      <StatCard icon={<Zap size={18} />} iconBg="bg-purple-500/10" iconColor="text-purple-400"
                        label="Futures Revenue" value={formatCurrency(analytics.summary.totalFuturesRevenue)}
                        sub="From user losses" />
                      <StatCard icon={<DollarSign size={18} />} iconBg="bg-cyan-500/10" iconColor="text-cyan-400"
                        label="Total Profit" value={formatCurrency(analytics.summary.totalProfit)}
                        sub="Net flow + futures" trend="up" />
                      <StatCard icon={<Wallet size={18} />} iconBg="bg-amber-500/10" iconColor="text-amber-400"
                        label="All-Time Txns" value={formatNumber(analytics.summary.allTimeDepositCount + analytics.summary.allTimeWithdrawalCount)}
                        sub={`${analytics.summary.allTimeDepositCount}D / ${analytics.summary.allTimeWithdrawalCount}W`} />
                    </div>

                    {/* Day-Over-Day Comparison Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {Object.entries(analytics.dayComparison).map(([key, day]) => (
                        <div key={key} className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-4">
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-xs font-semibold text-white">{day.label}</p>
                            <div className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${day.netFlow >= 0 ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                              {day.netFlow >= 0 ? '+' : ''}{formatCurrency(day.netFlow)}
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <p className="text-[10px] text-gray-500 mb-0.5">Deposits</p>
                              <p className="text-sm font-bold text-green-400">{formatCurrency(day.deposits)}</p>
                              <p className="text-[10px] text-gray-600">{day.depositCount} txns</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-gray-500 mb-0.5">Withdrawals</p>
                              <p className="text-sm font-bold text-red-400">{formatCurrency(day.withdrawals)}</p>
                              <p className="text-[10px] text-gray-600">{day.withdrawalCount} txns</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Chart 1: Deposit Tracking */}
                    <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-5">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="text-sm font-semibold text-white">Deposit Tracking</h3>
                          <p className="text-[11px] text-gray-500">All deposits by amount, date & currency breakdown</p>
                        </div>
                        <div className="flex items-center gap-3 text-[10px]">
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400" /> USDT</span>
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400" /> BTC</span>
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400" /> ETH</span>
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-400" /> Other</span>
                        </div>
                      </div>
                      <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={analytics.depositDaily.slice(90 - parseInt(analyticsPeriod))}>
                            <defs>
                              <linearGradient id="depUsdtGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
                            <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#555' }}
                              tickFormatter={(v) => formatChartDate(v)}
                              interval={Math.floor(parseInt(analyticsPeriod) / 8)} />
                            <YAxis tick={{ fontSize: 9, fill: '#555' }} tickFormatter={(v) => v >= 1000 ? `$${(v/1000).toFixed(0)}K` : `$${v}`} />
                            <Tooltip content={({ active, payload, label }) => {
                              if (!active || !payload?.length) return null;
                              return (
                                <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-2 shadow-xl">
                                  <p className="text-[10px] text-gray-400 mb-1">{formatChartDate(label)}</p>
                                  {payload.map((p: any, i: number) => (
                                    <p key={i} className="text-[11px] font-medium" style={{ color: p.color }}>{p.name}: {formatCryptoAmount(parseFloat(p.value), p.name)}</p>
                                  ))}
                                </div>
                              );
                            }} />
                            <Bar dataKey="usdt" name="USDT" fill="#10b981" stackId="dep" radius={[0, 0, 0, 0]} />
                            <Bar dataKey="btc" name="BTC" fill="#f97316" stackId="dep" radius={[0, 0, 0, 0]} />
                            <Bar dataKey="eth" name="ETH" fill="#3b82f6" stackId="dep" radius={[0, 0, 0, 0]} />
                            <Bar dataKey="other" name="Other" fill="#6b7280" stackId="dep" radius={[3, 3, 0, 0]} />
                            <Line type="monotone" dataKey="amount" name="Total" stroke="#a78bfa" strokeWidth={2} dot={false} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Chart 2: Withdrawal Tracking */}
                    <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-5">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="text-sm font-semibold text-white">Withdrawal Tracking</h3>
                          <p className="text-[11px] text-gray-500">Withdrawal amounts processed by currency</p>
                        </div>
                        <div className="flex items-center gap-3 text-[10px]">
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400" /> USDT</span>
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400" /> BTC</span>
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400" /> ETH</span>
                        </div>
                      </div>
                      <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={analytics.withdrawalDaily.slice(90 - parseInt(analyticsPeriod))}>
                            <defs>
                              <linearGradient id="wdUsdtGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} />
                                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
                            <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#555' }}
                              tickFormatter={(v) => formatChartDate(v)}
                              interval={Math.floor(parseInt(analyticsPeriod) / 8)} />
                            <YAxis tick={{ fontSize: 9, fill: '#555' }} tickFormatter={(v) => v >= 1000 ? `$${(v/1000).toFixed(0)}K` : `$${v}`} />
                            <Tooltip content={({ active, payload, label }) => {
                              if (!active || !payload?.length) return null;
                              return (
                                <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-2 shadow-xl">
                                  <p className="text-[10px] text-gray-400 mb-1">{formatChartDate(label)}</p>
                                  {payload.map((p: any, i: number) => (
                                    <p key={i} className="text-[11px] font-medium" style={{ color: p.color }}>{p.name}: {formatCryptoAmount(parseFloat(p.value), p.name)}</p>
                                  ))}
                                </div>
                              );
                            }} />
                            <Bar dataKey="usdt" name="USDT" fill="#ef4444" stackId="wd" radius={[0, 0, 0, 0]} />
                            <Bar dataKey="btc" name="BTC" fill="#f97316" stackId="wd" radius={[0, 0, 0, 0]} />
                            <Bar dataKey="eth" name="ETH" fill="#3b82f6" stackId="wd" radius={[0, 0, 0, 0]} />
                            <Bar dataKey="other" name="Other" fill="#6b7280" stackId="wd" radius={[3, 3, 0, 0]} />
                            <Line type="monotone" dataKey="amount" name="Total" stroke="#fb923c" strokeWidth={2} dot={false} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Chart 3: Profit Analysis */}
                    <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-5">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="text-sm font-semibold text-white">Profit Analysis</h3>
                          <p className="text-[11px] text-gray-500">Net flow, cumulative profit & futures revenue over time</p>
                        </div>
                        <div className="flex items-center gap-3 text-[10px]">
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400" /> Net Flow</span>
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-cyan-400" /> Cumulative</span>
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-400" /> Futures Rev</span>
                        </div>
                      </div>
                      <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={analytics.profitDaily.slice(90 - parseInt(analyticsPeriod))}>
                            <defs>
                              <linearGradient id="cumProfGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
                            <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#555' }}
                              tickFormatter={(v) => formatChartDate(v)}
                              interval={Math.floor(parseInt(analyticsPeriod) / 8)} />
                            <YAxis yAxisId="left" tick={{ fontSize: 9, fill: '#555' }} tickFormatter={(v) => v >= 1000 ? `$${(v/1000).toFixed(0)}K` : `$${v}`} />
                            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9, fill: '#555' }} tickFormatter={(v) => v >= 1000 ? `$${(v/1000).toFixed(0)}K` : `$${v}`} />
                            <Tooltip content={({ active, payload, label }) => {
                              if (!active || !payload?.length) return null;
                              return (
                                <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-2.5 shadow-xl">
                                  <p className="text-[10px] text-gray-400 mb-1.5">{formatChartDate(label)}</p>
                                  {payload.map((p: any, i: number) => (
                                    <p key={i} className="text-[11px] font-medium" style={{ color: p.color }}>
                                      {p.name}: {formatCryptoAmount(Math.abs(p.value), p.name)}{p.value < 0 ? ' (loss)' : ''}
                                    </p>
                                  ))}
                                </div>
                              );
                            }} />
                            <Bar yAxisId="left" dataKey="netFlow" name="Daily Net Flow" fill="#10b981" radius={[3, 3, 0, 0]} opacity={0.6} />
                            <Bar yAxisId="left" dataKey="futuresRevenue" name="Futures Revenue" fill="#a78bfa" radius={[3, 3, 0, 0]} opacity={0.7} />
                            <Line yAxisId="right" type="monotone" dataKey="cumulativeProfit" name="Cumulative Profit" stroke="#22d3ee" fill="url(#cumProfGrad)" strokeWidth={2.5} dot={false} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Chart 4: Monthly Comparison — Multi-line overlay */}
                    <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-5">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="text-sm font-semibold text-white">Month-over-Month Comparison</h3>
                          <p className="text-[11px] text-gray-500">Daily cumulative deposits per month — overlaid for easy comparison</p>
                        </div>
                      </div>
                      <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                          {(() => {
                            // Build overlay data: each row = day 1..31, columns = month running totals
                            const maxDays = 31;
                            const overlayData: Array<Record<string, any>> = [];
                            for (let day = 1; day <= maxDays; day++) {
                              const row: Record<string, any> = { day: `Day ${day}` };
                              analytics.monthlyData.forEach(m => {
                                const cumulative = m.dailyBreakdown
                                  .filter(d => d.day <= day)
                                  .reduce((s, d) => s + d.deposits, 0);
                                row[m.monthLabel] = cumulative;
                              });
                              overlayData.push(row);
                            }
                            const monthColors = ['#4b5563', '#6b7280', '#9ca3af', '#f59e0b', '#3b82f6', '#10b981'];
                            return (
                              <LineChart data={overlayData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
                                <XAxis dataKey="day" tick={{ fontSize: 9, fill: '#555' }} interval={4} />
                                <YAxis tick={{ fontSize: 9, fill: '#555' }} tickFormatter={(v) => v >= 1000 ? `$${(v/1000).toFixed(0)}K` : `$${v}`} />
                                <Tooltip content={({ active, payload, label }) => {
                                  if (!active || !payload?.length) return null;
                                  return (
                                    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-2 shadow-xl">
                                      <p className="text-[10px] text-gray-400 mb-1">{label}</p>
                                      {payload.sort((a: any, b: any) => (b.value || 0) - (a.value || 0)).map((p: any, i: number) => (
                                        <p key={i} className="text-[11px] font-medium" style={{ color: p.color }}>
                                          {p.name}: {formatCryptoAmount(parseFloat(p.value || 0), p.name)}
                                        </p>
                                      ))}
                                    </div>
                                  );
                                }} />
                                <Legend iconType="line" wrapperStyle={{ fontSize: '10px', color: '#888' }} />
                                {analytics.monthlyData.map((m, i) => (
                                  <Line key={m.month} type="monotone" dataKey={m.monthLabel}
                                    stroke={monthColors[i % monthColors.length]}
                                    strokeWidth={i === analytics.monthlyData.length - 1 ? 3 : 1.5}
                                    strokeDasharray={i < analytics.monthlyData.length - 2 ? '4 4' : undefined}
                                    dot={false} opacity={i === analytics.monthlyData.length - 1 ? 1 : 0.6} />
                                ))}
                              </LineChart>
                            );
                          })()}
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Chart 5: Monthly Summary Bar Chart + Symbol Breakdown */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {/* Monthly totals bar chart */}
                      <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-5">
                        <div className="mb-4">
                          <h3 className="text-sm font-semibold text-white">Monthly Totals</h3>
                          <p className="text-[11px] text-gray-500">Deposit & withdrawal totals per month</p>
                        </div>
                        <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={analytics.monthlyData.map(m => ({
                              month: m.monthLabel,
                              Deposits: m.deposits,
                              Withdrawals: m.withdrawals,
                              Profit: m.profit,
                            }))}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
                              <XAxis dataKey="month" tick={{ fontSize: 9, fill: '#555' }} />
                              <YAxis tick={{ fontSize: 9, fill: '#555' }} tickFormatter={(v) => v >= 1000 ? `$${(v/1000).toFixed(0)}K` : `$${v}`} />
                              <Tooltip content={({ active, payload, label }) => {
                                if (!active || !payload?.length) return null;
                                return (
                                  <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-2 shadow-xl">
                                    <p className="text-[10px] text-gray-400 mb-1">{label}</p>
                                    {payload.map((p: any, i: number) => (
                                      <p key={i} className="text-[11px] font-medium" style={{ color: p.color }}>
                                        {p.name}: {formatCryptoAmount(parseFloat(p.value), p.name)}
                                      </p>
                                    ))}
                                  </div>
                                );
                              }} />
                              <Bar dataKey="Deposits" fill="#10b981" radius={[3, 3, 0, 0]} />
                              <Bar dataKey="Withdrawals" fill="#ef4444" radius={[3, 3, 0, 0]} />
                              <Bar dataKey="Profit" fill="#22d3ee" radius={[3, 3, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* Symbol Breakdown */}
                      <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-5">
                        <div className="mb-4">
                          <h3 className="text-sm font-semibold text-white">Currency Breakdown</h3>
                          <p className="text-[11px] text-gray-500">All-time deposit & withdrawal amounts by asset</p>
                        </div>
                        <div className="space-y-4">
                          <div>
                            <p className="text-[10px] font-medium text-gray-400 mb-2 flex items-center gap-1.5">
                              <ArrowDownRight size={10} className="text-green-400" /> DEPOSIT BREAKDOWN
                            </p>
                            {Object.entries(analytics.summary.depositsBySymbol)
                              .sort(([, a], [, b]) => b - a)
                              .map(([symbol, amount]) => (
                                <div key={symbol} className="mb-2">
                                  <div className="flex items-center justify-between text-xs mb-1">
                                    <span className="text-gray-300 font-medium">{symbol}</span>
                                    <span className="text-white font-semibold">{formatCryptoAmount(amount, symbol)}</span>
                                  </div>
                                  <div className="h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
                                    <div className="h-full bg-green-500 rounded-full transition-all duration-700"
                                      style={{ width: `${Math.min(100, (amount / analytics.summary.totalDeposits) * 100)}%` }} />
                                  </div>
                                </div>
                              ))}
                          </div>
                          <div className="border-t border-[#1e1e1e] pt-4">
                            <p className="text-[10px] font-medium text-gray-400 mb-2 flex items-center gap-1.5">
                              <ArrowUpRight size={10} className="text-red-400" /> WITHDRAWAL BREAKDOWN
                            </p>
                            {Object.entries(analytics.summary.withdrawalsBySymbol)
                              .sort(([, a], [, b]) => b - a)
                              .map(([symbol, amount]) => (
                                <div key={symbol} className="mb-2">
                                  <div className="flex items-center justify-between text-xs mb-1">
                                    <span className="text-gray-300 font-medium">{symbol}</span>
                                    <span className="text-white font-semibold">{formatCryptoAmount(amount, symbol)}</span>
                                  </div>
                                  <div className="h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
                                    <div className="h-full bg-red-500 rounded-full transition-all duration-700"
                                      style={{ width: `${Math.min(100, (amount / analytics.summary.totalWithdrawals) * 100)}%` }} />
                                  </div>
                                </div>
                              ))}
                            {Object.keys(analytics.summary.withdrawalsBySymbol).length === 0 && (
                              <p className="text-xs text-gray-600 italic">No withdrawals recorded</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Refresh button */}
                    <div className="flex justify-center pt-2">
                      <button onClick={fetchAnalytics}
                        className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-300 transition-colors bg-[#111] border border-[#1e1e1e] rounded-xl px-4 py-2">
                        <RefreshCw size={12} /> Refresh Analytics
                      </button>
                    </div>
                  </>
                )}
              </TabsContent>

              {/* ===== FINANCIAL TAB ===== */}
              <TabsContent value="financial" className="space-y-5 mt-4">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <StatCard icon={<ArrowDownRight size={18} />} iconBg="bg-green-500/10" iconColor="text-green-400"
                    label="Total Deposits" value={formatCurrency(stats.financial.totalDeposits)} sub={`${stats.financial.totalDepositsCount} transactions`} />
                  <StatCard icon={<ArrowUpRight size={18} />} iconBg="bg-red-500/10" iconColor="text-red-400"
                    label="Total Withdrawals" value={formatCurrency(stats.financial.totalWithdrawals)} sub={`${stats.financial.totalWithdrawalsCount} transactions`} />
                  <StatCard icon={<Wallet size={18} />} iconBg="bg-purple-500/10" iconColor="text-purple-400"
                    label="Net Flow" value={formatCurrency(Math.abs(stats.financial.netFlow))}
                    sub={stats.financial.netFlow >= 0 ? 'Positive inflow' : 'Net outflow'}
                    trend={stats.financial.netFlow >= 0 ? 'up' : 'down'} />
                  <StatCard icon={<DollarSign size={18} />} iconBg="bg-blue-500/10" iconColor="text-blue-400"
                    label="Platform AUM" value={formatCurrency(stats.financial.totalPlatformValue)} sub={`${stats.users.usersWithPortfolio} portfolios`} />
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <StatCard icon={<Landmark size={18} />} iconBg="bg-amber-500/10" iconColor="text-amber-400"
                    label="Total Fees" value={formatCurrency(stats.financial.fees?.total || 0)} sub="All fee sources" />
                  <StatCard icon={<ArrowDownRight size={18} />} iconBg="bg-teal-500/10" iconColor="text-teal-400"
                    label="Deposit Fees" value={formatCurrency(stats.financial.fees?.byType?.deposits || 0)} sub="From approved deposits" />
                  <StatCard icon={<ArrowUpRight size={18} />} iconBg="bg-orange-500/10" iconColor="text-orange-400"
                    label="Withdrawal Fees" value={formatCurrency(stats.financial.fees?.byType?.withdrawals || 0)} sub="From approved withdrawals" />
                  <StatCard icon={<BarChart3 size={18} />} iconBg="bg-indigo-500/10" iconColor="text-indigo-400"
                    label="Trading Fees" value={formatCurrency(stats.financial.fees?.byType?.trading || 0)} sub="From completed trades" />
                </div>

                <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-5">
                  <h3 className="text-sm font-semibold text-white mb-4">Deposit vs Withdrawal (30 days)</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartFinTrend}>
                        <defs>
                          <linearGradient id="depGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="wdGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#666' }} interval="preserveStartEnd" />
                        <YAxis tick={{ fontSize: 10, fill: '#666' }} />
                        <Tooltip content={<ChartTooltipContent />} />
                        <Area type="monotone" dataKey="Deposits" stroke="#10b981" fill="url(#depGrad)" strokeWidth={2} />
                        <Area type="monotone" dataKey="Withdrawals" stroke="#ef4444" fill="url(#wdGrad)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-5">
                    <h3 className="text-sm font-semibold text-white mb-4">Daily Fee Trend (30 days)</h3>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={chartFeeDailyTrend}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#666' }} interval="preserveStartEnd" />
                          <YAxis tick={{ fontSize: 10, fill: '#666' }} />
                          <Tooltip content={<ChartTooltipContent />} />
                          <Bar dataKey="Total" fill="#f59e0b" radius={[3, 3, 0, 0]} opacity={0.45} />
                          <Line type="monotone" dataKey="Deposits" stroke="#14b8a6" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="Withdrawals" stroke="#f97316" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="Trading" stroke="#6366f1" strokeWidth={2} dot={false} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-5">
                    <h3 className="text-sm font-semibold text-white mb-4">Monthly Fee Trend (6 months)</h3>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartFeeMonthlyTrend}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
                          <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#666' }} />
                          <YAxis tick={{ fontSize: 10, fill: '#666' }} />
                          <Tooltip content={<ChartTooltipContent />} />
                          <Bar dataKey="Deposits" stackId="fees" fill="#14b8a6" radius={[3, 3, 0, 0]} />
                          <Bar dataKey="Withdrawals" stackId="fees" fill="#f97316" radius={[3, 3, 0, 0]} />
                          <Bar dataKey="Trading" stackId="fees" fill="#6366f1" radius={[3, 3, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-5">
                  <h3 className="text-sm font-semibold text-white mb-4">Top Users By Fees</h3>
                  {stats.financial.fees?.byUser?.length ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-[#1e1e1e] text-gray-500">
                            <th className="text-left py-2 pr-2">User</th>
                            <th className="text-right py-2 px-2">Deposit</th>
                            <th className="text-right py-2 px-2">Withdrawal</th>
                            <th className="text-right py-2 px-2">Trading</th>
                            <th className="text-right py-2 pl-2">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stats.financial.fees.byUser.map((user, idx) => (
                            <tr key={`${user.userId}-${idx}`} className="border-b border-[#1e1e1e] last:border-b-0">
                              <td className="py-2 pr-2 text-gray-300">{user.username !== 'N/A' ? user.username : user.email}</td>
                              <td className="py-2 px-2 text-right text-teal-400">{formatCurrency(user.depositFees)}</td>
                              <td className="py-2 px-2 text-right text-orange-400">{formatCurrency(user.withdrawalFees)}</td>
                              <td className="py-2 px-2 text-right text-indigo-400">{formatCurrency(user.tradingFees)}</td>
                              <td className="py-2 pl-2 text-right text-amber-400 font-semibold">{formatCurrency(user.totalFees)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500">No fee data available yet.</p>
                  )}
                </div>
              </TabsContent>

              {/* ===== TRADING TAB ===== */}
              <TabsContent value="trading" className="space-y-5 mt-4">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <StatCard icon={<BarChart3 size={18} />} iconBg="bg-blue-500/10" iconColor="text-blue-400"
                    label="Total Trades" value={formatNumber(stats.trading.totalTrades)} sub={`${stats.trading.completedTrades} completed`} />
                  <StatCard icon={<DollarSign size={18} />} iconBg="bg-green-500/10" iconColor="text-green-400"
                    label="Trade Volume" value={formatCurrency(stats.trading.totalVolume)} sub="All time" />
                  <StatCard icon={<Zap size={18} />} iconBg="bg-purple-500/10" iconColor="text-purple-400"
                    label="Futures Trades" value={formatNumber(stats.trading.totalFutures)} sub={`${stats.trading.activeFutures} active`} />
                  <StatCard icon={<TrendingUp size={18} />} iconBg="bg-cyan-500/10" iconColor="text-cyan-400"
                    label="Win Rate" value={`${stats.trading.futuresWinRate}%`} sub={`${stats.trading.futuresWins}W / ${stats.trading.futuresLosses}L`} />
                </div>
                <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-5">
                  <h3 className="text-sm font-semibold text-white mb-4">Trading Volume (30 days)</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartVolTrend}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#666' }} interval="preserveStartEnd" />
                        <YAxis tick={{ fontSize: 10, fill: '#666' }} />
                        <Tooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="Volume" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </TabsContent>

              {/* ===== ORDERS TAB (all orders with search) ===== */}
              <TabsContent value="orders" className="mt-4">
                <div className="bg-[#111] rounded-2xl border border-[#1e1e1e]">
                  <div className="p-4 border-b border-[#1e1e1e] flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1">
                      <h3 className="font-semibold text-white text-sm">All Orders</h3>
                      <p className="text-[11px] text-gray-500">{allOrders?.length || 0} total orders</p>
                    </div>
                    <div className="relative w-full sm:w-64">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
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
                      <Clock size={14} className="text-amber-400" />
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
                          <ArrowRight size={10} className="text-gray-600 flex-shrink-0" />
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
