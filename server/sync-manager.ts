import { WebSocket } from 'ws';
import {
  getRedisClient,
  isRedisConnected,
  REDIS_KEYS,
} from './utils/redis';

// Global WebSocket clients collection
export const clients = new Set<WebSocket>();

// Synchronization event types
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

// Centralized synchronization manager
export class SyncManager {
  private static instance: SyncManager;

  private constructor() {}

  public static getInstance(): SyncManager {
    if (!SyncManager.instance) {
      SyncManager.instance = new SyncManager();
    }
    return SyncManager.instance;
  }

  // Broadcast synchronization event to local WebSocket clients only (no Redis)
  private broadcastToLocalClients(message: string): void {
    clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(message);
        } catch (error) {
          console.error('Error sending sync event to client:', error);
        }
      }
    });
  }

  // Broadcast synchronization event - uses Redis Pub/Sub for cross-instance broadcasting
  // Falls back to local broadcast if Redis is unavailable
  public async broadcastSyncEvent(event: SyncEvent): Promise<void> {
    const message = JSON.stringify(event);
    
    try {
      const redisClient = getRedisClient();
      if (redisClient && isRedisConnected()) {
        // Publish to Redis - all instances (including this one) will receive via subscription
        await redisClient.publish(REDIS_KEYS.WS_CHANNEL_SYNC, message);
        console.log(`[Redis:PubSub] Published sync event: ${event.data.action} for user: ${event.data.userId || 'all'}`);
      } else {
        // Fallback: Redis unavailable, broadcast directly to local clients
        this.broadcastToLocalClients(message);
        console.log(`📡 Broadcasted sync event: ${event.data.action} for user: ${event.data.userId || 'all'}`);
      }
    } catch (error) {
      console.error('[Redis:PubSub] Error publishing sync event:', error);
      // Fallback to local broadcast on error
      this.broadcastToLocalClients(message);
      console.log(`📡 Broadcasted sync event (fallback): ${event.data.action} for user: ${event.data.userId || 'all'}`);
    }
  }

  // Trade synchronization
  public syncTradeCreated(trade: any): void {
    this.broadcastSyncEvent({
      type: 'data_sync',
      data: {
        action: 'create-trade',
        userId: trade.userId,
        entityId: trade.id,
        timestamp: new Date().toISOString(),
        entity: trade
      }
    });
  }

  public syncTradeUpdated(trade: any): void {
    this.broadcastSyncEvent({
      type: 'data_sync',
      data: {
        action: 'update-trade',
        userId: trade.userId,
        entityId: trade.id,
        timestamp: new Date().toISOString(),
        entity: trade
      }
    });
  }

  public syncTradesDeleted(userId: string): void {
    this.broadcastSyncEvent({
      type: 'data_sync',
      data: {
        action: 'delete-trades',
        userId: userId,
        timestamp: new Date().toISOString()
      }
    });
  }

  // Transaction synchronization
  public syncTransactionCreated(transaction: any): void {
    this.broadcastSyncEvent({
      type: 'data_sync',
      data: {
        action: 'create-transaction',
        userId: transaction.userId,
        entityId: transaction.id,
        timestamp: new Date().toISOString(),
        entity: transaction
      }
    });
  }

  public syncTransactionUpdated(transaction: any): void {
    this.broadcastSyncEvent({
      type: 'data_sync',
      data: {
        action: 'update-transaction',
        userId: transaction.userId,
        entityId: transaction.id,
        timestamp: new Date().toISOString(),
        entity: transaction
      }
    });
  }

  public syncTransactionsDeleted(userId: string): void {
    this.broadcastSyncEvent({
      type: 'data_sync',
      data: {
        action: 'delete-transactions',
        userId: userId,
        timestamp: new Date().toISOString()
      }
    });
  }

  // Portfolio synchronization
  public syncPortfolioUpdated(userId: string, portfolio: any): void {
    this.broadcastSyncEvent({
      type: 'data_sync',
      data: {
        action: 'update-portfolio',
        userId: userId,
        timestamp: new Date().toISOString(),
        entity: portfolio
      }
    });
  }

  public syncPortfolioDeleted(userId: string): void {
    this.broadcastSyncEvent({
      type: 'data_sync',
      data: {
        action: 'delete-portfolio',
        userId: userId,
        timestamp: new Date().toISOString()
      }
    });
  }

  // Deposit request synchronization
  public syncDepositRequestCreated(depositRequest: any): void {
    this.broadcastSyncEvent({
      type: 'data_sync',
      data: {
        action: 'create-deposit-request',
        userId: depositRequest.user_id,
        entityId: depositRequest.id,
        timestamp: new Date().toISOString(),
        entity: depositRequest
      }
    });
  }

  public syncDepositRequestUpdated(depositRequest: any): void {
    this.broadcastSyncEvent({
      type: 'data_sync',
      data: {
        action: 'update-deposit-request',
        userId: depositRequest.user_id,
        entityId: depositRequest.id,
        timestamp: new Date().toISOString(),
        entity: depositRequest
      }
    });
  }

  // Withdraw request synchronization
  public syncWithdrawRequestCreated(withdrawRequest: any): void {
    this.broadcastSyncEvent({
      type: 'data_sync',
      data: {
        action: 'create-withdraw-request',
        userId: withdrawRequest.user_id,
        entityId: withdrawRequest.id,
        timestamp: new Date().toISOString(),
        entity: withdrawRequest
      }
    });
  }

  public syncWithdrawRequestUpdated(withdrawRequest: any): void {
    this.broadcastSyncEvent({
      type: 'data_sync',
      data: {
        action: 'update-withdraw-request',
        userId: withdrawRequest.user_id,
        entityId: withdrawRequest.id,
        timestamp: new Date().toISOString(),
        entity: withdrawRequest
      }
    });
  }

  // Staking synchronization
  public syncStakingCreated(staking: any): void {
    this.broadcastSyncEvent({
      type: 'data_sync',
      data: {
        action: 'create-staking',
        userId: staking.userId,
        entityId: staking.id,
        timestamp: new Date().toISOString(),
        entity: staking
      }
    });
  }

  public syncStakingUpdated(staking: any): void {
    this.broadcastSyncEvent({
      type: 'data_sync',
      data: {
        action: 'update-staking',
        userId: staking.userId,
        entityId: staking.id,
        timestamp: new Date().toISOString(),
        entity: staking
      }
    });
  }

  // Loan synchronization
  public syncLoanCreated(loan: any): void {
    this.broadcastSyncEvent({
      type: 'data_sync',
      data: {
        action: 'create-loan',
        userId: loan.userId,
        entityId: loan.id,
        timestamp: new Date().toISOString(),
        entity: loan
      }
    });
  }

  public syncLoanUpdated(loan: any): void {
    this.broadcastSyncEvent({
      type: 'data_sync',
      data: {
        action: 'update-loan',
        userId: loan.userId,
        entityId: loan.id,
        timestamp: new Date().toISOString(),
        entity: loan
      }
    });
  }

  // KYC synchronization
  public syncKYCUpdated(kyc: any): void {
    this.broadcastSyncEvent({
      type: 'data_sync',
      data: {
        action: 'update-kyc',
        userId: kyc.userId,
        entityId: kyc.id,
        timestamp: new Date().toISOString(),
        entity: kyc
      }
    });
  }

  // User synchronization
  public syncUserUpdated(user: any): void {
    this.broadcastSyncEvent({
      type: 'data_sync',
      data: {
        action: 'update-user',
        userId: user.id,
        timestamp: new Date().toISOString(),
        entity: user
      }
    });
  }

  // Password synchronization
  public syncPasswordUpdated(userId: string): void {
    this.broadcastSyncEvent({
      type: 'data_sync',
      data: {
        action: 'update-password',
        userId: userId,
        timestamp: new Date().toISOString()
      }
    });
  }

  // Crypto prices synchronization
  public syncCryptoPricesUpdated(): void {
    this.broadcastSyncEvent({
      type: 'data_sync',
      data: {
        action: 'update-crypto-prices',
        timestamp: new Date().toISOString()
      }
    });
  }

  // Support conversation synchronization
  public syncSupportConversationCreated(conversation: any): void {
    this.broadcastSyncEvent({
      type: 'data_sync',
      data: {
        action: 'create-support-conversation',
        userId: conversation.userId,
        entityId: conversation.id,
        timestamp: new Date().toISOString(),
        entity: conversation
      }
    });
  }

  public syncSupportConversationUpdated(conversation: any): void {
    this.broadcastSyncEvent({
      type: 'data_sync',
      data: {
        action: 'update-support-conversation',
        userId: conversation.userId,
        entityId: conversation.id,
        timestamp: new Date().toISOString(),
        entity: conversation
      }
    });
  }

  // Support message synchronization
  public syncSupportMessageCreated(message: any): void {
    this.broadcastSyncEvent({
      type: 'data_sync',
      data: {
        action: 'create-support-message',
        userId: message.userId,
        entityId: message.id,
        timestamp: new Date().toISOString(),
        entity: message
      }
    });
  }

  public syncSupportMessageUpdated(message: any): void {
    this.broadcastSyncEvent({
      type: 'data_sync',
      data: {
        action: 'update-support-message',
        userId: message.userId,
        entityId: message.id,
        timestamp: new Date().toISOString(),
        entity: message
      }
    });
  }

  // Generic synchronization method
  public syncData(action: SyncAction, data: any): void {
    this.broadcastSyncEvent({
      type: 'data_sync',
      data: {
        action,
        userId: data.userId,
        entityId: data.id,
        timestamp: new Date().toISOString(),
        entity: data
      }
    });
  }
}

// Export singleton instance
export const syncManager = SyncManager.getInstance();
