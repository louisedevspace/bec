-- ============================================================
-- ROI Calculator Settings Migration
-- ============================================================
-- Admin-controlled toggle for the staking page's ROI Calculator
-- tab (a client-side what-if projection tool built from the
-- real configured staking_products — no new financial data).
-- Off by default until admin enables it.
-- Run this in the Supabase SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS roi_calculator_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT,
  CONSTRAINT roi_calculator_settings_singleton CHECK (id = 1)
);

INSERT INTO roi_calculator_settings (id, is_enabled)
VALUES (1, FALSE)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE roi_calculator_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "roi_calculator_settings_policy" ON roi_calculator_settings;
CREATE POLICY "roi_calculator_settings_policy" ON roi_calculator_settings
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
  -- Regular users read the enabled flag via /api/roi-calculator/status
  -- (service role), which bypasses RLS.
