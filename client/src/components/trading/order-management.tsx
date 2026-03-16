import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { useUserDataSync } from "@/hooks/use-data-sync";
import { Clock, CheckCircle, XCircle, AlertCircle, TrendingUp, TrendingDown, Info, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { CryptoIcon } from "@/components/crypto/crypto-icon";
import { cryptoApi } from "@/services/crypto-api";
import { formatCryptoNumber, formatPrice as formatPriceUtil } from "@/utils/format-utils";
import { StatusBadge } from "@/components/ui/status-badge";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { exportToCSV } from "@/utils/csv-export";
import type { Trade } from "@/types/crypto";

interface OrderManagementProps {
  className?: string;
}

const PAGE_SIZES = [10, 25, 50];

export function OrderManagement({ className = "" }: OrderManagementProps) {
  const [activeTab, setActiveTab] = useState<"current" | "history">("current");
  const [userId, setUserId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Trade | null>(null);
  const [selectedOrderNumber, setSelectedOrderNumber] = useState<number>(0);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sideFilter, setSideFilter] = useState<string>("all");
  const [pairFilter, setPairFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<{ from: Date | null; to: Date | null }>({ from: null, to: null });
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");

  // Pagination
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserId(user.id);
    };
    getCurrentUser();
  }, []);

  useUserDataSync(userId || '', { enabled: !!userId });

  const { data: allOrders } = useQuery({
    queryKey: ["/api/trades", userId, "all"],
    queryFn: () => userId ? cryptoApi.getTrades(userId) : Promise.resolve([]),
    enabled: !!userId,
    refetchInterval: 10000,
  });

  const { data: currentOrders, isLoading: currentLoading } = useQuery({
    queryKey: ["/api/trades", userId, "current"],
    queryFn: () => userId ? cryptoApi.getTrades(userId) : Promise.resolve([]),
    select: (trades: Trade[]) => trades.filter(trade =>
      trade.status === "pending" || trade.status === "pending_approval"
    ),
    enabled: !!userId,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });

  const { data: orderHistory, isLoading: historyLoading } = useQuery({
    queryKey: ["/api/trades", userId, "history"],
    queryFn: () => userId ? cryptoApi.getTrades(userId) : Promise.resolve([]),
    select: (trades: Trade[]) => trades.filter(trade =>
      trade.status !== "pending" && trade.status !== "pending_approval"
    ),
    enabled: !!userId,
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
  });

  // Get unique pairs from orders
  const availablePairs = useMemo(() => {
    const orders = activeTab === "current" ? currentOrders : orderHistory;
    if (!orders) return [];
    const pairs = new Set(orders.map(o => o.symbol));
    return Array.from(pairs).sort();
  }, [currentOrders, orderHistory, activeTab]);

  // Apply filters
  const filteredOrders = useMemo(() => {
    const orders = activeTab === "current" ? currentOrders : orderHistory;
    if (!orders) return [];

    let filtered = [...orders];

    if (statusFilter !== "all") {
      filtered = filtered.filter(o => o.status === statusFilter);
    }
    if (sideFilter !== "all") {
      filtered = filtered.filter(o => o.side === sideFilter);
    }
    if (pairFilter !== "all") {
      filtered = filtered.filter(o => o.symbol === pairFilter);
    }
    if (dateRange.from) {
      filtered = filtered.filter(o => {
        const d = new Date((o as any).created_at || o.createdAt);
        return d >= dateRange.from!;
      });
    }
    if (dateRange.to) {
      const endOfDay = new Date(dateRange.to);
      endOfDay.setHours(23, 59, 59, 999);
      filtered = filtered.filter(o => {
        const d = new Date((o as any).created_at || o.createdAt);
        return d <= endOfDay;
      });
    }

    filtered.sort((a, b) => {
      const da = new Date((a as any).created_at || a.createdAt).getTime();
      const db = new Date((b as any).created_at || b.createdAt).getTime();
      return sortOrder === "newest" ? db - da : da - db;
    });

    return filtered;
  }, [currentOrders, orderHistory, activeTab, statusFilter, sideFilter, pairFilter, dateRange, sortOrder]);

  // Paginated results
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pageSize));
  const paginatedOrders = filteredOrders.slice(page * pageSize, (page + 1) * pageSize);

  // Reset page when filters change
  useEffect(() => { setPage(0); }, [activeTab, statusFilter, sideFilter, pairFilter, dateRange, sortOrder, pageSize]);

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
      window.location.reload();
    } catch (error) {
      console.error('Error cancelling order:', error);
    }
  };

  const handleExportCSV = () => {
    if (filteredOrders.length === 0) return;
    const csvData = filteredOrders.map(o => ({
      date: formatDate((o as any).created_at || o.createdAt),
      pair: o.symbol,
      side: o.side,
      type: (o as any).order_type || "limit",
      amount: o.amount,
      price: o.price || "Market",
      fee: (o as any).fee_amount || "0",
      status: o.status,
    }));
    exportToCSV(csvData, `orders_${activeTab}`, [
      { key: "date", label: "Date" },
      { key: "pair", label: "Pair" },
      { key: "side", label: "Side" },
      { key: "type", label: "Type" },
      { key: "amount", label: "Amount" },
      { key: "price", label: "Price" },
      { key: "fee", label: "Fee" },
      { key: "status", label: "Status" },
    ]);
  };

  const getSideIcon = (side: string) => {
    return side === "buy" || side === "long" ? (
      <TrendingUp size={14} className="text-green-500" />
    ) : (
      <TrendingDown size={14} className="text-red-500" />
    );
  };

  const renderOrderList = (orders: Trade[], isLoading: boolean, emptyMessage: string) => {
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

    if (orders.length === 0) {
      return (
        <div className="text-center py-10">
          <div className="w-12 h-12 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl mx-auto mb-3 flex items-center justify-center">
            <AlertCircle size={20} className="text-gray-600" />
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
      <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1 custom-scrollbar">
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
                <StatusBadge status={order.status} size="sm" />
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
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              disabled={filteredOrders.length === 0}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] text-gray-400 hover:text-white bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#3a3a3a] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title="Export to CSV"
            >
              <Download size={10} />
              CSV
            </button>
          </div>
        </div>

        {/* Tabs */}
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
            {currentOrders && currentOrders.length > 0 && (
              <span className="ml-1.5 text-[10px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded-full">{currentOrders.length}</span>
            )}
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

        {/* Filters Row */}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <DateRangePicker value={dateRange} onChange={setDateRange} />

          {/* Side Filter */}
          <select
            value={sideFilter}
            onChange={e => setSideFilter(e.target.value)}
            className="px-2 py-1.5 rounded-lg text-xs bg-[#111] border border-[#1e1e1e] text-gray-400 hover:text-gray-300 hover:border-[#2a2a2a] transition-colors focus:outline-none appearance-none cursor-pointer"
          >
            <option value="all">All Sides</option>
            <option value="buy">Buy</option>
            <option value="sell">Sell</option>
          </select>

          {/* Pair Filter */}
          {availablePairs.length > 1 && (
            <select
              value={pairFilter}
              onChange={e => setPairFilter(e.target.value)}
              className="px-2 py-1.5 rounded-lg text-xs bg-[#111] border border-[#1e1e1e] text-gray-400 hover:text-gray-300 hover:border-[#2a2a2a] transition-colors focus:outline-none appearance-none cursor-pointer"
            >
              <option value="all">All Pairs</option>
              {availablePairs.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          )}

          {/* Status Filter (history tab only) */}
          {activeTab === "history" && (
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="px-2 py-1.5 rounded-lg text-xs bg-[#111] border border-[#1e1e1e] text-gray-400 hover:text-gray-300 hover:border-[#2a2a2a] transition-colors focus:outline-none appearance-none cursor-pointer"
            >
              <option value="all">All Status</option>
              <option value="executed">Executed</option>
              <option value="filled">Filled</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="cancelled">Cancelled</option>
            </select>
          )}

          {/* Sort */}
          <button
            onClick={() => setSortOrder(s => s === "newest" ? "oldest" : "newest")}
            className="px-2 py-1.5 rounded-lg text-xs bg-[#111] border border-[#1e1e1e] text-gray-400 hover:text-gray-300 hover:border-[#2a2a2a] transition-colors"
          >
            {sortOrder === "newest" ? "Newest" : "Oldest"}
          </button>
        </div>
      </div>

      {/* Order List */}
      <div className="px-4 pb-2">
        {renderOrderList(paginatedOrders, activeTab === "current" ? currentLoading : historyLoading, activeTab === "current" ? "No current orders found" : "No order history found")}
      </div>

      {/* Pagination */}
      {filteredOrders.length > 0 && (
        <div className="flex items-center justify-between px-4 pb-3 pt-1 border-t border-[#1e1e1e]">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-600">{filteredOrders.length} total</span>
            <select
              value={pageSize}
              onChange={e => setPageSize(Number(e.target.value))}
              className="px-1.5 py-0.5 rounded text-[10px] bg-[#0a0a0a] border border-[#1e1e1e] text-gray-500 focus:outline-none"
            >
              {PAGE_SIZES.map(s => <option key={s} value={s}>{s}/page</option>)}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-1 rounded hover:bg-[#1a1a1a] disabled:opacity-30 transition-colors"
            >
              <ChevronLeft size={14} className="text-gray-400" />
            </button>
            <span className="text-[10px] text-gray-500 px-2">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="p-1 rounded hover:bg-[#1a1a1a] disabled:opacity-30 transition-colors"
            >
              <ChevronRight size={14} className="text-gray-400" />
            </button>
          </div>
        </div>
      )}

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
                <StatusBadge status={selectedOrder.status} size="md" />
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
                      {selectedOrder.price && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-400">Trade Value</span>
                          <span className="text-xs text-white tabular-nums">
                            {formatCryptoNumber(parseFloat(selectedOrder.amount) * parseFloat(selectedOrder.price))} USDT
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-400">
                          Trading Fee {(selectedOrder as any).fee_rate ? `(${(parseFloat((selectedOrder as any).fee_rate) * 100).toFixed(2)}%)` : ''}
                        </span>
                        <span className="text-xs text-amber-400 tabular-nums">
                          {formatFee(selectedOrder) ? `-${formatFee(selectedOrder)}` : '$0.00'}
                        </span>
                      </div>
                      <div className="border-t border-[#1e1e1e] my-1" />
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
