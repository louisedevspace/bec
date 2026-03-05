import { 
  users, portfolios, transactions, trades, stakingPositions, 
  loanApplications, cryptoPrices,
  type User, type InsertUser, type Portfolio, type InsertPortfolio,
  type Transaction, type InsertTransaction, type Trade, type InsertTrade,
  type StakingPosition, type InsertStakingPosition, type LoanApplication, 
  type InsertLoanApplication, type CryptoPrice, type InsertCryptoPrice
} from "@shared/schema";
import supabase from './supabaseClient';

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<InsertUser>): Promise<User | undefined>;

  // Portfolio
  getPortfolio(userId: string): Promise<Portfolio[]>;
  getPortfolioBySymbol(userId: string, symbol: string): Promise<Portfolio | undefined>;
  updatePortfolio(userId: string, symbol: string, updates: Partial<InsertPortfolio>): Promise<Portfolio>;

  // Transactions
  getTransactions(userId: string, type?: string): Promise<Transaction[]>;
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;
  updateTransaction(id: number, updates: Partial<InsertTransaction>): Promise<Transaction | undefined>;

  // Trades
  getTrades(userId: string): Promise<Trade[]>;
  getAllTrades(): Promise<Trade[]>; // New method for admin
  createTrade(trade: InsertTrade): Promise<Trade>;
  updateTrade(id: number, updates: Partial<InsertTrade>): Promise<Trade | undefined>;

  // Staking
  getStakingPositions(userId: string): Promise<StakingPosition[]>;
  createStakingPosition(position: InsertStakingPosition): Promise<StakingPosition>;

  // Loans
  getLoanApplications(userId: string): Promise<LoanApplication[]>;
  createLoanApplication(application: InsertLoanApplication): Promise<LoanApplication>;

  // Crypto Prices
  getCryptoPrices(): Promise<CryptoPrice[]>;
  getCryptoPrice(symbol: string): Promise<CryptoPrice | undefined>;
  updateCryptoPrice(symbol: string, updates: Partial<InsertCryptoPrice>): Promise<CryptoPrice>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User> = new Map();
  private portfolios: Map<string, Portfolio> = new Map(); // key: userId-symbol
  private transactions: Map<number, Transaction> = new Map();
  private trades: Map<number, Trade> = new Map();
  private stakingPositions: Map<number, StakingPosition> = new Map();
  private loanApplications: Map<number, LoanApplication> = new Map();
  private cryptoPrices: Map<string, CryptoPrice> = new Map();
  
  private currentPortfolioId = 1;
  private currentTransactionId = 1;
  private currentTradeId = 1;
  private currentStakingId = 1;
  private currentLoanId = 1;
  private currentPriceId = 1;

  constructor() {
    // No dummy data initialization - everything will be live
  }

  // User methods
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    // Since we don't have username field anymore, return undefined
    return undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.email === email);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const user: User = {
      ...insertUser,
      id: crypto.randomUUID(), // Generate UUID
      createdAt: new Date(),
      role: insertUser.role ?? 'user',
      isVerified: insertUser.isVerified ?? null,
      creditScore: insertUser.creditScore ?? null,
      isActive: insertUser.isActive ?? null,
      fullName: insertUser.fullName ?? null,
      walletLocked: insertUser.walletLocked ?? null,
    };
    this.users.set(user.id, user);
    return user;
  }

  async updateUser(id: string, updates: Partial<InsertUser>): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    
    const updatedUser = { ...user, ...updates };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  // Portfolio methods
  async getPortfolio(userId: string): Promise<Portfolio[]> {
    return Array.from(this.portfolios.values()).filter(p => p.userId === userId);
  }

  async getPortfolioBySymbol(userId: string, symbol: string): Promise<Portfolio | undefined> {
    return this.portfolios.get(`${userId}-${symbol}`);
  }

  async updatePortfolio(userId: string, symbol: string, updates: Partial<InsertPortfolio>): Promise<Portfolio> {
    const key = `${userId}-${symbol}`;
    const existing = this.portfolios.get(key);
    
    if (existing) {
      const updated = { ...existing, ...updates, updatedAt: new Date() };
      this.portfolios.set(key, updated);
      return updated;
    } else {
      const newPortfolio: Portfolio = {
        id: this.currentPortfolioId++,
        userId,
        symbol,
        available: '0',
        frozen: '0',
        ...updates,
        updatedAt: new Date(),
      };
      this.portfolios.set(key, newPortfolio);
      return newPortfolio;
    }
  }

  // Transaction methods
  async getTransactions(userId: string, type?: string): Promise<Transaction[]> {
    return Array.from(this.transactions.values())
      .filter(t => t.userId === userId && (!type || t.type === type))
      .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
  }

  async createTransaction(insertTransaction: InsertTransaction): Promise<Transaction> {
    const transaction: Transaction = {
      ...insertTransaction,
      id: this.currentTransactionId++,
      createdAt: new Date(),
      txHash: insertTransaction.txHash ?? null,
      address: insertTransaction.address ?? null,
      metadata: insertTransaction.metadata ?? null,
    };
    this.transactions.set(transaction.id, transaction);
    return transaction;
  }

  async updateTransaction(id: number, updates: Partial<InsertTransaction>): Promise<Transaction | undefined> {
    const transaction = this.transactions.get(id);
    if (!transaction) return undefined;
    
    const updated = { ...transaction, ...updates };
    this.transactions.set(id, updated);
    return updated;
  }

  // Trade methods
  async getTrades(userId: string): Promise<Trade[]> {
    return Array.from(this.trades.values())
      .filter(t => t.userId === userId)
      .sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });
  }

  async getAllTrades(): Promise<Trade[]> {
    return Array.from(this.trades.values())
      .sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });
  }

  async createTrade(insertTrade: InsertTrade): Promise<Trade> {
    const trade: Trade = {
      ...insertTrade,
      id: this.currentTradeId++,
      createdAt: new Date(),
      price: insertTrade.price ?? null,
      rejectionReason: insertTrade.rejectionReason ?? null,
      expiresAt: insertTrade.expiresAt ?? null,
      deletedForUser: insertTrade.deletedForUser ?? null,
    };
    this.trades.set(trade.id, trade);
    return trade;
  }

  async updateTrade(id: number, updates: Partial<InsertTrade>): Promise<Trade | undefined> {
    const trade = this.trades.get(id);
    if (!trade) return undefined;
    
    const updated = { ...trade, ...updates };
    this.trades.set(id, updated);
    return updated;
  }

  // Staking methods
  async getStakingPositions(userId: string): Promise<StakingPosition[]> {
    return Array.from(this.stakingPositions.values())
      .filter(s => s.userId === userId);
  }

  async createStakingPosition(insertPosition: InsertStakingPosition): Promise<StakingPosition> {
    const raw = insertPosition as Record<string, unknown>;
    const position: StakingPosition = {
      ...insertPosition,
      id: this.currentStakingId++,
      userId: (raw.userId as string) ?? '',
      startDate: new Date(),
      endDate: raw.end_date ? new Date(raw.end_date as string) : new Date(),
    };
    this.stakingPositions.set(position.id, position);
    return position;
  }

  // Loan methods
  async getLoanApplications(userId: string): Promise<LoanApplication[]> {
    return Array.from(this.loanApplications.values())
      .filter(l => l.user_id === userId)
      .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
  }

  async createLoanApplication(insertApplication: InsertLoanApplication): Promise<LoanApplication> {
    const application: LoanApplication = {
      ...insertApplication,
      id: this.currentLoanId++,
      createdAt: new Date(),
      monthlyIncome: insertApplication.monthlyIncome ?? null,
      documents: insertApplication.documents ?? null,
    };
    this.loanApplications.set(application.id, application);
    return application;
  }

  // Crypto price methods
  async getCryptoPrices(): Promise<CryptoPrice[]> {
    return Array.from(this.cryptoPrices.values())
      .sort((a, b) => a.symbol.localeCompare(b.symbol));
  }

  async getCryptoPrice(symbol: string): Promise<CryptoPrice | undefined> {
    return this.cryptoPrices.get(symbol);
  }

  async updateCryptoPrice(symbol: string, updates: Partial<InsertCryptoPrice>): Promise<CryptoPrice> {
    const existing = this.cryptoPrices.get(symbol);
    
    if (existing) {
      const updated = { ...existing, ...updates, updatedAt: new Date() };
      this.cryptoPrices.set(symbol, updated);
      return updated;
    } else {
      const newPrice: CryptoPrice = {
        id: this.currentPriceId++,
        symbol,
        price: '0',
        change24h: '0',
        volume24h: '0',
        ...updates,
        updatedAt: new Date(),
      };
      this.cryptoPrices.set(symbol, newPrice);
      return newPrice;
    }
  }
}

class SupabaseStorage implements IStorage {
  // Users
  async getUser(id: string) {
    try {
      const { data } = await supabase.from('users').select('*').eq('id', id).maybeSingle();
      return data || undefined;
    } catch (error) {
      console.error('Supabase getUser error:', error);
      throw error;
    }
  }
  async getUserByUsername(username: string) {
    try {
      const { data } = await supabase.from('users').select('*').eq('username', username).maybeSingle();
      return data || undefined;
    } catch (error) {
      console.error('Supabase getUserByUsername error:', error);
      throw error;
    }
  }
  async getUserByEmail(email: string) {
    try {
      const { data } = await supabase.from('users').select('*').eq('email', email).maybeSingle();
      return data || undefined;
    } catch (error) {
      console.error('Supabase getUserByEmail error:', error);
      throw error;
    }
  }
  async createUser(user: InsertUser) {
    try {
      const { data, error } = await supabase.from('users').insert([user]).select().maybeSingle();
      if (error) { console.error('Supabase createUser error:', error); throw error; }
      return data;
    } catch (error) {
      console.error('Supabase createUser error:', error);
      throw error;
    }
  }
  async updateUser(id: string, updates: Partial<InsertUser>) {
    try {
      const { data, error } = await supabase.from('users').update(updates).eq('id', id).select().maybeSingle();
      if (error) { console.error('Supabase updateUser error:', error); throw error; }
      return data || undefined;
    } catch (error) {
      console.error('Supabase updateUser error:', error);
      throw error;
    }
  }

  // Portfolio
  async getPortfolio(userId: string) {
    try {
      const { data } = await supabase.from('portfolios').select('*').eq('user_id', userId);
      return data || [];
    } catch (error) {
      console.error('Supabase getPortfolio error:', error);
      throw error;
    }
  }
  async getPortfolioBySymbol(userId: string, symbol: string) {
    try {
      const { data } = await supabase.from('portfolios').select('*').eq('user_id', userId).eq('symbol', symbol).maybeSingle();
      return data || undefined;
    } catch (error) {
      console.error('Supabase getPortfolioBySymbol error:', error);
      throw error;
    }
  }
  async updatePortfolio(userId: string, symbol: string, updates: Partial<InsertPortfolio>) {
    try {
      const { data, error } = await supabase.from('portfolios').update(updates).eq('user_id', userId).eq('symbol', symbol).select().maybeSingle();
      if (error) { console.error('Supabase updatePortfolio error:', error); throw error; }
      return data;
    } catch (error) {
      console.error('Supabase updatePortfolio error:', error);
      throw error;
    }
  }

  // Transactions
  async getTransactions(userId: string, type?: string) {
    try {
      let query = supabase.from('transactions').select('*').eq('user_id', userId);
      if (type) query = query.eq('type', type);
      const { data } = await query.order('created_at', { ascending: false });
      return data || [];
    } catch (error) {
      console.error('Supabase getTransactions error:', error);
      throw error;
    }
  }
  async createTransaction(transaction: InsertTransaction) {
    try {
      const { data, error } = await supabase.from('transactions').insert([transaction]).select().maybeSingle();
      if (error) { console.error('Supabase createTransaction error:', error); throw error; }
      return data;
    } catch (error) {
      console.error('Supabase createTransaction error:', error);
      throw error;
    }
  }
  async updateTransaction(id: number, updates: Partial<InsertTransaction>) {
    try {
      const { data, error } = await supabase.from('transactions').update(updates).eq('id', id).select().maybeSingle();
      if (error) { console.error('Supabase updateTransaction error:', error); throw error; }
      return data || undefined;
    } catch (error) {
      console.error('Supabase updateTransaction error:', error);
      throw error;
    }
  }

  // Trades
  async getTrades(userId: string) {
    try {
      const { data } = await supabase.from('trades').select('*').eq('user_id', userId).order('created_at', { ascending: false });
      return data || [];
    } catch (error) {
      console.error('Supabase getTrades error:', error);
      throw error;
    }
  }

  async getAllTrades() {
    try {
      const { data } = await supabase.from('trades').select('*').order('created_at', { ascending: false });
      return data || [];
    } catch (error) {
      console.error('Supabase getAllTrades error:', error);
      throw error;
    }
  }

  async getTradeById(id: number) {
    try {
      console.log('getTradeById: Fetching trade with ID:', id);
      const { data, error } = await supabase.from('trades').select('*').eq('id', id).maybeSingle();
      console.log('getTradeById: Database response:', { data, error });
      if (error) { 
        console.error('Supabase getTradeById error:', error); 
        throw error; 
      }
      console.log('getTradeById: Returning trade:', data);
      return data;
    } catch (error) {
      console.error('Supabase getTradeById error:', error);
      throw error;
    }
  }
  async createTrade(trade: InsertTrade) {
    try {
      // Map the field names to match the database schema
      const tradeData = {
        user_id: trade.userId,
        symbol: trade.symbol,
        side: trade.side,
        amount: trade.amount,
        price: trade.price,
        status: trade.status
      };
      
      const { data, error } = await supabase.from('trades').insert([tradeData]).select().maybeSingle();
      if (error) { console.error('Supabase createTrade error:', error); throw error; }
      return data;
    } catch (error) {
      console.error('Supabase createTrade error:', error);
      throw error;
    }
  }
  async updateTrade(id: number, updates: Partial<InsertTrade>) {
    try {
      // Map the field names to match the database schema
      const updateData: any = {};
      if (updates.userId !== undefined) updateData.user_id = updates.userId;
      if (updates.symbol !== undefined) updateData.symbol = updates.symbol;
      if (updates.side !== undefined) updateData.side = updates.side;
      if (updates.amount !== undefined) updateData.amount = updates.amount;
      if (updates.price !== undefined) updateData.price = updates.price;
      if (updates.status !== undefined) updateData.status = updates.status;
      if (updates.expiresAt !== undefined) updateData.expires_at = updates.expiresAt;
      if (updates.deletedForUser !== undefined) updateData.deleted_for_user = updates.deletedForUser;
      if (updates.rejectionReason !== undefined) updateData.rejection_reason = updates.rejectionReason;
      
      const { data, error } = await supabase.from('trades').update(updateData).eq('id', id).select().maybeSingle();
      if (error) { console.error('Supabase updateTrade error:', error); throw error; }
      return data || undefined;
    } catch (error) {
      console.error('Supabase updateTrade error:', error);
      throw error;
    }
  }

  // Staking
  async getStakingPositions(userId: string) {
    try {
      const { data } = await supabase.from('staking_positions').select('*').eq('user_id', userId);
      return data || [];
    } catch (error) {
      console.error('Supabase getStakingPositions error:', error);
      throw error;
    }
  }
  async createStakingPosition(position: InsertStakingPosition) {
    try {
      const { data, error } = await supabase.from('staking_positions').insert([position]).select().maybeSingle();
      if (error) { console.error('Supabase createStakingPosition error:', error); throw error; }
      return data;
    } catch (error) {
      console.error('Supabase createStakingPosition error:', error);
      throw error;
    }
  }

  // Loans
  async getLoanApplications(userId: string) {
    try {
      const { data } = await supabase.from('loan_applications').select('*').eq('user_id', userId).order('created_at', { ascending: false });
      return data || [];
    } catch (error) {
      console.error('Supabase getLoanApplications error:', error);
      throw error;
    }
  }
  async createLoanApplication(application: InsertLoanApplication) {
    try {
      const { data, error } = await supabase.from('loan_applications').insert([application]).select().maybeSingle();
      if (error) { console.error('Supabase createLoanApplication error:', error); throw error; }
      return data;
    } catch (error) {
      console.error('Supabase createLoanApplication error:', error);
      throw error;
    }
  }

  // Crypto Prices
  async getCryptoPrices() {
    try {
      const { data } = await supabase.from('crypto_prices').select('*').order('symbol');
      return data || [];
    } catch (error) {
      console.error('Supabase getCryptoPrices error:', error);
      throw error;
    }
  }
  async getCryptoPrice(symbol: string) {
    try {
      const { data } = await supabase.from('crypto_prices').select('*').eq('symbol', symbol).maybeSingle();
      return data || undefined;
    } catch (error) {
      console.error('Supabase getCryptoPrice error:', error);
      throw error;
    }
  }
  async updateCryptoPrice(symbol: string, updates: Partial<InsertCryptoPrice>) {
    try {
      const { data, error } = await supabase.from('crypto_prices').update(updates).eq('symbol', symbol).select().maybeSingle();
      if (error) { console.error('Supabase updateCryptoPrice error:', error); throw error; }
      return data;
    } catch (error) {
      console.error('Supabase updateCryptoPrice error:', error);
      throw error;
    }
  }
}

export const storage = new SupabaseStorage();
