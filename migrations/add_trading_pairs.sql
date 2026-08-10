-- Trading Pairs table — admin-configurable list of allowed trading pairs
CREATE TABLE IF NOT EXISTS trading_pairs (
  id SERIAL PRIMARY KEY,
  symbol TEXT NOT NULL UNIQUE,           -- e.g. "BTC/USDT"
  base_asset TEXT NOT NULL,              -- e.g. "BTC"
  quote_asset TEXT NOT NULL,             -- e.g. "USDT"
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  min_trade_amount DECIMAL(20,8) DEFAULT 0.0001,
  max_trade_amount DECIMAL(20,8) DEFAULT 100,
  trading_fee DECIMAL(5,4) DEFAULT 0.001, -- 0.1%
  sort_order INTEGER DEFAULT 0,
  pair_type TEXT NOT NULL DEFAULT 'spot', -- spot, futures, both
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Seed default trading pairs
INSERT INTO trading_pairs (symbol, base_asset, quote_asset, is_enabled, min_trade_amount, max_trade_amount, trading_fee, sort_order, pair_type) VALUES
  ('BTC/USDT',  'BTC',  'USDT', true, 0.0001,  10,    0.001, 1,  'both'),
  ('ETH/USDT',  'ETH',  'USDT', true, 0.001,   100,   0.001, 2,  'both'),
  ('BNB/USDT',  'BNB',  'USDT', true, 0.01,    500,   0.001, 3,  'both'),
  ('SOL/USDT',  'SOL',  'USDT', true, 0.1,     1000,  0.001, 4,  'both'),
  ('XRP/USDT',  'XRP',  'USDT', true, 1,       10000, 0.001, 5,  'both'),
  ('ADA/USDT',  'ADA',  'USDT', true, 1,       10000, 0.001, 6,  'both'),
  ('DOT/USDT',  'DOT',  'USDT', true, 0.1,     5000,  0.001, 7,  'both'),
  ('DOGE/USDT', 'DOGE', 'USDT', true, 10,      100000,0.001, 8,  'both'),
  ('AVAX/USDT', 'AVAX', 'USDT', true, 0.1,     5000,  0.001, 9,  'both'),
  ('LINK/USDT', 'LINK', 'USDT', true, 0.1,     5000,  0.001, 10, 'both'),
  ('LTC/USDT',  'LTC',  'USDT', true, 0.01,    500,   0.001, 11, 'spot'),
  ('MATIC/USDT','MATIC','USDT', true, 1,       50000, 0.001, 12, 'spot'),
  ('ATOM/USDT', 'ATOM', 'USDT', true, 0.1,     5000,  0.001, 13, 'spot'),
  ('TRX/USDT',  'TRX',  'USDT', true, 10,      100000,0.001, 14, 'spot'),
  ('SHIB/USDT', 'SHIB', 'USDT', true, 100000,  1000000000,0.001, 15, 'spot')
ON CONFLICT (symbol) DO NOTHING;
