-- Add wallet_locked column to users table for admin wallet management
ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_locked BOOLEAN DEFAULT FALSE;

-- Add index for quick lookup of locked wallets
CREATE INDEX IF NOT EXISTS idx_users_wallet_locked ON users(wallet_locked) WHERE wallet_locked = TRUE;
