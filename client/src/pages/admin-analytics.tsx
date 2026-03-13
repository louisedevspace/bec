import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  TrendingUp, TrendingDown, Users, DollarSign, Activity, 
  BarChart3, ArrowUpRight, ArrowDownRight, 
  Download, RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      // Fetch users stats
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, created_at, is_active');
      
      if (usersError) throw usersError;

      // Fetch deposits
      const { data: deposits, error: depositsError } = await supabase
        .from('deposit_requests')
        .select('id, amount, status, submitted_at');
      
      if (depositsError) throw depositsError;

      // Fetch withdrawals
      const { data: withdrawals, error: withdrawalsError } = await supabase
        .from('withdraw_requests')
        .select('id, amount, status, submitted_at');
      
      if (withdrawalsError) throw withdrawalsError;

      // Fetch trades
      const { data: trades, error: tradesError } = await supabase
        .from('trades')
        .select('id, amount, status, created_at');
      
      if (tradesError) throw tradesError;

      // Fetch support tickets
      const { data: tickets, error: ticketsError } = await supabase
        .from('support_conversations')
        .select('id, status, created_at');
      
      if (ticketsError) throw ticketsError;

      // Calculate stats
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

      const newUsersToday = users?.filter(u => new Date(u.created_at) >= today).length || 0;
      const newUsersThisWeek = users?.filter(u => new Date(u.created_at) >= weekAgo).length || 0;
      const activeUsers = users?.filter(u => u.is_active).length || 0;

      const totalDeposits = deposits?.reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0) || 0;
      const pendingDeposits = deposits?.filter(d => d.status === 'pending').length || 0;

      const totalWithdrawals = withdrawals?.reduce((sum, w) => sum + (parseFloat(w.amount) || 0), 0) || 0;
      const pendingWithdrawals = withdrawals?.filter(w => w.status === 'pending').length || 0;

      const totalTrades = trades?.length || 0;
      const pendingTrades = trades?.filter(t => t.status === 'pending_approval' || t.status === 'pending').length || 0;
      const completedTrades = trades?.filter(t => t.status === 'executed' || t.status === 'filled').length || 0;
      const totalVolume = trades?.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0) || 0;

      const supportTickets = tickets?.length || 0;
      const openTickets = tickets?.filter(t => t.status === 'open' || t.status === 'in_progress').length || 0;
      const resolvedTickets = tickets?.filter(t => t.status === 'resolved' || t.status === 'closed').length || 0;

      // Generate chart data from real database records
      const generateChartData = async () => {
        const days = timeRange === '24h' ? 1 : timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
        const chartData: ChartData = {
          userGrowth: [],
          tradingVolume: [],
          depositWithdrawal: [],
          tradeStatus: [],
          cumulativeMetrics: []
        };

        // Calculate date range
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days + 1);

        try {
          // 1. User Growth Data - Get all users in date range and group by date
          const { data: allUsers } = await supabase
            .from('users')
            .select('id, created_at')
            .gte('created_at', startDate.toISOString())
            .lt('created_at', endDate.toISOString())
            .order('created_at', { ascending: true });

          // Get total users count before start date for baseline
          const { data: baselineUsers } = await supabase
            .from('users')
            .select('id')
            .lt('created_at', startDate.toISOString());

          const baselineCount = baselineUsers?.length || 0;
          const userMap = new Map<string, number>();

          // Group users by date
          allUsers?.forEach(user => {
            const date = new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            userMap.set(date, (userMap.get(date) || 0) + 1);
          });

          // Generate user growth data
          let cumulativeCount = baselineCount;
          for (let i = days - 1; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            
            const newUsers = userMap.get(dateStr) || 0;
            cumulativeCount += newUsers;

            chartData.userGrowth.push({
              date: dateStr,
              users: cumulativeCount,
              newUsers: newUsers
            });
          }

          // 2. Trading Volume Data - Get all trades in date range and group by date
          const { data: allTrades } = await supabase
            .from('trades')
            .select('amount, created_at')
            .gte('created_at', startDate.toISOString())
            .lt('created_at', endDate.toISOString())
            .order('created_at', { ascending: true });

          const tradeMap = new Map<string, { volume: number; count: number }>();

          // Group trades by date
          allTrades?.forEach(trade => {
            const date = new Date(trade.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const existing = tradeMap.get(date) || { volume: 0, count: 0 };
            tradeMap.set(date, {
              volume: existing.volume + (parseFloat(trade.amount) || 0),
              count: existing.count + 1
            });
          });

          // Generate trading volume data
          for (let i = days - 1; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            
            const dayData = tradeMap.get(dateStr) || { volume: 0, count: 0 };

            chartData.tradingVolume.push({
              date: dateStr,
              volume: dayData.volume,
              trades: dayData.count
            });
          }

          // 3. Deposit/Withdrawal Data - Get all transactions in date range and group by date
          const [{ data: allDeposits }, { data: allWithdrawals }] = await Promise.all([
            supabase
              .from('deposit_requests')
              .select('amount, submitted_at')
              .gte('submitted_at', startDate.toISOString())
              .lt('submitted_at', endDate.toISOString())
              .eq('status', 'approved')
              .order('submitted_at', { ascending: true }),
            supabase
              .from('withdraw_requests')
              .select('amount, submitted_at')
              .gte('submitted_at', startDate.toISOString())
              .lt('submitted_at', endDate.toISOString())
              .eq('status', 'approved')
              .order('submitted_at', { ascending: true })
          ]);

          const depositMap = new Map<string, number>();
          const withdrawalMap = new Map<string, number>();

          // Group deposits by date
          allDeposits?.forEach(deposit => {
            const date = new Date(deposit.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            depositMap.set(date, (depositMap.get(date) || 0) + (parseFloat(deposit.amount) || 0));
          });

          // Group withdrawals by date
          allWithdrawals?.forEach(withdrawal => {
            const date = new Date(withdrawal.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            withdrawalMap.set(date, (withdrawalMap.get(date) || 0) + (parseFloat(withdrawal.amount) || 0));
          });

          // Generate deposit/withdrawal data
          for (let i = days - 1; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            
            chartData.depositWithdrawal.push({
              date: dateStr,
              deposits: depositMap.get(dateStr) || 0,
              withdrawals: withdrawalMap.get(dateStr) || 0
            });
          }

          // 4. Trade Status Distribution - Get actual trade statuses
          const { data: statusTrades } = await supabase
            .from('trades')
            .select('status');

          if (statusTrades) {
            const statusCounts = statusTrades.reduce((acc, trade) => {
              acc[trade.status] = (acc[trade.status] || 0) + 1;
              return acc;
            }, {} as Record<string, number>);

            chartData.tradeStatus = [
              { status: 'Completed', count: statusCounts['executed'] || statusCounts['filled'] || 0, color: '#10b981' },
              { status: 'Pending', count: (statusCounts['pending_approval'] || 0) + (statusCounts['pending'] || 0), color: '#f59e0b' },
              { status: 'Rejected', count: statusCounts['rejected'] || 0, color: '#ef4444' }
            ];
          }

          // 5. Cumulative Metrics - Calculate running totals
          let cumulativeVolume = 0;
          let cumulativeDeposits = 0;

          for (let i = 0; i < chartData.userGrowth.length; i++) {
            cumulativeVolume += chartData.tradingVolume[i]?.volume || 0;
            cumulativeDeposits += chartData.depositWithdrawal[i]?.deposits || 0;

            chartData.cumulativeMetrics.push({
              date: chartData.userGrowth[i].date,
              users: chartData.userGrowth[i].users,
              volume: cumulativeVolume,
              deposits: cumulativeDeposits
            });
          }

        } catch (error) {
          console.error('Error generating chart data:', error);
          // Fallback to empty data if queries fail
        }

        return chartData;
      };

      setAnalytics({
        totalUsers: users?.length || 0,
        activeUsers,
        newUsersToday,
        newUsersThisWeek,
        totalDeposits,
        totalWithdrawals,
        pendingDeposits,
        pendingWithdrawals,
        totalTrades,
        pendingTrades,
        completedTrades,
        totalVolume,
        supportTickets,
        openTickets,
        resolvedTickets,
      });

      const chartData = await generateChartData();
      setChartData(chartData);
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
  };

  useEffect(() => {
    fetchAnalytics();
    const interval = setInterval(fetchAnalytics, 30000);
    return () => clearInterval(interval);
  }, [timeRange]);

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
  }) => (
    <Card className="bg-[#111] border-[#1e1e1e] hover:border-[#2a2a2a] transition-all">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-400">{title}</p>
            <p className="text-2xl font-bold text-white mt-2">{value}</p>
            {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
            {trend && (
              <div className={`flex items-center gap-1 mt-2 text-xs ${trendUp ? 'text-green-400' : 'text-red-400'}`}>
                {trendUp ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                <span>{trend}</span>
              </div>
            )}
          </div>
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
            <Icon className="w-6 h-6 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );

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
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="bg-[#111] border border-[#1e1e1e] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            >
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="90d">Last 90 Days</option>
            </select>
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
            trend={`+${analytics.newUsersThisWeek} this week`}
            trendUp={true}
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
            trendUp={true}
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
            {/* User Growth Chart */}
            <Card className="bg-[#111] border-[#1e1e1e]">
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-white">User Growth Trend</CardTitle>
                <p className="text-sm text-gray-500">Daily user registrations and cumulative growth</p>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData.userGrowth}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
                    <XAxis 
                      dataKey="date" 
                      stroke="#6b7280"
                      fontSize={12}
                    />
                    <YAxis 
                      stroke="#6b7280"
                      fontSize={12}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#111', 
                        border: '1px solid #1e1e1e',
                        borderRadius: '8px'
                      }}
                      labelStyle={{ color: '#fff' }}
                      itemStyle={{ color: '#fff' }}
                    />
                    <Legend 
                      wrapperStyle={{ color: '#fff' }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="users" 
                      stroke="#3b82f6" 
                      strokeWidth={2}
                      dot={{ fill: '#3b82f6', r: 4 }}
                      activeDot={{ r: 6 }}
                      name="Total Users"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="newUsers" 
                      stroke="#10b981" 
                      strokeWidth={2}
                      dot={{ fill: '#10b981', r: 4 }}
                      activeDot={{ r: 6 }}
                      name="New Users"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* User Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-[#111] border-[#1e1e1e]">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-400">User Growth</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-white">{formatNumber(analytics.newUsersThisWeek)}</div>
                  <p className="text-xs text-gray-500 mt-1">New users this week</p>
                  <div className="mt-4 h-2 bg-[#1a1a1a] rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${Math.min((analytics.newUsersThisWeek / Math.max(analytics.totalUsers, 1)) * 100, 100)}%` }}
                    />
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
                    <div 
                      className="h-full bg-green-500 rounded-full"
                      style={{ width: `${Math.min((analytics.activeUsers / Math.max(analytics.totalUsers, 1)) * 100, 100)}%` }}
                    />
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
                    <div 
                      className="h-full bg-purple-500 rounded-full"
                      style={{ width: `${analytics.totalUsers > 0 ? (analytics.activeUsers / analytics.totalUsers) * 100 : 0}%` }}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="trading" className="space-y-4">
            {/* Trading Volume Chart */}
            <Card className="bg-[#111] border-[#1e1e1e]">
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-white">Trading Volume & Activity</CardTitle>
                <p className="text-sm text-gray-500">Daily trading volume and number of trades</p>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData.tradingVolume}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
                    <XAxis 
                      dataKey="date" 
                      stroke="#6b7280"
                      fontSize={12}
                    />
                    <YAxis 
                      stroke="#6b7280"
                      fontSize={12}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#111', 
                        border: '1px solid #1e1e1e',
                        borderRadius: '8px'
                      }}
                      labelStyle={{ color: '#fff' }}
                      itemStyle={{ color: '#fff' }}
                    />
                    <Legend 
                      wrapperStyle={{ color: '#fff' }}
                    />
                    <Bar 
                      dataKey="volume" 
                      fill="#8b5cf6"
                      name="Volume ($)"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar 
                      dataKey="trades" 
                      fill="#06b6d4"
                      name="Number of Trades"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Trade Status Distribution Chart */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="bg-[#111] border-[#1e1e1e]">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-white">Trade Status Distribution</CardTitle>
                  <p className="text-sm text-gray-500">Breakdown of trade statuses</p>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={chartData.tradeStatus}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ status, count, percent }) => `${status}: ${count} (${(percent * 100).toFixed(0)}%)`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="count"
                      >
                        {chartData.tradeStatus.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#111', 
                          border: '1px solid #1e1e1e',
                          borderRadius: '8px'
                        }}
                        labelStyle={{ color: '#fff' }}
                        itemStyle={{ color: '#fff' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Trading Stats Cards */}
              <div className="space-y-4">
                <Card className="bg-[#111] border-[#1e1e1e]">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-400">Trading Volume</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-white">{formatCurrency(analytics.totalVolume)}</div>
                    <p className="text-xs text-gray-500 mt-1">Total trading volume</p>
                  </CardContent>
                </Card>
                <Card className="bg-[#111] border-[#1e1e1e]">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-400">Pending Orders</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-white">{formatNumber(analytics.pendingTrades)}</div>
                    <p className="text-xs text-gray-500 mt-1">Awaiting approval</p>
                  </CardContent>
                </Card>
                <Card className="bg-[#111] border-[#1e1e1e]">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-400">Completion Rate</CardTitle>
                  </CardHeader>
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
            {/* Deposit/Withdrawal Flow Chart */}
            <Card className="bg-[#111] border-[#1e1e1e]">
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-white">Deposit & Withdrawal Flow</CardTitle>
                <p className="text-sm text-gray-500">Daily deposits and withdrawals comparison</p>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={chartData.depositWithdrawal}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
                    <XAxis 
                      dataKey="date" 
                      stroke="#6b7280"
                      fontSize={12}
                    />
                    <YAxis 
                      stroke="#6b7280"
                      fontSize={12}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#111', 
                        border: '1px solid #1e1e1e',
                        borderRadius: '8px'
                      }}
                      labelStyle={{ color: '#fff' }}
                      itemStyle={{ color: '#fff' }}
                    />
                    <Legend 
                      wrapperStyle={{ color: '#fff' }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="deposits" 
                      stackId="1"
                      stroke="#10b981" 
                      fill="#10b981"
                      fillOpacity={0.6}
                      name="Deposits ($)"
                    />
                    <Area 
                      type="monotone" 
                      dataKey="withdrawals" 
                      stackId="2"
                      stroke="#ef4444" 
                      fill="#ef4444"
                      fillOpacity={0.6}
                      name="Withdrawals ($)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Finance Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-[#111] border-[#1e1e1e]">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-400">Net Flow</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={`text-3xl font-bold ${analytics.totalDeposits - analytics.totalWithdrawals >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {formatCurrency(analytics.totalDeposits - analytics.totalWithdrawals)}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Deposits minus withdrawals</p>
                </CardContent>
              </Card>
              <Card className="bg-[#111] border-[#1e1e1e]">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-400">Pending Deposits</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-white">{analytics.pendingDeposits}</div>
                  <p className="text-xs text-gray-500 mt-1">Awaiting confirmation</p>
                </CardContent>
              </Card>
              <Card className="bg-[#111] border-[#1e1e1e]">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-400">Pending Withdrawals</CardTitle>
                </CardHeader>
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
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-400">Total Tickets</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-white">{formatNumber(analytics.supportTickets)}</div>
                  <p className="text-xs text-gray-500 mt-1">All support conversations</p>
                </CardContent>
              </Card>
              <Card className="bg-[#111] border-[#1e1e1e]">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-400">Open Tickets</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-orange-400">{formatNumber(analytics.openTickets)}</div>
                  <p className="text-xs text-gray-500 mt-1">Need attention</p>
                </CardContent>
              </Card>
              <Card className="bg-[#111] border-[#1e1e1e]">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-400">Resolution Rate</CardTitle>
                </CardHeader>
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
                <XAxis 
                  dataKey="date" 
                  stroke="#6b7280"
                  fontSize={12}
                />
                <YAxis 
                  stroke="#6b7280"
                  fontSize={12}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#111', 
                    border: '1px solid #1e1e1e',
                    borderRadius: '8px'
                  }}
                  labelStyle={{ color: '#fff' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Legend 
                  wrapperStyle={{ color: '#fff' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="users" 
                  stroke="#3b82f6" 
                  fill="#3b82f6"
                  fillOpacity={0.3}
                  name="Total Users"
                />
                <Area 
                  type="monotone" 
                  dataKey="volume" 
                  stroke="#8b5cf6" 
                  fill="#8b5cf6"
                  fillOpacity={0.3}
                  name="Trading Volume ($)"
                />
                <Area 
                  type="monotone" 
                  dataKey="deposits" 
                  stroke="#10b981" 
                  fill="#10b981"
                  fillOpacity={0.3}
                  name="Total Deposits ($)"
                />
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
                      {analytics.totalUsers > 0 ? formatCurrency(analytics.totalDeposits / analytics.totalUsers) : formatCurrency(0)}
                    </p>
                  </div>
                  <div className="bg-[#111]/50 rounded-lg p-3 border border-[#1e1e1e]">
                    <p className="text-xs text-gray-500">Trades per User</p>
                    <p className="text-lg font-semibold text-white">
                      {analytics.totalUsers > 0 ? (analytics.totalTrades / analytics.totalUsers).toFixed(2) : '0.00'}
                    </p>
                  </div>
                  <div className="bg-[#111]/50 rounded-lg p-3 border border-[#1e1e1e]">
                    <p className="text-xs text-gray-500">Support Load</p>
                    <p className="text-lg font-semibold text-white">
                      {analytics.totalUsers > 0 ? (analytics.supportTickets / analytics.totalUsers).toFixed(2) : '0.00'}
                    </p>
                    <p className="text-xs text-gray-500">tickets per user</p>
                  </div>
                  <div className="bg-[#111]/50 rounded-lg p-3 border border-[#1e1e1e]">
                    <p className="text-xs text-gray-500">Platform Health</p>
                    <p className="text-lg font-semibold text-green-400">Good</p>
                    <p className="text-xs text-gray-500">All systems operational</p>
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
