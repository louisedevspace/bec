import React, { createContext, useContext, useState, ReactNode } from 'react';
import { StickyTradeNotification } from '@/components/ui/sticky-trade-notification';

interface ActiveTrade {
  id: number;
  symbol: string;
  side: 'long' | 'short';
  amount: string;
}

interface StickyNotificationsContextType {
  showTradeNotification: (trade: ActiveTrade) => void;
  hideTradeNotification: (tradeId: number) => void;
  hideAllNotifications: () => void;
}

const StickyNotificationsContext = createContext<StickyNotificationsContextType | undefined>(undefined);

export function useStickyNotifications() {
  const context = useContext(StickyNotificationsContext);
  if (!context) {
    throw new Error('useStickyNotifications must be used within a StickyNotificationsProvider');
  }
  return context;
}

interface StickyNotificationsProviderProps {
  children: ReactNode;
}

export function StickyNotificationsProvider({ children }: StickyNotificationsProviderProps) {
  const [activeTrades, setActiveTrades] = useState<ActiveTrade[]>([]);

  const showTradeNotification = (trade: ActiveTrade) => {
    setActiveTrades(prev => {
      // Remove existing trade with same ID if any
      const filtered = prev.filter(t => t.id !== trade.id);
      // Add new trade
      return [...filtered, trade];
    });
  };

  const hideTradeNotification = (tradeId: number) => {
    setActiveTrades(prev => prev.filter(trade => trade.id !== tradeId));
  };

  const hideAllNotifications = () => {
    setActiveTrades([]);
  };

  return (
    <StickyNotificationsContext.Provider 
      value={{ 
        showTradeNotification, 
        hideTradeNotification, 
        hideAllNotifications 
      }}
    >
      {children}
      
      {/* Render sticky notifications */}
      {activeTrades.map((trade) => (
        <StickyTradeNotification
          key={trade.id}
          tradeId={trade.id}
          symbol={trade.symbol}
          side={trade.side}
          amount={trade.amount}
          onClose={() => hideTradeNotification(trade.id)}
        />
      ))}
    </StickyNotificationsContext.Provider>
  );
}
