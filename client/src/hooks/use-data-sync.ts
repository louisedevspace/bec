import { useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { buildWsUrl } from '../lib/config';

// Synchronization action types
export type SyncAction = 
  | 'create-trade' 
  | 'update-trade' 
  | 'delete-trades'
  | 'create-transaction' 
  | 'update-transaction' 
  | 'delete-transactions'
  | 'update-portfolio'
  | 'delete-portfolio'
  | 'create-deposit-request'
  | 'update-deposit-request'
  | 'create-withdraw-request'
  | 'update-withdraw-request'
  | 'create-staking'
  | 'update-staking'
  | 'create-loan'
  | 'update-loan'
  | 'update-kyc'
  | 'update-user'
  | 'update-password'
  | 'update-crypto-prices'
  | 'create-support-conversation'
  | 'update-support-conversation'
  | 'create-support-message'
  | 'update-support-message';

// Synchronization event interface
export interface SyncEvent {
  type: 'data_sync';
  data: {
    action: SyncAction;
    userId?: string;
    entityId?: string | number;
    timestamp: string;
    entity?: any;
    metadata?: any;
  };
}

// Custom event interface for local synchronization
export interface LocalSyncEvent {
  detail: {
    action: SyncAction;
    userId?: string;
    entityId?: string | number;
    timestamp: string;
    entity?: any;
    metadata?: any;
  };
}

// Hook configuration
export interface UseDataSyncConfig {
  userId?: string;
  enabled?: boolean;
  onSync?: (action: SyncAction, data: any) => void;
}

// Query invalidation patterns for different actions
const QUERY_INVALIDATION_PATTERNS = {
  'create-trade': (userId?: string) => [
    ['/api/trades', userId],
    ['/api/admin/pending-orders'],
    ['/api/admin/all-orders'],
    ['/api/wallet/summary']
  ],
  'update-trade': (userId?: string) => [
    ['/api/trades', userId],
    ['/api/admin/pending-orders'],
    ['/api/admin/all-orders'],
    ['/api/wallet/summary']
  ],
  'delete-trades': (userId?: string) => [
    ['/api/trades', userId],
    ['/api/admin/pending-orders'],
    ['/api/admin/all-orders'],
    ['/api/wallet/summary']
  ],
  'create-transaction': (userId?: string) => [
    ['/api/transactions', userId]
  ],
  'update-transaction': (userId?: string) => [
    ['/api/transactions', userId]
  ],
  'delete-transactions': (userId?: string) => [
    ['/api/transactions', userId],
    ['/api/wallet/summary']
  ],
  'update-portfolio': (userId?: string) => [
    ['/api/portfolio', userId],
    ['/api/wallet/summary']
  ],
  'delete-portfolio': (userId?: string) => [
    ['/api/portfolio', userId],
    ['/api/wallet/summary']
  ],
  'create-deposit-request': (userId?: string) => [
    ['/api/deposit-requests', userId],
    ['/api/admin/deposit-requests'],
    ['/api/wallet/summary']
  ],
  'update-deposit-request': (userId?: string) => [
    ['/api/deposit-requests', userId],
    ['/api/admin/deposit-requests'],
    ['/api/wallet/summary']
  ],
  'create-withdraw-request': (userId?: string) => [
    ['/api/withdraw-requests', userId],
    ['/api/admin/withdraw-requests'],
    ['/api/wallet/summary']
  ],
  'update-withdraw-request': (userId?: string) => [
    ['/api/withdraw-requests', userId],
    ['/api/admin/withdraw-requests'],
    ['/api/wallet/summary']
  ],
  'create-staking': (userId?: string) => [
    ['/api/staking', userId]
  ],
  'update-staking': (userId?: string) => [
    ['/api/staking', userId]
  ],
  'create-loan': (userId?: string) => [
    ['/api/loans', userId]
  ],
  'update-loan': (userId?: string) => [
    ['/api/loans', userId]
  ],
  'update-kyc': (userId?: string) => [
    ['/api/admin/kyc-requests'],
    ['/api/user-profile']
  ],
  'update-user': (userId?: string) => [
    ['/api/user-profile'],
    ['/api/admin/users'],
    ['/api/wallet/summary']
  ],
  'update-password': (userId?: string) => [
    ['/api/user-profile']
  ],
  'update-crypto-prices': () => [
    ['/api/crypto/prices']
  ],
  'create-support-conversation': (userId?: string) => [
    ['/api/support/conversation', userId],
    ['/api/admin/support/conversations'],
    ['/api/admin/support/stats']
  ],
  'update-support-conversation': (userId?: string) => [
    ['/api/support/conversation', userId],
    ['/api/admin/support/conversations'],
    ['/api/admin/support/stats']
  ],
  'create-support-message': (userId?: string) => [
    ['/api/support/conversation', userId],
    ['/api/admin/support/conversations'],
    ['/api/admin/support/stats']
  ],
  'update-support-message': (userId?: string) => [
    ['/api/support/conversation', userId],
    ['/api/admin/support/conversations'],
    ['/api/admin/support/stats']
  ]
};

/**
 * Comprehensive data synchronization hook
 * Handles real-time updates from WebSocket and local events
 */
export function useDataSync(config: UseDataSyncConfig = {}) {
  const { userId, enabled = true, onSync } = config;
  const queryClient = useQueryClient();

  // Invalidate queries based on sync action
  const invalidateQueries = useCallback((action: SyncAction, syncUserId?: string) => {
    const patterns = QUERY_INVALIDATION_PATTERNS[action];
    if (!patterns) {
      console.warn(`No invalidation pattern found for action: ${action}`);
      return;
    }

    // If action is user-specific and we have a userId filter, only invalidate if it matches
    if (userId && syncUserId && userId !== syncUserId) {
      return;
    }

    // Invalidate all relevant queries
    patterns(syncUserId).forEach(pattern => {
      queryClient.invalidateQueries({ queryKey: pattern });
    });

    console.log(`🔄 Invalidated queries for action: ${action}`, {
      userId: syncUserId,
      patterns: patterns(syncUserId)
    });
  }, [queryClient, userId]);

  // Handle WebSocket sync events
  const handleWebSocketSync = useCallback((event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);
      
      if (data.type === 'data_sync') {
        const syncEvent: SyncEvent = data;
        const { action, userId: syncUserId } = syncEvent.data;
        
        // Invalidate relevant queries
        invalidateQueries(action, syncUserId);
        
        // Call custom sync handler if provided
        if (onSync) {
          onSync(action, syncEvent.data);
        }
        
        console.log(`📡 Received sync event: ${action}`, {
          userId: syncUserId,
          entityId: syncEvent.data.entityId,
          timestamp: syncEvent.data.timestamp
        });
      }
    } catch (error) {
      console.error('Error parsing WebSocket sync event:', error);
    }
  }, [invalidateQueries, onSync]);

  // Handle local sync events (from admin actions)
  const handleLocalSync = useCallback((event: CustomEvent<LocalSyncEvent['detail']>) => {
    const { action, userId: syncUserId } = event.detail;
    
    // Invalidate relevant queries
    invalidateQueries(action, syncUserId);
    
    // Call custom sync handler if provided
    if (onSync) {
      onSync(action, event.detail);
    }
    
    console.log(`🏠 Received local sync event: ${action}`, {
      userId: syncUserId,
      entityId: event.detail.entityId,
      timestamp: event.detail.timestamp
    });
  }, [invalidateQueries, onSync]);

  // Store handlers in refs to avoid effect re-runs
  const handleWebSocketSyncRef = useRef(handleWebSocketSync);
  handleWebSocketSyncRef.current = handleWebSocketSync;
  const handleLocalSyncRef = useRef(handleLocalSync);
  handleLocalSyncRef.current = handleLocalSync;

  // Set up event listeners
  useEffect(() => {
    if (!enabled) return;

    let cleaned = false;

    // Stable message handler that reads from ref
    const onMessage = (event: MessageEvent) => {
      handleWebSocketSyncRef.current(event);
    };

    const onLocalSync = ((event: CustomEvent<LocalSyncEvent['detail']>) => {
      handleLocalSyncRef.current(event);
    }) as EventListener;

    // WebSocket connection for real-time updates
    let ws: WebSocket | null = null;
    
    try {
      // Use the configuration to build the WebSocket URL
      const wsUrl = buildWsUrl('/ws');
      ws = new WebSocket(wsUrl);
      ws.addEventListener('message', onMessage);
      
      ws.onopen = () => {
        if (!cleaned) {
          console.log('Data sync WebSocket connected');
        }
      };
      
      ws.onerror = () => {
        // Suppress errors during cleanup (StrictMode unmount)
      };
      
      ws.onclose = () => {
        // Suppress close logs during cleanup
      };
    } catch (error) {
      console.warn('WebSocket connection failed for data sync:', error);
    }

    // Local event listener for admin actions
    window.addEventListener('userDataChanged', onLocalSync);

    // Cleanup
    return () => {
      cleaned = true;
      if (ws) {
        ws.close();
        ws = null;
      }
      window.removeEventListener('userDataChanged', onLocalSync);
    };
  }, [enabled]);

  // Return utility functions for manual synchronization
  return {
    invalidateQueries,
    triggerSync: (action: SyncAction, data: any) => {
      invalidateQueries(action, data.userId);
      if (onSync) {
        onSync(action, data);
      }
    }
  };
}

/**
 * Specialized hook for user-specific data synchronization
 */
export function useUserDataSync(userId: string, config: Omit<UseDataSyncConfig, 'userId'> = {}) {
  return useDataSync({
    ...config,
    userId
  });
}

/**
 * Specialized hook for admin data synchronization
 */
export function useAdminDataSync(config: Omit<UseDataSyncConfig, 'userId'> = {}) {
  return useDataSync({
    ...config,
    enabled: true
  });
}
