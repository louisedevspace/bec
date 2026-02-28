import { apiRequest } from '../lib/queryClient';
import type { CryptoPrice, Portfolio } from '../types/crypto';
import type { User, Transaction } from '../../../shared/schema';
import { supabase } from '../lib/supabaseClient';
import { config } from '../lib/config';

const API_BASE = `${config.apiBaseUrl}/api`;

export const authApi = {
  register: async ({ email, password }: { email: string; password: string }) => {
    const { data, error } = await supabase.auth.signUp({ 
      email, 
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/login`
      }
    });
    if (error) throw error;
    return data.user;
  },
  login: async ({ email, password }: { email: string; password: string }) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.session;
  },
  logout: async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },
  getCurrentUser: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  },
};

export const marketApi = {
  getMarketData: async (): Promise<CryptoPrice[]> => {
    const response = await apiRequest('GET', `${API_BASE}/market/data`);
    return response.json();
  },
  
  getSymbolPrice: async (symbol: string): Promise<CryptoPrice> => {
    const response = await apiRequest('GET', `${API_BASE}/market/price/${symbol}`);
    return response.json();
  },
};

export const tradingApi = {
  createOrder: async (order: {
    type: 'buy' | 'sell';
    symbol: string;
    amount: number;
    price: number;
  }) => {
    const response = await apiRequest('POST', `${API_BASE}/trading/order`, order);
    return response.json();
  },
  
  getTransactionHistory: async (userId: number): Promise<Transaction[]> => {
    const response = await apiRequest('GET', `${API_BASE}/trading/history/${userId}`);
    return response.json();
  },
};

export const portfolioApi = {
  getPortfolio: async (userId: number): Promise<Portfolio[]> => {
    const response = await apiRequest('GET', `${API_BASE}/portfolio/${userId}`);
    return response.json();
  },
  
  getPortfolioValue: async (userId: number): Promise<{ totalValue: number; dailyPnL: number }> => {
    const response = await apiRequest('GET', `${API_BASE}/portfolio/value/${userId}`);
    return response.json();
  },
};

export const exchangeApi = {
  getExchangeRate: async (from: string, to: string): Promise<{ rate: number; fee: number }> => {
    const response = await apiRequest('GET', `${API_BASE}/exchange/rate?from=${from}&to=${to}`);
    return response.json();
  },
  
  createExchange: async (exchange: {
    fromSymbol: string;
    toSymbol: string;
    amount: number;
  }) => {
    const response = await apiRequest('POST', `${API_BASE}/exchange/create`, exchange);
    return response.json();
  },
};

export const loanApi = {
  getLoans: async (userId: number) => {
    const response = await apiRequest('GET', `${API_BASE}/loans/${userId}`);
    return response.json();
  },
  
  createLoan: async (loan: {
    collateralSymbol: string;
    collateralAmount: number;
    loanSymbol: string;
    loanAmount: number;
    interestRate: number;
  }) => {
    const response = await apiRequest('POST', `${API_BASE}/loans/create`, loan);
    return response.json();
  },
}; 