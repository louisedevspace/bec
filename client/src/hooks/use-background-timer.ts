import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { formatUsdNumber } from '@/utils/format-utils';

interface TradeTimer {
  id: number;
  duration: number;
  startTime: number;
  isActive: boolean;
  isCompleted: boolean;
}

// Global timer state
let globalTimers: Map<number, TradeTimer> = new Map();
let globalIntervals: Map<number, NodeJS.Timeout> = new Map();

export function useBackgroundTimer() {
  const { toast } = useToast();
  const [timers, setTimers] = useState<Map<number, TradeTimer>>(globalTimers);

  // Update local state when global state changes
  useEffect(() => {
    const updateTimers = () => {
      setTimers(new Map(globalTimers));
    };

    // Update every second
    const interval = setInterval(updateTimers, 1000);
    return () => clearInterval(interval);
  }, []);

  const startTimer = useCallback((tradeId: number, duration: number) => {
    console.log(`🕐 Starting background timer for trade ${tradeId} with duration ${duration}`);
    
    // Clear existing timer if any
    if (globalIntervals.has(tradeId)) {
      clearInterval(globalIntervals.get(tradeId)!);
    }

    const startTime = Date.now();
    const timer: TradeTimer = {
      id: tradeId,
      duration,
      startTime,
      isActive: true,
      isCompleted: false
    };

    globalTimers.set(tradeId, timer);

    // Start the countdown
    const interval = setInterval(async () => {
      const currentTimer = globalTimers.get(tradeId);
      if (!currentTimer || !currentTimer.isActive) {
        clearInterval(interval);
        globalIntervals.delete(tradeId);
        return;
      }

      const elapsed = Math.floor((Date.now() - currentTimer.startTime) / 1000);
      const timeLeft = Math.max(0, currentTimer.duration - elapsed);

      if (timeLeft <= 0) {
        // Timer completed
        currentTimer.isActive = false;
        currentTimer.isCompleted = true;
        globalTimers.set(tradeId, currentTimer);
        clearInterval(interval);
        globalIntervals.delete(tradeId);

        // Handle trade completion
        await handleTradeCompletion(tradeId);
      } else {
        // Update timer
        globalTimers.set(tradeId, currentTimer);
      }
    }, 1000);

    globalIntervals.set(tradeId, interval);
    setTimers(new Map(globalTimers));
  }, []);

  const stopTimer = useCallback((tradeId: number) => {
    console.log(`🛑 Stopping background timer for trade ${tradeId}`);
    
    if (globalIntervals.has(tradeId)) {
      clearInterval(globalIntervals.get(tradeId)!);
      globalIntervals.delete(tradeId);
    }

    const timer = globalTimers.get(tradeId);
    if (timer) {
      timer.isActive = false;
      globalTimers.set(tradeId, timer);
    }

    setTimers(new Map(globalTimers));
  }, []);

  const getTimeLeft = useCallback((tradeId: number): number => {
    const timer = globalTimers.get(tradeId);
    if (!timer || !timer.isActive) return 0;

    const elapsed = Math.floor((Date.now() - timer.startTime) / 1000);
    return Math.max(0, timer.duration - elapsed);
  }, []);

  const isTradeActive = useCallback((tradeId: number): boolean => {
    const timer = globalTimers.get(tradeId);
    return timer ? timer.isActive : false;
  }, []);

  const isTradeCompleted = useCallback((tradeId: number): boolean => {
    const timer = globalTimers.get(tradeId);
    return timer ? timer.isCompleted : false;
  }, []);

  const handleTradeCompletion = async (tradeId: number) => {
    try {
      console.log(`🔍 Completing trade ${tradeId} in background`);
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No authentication session');
      }

      // First, check if the trade is already completed by the server
      const checkResponse = await fetch('/api/future-trades', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (checkResponse.ok) {
        const trades = await checkResponse.json();
        const currentTrade = trades.find((t: any) => t.id === tradeId);
        
        if (currentTrade && currentTrade.status === 'completed') {
          // Trade already completed by server
          const isWin = currentTrade.profit_loss > 0;
          const finalProfitLoss = currentTrade.profit_loss;
          
          toast({
            title: 'Trade Complete',
            description: isWin 
              ? `Profit: +${formatUsdNumber(finalProfitLoss)} USDT`
              : `Loss: -${formatUsdNumber(Math.abs(finalProfitLoss))} USDT`,
            variant: isWin ? 'default' : 'destructive',
            duration: 5000,
          });

          // Clean up timer
          globalTimers.delete(tradeId);
          setTimers(new Map(globalTimers));
          return;
        }
      }

      // If not completed by server, call the completion endpoint
      const response = await fetch('/api/future-trade/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          tradeId: tradeId
        }),
      });

      if (response.ok) {
        const result = await response.json();
        const isWin = result.isWin;
        const finalProfitLoss = result.finalProfitLoss;
        
        toast({
          title: 'Trade Complete',
          description: isWin 
            ? `Profit: +${formatUsdNumber(finalProfitLoss)} USDT`
            : `Loss: -${formatUsdNumber(Math.abs(finalProfitLoss))} USDT`,
          variant: isWin ? 'default' : 'destructive',
          duration: 5000,
        });
      } else {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to complete trade');
      }

      // Clean up timer
      globalTimers.delete(tradeId);
      setTimers(new Map(globalTimers));

    } catch (error) {
      console.error('Error completing trade in background:', error);
      toast({
        title: 'Error',
        description: 'Failed to process trade completion. Please contact support.',
        variant: 'destructive',
      });
    }
  };

  return {
    timers,
    startTimer,
    stopTimer,
    getTimeLeft,
    isTradeActive,
    isTradeCompleted
  };
}
