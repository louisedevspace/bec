import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Info, X, TrendingUp, Clock, DollarSign, Coins } from "lucide-react";
import { CryptoIcon } from "@/components/crypto/crypto-icon";
import type { StakingPosition } from "@/types/crypto";
import { formatUsdNumber } from "@/utils/format-utils";
import { formatDateTime, safeDate } from "@/lib/date-utils";

interface StakingDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  position: StakingPosition | null;
}

export function StakingDetailsModal({ isOpen, onClose, position }: StakingDetailsModalProps) {
  if (!position) return null;

  const startDate = safeDate(position.startDate) || new Date();
  const endDate = safeDate(position.endDate) || new Date();
  const now = new Date();
  
  const daysElapsed = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const totalDays = position.duration;
  const dailyRate = parseFloat(position.apy) / 100 / 365;
  const interestEarned = parseFloat(position.amount) * dailyRate * Math.min(daysElapsed, totalDays);
  const totalInterest = parseFloat(position.amount) * (parseFloat(position.apy) / 100) * (totalDays / 365);

  const isExpired = now > endDate;
  const isActive = position.status === 'active' && !isExpired;
  const isCompleted = position.status === 'completed' || isExpired;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto bg-[#111] border border-[#1e1e1e] text-white" hideCloseButton>
        {/* Custom Header - Fixed Position */}
        <div className="fixed top-0 left-0 right-0 bg-[#111] border-b border-[#1e1e1e] px-5 py-4 flex items-center justify-between z-50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center">
              <Info size={16} className="text-blue-400" />
            </div>
            <h2 className="text-base font-bold text-white">Position Details</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center hover:bg-[#2a2a2a] transition-colors">
            <X size={14} className="text-gray-400" />
          </button>
        </div>

        {/* Content with padding to account for fixed header */}
        <div className="pt-20 p-5 space-y-5">
          {/* Position Overview */}
          <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-xl border border-blue-500/20 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-gray-500">Position #{position.id}</span>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                isActive 
                  ? 'bg-green-500/20 text-green-400' 
                  : isCompleted
                  ? 'bg-gray-500/20 text-gray-400'
                  : 'bg-yellow-500/20 text-yellow-400'
              }`}>
                {isActive ? 'Active' : isCompleted ? 'Completed' : 'Pending'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <CryptoIcon symbol={position.symbol} size="lg" />
              <div>
                <div className="text-lg font-bold text-white">{position.symbol}</div>
                <div className="text-xs text-gray-500">Staking Asset</div>
              </div>
            </div>
          </div>

          {/* Staking Details */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[#0a0a0a] rounded-xl border border-[#1e1e1e] p-3">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign size={12} className="text-gray-500" />
                <span className="text-xs text-gray-500">Amount</span>
              </div>
              <div className="text-base font-bold text-white">
                {formatUsdNumber(parseFloat(position.amount))}
              </div>
            </div>
            <div className="bg-[#0a0a0a] rounded-xl border border-[#1e1e1e] p-3">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp size={12} className="text-gray-500" />
                <span className="text-xs text-gray-500">APY</span>
              </div>
              <div className="text-base font-bold text-green-400">{position.apy}%</div>
            </div>
            <div className="bg-[#0a0a0a] rounded-xl border border-[#1e1e1e] p-3">
              <div className="flex items-center gap-2 mb-1">
                <Clock size={12} className="text-gray-500" />
                <span className="text-xs text-gray-500">Duration</span>
              </div>
              <div className="text-base font-bold text-white">{position.duration} days</div>
            </div>
            <div className="bg-[#0a0a0a] rounded-xl border border-[#1e1e1e] p-3">
              <div className="flex items-center gap-2 mb-1">
                <Clock size={12} className="text-gray-500" />
                <span className="text-xs text-gray-500">Progress</span>
              </div>
              <div className="text-base font-bold text-white">{Math.min(daysElapsed, totalDays)}/{totalDays}d</div>
            </div>
          </div>

          {/* Interest Information */}
          <div className="bg-[#0a0a0a] rounded-xl border border-[#1e1e1e] p-4">
            <h4 className="text-sm font-semibold text-gray-400 mb-3 flex items-center gap-2">
              <Coins size={14} />
              Interest Earnings
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#0a0a0a] rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">Earned So Far</div>
                <div className="text-sm font-bold text-green-400">{formatUsdNumber(interestEarned)} USDT</div>
              </div>
              <div className="bg-[#0a0a0a] rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">Total Expected</div>
                <div className="text-sm font-bold text-green-400">{formatUsdNumber(totalInterest)} USDT</div>
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="bg-[#0a0a0a] rounded-xl border border-[#1e1e1e] p-4">
            <h4 className="text-sm font-semibold text-gray-400 mb-3">Timeline</h4>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">Started</span>
                <span className="text-xs text-white">{startDate.toLocaleDateString()} {startDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">Ends</span>
                <span className="text-xs text-white">{endDate.toLocaleDateString()} {endDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
              </div>
            </div>
          </div>

          {/* Status Info */}
          <div className={`rounded-xl p-4 ${isCompleted ? 'bg-gray-500/10 border border-gray-500/20' : 'bg-blue-500/10 border border-blue-500/20'}`}>
            <div className="flex gap-3">
              <Info size={16} className={isCompleted ? 'text-gray-400' : 'text-blue-400'} />
              <div className="text-xs">
                {isCompleted ? (
                  <ul className="space-y-1 text-gray-400">
                    <li>• Position completed successfully</li>
                    <li>• Funds returned to your balance</li>
                  </ul>
                ) : (
                  <ul className="space-y-1 text-blue-300">
                    <li>• Amount locked for {position.duration} days</li>
                    <li>• Interest calculated daily</li>
                    <li>• Auto-release after maturity</li>
                  </ul>
                )}
              </div>
            </div>
          </div>

          <Button onClick={onClose} className="w-full h-11 bg-[#1a1a1a] border border-[#2a2a2a] text-gray-300 hover:bg-[#2a2a2a]">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
