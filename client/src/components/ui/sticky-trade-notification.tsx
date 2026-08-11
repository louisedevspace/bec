import React, { useState, useEffect } from 'react';
import { X, Clock, TrendingUp, TrendingDown } from 'lucide-react';
import { CryptoIcon } from '@/components/crypto/crypto-icon';
import { useBackgroundTimer } from '@/hooks/use-background-timer';
import { useCryptoPrices } from '@/hooks/use-crypto-prices';
import { formatUsdNumber } from '@/utils/format-utils';

interface StickyTradeNotificationProps {
  tradeId: number;
  symbol: string;
  side: 'long' | 'short';
  amount: string;
  onClose?: () => void;
}

export function StickyTradeNotification({ 
  tradeId, 
  symbol, 
  side, 
  amount, 
  onClose 
}: StickyTradeNotificationProps) {
  const { getTimeLeft, isTradeActive, isTradeCompleted } = useBackgroundTimer();
  const { getPriceBySymbol } = useCryptoPrices();
  const [timeLeft, setTimeLeft] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [currentPrice, setCurrentPrice] = useState('0.00');

  // Update timer status
  useEffect(() => {
    const updateTimer = () => {
      const bgTimeLeft = getTimeLeft(tradeId);
      const bgIsActive = isTradeActive(tradeId);
      const bgIsCompleted = isTradeCompleted(tradeId);
      
      setTimeLeft(bgTimeLeft);
      setIsActive(bgIsActive);
      setIsCompleted(bgIsCompleted);
      
      // Auto-hide when trade is completed
      if (bgIsCompleted && onClose) {
        setTimeout(() => {
          onClose();
        }, 3000); // Hide after 3 seconds when completed
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    
    return () => clearInterval(interval);
  }, [tradeId, getTimeLeft, isTradeActive, isTradeCompleted, onClose]);

  // Update live prices separately (more frequent)
  useEffect(() => {
    const updatePrice = () => {
      const symbolKey = symbol.split('/')[0]; // Extract BTC from BTC/USDT
      const livePrice = getPriceBySymbol(symbolKey);
      if (livePrice) {
        setCurrentPrice(livePrice.price);
      }
    };

    // Update immediately
    updatePrice();
    
    // Update every 2 seconds
    const priceInterval = setInterval(updatePrice, 2000);
    
    return () => clearInterval(priceInterval);
  }, [symbol, getPriceBySymbol]);

  // Don't show if trade is not active or completed
  if (!isActive && !isCompleted) {
    return null;
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-2 duration-300">
      <div className={`
        bg-card border rounded-lg shadow-sm p-3 min-w-[280px] max-w-[320px]
        ${isCompleted ? 'border-success/30' : 'border-border'}
      `}>
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {isCompleted ? (
              <div className="w-2 h-2 bg-success rounded-full"></div>
            ) : (
              <Clock className="w-4 h-4 text-primary" />
            )}
            <span className="text-sm font-semibold text-foreground">
              {isCompleted ? 'Trade Completed' : 'Trade Running'}
            </span>
          </div>
          {!isCompleted && onClose && (
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Trade Info */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Symbol</span>
            <span className="text-sm font-medium text-foreground flex items-center gap-1.5"><CryptoIcon symbol={symbol?.split('/')[0] || symbol} size="xs" />{symbol}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Position</span>
            <div className="flex items-center gap-1">
              {side === 'long' ? (
                <TrendingUp className="w-3 h-3 text-buy" />
              ) : (
                <TrendingDown className="w-3 h-3 text-sell" />
              )}
              <span className={`text-sm font-medium ${side === 'long' ? 'text-buy' : 'text-sell'}`}>
                {side.toUpperCase()}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Amount</span>
            <span className="text-sm font-medium text-foreground tabular-nums">{amount} USDT</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Current Price</span>
            <span className="text-sm font-medium text-foreground tabular-nums">${formatUsdNumber(parseFloat(currentPrice))}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {isCompleted ? 'Status' : 'Time Left'}
            </span>
            {isCompleted ? (
              <span className="text-sm font-medium text-success">Completed ✓</span>
            ) : (
              <span className="text-sm font-medium text-primary font-mono tabular-nums">
                {formatTime(timeLeft)}
              </span>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        {!isCompleted && (
          <div className="mt-2">
            <div className="w-full bg-muted rounded-full h-1">
              <div
                className="bg-primary h-1 rounded-full transition-all duration-1000 ease-linear"
                style={{
                  width: `${Math.max(0, Math.min(100, (timeLeft / 60) * 100))}%`
                }}
              ></div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
