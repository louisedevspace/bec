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
      <TrendingUp size={14} className="text-buy" />
    ) : (
      <TrendingDown size={14} className="text-sell" />
    );
  };

  const renderOrderList = (orders: Trade[], isLoading: boolean, emptyMessage: string) => {
    if (isLoading) {
      return (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-muted/40 rounded-lg p-4 border border-border animate-pulse">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <div className="h-4 w-28 bg-muted rounded" />
                  <div className="h-3 w-20 bg-muted rounded" />
                </div>
                <div className="h-5 w-16 bg-muted rounded-full" />
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (orders.length === 0) {
      return (
        <div className="text-center py-10">
          <div className="w-12 h-12 bg-muted border border-border rounded-lg mx-auto mb-3 flex items-center justify-center">
            <AlertCircle size={20} className="text-muted-foreground" />
          </div>
          <p className="text-muted-foreground text-sm">{emptyMessage}</p>
          <p className="text-muted-foreground/70 text-xs mt-1">
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
          <div key={order.id} className="bg-muted/40 rounded-lg p-3 border border-border hover:border-foreground/20 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className={`w-7 h-7 rounded-md flex items-center justify-center ${
                  order.side === "buy" || order.side === "long"
                    ? "bg-buy/10"
                    : "bg-sell/10"
                }`}>
                  {getSideIcon(order.side)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <CryptoIcon symbol={order.symbol?.split('/')[0] || order.symbol} size="xs" />
                    <span className="text-foreground font-medium text-sm">{order.symbol}</span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                      order.side === "buy" || order.side === "long"
                        ? "bg-buy/10 text-buy"
                        : "bg-sell/10 text-sell"
                    }`}>
                      {order.side.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">
                    {formatAmount(order.amount, order.symbol)} @ {formatPrice(order.price)}
                  </div>
                  {(order.status === "executed" || order.status === "filled") && formatFee(order) && (
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-warning/80 tabular-nums">
                        Fee: {formatFee(order)}
                      </span>
                      {getTradeTotal(order) && (
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          {order.side === "buy" ? "Total paid" : "Net received"}: {getTradeTotal(order)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="text-right mr-1">
                  <div className="text-[10px] text-muted-foreground/70 tabular-nums">{formatDate((order as any).created_at || order.createdAt)}</div>
                </div>
                <StatusBadge status={order.status} size="sm" />
                <button
                  onClick={() => handleSelectOrder(order)}
                  className="p-1 rounded-md hover:bg-muted transition-colors"
                  title="Trade details"
                >
                  <Info className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
                {activeTab === "current" && order.status === "pending_approval" && (
                  <button
                    onClick={() => handleCancelOrder(order.id)}
                    className="text-sell hover:text-sell/80 text-[11px] font-medium px-2 py-1 rounded-md bg-sell/10 hover:bg-sell/20 transition-colors"
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
    <div className={`bg-card rounded-xl border border-border ${className}`}>
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">Order Management</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              disabled={filteredOrders.length === 0}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-muted-foreground hover:text-foreground bg-muted border border-border hover:border-foreground/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title="Export to CSV"
            >
              <Download size={10} />
              CSV
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-muted/40 rounded-lg p-1 border border-border">
          <button
            onClick={() => setActiveTab("current")}
            className={`flex-1 py-2 rounded-md text-xs font-medium transition-colors ${
              activeTab === "current"
                ? "bg-card text-foreground shadow-sm border border-border"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Current Orders
            {currentOrders && currentOrders.length > 0 && (
              <span className="ml-1.5 text-[10px] bg-warning/15 text-warning px-1.5 py-0.5 rounded-full">{currentOrders.length}</span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`flex-1 py-2 rounded-md text-xs font-medium transition-colors ${
              activeTab === "history"
                ? "bg-card text-foreground shadow-sm border border-border"
                : "text-muted-foreground hover:text-foreground"
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
            className="px-2 py-1.5 rounded-md text-xs bg-card border border-border text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors focus:outline-none appearance-none cursor-pointer"
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
              className="px-2 py-1.5 rounded-md text-xs bg-card border border-border text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors focus:outline-none appearance-none cursor-pointer"
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
              className="px-2 py-1.5 rounded-md text-xs bg-card border border-border text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors focus:outline-none appearance-none cursor-pointer"
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
            className="px-2 py-1.5 rounded-md text-xs bg-card border border-border text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors"
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
        <div className="flex items-center justify-between px-4 pb-3 pt-1 border-t border-border">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground/70">{filteredOrders.length} total</span>
            <select
              value={pageSize}
              onChange={e => setPageSize(Number(e.target.value))}
              className="px-1.5 py-0.5 rounded text-[10px] bg-background border border-border text-muted-foreground focus:outline-none"
            >
              {PAGE_SIZES.map(s => <option key={s} value={s}>{s}/page</option>)}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-1 rounded hover:bg-muted disabled:opacity-30 transition-colors"
            >
              <ChevronLeft size={14} className="text-muted-foreground" />
            </button>
            <span className="text-[10px] text-muted-foreground px-2 tabular-nums">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="p-1 rounded hover:bg-muted disabled:opacity-30 transition-colors"
            >
              <ChevronRight size={14} className="text-muted-foreground" />
            </button>
          </div>
        </div>
      )}

      {/* Trade Details Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-xl p-5 max-w-md w-full max-h-[90vh] overflow-y-auto shadow-sm">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-base font-semibold text-foreground">Trade Details</h3>
              <button
                onClick={() => setSelectedOrder(null)}
                className="h-7 w-7 flex items-center justify-center rounded-md bg-muted hover:bg-muted/70 text-muted-foreground transition-colors text-lg"
              >
                ×
              </button>
            </div>

            <div className="space-y-3">
              {/* Trade Header */}
              <div className="flex items-center gap-3 bg-muted/40 rounded-lg p-3 border border-border">
                <CryptoIcon symbol={selectedOrder.symbol?.split('/')[0] || selectedOrder.symbol} size="sm" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-foreground font-semibold text-sm">{selectedOrder.symbol}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                      selectedOrder.side === 'buy' || selectedOrder.side === 'long' ? 'bg-buy/10 text-buy' : 'bg-sell/10 text-sell'
                    }`}>
                      {selectedOrder.side.toUpperCase()}
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">Order #{selectedOrderNumber}</span>
                </div>
                <StatusBadge status={selectedOrder.status} size="md" />
              </div>

              {/* Timestamp */}
              <div className="bg-muted/40 rounded-lg p-3 border border-border">
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Time Placed</label>
                <div className="text-foreground text-xs mt-0.5">
                  {formatDate((selectedOrder as any).created_at || selectedOrder.createdAt)}
                </div>
              </div>

              {/* Trade Parameters */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted/40 rounded-lg p-3 border border-border">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Amount</label>
                  <div className="text-foreground font-semibold text-sm mt-0.5 tabular-nums">
                    {formatAmount(selectedOrder.amount, selectedOrder.symbol)}
                  </div>
                </div>
                <div className="bg-muted/40 rounded-lg p-3 border border-border">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Price</label>
                  <div className="text-foreground font-semibold text-sm mt-0.5 tabular-nums">
                    {formatPrice(selectedOrder.price)}
                  </div>
                </div>
              </div>

              {/* Cost / Value */}
              {selectedOrder.price && (
                <div className="bg-muted/40 rounded-lg p-3 border border-border">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Trade Value</label>
                  <div className="text-foreground font-medium text-sm mt-0.5 tabular-nums">
                    {formatCryptoNumber(parseFloat(selectedOrder.amount) * parseFloat(selectedOrder.price))} USDT
                  </div>
                </div>
              )}

              {/* Fee & Total Breakdown for executed trades */}
              {(selectedOrder.status === "executed" || selectedOrder.status === "filled") && (
                <>
                  <div className="border-t border-border my-2" />
                  <div className="bg-muted/40 rounded-lg border border-border overflow-hidden">
                    <div className="px-3 py-2 border-b border-border">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Fee Breakdown</span>
                    </div>
                    <div className="p-3 space-y-2">
                      {selectedOrder.price && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Trade Value</span>
                          <span className="text-xs text-foreground tabular-nums">
                            {formatCryptoNumber(parseFloat(selectedOrder.amount) * parseFloat(selectedOrder.price))} USDT
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          Trading Fee {(selectedOrder as any).fee_rate ? `(${(parseFloat((selectedOrder as any).fee_rate) * 100).toFixed(2)}%)` : ''}
                        </span>
                        <span className="text-xs text-warning tabular-nums">
                          {formatFee(selectedOrder) ? `-${formatFee(selectedOrder)}` : '$0.00'}
                        </span>
                      </div>
                      <div className="border-t border-border my-1" />
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground font-semibold">
                          {selectedOrder.side === 'buy' ? 'Total Paid' : 'Net Received'}
                        </span>
                        <span className="text-sm text-foreground font-bold tabular-nums">
                          {getTradeTotal(selectedOrder) || 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Pending status info */}
              {(selectedOrder.status === "pending" || selectedOrder.status === "pending_approval") && (
                <div className="bg-warning/5 rounded-lg p-3 border border-warning/10">
                  <div className="text-xs text-warning">
                    This order is awaiting admin approval. Fees will be applied when the trade is executed.
                  </div>
                </div>
              )}
            </div>

            <div className="mt-5">
              <button
                onClick={() => setSelectedOrder(null)}
                className="w-full bg-muted hover:bg-muted/70 text-foreground rounded-lg py-2.5 text-sm border border-border transition-colors"
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
