-- ============================================================
-- App Settings Logo Migration
-- ============================================================
-- Adds logo_updated_at to app_settings — tracks whether the admin
-- has uploaded a custom logo (Settings -> Branding). When set, the
-- server derives favicon.ico/icon-192.png/icon-512.png and the
-- in-app logo from that single uploaded image instead of the
-- bundled static default, so there's only one place to set it.
-- Also neutralizes the "Becxus" default seed value now that the
-- exchange name is admin-configurable.
-- Run this in the Supabase SQL Editor.
-- ============================================================

ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS logo_updated_at TIMESTAMPTZ;

ALTER TABLE app_settings
  ALTER COLUMN exchange_name SET DEFAULT 'Exchange';
