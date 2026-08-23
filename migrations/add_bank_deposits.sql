-- ============================================================
-- Bank Deposit Requests Migration
-- ============================================================
-- Manual bank-transfer deposit flow: user picks a country, sees
-- the admin-configured merchant account for it, and submits a
-- request with amount (USD) + their own bank name. Admin reviews
-- and, on approval, credits the user's USDT balance.
--
-- Off by default (bank_deposit_settings.is_enabled = false) —
-- admin configures merchant accounts and tests the flow via the
-- admin dashboard, then flips it on once satisfied.
-- Run this in the Supabase SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS bank_deposit_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT,
  CONSTRAINT bank_deposit_settings_singleton CHECK (id = 1)
);

INSERT INTO bank_deposit_settings (id, is_enabled)
VALUES (1, FALSE)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS bank_merchant_accounts (
  id SERIAL PRIMARY KEY,
  country TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  account_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  routing_info TEXT,
  instructions TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_bank_merchant_accounts_active ON bank_merchant_accounts(is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_bank_merchant_accounts_country ON bank_merchant_accounts(country);

CREATE TABLE IF NOT EXISTS bank_deposit_requests (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  country TEXT NOT NULL,
  amount_usd DECIMAL(20,2) NOT NULL,
  bank_name TEXT NOT NULL,
  merchant_account_id INTEGER REFERENCES bank_merchant_accounts(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_notes TEXT,
  rejection_reason TEXT,
  hidden_for_user BOOLEAN DEFAULT FALSE,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  is_new BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_bank_deposit_requests_user ON bank_deposit_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_bank_deposit_requests_status ON bank_deposit_requests(status);

-- RLS
ALTER TABLE bank_deposit_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_merchant_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_deposit_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bank_deposit_settings_select_policy" ON bank_deposit_settings;
CREATE POLICY "bank_deposit_settings_select_policy" ON bank_deposit_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "bank_merchant_accounts_select_policy" ON bank_merchant_accounts;
CREATE POLICY "bank_merchant_accounts_select_policy" ON bank_merchant_accounts FOR SELECT USING (
  auth.uid() IS NOT NULL
);

DROP POLICY IF EXISTS "bank_deposit_requests_select_policy" ON bank_deposit_requests;
DROP POLICY IF EXISTS "bank_deposit_requests_insert_policy" ON bank_deposit_requests;
CREATE POLICY "bank_deposit_requests_select_policy" ON bank_deposit_requests FOR SELECT USING (
  auth.uid() = user_id::uuid
  OR EXISTS (SELECT 1 FROM public.users WHERE id::uuid = auth.uid() AND role = 'admin')
);
CREATE POLICY "bank_deposit_requests_insert_policy" ON bank_deposit_requests FOR INSERT WITH CHECK (
  auth.uid() = user_id::uuid
);

-- Note: the server uses the service-role client (bypasses RLS) for all
-- admin writes to bank_deposit_settings / bank_merchant_accounts, same
-- as every other admin-managed table in this schema.
