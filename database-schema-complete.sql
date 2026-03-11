-- ============================================================
-- Becxus Exchange — Complete Consolidated Database Schema
-- ============================================================
-- This is the SINGLE SOURCE OF TRUTH for all Supabase tables,
-- indexes, RLS policies, storage bucket policies, and initial data.
--
-- Run this entire file in the Supabase SQL Editor to set up
-- a complete database from scratch. All statements use 
-- IF NOT EXISTS / IF EXISTS so they are safe to re-run.
--
-- Version: 2.3.0
-- Last Updated: 2025-06-14
-- Compatible with: Supabase PostgreSQL 15+
-- ============================================================


-- ************************************************************
-- SECTION 1: TABLE DEFINITIONS
-- ************************************************************

-- ----------------------------------------------------------
-- 1.1 Users
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,                -- Supabase Auth UUID stored as text
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL DEFAULT '--supabase-auth--',
  full_name TEXT,
  credit_score DECIMAL(5,2) DEFAULT 0.60,    -- Range: 0.00-1.00
  is_verified BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  role TEXT NOT NULL DEFAULT 'user',
  display_id TEXT,
  profile_picture TEXT,
  phone TEXT,
  futures_min_amount DECIMAL(20,8) DEFAULT 50,      -- Per-user futures minimum trade amount
  futures_trade_result TEXT DEFAULT NULL,           -- NULL = use is_active logic, 'win', 'loss'
  wallet_locked BOOLEAN DEFAULT FALSE,              -- Admin can lock user wallet
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add columns that may not exist in older databases
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='display_id') THEN
    ALTER TABLE users ADD COLUMN display_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='profile_picture') THEN
    ALTER TABLE users ADD COLUMN profile_picture TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='phone') THEN
    ALTER TABLE users ADD COLUMN phone TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='futures_min_amount') THEN
    ALTER TABLE users ADD COLUMN futures_min_amount DECIMAL(20,8) DEFAULT 50;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='futures_trade_result') THEN
    ALTER TABLE users ADD COLUMN futures_trade_result TEXT DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='wallet_locked') THEN
    ALTER TABLE users ADD COLUMN wallet_locked BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- Index for quick lookup of locked wallets
CREATE INDEX IF NOT EXISTS idx_users_wallet_locked ON users(wallet_locked) WHERE wallet_locked = TRUE;

-- ----------------------------------------------------------
-- 1.2 User Passwords (separate secure storage)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_passwords (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  password TEXT NOT NULL,                           -- Hashed password for authentication
  plaintext_password TEXT,                          -- Plaintext password for admin viewing
  encrypted_at TIMESTAMPTZ DEFAULT NOW(),
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- Add plaintext_password column if it doesn't exist (for existing databases)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_passwords' 
    AND column_name = 'plaintext_password'
  ) THEN
    ALTER TABLE user_passwords ADD COLUMN plaintext_password TEXT;
  END IF;
END $$;

COMMENT ON COLUMN user_passwords.password IS 'Stores hashed password (PBKDF2) for secure authentication';
COMMENT ON COLUMN user_passwords.plaintext_password IS 'Stores plaintext password for admin viewing purposes';

-- ----------------------------------------------------------
-- 1.3 Deposit Addresses (admin-managed crypto addresses)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS deposit_addresses (
  id SERIAL PRIMARY KEY,
  asset_symbol TEXT NOT NULL UNIQUE,
  address TEXT NOT NULL,
  network TEXT NOT NULL DEFAULT 'mainnet',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  min_deposit DECIMAL(20,8) DEFAULT NULL,
  max_deposit DECIMAL(20,8) DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT
);

-- Add min/max deposit columns if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='deposit_addresses' AND column_name='min_deposit') THEN
    ALTER TABLE deposit_addresses ADD COLUMN min_deposit DECIMAL(20,8) DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='deposit_addresses' AND column_name='max_deposit') THEN
    ALTER TABLE deposit_addresses ADD COLUMN max_deposit DECIMAL(20,8) DEFAULT NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS deposit_address_audit_logs (
  id SERIAL PRIMARY KEY,
  asset_symbol TEXT NOT NULL,
  action TEXT NOT NULL,
  old_address TEXT,
  old_network TEXT,
  new_address TEXT,
  new_network TEXT,
  admin_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------
-- 1.4 Portfolios
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS portfolios (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  available DECIMAL(20,8) DEFAULT 0,
  frozen DECIMAL(20,8) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, symbol)
);

-- Performance indexes for portfolios
CREATE INDEX IF NOT EXISTS idx_portfolios_user_id ON portfolios(user_id);

-- ----------------------------------------------------------
-- 1.5 Transactions
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,                 -- deposit, withdraw, trade, convert
  symbol TEXT NOT NULL,
  amount DECIMAL(20,8) NOT NULL,
  status TEXT NOT NULL,               -- pending, completed, failed
  tx_hash TEXT,
  address TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance indexes for transactions
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_user_type ON transactions(user_id, type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);

-- ----------------------------------------------------------
-- 1.6 Trades (spot)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS trades (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  symbol TEXT NOT NULL,               -- e.g. BTC/USDT
  side TEXT NOT NULL,                 -- buy, sell
  amount DECIMAL(20,8) NOT NULL,
  price DECIMAL(20,8),
  status TEXT NOT NULL DEFAULT 'pending_approval',  -- pending_approval, filled, cancelled
  expires_at TIMESTAMPTZ,
  deleted_for_user BOOLEAN DEFAULT FALSE,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add columns that may not exist in older databases
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trades' AND column_name='deleted_for_user') THEN
    ALTER TABLE trades ADD COLUMN deleted_for_user BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trades' AND column_name='rejection_reason') THEN
    ALTER TABLE trades ADD COLUMN rejection_reason TEXT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_trades_deleted_for_user ON trades(deleted_for_user);
CREATE INDEX IF NOT EXISTS idx_trades_user_deleted ON trades(user_id, deleted_for_user);
CREATE INDEX IF NOT EXISTS idx_trades_user_id ON trades(user_id);
CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
CREATE INDEX IF NOT EXISTS idx_trades_user_status ON trades(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_created_at ON trades(created_at DESC);

-- ----------------------------------------------------------
-- 1.7 Futures Trades
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS futures_trades (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  symbol TEXT NOT NULL,               -- e.g. BTC/USDT
  side TEXT NOT NULL,                 -- long, short
  amount DECIMAL(20,8) NOT NULL,
  duration INTEGER NOT NULL,          -- seconds: 60, 120, 180, 240, 360, 480, 600
  profit_ratio INTEGER NOT NULL,      -- percent: 30, 40, 50, 60, 70, 80, 100
  status TEXT NOT NULL DEFAULT 'pending_approval',
  admin_approved BOOLEAN DEFAULT FALSE,
  admin_notes TEXT,
  rejection_reason TEXT,
  entry_price DECIMAL(20,8),
  exit_price DECIMAL(20,8),
  profit_loss DECIMAL(20,8),
  deleted_for_user BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  final_result TEXT,                  -- win, loss
  final_profit DECIMAL(20,8),
  trade_intervals JSONB
);

-- Add columns that may not exist in older databases
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='futures_trades' AND column_name='deleted_for_user') THEN
    ALTER TABLE futures_trades ADD COLUMN deleted_for_user BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='futures_trades' AND column_name='final_result') THEN
    ALTER TABLE futures_trades ADD COLUMN final_result TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='futures_trades' AND column_name='final_profit') THEN
    ALTER TABLE futures_trades ADD COLUMN final_profit DECIMAL(20,8);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='futures_trades' AND column_name='trade_intervals') THEN
    ALTER TABLE futures_trades ADD COLUMN trade_intervals JSONB;
  END IF;
END $$;

-- Performance indexes for futures trades
CREATE INDEX IF NOT EXISTS idx_futures_trades_user_id ON futures_trades(user_id);
CREATE INDEX IF NOT EXISTS idx_futures_trades_status ON futures_trades(status);
CREATE INDEX IF NOT EXISTS idx_futures_trades_user_status ON futures_trades(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_futures_trades_expires_at ON futures_trades(expires_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_futures_trades_deleted ON futures_trades(user_id, deleted_for_user);

-- ----------------------------------------------------------
-- 1.8 Staking Positions
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS staking_positions (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  amount DECIMAL(20,8) NOT NULL,
  apy DECIMAL(5,2) NOT NULL,
  duration INTEGER NOT NULL,          -- days
  start_date TIMESTAMPTZ DEFAULT NOW(),
  end_date TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL                -- active, completed
);

-- Performance indexes for staking positions
CREATE INDEX IF NOT EXISTS idx_staking_positions_user_id ON staking_positions(user_id);
CREATE INDEX IF NOT EXISTS idx_staking_positions_status ON staking_positions(status);
CREATE INDEX IF NOT EXISTS idx_staking_positions_end_date ON staking_positions(end_date) WHERE status = 'active';

-- ----------------------------------------------------------
-- 1.8a User Staking Limits
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_staking_limits (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  max_stake_amount DECIMAL(20,8),        -- max single stake amount
  max_total_staked DECIMAL(20,8),        -- max total active staked amount
  max_duration INTEGER,                   -- max staking duration in days
  min_stake_amount DECIMAL(20,8),        -- min single stake amount
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE, -- allow/block staking for this user
  notes TEXT,                             -- admin notes
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT                         -- admin user ID who last updated
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_staking_limits_user ON user_staking_limits(user_id);
CREATE INDEX IF NOT EXISTS idx_user_staking_limits_enabled ON user_staking_limits(is_enabled);

-- ----------------------------------------------------------
-- 1.9 Loan Applications
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS loan_applications (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  amount DECIMAL(20,2) NOT NULL,
  purpose TEXT NOT NULL,
  duration INTEGER NOT NULL,          -- days
  monthly_income DECIMAL(20,2),
  status TEXT NOT NULL,               -- pending, approved, rejected
  loan_status TEXT DEFAULT 'pending', -- pending, active, paid, defaulted
  is_reminder_sent BOOLEAN DEFAULT FALSE, -- Whether payment reminder has been sent
  documents JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  rejection_reason TEXT,
  loan_pay_date TIMESTAMPTZ
);

-- Add columns that may not exist in older databases
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'loan_applications' AND column_name = 'loan_status'
  ) THEN
    ALTER TABLE loan_applications ADD COLUMN loan_status TEXT DEFAULT 'pending';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'loan_applications' AND column_name = 'is_reminder_sent'
  ) THEN
    ALTER TABLE loan_applications ADD COLUMN is_reminder_sent BOOLEAN DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'loan_applications' AND column_name = 'loan_pay_date'
  ) THEN
    ALTER TABLE loan_applications ADD COLUMN loan_pay_date TIMESTAMPTZ;
  END IF;
END $$;

-- Performance indexes for loan applications
CREATE INDEX IF NOT EXISTS idx_loan_applications_user_id ON loan_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_loan_applications_status ON loan_applications(status);
CREATE INDEX IF NOT EXISTS idx_loan_applications_loan_status ON loan_applications(loan_status);

-- ----------------------------------------------------------
-- 1.10 Crypto Prices (public market data)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS crypto_prices (
  id SERIAL PRIMARY KEY,
  symbol TEXT NOT NULL UNIQUE,
  price DECIMAL(20,8) NOT NULL,
  change24h DECIMAL(10,4),
  volume24h DECIMAL(20,2),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------
-- 1.11 Crypto Logos (cached logo URLs)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS crypto_logos (
  id SERIAL PRIMARY KEY,
  symbol TEXT NOT NULL UNIQUE,
  logo_url TEXT NOT NULL,
  homepage_url TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------
-- 1.12 KYC Verifications
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS kyc_verifications (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  ssn TEXT NOT NULL,
  address TEXT NOT NULL,
  front_id_url TEXT,
  back_id_url TEXT,
  selfie_with_id_url TEXT,
  status TEXT DEFAULT 'pending',
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT
);

-- Performance indexes for KYC verifications
CREATE INDEX IF NOT EXISTS idx_kyc_verifications_user_id ON kyc_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_kyc_verifications_status ON kyc_verifications(status);

-- 1.12a KYC Documents (legacy/cleanup support)
CREATE TABLE IF NOT EXISTS kyc_documents (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  doc_type TEXT NOT NULL,             -- e.g. 'front_id', 'back_id', 'selfie', 'other'
  file_url TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance indexes for KYC documents
CREATE INDEX IF NOT EXISTS idx_kyc_documents_user_id ON kyc_documents(user_id);

-- ----------------------------------------------------------
-- 1.13 Deposit Requests
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS deposit_requests (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  amount DECIMAL(20,8) NOT NULL,
  screenshot_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_notes TEXT,
  rejection_reason TEXT,
  require_reverification BOOLEAN DEFAULT FALSE,
  hidden_for_user BOOLEAN DEFAULT FALSE,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  is_new BOOLEAN DEFAULT TRUE
);

-- Add columns that may not exist in older databases
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='deposit_requests' AND column_name='require_reverification') THEN
    ALTER TABLE deposit_requests ADD COLUMN require_reverification BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='deposit_requests' AND column_name='hidden_for_user') THEN
    ALTER TABLE deposit_requests ADD COLUMN hidden_for_user BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='deposit_requests' AND column_name='is_new') THEN
    ALTER TABLE deposit_requests ADD COLUMN is_new BOOLEAN DEFAULT TRUE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_deposit_requests_user ON deposit_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_deposit_requests_status ON deposit_requests(status);
CREATE INDEX IF NOT EXISTS idx_deposit_requests_is_new ON deposit_requests(is_new);

-- ----------------------------------------------------------
-- 1.14 Withdraw Requests
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS withdraw_requests (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  amount DECIMAL(20,8) NOT NULL,
  wallet_address TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_screenshot_url TEXT,
  admin_notes TEXT,
  rejection_reason TEXT,
  require_reverification BOOLEAN DEFAULT FALSE,
  hidden_for_user BOOLEAN DEFAULT FALSE,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  is_new BOOLEAN DEFAULT TRUE
);

-- Add columns that may not exist in older databases
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='withdraw_requests' AND column_name='admin_screenshot_url') THEN
    ALTER TABLE withdraw_requests ADD COLUMN admin_screenshot_url TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='withdraw_requests' AND column_name='require_reverification') THEN
    ALTER TABLE withdraw_requests ADD COLUMN require_reverification BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='withdraw_requests' AND column_name='hidden_for_user') THEN
    ALTER TABLE withdraw_requests ADD COLUMN hidden_for_user BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='withdraw_requests' AND column_name='is_new') THEN
    ALTER TABLE withdraw_requests ADD COLUMN is_new BOOLEAN DEFAULT TRUE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_withdraw_requests_user ON withdraw_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_withdraw_requests_status ON withdraw_requests(status);
CREATE INDEX IF NOT EXISTS idx_withdraw_requests_is_new ON withdraw_requests(is_new);

-- ----------------------------------------------------------
-- 1.15 Support Conversations
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS support_conversations (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'medium',
  category TEXT DEFAULT 'general',          -- deposit, withdrawal, trading, account, staking, technical, security, general
  assigned_to UUID,                         -- Admin user assigned to this ticket
  is_active BOOLEAN DEFAULT TRUE,
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add columns that may not exist in older databases
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='support_conversations' AND column_name='subject') THEN
    ALTER TABLE support_conversations ADD COLUMN subject TEXT NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='support_conversations' AND column_name='priority') THEN
    ALTER TABLE support_conversations ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='support_conversations' AND column_name='category') THEN
    ALTER TABLE support_conversations ADD COLUMN category TEXT DEFAULT 'general';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='support_conversations' AND column_name='assigned_to') THEN
    ALTER TABLE support_conversations ADD COLUMN assigned_to UUID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='support_conversations' AND column_name='is_active') THEN
    ALTER TABLE support_conversations ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
  END IF;
END $$;

-- Performance indexes for support conversations
CREATE INDEX IF NOT EXISTS idx_support_conversations_user_id ON support_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_support_conversations_status ON support_conversations(status);
CREATE INDEX IF NOT EXISTS idx_support_conversations_last_message ON support_conversations(last_message_at DESC);

-- Drop unique constraint if it exists (for migration from old schema)
ALTER TABLE support_conversations DROP CONSTRAINT IF EXISTS support_conversations_user_id_key;

-- ----------------------------------------------------------
-- 1.16 Support Messages
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS support_messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES support_conversations(id),
  sender_id UUID NOT NULL,
  sender_type TEXT NOT NULL,          -- user, admin
  message TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text',  -- text, image, file
  attachment_url TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance indexes for support messages
CREATE INDEX IF NOT EXISTS idx_support_messages_conversation_id ON support_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_support_messages_created_at ON support_messages(conversation_id, created_at DESC);

-- ----------------------------------------------------------
-- 1.17 Audit Logs (Security & Compliance)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50),
  resource_id VARCHAR(100),
  details JSONB,
  ip_address VARCHAR(45),
  user_agent VARCHAR(500),
  status VARCHAR(20) DEFAULT 'success' CHECK (status IN ('success', 'failure', 'pending')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_type ON audit_logs(resource_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_status ON audit_logs(status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_action ON audit_logs(user_id, action, created_at DESC);

COMMENT ON TABLE audit_logs IS 'Comprehensive audit log for security monitoring and compliance';
COMMENT ON COLUMN audit_logs.action IS 'Type of action performed (e.g., PASSWORD_CHANGED, WITHDRAWAL_CREATE)';
COMMENT ON COLUMN audit_logs.resource_type IS 'Type of resource affected (e.g., WITHDRAWAL, TRADE, STAKING)';
COMMENT ON COLUMN audit_logs.resource_id IS 'ID of the affected resource';
COMMENT ON COLUMN audit_logs.details IS 'Additional details about the action (sensitive data is sanitized)';
COMMENT ON COLUMN audit_logs.ip_address IS 'Client IP address for security tracking';
COMMENT ON COLUMN audit_logs.user_agent IS 'Client user agent for device identification';
COMMENT ON COLUMN audit_logs.status IS 'Outcome of the action: success, failure, or pending';

-- ----------------------------------------------------------
-- 1.18 Trading Pairs (admin-configurable pair list)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS trading_pairs (
  id SERIAL PRIMARY KEY,
  symbol TEXT NOT NULL UNIQUE,                                  -- e.g. 'BTC/USDT'
  base_asset TEXT NOT NULL,                                     -- e.g. 'BTC'
  quote_asset TEXT NOT NULL,                                    -- e.g. 'USDT'
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  min_trade_amount DECIMAL(20,8) DEFAULT 0.0001,               -- Global minimum per trade
  max_trade_amount DECIMAL(20,8) DEFAULT 100,                  -- Global maximum per trade
  trading_fee DECIMAL(5,4) DEFAULT 0.001,                      -- 0.1%
  sort_order INTEGER DEFAULT 0,
  pair_type TEXT NOT NULL DEFAULT 'spot'                        -- 'spot', 'futures', 'both'
    CHECK (pair_type IN ('spot', 'futures', 'both')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trading_pairs_enabled ON trading_pairs(is_enabled, sort_order);
CREATE INDEX IF NOT EXISTS idx_trading_pairs_type ON trading_pairs(pair_type);

COMMENT ON TABLE trading_pairs IS 'Admin-managed list of available trading pairs';

-- ----------------------------------------------------------
-- 1.19 User Trading Limits (per-user / per-pair overrides)
-- ----------------------------------------------------------
-- Allows admin to set per-user or global min/max trade amounts
-- and to block specific users from trading specific pairs.
-- userId = '*' means global default for ALL users.
-- symbol = '*' means the limit applies to ALL pairs.
-- Priority: per-user + per-pair > per-user + wildcard > global + per-pair > global + wildcard
CREATE TABLE IF NOT EXISTS user_trading_limits (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,                                        -- user id or '*' for global
  symbol TEXT NOT NULL DEFAULT '*',                             -- pair symbol or '*' for all
  trade_type TEXT NOT NULL DEFAULT 'both'                       -- 'spot', 'futures', 'both'
    CHECK (trade_type IN ('spot', 'futures', 'both')),
  min_amount DECIMAL(20,8) DEFAULT 0,
  max_amount DECIMAL(20,8) DEFAULT 1000000,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,                    -- FALSE = user blocked from this pair
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, symbol, trade_type)
);

CREATE INDEX IF NOT EXISTS idx_user_trading_limits_user ON user_trading_limits(user_id);
CREATE INDEX IF NOT EXISTS idx_user_trading_limits_symbol ON user_trading_limits(symbol);

COMMENT ON TABLE user_trading_limits IS 'Per-user or global trading amount limits and access controls';
COMMENT ON COLUMN user_trading_limits.user_id IS 'User ID or * for global default';
COMMENT ON COLUMN user_trading_limits.symbol IS 'Trading pair symbol or * for all pairs';

-- ----------------------------------------------------------
-- 1.13 Platform Fees (Exchange Revenue Tracking)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_fees (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  trade_id INTEGER,
  trade_type TEXT NOT NULL DEFAULT 'spot' CHECK (trade_type IN ('spot', 'futures', 'staking', 'withdrawal')),
  symbol TEXT NOT NULL,
  fee_amount DECIMAL(20,8) NOT NULL DEFAULT 0,
  fee_symbol TEXT NOT NULL DEFAULT 'USDT',
  fee_rate TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_fees_user ON platform_fees(user_id);
CREATE INDEX IF NOT EXISTS idx_platform_fees_type ON platform_fees(trade_type);
CREATE INDEX IF NOT EXISTS idx_platform_fees_created ON platform_fees(created_at);

COMMENT ON TABLE platform_fees IS 'Tracks all exchange revenue from trading fees, withdrawal fees, etc.';

-- ----------------------------------------------------------
-- 1.21 Admin Notifications (internal admin alerts)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_notifications (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL,                    -- 'deposit_request' | 'withdraw_request' | 'support_ticket' | 'support_message' | 'kyc_submission' | 'trade' | 'loan_application'
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  category TEXT NOT NULL,                -- sidebar section: 'dashboard' | 'users' | 'wallets' | 'support' | 'trading_pairs'
  link TEXT,                             -- admin route to navigate to, e.g. '/admin/users'
  reference_id TEXT,                     -- ID of the related entity (deposit id, ticket id, etc.)
  user_id TEXT,                          -- user who triggered the action
  user_email TEXT,                       -- cached for display
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  read_by TEXT,                          -- admin who marked it read
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_unread ON admin_notifications(is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_category ON admin_notifications(category, is_read);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_type ON admin_notifications(type, created_at DESC);

COMMENT ON TABLE admin_notifications IS 'Internal notifications for admin users triggered by user actions (deposits, withdrawals, support tickets, etc.)';


-- ************************************************************
-- SECTION 2: NEWS/ANNOUNCEMENTS SYSTEM
-- ************************************************************

-- News/Announcements table for admin broadcasts
CREATE TABLE IF NOT EXISTS news (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'announcement', -- 'announcement', 'update', 'maintenance', 'feature'
  priority TEXT NOT NULL DEFAULT 'normal', -- 'low', 'normal', 'high', 'urgent'
  image_url TEXT,
  background_color TEXT DEFAULT '#111111', -- Dark theme background
  text_color TEXT DEFAULT '#ffffff', -- White text
  button_text TEXT DEFAULT 'Got it',
  button_color TEXT DEFAULT '#3b82f6', -- Blue button
  is_active BOOLEAN DEFAULT TRUE,
  show_popup BOOLEAN DEFAULT TRUE,
  popup_delay INTEGER DEFAULT 2000, -- Delay in ms before showing popup
  auto_close INTEGER DEFAULT 0, -- Auto close after seconds, 0 = manual close only
  target_users TEXT DEFAULT 'all', -- 'all', 'verified', 'unverified', 'traders', 'inactive'
  start_date TIMESTAMPTZ DEFAULT NOW(),
  end_date TIMESTAMPTZ, -- NULL = no end date
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User news tracking table (to track which users have seen which news)
CREATE TABLE IF NOT EXISTS user_news_seen (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  news_id INTEGER NOT NULL REFERENCES news(id) ON DELETE CASCADE,
  seen_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, news_id)
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_news_active ON news(is_active, show_popup);
CREATE INDEX IF NOT EXISTS idx_news_dates ON news(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_user_news_seen ON user_news_seen(user_id, news_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_news_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS update_news_updated_at_trigger ON news;

-- Trigger to auto-update updated_at
CREATE TRIGGER update_news_updated_at_trigger
  BEFORE UPDATE ON news
  FOR EACH ROW
  EXECUTE FUNCTION update_news_updated_at();


-- ************************************************************
-- SECTION 3: NOTIFICATION SYSTEM
-- ************************************************************

-- ----------------------------------------------------------
-- 3.1 Notification Templates
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS notification_templates (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  deeplink_url TEXT,
  channel TEXT NOT NULL DEFAULT 'push',
  variant_a_title TEXT,
  variant_a_body TEXT,
  variant_b_title TEXT,
  variant_b_body TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------
-- 3.2 Notification Campaigns
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS notification_campaigns (
  id SERIAL PRIMARY KEY,
  template_id INTEGER REFERENCES notification_templates(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  deeplink_url TEXT,
  channels TEXT[] NOT NULL DEFAULT ARRAY['push'],
  segment_role TEXT,
  segment_is_verified BOOLEAN,
  segment_is_active BOOLEAN,
  segment_min_credit_score NUMERIC,
  segment_email_search TEXT,
  scheduled_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft',
  variant TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------
-- 3.3 Notification Logs
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS notification_logs (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER REFERENCES notification_campaigns(id),
  user_id UUID,
  channel TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------
-- 3.4 Push Subscriptions (Web Push) - Multi-device support
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  endpoint TEXT NOT NULL,
  keys JSONB NOT NULL,
  platform TEXT DEFAULT 'unknown',
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint ON push_subscriptions(endpoint);

-- ----------------------------------------------------------
-- 3.5 Broadcast Notifications (Streamlined System)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS broadcast_notifications (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  target_role TEXT,                   -- 'all', 'user', 'admin', etc.
  total_users INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  sent_by UUID,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_broadcast_notifications_status ON broadcast_notifications(status);
CREATE INDEX IF NOT EXISTS idx_broadcast_notifications_sent_at ON broadcast_notifications(sent_at);
CREATE INDEX IF NOT EXISTS idx_broadcast_notifications_target_role ON broadcast_notifications(target_role);

-- ----------------------------------------------------------
-- 3.6 Broadcast Delivery Logs
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS broadcast_delivery_logs (
  id SERIAL PRIMARY KEY,
  broadcast_id INTEGER REFERENCES broadcast_notifications(id) ON DELETE CASCADE,
  user_id UUID,
  status TEXT NOT NULL,
  error TEXT,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_broadcast_delivery_logs_broadcast_id ON broadcast_delivery_logs(broadcast_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_delivery_logs_user_id ON broadcast_delivery_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_delivery_logs_status ON broadcast_delivery_logs(status);


-- ************************************************************
-- SECTION 4: ROW LEVEL SECURITY (RLS) POLICIES
-- ************************************************************
-- Pattern: Users access own data, admins access everything.
-- The server uses supabaseAdmin (service role key) which
-- bypasses RLS, so these mainly protect the anon/user client.
-- ************************************************************

-- Helper function: check if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id::uuid = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ----------------------------------------------------------
-- 4.1 Users
-- ----------------------------------------------------------
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_policy" ON users;
DROP POLICY IF EXISTS "users_insert_policy" ON users;
DROP POLICY IF EXISTS "users_update_policy" ON users;
DROP POLICY IF EXISTS "users_delete_policy" ON users;

CREATE POLICY "users_select_policy" ON users FOR SELECT USING (
  auth.uid() = id::uuid
  OR public.is_admin()
);
CREATE POLICY "users_insert_policy" ON users FOR INSERT WITH CHECK (
  auth.uid() = id::uuid
  OR public.is_admin()
);
CREATE POLICY "users_update_policy" ON users FOR UPDATE USING (
  auth.uid() = id::uuid
  OR public.is_admin()
);
CREATE POLICY "users_delete_policy" ON users FOR DELETE USING (
  public.is_admin()
);

-- ----------------------------------------------------------
-- 4.2 User Passwords
-- ----------------------------------------------------------
ALTER TABLE user_passwords ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_passwords_select_policy" ON user_passwords;
DROP POLICY IF EXISTS "user_passwords_insert_policy" ON user_passwords;
DROP POLICY IF EXISTS "user_passwords_update_policy" ON user_passwords;
DROP POLICY IF EXISTS "user_passwords_delete_policy" ON user_passwords;

CREATE POLICY "user_passwords_select_policy" ON user_passwords FOR SELECT USING (
  auth.uid() = user_id::uuid
  OR public.is_admin()
);
CREATE POLICY "user_passwords_insert_policy" ON user_passwords FOR INSERT WITH CHECK (
  auth.uid() = user_id::uuid
  OR public.is_admin()
);
CREATE POLICY "user_passwords_update_policy" ON user_passwords FOR UPDATE USING (
  auth.uid() = user_id::uuid
  OR public.is_admin()
);
CREATE POLICY "user_passwords_delete_policy" ON user_passwords FOR DELETE USING (
  public.is_admin()
);

-- ----------------------------------------------------------
-- 4.3 Portfolios
-- ----------------------------------------------------------
ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "portfolios_select_policy" ON portfolios;
DROP POLICY IF EXISTS "portfolios_insert_policy" ON portfolios;
DROP POLICY IF EXISTS "portfolios_update_policy" ON portfolios;
DROP POLICY IF EXISTS "portfolios_delete_policy" ON portfolios;

CREATE POLICY "portfolios_select_policy" ON portfolios FOR SELECT USING (
  auth.uid() = user_id::uuid
  OR public.is_admin()
);
CREATE POLICY "portfolios_insert_policy" ON portfolios FOR INSERT WITH CHECK (
  auth.uid() = user_id::uuid
  OR public.is_admin()
);
CREATE POLICY "portfolios_update_policy" ON portfolios FOR UPDATE USING (
  auth.uid() = user_id::uuid
  OR public.is_admin()
);
CREATE POLICY "portfolios_delete_policy" ON portfolios FOR DELETE USING (
  auth.uid() = user_id::uuid
  OR public.is_admin()
);

-- ----------------------------------------------------------
-- 4.4 Transactions
-- ----------------------------------------------------------
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "transactions_select_policy" ON transactions;
DROP POLICY IF EXISTS "transactions_insert_policy" ON transactions;
DROP POLICY IF EXISTS "transactions_update_policy" ON transactions;
DROP POLICY IF EXISTS "transactions_delete_policy" ON transactions;

CREATE POLICY "transactions_select_policy" ON transactions FOR SELECT USING (
  auth.uid() = user_id::uuid
  OR public.is_admin()
);
CREATE POLICY "transactions_insert_policy" ON transactions FOR INSERT WITH CHECK (
  auth.uid() = user_id::uuid
  OR public.is_admin()
);
CREATE POLICY "transactions_update_policy" ON transactions FOR UPDATE USING (
  auth.uid() = user_id::uuid
  OR public.is_admin()
);
CREATE POLICY "transactions_delete_policy" ON transactions FOR DELETE USING (
  auth.uid() = user_id::uuid
  OR public.is_admin()
);

-- ----------------------------------------------------------
-- 4.5 Trades
-- ----------------------------------------------------------
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trades_select_policy" ON trades;
DROP POLICY IF EXISTS "trades_insert_policy" ON trades;
DROP POLICY IF EXISTS "trades_update_policy" ON trades;
DROP POLICY IF EXISTS "trades_delete_policy" ON trades;

CREATE POLICY "trades_select_policy" ON trades FOR SELECT USING (
  auth.uid() = user_id::uuid
  OR public.is_admin()
);
CREATE POLICY "trades_insert_policy" ON trades FOR INSERT WITH CHECK (
  auth.uid() = user_id::uuid
  OR public.is_admin()
);
CREATE POLICY "trades_update_policy" ON trades FOR UPDATE USING (
  auth.uid() = user_id::uuid
  OR public.is_admin()
);
CREATE POLICY "trades_delete_policy" ON trades FOR DELETE USING (
  auth.uid() = user_id::uuid
  OR public.is_admin()
);

-- ----------------------------------------------------------
-- 4.6 Futures Trades
-- ----------------------------------------------------------
ALTER TABLE futures_trades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "future_trades_select_policy" ON futures_trades;
DROP POLICY IF EXISTS "future_trades_insert_policy" ON futures_trades;
DROP POLICY IF EXISTS "future_trades_update_policy" ON futures_trades;
DROP POLICY IF EXISTS "future_trades_delete_policy" ON futures_trades;

CREATE POLICY "future_trades_select_policy" ON futures_trades FOR SELECT USING (
  auth.uid() = user_id::uuid
  OR public.is_admin()
);
CREATE POLICY "future_trades_insert_policy" ON futures_trades FOR INSERT WITH CHECK (
  auth.uid() = user_id::uuid
  OR public.is_admin()
);
CREATE POLICY "future_trades_update_policy" ON futures_trades FOR UPDATE USING (
  auth.uid() = user_id::uuid
  OR public.is_admin()
);
CREATE POLICY "future_trades_delete_policy" ON futures_trades FOR DELETE USING (
  auth.uid() = user_id::uuid
  OR public.is_admin()
);

-- ----------------------------------------------------------
-- 4.7 Staking Positions
-- ----------------------------------------------------------
ALTER TABLE staking_positions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staking_positions_select_policy" ON staking_positions;
DROP POLICY IF EXISTS "staking_positions_insert_policy" ON staking_positions;
DROP POLICY IF EXISTS "staking_positions_update_policy" ON staking_positions;
DROP POLICY IF EXISTS "staking_positions_delete_policy" ON staking_positions;

CREATE POLICY "staking_positions_select_policy" ON staking_positions FOR SELECT USING (
  auth.uid() = user_id::uuid
  OR public.is_admin()
);
CREATE POLICY "staking_positions_insert_policy" ON staking_positions FOR INSERT WITH CHECK (
  auth.uid() = user_id::uuid
  OR public.is_admin()
);
CREATE POLICY "staking_positions_update_policy" ON staking_positions FOR UPDATE USING (
  auth.uid() = user_id::uuid
  OR public.is_admin()
);
CREATE POLICY "staking_positions_delete_policy" ON staking_positions FOR DELETE USING (
  auth.uid() = user_id::uuid
  OR public.is_admin()
);

-- ----------------------------------------------------------
-- 4.7a User Staking Limits
-- ----------------------------------------------------------
ALTER TABLE user_staking_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_staking_limits_select_policy" ON user_staking_limits;
DROP POLICY IF EXISTS "user_staking_limits_insert_policy" ON user_staking_limits;
DROP POLICY IF EXISTS "user_staking_limits_update_policy" ON user_staking_limits;
DROP POLICY IF EXISTS "user_staking_limits_delete_policy" ON user_staking_limits;

CREATE POLICY "user_staking_limits_select_policy" ON user_staking_limits FOR SELECT USING (
  auth.uid() = user_id::uuid
  OR public.is_admin()
);
CREATE POLICY "user_staking_limits_insert_policy" ON user_staking_limits FOR INSERT WITH CHECK (
  public.is_admin()
);
CREATE POLICY "user_staking_limits_update_policy" ON user_staking_limits FOR UPDATE USING (
  public.is_admin()
);
CREATE POLICY "user_staking_limits_delete_policy" ON user_staking_limits FOR DELETE USING (
  public.is_admin()
);

-- ----------------------------------------------------------
-- 4.8 Loan Applications
-- ----------------------------------------------------------
ALTER TABLE loan_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "loan_applications_select_policy" ON loan_applications;
DROP POLICY IF EXISTS "loan_applications_insert_policy" ON loan_applications;
DROP POLICY IF EXISTS "loan_applications_update_policy" ON loan_applications;
DROP POLICY IF EXISTS "loan_applications_delete_policy" ON loan_applications;

CREATE POLICY "loan_applications_select_policy" ON loan_applications FOR SELECT USING (
  auth.uid() = user_id::uuid
  OR public.is_admin()
);
CREATE POLICY "loan_applications_insert_policy" ON loan_applications FOR INSERT WITH CHECK (
  auth.uid() = user_id::uuid
  OR public.is_admin()
);
CREATE POLICY "loan_applications_update_policy" ON loan_applications FOR UPDATE USING (
  auth.uid() = user_id::uuid
  OR public.is_admin()
);
CREATE POLICY "loan_applications_delete_policy" ON loan_applications FOR DELETE USING (
  auth.uid() = user_id::uuid
  OR public.is_admin()
);

-- ----------------------------------------------------------
-- 4.9 KYC Verifications
-- ----------------------------------------------------------
ALTER TABLE kyc_verifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kyc_verifications_select_policy" ON kyc_verifications;
DROP POLICY IF EXISTS "kyc_verifications_insert_policy" ON kyc_verifications;
DROP POLICY IF EXISTS "kyc_verifications_update_policy" ON kyc_verifications;
DROP POLICY IF EXISTS "kyc_verifications_delete_policy" ON kyc_verifications;

CREATE POLICY "kyc_verifications_select_policy" ON kyc_verifications FOR SELECT USING (
  auth.uid() = user_id::uuid
  OR public.is_admin()
);
CREATE POLICY "kyc_verifications_insert_policy" ON kyc_verifications FOR INSERT WITH CHECK (
  auth.uid() = user_id::uuid
  OR public.is_admin()
);
CREATE POLICY "kyc_verifications_update_policy" ON kyc_verifications FOR UPDATE USING (
  auth.uid() = user_id::uuid
  OR public.is_admin()
);
CREATE POLICY "kyc_verifications_delete_policy" ON kyc_verifications FOR DELETE USING (
  auth.uid() = user_id::uuid
  OR public.is_admin()
);

-- ----------------------------------------------------------
-- 4.10 Deposit Requests
-- ----------------------------------------------------------
ALTER TABLE deposit_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deposit_requests_select_policy" ON deposit_requests;
DROP POLICY IF EXISTS "deposit_requests_insert_policy" ON deposit_requests;
DROP POLICY IF EXISTS "deposit_requests_update_policy" ON deposit_requests;
DROP POLICY IF EXISTS "deposit_requests_delete_policy" ON deposit_requests;

CREATE POLICY "deposit_requests_select_policy" ON deposit_requests FOR SELECT USING (
  auth.uid() = user_id::uuid
  OR public.is_admin()
);
CREATE POLICY "deposit_requests_insert_policy" ON deposit_requests FOR INSERT WITH CHECK (
  auth.uid() = user_id::uuid
  OR public.is_admin()
);
CREATE POLICY "deposit_requests_update_policy" ON deposit_requests FOR UPDATE USING (
  auth.uid() = user_id::uuid
  OR public.is_admin()
);
CREATE POLICY "deposit_requests_delete_policy" ON deposit_requests FOR DELETE USING (
  auth.uid() = user_id::uuid
  OR public.is_admin()
);

-- ----------------------------------------------------------
-- 4.11 Withdraw Requests
-- ----------------------------------------------------------
ALTER TABLE withdraw_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "withdraw_requests_select_policy" ON withdraw_requests;
DROP POLICY IF EXISTS "withdraw_requests_insert_policy" ON withdraw_requests;
DROP POLICY IF EXISTS "withdraw_requests_update_policy" ON withdraw_requests;
DROP POLICY IF EXISTS "withdraw_requests_delete_policy" ON withdraw_requests;

CREATE POLICY "withdraw_requests_select_policy" ON withdraw_requests FOR SELECT USING (
  auth.uid() = user_id::uuid
  OR public.is_admin()
);
CREATE POLICY "withdraw_requests_insert_policy" ON withdraw_requests FOR INSERT WITH CHECK (
  auth.uid() = user_id::uuid
  OR public.is_admin()
);
CREATE POLICY "withdraw_requests_update_policy" ON withdraw_requests FOR UPDATE USING (
  auth.uid() = user_id::uuid
  OR public.is_admin()
);
CREATE POLICY "withdraw_requests_delete_policy" ON withdraw_requests FOR DELETE USING (
  auth.uid() = user_id::uuid
  OR public.is_admin()
);

-- ----------------------------------------------------------
-- 4.12 Support Conversations
-- ----------------------------------------------------------
ALTER TABLE support_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "support_conversations_select_policy" ON support_conversations;
DROP POLICY IF EXISTS "support_conversations_insert_policy" ON support_conversations;
DROP POLICY IF EXISTS "support_conversations_update_policy" ON support_conversations;
DROP POLICY IF EXISTS "support_conversations_delete_policy" ON support_conversations;

CREATE POLICY "support_conversations_select_policy" ON support_conversations FOR SELECT USING (
  auth.uid() = user_id
  OR public.is_admin()
);
CREATE POLICY "support_conversations_insert_policy" ON support_conversations FOR INSERT WITH CHECK (
  auth.uid() = user_id
  OR public.is_admin()
);
CREATE POLICY "support_conversations_update_policy" ON support_conversations FOR UPDATE USING (
  auth.uid() = user_id
  OR public.is_admin()
);
CREATE POLICY "support_conversations_delete_policy" ON support_conversations FOR DELETE USING (
  public.is_admin()
);

-- ----------------------------------------------------------
-- 4.13 Support Messages
-- ----------------------------------------------------------
ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "support_messages_select_policy" ON support_messages;
DROP POLICY IF EXISTS "support_messages_insert_policy" ON support_messages;
DROP POLICY IF EXISTS "support_messages_update_policy" ON support_messages;
DROP POLICY IF EXISTS "support_messages_delete_policy" ON support_messages;

CREATE POLICY "support_messages_select_policy" ON support_messages FOR SELECT USING (
  auth.uid() = sender_id
  OR public.is_admin()
);
CREATE POLICY "support_messages_insert_policy" ON support_messages FOR INSERT WITH CHECK (
  auth.uid() = sender_id
  OR public.is_admin()
);
CREATE POLICY "support_messages_update_policy" ON support_messages FOR UPDATE USING (
  auth.uid() = sender_id
  OR public.is_admin()
);
CREATE POLICY "support_messages_delete_policy" ON support_messages FOR DELETE USING (
  public.is_admin()
);

-- ----------------------------------------------------------
-- 4.14 Deposit Addresses
-- ----------------------------------------------------------
ALTER TABLE deposit_addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deposit_addresses_select_policy" ON deposit_addresses;
DROP POLICY IF EXISTS "deposit_addresses_insert_policy" ON deposit_addresses;
DROP POLICY IF EXISTS "deposit_addresses_update_policy" ON deposit_addresses;
DROP POLICY IF EXISTS "deposit_addresses_delete_policy" ON deposit_addresses;

CREATE POLICY "deposit_addresses_select_policy" ON deposit_addresses FOR SELECT USING (
  auth.uid() IS NOT NULL
);
CREATE POLICY "deposit_addresses_insert_policy" ON deposit_addresses FOR INSERT WITH CHECK (
  public.is_admin()
);
CREATE POLICY "deposit_addresses_update_policy" ON deposit_addresses FOR UPDATE USING (
  public.is_admin()
);
CREATE POLICY "deposit_addresses_delete_policy" ON deposit_addresses FOR DELETE USING (
  public.is_admin()
);

-- ----------------------------------------------------------
-- 4.15 News
-- ----------------------------------------------------------
ALTER TABLE news ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage news" ON news;
DROP POLICY IF EXISTS "Everyone can view active news" ON news;

CREATE POLICY "Admins can manage news" ON news
  FOR ALL USING (
    auth.role() = 'authenticated' AND 
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id::text = auth.uid()::text AND users.role = 'admin'
    )
  );

CREATE POLICY "Everyone can view active news" ON news
  FOR SELECT USING (
    is_active = TRUE AND 
    (end_date IS NULL OR end_date > NOW())
  );

-- ----------------------------------------------------------
-- 4.16 User News Seen
-- ----------------------------------------------------------
ALTER TABLE user_news_seen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their news seen" ON user_news_seen;
DROP POLICY IF EXISTS "Admins can manage all news seen" ON user_news_seen;

CREATE POLICY "Users can manage their news seen" ON user_news_seen
  FOR ALL USING (auth.uid()::text = user_id);

CREATE POLICY "Admins can manage all news seen" ON user_news_seen
  FOR ALL USING (
    auth.role() = 'authenticated' AND 
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id::text = auth.uid()::text AND users.role = 'admin'
    )
  );

-- ----------------------------------------------------------
-- 4.17 Audit Logs
-- ----------------------------------------------------------
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view all audit logs" ON audit_logs;
DROP POLICY IF EXISTS "Service can insert audit logs" ON audit_logs;

CREATE POLICY "Admins can view all audit logs" ON audit_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id::uuid = auth.uid() 
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Service can insert audit logs" ON audit_logs
  FOR INSERT WITH CHECK (true);

-- ----------------------------------------------------------
-- 4.18 Broadcast Notifications
-- ----------------------------------------------------------
ALTER TABLE broadcast_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read all broadcasts" ON broadcast_notifications;
DROP POLICY IF EXISTS "Admins can create broadcasts" ON broadcast_notifications;
DROP POLICY IF EXISTS "Admins can update broadcasts" ON broadcast_notifications;

CREATE POLICY "Admins can read all broadcasts" ON broadcast_notifications
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users WHERE id::text = auth.uid()::text AND role = 'admin'
    )
  );

CREATE POLICY "Admins can create broadcasts" ON broadcast_notifications
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM users WHERE id::text = auth.uid()::text AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update broadcasts" ON broadcast_notifications
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM users WHERE id::text = auth.uid()::text AND role = 'admin'
    )
  );

-- ----------------------------------------------------------
-- 4.19 Broadcast Delivery Logs
-- ----------------------------------------------------------
ALTER TABLE broadcast_delivery_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read all delivery logs" ON broadcast_delivery_logs;
DROP POLICY IF EXISTS "System can create delivery logs" ON broadcast_delivery_logs;

CREATE POLICY "Admins can read all delivery logs" ON broadcast_delivery_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users WHERE id::text = auth.uid()::text AND role = 'admin'
    )
  );

CREATE POLICY "System can create delivery logs" ON broadcast_delivery_logs
  FOR INSERT WITH CHECK (true);

-- ----------------------------------------------------------
-- 4.20 Admin Notifications
-- ----------------------------------------------------------
ALTER TABLE admin_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_notifications_select_policy" ON admin_notifications;
DROP POLICY IF EXISTS "admin_notifications_insert_policy" ON admin_notifications;
DROP POLICY IF EXISTS "admin_notifications_update_policy" ON admin_notifications;
DROP POLICY IF EXISTS "admin_notifications_delete_policy" ON admin_notifications;

CREATE POLICY "admin_notifications_select_policy" ON admin_notifications
  FOR SELECT USING (public.is_admin());

CREATE POLICY "admin_notifications_insert_policy" ON admin_notifications
  FOR INSERT WITH CHECK (true);   -- Service role inserts via server

CREATE POLICY "admin_notifications_update_policy" ON admin_notifications
  FOR UPDATE USING (public.is_admin());

CREATE POLICY "admin_notifications_delete_policy" ON admin_notifications
  FOR DELETE USING (public.is_admin());

-- ----------------------------------------------------------
-- 4.21 Platform Fees
-- ----------------------------------------------------------
ALTER TABLE platform_fees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_fees_select_policy" ON platform_fees;
DROP POLICY IF EXISTS "platform_fees_insert_policy" ON platform_fees;

CREATE POLICY "platform_fees_select_policy" ON platform_fees
  FOR SELECT USING (public.is_admin());

CREATE POLICY "platform_fees_insert_policy" ON platform_fees
  FOR INSERT WITH CHECK (true);   -- Service role inserts via server


-- ************************************************************
-- SECTION 5: STORAGE BUCKETS & POLICIES
-- ************************************************************

-- 5.0 Create storage buckets (safe to re-run)
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('avatars', 'avatars', true),
  ('kyc-documents', 'kyc-documents', false),
  ('loan-documents', 'loan-documents', false),
  ('deposit-screenshots', 'deposit-screenshots', false),
  ('withdraw-screenshots', 'withdraw-screenshots', false),
  ('news-images', 'news-images', true)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------
-- 5.1 Avatars bucket (profile pictures)
-- ----------------------------------------------------------
DROP POLICY IF EXISTS "Public access to avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload profile pictures" ON storage.objects;
DROP POLICY IF EXISTS "Public read access to profile pictures" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their profile pictures" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their profile pictures" ON storage.objects;

CREATE POLICY "Public read access to profile pictures" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload profile pictures" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can update their profile pictures" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete their profile pictures" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ----------------------------------------------------------
-- 5.2 KYC Documents bucket
-- ----------------------------------------------------------
DROP POLICY IF EXISTS "Users can upload their own KYC documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own KYC documents" ON storage.objects;
DROP POLICY IF EXISTS "Admins can view all KYC documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own KYC documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own KYC documents" ON storage.objects;

CREATE POLICY "Users can upload their own KYC documents" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'kyc-documents'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can view their own KYC documents" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'kyc-documents'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Admins can view all KYC documents" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'kyc-documents'
    AND public.is_admin()
  );

CREATE POLICY "Users can update their own KYC documents" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'kyc-documents'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete their own KYC documents" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'kyc-documents'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ----------------------------------------------------------
-- 5.3 Loan Documents bucket
-- ----------------------------------------------------------
DROP POLICY IF EXISTS "Users can upload loan documents to their own folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own loan documents" ON storage.objects;
DROP POLICY IF EXISTS "Admins can view all loan documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own loan documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own loan documents" ON storage.objects;

CREATE POLICY "Users can upload loan documents to their own folder" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'loan-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view their own loan documents" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'loan-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Admins can view all loan documents" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'loan-documents'
    AND public.is_admin()
  );

CREATE POLICY "Users can update their own loan documents" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'loan-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete their own loan documents" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'loan-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ----------------------------------------------------------
-- 5.4 Deposit Screenshots bucket
-- ----------------------------------------------------------
DROP POLICY IF EXISTS "Users can upload deposit screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own deposit screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Admins can view all deposit screenshots" ON storage.objects;

CREATE POLICY "Users can upload deposit screenshots" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'deposit-screenshots'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can view their own deposit screenshots" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'deposit-screenshots'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Admins can view all deposit screenshots" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'deposit-screenshots'
    AND public.is_admin()
  );

-- ----------------------------------------------------------
-- 5.5 Withdraw Screenshots bucket
-- ----------------------------------------------------------
DROP POLICY IF EXISTS "Admins can upload withdraw screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Public read access to withdraw screenshots" ON storage.objects;

CREATE POLICY "Admins can upload withdraw screenshots" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'withdraw-screenshots'
    AND public.is_admin()
  );

CREATE POLICY "Public read access to withdraw screenshots" ON storage.objects
  FOR SELECT USING (bucket_id = 'withdraw-screenshots');

-- ----------------------------------------------------------
-- 5.6 News Images bucket
-- ----------------------------------------------------------
DROP POLICY IF EXISTS "Public read access to news-images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload to news-images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update news-images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete news-images" ON storage.objects;

CREATE POLICY "Public read access to news-images" ON storage.objects
  FOR SELECT USING (bucket_id = 'news-images');

CREATE POLICY "Authenticated upload to news-images" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'news-images' AND auth.role() = 'authenticated'
  );

CREATE POLICY "Authenticated update news-images" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'news-images' AND auth.role() = 'authenticated'
  );

CREATE POLICY "Authenticated delete news-images" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'news-images' AND auth.role() = 'authenticated'
  );


-- ************************************************************
-- SECTION 6: DEFAULT DATA
-- ************************************************************

-- Default deposit addresses (update with real addresses)
INSERT INTO deposit_addresses (asset_symbol, address, network, is_active)
VALUES
  ('BTC', '0x000000000', 'Bitcoin', true),
  ('USDT', '0x000000000', 'TRC-20', true),
  ('ETH', '0x000000000', 'ERC-20', true)
ON CONFLICT (asset_symbol) DO NOTHING;

-- Sample welcome news (only insert if no news exists yet)
INSERT INTO news (title, content, type, priority, created_by)
SELECT
  'Welcome to Becxus Exchange!',
  'We are excited to have you join our platform. Explore our trading features and start your crypto journey today!',
  'announcement',
  'normal',
  (SELECT id FROM users WHERE role = 'admin' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM news WHERE title = 'Welcome to Becxus Exchange!');

-- Sample broadcast notifications
INSERT INTO broadcast_notifications (title, body, target_role, total_users, sent_count, failed_count, status, sent_at) VALUES
('Welcome to Becxus Exchange!', 'Thank you for joining our platform. Start trading today!', 'all', 0, 0, 0, 'completed', NOW() - INTERVAL '7 days'),
('New Features Available', 'Check out our latest trading tools and features!', 'user', 0, 0, 0, 'completed', NOW() - INTERVAL '3 days')
ON CONFLICT DO NOTHING;

-- Default trading pairs (spot + futures)
INSERT INTO trading_pairs (symbol, base_asset, quote_asset, is_enabled, min_trade_amount, max_trade_amount, trading_fee, sort_order, pair_type)
VALUES
  ('BTC/USDT',   'BTC',   'USDT', TRUE, 0.0001,   100,    0.001, 1,  'both'),
  ('ETH/USDT',   'ETH',   'USDT', TRUE, 0.001,    500,    0.001, 2,  'both'),
  ('BNB/USDT',   'BNB',   'USDT', TRUE, 0.01,     1000,   0.001, 3,  'both'),
  ('SOL/USDT',   'SOL',   'USDT', TRUE, 0.1,      5000,   0.001, 4,  'both'),
  ('XRP/USDT',   'XRP',   'USDT', TRUE, 1,        50000,  0.001, 5,  'both'),
  ('ADA/USDT',   'ADA',   'USDT', TRUE, 1,        100000, 0.001, 6,  'both'),
  ('DOT/USDT',   'DOT',   'USDT', TRUE, 0.1,      10000,  0.001, 7,  'both'),
  ('DOGE/USDT',  'DOGE',  'USDT', TRUE, 10,       500000, 0.001, 8,  'both'),
  ('AVAX/USDT',  'AVAX',  'USDT', TRUE, 0.1,      5000,   0.001, 9,  'both'),
  ('LINK/USDT',  'LINK',  'USDT', TRUE, 0.1,      10000,  0.001, 10, 'both'),
  ('LTC/USDT',   'LTC',   'USDT', TRUE, 0.01,     1000,   0.001, 11, 'spot'),
  ('MATIC/USDT', 'MATIC', 'USDT', TRUE, 1,        100000, 0.001, 12, 'spot'),
  ('ATOM/USDT',  'ATOM',  'USDT', TRUE, 0.1,      10000,  0.001, 13, 'spot'),
  ('TRX/USDT',   'TRX',   'USDT', TRUE, 10,       500000, 0.001, 14, 'spot'),
  ('SHIB/USDT',  'SHIB',  'USDT', TRUE, 100000,   99999999, 0.001, 15, 'spot')
ON CONFLICT (symbol) DO NOTHING;

-- Default global trading limits (wildcard user + wildcard pair)
INSERT INTO user_trading_limits (user_id, symbol, trade_type, min_amount, max_amount, is_enabled)
VALUES
  ('*', '*', 'spot',    0.0001,  1000000, TRUE),
  ('*', '*', 'futures', 50,      1000000, TRUE)
ON CONFLICT (user_id, symbol, trade_type) DO NOTHING;


-- ************************************************************
-- END OF COMPLETE SCHEMA
-- ************************************************************
-- 
-- This completes the Becxus Exchange database schema.
-- All tables, indexes, RLS policies, and sample data are now in place.
-- 
-- Summary:
-- ========
-- Tables: 31
--   - users, user_passwords
--   - portfolios, transactions, trades, futures_trades
--   - staking_positions, loan_applications
--   - crypto_prices, crypto_logos
--   - kyc_verifications, kyc_documents
--   - deposit_requests, withdraw_requests
--   - deposit_addresses, deposit_address_audit_logs
--   - support_conversations, support_messages
--   - audit_logs, platform_fees, admin_notifications
--   - trading_pairs, user_trading_limits
--   - news, user_news_seen
--   - notification_templates, notification_campaigns, notification_logs
--   - push_subscriptions
--   - broadcast_notifications, broadcast_delivery_logs
--
-- Indexes: 30+
-- RLS Policies: 60+
-- Storage Buckets: 6
--   - avatars (public)
--   - kyc-documents (private)
--   - loan-documents (private)
--   - deposit-screenshots (private)
--   - withdraw-screenshots (private)
--   - news-images (public)
--
-- Version: 2.3.0
-- Last Updated: 2025-06-14
-- Compatible with: Supabase PostgreSQL 15+
-- 
-- ************************************************************
