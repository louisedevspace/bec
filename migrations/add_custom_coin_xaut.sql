-- Add custom coin API URL support and XAUT/USDT pair
-- custom_api_url: admin-provided price endpoint (must return { price: number })

ALTER TABLE trading_pairs ADD COLUMN IF NOT EXISTS custom_api_url TEXT;

-- Extend pair_type to allow 'custom'
ALTER TABLE trading_pairs DROP CONSTRAINT IF EXISTS trading_pairs_pair_type_check;
ALTER TABLE trading_pairs ADD CONSTRAINT trading_pairs_pair_type_check
  CHECK (pair_type IN ('spot', 'futures', 'both', 'gold', 'custom'));

-- Seed XAUT/USDT (Tether Gold — trades on Binance as XAUTUSDT)
INSERT INTO trading_pairs (symbol, base_asset, quote_asset, is_enabled, min_trade_amount, max_trade_amount, trading_fee, sort_order, pair_type)
VALUES ('XAUT/USDT', 'XAUT', 'USDT', true, 1, 100000, 0.002, 2, 'spot')
ON CONFLICT (symbol) DO NOTHING;
