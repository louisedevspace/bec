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
      <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-sm">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        {payload.map((entry: any, i: number) => (
          <p key={i} className="text-xs font-medium tabular-nums" style={{ color: entry.color }}>
            {entry.name}: {typeof entry.value === 'number' && entry.value > 100
              ? formatCurrency(entry.value)
              : entry.value}
          </p>
        ))}
      </div>
    );
  };

  const renderLegendText = (value: string) => <span className="text-muted-foreground text-xs">{value}</span>;

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
    // Map semantic accent keys to token-based bg + text pairs
    const colorMap: Record<string, string> = {
      primary: 'bg-primary/10 text-primary',
      success: 'bg-success/10 text-success',
      warning: 'bg-warning/10 text-warning',
      danger: 'bg-danger/10 text-danger',
      info: 'bg-info/10 text-info',
    };
    const mapped = colorMap[color] || colorMap.primary;

    return (
      <Card className="bg-card border-border hover:border-primary/30 transition-colors">
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-[11px] font-medium text-muted-foreground">{title}</p>
              <p className="text-xl font-bold text-foreground mt-2 tabular-nums">{value}</p>
              {subtitle && <p className="text-[10px] text-muted-foreground mt-1 tabular-nums">{subtitle}</p>}
              {trend && (
                <div className={`flex items-center gap-1 mt-2 text-xs tabular-nums ${trendUp ? 'text-success' : 'text-danger'}`}>
                  {trendUp ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                  <span>{trend}</span>
                </div>
              )}
            </div>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${mapped}`}>
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
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Analytics</h1>
            <p className="text-sm text-muted-foreground mt-1">Platform performance and statistics</p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={timeRange} onValueChange={(val) => setTimeRange(val)}>
              <SelectTrigger className="w-[160px] bg-card border-border text-foreground text-sm focus:border-primary focus:ring-1 focus:ring-ring">
                <SelectValue placeholder="Select range" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                <SelectItem value="24h" className="text-foreground hover:bg-muted focus:bg-muted">Last 24 Hours</SelectItem>
                <SelectItem value="7d" className="text-foreground hover:bg-muted focus:bg-muted">Last 7 Days</SelectItem>
                <SelectItem value="30d" className="text-foreground hover:bg-muted focus:bg-muted">Last 30 Days</SelectItem>
                <SelectItem value="90d" className="text-foreground hover:bg-muted focus:bg-muted">Last 90 Days</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchAnalytics}
              disabled={loading}
              className="gap-2 bg-card border-border text-foreground hover:bg-muted hover:text-foreground"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 bg-card border-border text-foreground hover:bg-muted hover:text-foreground"
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
            color="primary"
          />
          <StatCard
            title="Total Deposits"
            value={formatCurrency(analytics.totalDeposits)}
            subtitle={`${analytics.pendingDeposits} pending`}
            icon={TrendingUp}
            color="success"
          />
          <StatCard
            title="Total Withdrawals"
            value={formatCurrency(analytics.totalWithdrawals)}
            subtitle={`${analytics.pendingWithdrawals} pending`}
            icon={TrendingDown}
            color="warning"
          />
          <StatCard
            title="Total Trades"
            value={formatNumber(analytics.totalTrades)}
            subtitle={`${analytics.pendingTrades} pending approval`}
            icon={Activity}
            trend={`${analytics.completedTrades} completed`}
            trendUp={analytics.completedTrades > 0}
            color="info"
          />
        </div>

        {/* Detailed Analytics Tabs */}
        <Tabs defaultValue="users" className="space-y-4">
          <TabsList className="bg-card border border-border rounded-lg p-1">
            <TabsTrigger value="users" className="rounded-md data-[state=active]:bg-primary/10 data-[state=active]:text-primary text-muted-foreground">
              Users
            </TabsTrigger>
            <TabsTrigger value="trading" className="rounded-md data-[state=active]:bg-primary/10 data-[state=active]:text-primary text-muted-foreground">
              Trading
            </TabsTrigger>
            <TabsTrigger value="finance" className="rounded-md data-[state=active]:bg-primary/10 data-[state=active]:text-primary text-muted-foreground">
              Finance
            </TabsTrigger>
            <TabsTrigger value="support" className="rounded-md data-[state=active]:bg-primary/10 data-[state=active]:text-primary text-muted-foreground">
              Support
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="space-y-4">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-foreground">User Growth Trend</CardTitle>
                <p className="text-sm text-muted-foreground">Daily user registrations and cumulative growth</p>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData.userGrowth}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <Tooltip content={<ChartTooltipContent />} />
                    <Legend formatter={renderLegendText} />
                    <Line type="monotone" dataKey="users" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ fill: 'hsl(var(--primary))', r: 4 }} activeDot={{ r: 6 }} name="Total Users" />
                    <Line type="monotone" dataKey="newUsers" stroke="hsl(var(--success))" strokeWidth={2} dot={{ fill: 'hsl(var(--success))', r: 4 }} activeDot={{ r: 6 }} name="New Users" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-card border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">User Growth</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-foreground tabular-nums">{formatNumber(analytics.newUsersThisWeek)}</div>
                  <p className="text-xs text-muted-foreground mt-1">New users this week</p>
                  <div className="mt-4 h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min((analytics.newUsersThisWeek / Math.max(analytics.totalUsers, 1)) * 100, 100)}%` }} />
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-card border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Active Users</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-foreground tabular-nums">{formatNumber(analytics.activeUsers)}</div>
                  <p className="text-xs text-muted-foreground mt-1">Currently active accounts</p>
                  <div className="mt-4 h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-success rounded-full" style={{ width: `${Math.min((analytics.activeUsers / Math.max(analytics.totalUsers, 1)) * 100, 100)}%` }} />
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-card border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Activity Rate</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-foreground tabular-nums">
                    {analytics.totalUsers > 0 ? Math.round((analytics.activeUsers / analytics.totalUsers) * 100) : 0}%
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Of total users are active</p>
                  <div className="mt-4 h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-info rounded-full" style={{ width: `${analytics.totalUsers > 0 ? (analytics.activeUsers / analytics.totalUsers) * 100 : 0}%` }} />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="trading" className="space-y-4">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-foreground">Trading Volume & Activity</CardTitle>
                <p className="text-sm text-muted-foreground">Daily trading volume and number of trades</p>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData.tradingVolume}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <Tooltip content={<ChartTooltipContent />} />
                    <Legend formatter={renderLegendText} />
                    <Bar dataKey="volume" fill="hsl(var(--primary))" name="Volume ($)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="trades" fill="hsl(var(--info))" name="Number of Trades" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-foreground">Trade Status Distribution</CardTitle>
                  <p className="text-sm text-muted-foreground">Breakdown of trade statuses</p>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie data={chartData.tradeStatus} cx="50%" cy="50%" labelLine={false}
                        label={({ x, y, status, count, percent }) => (
                          <text x={x} y={y} fill="hsl(var(--muted-foreground))" textAnchor="middle" dominantBaseline="central" fontSize={11}>
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
                <Card className="bg-card border-border">
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Trading Volume</CardTitle></CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-foreground tabular-nums">{formatCurrency(analytics.totalVolume)}</div>
                    <p className="text-xs text-muted-foreground mt-1">Total trading volume</p>
                  </CardContent>
                </Card>
                <Card className="bg-card border-border">
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Pending Orders</CardTitle></CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-foreground tabular-nums">{formatNumber(analytics.pendingTrades)}</div>
                    <p className="text-xs text-muted-foreground mt-1">Awaiting approval</p>
                  </CardContent>
                </Card>
                <Card className="bg-card border-border">
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Completion Rate</CardTitle></CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-foreground tabular-nums">
                      {analytics.totalTrades > 0 ? Math.round((analytics.completedTrades / analytics.totalTrades) * 100) : 0}%
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Orders completed</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="finance" className="space-y-4">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-foreground">Deposit & Withdrawal Flow</CardTitle>
                <p className="text-sm text-muted-foreground">Daily approved deposits and withdrawals comparison</p>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={chartData.depositWithdrawal}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <Tooltip content={<ChartTooltipContent />} />
                    <Legend formatter={renderLegendText} />
                    <Area type="monotone" dataKey="deposits" stackId="1" stroke="hsl(var(--success))" fill="hsl(var(--success))" fillOpacity={0.25} name="Deposits ($)" />
                    <Area type="monotone" dataKey="withdrawals" stackId="2" stroke="hsl(var(--danger))" fill="hsl(var(--danger))" fillOpacity={0.25} name="Withdrawals ($)" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-card border-border">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Net Flow</CardTitle></CardHeader>
                <CardContent>
                  <div className={`text-3xl font-bold tabular-nums ${analytics.totalDeposits - analytics.totalWithdrawals >= 0 ? 'text-success' : 'text-danger'}`}>
                    {formatCurrency(analytics.totalDeposits - analytics.totalWithdrawals)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Deposits minus withdrawals</p>
                </CardContent>
              </Card>
              <Card className="bg-card border-border">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Pending Deposits</CardTitle></CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-foreground tabular-nums">{analytics.pendingDeposits}</div>
                  <p className="text-xs text-muted-foreground mt-1">Awaiting confirmation</p>
                </CardContent>
              </Card>
              <Card className="bg-card border-border">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Pending Withdrawals</CardTitle></CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-foreground tabular-nums">{analytics.pendingWithdrawals}</div>
                  <p className="text-xs text-muted-foreground mt-1">Awaiting processing</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="support" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-card border-border">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Tickets</CardTitle></CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-foreground tabular-nums">{formatNumber(analytics.supportTickets)}</div>
                  <p className="text-xs text-muted-foreground mt-1">All support conversations</p>
                </CardContent>
              </Card>
              <Card className="bg-card border-border">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Open Tickets</CardTitle></CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-warning tabular-nums">{formatNumber(analytics.openTickets)}</div>
                  <p className="text-xs text-muted-foreground mt-1">Need attention</p>
                </CardContent>
              </Card>
              <Card className="bg-card border-border">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Resolution Rate</CardTitle></CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-success tabular-nums">
                    {analytics.supportTickets > 0 ? Math.round((analytics.resolvedTickets / analytics.supportTickets) * 100) : 0}%
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Tickets resolved</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        {/* Cumulative Metrics Chart */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-foreground">Cumulative Growth Metrics</CardTitle>
            <p className="text-sm text-muted-foreground">Platform growth trends over time</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={350}>
              <AreaChart data={chartData.cumulativeMetrics}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip content={<ChartTooltipContent />} />
                <Legend formatter={renderLegendText} />
                <Area type="monotone" dataKey="users" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} name="Total Users" />
                <Area type="monotone" dataKey="volume" stroke="hsl(var(--info))" fill="hsl(var(--info))" fillOpacity={0.2} name="Trading Volume ($)" />
                <Area type="monotone" dataKey="deposits" stroke="hsl(var(--success))" fill="hsl(var(--success))" fillOpacity={0.2} name="Total Deposits ($)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Quick Insights */}
        <Card className="bg-card border-border">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center flex-shrink-0">
                <BarChart3 className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-foreground">Platform Insights</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
                  <div className="bg-background/60 rounded-lg p-3 border border-border">
                    <p className="text-xs text-muted-foreground">Avg. Deposit</p>
                    <p className="text-lg font-semibold text-foreground tabular-nums">
                      {analytics.totalDepositCount > 0 ? formatCurrency(analytics.totalDeposits / analytics.totalDepositCount) : formatCurrency(0)}
                    </p>
                  </div>
                  <div className="bg-background/60 rounded-lg p-3 border border-border">
                    <p className="text-xs text-muted-foreground">Trades per User</p>
                    <p className="text-lg font-semibold text-foreground tabular-nums">
                      {analytics.totalUsers > 0 ? (analytics.totalTrades / analytics.totalUsers).toFixed(2) : '0.00'}
                    </p>
                  </div>
                  <div className="bg-background/60 rounded-lg p-3 border border-border">
                    <p className="text-xs text-muted-foreground">Total Fees Collected</p>
                    <p className="text-lg font-semibold text-foreground tabular-nums">
                      {formatCurrency(analytics.totalFees)}
                    </p>
                  </div>
                  <div className="bg-background/60 rounded-lg p-3 border border-border">
                    <p className="text-xs text-muted-foreground">Support Load</p>
                    <p className="text-lg font-semibold text-foreground tabular-nums">
                      {analytics.totalUsers > 0 ? (analytics.supportTickets / analytics.totalUsers).toFixed(2) : '0.00'}
                    </p>
                    <p className="text-xs text-muted-foreground">tickets per user</p>
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
