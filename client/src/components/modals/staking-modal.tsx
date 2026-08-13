import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CryptoIcon } from "@/components/crypto/crypto-icon";
import { useToast } from "@/hooks/use-toast";
import { cryptoApi } from "@/services/crypto-api";
import { apiRequest } from "@/lib/queryClient";
import { Coins, TrendingUp, Info, X, Lock, DollarSign, Clock, AlertTriangle, ArrowLeft, Zap, Unlock, Loader2 } from "lucide-react";
import type { StakingPosition } from "@/types/crypto";
import { StakingDetailsModal } from "./staking-details-modal";
import { formatUsdNumber } from "@/utils/format-utils";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface StakingModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId?: string | null;
}

type StakeType = "flexible" | "fixed";

interface StakingProduct {
  duration: number;
  apy: string;
  type: StakeType;
  minAmount: string;
  maxAmount: string;
  title: string;
}

const DEFAULT_STAKING_PRODUCTS: StakingProduct[] = [
  { duration: 1, apy: "0.6", type: "flexible", minAmount: "10", maxAmount: "1000000", title: "Flexible" },
  { duration: 7, apy: "0.5", type: "fixed", minAmount: "10", maxAmount: "10000", title: "7 Days" },
  { duration: 15, apy: "0.8", type: "fixed", minAmount: "100", maxAmount: "50000", title: "15 Days" },
  { duration: 30, apy: "1.2", type: "fixed", minAmount: "500", maxAmount: "100000", title: "30 Days" },
  { duration: 60, apy: "1.8", type: "fixed", minAmount: "1000", maxAmount: "500000", title: "60 Days" },
  { duration: 90, apy: "2.5", type: "fixed", minAmount: "5000", maxAmount: "1000000", title: "90 Days" },
  { duration: 180, apy: "4.0", type: "fixed", minAmount: "10000", maxAmount: "5000000", title: "180 Days" },
];

function daysElapsed(startDate: string): number {
  return Math.max(0, (Date.now() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24));
}

export function StakingModal({ isOpen, onClose, userId }: StakingModalProps) {
  const [activeTab, setActiveTab] = useState<StakeType>("flexible");
  const [selectedProduct, setSelectedProduct] = useState<StakingProduct | null>(null);
  const [stakeAmount, setStakeAmount] = useState("");
  const [selectedPosition, setSelectedPosition] = useState<StakingPosition | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: portfolio } = useQuery({
    queryKey: ["/api/portfolio", userId],
    queryFn: () => cryptoApi.getPortfolio(userId || ''),
    enabled: isOpen && !!userId,
  });

  const usdtBalance = portfolio?.find(p => p.symbol === 'USDT')?.available || '0';

  const { data: stakingLimits } = useQuery<{
    isEnabled: boolean;
    maxStakeAmount: string | null;
    maxTotalStaked: string | null;
    maxDuration: number | null;
    minStakeAmount: string | null;
  }>({
    queryKey: ["/api/staking/my-limits"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/staking/my-limits");
      return res.json();
    },
    enabled: isOpen && !!userId,
  });

  const { data: apiProducts } = useQuery<any[]>({
    queryKey: ["/api/staking-products"],
    queryFn: async () => {
      const res = await fetch("/api/staking-products");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const allProducts: StakingProduct[] = apiProducts && apiProducts.length > 0
    ? apiProducts.map((p: any) => ({
        duration: p.duration,
        apy: p.apy,
        type: p.type === "flexible" ? "flexible" : "fixed",
        minAmount: p.min_amount,
        maxAmount: p.max_amount,
        title: p.title,
      }))
    : DEFAULT_STAKING_PRODUCTS;

  const stakingProducts = useMemo(
    () => allProducts.filter((p) => p.type === activeTab),
    [allProducts, activeTab]
  );

  const { data: positions, isLoading: positionsLoading } = useQuery({
    queryKey: ["/api/staking", userId],
    queryFn: () => cryptoApi.getStakingPositions(userId || ''),
    enabled: isOpen && !!userId,
  });

  const activePositions = positions?.filter(p => p.status === 'active') || [];
  const totalStaked = activePositions.reduce((sum, p) => sum + parseFloat(p.amount), 0);
  const totalEarnedSoFar = activePositions.reduce((sum, p) => {
    const dailyRate = parseFloat(p.apy) / 100 / 365;
    const elapsed = daysElapsed(p.startDate);
    const capped = p.type === 'fixed' ? Math.min(elapsed, p.duration) : elapsed;
    return sum + parseFloat(p.amount) * dailyRate * capped;
  }, 0);

  const stakeMutation = useMutation({
    mutationFn: (positionData: Omit<StakingPosition, "id" | "startDate">) =>
      cryptoApi.createStakingPosition(positionData),
    onSuccess: () => {
      toast({ title: "Staking Success", description: "Your USDT has been staked successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/staking"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio"] });
      setSelectedProduct(null);
      setStakeAmount("");
    },
    onError: (error: any) => {
      const msg = error?.message || "Failed to stake USDT. Please try again.";
      let description = msg;
      try {
        const match = msg.match(/\d+:\s*(.+)/);
        if (match) {
          const parsed = JSON.parse(match[1]);
          description = parsed.message || msg;
        }
      } catch { /* use raw message */ }
      toast({ title: "Staking Failed", description, variant: "destructive" });
    },
  });

  const unstakeMutation = useMutation({
    mutationFn: async (positionId: number) => {
      const res = await apiRequest("POST", `/api/staking/${positionId}/unstake`);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Unstaked", description: `${formatUsdNumber(parseFloat(data.amountReturned))} USDT returned to your balance, including ${formatUsdNumber(parseFloat(data.interestEarned))} USDT interest.` });
      queryClient.invalidateQueries({ queryKey: ["/api/staking"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio"] });
    },
    onError: (error: any) => {
      toast({ title: "Unstake Failed", description: error?.message || "Please try again.", variant: "destructive" });
    },
  });

  const handleStake = (product: StakingProduct) => setSelectedProduct(product);
  const handleShowDetails = (position: StakingPosition) => { setSelectedPosition(position); setShowDetailsModal(true); };
  const handleCloseDetails = () => { setShowDetailsModal(false); setSelectedPosition(null); };

  const handleConfirmStake = () => {
    if (!selectedProduct || !stakeAmount) {
      toast({ title: "Invalid Input", description: "Please enter a valid amount.", variant: "destructive" });
      return;
    }

    if (stakingLimits && !stakingLimits.isEnabled) {
      toast({ title: "Staking Disabled", description: "Staking is currently disabled for your account. Contact support for details.", variant: "destructive" });
      return;
    }

    const amount = parseFloat(stakeAmount);
    const minAmount = parseFloat(selectedProduct.minAmount);
    const maxAmount = parseFloat(selectedProduct.maxAmount);
    const availableBalance = parseFloat(usdtBalance);

    const effectiveMin = stakingLimits?.minStakeAmount ? Math.max(minAmount, parseFloat(stakingLimits.minStakeAmount)) : minAmount;
    const effectiveMax = stakingLimits?.maxStakeAmount ? Math.min(maxAmount, parseFloat(stakingLimits.maxStakeAmount)) : maxAmount;

    if (amount < effectiveMin || amount > effectiveMax) {
      toast({ title: "Invalid Amount", description: `Amount must be between $${formatUsdNumber(effectiveMin)} and $${formatUsdNumber(effectiveMax)}.`, variant: "destructive" });
      return;
    }

    if (selectedProduct.type === "fixed" && stakingLimits?.maxDuration && selectedProduct.duration > stakingLimits.maxDuration) {
      toast({ title: "Duration Exceeds Limit", description: `Maximum staking duration is ${stakingLimits.maxDuration} days.`, variant: "destructive" });
      return;
    }

    if (amount > availableBalance) {
      toast({ title: "Insufficient Balance", description: `You only have ${formatUsdNumber(availableBalance)} USDT available.`, variant: "destructive" });
      return;
    }

    const endDate = new Date();
    endDate.setDate(endDate.getDate() + selectedProduct.duration);
    stakeMutation.mutate({
      userId: parseInt(userId || '0'),
      symbol: "USDT",
      amount: stakeAmount,
      apy: selectedProduct.apy,
      duration: selectedProduct.duration,
      type: selectedProduct.type,
      endDate: endDate.toISOString(),
      status: "active",
    });
  };

  const handleCancel = () => { setSelectedProduct(null); setStakeAmount(""); };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-4xl overflow-x-hidden" hideCloseButton>
        <div className="sticky top-0 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between z-10 border-b bg-card border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
              <TrendingUp size={20} className="text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">USDT Staking</h2>
              <p className="text-xs text-muted-foreground">Earn passive income on your crypto</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg border flex items-center justify-center transition-colors bg-muted border-border hover:bg-muted/70">
            <X size={16} className="text-muted-foreground" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-6">
          {stakingLimits && !stakingLimits.isEnabled && (
            <Alert className="bg-danger/10 border-danger/30 p-4">
              <AlertTriangle size={18} className="text-danger" />
              <AlertDescription>
                <p className="text-sm font-medium text-danger">Staking Disabled</p>
                <p className="text-xs text-danger/70 mt-0.5">Staking is currently disabled for your account. Please contact support for more details.</p>
              </AlertDescription>
            </Alert>
          )}

          {stakingLimits && stakingLimits.isEnabled && (stakingLimits.maxStakeAmount || stakingLimits.maxTotalStaked || stakingLimits.maxDuration) && (
            <Alert className="bg-info/5 border-info/20 p-3">
              <Info size={14} className="text-info" />
              <AlertDescription className="text-xs text-info/80">
                Your account has custom staking limits:
                {stakingLimits.maxStakeAmount && ` Max per stake: $${parseFloat(stakingLimits.maxStakeAmount).toLocaleString()}`}
                {stakingLimits.maxTotalStaked && ` • Max total: $${parseFloat(stakingLimits.maxTotalStaked).toLocaleString()}`}
                {stakingLimits.maxDuration && ` • Max duration: ${stakingLimits.maxDuration} days`}
              </AlertDescription>
            </Alert>
          )}

          {!selectedProduct ? (
            <>
              <div className="relative overflow-hidden bg-muted/50 rounded-2xl border border-border p-5">
                <div className="absolute inset-0 opacity-[0.07] pointer-events-none" style={{ background: 'radial-gradient(circle at 100% 0%, hsl(var(--primary)), transparent 60%)' }} />
                <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-success/10 rounded-xl flex items-center justify-center">
                      <DollarSign size={24} className="text-success" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">Available Balance</p>
                      <p className="text-2xl font-bold text-foreground tabular-nums">
                        {userId ? `${formatUsdNumber(parseFloat(usdtBalance))} USDT` : '---'}
                      </p>
                    </div>
                  </div>
                  {activePositions.length > 0 && (
                    <div className="flex gap-4 sm:gap-6 pl-0 sm:pl-4 sm:border-l border-border">
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Staked</p>
                        <p className="text-sm font-semibold text-foreground tabular-nums">{formatUsdNumber(totalStaked)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Earned</p>
                        <p className="text-sm font-semibold text-success tabular-nums">+{formatUsdNumber(totalEarnedSoFar)}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                  <Lock size={14} />
                  Choose Your Staking Plan
                </h3>
                <div className="inline-flex bg-muted rounded-full p-1 gap-1 mb-4">
                  <button
                    onClick={() => setActiveTab('flexible')}
                    className={`px-4 py-2 rounded-full text-xs font-semibold transition-colors flex items-center gap-1.5 ${activeTab === 'flexible' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    <Zap size={12} /> Flexible
                  </button>
                  <button
                    onClick={() => setActiveTab('fixed')}
                    className={`px-4 py-2 rounded-full text-xs font-semibold transition-colors flex items-center gap-1.5 ${activeTab === 'fixed' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    <Lock size={12} /> Fixed Term
                  </button>
                </div>

                {activeTab === 'flexible' && (
                  <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1.5">
                    <Info size={12} className="flex-shrink-0" /> No lock-up — withdraw your stake and earned interest any time.
                  </p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {stakingProducts.map((product, index) => {
                    const stakingDisabled = stakingLimits && !stakingLimits.isEnabled;
                    const durationExceeded = product.type === 'fixed' && stakingLimits?.maxDuration ? product.duration > stakingLimits.maxDuration : false;
                    const isProductDisabled = !userId || stakingDisabled || durationExceeded;
                    const highestApy = stakingProducts.length ? Math.max(...stakingProducts.map(p => parseFloat(p.apy))) : 0;
                    const isBest = parseFloat(product.apy) === highestApy;
                    const isFlexible = product.type === 'flexible';

                    return (
                    <div
                      key={index}
                      className={`relative bg-card rounded-2xl border border-border overflow-hidden hover:border-primary/50 hover:shadow-md transition-all cursor-pointer group ${isProductDisabled ? 'opacity-50 pointer-events-none' : ''}`}
                      onClick={() => !isProductDisabled && handleStake(product)}
                    >
                      <div className={`h-1 w-full ${isFlexible ? 'bg-info' : 'bg-primary'}`} />
                      {isBest && (
                        <div className="absolute top-3 right-3 bg-primary text-[10px] font-bold px-2 py-0.5 rounded-full text-primary-foreground">
                          BEST
                        </div>
                      )}
                      <div className="p-4">
                        <div className="flex items-center gap-1.5 mb-3">
                          {isFlexible ? <Zap size={12} className="text-info" /> : <Lock size={12} className="text-primary" />}
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{product.title}</span>
                        </div>
                        <div className="mb-3">
                          <div className="text-2xl sm:text-3xl font-bold text-success tabular-nums leading-tight">{product.apy}%</div>
                          <div className="text-[11px] text-muted-foreground">Annual Percentage Yield</div>
                        </div>
                        <div className="space-y-1.5 text-xs mb-3">
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground flex items-center gap-1">
                              {isFlexible ? <Unlock size={10} /> : <Clock size={10} />}
                              {isFlexible ? 'Lock-up' : 'Duration'}
                            </span>
                            <span className="text-foreground font-medium">{isFlexible ? 'None' : `${product.duration} days`}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground flex items-center gap-1"><DollarSign size={10} /> Min</span>
                            <span className="text-foreground font-medium tabular-nums">${formatUsdNumber(parseFloat(product.minAmount))}</span>
                          </div>
                        </div>
                        <button className={`w-full py-2 rounded-lg text-xs font-semibold transition-colors ${
                          isFlexible
                            ? 'bg-info/10 border border-info/30 text-info group-hover:bg-info/20'
                            : 'bg-primary/10 border border-primary/30 text-primary group-hover:bg-primary/20'
                        }`}>
                          {durationExceeded ? 'Exceeds Limit' : 'Stake Now'}
                        </button>
                      </div>
                    </div>
                  );
                  })}
                  {stakingProducts.length === 0 && (
                    <div className="col-span-full text-center py-8 text-sm text-muted-foreground">
                      No {activeTab} plans available right now.
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-4 flex items-center gap-2">
                  <Coins size={14} />
                  Your Active Stakes
                </h3>
                <div className="bg-muted/50 rounded-xl border border-border overflow-hidden">
                  {positionsLoading ? (
                    <div className="text-center py-12">
                      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                      <p className="text-muted-foreground text-sm">Loading positions...</p>
                    </div>
                  ) : positions && positions.length > 0 ? (
                    <>
                      <div className="grid grid-cols-3 border-b border-border">
                        <div className="p-4 text-center border-r border-border">
                          <div className="text-xs text-muted-foreground">Total Staked</div>
                          <div className="text-lg font-bold text-foreground tabular-nums">{formatUsdNumber(totalStaked)}</div>
                        </div>
                        <div className="p-4 text-center border-r border-border">
                          <div className="text-xs text-muted-foreground">Active</div>
                          <div className="text-lg font-bold text-foreground tabular-nums">{activePositions.length}</div>
                        </div>
                        <div className="p-4 text-center">
                          <div className="text-xs text-muted-foreground">Earned</div>
                          <div className="text-lg font-bold text-success tabular-nums">+{formatUsdNumber(totalEarnedSoFar)}</div>
                        </div>
                      </div>
                      <div className="hidden sm:block">
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead className="bg-muted/50">
                              <tr className="text-xs text-muted-foreground">
                                <th className="text-left py-3 px-4">Asset</th>
                                <th className="text-center py-3 px-4">Amount</th>
                                <th className="text-center py-3 px-4">APY</th>
                                <th className="text-center py-3 px-4">Plan</th>
                                <th className="text-center py-3 px-4">Progress</th>
                                <th className="text-center py-3 px-4">Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {positions.map((position: StakingPosition) => {
                                const isFlex = position.type === 'flexible';
                                const elapsed = daysElapsed(position.startDate);
                                const pct = isFlex ? 100 : Math.min(100, (elapsed / position.duration) * 100);
                                return (
                                <tr key={position.id} className="border-t border-border hover:bg-muted/40 transition-colors">
                                  <td className="py-3 px-4 font-medium text-sm">
                                    <div className="flex items-center gap-2">
                                      <CryptoIcon symbol={position.symbol} size="xs" />
                                      {position.symbol}
                                    </div>
                                  </td>
                                  <td className="py-3 px-4 text-center text-sm tabular-nums">{formatUsdNumber(parseFloat(position.amount))}</td>
                                  <td className="py-3 px-4 text-center text-sm text-success tabular-nums">{position.apy}%</td>
                                  <td className="py-3 px-4 text-center">
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${isFlex ? 'bg-info/15 text-info' : 'bg-primary/15 text-primary'}`}>
                                      {isFlex ? 'Flexible' : `${position.duration}d Fixed`}
                                    </span>
                                  </td>
                                  <td className="py-3 px-4">
                                    {position.status === 'active' ? (
                                      isFlex ? (
                                        <div className="text-center text-[11px] text-muted-foreground tabular-nums">{Math.floor(elapsed)}d held</div>
                                      ) : (
                                        <div className="flex items-center gap-2 justify-center">
                                          <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                                            <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                                          </div>
                                          <span className="text-[10px] text-muted-foreground tabular-nums">{Math.min(Math.floor(elapsed), position.duration)}/{position.duration}d</span>
                                        </div>
                                      )
                                    ) : (
                                      <span className="text-center block text-[11px] text-muted-foreground">Completed</span>
                                    )}
                                  </td>
                                  <td className="py-3 px-4">
                                    <div className="flex items-center justify-center gap-2">
                                      {position.status === 'active' && isFlex && (
                                        <button
                                          onClick={() => unstakeMutation.mutate(position.id)}
                                          disabled={unstakeMutation.isPending}
                                          className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-warning/10 text-warning hover:bg-warning/20 transition-colors disabled:opacity-50 flex items-center gap-1"
                                        >
                                          {unstakeMutation.isPending ? <Loader2 size={10} className="animate-spin" /> : <Unlock size={10} />}
                                          Unstake
                                        </button>
                                      )}
                                      <button onClick={() => handleShowDetails(position)} className="text-primary hover:text-primary/80">
                                        <Info size={16} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );})}
                            </tbody>
                          </table>
                        </div>
                      </div>
                      <div className="block sm:hidden">
                        <div className="divide-y divide-border">
                          {positions.map((position: StakingPosition) => {
                            const isFlex = position.type === 'flexible';
                            const elapsed = daysElapsed(position.startDate);
                            const pct = isFlex ? 100 : Math.min(100, (elapsed / position.duration) * 100);
                            return (
                            <div key={position.id} className="p-4">
                              <div className="flex items-center justify-between">
                                <div className="min-w-0">
                                  <div className="text-sm font-medium text-foreground flex items-center gap-1.5">
                                    <CryptoIcon symbol={position.symbol} size="xs" />
                                    {position.symbol}
                                    <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-medium ${isFlex ? 'bg-info/15 text-info' : 'bg-primary/15 text-primary'}`}>
                                      {isFlex ? 'Flexible' : 'Fixed'}
                                    </span>
                                  </div>
                                  <div className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                                    {formatUsdNumber(parseFloat(position.amount))} USDT • {position.apy}% APY
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  {position.status === 'active' && isFlex && (
                                    <button
                                      onClick={() => unstakeMutation.mutate(position.id)}
                                      disabled={unstakeMutation.isPending}
                                      className="text-[10px] font-semibold px-2 py-1.5 rounded-lg bg-warning/10 text-warning disabled:opacity-50 flex items-center gap-1"
                                    >
                                      {unstakeMutation.isPending ? <Loader2 size={10} className="animate-spin" /> : <Unlock size={10} />}
                                      Unstake
                                    </button>
                                  )}
                                  <button onClick={() => handleShowDetails(position)} className="p-2 rounded-lg bg-muted border border-border text-primary hover:bg-muted/70">
                                    <Info size={16} />
                                  </button>
                                </div>
                              </div>
                              {position.status === 'active' && !isFlex && (
                                <div className="flex items-center gap-2 mt-2">
                                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                                    <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                                  </div>
                                  <span className="text-[10px] text-muted-foreground tabular-nums flex-shrink-0">{Math.min(Math.floor(elapsed), position.duration)}/{position.duration}d</span>
                                </div>
                              )}
                            </div>
                          );})}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-12">
                      <div className="w-16 h-16 bg-muted rounded-full mx-auto mb-4 flex items-center justify-center">
                        <Coins size={24} className="text-muted-foreground" />
                      </div>
                      <p className="text-muted-foreground">No active stakes yet</p>
                      <p className="text-xs text-muted-foreground/70 mt-1">Choose a plan above to start earning</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="bg-muted/50 rounded-xl border border-border overflow-hidden">
              <div className="bg-primary/10 p-5 border-b border-border">
                <button
                  onClick={handleCancel}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to plans
                </button>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-foreground">Stake USDT</h3>
                    <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                      {selectedProduct.type === 'flexible' ? <Zap className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                      {selectedProduct.title} Plan
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold text-success tabular-nums">{selectedProduct.apy}%</div>
                    <div className="text-xs text-muted-foreground">APY</div>
                  </div>
                </div>
              </div>

              <div className="p-5 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-card border border-border rounded-xl p-4 text-center">
                    {selectedProduct.type === 'flexible' ? (
                      <>
                        <Unlock size={20} className="mx-auto mb-2 text-info" />
                        <div className="text-lg font-bold text-foreground">Anytime</div>
                        <div className="text-xs text-muted-foreground">Withdraw</div>
                      </>
                    ) : (
                      <>
                        <Clock size={20} className="mx-auto mb-2 text-info" />
                        <div className="text-lg font-bold text-foreground">{selectedProduct.duration} Days</div>
                        <div className="text-xs text-muted-foreground">Lock Period</div>
                      </>
                    )}
                  </div>
                  <div className="bg-card border border-border rounded-xl p-4 text-center">
                    <DollarSign size={20} className="mx-auto mb-2 text-success" />
                    <div className="text-lg font-bold text-foreground tabular-nums">${formatUsdNumber(parseFloat(selectedProduct.minAmount))}</div>
                    <div className="text-xs text-muted-foreground">Minimum</div>
                  </div>
                </div>

                <div>
                  <label className="text-sm text-muted-foreground mb-2 block">Amount to Stake (USDT)</label>
                  <div className="relative">
                    <Input
                      type="number"
                      step="0.01"
                      placeholder={`Min: ${formatUsdNumber(parseFloat(selectedProduct.minAmount))}`}
                      value={stakeAmount}
                      onChange={(e) => setStakeAmount(e.target.value)}
                      className="bg-card border-border text-foreground text-lg h-12 rounded-xl tabular-nums"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground tabular-nums">
                      Balance: {formatUsdNumber(parseFloat(usdtBalance))}
                    </div>
                  </div>
                </div>

                {stakeAmount && parseFloat(stakeAmount) > 0 && (
                  <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Daily Earnings</span>
                      <span className="text-foreground tabular-nums">{formatUsdNumber(parseFloat(stakeAmount) * parseFloat(selectedProduct.apy) / 100 / 365)} USDT</span>
                    </div>
                    {selectedProduct.type === 'fixed' && (
                      <>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Total Interest</span>
                          <span className="text-success tabular-nums">{formatUsdNumber(parseFloat(stakeAmount) * parseFloat(selectedProduct.apy) / 100 * selectedProduct.duration / 365)} USDT</span>
                        </div>
                        <div className="flex justify-between text-sm pt-2 border-t border-border">
                          <span className="text-muted-foreground font-medium">Total Return</span>
                          <span className="text-foreground font-bold tabular-nums">{formatUsdNumber(parseFloat(stakeAmount) + parseFloat(stakeAmount) * parseFloat(selectedProduct.apy) / 100 * selectedProduct.duration / 365)} USDT</span>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {selectedProduct.type === 'flexible' ? (
                  <Alert className="bg-info/10 border-info/20 p-4">
                    <Unlock size={18} className="text-info" />
                    <AlertDescription className="text-sm">
                      <p className="font-medium text-info mb-1">No lock-up period</p>
                      <ul className="text-xs space-y-1 text-info/80">
                        <li>• Withdraw your stake plus earned interest any time</li>
                        <li>• Interest accrues daily at {selectedProduct.apy}% APY</li>
                        <li>• No penalty for early withdrawal</li>
                      </ul>
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Alert className="bg-warning/10 border-warning/20 p-4">
                    <Lock size={18} className="text-warning" />
                    <AlertDescription className="text-sm">
                      <p className="font-medium text-warning mb-1">Funds will be locked</p>
                      <ul className="text-xs space-y-1 text-warning/80">
                        <li>• Your USDT will be locked for {selectedProduct.duration} days and cannot be withdrawn early</li>
                        <li>• Interest calculated daily at {selectedProduct.apy}% APY</li>
                        <li>• Funds auto-return to available balance after maturity</li>
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}

                <div className="flex flex-col sm:flex-row gap-3">
                  <Button onClick={handleCancel} variant="outline" className="w-full sm:flex-1 h-11 bg-muted border-border text-muted-foreground hover:bg-muted/70 hover:text-foreground">
                    Cancel
                  </Button>
                  <Button
                    onClick={handleConfirmStake}
                    className="w-full sm:flex-1 h-11 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
                    disabled={stakeMutation.isPending || !stakeAmount || parseFloat(stakeAmount) > parseFloat(usdtBalance) || parseFloat(stakeAmount) < parseFloat(selectedProduct.minAmount)}
                  >
                    {stakeMutation.isPending ? "Processing..." : "Confirm Stake"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>

      <StakingDetailsModal isOpen={showDetailsModal} onClose={handleCloseDetails} position={selectedPosition} />
    </Dialog>
  );
}
