-- Gold trading system
-- Creates gold_trades table and seeds a default XAU/USDT trading pair

CREATE TABLE IF NOT EXISTS gold_trades (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  pair_symbol TEXT NOT NULL DEFAULT 'XAU/USDT',
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  amount_usdt DECIMAL(20,8) NOT NULL,
  gold_quantity DECIMAL(20,8) NOT NULL,
  price_per_oz DECIMAL(20,8) NOT NULL,
  fee_usdt DECIMAL(20,8) NOT NULL DEFAULT 0,
  trading_fee_rate DECIMAL(10,8) NOT NULL DEFAULT 0.002,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  reject_reason TEXT,
  admin_note TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gold_trades_user_id ON gold_trades(user_id);
CREATE INDEX IF NOT EXISTS idx_gold_trades_status ON gold_trades(status);
CREATE INDEX IF NOT EXISTS idx_gold_trades_created_at ON gold_trades(created_at);

-- Extend pair_type check constraint to allow 'gold'
ALTER TABLE trading_pairs DROP CONSTRAINT IF EXISTS trading_pairs_pair_type_check;
ALTER TABLE trading_pairs ADD CONSTRAINT trading_pairs_pair_type_check
  CHECK (pair_type IN ('spot', 'futures', 'both', 'gold'));

-- Seed default gold trading pair into existing trading_pairs table
INSERT INTO trading_pairs (symbol, base_asset, quote_asset, is_enabled, min_trade_amount, max_trade_amount, trading_fee, sort_order, pair_type)
VALUES
  ('XAU/USDT', 'XAU', 'USDT', true, 10, 500000, 0.002, 1, 'gold')
ON CONFLICT (symbol) DO NOTHING;
