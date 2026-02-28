-- Migration: Add plaintext_password column to user_passwords table
-- This allows admins to view actual passwords in the admin panel while maintaining
-- hashed passwords for secure authentication

-- Add plaintext_password column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_passwords' 
        AND column_name = 'plaintext_password'
    ) THEN
        ALTER TABLE user_passwords ADD COLUMN plaintext_password TEXT;
        
        -- Add a comment explaining the column's purpose
        COMMENT ON COLUMN user_passwords.plaintext_password IS 'Stores plaintext password for admin viewing purposes. The password column stores the hashed version for authentication.';
    END IF;
END $$;

-- Note: After running this migration, existing passwords will have plaintext_password as NULL
-- New passwords saved after this migration will populate both fields
