-- ============================================================
-- App Settings — Nav Visibility Column
-- ============================================================
-- Adds an admin-configurable map of nav-item-key -> boolean to
-- the existing app_settings singleton row (see add_app_settings.sql).
-- Lets the admin hide specific items from the nav bars without
-- touching the underlying routes. A missing key defaults to
-- visible (true); the JSON only needs to record explicit `false`
-- overrides. Run this in the Supabase SQL Editor.
-- ============================================================

ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS nav_visibility JSONB NOT NULL DEFAULT '{}'::jsonb;
