-- Admin Notifications System
-- Tracks events that require admin attention with navigation links

CREATE TABLE IF NOT EXISTS admin_notifications (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL,                    -- 'deposit_request' | 'withdraw_request' | 'support_ticket' | 'kyc_submission' | 'trade' | 'loan_application'
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  category TEXT NOT NULL,                -- sidebar section: 'users' | 'wallets' | 'support' | 'trading_pairs'
  link TEXT,                             -- admin route to navigate to e.g. '/admin/users'
  reference_id TEXT,                     -- ID of the related entity (deposit id, ticket id, etc.)
  user_id UUID REFERENCES auth.users(id),-- user who triggered the action
  user_email TEXT,                       -- cached for display
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  read_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast unread queries
CREATE INDEX IF NOT EXISTS idx_admin_notifications_unread ON admin_notifications(is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_category ON admin_notifications(category, is_read);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_type ON admin_notifications(type, created_at DESC);
