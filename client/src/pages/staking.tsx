import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@/hooks/use-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CryptoIcon } from "@/components/crypto/crypto-icon";
import { useToast } from "@/hooks/use-toast";
import { cryptoApi } from "@/services/crypto-api";
import { apiRequest } from "@/lib/queryClient";
import { formatUsdNumber } from "@/utils/format-utils";
import {
  Layers, ClipboardList, Zap, Users, Unlock, Lock, Clock,
  DollarSign, Info, ArrowLeft, Loader2,
} from "lucide-react";

type PageTab = "plans" | "orders";
type StakeType = "flexible" | "fixed";

interface RawStakingProduct {
  id?: number;
  title: string;
  duration: number;
  apy: string;
  apy_max?: string | null;
  type: StakeType;
  min_amount: string;
  max_amount: string;
  max_participants?: number | null;
  requires_approval?: boolean;
  participantCount?: number;
}

interface StakingProduct {
  id?: number;
  title: string;
  duration: number;
  apy: string;
  apyMax: string | null;
  type: StakeType;
  minAmount: string;
  maxAmount: string;
  maxParticipants: number | null;
  requiresApproval: boolean;
  participantCount: number;
}

interface StakingPositionRow {
  id: number;
  userId: number;
  symbol: string;
  amount: string;
  apy: string;
  duration: number;
  type: StakeType;
  startDate: string;
  endDate: string;
  status: "active" | "completed" | "pending_approval";
}

function normalizeProduct(p: RawStakingProduct): StakingProduct {
  return {
    id: p.id,
    title: p.title,
    duration: p.duration,
    apy: p.apy,
    apyMax: p.apy_max ?? null,
    type: p.type === "flexible" ? "flexible" : "fixed",
    minAmount: p.min_amount,
    maxAmount: p.max_amount,
    maxParticipants: p.max_participants ?? null,
    requiresApproval: !!p.requires_approval,
    participantCount: p.participantCount ?? 0,
  };
}

function daysElapsed(startDate: string): number {
  return Math.max(0, (Date.now() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24));
}

function calcEarned(position: StakingPositionRow): number {
  const dailyRate = parseFloat(position.apy) / 100 / 365;
  const elapsed = daysElapsed(position.startDate);
  const capped = position.type === "fixed" ? Math.min(elapsed, position.duration) : elapsed;
  return parseFloat(position.amount) * dailyRate * capped;
}

const pillClass = (active: boolean) =>
  `px-4 py-2 rounded-full text-xs font-semibold transition-colors flex items-center gap-1.5 ${
    active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
  }`;

export default function StakingPage() {
  const { user } = useUser();
  const userId = user?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<PageTab>("plans");
  const [selectedProduct, setSelectedProduct] = useState<StakingProduct | null>(null);
  const [stakeAmount, setStakeAmount] = useState("");

  const { data: portfolio } = useQuery({
    queryKey: ["/api/portfolio", userId],
    queryFn: () => cryptoApi.getPortfolio(userId || ""),
    enabled: !!userId,
  });

  const usdtBalance = portfolio?.find((p) => p.symbol === "USDT")?.available || "0";

  const { data: rawProducts, isLoading: productsLoading } = useQuery<RawStakingProduct[]>({
    queryKey: ["/api/staking-products"],
    queryFn: async () => {
      const res = await fetch("/api/staking-products");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const products: StakingProduct[] = useMemo(
    () => (rawProducts || []).map(normalizeProduct),
    [rawProducts]
  );

  const { data: positions, isLoading: positionsLoading } = useQuery<StakingPositionRow[]>({
    queryKey: ["/api/staking", userId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/staking/${userId}`);
      return res.json();
    },
    enabled: !!userId,
  });

  const activePositions = (positions || []).filter((p) => p.status === "active");
  const totalStaked = activePositions.reduce((sum, p) => sum + parseFloat(p.amount), 0);
  const totalEarnedSoFar = activePositions.reduce((sum, p) => sum + calcEarned(p), 0);

  const stakeMutation = useMutation({
    mutationFn: (positionData: Parameters<typeof cryptoApi.createStakingPosition>[0]) =>
      cryptoApi.createStakingPosition(positionData),
    onSuccess: () => {
      toast({
        title: selectedProduct?.requiresApproval ? "Booking Submitted" : "Staking Success",
        description: selectedProduct?.requiresApproval
          ? "Your booking has been submitted for review."
          : "Your USDT has been staked successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/staking"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staking-products"] });
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

  const handleSelectProduct = (product: StakingProduct) => setSelectedProduct(product);
  const handleCancelSelection = () => { setSelectedProduct(null); setStakeAmount(""); };

  const handleConfirmStake = () => {
    if (!selectedProduct || !stakeAmount) {
      toast({ title: "Invalid Input", description: "Please enter a valid amount.", variant: "destructive" });
      return;
    }

    const amount = parseFloat(stakeAmount);
    const minAmount = parseFloat(selectedProduct.minAmount);
    const maxAmount = parseFloat(selectedProduct.maxAmount);
    const availableBalance = parseFloat(usdtBalance);

    if (amount < minAmount || amount > maxAmount) {
      toast({ title: "Invalid Amount", description: `Amount must be between $${formatUsdNumber(minAmount)} and $${formatUsdNumber(maxAmount)}.`, variant: "destructive" });
      return;
    }

    if (amount > availableBalance) {
      toast({ title: "Insufficient Balance", description: `You only have ${formatUsdNumber(availableBalance)} USDT available.`, variant: "destructive" });
      return;
    }

    const endDate = new Date();
    endDate.setDate(endDate.getDate() + selectedProduct.duration);
    stakeMutation.mutate({
      userId: parseInt(userId || "0"),
      symbol: "USDT",
      amount: stakeAmount,
      apy: selectedProduct.apy,
      duration: selectedProduct.duration,
      type: selectedProduct.type,
      endDate: endDate.toISOString(),
      status: "active",
    });
  };

  return (
    <div className="min-h-screen bg-background pb-20 lg:pb-12">
      <div className="max-w-4xl mx-auto px-4 lg:px-6 pt-4 lg:pt-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Staking</h1>
          <p className="text-sm text-muted-foreground mt-1">Grow your assets with DeFi staking</p>
        </div>

        <div className="inline-flex bg-muted rounded-full p-1 gap-1 mb-6">
          <button onClick={() => setActiveTab("plans")} className={pillClass(activeTab === "plans")}>
            <Layers size={14} /> Plans
          </button>
          <button onClick={() => setActiveTab("orders")} className={pillClass(activeTab === "orders")}>
            <ClipboardList size={14} /> Orders
          </button>
        </div>

        {activeTab === "plans" ? (
          selectedProduct ? (
            <div className="bg-muted/50 rounded-xl border border-border overflow-hidden">
              <div className="bg-primary/10 p-5 border-b border-border">
                <button
                  onClick={handleCancelSelection}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to plans
                </button>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-foreground">{selectedProduct.requiresApproval ? "Book" : "Stake"} USDT</h3>
                    <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                      {selectedProduct.type === "flexible" ? <Zap className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                      {selectedProduct.title} Plan
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold text-success tabular-nums">
                      {selectedProduct.apyMax ? `${selectedProduct.apy}%–${selectedProduct.apyMax}%` : `${selectedProduct.apy}%`}
                    </div>
                    <div className="text-xs text-muted-foreground">{selectedProduct.apyMax ? "APY Range" : "APY"}</div>
                  </div>
                </div>
              </div>

              <div className="p-5 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-card border border-border rounded-xl p-4 text-center">
                    {selectedProduct.type === "flexible" ? (
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
                    {selectedProduct.type === "fixed" && (
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

                {selectedProduct.requiresApproval ? (
                  <Alert className="bg-info/10 border-info/20 p-4">
                    <Info size={18} className="text-info" />
                    <AlertDescription className="text-sm">
                      <p className="font-medium text-info mb-1">Approval required</p>
                      <p className="text-xs text-info/80">Your booking will be reviewed and confirmed by our team before it becomes active.</p>
                    </AlertDescription>
                  </Alert>
                ) : selectedProduct.type === "flexible" ? (
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
                  <Button onClick={handleCancelSelection} variant="outline" className="w-full sm:flex-1 h-11 bg-muted border-border text-muted-foreground hover:bg-muted/70 hover:text-foreground">
                    Cancel
                  </Button>
                  <Button
                    onClick={handleConfirmStake}
                    className="w-full sm:flex-1 h-11 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
                    disabled={stakeMutation.isPending || !stakeAmount || parseFloat(stakeAmount) > parseFloat(usdtBalance) || parseFloat(stakeAmount) < parseFloat(selectedProduct.minAmount)}
                  >
                    {stakeMutation.isPending ? "Processing..." : selectedProduct.requiresApproval ? "Book This Plan" : "Confirm Stake"}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                <Layers size={14} />
                Available Plans
              </h2>

              {productsLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="bg-card rounded-xl border border-border p-5 animate-pulse">
                      <div className="h-5 w-32 bg-muted rounded mb-3" />
                      <div className="h-8 w-48 bg-muted rounded" />
                    </div>
                  ))}
                </div>
              ) : products.length === 0 ? (
                <div className="bg-card rounded-xl border border-border text-center py-12">
                  <Layers size={24} className="text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">No plans available</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {products.map((product, index) => {
                    const isFlexible = product.type === "flexible";
                    const isFull = product.maxParticipants !== null && product.participantCount >= product.maxParticipants;
                    return (
                      <div key={product.id ?? index} className="bg-card rounded-xl border border-border overflow-hidden">
                        <div className="p-4 sm:p-5">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0">
                                {isFlexible ? <Zap size={18} className="text-primary" /> : <Layers size={18} className="text-primary" />}
                              </div>
                              <div className="min-w-0">
                                <div className="font-bold text-foreground truncate">{product.title}</div>
                                <div className="text-xs text-muted-foreground">Plan {index + 1} • {product.duration} days</div>
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <div className="text-xl sm:text-2xl font-bold text-success tabular-nums leading-tight">
                                {product.apyMax ? `${product.apy}%–${product.apyMax}%` : `${product.apy}%`}
                              </div>
                              <div className="text-[11px] text-muted-foreground">{product.apyMax ? "APY Range" : "APY"}</div>
                            </div>
                          </div>

                          {product.maxParticipants !== null && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-3">
                              <Users size={12} />
                              {product.participantCount}/{product.maxParticipants} participations used
                            </div>
                          )}

                          <div className="border-t border-border mt-4 pt-3 flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">Investment Range</span>
                            <span className="text-sm font-semibold text-foreground tabular-nums">
                              ${formatUsdNumber(parseFloat(product.minAmount))}–${formatUsdNumber(parseFloat(product.maxAmount))}
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={() => !isFull && handleSelectProduct(product)}
                          disabled={isFull}
                          className={`w-full py-3 text-sm font-semibold border-t transition-colors ${
                            isFull
                              ? "bg-muted text-muted-foreground border-border cursor-not-allowed"
                              : "bg-primary/10 border-primary/20 text-primary hover:bg-primary/20"
                          }`}
                        >
                          {isFull ? "Fully Booked" : product.requiresApproval ? "Book" : "Stake"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )
        ) : (
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
              <ClipboardList size={14} />
              Your Orders
            </h2>

            <div className="bg-muted/50 rounded-xl border border-border overflow-hidden">
              {positionsLoading ? (
                <div className="text-center py-12">
                  <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">Loading orders...</p>
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
                            <th className="text-center py-3 px-4">Status</th>
                            <th className="text-center py-3 px-4">Progress</th>
                            <th className="text-center py-3 px-4">Earned</th>
                            <th className="text-center py-3 px-4">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {positions.map((position) => {
                            const isFlex = position.type === "flexible";
                            const isPending = position.status === "pending_approval";
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
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${isFlex ? "bg-info/15 text-info" : "bg-primary/15 text-primary"}`}>
                                    {isFlex ? "Flexible" : `${position.duration}d Fixed`}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-center">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                    isPending ? "bg-warning/15 text-warning" : position.status === "active" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
                                  }`}>
                                    {isPending ? "Pending Approval" : position.status === "active" ? "Active" : "Completed"}
                                  </span>
                                </td>
                                <td className="py-3 px-4">
                                  {isPending ? (
                                    <div className="text-center text-[11px] text-muted-foreground">—</div>
                                  ) : position.status === "active" ? (
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
                                <td className="py-3 px-4 text-center text-sm tabular-nums">
                                  {isPending ? (
                                    <span className="text-xs text-muted-foreground">Awaiting confirmation</span>
                                  ) : (
                                    <span className="text-success">+{formatUsdNumber(calcEarned(position))}</span>
                                  )}
                                </td>
                                <td className="py-3 px-4">
                                  <div className="flex items-center justify-center">
                                    {position.status === "active" && isFlex && (
                                      <button
                                        onClick={() => unstakeMutation.mutate(position.id)}
                                        disabled={unstakeMutation.isPending}
                                        className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-warning/10 text-warning hover:bg-warning/20 transition-colors disabled:opacity-50 flex items-center gap-1"
                                      >
                                        {unstakeMutation.isPending ? <Loader2 size={10} className="animate-spin" /> : <Unlock size={10} />}
                                        Unstake
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="block sm:hidden">
                    <div className="divide-y divide-border">
                      {positions.map((position) => {
                        const isFlex = position.type === "flexible";
                        const isPending = position.status === "pending_approval";
                        const elapsed = daysElapsed(position.startDate);
                        const pct = isFlex ? 100 : Math.min(100, (elapsed / position.duration) * 100);
                        return (
                          <div key={position.id} className="p-4">
                            <div className="flex items-center justify-between">
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-foreground flex items-center gap-1.5 flex-wrap">
                                  <CryptoIcon symbol={position.symbol} size="xs" />
                                  {position.symbol}
                                  <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-medium ${isFlex ? "bg-info/15 text-info" : "bg-primary/15 text-primary"}`}>
                                    {isFlex ? "Flexible" : "Fixed"}
                                  </span>
                                  <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-medium ${
                                    isPending ? "bg-warning/15 text-warning" : position.status === "active" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
                                  }`}>
                                    {isPending ? "Pending Approval" : position.status === "active" ? "Active" : "Completed"}
                                  </span>
                                </div>
                                <div className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                                  {formatUsdNumber(parseFloat(position.amount))} USDT • {position.apy}% APY
                                </div>
                                <div className="text-xs mt-0.5 tabular-nums">
                                  {isPending ? (
                                    <span className="text-muted-foreground">Awaiting confirmation</span>
                                  ) : (
                                    <span className="text-success">+{formatUsdNumber(calcEarned(position))} earned</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {position.status === "active" && isFlex && (
                                  <button
                                    onClick={() => unstakeMutation.mutate(position.id)}
                                    disabled={unstakeMutation.isPending}
                                    className="text-[10px] font-semibold px-2 py-1.5 rounded-lg bg-warning/10 text-warning disabled:opacity-50 flex items-center gap-1"
                                  >
                                    {unstakeMutation.isPending ? <Loader2 size={10} className="animate-spin" /> : <Unlock size={10} />}
                                    Unstake
                                  </button>
                                )}
                              </div>
                            </div>
                            {position.status === "active" && !isFlex && (
                              <div className="flex items-center gap-2 mt-2">
                                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                                  <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                                </div>
                                <span className="text-[10px] text-muted-foreground tabular-nums flex-shrink-0">{Math.min(Math.floor(elapsed), position.duration)}/{position.duration}d</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-muted rounded-full mx-auto mb-4 flex items-center justify-center">
                    <ClipboardList size={24} className="text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground">No orders yet</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">Choose a plan to start earning</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
