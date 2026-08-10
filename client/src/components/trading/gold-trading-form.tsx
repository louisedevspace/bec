import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { TrendingUp, TrendingDown, RefreshCw, Clock, CheckCircle, XCircle, AlertCircle } from "lucide-react";

interface GoldPair {
  id: number;
  symbol: string;
  base_asset: string;
  quote_asset: string;
  trading_fee: string;
  min_trade_amount: string;
  max_trade_amount: string;
  is_enabled: boolean;
}

interface GoldPrice {
  price: number;
  timestamp: number;
  source: string;
}

interface GoldTrade {
  id: number;
  pair_symbol: string;
  side: string;
  amount_usdt: string;
  gold_quantity: string;
  price_per_oz: string;
  fee_usdt: string;
  status: string;
  reject_reason: string | null;
  created_at: string;
}

const STATUS_CONFIG: Record<string, { color: string; icon: typeof Clock; label: string }> = {
  pending:   { color: "text-yellow-500", icon: Clock,       label: "Pending"   },
  approved:  { color: "text-green-500",  icon: CheckCircle, label: "Approved"  },
  rejected:  { color: "text-red-500",    icon: XCircle,     label: "Rejected"  },
  cancelled: { color: "text-gray-500",   icon: AlertCircle, label: "Cancelled" },
};

function GoldIcon({ size = 20 }: { size?: number }) {
  return (
    <div
      className="rounded-full flex items-center justify-center font-bold text-black flex-shrink-0"
      style={{
        width: size,
        height: size,
        background: "linear-gradient(135deg, #FFD700 0%, #FFA500 50%, #FFD700 100%)",
        fontSize: size * 0.38,
        boxShadow: "0 1px 4px rgba(255,215,0,0.4)",
      }}
    >
      Au
    </div>
  );
}

async function getAuthHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};
}

async function authFetch(url: string, init?: RequestInit): Promise<Response> {
  const authHeader = await getAuthHeader();
  return fetch(url, {
    ...init,
    headers: { ...(init?.headers || {}), ...authHeader },
  });
}

export function GoldTradingForm({ pair = "XAU/USDT" }: { pair?: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amountInput, setAmountInput] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id || null));
  }, []);

  // Poll gold price every 30s — public endpoint, no auth needed
  const { data: goldPriceData, isLoading: priceLoading } = useQuery<GoldPrice>({
    queryKey: ["gold-price"],
    queryFn: () => fetch("/api/gold/price").then(r => r.json()),
    refetchInterval: 30_000,
    staleTime: 25_000,
  });

  // Gold pairs — public endpoint
  const { data: goldPairs = [] } = useQuery<GoldPair[]>({
    queryKey: ["gold-pairs"],
    queryFn: () => fetch("/api/trading-pairs/gold").then(r => r.json()),
    staleTime: 60_000,
  });

  const activePair = goldPairs.find(p => p.symbol === pair) || goldPairs[0];
  const feeRate = parseFloat(activePair?.trading_fee || "0.002");
  const goldPrice = goldPriceData?.price || 0;

  // Portfolio balances — protected, needs auth
  const { data: portfolio = [] } = useQuery<any[]>({
    queryKey: ["portfolio", userId],
    queryFn: async () => {
      if (!userId) return [];
      const res = await authFetch(`/api/portfolio/${userId}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!userId,
    staleTime: 15_000,
  });

  const usdtBalance = parseFloat((portfolio as any[]).find((p: any) => p.symbol === "USDT")?.available || "0");
  const xauBalance = parseFloat((portfolio as any[]).find((p: any) => p.symbol === "XAU")?.available || "0");

  // User gold trade history — protected
  const { data: trades = [], refetch: refetchTrades } = useQuery<GoldTrade[]>({
    queryKey: ["gold-trades", userId],
    queryFn: async () => {
      const res = await authFetch("/api/gold/trades");
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!userId,
    staleTime: 10_000,
  });

  const parsedAmount = parseFloat(amountInput) || 0;

  const goldQty = side === "buy" && goldPrice > 0 ? parsedAmount / goldPrice : parsedAmount;
  const usdtValue = side === "sell" && goldPrice > 0 ? parsedAmount * goldPrice : parsedAmount;
  const fee = side === "buy" ? parsedAmount * feeRate : usdtValue * feeRate;
  const totalCost = side === "buy" ? parsedAmount + fee : 0;
  const netReceive = side === "sell" ? usdtValue - fee : 0;

  const submitMutation = useMutation({
    mutationFn: async () => {
      const qty = side === "buy" ? goldQty : parsedAmount;
      const authHeader = await getAuthHeader();
      const res = await fetch("/api/gold/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({
          pairSymbol: activePair?.symbol || "XAU/USDT",
          side,
          goldQuantity: qty.toFixed(8),
          pricePerOz: goldPrice.toFixed(2),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Trade failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Trade submitted", description: "Your gold trade is pending admin approval." });
      setAmountInput("");
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      queryClient.invalidateQueries({ queryKey: ["gold-trades"] });
      refetchTrades();
    },
    onError: (err: Error) => {
      toast({ title: "Trade failed", description: err.message, variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (tradeId: number) => {
      const res = await authFetch(`/api/gold/trades/${tradeId}/cancel`, { method: "PUT" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Cancel failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Trade cancelled", description: "Funds have been returned to your account." });
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      queryClient.invalidateQueries({ queryKey: ["gold-trades"] });
    },
    onError: (err: Error) => {
      toast({ title: "Cancel failed", description: err.message, variant: "destructive" });
    },
  });

  const isSubmitDisabled =
    !parsedAmount ||
    parsedAmount <= 0 ||
    !goldPrice ||
    submitMutation.isPending ||
    (side === "buy" && totalCost > usdtBalance) ||
    (side === "sell" && parsedAmount > xauBalance);

  const setMaxAmount = useCallback(() => {
    if (side === "buy") {
      const maxUsdt = usdtBalance / (1 + feeRate);
      setAmountInput(maxUsdt.toFixed(2));
    } else {
      setAmountInput(xauBalance.toFixed(6));
    }
  }, [side, usdtBalance, xauBalance, feeRate]);

  return (
    <div className="flex flex-col gap-3">
      {/* Trading Form */}
      <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <GoldIcon size={28} />
            <div>
              <div className="text-white font-semibold text-sm">Gold Trading</div>
              <div className="text-gray-500 text-[11px]">{activePair?.symbol || "XAU/USDT"}</div>
            </div>
          </div>
          <div className="text-right">
            {priceLoading ? (
              <div className="text-gray-500 text-xs animate-pulse">Loading...</div>
            ) : (
              <>
                <div className="text-yellow-400 font-bold text-lg tabular-nums">
                  ${goldPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-gray-500 text-[11px]">per troy oz</div>
              </>
            )}
          </div>
        </div>

        {/* Buy / Sell Toggle */}
        <div className="flex rounded-xl overflow-hidden border border-[#1e1e1e] mb-4">
          <button
            onClick={() => { setSide("buy"); setAmountInput(""); }}
            className={`flex-1 py-2.5 text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors ${
              side === "buy"
                ? "bg-green-600 text-white"
                : "bg-[#1a1a1a] text-gray-400 hover:text-gray-200"
            }`}
          >
            <TrendingUp size={14} />
            Buy Gold
          </button>
          <button
            onClick={() => { setSide("sell"); setAmountInput(""); }}
            className={`flex-1 py-2.5 text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors ${
              side === "sell"
                ? "bg-red-600 text-white"
                : "bg-[#1a1a1a] text-gray-400 hover:text-gray-200"
            }`}
          >
            <TrendingDown size={14} />
            Sell Gold
          </button>
        </div>

        {/* Amount Input */}
        <div className="mb-3">
          <label className="text-gray-400 text-xs mb-1.5 block">
            {side === "buy" ? "Amount (USDT)" : "Amount (oz XAU)"}
          </label>
          <div className="relative">
            <input
              type="number"
              value={amountInput}
              onChange={e => setAmountInput(e.target.value)}
              placeholder={side === "buy" ? "0.00" : "0.000000"}
              step={side === "buy" ? "0.01" : "0.000001"}
              min="0"
              className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-4 py-3 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-yellow-500 transition-colors pr-16"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
              <span className="text-gray-500 text-xs">{side === "buy" ? "USDT" : "XAU"}</span>
              <button
                onClick={setMaxAmount}
                className="text-yellow-500 text-xs font-semibold hover:text-yellow-400 transition-colors"
              >
                MAX
              </button>
            </div>
          </div>
        </div>

        {/* Trade Summary */}
        {parsedAmount > 0 && goldPrice > 0 && (
          <div className="bg-[#0f0f0f] rounded-xl border border-[#1e1e1e] p-3 mb-4 space-y-2">
            {side === "buy" ? (
              <>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Gold quantity</span>
                  <span className="text-white">{goldQty.toFixed(6)} oz</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Fee ({(feeRate * 100).toFixed(1)}%)</span>
                  <span className="text-gray-300">${fee.toFixed(2)} USDT</span>
                </div>
                <div className="flex justify-between text-xs border-t border-[#1e1e1e] pt-2">
                  <span className="text-gray-400 font-semibold">Total cost</span>
                  <span className={`font-semibold ${totalCost > usdtBalance ? "text-red-400" : "text-white"}`}>
                    ${totalCost.toFixed(2)} USDT
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">USDT value</span>
                  <span className="text-white">${usdtValue.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Fee ({(feeRate * 100).toFixed(1)}%)</span>
                  <span className="text-gray-300">${fee.toFixed(2)} USDT</span>
                </div>
                <div className="flex justify-between text-xs border-t border-[#1e1e1e] pt-2">
                  <span className="text-gray-400 font-semibold">You receive</span>
                  <span className="text-green-400 font-semibold">${netReceive.toFixed(2)} USDT</span>
                </div>
              </>
            )}
          </div>
        )}

        {/* Balance Info */}
        <div className="flex justify-between text-xs text-gray-500 mb-4">
          <span>USDT balance: <span className="text-gray-300">${usdtBalance.toFixed(2)}</span></span>
          <span>XAU balance: <span className="text-gray-300">{xauBalance.toFixed(6)} oz</span></span>
        </div>

        {/* Submit Button */}
        <button
          onClick={() => submitMutation.mutate()}
          disabled={isSubmitDisabled}
          className={`w-full py-3 rounded-xl font-semibold text-sm transition-all ${
            side === "buy"
              ? "bg-green-600 hover:bg-green-500 disabled:bg-green-900 disabled:text-green-700"
              : "bg-red-600 hover:bg-red-500 disabled:bg-red-900 disabled:text-red-700"
          } text-white disabled:cursor-not-allowed`}
        >
          {submitMutation.isPending
            ? "Submitting..."
            : side === "buy"
            ? `Buy ${goldQty > 0 ? goldQty.toFixed(6) + " oz" : ""} Gold`
            : `Sell ${parsedAmount > 0 ? parsedAmount.toFixed(6) + " oz" : ""} Gold`}
        </button>

        <p className="text-center text-gray-600 text-[11px] mt-2">
          Trades require admin approval before execution
        </p>
      </div>

      {/* Trade History */}
      {(trades as GoldTrade[]).length > 0 && (
        <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-white text-sm font-semibold">Gold Trade History</span>
            <button
              onClick={() => refetchTrades()}
              className="text-gray-500 hover:text-gray-300 transition-colors"
            >
              <RefreshCw size={14} />
            </button>
          </div>

          <div className="space-y-2 max-h-72 overflow-y-auto">
            {(trades as GoldTrade[]).map((trade) => {
              const cfg = STATUS_CONFIG[trade.status] || STATUS_CONFIG.pending;
              const StatusIcon = cfg.icon;
              return (
                <div key={trade.id} className="bg-[#0f0f0f] rounded-xl border border-[#1e1e1e] p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold uppercase ${trade.side === "buy" ? "text-green-400" : "text-red-400"}`}>
                        {trade.side}
                      </span>
                      <span className="text-gray-600 text-xs">{trade.pair_symbol}</span>
                    </div>
                    <div className={`flex items-center gap-1 text-xs ${cfg.color}`}>
                      <StatusIcon size={11} />
                      {cfg.label}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                    <span className="text-gray-500">Quantity: <span className="text-gray-300">{parseFloat(trade.gold_quantity).toFixed(6)} oz</span></span>
                    <span className="text-gray-500">Price: <span className="text-gray-300">${parseFloat(trade.price_per_oz).toLocaleString()}</span></span>
                    <span className="text-gray-500">Value: <span className="text-gray-300">${parseFloat(trade.amount_usdt).toFixed(2)}</span></span>
                    <span className="text-gray-500">Fee: <span className="text-gray-300">${parseFloat(trade.fee_usdt).toFixed(2)}</span></span>
                  </div>

                  {trade.reject_reason && (
                    <p className="text-red-400 text-xs mt-1.5 bg-red-950/20 rounded-lg px-2 py-1">
                      {trade.reject_reason}
                    </p>
                  )}

                  <div className="flex items-center justify-between mt-2">
                    <span className="text-gray-600 text-[11px]">
                      {new Date(trade.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                    {trade.status === "pending" && (
                      <button
                        onClick={() => cancelMutation.mutate(trade.id)}
                        disabled={cancelMutation.isPending}
                        className="text-red-400 hover:text-red-300 text-xs transition-colors disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
