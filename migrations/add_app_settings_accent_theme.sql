-- ============================================================
-- App Settings — Accent Theme Column
-- ============================================================
-- Adds the selectable accent color variant to the existing
-- app_settings singleton row (see add_app_settings.sql).
-- Run this in the Supabase SQL Editor.
-- ============================================================

ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS accent_theme TEXT NOT NULL DEFAULT 'amber';

ALTER TABLE app_settings
  ADD CONSTRAINT app_settings_accent_theme_valid
  CHECK (accent_theme IN ('amber', 'blue', 'violet', 'cyan', 'slate'));
