 export interface CryptoPrice {
  id: number;
  symbol: string;
  price: string;
  change24h: string;
  volume24h: string;
  updatedAt: string;
}

export interface Portfolio {
  id: number;
  user_id: string; // UUID string
  symbol: string;
  available: string;
  frozen: string;
  updatedAt: string;
}

export interface OrderBookEntry {
  price: string;
  amount: string;
  total?: string;
}

export interface OrderBook {
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
}

export interface UserDetails {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  address: string;
  password?: string; // For development/testing purposes
}

export interface Trade {
  id: number;
  userId: string; // UUID string
  symbol: string;
  side: 'buy' | 'sell' | 'long' | 'short';
  amount: string;
  price?: string;
  status: 'pending' | 'pending_approval' | 'approved' | 'rejected' | 'filled' | 'cancelled' | 'executed';
  fee_amount?: string;
  fee_rate?: string;
  fee_symbol?: string;
  createdAt: string;
  userDetails?: UserDetails;
}

export interface Transaction {
  id: number;
  userId: number;
  type: 'deposit' | 'withdraw' | 'trade' | 'convert';
  symbol: string;
  amount: string;
  status: 'pending' | 'completed' | 'failed';
  txHash?: string;
  address?: string;
  metadata?: any;
  createdAt: string;
}

export interface StakingPosition {
  id: number;
  userId: number;
  symbol: string;
  amount: string;
  apy: string;
  duration: number;
  startDate: string;
  endDate: string;
  status: 'active' | 'completed';
}

export interface StakingProduct {
  duration: number;
  apy: string;
  minAmount: string;
  maxAmount: string;
}

export interface LoanApplication {
  id: number;
  userId: string;
  amount: string;
  purpose: string;
  duration: number;
  monthlyIncome?: string;
  status: 'pending' | 'approved' | 'rejected';
  documents?: any;
  createdAt: string;
}

export interface FutureTrade {
  id: number;
  user_id: string;
  symbol: string;
  side: 'long' | 'short';
  amount: number;
  duration: number; // seconds
  profit_ratio: number; // percentage
  status: 'pending_approval' | 'approved' | 'rejected' | 'active' | 'completed' | 'cancelled';
  admin_approved: boolean;
  admin_notes?: string;
  rejection_reason?: string;
  created_at: string;
  approved_at?: string;
  expires_at?: string;
  completed_at?: string;
  final_result?: 'win' | 'loss';
  final_profit?: number;
  trade_intervals?: any; // JSON data for loss simulation
  users?: {
    id: string;
    email: string;
    full_name: string;
  };
}
