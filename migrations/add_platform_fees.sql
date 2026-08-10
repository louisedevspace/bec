-- ============================================================
-- Platform Fees Table Migration
-- ============================================================
-- Tracks exchange revenue from trading fees, withdrawal fees, etc.
-- Run this in the Supabase SQL Editor.
-- ============================================================

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
