import { useState, useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { useUserDataSync } from "@/hooks/use-data-sync";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cryptoApi } from "@/services/crypto-api";
import { useCryptoPrices } from "@/hooks/use-crypto-prices";
import { formatCryptoNumber } from "@/utils/format-utils";
import type { Trade, Portfolio } from "@/types/crypto";

interface TradingFormProps {
  pair: string;
  type: "spot";
  className?: string;
}

export function TradingForm({ pair, type, className = "" }: TradingFormProps) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [amountMode, setAmountMode] = useState<"crypto" | "usdt">("crypto"); // crypto = units, usdt = total spend/receive
  const [amount, setAmount] = useState("");
  const [price, setPrice] = useState("");


  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);

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

  // Fetch user portfolio for balance checking
  const { data: portfolio } = useQuery({
    queryKey: ["/api/portfolio", userId],
    queryFn: () => userId ? cryptoApi.getPortfolio(userId) : Promise.resolve([]),
    enabled: !!userId,
    refetchInterval: 10000, // Refresh every 10 seconds
    refetchOnWindowFocus: true,
  });

  // Get available balance for the trading pair
  const getAvailableBalance = () => {
    if (!portfolio) return 0;
    const baseSymbol = pair.split("/")[0]; // BTC from BTC/USDT
    const quoteSymbol = pair.split("/")[1]; // USDT from BTC/USDT
    
    if (side === "buy") {
      // For buy orders, we need USDT balance (to buy BTC)
      const usdtBalance = portfolio.find(p => p.symbol === quoteSymbol);
      const balance = usdtBalance ? parseFloat(usdtBalance.available) : 0;
      return isNaN(balance) ? 0 : balance;
    } else {
      // For sell orders, we need BTC balance (to sell BTC)
      const btcBalance = portfolio.find(p => p.symbol === baseSymbol);
      const balance = btcBalance ? parseFloat(btcBalance.available) : 0;
      return isNaN(balance) ? 0 : balance;
    }
  };

  const availableBalance = getAvailableBalance();
  const { getFormattedPrice } = useCryptoPrices();

  const baseSymbol = pair.split("/")[0];
  const quoteSymbol = pair.split("/")[1];

  // Fetch effective trading limits for this pair + user
  const [tradeLimits, setTradeLimits] = useState<{ min_amount: number; max_amount: number; is_enabled: boolean }>({ min_amount: 0, max_amount: 1000000, is_enabled: true });

  useEffect(() => {
    if (!userId) return;
    const fetchLimits = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const response = await fetch(`/api/trading-limits/me?symbol=${encodeURIComponent(pair)}&type=spot`, {
          headers: { 'Authorization': `Bearer ${session?.access_token}` },
        });
        if (response.ok) {
          setTradeLimits(await response.json());
        }
      } catch { /* keep defaults */ }
    };
    fetchLimits();
  }, [userId, pair]);

  const tradeMutation = useMutation({
    mutationFn: (tradeData: Omit<Trade, "id" | "createdAt">) => 
      cryptoApi.createTrade(tradeData),
    onSuccess: () => {
      toast({
        title: "Order Submitted",
        description: `Your ${side} order has been submitted for admin approval.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/trades"] });
      
      // Reset form
      setAmount("");
      setPrice("");
    },
    onError: (error) => {
      toast({
        title: "Order Failed",
        description: "Failed to place order. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!amount || (orderType === "limit" && !price)) {
      toast({
        title: "Invalid Order",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    let amountNum = parseFloat(amount);
    const priceNum = price ? parseFloat(price) : 0;

    // If user entered amount in USDT, convert to crypto units
    let cryptoAmount = amountNum;
    if (amountMode === "usdt") {
      const currentPrice = orderType === "limit" && priceNum > 0
        ? priceNum
        : parseFloat(getFormattedPrice(baseSymbol).replace(/[$,]/g, ''));
      if (!currentPrice || currentPrice <= 0) {
        toast({
          title: "Price Unavailable",
          description: `Cannot determine current price of ${baseSymbol}. Please try again or use limit order.`,
          variant: "destructive",
        });
        return;
      }
      cryptoAmount = amountNum / currentPrice;
    }

    // Check trading limits (using crypto amount)
    if (!tradeLimits.is_enabled) {
      toast({
        title: "Trading Restricted",
        description: `You are not allowed to trade ${pair}.`,
        variant: "destructive",
      });
      return;
    }

    if (cryptoAmount < tradeLimits.min_amount) {
      toast({
        title: "Below Minimum",
        description: `Minimum trade amount is ${tradeLimits.min_amount} ${baseSymbol} for ${pair}.`,
        variant: "destructive",
      });
      return;
    }

    if (cryptoAmount > tradeLimits.max_amount) {
      toast({
        title: "Above Maximum",
        description: `Maximum trade amount is ${tradeLimits.max_amount.toLocaleString()} ${baseSymbol} for ${pair}.`,
        variant: "destructive",
      });
      return;
    }
    
    // Check if user has sufficient balance
    if (side === "buy") {
      // For buy orders, user needs USDT
      let requiredUSDT: number;
      if (amountMode === "usdt") {
        requiredUSDT = amountNum; // already in USDT
      } else if (orderType === "market") {
        const currentPrice = parseFloat(getFormattedPrice(baseSymbol).replace(/[$,]/g, ''));
        requiredUSDT = cryptoAmount * currentPrice;
      } else {
        requiredUSDT = cryptoAmount * priceNum;
      }
      
      if (requiredUSDT > availableBalance) {
        toast({
          title: "Insufficient Balance",
          description: `You need ${formatCryptoNumber(requiredUSDT)} ${quoteSymbol} but have ${formatCryptoNumber(availableBalance)} ${quoteSymbol} available.`,
          variant: "destructive",
        });
        return;
      }
    } else {
      // For sell orders, user needs crypto to sell
      if (cryptoAmount > availableBalance) {
        toast({
          title: "Insufficient Balance",
          description: `You need ${formatCryptoNumber(cryptoAmount)} ${baseSymbol} but have ${formatCryptoNumber(availableBalance)} ${baseSymbol} available.`,
          variant: "destructive",
        });
        return;
      }
    }

    if (!userId) {
      toast({
        title: "Authentication Error",
        description: "Please log in to place orders.",
        variant: "destructive",
      });
      return;
    }

    const tradeData: Omit<Trade, "id" | "createdAt"> = {
      userId: userId,
      symbol: pair,
      side,
      amount: cryptoAmount.toString(),
      price: orderType === "limit" ? price : undefined,
      status: "pending_approval",
    };

    tradeMutation.mutate(tradeData);
  };

  // Compute estimated value for display
  const estimatedValue = (() => {
    const amountNum = parseFloat(amount);
    if (!amount || isNaN(amountNum) || amountNum <= 0) return null;
    const currentPrice = parseFloat(getFormattedPrice(baseSymbol).replace(/[$,]/g, ''));
    if (!currentPrice || currentPrice <= 0) return null;
    if (amountMode === "crypto") {
      return { crypto: amountNum, usdt: amountNum * currentPrice };
    } else {
      return { crypto: amountNum / currentPrice, usdt: amountNum };
    }
  })();

  return (
    <div className={`bg-[#111] rounded-2xl border border-[#1e1e1e] p-4 ${className}`}>
      <h3 className="text-sm font-semibold text-white mb-4">Spot Trading</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Buy/Sell Buttons */}
        <div className="flex gap-2">
          <button
            type="button"
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              side === "buy"
                ? "bg-green-500 text-white shadow-lg shadow-green-500/25"
                : "bg-[#1a1a1a] text-gray-400 border border-[#2a2a2a] hover:bg-[#222]"
            }`}
            onClick={() => setSide("buy")}
          >
            BUY
          </button>
          <button
            type="button"
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              side === "sell"
                ? "bg-red-500 text-white shadow-lg shadow-red-500/25"
                : "bg-[#1a1a1a] text-gray-400 border border-[#2a2a2a] hover:bg-[#222]"
            }`}
            onClick={() => setSide("sell")}
          >
            SELL
          </button>
        </div>

        {/* Trade Description */}
        <div className="bg-[#0a0a0a] rounded-xl px-3 py-2 border border-[#1e1e1e]">
          <p className="text-[11px] text-gray-400">
            {side === "buy"
              ? `Buy ${baseSymbol} with ${quoteSymbol} at ${orderType === "limit" ? "your specified price" : "market price"}`
              : `Sell ${baseSymbol} for ${quoteSymbol} at ${orderType === "limit" ? "your specified price" : "market price"}`
            }
          </p>
        </div>

        {/* Order Type */}
        <div>
          <label className="text-[11px] text-gray-500 uppercase tracking-wider mb-1.5 block">Order Type</label>
          <Select value={orderType} onValueChange={(value: "market" | "limit") => setOrderType(value)}>
            <SelectTrigger className="h-10 bg-[#0a0a0a] border-[#2a2a2a] rounded-xl text-white text-sm focus:ring-1 focus:ring-gray-600">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#1a1a1a] border-[#2a2a2a]">
              <SelectItem value="market">Market</SelectItem>
              <SelectItem value="limit">Limit</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Price (for limit orders) */}
        {orderType === "limit" && (
          <div>
            <label className="text-[11px] text-gray-500 uppercase tracking-wider mb-1.5 block">Price ({quoteSymbol})</label>
            <Input
              type="number"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
              className="h-10 bg-[#0a0a0a] border-[#2a2a2a] rounded-xl text-white text-sm placeholder:text-gray-600 focus:ring-1 focus:ring-gray-600"
            />
          </div>
        )}

        {/* Amount Mode Toggle */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[11px] text-gray-500 uppercase tracking-wider">
              Amount ({amountMode === "crypto" ? baseSymbol : quoteSymbol})
            </label>
            <div className="flex gap-1 bg-[#0a0a0a] rounded-lg p-0.5 border border-[#1e1e1e]">
              <button
                type="button"
                onClick={() => { setAmountMode("crypto"); setAmount(""); }}
                className={`px-2 py-0.5 rounded-md text-[10px] font-medium transition-all ${
                  amountMode === "crypto"
                    ? "bg-[#1a1a1a] text-white border border-[#2a2a2a]"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                {baseSymbol}
              </button>
              <button
                type="button"
                onClick={() => { setAmountMode("usdt"); setAmount(""); }}
                className={`px-2 py-0.5 rounded-md text-[10px] font-medium transition-all ${
                  amountMode === "usdt"
                    ? "bg-[#1a1a1a] text-white border border-[#2a2a2a]"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                {quoteSymbol}
              </button>
            </div>
          </div>
          <Input
            type="number"
            step={amountMode === "crypto" ? "0.00000001" : "0.01"}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={amountMode === "crypto" ? `0.00 ${baseSymbol}` : `0.00 ${quoteSymbol}`}
            className="h-10 bg-[#0a0a0a] border-[#2a2a2a] rounded-xl text-white text-sm placeholder:text-gray-600 focus:ring-1 focus:ring-gray-600"
          />
          {/* Estimated conversion */}
          {estimatedValue && (
            <p className="text-[10px] text-gray-500 mt-1">
              {amountMode === "crypto"
                ? `≈ ${formatCryptoNumber(estimatedValue.usdt)} ${quoteSymbol}`
                : `≈ ${formatCryptoNumber(estimatedValue.crypto)} ${baseSymbol}`
              }
            </p>
          )}
        </div>

        {/* Available Balance */}
        <div className="flex justify-between items-center bg-[#0a0a0a] rounded-xl px-3 py-2.5 border border-[#1e1e1e]">
          <span className="text-gray-500 text-xs">Available</span>
          <span className="text-white text-xs font-medium tabular-nums">
            {formatCryptoNumber(availableBalance)} {side === "buy" ? quoteSymbol : baseSymbol}
          </span>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={tradeMutation.isPending}
          className={`w-full py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 ${
            side === "buy"
              ? "bg-green-500 hover:bg-green-600 text-white shadow-lg shadow-green-500/25"
              : "bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/25"
          }`}
        >
          {tradeMutation.isPending
            ? "Placing Order..."
            : side === "buy"
              ? `BUY ${baseSymbol} with ${quoteSymbol}`
              : `SELL ${baseSymbol} for ${quoteSymbol}`
          }
        </button>
      </form>
    </div>
  );
}
