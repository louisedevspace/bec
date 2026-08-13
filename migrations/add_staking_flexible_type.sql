-- ============================================================
-- Flexible Staking Migration
-- ============================================================
-- Adds a `type` column ('fixed' | 'flexible') to staking_products
-- and staking_positions. Flexible positions can be unstaked any
-- time (see POST /api/staking/:id/unstake); fixed positions stay
-- locked until maturity, unchanged from before.
-- Run this in the Supabase SQL Editor.
-- ============================================================

ALTER TABLE staking_products ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'fixed';
ALTER TABLE staking_positions ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'fixed';

-- Seed a default flexible product if none exists yet
INSERT INTO staking_products (title, duration, apy, type, min_amount, max_amount, is_enabled, sort_order)
SELECT 'Flexible', 1, '0.60', 'flexible', '10', '1000000', TRUE, 0
WHERE NOT EXISTS (SELECT 1 FROM staking_products WHERE type = 'flexible');
