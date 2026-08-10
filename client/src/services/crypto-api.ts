import { apiRequest } from "@/lib/queryClient";
import type { CryptoPrice, Portfolio, Transaction, Trade, StakingPosition, LoanApplication } from "@/types/crypto";

export const cryptoApi = {
  // Crypto prices
  getPrices: async (): Promise<CryptoPrice[]> => {
    const response = await apiRequest("GET", "/api/crypto/prices");
    return response.json();
  },

  getPrice: async (symbol: string): Promise<CryptoPrice> => {
    const response = await apiRequest("GET", `/api/crypto/prices/${symbol}`);
    return response.json();
  },

  // Portfolio
  getPortfolio: async (userId: string): Promise<Portfolio[]> => {
    const response = await apiRequest("GET", `/api/portfolio/${userId}`);
    return response.json();
  },

  // Transactions
  getTransactions: async (userId: string, type?: string): Promise<Transaction[]> => {
    const url = type ? `/api/transactions/${userId}?type=${type}` : `/api/transactions/${userId}`;
    const response = await apiRequest("GET", url);
    return response.json();
  },

  createTransaction: async (transaction: Omit<Transaction, 'id' | 'createdAt'>): Promise<Transaction> => {
    const response = await apiRequest("POST", "/api/transactions", transaction);
    return response.json();
  },

  // Trades
  getTrades: async (userId: string): Promise<Trade[]> => {
    const response = await apiRequest("GET", `/api/trades/${userId}`);
    return response.json();
  },

  createTrade: async (trade: Omit<Trade, 'id' | 'createdAt'>): Promise<Trade> => {
    const response = await apiRequest("POST", "/api/trades", trade);
    return response.json();
  },

  cancelTrade: async (tradeId: number): Promise<Trade> => {
    const response = await apiRequest("PUT", `/api/trades/${tradeId}/cancel`);
    return response.json();
  },

  // Admin functions
  getPendingOrders: async (): Promise<Trade[]> => {
    const response = await apiRequest("GET", "/api/admin/pending-orders");
    return response.json();
  },

  getAllOrders: async (): Promise<Trade[]> => {
    const response = await apiRequest("GET", "/api/admin/all-orders");
    return response.json();
  },

  approveOrder: async (orderId: number): Promise<Trade> => {
    const response = await apiRequest("PUT", `/api/admin/orders/${orderId}/approve`);
    return response.json();
  },

  rejectOrder: async (orderId: number): Promise<Trade> => {
    const response = await apiRequest("PUT", `/api/admin/orders/${orderId}/reject`);
    return response.json();
  },

  // Staking
  getStakingPositions: async (userId: string): Promise<StakingPosition[]> => {
    const response = await apiRequest("GET", `/api/staking/${userId}`);
    return response.json();
  },

  createStakingPosition: async (position: Omit<StakingPosition, 'id' | 'startDate'>): Promise<StakingPosition> => {
    const response = await apiRequest("POST", "/api/staking", position);
    return response.json();
  },

  // Loans
  getLoanApplications: async (userId: string): Promise<LoanApplication[]> => {
    const response = await apiRequest("GET", `/api/loans/${userId}`);
    return response.json();
  },

  createLoanApplication: async (application: Omit<LoanApplication, 'id' | 'createdAt'>): Promise<LoanApplication> => {
    const response = await apiRequest("POST", "/api/loans", application);
    return response.json();
  },

  // Deposit address generation
  generateDepositAddress: async (symbol: string, network?: string): Promise<{ address: string; symbol: string; network: string }> => {
    const response = await apiRequest("POST", "/api/crypto/deposit-address", { symbol, network });
    return response.json();
  },

  // User info
  getUser: async (userId: string) => {
    const response = await apiRequest("GET", `/api/users/${userId}`);
    return response.json();
  },
};
