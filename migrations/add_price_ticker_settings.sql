-- ============================================================
-- Price Ticker Settings Migration
-- ============================================================
-- Admin-controlled toggle for the global scrolling price ticker
-- strip (shows live coin prices at the top of the main app
-- chrome). Off by default until admin enables it.
-- Run this in the Supabase SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS price_ticker_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT,
  CONSTRAINT price_ticker_settings_singleton CHECK (id = 1)
);

INSERT INTO price_ticker_settings (id, is_enabled)
VALUES (1, FALSE)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE price_ticker_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "price_ticker_settings_policy" ON price_ticker_settings;
CREATE POLICY "price_ticker_settings_policy" ON price_ticker_settings
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
  -- Regular users read the enabled flag via /api/price-ticker/status
  -- (service role), which bypasses RLS.
