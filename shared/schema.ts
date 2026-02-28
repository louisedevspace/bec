import { pgTable, text, serial, decimal, timestamp, boolean, integer, json, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  fullName: text("full_name"),
  creditScore: decimal("credit_score", { precision: 3, scale: 2 }).default("0.60"), // Credit score from 0.00 to 1.00
  isVerified: boolean("is_verified").default(false),
  isActive: boolean("is_active").default(true), // User account status
  createdAt: timestamp("created_at").defaultNow(),
  role: text("role").notNull().default('user'),
});

export const depositAddresses = pgTable("deposit_addresses", {
  id: serial("id").primaryKey(),
  assetSymbol: text("asset_symbol").notNull().unique(),
  address: text("address").notNull(),
  network: text("network").notNull().default("mainnet"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: text("updated_by"), // References auth.users(id)
});

export const portfolios = pgTable("portfolios", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  symbol: text("symbol").notNull(),
  available: decimal("available", { precision: 20, scale: 8 }).default("0"),
  frozen: decimal("frozen", { precision: 20, scale: 8 }).default("0"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  type: text("type").notNull(), // deposit, withdraw, trade, convert
  symbol: text("symbol").notNull(),
  amount: decimal("amount", { precision: 20, scale: 8 }).notNull(),
  status: text("status").notNull(), // pending, completed, failed
  txHash: text("tx_hash"),
  address: text("address"),
  metadata: json("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const trades = pgTable("trades", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  symbol: text("symbol").notNull(), // BTC/USDT
  side: text("side").notNull(), // buy, sell, long, short
  amount: decimal("amount", { precision: 20, scale: 8 }).notNull(),
  price: decimal("price", { precision: 20, scale: 8 }),
  status: text("status").notNull(), // pending, filled, cancelled
  expiresAt: timestamp("expires_at"),
  deletedForUser: boolean("deleted_for_user").default(false), // Soft delete for user view
  rejectionReason: text("rejection_reason"), // Admin rejection reason
  createdAt: timestamp("created_at").defaultNow(),
});

export const futuresTrades = pgTable("futures_trades", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  symbol: text("symbol").notNull(), // BTC/USDT
  side: text("side").notNull(), // long, short
  amount: decimal("amount", { precision: 20, scale: 8 }).notNull(),
  duration: integer("duration").notNull(), // 60, 120, 180, 240, 360, 480, 600 seconds
  profitRatio: integer("profit_ratio").notNull(), // 30, 40, 50, 60, 70, 80, 100 percent
  status: text("status").notNull().default("pending_approval"), // pending_approval, approved, rejected, active, completed, cancelled
  adminApproved: boolean("admin_approved").default(false),
  adminNotes: text("admin_notes"),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").defaultNow(),
  approvedAt: timestamp("approved_at"),
  expiresAt: timestamp("expires_at"),
  completedAt: timestamp("completed_at"),
  finalResult: text("final_result"), // win, loss
  finalProfit: decimal("final_profit", { precision: 20, scale: 8 }), // actual profit/loss amount
  tradeIntervals: json("trade_intervals"), // store interval data for loss simulation
});

export const stakingPositions = pgTable("staking_positions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  symbol: text("symbol").notNull(),
  amount: decimal("amount", { precision: 20, scale: 8 }).notNull(),
  apy: decimal("apy", { precision: 5, scale: 2 }).notNull(),
  duration: integer("duration").notNull(), // days
  startDate: timestamp("start_date").defaultNow(),
  endDate: timestamp("end_date").notNull(),
  status: text("status").notNull(), // active, completed
});

export const loanApplications = pgTable("loan_applications", {
  id: serial("id").primaryKey(),
  user_id: text("user_id").notNull(),
  amount: decimal("amount", { precision: 20, scale: 2 }).notNull(),
  purpose: text("purpose").notNull(),
  duration: integer("duration").notNull(), // days
  monthlyIncome: decimal("monthly_income", { precision: 20, scale: 2 }),
  status: text("status").notNull(), // pending, approved, rejected
  documents: json("documents"), // file paths
  createdAt: timestamp("created_at").defaultNow(),
});

export const cryptoPrices = pgTable("crypto_prices", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull(),
  price: decimal("price", { precision: 20, scale: 8 }).notNull(),
  change24h: decimal("change24h", { precision: 10, scale: 4 }),
  volume24h: decimal("volume24h", { precision: 20, scale: 2 }),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const kycVerifications = pgTable("kyc_verifications", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  fullName: text("full_name").notNull(),
  ssn: text("ssn").notNull(),
  address: text("address").notNull(),
  frontIdUrl: text("front_id_url"),
  backIdUrl: text("back_id_url"),
  selfieWithIdUrl: text("selfie_with_id_url"),
  status: text("status").default("pending"),
  submittedAt: timestamp("submitted_at").defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
  rejectionReason: text("rejection_reason"),
});

export const depositRequests = pgTable("deposit_requests", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  symbol: text("symbol").notNull(),
  amount: decimal("amount", { precision: 20, scale: 8 }).notNull(),
  screenshotUrl: text("screenshot_url").notNull(),
  status: text("status").notNull().default("pending"), // pending, approved, rejected
  adminNotes: text("admin_notes"),
  rejectionReason: text("rejection_reason"),
  requireReverification: boolean("require_reverification").default(false),
  hiddenForUser: boolean("hidden_for_user").default(false),
  submittedAt: timestamp("submitted_at").defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
  reviewedBy: text("reviewed_by"), // admin user ID
  isNew: boolean("is_new").default(true),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const insertPortfolioSchema = createInsertSchema(portfolios).omit({
  id: true,
  updatedAt: true,
});

export const insertTransactionSchema = createInsertSchema(transactions).omit({
  id: true,
  createdAt: true,
});

export const insertTradeSchema = createInsertSchema(trades).omit({
  id: true,
  createdAt: true,
});

export const insertFutureTradeSchema = createInsertSchema(futuresTrades).omit({
  id: true,
  createdAt: true,
  approvedAt: true,
  expiresAt: true,
  completedAt: true,
  finalResult: true,
  finalProfit: true,
  tradeIntervals: true,
});

export const insertStakingPositionSchema = z.object({
  symbol: z.string(),
  amount: z.string(),
  apy: z.string(),
  duration: z.number(),
  endDate: z.string(), // Frontend sends this
  status: z.string(),
}).transform((data) => ({
  symbol: data.symbol,
  amount: data.amount,
  apy: data.apy,
  duration: data.duration,
  end_date: data.endDate, // Transform to database field name
  status: data.status,
  userId: undefined, // Add this so the server can override it
}));

export const insertLoanApplicationSchema = createInsertSchema(loanApplications).omit({
  id: true,
  createdAt: true,
});

export const insertCryptoPriceSchema = createInsertSchema(cryptoPrices).omit({
  id: true,
  updatedAt: true,
});

export const insertKycVerificationSchema = createInsertSchema(kycVerifications).omit({
  id: true,
  submittedAt: true,
  reviewedAt: true,
});

export const insertDepositRequestSchema = createInsertSchema(depositRequests).omit({
  id: true,
  submittedAt: true,
  reviewedAt: true,
  reviewedBy: true,
  isNew: true,
  hiddenForUser: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Portfolio = typeof portfolios.$inferSelect;
export type InsertPortfolio = z.infer<typeof insertPortfolioSchema>;

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;

export type Trade = typeof trades.$inferSelect;
export type InsertTrade = z.infer<typeof insertTradeSchema>;

export type FutureTrade = typeof futuresTrades.$inferSelect;
export type InsertFutureTrade = z.infer<typeof insertFutureTradeSchema>;

export type StakingPosition = typeof stakingPositions.$inferSelect;
export type InsertStakingPosition = z.infer<typeof insertStakingPositionSchema>;

export type LoanApplication = typeof loanApplications.$inferSelect;
export type InsertLoanApplication = z.infer<typeof insertLoanApplicationSchema>;

export type CryptoPrice = typeof cryptoPrices.$inferSelect;
export type InsertCryptoPrice = z.infer<typeof insertCryptoPriceSchema>;

export type KycVerification = typeof kycVerifications.$inferSelect;
export type InsertKycVerification = z.infer<typeof insertKycVerificationSchema>;

export const withdrawRequests = pgTable("withdraw_requests", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  symbol: text("symbol").notNull(),
  amount: decimal("amount", { precision: 20, scale: 8 }).notNull(),
  walletAddress: text("wallet_address").notNull(), // User's wallet address
  status: text("status").notNull().default("pending"), // pending, approved, rejected
  adminScreenshotUrl: text("admin_screenshot_url"), // Screenshot provided by admin
  adminNotes: text("admin_notes"),
  rejectionReason: text("rejection_reason"),
  requireReverification: boolean("require_reverification").default(false),
  hiddenForUser: boolean("hidden_for_user").default(false),
  submittedAt: timestamp("submitted_at").defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
  reviewedBy: text("reviewed_by"), // admin user ID
  isNew: boolean("is_new").default(true),
});

export const insertWithdrawRequestSchema = createInsertSchema(withdrawRequests).omit({
  id: true,
  submittedAt: true,
  reviewedAt: true,
  reviewedBy: true,
  isNew: true,
  hiddenForUser: true,
});

export type DepositRequest = typeof depositRequests.$inferSelect;
export type InsertDepositRequest = z.infer<typeof insertDepositRequestSchema>;
export type WithdrawRequest = typeof withdrawRequests.$inferSelect;
export type InsertWithdrawRequest = z.infer<typeof insertWithdrawRequestSchema>;

// Customer Support System - Direct Conversations
export const supportConversations = pgTable("support_conversations", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id").notNull(), // User can have multiple conversations
  subject: text("subject").notNull().default(''),
  status: text("status").notNull().default('open'), // open, in_progress, resolved, closed
  priority: text("priority").notNull().default('medium'), // low, medium, high, urgent
  isActive: boolean("is_active").default(true), // Whether conversation is active
  lastMessageAt: timestamp("last_message_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const supportMessages = pgTable("support_messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull(),
  senderId: uuid("sender_id").notNull(), // user ID or admin ID (UUID for Supabase)
  senderType: text("sender_type").notNull(), // user, admin
  message: text("message").notNull(),
  messageType: text("message_type").notNull().default("text"), // text, image, file
  attachmentUrl: text("attachment_url"), // for file attachments
  isRead: boolean("is_read").default(false),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Insert schemas for support system
export const insertSupportConversationSchema = createInsertSchema(supportConversations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastMessageAt: true,
});

export const insertSupportMessageSchema = createInsertSchema(supportMessages).omit({
  id: true,
  createdAt: true,
  readAt: true,
});

// Types for support system
export type SupportConversation = typeof supportConversations.$inferSelect;
export type InsertSupportConversation = z.infer<typeof insertSupportConversationSchema>;
export type SupportMessage = typeof supportMessages.$inferSelect;
export type InsertSupportMessage = z.infer<typeof insertSupportMessageSchema>;
