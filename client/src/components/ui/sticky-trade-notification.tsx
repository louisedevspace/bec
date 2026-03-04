import React, { useState, useEffect } from 'react';
import { X, Clock, TrendingUp, TrendingDown } from 'lucide-react';
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
        bg-white border border-gray-200 rounded-lg shadow-lg p-3 min-w-[280px] max-w-[320px]
        ${isCompleted ? 'border-green-200 bg-green-50' : 'border-blue-200 bg-blue-50'}
      `}>
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {isCompleted ? (
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            ) : (
              <Clock className="w-4 h-4 text-blue-600" />
            )}
            <span className="text-sm font-semibold text-gray-800">
              {isCompleted ? 'Trade Completed' : 'Trade Running'}
            </span>
          </div>
          {!isCompleted && onClose && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Trade Info */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-600">Symbol</span>
            <span className="text-sm font-medium text-gray-800">{symbol}</span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-600">Position</span>
            <div className="flex items-center gap-1">
              {side === 'long' ? (
                <TrendingUp className="w-3 h-3 text-green-600" />
              ) : (
                <TrendingDown className="w-3 h-3 text-red-600" />
              )}
              <span className={`text-sm font-medium ${side === 'long' ? 'text-green-600' : 'text-red-600'}`}>
                {side.toUpperCase()}
              </span>
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-600">Amount</span>
            <span className="text-sm font-medium text-gray-800">{amount} USDT</span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-600">Current Price</span>
            <span className="text-sm font-medium text-gray-800">${formatUsdNumber(parseFloat(currentPrice))}</span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-600">
              {isCompleted ? 'Status' : 'Time Left'}
            </span>
            {isCompleted ? (
              <span className="text-sm font-medium text-green-600">Completed ✓</span>
            ) : (
              <span className="text-sm font-medium text-blue-600 font-mono">
                {formatTime(timeLeft)}
              </span>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        {!isCompleted && (
          <div className="mt-2">
            <div className="w-full bg-gray-200 rounded-full h-1">
              <div 
                className="bg-blue-600 h-1 rounded-full transition-all duration-1000 ease-linear"
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
