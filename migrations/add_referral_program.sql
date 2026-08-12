-- ============================================================
-- Referral Program Migration
-- ============================================================
-- referral_settings: single-row admin-controlled config (reward
--   type/amount, min deposit to qualify, optional cap).
-- referrals: one row per referred user, tracks reward status.
-- users.referral_code: each user's own shareable code.
-- Run this in the Supabase SQL Editor.
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;

CREATE TABLE IF NOT EXISTS referral_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  reward_type TEXT NOT NULL DEFAULT 'fixed', -- 'fixed' | 'percentage'
  fixed_amount NUMERIC(20, 8) NOT NULL DEFAULT 5,
  percentage_rate NUMERIC(10, 8) NOT NULL DEFAULT 0.10,
  min_deposit_amount NUMERIC(20, 8) NOT NULL DEFAULT 0,
  max_reward_amount NUMERIC(20, 8),
  reward_symbol TEXT NOT NULL DEFAULT 'USDT',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT,
  CONSTRAINT referral_settings_singleton CHECK (id = 1)
);

INSERT INTO referral_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS referrals (
  id SERIAL PRIMARY KEY,
  referrer_id TEXT NOT NULL,
  referred_user_id TEXT NOT NULL UNIQUE,
  referral_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'rewarded'
  reward_amount NUMERIC(20, 8),
  reward_symbol TEXT,
  qualifying_deposit_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  rewarded_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer_id ON referrals (referrer_id);
