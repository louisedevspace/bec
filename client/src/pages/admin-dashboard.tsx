import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle, XCircle, Clock, TrendingUp, TrendingDown, Users, Activity, BarChart3, UserCheck } from "lucide-react";
import { cryptoApi } from "@/services/crypto-api";
import { useToast } from "@/hooks/use-toast";
import type { Trade, UserDetails } from "@/types/crypto";
import AdminLayout from './admin-layout';
import { supabase } from "@/lib/supabaseClient";

interface PendingOrder extends Trade {
  id: number;
  userId: string;
  symbol: string;
  side: 'buy' | 'sell' | 'long' | 'short';
  amount: string;
  price?: string;
  status: 'pending_approval';
  createdAt: string;
  userDetails?: UserDetails;
}

interface AdminStats {
  total: number;
  newSignups: number;
  active: number;
}

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState("overview");
  const [stats, setStats] = useState<AdminStats>({ total: 0, newSignups: 0, active: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch admin stats
  useEffect(() => {
    async function fetchStats() {
      setLoading(true);
      setError(null);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        
        if (!token) {
          throw new Error('No authentication token available');
        }

        const res = await fetch('/api/admin/stats', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        
        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.message || 'Failed to fetch stats');
        }
        
        const stats = await res.json();
        setStats(stats);
      } catch (err: any) {
        setError(err.message || 'Failed to fetch stats');
        console.error('Error fetching admin stats:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
    
    // Refresh stats every 30 seconds
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  // Fetch pending orders
  const { data: pendingOrders, isLoading: ordersLoading } = useQuery({
    queryKey: ["/api/admin/pending-orders"],
    queryFn: () => cryptoApi.getPendingOrders(),
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  // Fetch all orders for history
  const { data: allOrders } = useQuery({
    queryKey: ["/api/admin/all-orders"],
    queryFn: () => cryptoApi.getAllOrders(),
  });

  // Approve order mutation
  const approveMutation = useMutation({
    mutationFn: (orderId: number) => cryptoApi.approveOrder(orderId),
    onSuccess: () => {
      toast({
        title: "Order Approved",
        description: "The order has been approved and executed.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/all-orders"] });
    },
    onError: () => {
      toast({
        title: "Approval Failed",
        description: "Failed to approve the order. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Reject order mutation
  const rejectMutation = useMutation({
    mutationFn: (orderId: number) => cryptoApi.rejectOrder(orderId),
    onSuccess: () => {
      toast({
        title: "Order Rejected",
        description: "The order has been rejected.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/all-orders"] });
    },
    onError: () => {
      toast({
        title: "Rejection Failed",
        description: "Failed to reject the order. Please try again.",
        variant: "destructive",
      });
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending_approval":
        return "bg-yellow-500/20 text-yellow-500";
      case "approved":
        return "bg-green-500/20 text-green-500";
      case "rejected":
        return "bg-red-500/20 text-red-500";
      case "executed":
        return "bg-blue-500/20 text-blue-500";
      default:
        return "bg-gray-500/20 text-gray-500";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending_approval":
        return <Clock size={14} />;
      case "approved":
        return <CheckCircle size={14} />;
      case "rejected":
        return <XCircle size={14} />;
      case "executed":
        return <CheckCircle size={14} />;
      default:
        return <Clock size={14} />;
    }
  };

  const getSideIcon = (side: string) => {
    return side === "buy" || side === "long" ? (
      <TrendingUp size={14} className="text-green-500" />
    ) : (
      <TrendingDown size={14} className="text-red-500" />
    );
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString();
    } catch (error) {
      return 'Invalid Date';
    }
  };

  const formatAmount = (amount: string, symbol: string) => {
    const num = parseFloat(amount);
    const baseSymbol = symbol.split("/")[0];
    
    if (num >= 1000) {
      return `${num.toLocaleString()} ${baseSymbol}`;
    } else if (num >= 1) {
      return `${num.toFixed(4)} ${baseSymbol}`;
    } else {
      return `${num.toFixed(8)} ${baseSymbol}`;
    }
  };

  const formatPrice = (price: string | undefined) => {
    if (!price) return "Market";
    const num = parseFloat(price);
    return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  };

  const handleApprove = (orderId: number) => {
    approveMutation.mutate(orderId);
  };

  const handleReject = (orderId: number) => {
    rejectMutation.mutate(orderId);
  };

  const renderOrderList = (orders: Trade[] | undefined, showActions: boolean = false) => {
    if (!orders || orders.length === 0) {
      return (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-muted rounded-full mx-auto mb-4 flex items-center justify-center">
            <span className="text-2xl">📊</span>
          </div>
          <p className="text-muted-foreground">
            {showActions ? "No pending orders" : "No orders found"}
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {orders.map((order) => (
          <Card key={order.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Order Details */}
                <div className="lg:col-span-2">
                  <div className="flex items-center space-x-4 mb-4">
                    {getSideIcon(order.side)}
                    <div>
                      <div className="flex items-center space-x-2 mb-2">
                        <span className="font-semibold text-xl">{order.symbol}</span>
                        <Badge variant="outline" className="text-xs">
                          {order.side.toUpperCase()}
                        </Badge>
                        <Badge className={getStatusColor(order.status)}>
                          {getStatusIcon(order.status)}
                          <span className="ml-1">{order.status.replace('_', ' ').toUpperCase()}</span>
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground space-y-1">
                        <div><strong>Amount:</strong> {formatAmount(order.amount, order.symbol)}</div>
                        <div><strong>Price:</strong> {formatPrice(order.price)}</div>
                        <div><strong>Order ID:</strong> #{order.id}</div>
                        <div><strong>Created:</strong> {formatDate(order.createdAt)}</div>
                      </div>
                    </div>
                  </div>

                  {/* User Details */}
                  {order.userDetails && (
                    <div className="bg-[#0a0a0a] border border-[#1e1e1e] rounded-lg p-4">
                      <h4 className="font-semibold text-white mb-3 flex items-center">
                        <Users className="h-4 w-4 mr-2" />
                        User Information
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-300">
                        <div><strong>Name:</strong> {order.userDetails.fullName}</div>
                        <div><strong>Email:</strong> {order.userDetails.email}</div>
                        <div><strong>Phone:</strong> {order.userDetails.phone}</div>
                        <div><strong>User ID:</strong> {order.userDetails.id.substring(0, 8)}</div>
                        <div className="md:col-span-2">
          
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col justify-center space-y-3">
                  {showActions && order.status === "pending_approval" ? (
                    <>
                      <Button
                        onClick={() => handleApprove(order.id)}
                        disabled={approveMutation.isPending}
                        className="bg-green-600 hover:bg-green-700 text-white font-semibold py-3"
                        size="lg"
                      >
                        {approveMutation.isPending ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                            Approving...
                          </>
                        ) : (
                          <>
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Approve Order
                          </>
                        )}
                      </Button>
                      <Button
                        onClick={() => handleReject(order.id)}
                        disabled={rejectMutation.isPending}
                        variant="destructive"
                        className="font-semibold py-3"
                        size="lg"
                      >
                        {rejectMutation.isPending ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                            Rejecting...
                          </>
                        ) : (
                          <>
                            <XCircle className="h-4 w-4 mr-2" />
                            Reject Order
                          </>
                        )}
                      </Button>
                    </>
                  ) : (
                    <div className="text-center">
                      <Badge className={getStatusColor(order.status)}>
                        {getStatusIcon(order.status)}
                        <span className="ml-1">{order.status.replace('_', ' ').toUpperCase()}</span>
                      </Badge>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Monitor platform activity and manage trading orders</p>
        </div>

        {/* Stats Cards */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-5 animate-pulse">
                <div className="h-4 bg-[#1a1a1a] rounded w-24 mb-3" />
                <div className="h-8 bg-[#1a1a1a] rounded w-16" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 text-red-400 text-sm">{error}</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-5 hover:border-[#2a2a2a] transition-all">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-gray-400">Total Users</p>
                <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center">
                  <Users className="h-5 w-5 text-blue-400" />
                </div>
              </div>
              <p className="text-3xl font-bold text-white">{stats.total}</p>
              <p className="text-xs text-gray-500 mt-1">All registered users</p>
            </div>
            <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-5 hover:border-[#2a2a2a] transition-all">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-gray-400">New Signups</p>
                <div className="w-10 h-10 bg-green-500/10 rounded-xl flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-green-400" />
                </div>
              </div>
              <p className="text-3xl font-bold text-white">{stats.newSignups}</p>
              <p className="text-xs text-gray-500 mt-1">Last 7 days</p>
            </div>
            <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-5 hover:border-[#2a2a2a] transition-all">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-gray-400">Active Users</p>
                <div className="w-10 h-10 bg-purple-500/10 rounded-xl flex items-center justify-center">
                  <Activity className="h-5 w-5 text-purple-400" />
                </div>
              </div>
              <p className="text-3xl font-bold text-white">{stats.active}</p>
              <p className="text-xs text-gray-500 mt-1">Currently active</p>
            </div>
            <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-5 hover:border-[#2a2a2a] transition-all">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-gray-400">Pending Orders</p>
                <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center">
                  <Clock className="h-5 w-5 text-amber-400" />
                </div>
              </div>
              <p className="text-3xl font-bold text-white">{pendingOrders ? pendingOrders.length : 0}</p>
              <p className="text-xs text-gray-500 mt-1">Awaiting approval</p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-[#111] border border-[#1e1e1e] rounded-xl p-1 h-auto flex flex-wrap gap-1">
            <TabsTrigger value="overview" className="rounded-lg data-[state=active]:bg-blue-500/10 data-[state=active]:text-blue-400 text-gray-400 text-sm px-4 py-2">
              Overview
            </TabsTrigger>
            <TabsTrigger value="users" className="rounded-lg data-[state=active]:bg-blue-500/10 data-[state=active]:text-blue-400 text-gray-400 text-sm px-4 py-2">
              Users
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-4">
            {/* Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-6 hover:border-[#2a2a2a] transition-all">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center">
                    <Clock className="h-5 w-5 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">Pending Orders</h3>
                    <p className="text-xs text-gray-500">Orders waiting for your approval</p>
                  </div>
                </div>
                <p className="text-4xl font-bold text-white mb-4">{pendingOrders ? pendingOrders.length : 0}</p>
                <button 
                  onClick={() => setActiveTab('pending-orders')} 
                  className="w-full inline-flex items-center justify-center rounded-xl text-sm font-medium border border-blue-500/30 text-blue-400 bg-blue-500/5 hover:bg-blue-500/10 hover:border-blue-500/40 h-10 px-4 transition-colors"
                >
                  View Pending Orders
                </button>
              </div>
              <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-6 hover:border-[#2a2a2a] transition-all">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-green-500/10 rounded-xl flex items-center justify-center">
                    <BarChart3 className="h-5 w-5 text-green-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">Total Orders</h3>
                    <p className="text-xs text-gray-500">All platform trading orders</p>
                  </div>
                </div>
                <p className="text-4xl font-bold text-white mb-4">{allOrders ? allOrders.length : 0}</p>
                <button 
                  onClick={() => setActiveTab('order-history')} 
                  className="w-full inline-flex items-center justify-center rounded-xl text-sm font-medium border border-green-500/30 text-green-400 bg-green-500/5 hover:bg-green-500/10 hover:border-green-500/40 h-10 px-4 transition-colors"
                >
                  View All Orders
                </button>
              </div>
            </div>

            {/* Quick Link to User Management */}
            <div className="bg-gradient-to-r from-blue-600/20 to-indigo-600/20 border border-blue-500/20 rounded-2xl p-6 text-white">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold">User Management</h3>
                  <p className="text-blue-300 text-sm mt-1">View and manage all users, passwords, portfolios, and trading activity</p>
                </div>
                <a 
                  href="/admin/users" 
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-500 text-white rounded-xl font-semibold text-sm hover:bg-blue-600 transition-colors flex-shrink-0"
                >
                  <Users className="h-4 w-4" />
                  Manage Users
                </a>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="pending-orders" className="mt-4">
            <div className="bg-[#111] rounded-2xl border border-[#1e1e1e]">
              <div className="p-5 border-b border-[#1e1e1e]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-amber-500/10 rounded-lg flex items-center justify-center">
                    <Clock className="h-4 w-4 text-amber-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">Pending Approval</h3>
                    <p className="text-xs text-gray-500">{pendingOrders?.length || 0} orders waiting</p>
                  </div>
                </div>
              </div>
              <div className="p-5">
                {ordersLoading ? (
                  <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 mx-auto"></div>
                    <p className="mt-3 text-sm text-gray-500">Loading orders...</p>
                  </div>
                ) : (
                  renderOrderList(pendingOrders, true)
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="order-history" className="mt-4">
            <div className="bg-[#111] rounded-2xl border border-[#1e1e1e]">
              <div className="p-5 border-b border-[#1e1e1e]">
                <h3 className="font-semibold text-white">All Orders</h3>
                <p className="text-xs text-gray-500 mt-0.5">{allOrders?.length || 0} total orders</p>
              </div>
              <div className="p-5">
                {renderOrderList(allOrders)}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="users" className="mt-4">
            <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-8">
              <div className="text-center max-w-sm mx-auto">
                <div className="w-16 h-16 bg-blue-500/10 rounded-2xl mx-auto mb-4 flex items-center justify-center">
                  <UserCheck className="h-8 w-8 text-blue-400" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">User Management</h3>
                <p className="text-sm text-gray-400 mb-6">
                  View and manage all users, including passwords and authentication details.
                </p>
                <a 
                  href="/admin/users" 
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-500 text-white rounded-xl font-medium text-sm hover:bg-blue-600 transition-colors"
                >
                  <Users className="h-4 w-4" />
                  Go to User Management
                </a>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
} 