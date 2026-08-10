import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { CryptoIcon } from '@/components/crypto/crypto-icon';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { useBackgroundTimer } from '@/hooks/use-background-timer';
import { useStickyNotifications } from '@/contexts/sticky-notifications-context';
import { useCryptoPrices } from '@/hooks/use-crypto-prices';
import { formatUsdNumber } from '@/utils/format-utils';

interface FutureTradeTimerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete?: () => void; // Callback when trade completes
  tradeData: {
    id?: number;
    symbol: string;
    side: 'long' | 'short';
    amount: string;
    price: string;
    duration: number; // in seconds
    currentPrice: string;
    profit_ratio?: number; // profit ratio percentage
  };
}

export function FutureTradeTimerModal({ isOpen, onClose, onComplete, tradeData }: FutureTradeTimerModalProps) {
  const { toast } = useToast();
  const { startTimer, stopTimer, getTimeLeft, isTradeActive, isTradeCompleted } = useBackgroundTimer();
  const { showTradeNotification } = useStickyNotifications();
  const { getPriceBySymbol, getFormattedPrice } = useCryptoPrices();
  const [timeLeft, setTimeLeft] = useState(tradeData.duration);
  const [isActive, setIsActive] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [liveCurrentPrice, setLiveCurrentPrice] = useState(tradeData.currentPrice);
  const [smoothProgress, setSmoothProgress] = useState(0);
  const [tradeOutcome, setTradeOutcome] = useState<'win' | 'loss' | null>(null); // null = not yet loaded
  const [isFlashing, setIsFlashing] = useState(false);
  const [flashColor, setFlashColor] = useState<'green' | 'red'>('green');
  const [animatedPnL, setAnimatedPnL] = useState(0); // Animated fluctuating PnL value
  const startTimeRef = useRef<number | null>(null);
  const flashIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pnlAnimIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const finalPnLRef = useRef<number>(0); // Store final PnL for animation target

  useEffect(() => {
    if (isOpen && tradeData.duration && tradeData.id) {
      setTimeLeft(tradeData.duration);
      setIsActive(true);
      setIsCompleted(false);
      setSmoothProgress(0);
      
      // Set start time only once when trade starts
      if (startTimeRef.current === null) {
        startTimeRef.current = Date.now();
        
        // Start subtle flashing effect for the first few seconds
        setIsFlashing(true);
        setFlashColor('green');
        
        // Alternate color every 600ms for a smoother, less aggressive effect
        flashIntervalRef.current = setInterval(() => {
          setFlashColor(prev => (prev === 'green' ? 'red' : 'green'));
        }, 600);
        
        // Stop flashing after 4 seconds
        setTimeout(() => {
          setIsFlashing(false);
          if (flashIntervalRef.current) {
            clearInterval(flashIntervalRef.current);
            flashIntervalRef.current = null;
          }
        }, 4000);
      }
      
      // Start background timer
      startTimer(tradeData.id, tradeData.duration);
    }
  }, [isOpen, tradeData.duration, tradeData.id, startTimer]);

  // Fetch user status for P&L color coding - uses same logic as server
  useEffect(() => {
    const fetchUserStatus = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const response = await fetch('/api/user-profile', {
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
          });
          if (response.ok) {
            const userData = await response.json();
            // Mirror the server-side logic exactly:
            // 1. futures_trade_result === 'win' → always win
            // 2. futures_trade_result === 'loss' → always loss
            // 3. default: use is_active flag
            const forcedResult = userData.futures_trade_result;
            if (forcedResult === 'win') {
              setTradeOutcome('win');
            } else if (forcedResult === 'loss') {
              setTradeOutcome('loss');
            } else {
              // Default: is_active !== false means win
              setTradeOutcome(userData.is_active !== false ? 'win' : 'loss');
            }
          } else {
            // Default to win if we can't fetch
            setTradeOutcome('win');
          }
        }
      } catch (error) {
        console.error('Error fetching user status:', error);
        setTradeOutcome('win');
      }
    };

    if (isOpen) {
      fetchUserStatus();
    }
  }, [isOpen]);

  // Reset start time when modal closes
  useEffect(() => {
    if (!isOpen) {
      startTimeRef.current = null;
      setIsFlashing(false);
      setAnimatedPnL(0);
      if (flashIntervalRef.current) {
        clearInterval(flashIntervalRef.current);
        flashIntervalRef.current = null;
      }
      if (pnlAnimIntervalRef.current) {
        clearInterval(pnlAnimIntervalRef.current);
        pnlAnimIntervalRef.current = null;
      }
    }
  }, [isOpen]);

  // Animated PnL fluctuation - random increments/decrements that settle toward final value
  useEffect(() => {
    if (!isOpen || !isActive || isCompleted) return;

    const profitPct = (tradeData.profit_ratio || 30) / 100;
    const amt = parseFloat(tradeData.amount) || 0;
    const finalAmount = amt * profitPct;
    finalPnLRef.current = finalAmount;

    // Start from a small random value
    setAnimatedPnL(finalAmount * (Math.random() * 0.1));

    pnlAnimIntervalRef.current = setInterval(() => {
      setAnimatedPnL(prev => {
        const target = finalPnLRef.current;
        if (target === 0) return 0;

        // Random walk with drift toward the target
        // The closer to completion, the closer we drift to target
        const elapsed = startTimeRef.current ? (Date.now() - startTimeRef.current) / 1000 : 0;
        const totalDur = tradeData.duration;
        const progressRatio = Math.min(elapsed / totalDur, 1);

        // Volatility decreases as we approach the end
        const volatility = target * (1 - progressRatio * 0.85) * 0.4;

        // Random change: mix of random jump and drift toward target
        const randomJump = (Math.random() - 0.5) * 2 * volatility;
        const driftStrength = 0.15 + progressRatio * 0.6; // Stronger drift near end
        const drift = (target - prev) * driftStrength;

        let newVal = prev + randomJump + drift;

        // Keep value between 0 and ~2x target (never go negative in absolute terms)
        newVal = Math.max(target * 0.01, Math.min(newVal, target * 2));

        // In the last 15% of time, converge strongly
        if (progressRatio > 0.85) {
          const convergeFactor = (progressRatio - 0.85) / 0.15; // 0 to 1
          newVal = newVal + (target - newVal) * convergeFactor * 0.5;
        }

        return newVal;
      });
    }, 300); // Update every 300ms for visible number changes

    return () => {
      if (pnlAnimIntervalRef.current) {
        clearInterval(pnlAnimIntervalRef.current);
        pnlAnimIntervalRef.current = null;
      }
    };
  }, [isOpen, isActive, isCompleted, tradeData.amount, tradeData.profit_ratio, tradeData.duration]);

  // When trade completes, snap animated PnL to the final value (matching outcome)
  useEffect(() => {
    if (isCompleted) {
      const profitPct = (tradeData.profit_ratio || 30) / 100;
      const amt = parseFloat(tradeData.amount) || 0;
      const finalAmount = amt * profitPct;
      // Show the correct sign based on outcome
      setAnimatedPnL(tradeOutcome === 'loss' ? finalAmount : finalAmount);
      if (pnlAnimIntervalRef.current) {
        clearInterval(pnlAnimIntervalRef.current);
        pnlAnimIntervalRef.current = null;
      }
    }
  }, [isCompleted, tradeData.amount, tradeData.profit_ratio, tradeOutcome]);

  // Update timeLeft from background timer with smooth progress
  useEffect(() => {
    if (tradeData.id && startTimeRef.current !== null) {
      const totalDuration = tradeData.duration * 1000; // Convert to milliseconds
      
      const interval = setInterval(() => {
        const bgTimeLeft = getTimeLeft(tradeData.id || 0);
        const bgIsActive = isTradeActive(tradeData.id || 0);
        const bgIsCompleted = isTradeCompleted(tradeData.id || 0);
        
        setTimeLeft(bgTimeLeft);
        setIsActive(bgIsActive);
        setIsCompleted(bgIsCompleted);
        
        // Calculate smooth progress based on elapsed time from start
        const elapsed = Date.now() - startTimeRef.current!;
        const progress = Math.min(100, (elapsed / totalDuration) * 100);
        setSmoothProgress(progress);
        
        // If trade completed in background, call onComplete
        if (bgIsCompleted && onComplete) {
          onComplete();
        }
      }, 100); // Update every 100ms for smooth animation
      
      return () => clearInterval(interval);
    }
  }, [tradeData.id, tradeData.duration, getTimeLeft, isTradeActive, isTradeCompleted, onComplete]);

  // Update live prices separately (more frequent updates)
  useEffect(() => {
    if (isOpen && tradeData.symbol) {
      const updatePrice = () => {
        const symbol = tradeData.symbol.split('/')[0]; // Extract BTC from BTC/USDT
        const livePrice = getPriceBySymbol(symbol);
        if (livePrice) {
          setLiveCurrentPrice(livePrice.price);
        }
      };

      // Update immediately
      updatePrice();
      
      // Update every 2 seconds for more frequent price updates
      const priceInterval = setInterval(updatePrice, 2000);
      
      return () => clearInterval(priceInterval);
    }
  }, [isOpen, tradeData.symbol, getPriceBySymbol]);

  // Handle modal close with sticky notification
  const handleClose = () => {
    if (tradeData.id && isActive && !isCompleted) {
      // Show sticky notification for the trade
      showTradeNotification({
        id: tradeData.id,
        symbol: tradeData.symbol,
        side: tradeData.side,
        amount: tradeData.amount
      });
    }
    onClose();
  };

  // Use smooth progress for continuous animation
  const progress = Math.max(0, Math.min(100, smoothProgress));
  
  // Calculate the stroke-dasharray for the progress circle
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const strokeDasharray = circumference;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  // Calculate potential P&L based on trade outcome and profit ratio
  const currentPriceNum = parseFloat(liveCurrentPrice);
  const tradePriceNum = parseFloat(tradeData.price);
  const amountNum = parseFloat(tradeData.amount);
  
  let potentialPnL = 0;
  let isPotentialProfit = false;
  
  // Calculate static potential P&L based on trade amount and profit ratio
  const profitPercentage = (tradeData.profit_ratio || 30) / 100;
  const staticProfitAmount = amountNum * profitPercentage;
  
  if (tradeOutcome === 'loss') {
    // User is set to always lose - show loss
    potentialPnL = -staticProfitAmount;
    isPotentialProfit = false;
  } else {
    // User wins (or status not yet loaded) - show potential profit
    potentialPnL = staticProfitAmount;
    isPotentialProfit = true;
  }

  // Determine the color and sign to use for P&L display
  const getPnLDisplay = () => {
    // Use the animated fluctuating value instead of the static final amount
    const fluctuatingValue = animatedPnL;

    if (isFlashing) {
      // During flashing period (first 4 seconds), alternate colors with fluctuating value
      const color = flashColor === 'green' ? 'text-green-600' : 'text-red-600';
      const sign = flashColor === 'green' ? '+' : '-';
      return { color, sign, value: fluctuatingValue };
    } else if (isCompleted) {
      // On completion, show the definitive outcome
      const color = isPotentialProfit ? 'text-green-600' : 'text-red-600';
      const sign = isPotentialProfit ? '+' : '-';
      return { color, sign, value: staticProfitAmount };
    } else {
      // During countdown, show outcome color with fluctuating value
      const color = isPotentialProfit ? 'text-green-600' : 'text-red-600';
      const sign = isPotentialProfit ? '+' : '-';
      return { color, sign, value: fluctuatingValue };
    }
  };
  
  // Get P&L display properties (color, sign, value)
  const pnlDisplay = getPnLDisplay();

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm mx-auto shadow-2xl p-0" hideCloseButton>
        <DialogHeader className="relative p-6 pb-4">
          <DialogTitle className="text-center text-lg font-semibold text-white flex items-center justify-center gap-2">
            <CryptoIcon symbol={tradeData.symbol?.split('/')[0] || tradeData.symbol} size="sm" />
            {tradeData.symbol}
          </DialogTitle>
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 p-1 hover:bg-[#2a2a2a] rounded-full transition-colors"
          >
            <X size={20} className="text-gray-400" />
          </button>
        </DialogHeader>

        <div className="px-6 pb-6">
          {/* Circular Progress Timer */}
          <div className="flex justify-center mb-8">
            <div className="relative w-52 h-52">
              {/* Background Circle */}
              <svg className="w-full h-full" viewBox="0 0 140 140">
                <circle
                  cx="70"
                  cy="70"
                  r={radius}
                  stroke="#374151"
                  strokeWidth="6"
                  fill="none"
                />
                {/* Progress Circle */}
                <circle
                  cx="70"
                  cy="70"
                  r={radius}
                  stroke={tradeData.side === 'long' ? '#10b981' : '#ef4444'}
                  strokeWidth="6"
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={strokeDasharray}
                  strokeDashoffset={strokeDashoffset}
                  style={{
                    transition: 'stroke-dashoffset 0.1s ease-out',
                    transform: 'rotate(-90deg)',
                    transformOrigin: '70px 70px'
                  }}
                />
              </svg>
              
              {/* Center Content */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                {isCompleted ? (
                  <>
                    <div className="text-4xl font-bold text-white mb-2">
                      ✓
                    </div>
                    <div className="text-sm text-gray-400 mb-1">Trade Completed</div>
                    <div className="text-lg font-semibold text-green-400">
                      Check your balance
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-5xl font-bold text-white mb-2">
                      {timeLeft}
                    </div>
                    <div className="text-sm text-gray-400 mb-1">Current price</div>
                    <div className="text-lg font-semibold text-white">
                      {formatUsdNumber(parseFloat(liveCurrentPrice))}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Potential P&L</div>
                    <div className={`text-sm font-semibold ${pnlDisplay.color}`}>
                      {pnlDisplay.sign}{formatUsdNumber(pnlDisplay.value)} USDT
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Trade Details */}
          <div className="space-y-3 mb-6">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Position</span>
              <span className={`font-semibold ${tradeData.side === 'long' ? 'text-green-400' : 'text-red-400'}`}>
                {tradeData.side === 'long' ? 'Long' : 'Short'}
              </span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Purchase quantity</span>
              <span className="font-semibold text-white">{tradeData.amount}</span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Purchase price</span>
              <span className="font-semibold text-white">{tradeData.price}</span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Potential P&L</span>
              <span className={`font-semibold ${pnlDisplay.color}`}>
                {pnlDisplay.sign}{formatUsdNumber(pnlDisplay.value)} USDT
              </span>
            </div>
          </div>

          {/* Back Button */}
          <Button
            onClick={handleClose}
            className={`w-full font-semibold py-3 rounded-lg ${
              tradeData.side === 'long' 
                ? 'bg-green-600 hover:bg-green-700 text-white' 
                : 'bg-red-600 hover:bg-red-700 text-white'
            }`}
          >
            {isCompleted ? 'Close' : 'Back'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
