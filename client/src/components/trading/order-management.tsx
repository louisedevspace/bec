import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { useUserDataSync } from "@/hooks/use-data-sync";
import { Badge } from "@/components/ui/badge";
import { Clock, CheckCircle, XCircle, AlertCircle, TrendingUp, TrendingDown, Info } from "lucide-react";
import { CryptoIcon } from "@/components/crypto/crypto-icon";
import { cryptoApi } from "@/services/crypto-api";
import { formatCryptoNumber, formatPrice as formatPriceUtil } from "@/utils/format-utils";
import type { Trade } from "@/types/crypto";

interface OrderManagementProps {
  className?: string;
}

export function OrderManagement({ className = "" }: OrderManagementProps) {
  const [activeTab, setActiveTab] = useState<"current" | "history">("current");
  const [userId, setUserId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Trade | null>(null);
  const [selectedOrderNumber, setSelectedOrderNumber] = useState<number>(0);

  // Get current user ID
  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
      }
    };
    getCurrentUser();
  }, []);

  // Use the comprehensive data sync hook
  useUserDataSync(userId || '', {
    enabled: !!userId
  });

  // Fetch all trades (for per-user numbering)
  const { data: allOrders } = useQuery({
    queryKey: ["/api/trades", userId, "all"],
    queryFn: () => userId ? cryptoApi.getTrades(userId) : Promise.resolve([]),
    enabled: !!userId,
    refetchInterval: 10000,
  });

  // Fetch current orders (pending and pending_approval status)
  const { data: currentOrders, isLoading: currentLoading } = useQuery({
    queryKey: ["/api/trades", userId, "current"],
    queryFn: () => userId ? cryptoApi.getTrades(userId) : Promise.resolve([]),
    select: (trades: Trade[]) => trades.filter(trade => 
      trade.status === "pending" || trade.status === "pending_approval"
    ),
    enabled: !!userId,
    refetchInterval: 5000, // Refresh every 5 seconds for current orders
    refetchOnWindowFocus: true, // Refresh when user returns to the tab
  });

  // Fetch order history (completed/cancelled/approved/rejected status)
  const { data: orderHistory, isLoading: historyLoading } = useQuery({
    queryKey: ["/api/trades", userId, "history"],
    queryFn: () => userId ? cryptoApi.getTrades(userId) : Promise.resolve([]),
    select: (trades: Trade[]) => trades.filter(trade => 
      trade.status !== "pending" && trade.status !== "pending_approval"
    ),
    enabled: !!userId,
    refetchInterval: 10000, // Refresh every 10 seconds to ensure synchronization
    refetchOnWindowFocus: true, // Refresh when user returns to the tab
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-yellow-500/20 text-yellow-500";
      case "pending_approval":
        return "bg-orange-500/20 text-orange-500";
      case "approved":
        return "bg-blue-500/20 text-blue-500";
      case "rejected":
        return "bg-red-500/20 text-red-500";
      case "filled":
        return "bg-green-500/20 text-green-500";
      case "executed":
        return "bg-green-500/20 text-green-500";
      case "cancelled":
        return "bg-red-500/20 text-red-500";
      default:
        return "bg-gray-500/20 text-gray-500";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending":
        return <Clock size={14} />;
      case "pending_approval":
        return <Clock size={14} />;
      case "approved":
        return <CheckCircle size={14} />;
      case "rejected":
        return <XCircle size={14} />;
      case "filled":
        return <CheckCircle size={14} />;
      case "executed":
        return <CheckCircle size={14} />;
      case "cancelled":
        return <XCircle size={14} />;
      default:
        return <AlertCircle size={14} />;
    }
  };

  const getSideIcon = (side: string) => {
    return side === "buy" || side === "long" ? (
      <TrendingUp size={14} className="text-green-500" />
    ) : (
      <TrendingDown size={14} className="text-red-500" />
    );
  };

  // Compute per-user order number (allOrders is sorted by created_at desc, so last = #1)
  const getOrderNumber = (order: Trade): number => {
    if (!allOrders || allOrders.length === 0) return order.id;
    const idx = allOrders.findIndex(o => o.id === order.id);
    if (idx === -1) return order.id;
    return allOrders.length - idx;
  };

  const handleSelectOrder = (order: Trade) => {
    setSelectedOrder(order);
    setSelectedOrderNumber(getOrderNumber(order));
  };

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return 'N/A';
    try {
      let date: Date;
      // Normalize timezone-less strings as UTC
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

  const formatAmount = (amount: string, symbol: string) => {
    const num = parseFloat(amount);
    const baseSymbol = symbol.split("/")[0];
    return `${formatCryptoNumber(num)} ${baseSymbol}`;
  };

  const formatPrice = (price: string | undefined) => {
    if (!price) return "Market";
    return formatPriceUtil(price);
  };

  const formatFee = (order: Trade) => {
    const feeAmount = parseFloat((order as any).fee_amount || '0');
    if (!feeAmount || feeAmount <= 0) return null;
    const feeSymbol = (order as any).fee_symbol || 'USDT';
    return `${formatCryptoNumber(feeAmount)} ${feeSymbol}`;
  };

  const getTradeTotal = (order: Trade) => {
    const amount = parseFloat(order.amount || '0');
    const price = parseFloat(order.price || '0');
    if (!amount || !price) return null;
    const total = amount * price;
    const feeAmount = parseFloat((order as any).fee_amount || '0');
    if (order.side === 'buy' && feeAmount > 0) {
      return `${formatCryptoNumber(total + feeAmount)} USDT`;
    } else if (order.side === 'sell' && feeAmount > 0) {
      return `${formatCryptoNumber(total - feeAmount)} USDT`;
    }
    return `${formatCryptoNumber(total)} USDT`;
  };

  const handleCancelOrder = async (orderId: number) => {
    try {
      await cryptoApi.cancelTrade(orderId);
      // Refresh the queries to update the UI
      window.location.reload(); // Simple refresh for demo
    } catch (error) {
      console.error('Error cancelling order:', error);
    }
  };

  const renderOrderList = (orders: Trade[] | undefined, isLoading: boolean, emptyMessage: string) => {
    if (isLoading) {
      return (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-[#0a0a0a] rounded-xl p-4 border border-[#1e1e1e] animate-pulse">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <div className="h-4 w-28 bg-[#1a1a1a] rounded" />
                  <div className="h-3 w-20 bg-[#1a1a1a] rounded" />
                </div>
                <div className="h-5 w-16 bg-[#1a1a1a] rounded-full" />
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (!orders || orders.length === 0) {
      return (
        <div className="text-center py-10">
          <div className="w-12 h-12 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl mx-auto mb-3 flex items-center justify-center">
            <span className="text-lg">📊</span>
          </div>
          <p className="text-gray-400 text-sm">{emptyMessage}</p>
          <p className="text-gray-600 text-xs mt-1">
            {activeTab === "current" 
              ? "Your orders awaiting admin approval will appear here" 
              : "Your completed and processed orders will appear here"
            }
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-2 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
        {orders.map((order) => (
          <div key={order.id} className="bg-[#0a0a0a] rounded-xl p-3 border border-[#1e1e1e] hover:border-[#2a2a2a] transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                  order.side === "buy" || order.side === "long"
                    ? "bg-green-500/10"
                    : "bg-red-500/10"
                }`}>
                  {getSideIcon(order.side)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <CryptoIcon symbol={order.symbol?.split('/')[0] || order.symbol} size="xs" />
                    <span className="text-white font-medium text-sm">{order.symbol}</span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                      order.side === "buy" || order.side === "long"
                        ? "bg-green-500/10 text-green-400"
                        : "bg-red-500/10 text-red-400"
                    }`}>
                      {order.side.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-[11px] text-gray-500 mt-0.5">
                    {formatAmount(order.amount, order.symbol)} @ {formatPrice(order.price)}
                  </div>
                  {/* Fee info for executed/completed trades */}
                  {(order.status === "executed" || order.status === "filled") && formatFee(order) && (
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-amber-400/80">
                        Fee: {formatFee(order)}
                      </span>
                      {getTradeTotal(order) && (
                        <span className="text-[10px] text-gray-500">
                          {order.side === "buy" ? "Total paid" : "Net received"}: {getTradeTotal(order)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="text-right mr-1">
                  <div className="text-[10px] text-gray-600">{formatDate((order as any).created_at || order.createdAt)}</div>
                </div>
                <div className="flex items-center gap-1">
                  {getStatusIcon(order.status)}
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${getStatusColor(order.status)}`}>
                    {order.status.toUpperCase().replace('_', ' ')}
                  </span>
                </div>
                <button
                  onClick={() => handleSelectOrder(order)}
                  className="p-1 rounded-lg hover:bg-[#222] transition-colors"
                  title="Trade details"
                >
                  <Info className="h-3.5 w-3.5 text-gray-500" />
                </button>
                {activeTab === "current" && order.status === "pending_approval" && (
                  <button
                    onClick={() => handleCancelOrder(order.id)}
                    className="text-red-400 hover:text-red-300 text-[11px] font-medium px-2 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 transition-colors"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className={`bg-[#111] rounded-2xl border border-[#1e1e1e] ${className}`}>
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white">Order Management</h3>
        </div>
        <div className="flex gap-1 bg-[#0a0a0a] rounded-xl p-1 border border-[#1e1e1e]">
          <button
            onClick={() => setActiveTab("current")}
            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
              activeTab === "current"
                ? "bg-[#1a1a1a] text-white shadow-sm border border-[#2a2a2a]"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            Current Orders
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
              activeTab === "history"
                ? "bg-[#1a1a1a] text-white shadow-sm border border-[#2a2a2a]"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            Order History
          </button>
        </div>
      </div>
      <div className="px-4 pb-4">
        {activeTab === "current"
          ? renderOrderList(currentOrders, currentLoading, "No current orders found")
          : renderOrderList(orderHistory, historyLoading, "No order history found")
        }
      </div>

      {/* Trade Details Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#111] border border-[#2a2a2a] rounded-2xl p-5 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-base font-semibold text-white">Trade Details</h3>
              <button
                onClick={() => setSelectedOrder(null)}
                className="h-7 w-7 flex items-center justify-center rounded-lg bg-[#1e1e1e] hover:bg-[#2a2a2a] text-gray-400 transition-colors text-lg"
              >
                ×
              </button>
            </div>

            <div className="space-y-3">
              {/* Trade Header */}
              <div className="flex items-center gap-3 bg-[#0a0a0a] rounded-xl p-3 border border-[#1e1e1e]">
                <CryptoIcon symbol={selectedOrder.symbol?.split('/')[0] || selectedOrder.symbol} size="sm" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-semibold text-sm">{selectedOrder.symbol}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                      selectedOrder.side === 'buy' || selectedOrder.side === 'long' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                    }`}>
                      {selectedOrder.side.toUpperCase()}
                    </span>
                  </div>
                  <span className="text-[10px] text-gray-500">Order #{selectedOrderNumber}</span>
                </div>
                <div className={`text-xs font-medium px-2 py-1 rounded ${getStatusColor(selectedOrder.status)}`}>
                  {selectedOrder.status.toUpperCase().replace('_', ' ')}
                </div>
              </div>

              {/* Timestamp */}
              <div className="bg-[#0a0a0a] rounded-xl p-3 border border-[#1e1e1e]">
                <label className="text-[10px] text-gray-500 uppercase tracking-wider">Time Placed</label>
                <div className="text-white text-xs mt-0.5">
                  {formatDate((selectedOrder as any).created_at || selectedOrder.createdAt)}
                </div>
              </div>

              {/* Trade Parameters */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#0a0a0a] rounded-xl p-3 border border-[#1e1e1e]">
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider">Amount</label>
                  <div className="text-white font-semibold text-sm mt-0.5 tabular-nums">
                    {formatAmount(selectedOrder.amount, selectedOrder.symbol)}
                  </div>
                </div>
                <div className="bg-[#0a0a0a] rounded-xl p-3 border border-[#1e1e1e]">
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider">Price</label>
                  <div className="text-white font-semibold text-sm mt-0.5 tabular-nums">
                    {formatPrice(selectedOrder.price)}
                  </div>
                </div>
              </div>

              {/* Cost / Value */}
              {selectedOrder.price && (
                <div className="bg-[#0a0a0a] rounded-xl p-3 border border-[#1e1e1e]">
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider">Trade Value</label>
                  <div className="text-white font-medium text-sm mt-0.5 tabular-nums">
                    {formatCryptoNumber(parseFloat(selectedOrder.amount) * parseFloat(selectedOrder.price))} USDT
                  </div>
                </div>
              )}

              {/* Fee & Total Breakdown for executed trades */}
              {(selectedOrder.status === "executed" || selectedOrder.status === "filled") && (
                <>
                  <div className="border-t border-[#1e1e1e] my-2" />
                  <div className="bg-[#0a0a0a] rounded-xl border border-[#1e1e1e] overflow-hidden">
                    <div className="px-3 py-2 border-b border-[#1e1e1e]">
                      <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Fee Breakdown</span>
                    </div>
                    <div className="p-3 space-y-2">
                      {/* Trade Value */}
                      {selectedOrder.price && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-400">Trade Value</span>
                          <span className="text-xs text-white tabular-nums">
                            {formatCryptoNumber(parseFloat(selectedOrder.amount) * parseFloat(selectedOrder.price))} USDT
                          </span>
                        </div>
                      )}

                      {/* Fee */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-400">
                          Trading Fee {(selectedOrder as any).fee_rate ? `(${(parseFloat((selectedOrder as any).fee_rate) * 100).toFixed(2)}%)` : ''}
                        </span>
                        <span className="text-xs text-amber-400 tabular-nums">
                          {formatFee(selectedOrder) ? `-${formatFee(selectedOrder)}` : '$0.00'}
                        </span>
                      </div>

                      <div className="border-t border-[#1e1e1e] my-1" />

                      {/* Total */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-400 font-semibold">
                          {selectedOrder.side === 'buy' ? 'Total Paid' : 'Net Received'}
                        </span>
                        <span className="text-sm text-white font-bold tabular-nums">
                          {getTradeTotal(selectedOrder) || 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Pending status info */}
              {(selectedOrder.status === "pending" || selectedOrder.status === "pending_approval") && (
                <div className="bg-yellow-500/5 rounded-xl p-3 border border-yellow-500/10">
                  <div className="text-xs text-yellow-400">
                    This order is awaiting admin approval. Fees will be applied when the trade is executed.
                  </div>
                </div>
              )}
            </div>

            <div className="mt-5">
              <button
                onClick={() => setSelectedOrder(null)}
                className="w-full bg-[#1e1e1e] hover:bg-[#2a2a2a] text-white rounded-xl py-2.5 text-sm border border-[#2a2a2a] transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 