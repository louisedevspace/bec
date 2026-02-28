-- Test the streamlined notification system schema
-- This is a test file to verify the SQL syntax is correct

-- Create test tables (if they don't exist)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Test broadcast_notifications table creation
CREATE TABLE IF NOT EXISTS broadcast_notifications (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  target_role TEXT,
  total_users INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  sent_by UUID,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Test RLS policies with proper type casting
ALTER TABLE broadcast_notifications ENABLE ROW LEVEL SECURITY;

-- Allow admins to read all broadcasts (with type casting)
CREATE POLICY "Admins can read all broadcasts" ON broadcast_notifications
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users WHERE id::text = auth.uid()::text AND role = 'admin'
    )
  );

-- Test insertion
INSERT INTO broadcast_notifications (title, body, target_role, total_users, sent_count, failed_count, status, sent_at) VALUES
('Test Notification', 'This is a test notification', 'all', 10, 8, 2, 'completed', NOW())
ON CONFLICT DO NOTHING;

-- Test broadcast_delivery_logs table
CREATE TABLE IF NOT EXISTS broadcast_delivery_logs (
  id SERIAL PRIMARY KEY,
  broadcast_id INTEGER REFERENCES broadcast_notifications(id) ON DELETE CASCADE,
  user_id UUID,
  status TEXT NOT NULL,
  error TEXT,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Test RLS policies for delivery logs
ALTER TABLE broadcast_delivery_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read all delivery logs" ON broadcast_delivery_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users WHERE id::text = auth.uid()::text AND role = 'admin'
    )
  );

-- Clean up test tables (optional)
-- DROP TABLE IF EXISTS broadcast_delivery_logs;
-- DROP TABLE IF EXISTS broadcast_notifications;
-- DROP TABLE IF EXISTS users;