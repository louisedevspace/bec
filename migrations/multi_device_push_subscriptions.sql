-- ============================================================
-- Migration: Multi-Device Push Subscriptions
-- Purpose: Allow users to have push subscriptions on multiple
--          devices (iOS, Android, Desktop) simultaneously.
-- ============================================================

-- 1. Drop the old single-device table
DROP TABLE IF EXISTS push_subscriptions;

-- 2. Recreate with composite PK (user_id + endpoint)
CREATE TABLE push_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  keys JSONB NOT NULL,
  platform TEXT DEFAULT 'unknown',         -- 'ios', 'android', 'desktop', 'unknown'
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, endpoint)
);

-- Index for fast lookups by user_id (broadcast sends)
CREATE INDEX IF NOT EXISTS idx_push_subs_user_id ON push_subscriptions(user_id);

-- Index for fast cleanup by endpoint (expired subscription removal)
CREATE INDEX IF NOT EXISTS idx_push_subs_endpoint ON push_subscriptions(endpoint);

-- RLS policies
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own push subscriptions"
  ON push_subscriptions FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to push_subscriptions"
  ON push_subscriptions FOR ALL
  USING (auth.role() = 'service_role');
