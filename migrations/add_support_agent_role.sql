-- ============================================================
-- Chat Support Agent accounts
-- ------------------------------------------------------------
-- Adds the 'support' value to users.role. Support agents are
-- created by an admin from Admin → Support Agents. They can sign
-- in and work the support inbox (/api/admin/support/*) but have
-- no access to the rest of the admin panel.
--
-- users.role is a plain TEXT column with no CHECK constraint, so
-- no ALTER is required — this migration only adds the lookup
-- indexes used by the agent list endpoint.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_users_role_support
  ON users(role)
  WHERE role = 'support';

-- Support agents answer tickets, so their replies are found by
-- sender_id in support_messages. Index that lookup for the
-- per-agent reply stats shown in the admin panel.
CREATE INDEX IF NOT EXISTS idx_support_messages_sender
  ON support_messages(sender_id, sender_type);
