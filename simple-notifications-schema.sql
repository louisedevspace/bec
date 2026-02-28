-- ************************************************************
-- SECTION 7: SIMPLIFIED NOTIFICATION SYSTEM
-- ************************************************************

-- Add broadcast notifications table for simplified system
CREATE TABLE IF NOT EXISTS broadcast_notifications (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  deeplink_url TEXT,
  total_users INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  sent_by UUID,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_broadcast_notifications_status ON broadcast_notifications(status);
CREATE INDEX IF NOT EXISTS idx_broadcast_notifications_sent_at ON broadcast_notifications(sent_at);

-- Add broadcast delivery logs for tracking individual user deliveries
CREATE TABLE IF NOT EXISTS broadcast_delivery_logs (
  id SERIAL PRIMARY KEY,
  broadcast_id INTEGER REFERENCES broadcast_notifications(id) ON DELETE CASCADE,
  user_id UUID,
  status TEXT NOT NULL,
  error TEXT,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_broadcast_delivery_logs_broadcast_id ON broadcast_delivery_logs(broadcast_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_delivery_logs_user_id ON broadcast_delivery_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_delivery_logs_status ON broadcast_delivery_logs(status);

-- Add RLS policies for broadcast_notifications
ALTER TABLE broadcast_notifications ENABLE ROW LEVEL SECURITY;

-- Allow admins to read all broadcasts
CREATE POLICY "Admins can read all broadcasts" ON broadcast_notifications
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Allow admins to create broadcasts
CREATE POLICY "Admins can create broadcasts" ON broadcast_notifications
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Allow admins to update broadcasts
CREATE POLICY "Admins can update broadcasts" ON broadcast_notifications
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Add RLS policies for broadcast_delivery_logs
ALTER TABLE broadcast_delivery_logs ENABLE ROW LEVEL SECURITY;

-- Allow admins to read all delivery logs
CREATE POLICY "Admins can read all delivery logs" ON broadcast_delivery_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Allow insertion of delivery logs (system operation)
CREATE POLICY "System can create delivery logs" ON broadcast_delivery_logs
  FOR INSERT WITH CHECK (true);

-- Insert sample data for testing
INSERT INTO broadcast_notifications (title, body, deeplink_url, total_users, sent_count, failed_count, status, sent_at) VALUES
('Welcome to Becxus Exchange!', 'Thank you for joining our platform. Start trading today!', '/', 0, 0, 0, 'completed', NOW() - INTERVAL '7 days'),
('New Features Available', 'Check out our latest trading tools and features!', '/features', 0, 0, 0, 'completed', NOW() - INTERVAL '3 days')
ON CONFLICT DO NOTHING;