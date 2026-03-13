-- ============================================================
-- Fee tracking fields for user/admin visibility and analytics
-- ============================================================

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS fee_amount DECIMAL(20,8) DEFAULT 0;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS fee_symbol TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS fee_rate DECIMAL(10,8);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS net_amount DECIMAL(20,8);

ALTER TABLE trades ADD COLUMN IF NOT EXISTS fee_amount DECIMAL(20,8) DEFAULT 0;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS fee_symbol TEXT;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS fee_rate DECIMAL(10,8);

ALTER TABLE deposit_requests ADD COLUMN IF NOT EXISTS fee_amount DECIMAL(20,8) DEFAULT 0;
ALTER TABLE deposit_requests ADD COLUMN IF NOT EXISTS fee_symbol TEXT;
ALTER TABLE deposit_requests ADD COLUMN IF NOT EXISTS fee_rate DECIMAL(10,8);
ALTER TABLE deposit_requests ADD COLUMN IF NOT EXISTS net_amount DECIMAL(20,8);

ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS fee_amount DECIMAL(20,8) DEFAULT 0;
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS fee_symbol TEXT;
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS fee_rate DECIMAL(10,8);
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS net_amount DECIMAL(20,8);

CREATE TABLE IF NOT EXISTS platform_fees (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  trade_id INTEGER,
  trade_type TEXT NOT NULL DEFAULT 'spot' CHECK (trade_type IN ('spot', 'futures', 'staking', 'withdrawal', 'deposit')),
  symbol TEXT NOT NULL,
  fee_amount DECIMAL(20,8) NOT NULL DEFAULT 0,
  fee_symbol TEXT NOT NULL DEFAULT 'USDT',
  fee_rate TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_fees_user ON platform_fees(user_id);
CREATE INDEX IF NOT EXISTS idx_platform_fees_type ON platform_fees(trade_type);
CREATE INDEX IF NOT EXISTS idx_platform_fees_created ON platform_fees(created_at);

ALTER TABLE platform_fees DROP CONSTRAINT IF EXISTS platform_fees_trade_type_check;

ALTER TABLE platform_fees
  ADD CONSTRAINT platform_fees_trade_type_check
  CHECK (trade_type IN ('spot', 'futures', 'staking', 'withdrawal', 'deposit'));