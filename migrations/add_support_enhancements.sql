-- Add category and assigned_to columns to support_conversations
ALTER TABLE support_conversations ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';
ALTER TABLE support_conversations ADD COLUMN IF NOT EXISTS assigned_to UUID;

-- Add message_type column to support_messages if it doesn't exist
ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS message_type TEXT NOT NULL DEFAULT 'text';
