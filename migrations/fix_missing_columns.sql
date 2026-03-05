-- ============================================================
-- Fix Missing Columns Migration
-- ============================================================
-- Run this in the Supabase SQL Editor if you get 400 errors
-- on user creation/login. CREATE TABLE IF NOT EXISTS does NOT
-- add columns to an already-existing table, so these ALTER
-- statements ensure all required columns exist.
-- ============================================================

-- 1. Add missing columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_picture TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS futures_min_amount DECIMAL(20,8) DEFAULT 50;
ALTER TABLE users ADD COLUMN IF NOT EXISTS futures_trade_result TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_locked BOOLEAN DEFAULT FALSE;

-- 2. Fix credit_score type: code sends 0.60 (decimal) but old schema had INTEGER
-- This safely converts INTEGER → DECIMAL(5,2) without data loss
-- (e.g. old value 60 stays as 60.00, new inserts use 0.60 scale)
DO $$
BEGIN
  -- Only alter if it's currently INTEGER
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users'
    AND column_name = 'credit_score'
    AND data_type = 'integer'
  ) THEN
    ALTER TABLE users ALTER COLUMN credit_score TYPE DECIMAL(5,2) USING credit_score::DECIMAL(5,2);
    ALTER TABLE users ALTER COLUMN credit_score SET DEFAULT 0.60;
    -- Convert old integer values (e.g. 60) to decimal scale (0.60)
    UPDATE users SET credit_score = credit_score / 100.0
      WHERE credit_score > 1;
  END IF;
END $$;

-- 3. Add missing indexes
CREATE INDEX IF NOT EXISTS idx_users_wallet_locked ON users(wallet_locked) WHERE wallet_locked = TRUE;
CREATE INDEX IF NOT EXISTS idx_trades_deleted_for_user ON trades(deleted_for_user);
CREATE INDEX IF NOT EXISTS idx_trades_user_deleted ON trades(user_id, deleted_for_user);

-- 4. Ensure portfolios table has the UNIQUE constraint for upserts
-- (The upsert in deposit approval uses onConflict: "user_id,symbol")
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'portfolios'
    AND constraint_type = 'UNIQUE'
  ) THEN
    ALTER TABLE portfolios ADD CONSTRAINT portfolios_user_id_symbol_key UNIQUE (user_id, symbol);
  END IF;
END $$;

-- 5. Ensure portfolios table exists (in case it was never created)
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
