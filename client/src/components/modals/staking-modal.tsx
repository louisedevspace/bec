import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CryptoIcon } from "@/components/crypto/crypto-icon";
import { useToast } from "@/hooks/use-toast";
import { cryptoApi } from "@/services/crypto-api";
import { apiRequest } from "@/lib/queryClient";
import { Coins, TrendingUp, Info, X, Lock, DollarSign, Clock, Sparkles, AlertTriangle, ArrowLeft } from "lucide-react";
import type { StakingPosition } from "@/types/crypto";
import { StakingDetailsModal } from "./staking-details-modal";
import { formatUsdNumber } from "@/utils/format-utils";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface StakingModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId?: string | null;
}

interface StakingProduct {
  duration: number;
  apy: string;
  minAmount: string;
  maxAmount: string;
  title: string;
}

export function StakingModal({ isOpen, onClose, userId }: StakingModalProps) {
  const [selectedProduct, setSelectedProduct] = useState<StakingProduct | null>(null);
  const [stakeAmount, setStakeAmount] = useState("");
  const [selectedPosition, setSelectedPosition] = useState<StakingPosition | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get user's USDT balance
  const { data: portfolio } = useQuery({
    queryKey: ["/api/portfolio", userId],
    queryFn: () => cryptoApi.getPortfolio(userId || ''),
    enabled: isOpen && !!userId,
  });
  
  const usdtBalance = portfolio?.find(p => p.symbol === 'USDT')?.available || '0';

  // Fetch user staking limits
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

  const DEFAULT_STAKING_PRODUCTS: StakingProduct[] = [
    { duration: 7, apy: "0.5", minAmount: "10", maxAmount: "10000", title: "7 Days" },
    { duration: 15, apy: "0.8", minAmount: "100", maxAmount: "50000", title: "15 Days" },
    { duration: 30, apy: "1.2", minAmount: "500", maxAmount: "100000", title: "30 Days" },
    { duration: 60, apy: "1.8", minAmount: "1000", maxAmount: "500000", title: "60 Days" },
    { duration: 90, apy: "2.5", minAmount: "5000", maxAmount: "1000000", title: "90 Days" },
    { duration: 180, apy: "4.0", minAmount: "10000", maxAmount: "5000000", title: "180 Days" },
  ];

  // Fetch staking products from API, fallback to defaults
  const { data: apiProducts } = useQuery<any[]>({
    queryKey: ["/api/staking-products"],
    queryFn: async () => {
      const res = await fetch("/api/staking-products");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const stakingProducts: StakingProduct[] = apiProducts && apiProducts.length > 0
    ? apiProducts.map((p: any) => ({
        duration: p.duration,
        apy: p.apy,
        minAmount: p.min_amount,
        maxAmount: p.max_amount,
        title: p.title,
      }))
    : DEFAULT_STAKING_PRODUCTS;

  const { data: positions, isLoading: positionsLoading } = useQuery({
    queryKey: ["/api/staking", userId],
    queryFn: () => cryptoApi.getStakingPositions(userId || ''),
    enabled: isOpen && !!userId,
  });

  const stakeMutation = useMutation({
    mutationFn: (positionData: Omit<StakingPosition, "id" | "startDate">) =>
      cryptoApi.createStakingPosition(positionData),
    onSuccess: () => {
      toast({ title: "Staking Success", description: "Your USDT has been staked successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/staking"] });
      setSelectedProduct(null);
      setStakeAmount("");
    },
    onError: (error: any) => {
      const msg = error?.message || "Failed to stake USDT. Please try again.";
      // Parse error message from server (format: "400: {\"message\":\"...\"}") 
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

  const handleStake = (product: StakingProduct) => setSelectedProduct(product);
  const handleShowDetails = (position: StakingPosition) => { setSelectedPosition(position); setShowDetailsModal(true); };
  const handleCloseDetails = () => { setShowDetailsModal(false); setSelectedPosition(null); };

  const handleConfirmStake = () => {
    if (!selectedProduct || !stakeAmount) {
      toast({ title: "Invalid Input", description: "Please enter a valid amount.", variant: "destructive" });
      return;
    }

    // Check if staking is disabled for this user
    if (stakingLimits && !stakingLimits.isEnabled) {
      toast({ title: "Staking Disabled", description: "Staking is currently disabled for your account. Contact support for details.", variant: "destructive" });
      return;
    }

    const amount = parseFloat(stakeAmount);
    const minAmount = parseFloat(selectedProduct.minAmount);
    const maxAmount = parseFloat(selectedProduct.maxAmount);
    const availableBalance = parseFloat(usdtBalance);

    // Apply user-specific limits if set
    const effectiveMin = stakingLimits?.minStakeAmount ? Math.max(minAmount, parseFloat(stakingLimits.minStakeAmount)) : minAmount;
    const effectiveMax = stakingLimits?.maxStakeAmount ? Math.min(maxAmount, parseFloat(stakingLimits.maxStakeAmount)) : maxAmount;

    if (amount < effectiveMin || amount > effectiveMax) {
      toast({ title: "Invalid Amount", description: `Amount must be between $${formatUsdNumber(effectiveMin)} and $${formatUsdNumber(effectiveMax)}.`, variant: "destructive" });
      return;
    }

    if (stakingLimits?.maxDuration && selectedProduct.duration > stakingLimits.maxDuration) {
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
      endDate: endDate.toISOString(),
      status: "active",
    });
  };

  const handleCancel = () => { setSelectedProduct(null); setStakeAmount(""); };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-4xl overflow-x-hidden" hideCloseButton>
        {/* Custom Header - Sticky within dialog */}
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

        {/* Content - no extra top padding needed since header is sticky within scroll container */}
        <div className="p-4 sm:p-6 space-y-6">
          {/* Staking disabled warning */}
          {stakingLimits && !stakingLimits.isEnabled && (
            <Alert className="bg-danger/10 border-danger/30 p-4">
              <AlertTriangle size={18} className="text-danger" />
              <AlertDescription>
                <p className="text-sm font-medium text-danger">Staking Disabled</p>
                <p className="text-xs text-danger/70 mt-0.5">Staking is currently disabled for your account. Please contact support for more details.</p>
              </AlertDescription>
            </Alert>
          )}

          {/* User-specific limit info */}
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
              {/* Balance Card */}
              <div className="bg-muted/50 rounded-xl border border-border p-5">
                <div className="flex items-center justify-between">
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
                  <div className="text-right">
                    <div className="flex items-center gap-2">
                      <Sparkles size={14} className="text-warning" />
                      <span className="text-sm text-muted-foreground">Ready to stake</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Staking Products */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-4 flex items-center gap-2">
                  <Lock size={14} />
                  Choose Your Staking Plan
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {stakingProducts.map((product, index) => {
                    const stakingDisabled = stakingLimits && !stakingLimits.isEnabled;
                    const durationExceeded = stakingLimits?.maxDuration ? product.duration > stakingLimits.maxDuration : false;
                    const isProductDisabled = !userId || stakingDisabled || durationExceeded;
                    const highestApy = Math.max(...stakingProducts.map(p => parseFloat(p.apy)));
                    const isBest = parseFloat(product.apy) === highestApy;

                    return (
                    <div
                      key={index}
                      className={`relative bg-muted/50 rounded-xl border border-border p-4 hover:border-primary/50 transition-colors cursor-pointer group ${isProductDisabled ? 'opacity-50 pointer-events-none' : ''}`}
                      onClick={() => !isProductDisabled && handleStake(product)}
                    >
                      {isBest && (
                        <div className="absolute top-2 right-2 bg-primary text-[10px] font-bold px-2 py-0.5 rounded-full text-primary-foreground">
                          BEST
                        </div>
                      )}
                      <div className="text-center mb-3">
                        <div className="text-xl sm:text-2xl font-bold text-success tabular-nums">{product.apy}%</div>
                        <div className="text-xs text-muted-foreground">APY</div>
                      </div>
                      <div className="space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground flex items-center gap-1"><Clock size={10} /> Duration</span>
                          <span className="text-foreground font-medium">{product.title}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground flex items-center gap-1"><DollarSign size={10} /> Min</span>
                          <span className="text-foreground font-medium tabular-nums">${formatUsdNumber(parseFloat(product.minAmount))}</span>
                        </div>
                      </div>
                      <button className="w-full mt-3 py-2 bg-primary/10 border border-primary/30 rounded-lg text-primary text-xs font-medium hover:bg-primary/20 transition-colors">
                        {durationExceeded ? 'Exceeds Limit' : 'Stake Now'}
                      </button>
                    </div>
                  );
                  })}
                </div>
              </div>

              {/* Active Positions */}
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
                      <div className="grid grid-cols-1 sm:grid-cols-2 border-b border-border">
                        <div className="p-4 text-center border-r border-border">
                          <div className="text-xs text-muted-foreground">Total Staked</div>
                          <div className="text-lg font-bold text-foreground tabular-nums">
                            {formatUsdNumber(positions.filter(p => p.status === 'active').reduce((sum, p) => sum + parseFloat(p.amount), 0))} USDT
                          </div>
                        </div>
                        <div className="p-4 text-center">
                          <div className="text-xs text-muted-foreground">Active Positions</div>
                          <div className="text-lg font-bold text-foreground tabular-nums">{positions.filter(p => p.status === 'active').length}</div>
                        </div>
                      </div>
                      {/* Desktop table */}
                      <div className="hidden sm:block">
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead className="bg-muted/50">
                              <tr className="text-xs text-muted-foreground">
                                <th className="text-left py-3 px-4">Asset</th>
                                <th className="text-center py-3 px-4">Amount</th>
                                <th className="text-center py-3 px-4">APY</th>
                                <th className="text-center py-3 px-4">Duration</th>
                                <th className="text-center py-3 px-4">Status</th>
                                <th className="text-center py-3 px-4">Details</th>
                              </tr>
                            </thead>
                            <tbody>
                              {positions.map((position: StakingPosition) => (
                                <tr key={position.id} className="border-t border-border">
                                  <td className="py-3 px-4 font-medium text-sm">
                                    <div className="flex items-center gap-2">
                                      <CryptoIcon symbol={position.symbol} size="xs" />
                                      {position.symbol}
                                    </div>
                                  </td>
                                  <td className="py-3 px-4 text-center text-sm tabular-nums">{formatUsdNumber(parseFloat(position.amount))}</td>
                                  <td className="py-3 px-4 text-center text-sm text-success tabular-nums">{position.apy}%</td>
                                  <td className="py-3 px-4 text-center text-sm tabular-nums">{position.duration}d</td>
                                  <td className="py-3 px-4 text-center">
                                    <span className={`px-2 py-1 rounded-full text-xs ${position.status === 'active' ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground'}`}>
                                      {position.status}
                                    </span>
                                  </td>
                                  <td className="py-3 px-4 text-center">
                                    <button onClick={() => handleShowDetails(position)} className="text-primary hover:text-primary/80">
                                      <Info size={16} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                      {/* Mobile stacked list */}
                      <div className="block sm:hidden">
                        <div className="divide-y divide-border">
                          {positions.map((position: StakingPosition) => (
                            <div key={position.id} className="p-4 flex items-center justify-between">
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-foreground flex items-center gap-1.5">
                                  <CryptoIcon symbol={position.symbol} size="xs" />
                                  {position.symbol}
                                </div>
                                <div className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                                  {formatUsdNumber(parseFloat(position.amount))} USDT • {position.apy}% APY • {position.duration}d
                                </div>
                                <div className="mt-1">
                                  <span className={`px-2 py-1 rounded-full text-xs ${position.status === 'active' ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground'}`}>
                                    {position.status}
                                  </span>
                                </div>
                              </div>
                              <button onClick={() => handleShowDetails(position)} className="ml-3 p-2 rounded-lg bg-muted border border-border text-primary hover:bg-muted/70">
                                <Info size={16} />
                              </button>
                            </div>
                          ))}
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
            /* Stake Confirmation */
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
                    <p className="text-sm text-muted-foreground">{selectedProduct.title} Plan</p>
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
                    <Clock size={20} className="mx-auto mb-2 text-info" />
                    <div className="text-lg font-bold text-foreground">{selectedProduct.duration} Days</div>
                    <div className="text-xs text-muted-foreground">Lock Period</div>
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
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total Interest</span>
                      <span className="text-success tabular-nums">{formatUsdNumber(parseFloat(stakeAmount) * parseFloat(selectedProduct.apy) / 100 * selectedProduct.duration / 365)} USDT</span>
                    </div>
                    <div className="flex justify-between text-sm pt-2 border-t border-border">
                      <span className="text-muted-foreground font-medium">Total Return</span>
                      <span className="text-foreground font-bold tabular-nums">{formatUsdNumber(parseFloat(stakeAmount) + parseFloat(stakeAmount) * parseFloat(selectedProduct.apy) / 100 * selectedProduct.duration / 365)} USDT</span>
                    </div>
                  </div>
                )}

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
