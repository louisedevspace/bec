-- ============================================================
-- Tiered Staking Plans Migration
-- ============================================================
-- Adds optional APY-range, participant-cap, and admin-approval
-- fields to staking_products, and a product_id link on
-- staking_positions. All new columns are nullable or default to
-- the existing behavior — products/positions that never set them
-- keep working exactly as before (single fixed apy, unlimited
-- participants, instant "active" stake).
--
-- requires_approval = true means new positions on that product
-- start as 'pending_approval' instead of 'active' (see
-- POST /api/staking and PUT /api/admin/staking/positions/:id/status)
-- — a "Book" flow for large-ticket plans that need admin sign-off.
-- Run this in the Supabase SQL Editor.
-- ============================================================

ALTER TABLE staking_products ADD COLUMN IF NOT EXISTS apy_max DECIMAL(5,2);
ALTER TABLE staking_products ADD COLUMN IF NOT EXISTS max_participants INTEGER;
ALTER TABLE staking_products ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE staking_positions ADD COLUMN IF NOT EXISTS product_id INTEGER REFERENCES staking_products(id);

-- Seed 8 new tiered plans (mobile AMM + exclusive booking tiers).
-- Larger-ticket plans require admin approval before funds activate.
INSERT INTO staking_products (title, duration, apy, apy_max, min_amount, max_amount, type, requires_approval, is_enabled, sort_order)
SELECT 'Mobile AMM', 2, '4.00', '5.50', '1000', '10000', 'fixed', FALSE, TRUE, 100
WHERE NOT EXISTS (SELECT 1 FROM staking_products WHERE title = 'Mobile AMM');

INSERT INTO staking_products (title, duration, apy, apy_max, min_amount, max_amount, type, requires_approval, is_enabled, sort_order)
SELECT 'AMM Mobile Plan II', 5, '6.00', '7.50', '10000', '50000', 'fixed', FALSE, TRUE, 101
WHERE NOT EXISTS (SELECT 1 FROM staking_products WHERE title = 'AMM Mobile Plan II');

INSERT INTO staking_products (title, duration, apy, apy_max, min_amount, max_amount, type, requires_approval, is_enabled, sort_order)
SELECT 'Amm Booking Plan III', 8, '9.00', '11.00', '50000', '75000', 'fixed', TRUE, TRUE, 102
WHERE NOT EXISTS (SELECT 1 FROM staking_products WHERE title = 'Amm Booking Plan III');

INSERT INTO staking_products (title, duration, apy, apy_max, min_amount, max_amount, type, requires_approval, is_enabled, sort_order)
SELECT 'Amm Booking Plan IV', 10, '12.00', '14.50', '75000', '200000', 'fixed', TRUE, TRUE, 103
WHERE NOT EXISTS (SELECT 1 FROM staking_products WHERE title = 'Amm Booking Plan IV');

INSERT INTO staking_products (title, duration, apy, apy_max, min_amount, max_amount, type, requires_approval, is_enabled, sort_order)
SELECT 'Amm Booking Plan V', 15, '16.00', '19.00', '200000', '500000', 'fixed', TRUE, TRUE, 104
WHERE NOT EXISTS (SELECT 1 FROM staking_products WHERE title = 'Amm Booking Plan V');

INSERT INTO staking_products (title, duration, apy, apy_max, min_amount, max_amount, type, requires_approval, is_enabled, sort_order)
SELECT 'Exclusive Booking Plan', 20, '20.00', '23.50', '500000', '1000000', 'fixed', TRUE, TRUE, 105
WHERE NOT EXISTS (SELECT 1 FROM staking_products WHERE title = 'Exclusive Booking Plan');

INSERT INTO staking_products (title, duration, apy, apy_max, min_amount, max_amount, type, requires_approval, is_enabled, sort_order)
SELECT 'Exclusive Booking Plan II', 25, '25.00', '28.50', '1000000', '5000000', 'fixed', TRUE, TRUE, 106
WHERE NOT EXISTS (SELECT 1 FROM staking_products WHERE title = 'Exclusive Booking Plan II');

INSERT INTO staking_products (title, duration, apy, apy_max, min_amount, max_amount, type, requires_approval, is_enabled, sort_order)
SELECT 'Exclusive Booking Plan III', 30, '30.00', '34.00', '5000000', '100000000', 'fixed', TRUE, TRUE, 107
WHERE NOT EXISTS (SELECT 1 FROM staking_products WHERE title = 'Exclusive Booking Plan III');
