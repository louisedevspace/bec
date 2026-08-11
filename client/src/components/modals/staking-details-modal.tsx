import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
      <DialogContent className="sm:max-w-md" hideCloseButton>
        {/* Custom Header - Fixed Position */}
        <div className="fixed top-0 left-0 right-0 bg-card border-b border-border px-5 py-4 flex items-center justify-between z-50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
              <Info size={16} className="text-primary" />
            </div>
            <h2 className="text-base font-bold text-foreground">Position Details</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-muted border border-border flex items-center justify-center hover:bg-muted/70 transition-colors">
            <X size={14} className="text-muted-foreground" />
          </button>
        </div>

        {/* Content with padding to account for fixed header */}
        <div className="pt-20 p-5 space-y-5">
          {/* Position Overview */}
          <div className="bg-primary/5 rounded-xl border border-primary/20 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-muted-foreground">Position #{position.id}</span>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                isActive
                  ? 'bg-success/20 text-success'
                  : isCompleted
                  ? 'bg-muted text-muted-foreground'
                  : 'bg-warning/20 text-warning'
              }`}>
                {isActive ? 'Active' : isCompleted ? 'Completed' : 'Pending'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <CryptoIcon symbol={position.symbol} size="lg" />
              <div>
                <div className="text-lg font-bold text-foreground">{position.symbol}</div>
                <div className="text-xs text-muted-foreground">Staking Asset</div>
              </div>
            </div>
          </div>

          {/* Staking Details */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-muted/50 rounded-xl border border-border p-3">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign size={12} className="text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Amount</span>
              </div>
              <div className="text-base font-bold text-foreground tabular-nums">
                {formatUsdNumber(parseFloat(position.amount))}
              </div>
            </div>
            <div className="bg-muted/50 rounded-xl border border-border p-3">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp size={12} className="text-muted-foreground" />
                <span className="text-xs text-muted-foreground">APY</span>
              </div>
              <div className="text-base font-bold text-success tabular-nums">{position.apy}%</div>
            </div>
            <div className="bg-muted/50 rounded-xl border border-border p-3">
              <div className="flex items-center gap-2 mb-1">
                <Clock size={12} className="text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Duration</span>
              </div>
              <div className="text-base font-bold text-foreground tabular-nums">{position.duration} days</div>
            </div>
            <div className="bg-muted/50 rounded-xl border border-border p-3">
              <div className="flex items-center gap-2 mb-1">
                <Clock size={12} className="text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Progress</span>
              </div>
              <div className="text-base font-bold text-foreground tabular-nums">{Math.min(daysElapsed, totalDays)}/{totalDays}d</div>
            </div>
          </div>

          {/* Interest Information */}
          <div className="bg-muted/50 rounded-xl border border-border p-4">
            <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
              <Coins size={14} />
              Interest Earnings
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-card border border-border rounded-lg p-3">
                <div className="text-xs text-muted-foreground mb-1">Earned So Far</div>
                <div className="text-sm font-bold text-success tabular-nums">{formatUsdNumber(interestEarned)} USDT</div>
              </div>
              <div className="bg-card border border-border rounded-lg p-3">
                <div className="text-xs text-muted-foreground mb-1">Total Expected</div>
                <div className="text-sm font-bold text-success tabular-nums">{formatUsdNumber(totalInterest)} USDT</div>
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="bg-muted/50 rounded-xl border border-border p-4">
            <h4 className="text-sm font-semibold text-muted-foreground mb-3">Timeline</h4>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">Started</span>
                <span className="text-xs text-foreground tabular-nums">{startDate.toLocaleDateString()} {startDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">Ends</span>
                <span className="text-xs text-foreground tabular-nums">{endDate.toLocaleDateString()} {endDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
              </div>
            </div>
          </div>

          {/* Status Info */}
          <Alert className={isCompleted ? 'bg-muted/50 border-border p-4' : 'bg-info/10 border-info/20 p-4'}>
            <Info size={16} className={isCompleted ? 'text-muted-foreground' : 'text-info'} />
            <AlertDescription className="text-xs">
              {isCompleted ? (
                <ul className="space-y-1 text-muted-foreground">
                  <li>• Position completed successfully</li>
                  <li>• Funds returned to your balance</li>
                </ul>
              ) : (
                <ul className="space-y-1 text-info/90">
                  <li>• Amount locked for {position.duration} days</li>
                  <li>• Interest calculated daily</li>
                  <li>• Auto-release after maturity</li>
                </ul>
              )}
            </AlertDescription>
          </Alert>

          <Button onClick={onClose} className="w-full h-11 bg-muted border border-border text-muted-foreground hover:bg-muted/70 hover:text-foreground">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
