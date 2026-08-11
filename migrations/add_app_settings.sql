-- ============================================================
-- App Settings Table Migration
-- ============================================================
-- Single-row table for platform-wide branding/config the admin
-- can edit at runtime (e.g. exchange display name).
-- Run this in the Supabase SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS app_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  exchange_name TEXT NOT NULL DEFAULT 'Becxus',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT,
  CONSTRAINT app_settings_singleton CHECK (id = 1)
);

INSERT INTO app_settings (id, exchange_name)
VALUES (1, 'Becxus')
ON CONFLICT (id) DO NOTHING;
