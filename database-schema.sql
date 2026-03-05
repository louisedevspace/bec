-- ============================================================
-- Becxus Exchange — Complete Database Schema
-- ============================================================
-- This is the single source of truth for all Supabase tables,
-- indexes, RLS policies, and storage bucket policies.
--
-- Run sections in order in the Supabase SQL Editor to set up
-- a fresh database. All statements use IF NOT EXISTS / IF EXISTS
-- so they are safe to re-run.
-- ============================================================


-- ************************************************************
-- SECTION 1: TABLE DEFINITIONS
-- ************************************************************

-- 1.1 Users
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,                -- Supabase Auth UUID stored as text
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL DEFAULT '--supabase-auth--',
  full_name TEXT,
  credit_score DECIMAL(5,2) DEFAULT 0.60,
  is_verified BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  role TEXT NOT NULL DEFAULT 'user',
  display_id TEXT,
  profile_picture TEXT,
  phone TEXT,
  futures_min_amount DECIMAL(20,8) DEFAULT 50,
  futures_trade_result TEXT DEFAULT NULL,   -- NULL = use is_active logic, 'win', 'loss'
  wallet_locked BOOLEAN DEFAULT FALSE,     -- Admin can lock user wallet
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick lookup of locked wallets
CREATE INDEX IF NOT EXISTS idx_users_wallet_locked ON users(wallet_locked) WHERE wallet_locked = TRUE;

-- 1.2 User Passwords (separate secure storage)
CREATE TABLE IF NOT EXISTS user_passwords (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  password TEXT NOT NULL,
  encrypted_at TIMESTAMPTZ DEFAULT NOW(),
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- 1.3 Deposit Addresses (admin-managed crypto addresses)
CREATE TABLE IF NOT EXISTS deposit_addresses (
  id SERIAL PRIMARY KEY,
  asset_symbol TEXT NOT NULL UNIQUE,
  address TEXT NOT NULL,
  network TEXT NOT NULL DEFAULT 'mainnet',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT
);

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

-- 1.4 Portfolios
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

-- 1.5 Transactions
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

-- 1.6 Trades (spot)
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
CREATE INDEX IF NOT EXISTS idx_trades_deleted_for_user ON trades(deleted_for_user);
CREATE INDEX IF NOT EXISTS idx_trades_user_deleted ON trades(user_id, deleted_for_user);

-- 1.7 Futures Trades
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

-- 1.8 Staking Positions
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

-- 1.9 Loan Applications
CREATE TABLE IF NOT EXISTS loan_applications (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  amount DECIMAL(20,2) NOT NULL,
  purpose TEXT NOT NULL,
  duration INTEGER NOT NULL,          -- days
  monthly_income DECIMAL(20,2),
  status TEXT NOT NULL,               -- pending, approved, rejected
  documents JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  rejection_reason TEXT,
  loan_pay_date TIMESTAMPTZ
);

-- 1.10 Crypto Prices (public market data)
CREATE TABLE IF NOT EXISTS crypto_prices (
  id SERIAL PRIMARY KEY,
  symbol TEXT NOT NULL UNIQUE,
  price DECIMAL(20,8) NOT NULL,
  change24h DECIMAL(10,4),
  volume24h DECIMAL(20,2),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1.11 Crypto Logos (cached logo URLs)
CREATE TABLE IF NOT EXISTS crypto_logos (
  id SERIAL PRIMARY KEY,
  symbol TEXT NOT NULL UNIQUE,
  logo_url TEXT NOT NULL,
  homepage_url TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1.12 KYC Verifications
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

-- 1.12a KYC Documents (legacy/cleanup support)
-- This table is used only for account deletion cleanup in auth.routes.ts.
-- It is safe to keep minimal and independent from current KYC implementation.
CREATE TABLE IF NOT EXISTS kyc_documents (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  doc_type TEXT NOT NULL,             -- e.g. 'front_id', 'back_id', 'selfie', 'other'
  file_url TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);


-- 1.13 Deposit Requests
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
CREATE INDEX IF NOT EXISTS idx_deposit_requests_user ON deposit_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_deposit_requests_status ON deposit_requests(status);
CREATE INDEX IF NOT EXISTS idx_deposit_requests_is_new ON deposit_requests(is_new);

-- 1.14 Withdraw Requests
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
CREATE INDEX IF NOT EXISTS idx_withdraw_requests_user ON withdraw_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_withdraw_requests_status ON withdraw_requests(status);
CREATE INDEX IF NOT EXISTS idx_withdraw_requests_is_new ON withdraw_requests(is_new);

-- 1.15 Support Conversations
CREATE TABLE IF NOT EXISTS support_conversations (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'medium',
  is_active BOOLEAN DEFAULT TRUE,
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Drop unique constraint if it exists (for migration from old schema)
ALTER TABLE support_conversations DROP CONSTRAINT IF EXISTS support_conversations_user_id_key;

-- 1.16 Support Messages
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


-- ************************************************************
-- SECTION 2: ROW LEVEL SECURITY (RLS) POLICIES
-- ************************************************************
-- Pattern: Users access own data, admins access everything.
-- The server uses supabaseAdmin (service role key) which
-- bypasses RLS, so these mainly protect the anon/user client.
-- ************************************************************

-- Helper function: check if current user is admin
-- Uses SECURITY DEFINER to bypass RLS and avoid infinite recursion
-- when the users table policies reference the users table.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id::uuid = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ----------------------------------------------------------
-- 2.1 Users
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
-- 2.2 User Passwords
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
-- 2.3 Portfolios
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
-- 2.4 Transactions
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
-- 2.5 Trades
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
-- 2.6 Futures Trades
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
-- 2.7 Staking Positions
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
-- 2.8 Loan Applications
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
-- 2.9 KYC Verifications
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
-- 2.10 Deposit Requests
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
-- 2.11 Withdraw Requests
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
-- 2.12 Support Conversations
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
-- 2.13 Support Messages
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
-- 2.14 Deposit Addresses
-- ----------------------------------------------------------
ALTER TABLE deposit_addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deposit_addresses_select_policy" ON deposit_addresses;
DROP POLICY IF EXISTS "deposit_addresses_insert_policy" ON deposit_addresses;
DROP POLICY IF EXISTS "deposit_addresses_update_policy" ON deposit_addresses;
DROP POLICY IF EXISTS "deposit_addresses_delete_policy" ON deposit_addresses;

-- All authenticated users can read deposit addresses
CREATE POLICY "deposit_addresses_select_policy" ON deposit_addresses FOR SELECT USING (
  auth.uid() IS NOT NULL
);
-- Only admins can modify
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
-- 2.15 Public tables (no RLS needed)
-- ----------------------------------------------------------
-- crypto_prices  — public market data, updated by server
-- crypto_logos   — public logo cache


-- ************************************************************
-- SECTION 3: STORAGE BUCKETS & POLICIES
-- ************************************************************

-- 3.0 Create storage buckets (safe to re-run)
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('avatars', 'avatars', true),
  ('kyc-documents', 'kyc-documents', false),
  ('loan-documents', 'loan-documents', false),
  ('deposit-screenshots', 'deposit-screenshots', false),
  ('withdraw-screenshots', 'withdraw-screenshots', false)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------
-- 3.1 Avatars bucket (profile pictures)
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
-- 3.2 KYC Documents bucket
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
-- 3.3 Loan Documents bucket
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
-- 3.4 Deposit Screenshots bucket
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
-- 3.5 Withdraw Screenshots bucket
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


-- ************************************************************
-- SECTION 4: DEFAULT DATA
-- ************************************************************

-- Default deposit addresses (update with real addresses)
INSERT INTO deposit_addresses (asset_symbol, address, network, is_active)
VALUES
  ('BTC', '0x000000000', 'Bitcoin', true),
  ('USDT', '0x000000000', 'TRC-20', true),
  ('ETH', '0x000000000', 'ERC-20', true)
ON CONFLICT (asset_symbol) DO NOTHING;

-- ************************************************************
-- SECTION 5: NEWS/ANNOUNCEMENTS SYSTEM
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
  news_id INTEGER NOT NULL REFERENCES news(id),
  seen_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, news_id)
);

-- Ensure deletes cascade from news -> user_news_seen (idempotent)
-- Some earlier versions created a FK without cascade (e.g. "news_seen_news_id_fkey")
ALTER TABLE user_news_seen DROP CONSTRAINT IF EXISTS user_news_seen_news_id_fkey;
ALTER TABLE user_news_seen DROP CONSTRAINT IF EXISTS news_seen_news_id_fkey;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conname = 'user_news_seen_news_id_fkey'
  ) THEN
    ALTER TABLE user_news_seen
      ADD CONSTRAINT user_news_seen_news_id_fkey
      FOREIGN KEY (news_id) REFERENCES news(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_news_active ON news(is_active, show_popup);
CREATE INDEX IF NOT EXISTS idx_news_dates ON news(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_user_news_seen ON user_news_seen(user_id, news_id);

-- RLS Policies for news table
ALTER TABLE news ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist to avoid conflicts
DROP POLICY IF EXISTS "Admins can manage news" ON news;
DROP POLICY IF EXISTS "Everyone can view active news" ON news;

-- Admin can do everything with news
CREATE POLICY "Admins can manage news" ON news
  FOR ALL USING (
    auth.role() = 'authenticated' AND 
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id::text = auth.uid()::text AND users.role = 'admin'
    )
  );

-- Everyone can view active news
CREATE POLICY "Everyone can view active news" ON news
  FOR SELECT USING (
    is_active = TRUE AND 
    (end_date IS NULL OR end_date > NOW())
  );

-- RLS Policies for user_news_seen table
ALTER TABLE user_news_seen ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist to avoid conflicts
DROP POLICY IF EXISTS "Users can manage their news seen" ON user_news_seen;

-- Admins can manage all news seen records (needed for deleting news safely)
DROP POLICY IF EXISTS "Admins can manage all news seen" ON user_news_seen;

-- Users can manage their own news seen records
CREATE POLICY "Users can manage their news seen" ON user_news_seen
  FOR ALL USING (auth.uid()::text = user_id);

-- Admins can manage all news seen records
CREATE POLICY "Admins can manage all news seen" ON user_news_seen
  FOR ALL USING (
    auth.role() = 'authenticated' AND 
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id::text = auth.uid()::text AND users.role = 'admin'
    )
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_news_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists to avoid conflicts
DROP TRIGGER IF EXISTS update_news_updated_at_trigger ON news;

-- Trigger to auto-update updated_at
CREATE TRIGGER update_news_updated_at_trigger
  BEFORE UPDATE ON news
  FOR EACH ROW
  EXECUTE FUNCTION update_news_updated_at();

-- Insert sample news for testing with app theme
INSERT INTO news (title, content, type, priority, created_by) VALUES
(
  'Welcome to Becxus Exchange!',
  'We are excited to have you join our platform. Explore our trading features and start your crypto journey today!',
  'announcement',
  'normal',
  (SELECT id FROM users WHERE role = 'admin' LIMIT 1)
) ON CONFLICT DO NOTHING;

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

CREATE TABLE IF NOT EXISTS push_subscriptions (
  user_id UUID PRIMARY KEY,
  endpoint TEXT NOT NULL,
  keys JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ************************************************************
-- SECTION 6: STORAGE BUCKETS
-- ************************************************************

-- Create storage buckets for file uploads
-- Note: These need to be created manually in Supabase Dashboard or via the Storage API
-- Bucket: news-images (public) - for news announcement images
-- Bucket: profile-pictures (public) - for user profile pictures
-- Bucket: documents (private) - for KYC documents

-- Storage policies for news-images bucket (public access)
-- Note: bucket creation itself must be done in Supabase Dashboard (Storage) once.

-- Storage policies live on the Supabase-managed table storage.objects.
-- In some Supabase projects, running these statements may fail with:
--   ERROR: 42501: must be owner of table objects
-- To keep this schema file safe to run end-to-end, we attempt to apply the
-- policies but swallow insufficient privilege errors.
DO $$
BEGIN
  BEGIN
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

    -- Drop existing storage policies (safe to re-run)
    DROP POLICY IF EXISTS "Public read access to news-images" ON storage.objects;
    DROP POLICY IF EXISTS "Authenticated upload to news-images" ON storage.objects;
    DROP POLICY IF EXISTS "Authenticated update news-images" ON storage.objects;
    DROP POLICY IF EXISTS "Authenticated delete news-images" ON storage.objects;

    -- Allow public read access to news-images
    CREATE POLICY "Public read access to news-images" ON storage.objects
      FOR SELECT USING (bucket_id = 'news-images');

    -- Allow authenticated users to upload to news-images
    CREATE POLICY "Authenticated upload to news-images" ON storage.objects
      FOR INSERT WITH CHECK (
        bucket_id = 'news-images' AND auth.role() = 'authenticated'
      );

    -- Allow authenticated users to update news-images
    CREATE POLICY "Authenticated update news-images" ON storage.objects
      FOR UPDATE USING (
        bucket_id = 'news-images' AND auth.role() = 'authenticated'
      );

    -- Allow authenticated users to delete news-images
    CREATE POLICY "Authenticated delete news-images" ON storage.objects
      FOR DELETE USING (
        bucket_id = 'news-images' AND auth.role() = 'authenticated'
      );
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'Skipping storage.objects policy setup due to insufficient privileges. Configure Storage policies in Supabase Dashboard.';
    WHEN undefined_table THEN
      RAISE NOTICE 'Skipping storage.objects policy setup because storage.objects does not exist.';
  END;
END $$;

-- ************************************************************
-- SECTION 7: STREAMLINED NOTIFICATION SYSTEM
-- ************************************************************

-- Add broadcast notifications table for streamlined system
CREATE TABLE IF NOT EXISTS broadcast_notifications (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  target_role TEXT,
  total_users INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  sent_by UUID,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_broadcast_notifications_status ON broadcast_notifications(status);
CREATE INDEX IF NOT EXISTS idx_broadcast_notifications_sent_at ON broadcast_notifications(sent_at);
CREATE INDEX IF NOT EXISTS idx_broadcast_notifications_target_role ON broadcast_notifications(target_role);

-- Add broadcast delivery logs for tracking individual user deliveries
CREATE TABLE IF NOT EXISTS broadcast_delivery_logs (
  id SERIAL PRIMARY KEY,
  broadcast_id INTEGER REFERENCES broadcast_notifications(id) ON DELETE CASCADE,
  user_id UUID,
  status TEXT NOT NULL,
  error TEXT,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_broadcast_delivery_logs_broadcast_id ON broadcast_delivery_logs(broadcast_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_delivery_logs_user_id ON broadcast_delivery_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_delivery_logs_status ON broadcast_delivery_logs(status);

-- Add RLS policies for broadcast_notifications
ALTER TABLE broadcast_notifications ENABLE ROW LEVEL SECURITY;

-- Allow admins to read all broadcasts
CREATE POLICY "Admins can read all broadcasts" ON broadcast_notifications
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users WHERE id::text = auth.uid()::text AND role = 'admin'
    )
  );

-- Allow admins to create broadcasts
CREATE POLICY "Admins can create broadcasts" ON broadcast_notifications
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM users WHERE id::text = auth.uid()::text AND role = 'admin'
    )
  );

-- Allow admins to update broadcasts
CREATE POLICY "Admins can update broadcasts" ON broadcast_notifications
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM users WHERE id::text = auth.uid()::text AND role = 'admin'
    )
  );

-- Add RLS policies for broadcast_delivery_logs
ALTER TABLE broadcast_delivery_logs ENABLE ROW LEVEL SECURITY;

-- Allow admins to read all delivery logs
CREATE POLICY "Admins can read all delivery logs" ON broadcast_delivery_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users WHERE id::text = auth.uid()::text AND role = 'admin'
    )
  );

-- Allow insertion of delivery logs (system operation)
CREATE POLICY "System can create delivery logs" ON broadcast_delivery_logs
  FOR INSERT WITH CHECK (true);

-- Insert sample data for testing
INSERT INTO broadcast_notifications (title, body, target_role, total_users, sent_count, failed_count, status, sent_at) VALUES
('Welcome to Becxus Exchange!', 'Thank you for joining our platform. Start trading today!', 'all', 0, 0, 0, 'completed', NOW() - INTERVAL '7 days'),
('New Features Available', 'Check out our latest trading tools and features!', 'user', 0, 0, 0, 'completed', NOW() - INTERVAL '3 days')
ON CONFLICT DO NOTHING;

-- ************************************************************
-- END OF SCHEMA
-- ************************************************************

-- 
-- This completes the Becxus Exchange database schema.
-- All tables, indexes, RLS policies, and sample data are now in place.
-- 
-- To run this schema:
-- 1. Copy the entire content
-- 2. Paste into Supabase SQL Editor
-- 3. Execute all sections in order
-- 4. Verify all tables created successfully
-- 5. Create storage buckets manually in Supabase Dashboard:
--    - news-images (public)
--    - profile-pictures (public) 
--    - documents (private)
-- 6. Apply storage policies after bucket creation
-- 
-- Schema includes:
-- - User management with authentication
-- - Trading system (spot, futures, staking)
-- - Financial operations (deposits, withdrawals)
-- - Admin and support systems
-- - News and announcement system
-- - Complete RLS security policies
-- - Performance indexes
-- - Sample data for testing
-- - Storage bucket setup instructions
-- 
-- Total tables: 15+
-- Total indexes: 20+
-- Total RLS policies: 15+
-- Storage buckets: 3 (manual setup required)
-- 
-- Schema version: 1.0.0
-- Last updated: 2025-02-18
-- Compatible with: Supabase PostgreSQL 15+
-- 
-- ************************************************************
