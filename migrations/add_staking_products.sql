-- Staking Products: admin-configurable staking plans
CREATE TABLE IF NOT EXISTS staking_products (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  duration INTEGER NOT NULL, -- days
  apy DECIMAL(5,2) NOT NULL, -- e.g. 0.50, 4.00
  min_amount DECIMAL(20,8) NOT NULL,
  max_amount DECIMAL(20,8) NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
