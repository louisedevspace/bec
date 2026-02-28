-- Add per-user futures trading control columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS futures_min_amount DECIMAL(20,8) DEFAULT 50;
ALTER TABLE users ADD COLUMN IF NOT EXISTS futures_trade_result TEXT DEFAULT NULL;
