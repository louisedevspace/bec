-- User Staking Limits table — per-user overrides for staking amounts & durations
CREATE TABLE IF NOT EXISTS user_staking_limits (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  max_stake_amount DECIMAL(20,8),        -- max single stake amount
  max_total_staked DECIMAL(20,8),        -- max total active staked amount
  max_duration INTEGER,                   -- max staking duration in days
  min_stake_amount DECIMAL(20,8),        -- min single stake amount
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE, -- allow/block staking for this user
  notes TEXT,                             -- admin notes
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT                         -- admin user ID who last updated
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_staking_limits_user ON user_staking_limits(user_id);
CREATE INDEX IF NOT EXISTS idx_user_staking_limits_enabled ON user_staking_limits(is_enabled);
