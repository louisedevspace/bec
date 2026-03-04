import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cryptoApi } from "@/services/crypto-api";
import { Coins, TrendingUp, Info, X, Lock, DollarSign, Clock, Sparkles } from "lucide-react";
import type { StakingPosition } from "@/types/crypto";
import { StakingDetailsModal } from "./staking-details-modal";
import { formatUsdNumber } from "@/utils/format-utils";

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

  const stakingProducts: StakingProduct[] = [
    { duration: 7, apy: "0.5", minAmount: "10", maxAmount: "10000", title: "7 Days" },
    { duration: 15, apy: "0.8", minAmount: "100", maxAmount: "50000", title: "15 Days" },
    { duration: 30, apy: "1.2", minAmount: "500", maxAmount: "100000", title: "30 Days" },
    { duration: 60, apy: "1.8", minAmount: "1000", maxAmount: "500000", title: "60 Days" },
    { duration: 90, apy: "2.5", minAmount: "5000", maxAmount: "1000000", title: "90 Days" },
    { duration: 180, apy: "4.0", minAmount: "10000", maxAmount: "5000000", title: "180 Days" },
  ];

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
    onError: () => {
      toast({ title: "Staking Failed", description: "Failed to stake USDT. Please try again.", variant: "destructive" });
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
      <DialogContent className="sm:max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto overflow-x-hidden bg-[#0a0a0a] border border-[#252525] text-white" hideCloseButton>
        {/* Custom Header - Fixed Position */}
        <div className="fixed top-0 left-0 right-0 bg-[#0a0a0a] border-b border-[#252525] px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between z-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
              <TrendingUp size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">USDT Staking</h2>
              <p className="text-xs text-gray-500">Earn passive income on your crypto</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center hover:bg-[#2a2a2a] transition-colors">
            <X size={16} className="text-gray-400" />
          </button>
        </div>

        {/* Content with padding to account for fixed header */}
        <div className="pt-20 p-4 sm:p-6 space-y-6">
          {!selectedProduct ? (
            <>
              {/* Balance Card */}
              <div className="bg-gradient-to-r from-[#111] to-[#0f0f0f] rounded-2xl border border-[#252525] p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-green-500/10 rounded-xl flex items-center justify-center">
                      <DollarSign size={24} className="text-green-400" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wider">Available Balance</p>
                      <p className="text-2xl font-bold text-white">
                        {userId ? `${formatUsdNumber(parseFloat(usdtBalance))} USDT` : '---'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-2">
                      <Sparkles size={14} className="text-yellow-400" />
                      <span className="text-sm text-gray-400">Ready to stake</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Staking Products */}
              <div>
                <h3 className="text-sm font-semibold text-gray-400 mb-4 flex items-center gap-2">
                  <Lock size={14} />
                  Choose Your Staking Plan
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {stakingProducts.map((product, index) => (
                    <div 
                      key={index}
                      className={`relative bg-[#111] rounded-xl border border-[#252525] p-4 hover:border-blue-500/50 transition-all cursor-pointer group ${!userId ? 'opacity-50 pointer-events-none' : ''}`}
                      onClick={() => userId && handleStake(product)}
                    >
                      {product.apy === "4.0" && (
                        <div className="absolute top-2 right-2 bg-gradient-to-r from-yellow-500 to-orange-500 text-[10px] font-bold px-2 py-0.5 rounded-full text-black">
                          BEST
                        </div>
                      )}
                      <div className="text-center mb-3">
                        <div className="text-xl sm:text-2xl font-bold text-green-400">{product.apy}%</div>
                        <div className="text-xs text-gray-500">APY</div>
                      </div>
                      <div className="space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-500 flex items-center gap-1"><Clock size={10} /> Duration</span>
                          <span className="text-white font-medium">{product.title}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-500 flex items-center gap-1"><DollarSign size={10} /> Min</span>
                          <span className="text-white font-medium">${formatUsdNumber(parseFloat(product.minAmount))}</span>
                        </div>
                      </div>
                      <button className="w-full mt-3 py-2 bg-blue-500/10 border border-blue-500/30 rounded-lg text-blue-400 text-xs font-medium hover:bg-blue-500/20 transition-colors">
                        Stake Now
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Active Positions */}
              <div>
                <h3 className="text-sm font-semibold text-gray-400 mb-4 flex items-center gap-2">
                  <Coins size={14} />
                  Your Active Stakes
                </h3>
                <div className="bg-[#111] rounded-xl border border-[#252525] overflow-hidden">
                  {positionsLoading ? (
                    <div className="text-center py-12">
                      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                      <p className="text-gray-500 text-sm">Loading positions...</p>
                    </div>
                  ) : positions && positions.length > 0 ? (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 border-b border-[#252525]">
                        <div className="p-4 text-center border-r border-[#252525]">
                          <div className="text-xs text-gray-500">Total Staked</div>
                          <div className="text-lg font-bold text-white">
                            {formatUsdNumber(positions.filter(p => p.status === 'active').reduce((sum, p) => sum + parseFloat(p.amount), 0))} USDT
                          </div>
                        </div>
                        <div className="p-4 text-center">
                          <div className="text-xs text-gray-500">Active Positions</div>
                          <div className="text-lg font-bold text-white">{positions.filter(p => p.status === 'active').length}</div>
                        </div>
                      </div>
                      {/* Desktop table */}
                      <div className="hidden sm:block">
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead className="bg-[#0a0a0a]">
                              <tr className="text-xs text-gray-500">
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
                                <tr key={position.id} className="border-t border-[#252525]">
                                  <td className="py-3 px-4 font-medium text-sm">{position.symbol}</td>
                                  <td className="py-3 px-4 text-center text-sm">{formatUsdNumber(parseFloat(position.amount))}</td>
                                  <td className="py-3 px-4 text-center text-sm text-green-400">{position.apy}%</td>
                                  <td className="py-3 px-4 text-center text-sm">{position.duration}d</td>
                                  <td className="py-3 px-4 text-center">
                                    <span className={`px-2 py-1 rounded-full text-xs ${position.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
                                      {position.status}
                                    </span>
                                  </td>
                                  <td className="py-3 px-4 text-center">
                                    <button onClick={() => handleShowDetails(position)} className="text-blue-400 hover:text-blue-300">
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
                        <div className="divide-y divide-[#252525]">
                          {positions.map((position: StakingPosition) => (
                            <div key={position.id} className="p-4 flex items-center justify-between">
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-white">{position.symbol}</div>
                                <div className="text-xs text-gray-500 mt-0.5">
                                  {formatUsdNumber(parseFloat(position.amount))} USDT • {position.apy}% APY • {position.duration}d
                                </div>
                                <div className="mt-1">
                                  <span className={`px-2 py-1 rounded-full text-xs ${position.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
                                    {position.status}
                                  </span>
                                </div>
                              </div>
                              <button onClick={() => handleShowDetails(position)} className="ml-3 p-2 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] text-blue-400 hover:bg-[#2a2a2a]">
                                <Info size={16} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-12">
                      <div className="w-16 h-16 bg-[#0a0a0a] rounded-full mx-auto mb-4 flex items-center justify-center">
                        <Coins size={24} className="text-gray-600" />
                      </div>
                      <p className="text-gray-500">No active stakes yet</p>
                      <p className="text-xs text-gray-600 mt-1">Choose a plan above to start earning</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            /* Stake Confirmation */
            <div className="bg-[#111] rounded-2xl border border-[#252525] overflow-hidden">
              <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 p-5 border-b border-[#252525]">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-white">Stake USDT</h3>
                    <p className="text-sm text-gray-400">{selectedProduct.title} Plan</p>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold text-green-400">{selectedProduct.apy}%</div>
                    <div className="text-xs text-gray-500">APY</div>
                  </div>
                </div>
              </div>
              
              <div className="p-5 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-[#0a0a0a] rounded-xl p-4 text-center">
                    <Clock size={20} className="mx-auto mb-2 text-blue-400" />
                    <div className="text-lg font-bold text-white">{selectedProduct.duration} Days</div>
                    <div className="text-xs text-gray-500">Lock Period</div>
                  </div>
                  <div className="bg-[#0a0a0a] rounded-xl p-4 text-center">
                    <DollarSign size={20} className="mx-auto mb-2 text-green-400" />
                    <div className="text-lg font-bold text-white">${formatUsdNumber(parseFloat(selectedProduct.minAmount))}</div>
                    <div className="text-xs text-gray-500">Minimum</div>
                  </div>
                </div>

                <div>
                  <label className="text-sm text-gray-400 mb-2 block">Amount to Stake (USDT)</label>
                  <div className="relative">
                    <Input
                      type="number"
                      step="0.01"
                      placeholder={`Min: ${formatUsdNumber(parseFloat(selectedProduct.minAmount))}`}
                      value={stakeAmount}
                      onChange={(e) => setStakeAmount(e.target.value)}
                      className="bg-[#0a0a0a] border-[#2a2a2a] text-white text-lg h-12 rounded-xl"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">
                      Balance: {formatUsdNumber(parseFloat(usdtBalance))}
                    </div>
                  </div>
                </div>

                {stakeAmount && parseFloat(stakeAmount) > 0 && (
                  <div className="bg-[#0a0a0a] rounded-xl p-4 space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Daily Earnings</span>
                      <span className="text-white">{formatUsdNumber(parseFloat(stakeAmount) * parseFloat(selectedProduct.apy) / 100 / 365)} USDT</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Total Interest</span>
                      <span className="text-green-400">{formatUsdNumber(parseFloat(stakeAmount) * parseFloat(selectedProduct.apy) / 100 * selectedProduct.duration / 365)} USDT</span>
                    </div>
                    <div className="flex justify-between text-sm pt-2 border-t border-[#252525]">
                      <span className="text-gray-400 font-medium">Total Return</span>
                      <span className="text-white font-bold">{formatUsdNumber(parseFloat(stakeAmount) + parseFloat(stakeAmount) * parseFloat(selectedProduct.apy) / 100 * selectedProduct.duration / 365)} USDT</span>
                    </div>
                  </div>
                )}

                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                  <div className="flex gap-3">
                    <Info size={18} className="text-blue-400 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-blue-300">
                      <p className="font-medium mb-1">Important</p>
                      <ul className="text-xs space-y-1 text-blue-200">
                        <li>• Your USDT will be locked for {selectedProduct.duration} days</li>
                        <li>• Interest calculated daily at {selectedProduct.apy}% APY</li>
                        <li>• Funds auto-return to available balance after maturity</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <Button onClick={handleCancel} variant="outline" className="w-full sm:flex-1 h-11 bg-[#1a1a1a] border-[#2a2a2a] text-gray-300 hover:bg-[#2a2a2a]">
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleConfirmStake}
                    className="w-full sm:flex-1 h-11 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white"
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
