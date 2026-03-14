import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  TrendingUp, TrendingDown, Users, DollarSign, Activity,
  BarChart3, ArrowUpRight, ArrowDownRight,
  Download, RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabaseClient';
import AdminLayout from './admin-layout';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell
} from 'recharts';

interface AnalyticsData {
  totalUsers: number;
  activeUsers: number;
  newUsersToday: number;
  newUsersThisWeek: number;
  totalDeposits: number;
  totalWithdrawals: number;
  pendingDeposits: number;
  pendingWithdrawals: number;
  totalTrades: number;
  pendingTrades: number;
  completedTrades: number;
  totalVolume: number;
  supportTickets: number;
  openTickets: number;
  resolvedTickets: number;
  totalDepositCount: number;
  totalFees: number;
}

interface ChartData {
  userGrowth: Array<{ date: string; users: number; newUsers: number }>;
  tradingVolume: Array<{ date: string; volume: number; trades: number }>;
  depositWithdrawal: Array<{ date: string; deposits: number; withdrawals: number }>;
  tradeStatus: Array<{ status: string; count: number; color: string }>;
  cumulativeMetrics: Array<{ date: string; users: number; volume: number; deposits: number }>;
}

export default function AdminAnalyticsPage() {
  const [analytics, setAnalytics] = useState<AnalyticsData>({
    totalUsers: 0,
    activeUsers: 0,
    newUsersToday: 0,
    newUsersThisWeek: 0,
    totalDeposits: 0,
    totalWithdrawals: 0,
    pendingDeposits: 0,
    pendingWithdrawals: 0,
    totalTrades: 0,
    pendingTrades: 0,
    completedTrades: 0,
    totalVolume: 0,
    supportTickets: 0,
    openTickets: 0,
    resolvedTickets: 0,
    totalDepositCount: 0,
    totalFees: 0,
  });
  const [chartData, setChartData] = useState<ChartData>({
    userGrowth: [],
    tradingVolume: [],
    depositWithdrawal: [],
    tradeStatus: [],
    cumulativeMetrics: []
  });
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('7d');
  const { toast } = useToast();

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('No authentication token');

      const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

      // Fetch from authenticated server API endpoints instead of direct Supabase queries
      const [statsRes, advancedRes] = await Promise.all([
        fetch('/api/admin/dashboard-stats', { headers }),
        fetch('/api/admin/analytics', { headers }),
      ]);

      if (!statsRes.ok) throw new Error('Failed to fetch dashboard stats');

      const stats = await statsRes.json();
      const advanced = advancedRes.ok ? await advancedRes.json() : null;

      // Map server response to analytics state (server already filters approved-only for financials)
      const completedTrades = stats.trading.completedTrades || 0;
      const pendingTrades = stats.trading.pendingTrades || 0;

      setAnalytics({
        totalUsers: stats.users.total,
        activeUsers: stats.users.active,
        newUsersToday: stats.users.newToday,
        newUsersThisWeek: stats.users.newThisWeek,
        totalDeposits: stats.financial.totalDeposits,
        totalWithdrawals: stats.financial.totalWithdrawals,
        pendingDeposits: stats.financial.pendingDeposits,
        pendingWithdrawals: stats.financial.pendingWithdrawals,
        totalTrades: stats.trading.totalTrades,
        pendingTrades,
        completedTrades,
        totalVolume: stats.trading.totalVolume,
        supportTickets: stats.support.total,
        openTickets: stats.support.open + stats.support.inProgress,
        resolvedTickets: stats.support.resolved,
        totalDepositCount: advanced?.summary?.totalDepositCount || 0,
        totalFees: stats.financial.fees?.total || 0,
      });

      // Build chart data from server responses
      const days = timeRange === '24h' ? 1 : timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
      const newChartData: ChartData = {
        userGrowth: [],
        tradingVolume: [],
        depositWithdrawal: [],
        tradeStatus: [],
        cumulativeMetrics: [],
      };

      // User growth from registration trend (server provides 30-day data)
      const regTrend = stats.charts?.registrationTrend || [];
      const slicedReg = regTrend.slice(Math.max(0, regTrend.length - days));
      let cumulativeUsers = stats.users.total - slicedReg.reduce((s: number, d: any) => s + d.count, 0);
      slicedReg.forEach((d: any) => {
        cumulativeUsers += d.count;
        const dateStr = new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        newChartData.userGrowth.push({ date: dateStr, users: cumulativeUsers, newUsers: d.count });
      });

      // Trading volume from server volume trend
      const volTrend = stats.charts?.volumeTrend || [];
      const slicedVol = volTrend.slice(Math.max(0, volTrend.length - days));
      slicedVol.forEach((d: any) => {
        const dateStr = new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        newChartData.tradingVolume.push({ date: dateStr, volume: d.volume, trades: d.count });
      });

      // Deposit/withdrawal flow from server financial trend (already filtered to approved)
      const finTrend = stats.charts?.financialTrend || [];
      const slicedFin = finTrend.slice(Math.max(0, finTrend.length - days));
      slicedFin.forEach((d: any) => {
        const dateStr = new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        newChartData.depositWithdrawal.push({ date: dateStr, deposits: d.deposits, withdrawals: d.withdrawals });
      });

      // Trade status distribution (properly summing executed + filled)
      newChartData.tradeStatus = [
        { status: 'Completed', count: completedTrades, color: '#10b981' },
        { status: 'Pending', count: pendingTrades, color: '#f59e0b' },
        { status: 'Rejected', count: Math.max(0, stats.trading.totalTrades - completedTrades - pendingTrades), color: '#ef4444' }
      ];

      // Cumulative metrics
      let cumVolume = 0;
      let cumDeposits = 0;
      for (let i = 0; i < newChartData.userGrowth.length; i++) {
        cumVolume += newChartData.tradingVolume[i]?.volume || 0;
        cumDeposits += newChartData.depositWithdrawal[i]?.deposits || 0;
        newChartData.cumulativeMetrics.push({
          date: newChartData.userGrowth[i].date,
          users: newChartData.userGrowth[i].users,
          volume: cumVolume,
          deposits: cumDeposits,
        });
      }

      setChartData(newChartData);
    } catch (error: any) {
      console.error('Error fetching analytics:', error);
      toast({
        title: 'Error',
        description: 'Failed to load analytics data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [timeRange, toast]);

  useEffect(() => {
    fetchAnalytics();
    const interval = setInterval(fetchAnalytics, 30000);
    return () => clearInterval(interval);
  }, [fetchAnalytics]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('en-US').format(value);
  };

  const ChartTooltipContent = ({ active, payload, label }: any) => {
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
  };

  const renderLegendText = (value: string) => <span className="text-gray-400 text-xs">{value}</span>;

  const StatCard = ({
    title,
    value,
    subtitle,
    icon: Icon,
    trend,
    trendUp,
    color
  }: {
    title: string;
    value: string;
    subtitle?: string;
    icon: any;
    trend?: string;
    trendUp?: boolean;
    color: string;
  }) => {
    // Map solid colors to matching transparent bg + text color pairs
    const colorMap: Record<string, { bg: string; text: string }> = {
      'bg-blue-500': { bg: 'bg-blue-500/10', text: 'text-blue-400' },
      'bg-green-500': { bg: 'bg-green-500/10', text: 'text-green-400' },
      'bg-orange-500': { bg: 'bg-orange-500/10', text: 'text-orange-400' },
      'bg-purple-500': { bg: 'bg-purple-500/10', text: 'text-purple-400' },
      'bg-red-500': { bg: 'bg-red-500/10', text: 'text-red-400' },
      'bg-cyan-500': { bg: 'bg-cyan-500/10', text: 'text-cyan-400' },
      'bg-amber-500': { bg: 'bg-amber-500/10', text: 'text-amber-400' },
    };
    const mapped = colorMap[color] || { bg: `${color}/10`, text: 'text-white' };

    return (
      <Card className="bg-[#111] border-[#1e1e1e] hover:border-[#2a2a2a] transition-all">
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-[11px] font-medium text-gray-400">{title}</p>
              <p className="text-xl font-bold text-white mt-2">{value}</p>
              {subtitle && <p className="text-[10px] text-gray-500 mt-1">{subtitle}</p>}
              {trend && (
                <div className={`flex items-center gap-1 mt-2 text-xs ${trendUp ? 'text-green-400' : 'text-red-400'}`}>
                  {trendUp ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                  <span>{trend}</span>
                </div>
              )}
            </div>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${mapped.bg} ${mapped.text}`}>
              <Icon className="w-5 h-5" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-white">Analytics</h1>
            <p className="text-sm text-gray-500 mt-1">Platform performance and statistics</p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={timeRange} onValueChange={(val) => setTimeRange(val)}>
              <SelectTrigger className="w-[160px] bg-[#111] border-[#1e1e1e] text-white text-sm focus:border-blue-500">
                <SelectValue placeholder="Select range" />
              </SelectTrigger>
              <SelectContent className="bg-[#111] border-[#1e1e1e]">
                <SelectItem value="24h" className="text-white hover:bg-[#1a1a1a]">Last 24 Hours</SelectItem>
                <SelectItem value="7d" className="text-white hover:bg-[#1a1a1a]">Last 7 Days</SelectItem>
                <SelectItem value="30d" className="text-white hover:bg-[#1a1a1a]">Last 30 Days</SelectItem>
                <SelectItem value="90d" className="text-white hover:bg-[#1a1a1a]">Last 90 Days</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchAnalytics}
              disabled={loading}
              className="gap-2 bg-[#111] border-[#1e1e1e] text-white hover:bg-[#1a1a1a] hover:text-white"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 bg-[#111] border-[#1e1e1e] text-white hover:bg-[#1a1a1a] hover:text-white"
              onClick={() => {
                toast({
                  title: 'Export Coming Soon',
                  description: 'Analytics export feature will be available soon.',
                });
              }}
            >
              <Download className="w-4 h-4" />
              Export
            </Button>
          </div>
        </div>

        {/* Overview Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Users"
            value={formatNumber(analytics.totalUsers)}
            subtitle={`${formatNumber(analytics.newUsersToday)} new today`}
            icon={Users}
            trend={analytics.newUsersThisWeek > 0 ? `+${analytics.newUsersThisWeek} this week` : 'No new users this week'}
            trendUp={analytics.newUsersThisWeek > 0}
            color="bg-blue-500"
          />
          <StatCard
            title="Total Deposits"
            value={formatCurrency(analytics.totalDeposits)}
            subtitle={`${analytics.pendingDeposits} pending`}
            icon={TrendingUp}
            color="bg-green-500"
          />
          <StatCard
            title="Total Withdrawals"
            value={formatCurrency(analytics.totalWithdrawals)}
            subtitle={`${analytics.pendingWithdrawals} pending`}
            icon={TrendingDown}
            color="bg-orange-500"
          />
          <StatCard
            title="Total Trades"
            value={formatNumber(analytics.totalTrades)}
            subtitle={`${analytics.pendingTrades} pending approval`}
            icon={Activity}
            trend={`${analytics.completedTrades} completed`}
            trendUp={analytics.completedTrades > 0}
            color="bg-purple-500"
          />
        </div>

        {/* Detailed Analytics Tabs */}
        <Tabs defaultValue="users" className="space-y-4">
          <TabsList className="bg-[#111] border border-[#1e1e1e] rounded-lg p-1">
            <TabsTrigger value="users" className="rounded-md data-[state=active]:bg-blue-500/10 data-[state=active]:text-blue-400 text-gray-400">
              Users
            </TabsTrigger>
            <TabsTrigger value="trading" className="rounded-md data-[state=active]:bg-blue-500/10 data-[state=active]:text-blue-400 text-gray-400">
              Trading
            </TabsTrigger>
            <TabsTrigger value="finance" className="rounded-md data-[state=active]:bg-blue-500/10 data-[state=active]:text-blue-400 text-gray-400">
              Finance
            </TabsTrigger>
            <TabsTrigger value="support" className="rounded-md data-[state=active]:bg-blue-500/10 data-[state=active]:text-blue-400 text-gray-400">
              Support
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="space-y-4">
            <Card className="bg-[#111] border-[#1e1e1e]">
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-white">User Growth Trend</CardTitle>
                <p className="text-sm text-gray-500">Daily user registrations and cumulative growth</p>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData.userGrowth}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
                    <XAxis dataKey="date" stroke="#6b7280" fontSize={12} />
                    <YAxis stroke="#6b7280" fontSize={12} />
                    <Tooltip content={<ChartTooltipContent />} />
                    <Legend formatter={renderLegendText} />
                    <Line type="monotone" dataKey="users" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', r: 4 }} activeDot={{ r: 6 }} name="Total Users" />
                    <Line type="monotone" dataKey="newUsers" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981', r: 4 }} activeDot={{ r: 6 }} name="New Users" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-[#111] border-[#1e1e1e]">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-400">User Growth</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-white">{formatNumber(analytics.newUsersThisWeek)}</div>
                  <p className="text-xs text-gray-500 mt-1">New users this week</p>
                  <div className="mt-4 h-2 bg-[#1a1a1a] rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min((analytics.newUsersThisWeek / Math.max(analytics.totalUsers, 1)) * 100, 100)}%` }} />
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-[#111] border-[#1e1e1e]">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-400">Active Users</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-white">{formatNumber(analytics.activeUsers)}</div>
                  <p className="text-xs text-gray-500 mt-1">Currently active accounts</p>
                  <div className="mt-4 h-2 bg-[#1a1a1a] rounded-full overflow-hidden">
                    <div className="h-full bg-green-500 rounded-full" style={{ width: `${Math.min((analytics.activeUsers / Math.max(analytics.totalUsers, 1)) * 100, 100)}%` }} />
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-[#111] border-[#1e1e1e]">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-400">Activity Rate</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-white">
                    {analytics.totalUsers > 0 ? Math.round((analytics.activeUsers / analytics.totalUsers) * 100) : 0}%
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Of total users are active</p>
                  <div className="mt-4 h-2 bg-[#1a1a1a] rounded-full overflow-hidden">
                    <div className="h-full bg-purple-500 rounded-full" style={{ width: `${analytics.totalUsers > 0 ? (analytics.activeUsers / analytics.totalUsers) * 100 : 0}%` }} />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="trading" className="space-y-4">
            <Card className="bg-[#111] border-[#1e1e1e]">
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-white">Trading Volume & Activity</CardTitle>
                <p className="text-sm text-gray-500">Daily trading volume and number of trades</p>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData.tradingVolume}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
                    <XAxis dataKey="date" stroke="#6b7280" fontSize={12} />
                    <YAxis stroke="#6b7280" fontSize={12} />
                    <Tooltip content={<ChartTooltipContent />} />
                    <Legend formatter={renderLegendText} />
                    <Bar dataKey="volume" fill="#8b5cf6" name="Volume ($)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="trades" fill="#06b6d4" name="Number of Trades" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="bg-[#111] border-[#1e1e1e]">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-white">Trade Status Distribution</CardTitle>
                  <p className="text-sm text-gray-500">Breakdown of trade statuses</p>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie data={chartData.tradeStatus} cx="50%" cy="50%" labelLine={false}
                        label={({ x, y, status, count, percent }) => (
                          <text x={x} y={y} fill="#9ca3af" textAnchor="middle" dominantBaseline="central" fontSize={11}>
                            {`${status}: ${count} (${(percent * 100).toFixed(0)}%)`}
                          </text>
                        )}
                        outerRadius={80} fill="#8884d8" dataKey="count">
                        {chartData.tradeStatus.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltipContent />} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <div className="space-y-4">
                <Card className="bg-[#111] border-[#1e1e1e]">
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-gray-400">Trading Volume</CardTitle></CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-white">{formatCurrency(analytics.totalVolume)}</div>
                    <p className="text-xs text-gray-500 mt-1">Total trading volume</p>
                  </CardContent>
                </Card>
                <Card className="bg-[#111] border-[#1e1e1e]">
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-gray-400">Pending Orders</CardTitle></CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-white">{formatNumber(analytics.pendingTrades)}</div>
                    <p className="text-xs text-gray-500 mt-1">Awaiting approval</p>
                  </CardContent>
                </Card>
                <Card className="bg-[#111] border-[#1e1e1e]">
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-gray-400">Completion Rate</CardTitle></CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-white">
                      {analytics.totalTrades > 0 ? Math.round((analytics.completedTrades / analytics.totalTrades) * 100) : 0}%
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Orders completed</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="finance" className="space-y-4">
            <Card className="bg-[#111] border-[#1e1e1e]">
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-white">Deposit & Withdrawal Flow</CardTitle>
                <p className="text-sm text-gray-500">Daily approved deposits and withdrawals comparison</p>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={chartData.depositWithdrawal}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
                    <XAxis dataKey="date" stroke="#6b7280" fontSize={12} />
                    <YAxis stroke="#6b7280" fontSize={12} />
                    <Tooltip content={<ChartTooltipContent />} />
                    <Legend formatter={renderLegendText} />
                    <Area type="monotone" dataKey="deposits" stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={0.6} name="Deposits ($)" />
                    <Area type="monotone" dataKey="withdrawals" stackId="2" stroke="#ef4444" fill="#ef4444" fillOpacity={0.6} name="Withdrawals ($)" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-[#111] border-[#1e1e1e]">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-gray-400">Net Flow</CardTitle></CardHeader>
                <CardContent>
                  <div className={`text-3xl font-bold ${analytics.totalDeposits - analytics.totalWithdrawals >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {formatCurrency(analytics.totalDeposits - analytics.totalWithdrawals)}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Deposits minus withdrawals</p>
                </CardContent>
              </Card>
              <Card className="bg-[#111] border-[#1e1e1e]">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-gray-400">Pending Deposits</CardTitle></CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-white">{analytics.pendingDeposits}</div>
                  <p className="text-xs text-gray-500 mt-1">Awaiting confirmation</p>
                </CardContent>
              </Card>
              <Card className="bg-[#111] border-[#1e1e1e]">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-gray-400">Pending Withdrawals</CardTitle></CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-white">{analytics.pendingWithdrawals}</div>
                  <p className="text-xs text-gray-500 mt-1">Awaiting processing</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="support" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-[#111] border-[#1e1e1e]">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-gray-400">Total Tickets</CardTitle></CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-white">{formatNumber(analytics.supportTickets)}</div>
                  <p className="text-xs text-gray-500 mt-1">All support conversations</p>
                </CardContent>
              </Card>
              <Card className="bg-[#111] border-[#1e1e1e]">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-gray-400">Open Tickets</CardTitle></CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-orange-400">{formatNumber(analytics.openTickets)}</div>
                  <p className="text-xs text-gray-500 mt-1">Need attention</p>
                </CardContent>
              </Card>
              <Card className="bg-[#111] border-[#1e1e1e]">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-gray-400">Resolution Rate</CardTitle></CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-green-400">
                    {analytics.supportTickets > 0 ? Math.round((analytics.resolvedTickets / analytics.supportTickets) * 100) : 0}%
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Tickets resolved</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        {/* Cumulative Metrics Chart */}
        <Card className="bg-[#111] border-[#1e1e1e]">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-white">Cumulative Growth Metrics</CardTitle>
            <p className="text-sm text-gray-500">Platform growth trends over time</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={350}>
              <AreaChart data={chartData.cumulativeMetrics}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
                <XAxis dataKey="date" stroke="#6b7280" fontSize={12} />
                <YAxis stroke="#6b7280" fontSize={12} />
                <Tooltip content={<ChartTooltipContent />} />
                <Legend formatter={renderLegendText} />
                <Area type="monotone" dataKey="users" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} name="Total Users" />
                <Area type="monotone" dataKey="volume" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.3} name="Trading Volume ($)" />
                <Area type="monotone" dataKey="deposits" stroke="#10b981" fill="#10b981" fillOpacity={0.3} name="Total Deposits ($)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Quick Insights */}
        <Card className="bg-gradient-to-r from-blue-600/10 to-indigo-600/10 border-blue-500/20">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-blue-500 rounded-xl flex items-center justify-center flex-shrink-0">
                <BarChart3 className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-white">Platform Insights</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
                  <div className="bg-[#111]/50 rounded-lg p-3 border border-[#1e1e1e]">
                    <p className="text-xs text-gray-500">Avg. Deposit</p>
                    <p className="text-lg font-semibold text-white">
                      {analytics.totalDepositCount > 0 ? formatCurrency(analytics.totalDeposits / analytics.totalDepositCount) : formatCurrency(0)}
                    </p>
                  </div>
                  <div className="bg-[#111]/50 rounded-lg p-3 border border-[#1e1e1e]">
                    <p className="text-xs text-gray-500">Trades per User</p>
                    <p className="text-lg font-semibold text-white">
                      {analytics.totalUsers > 0 ? (analytics.totalTrades / analytics.totalUsers).toFixed(2) : '0.00'}
                    </p>
                  </div>
                  <div className="bg-[#111]/50 rounded-lg p-3 border border-[#1e1e1e]">
                    <p className="text-xs text-gray-500">Total Fees Collected</p>
                    <p className="text-lg font-semibold text-white">
                      {formatCurrency(analytics.totalFees)}
                    </p>
                  </div>
                  <div className="bg-[#111]/50 rounded-lg p-3 border border-[#1e1e1e]">
                    <p className="text-xs text-gray-500">Support Load</p>
                    <p className="text-lg font-semibold text-white">
                      {analytics.totalUsers > 0 ? (analytics.supportTickets / analytics.totalUsers).toFixed(2) : '0.00'}
                    </p>
                    <p className="text-xs text-gray-500">tickets per user</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
