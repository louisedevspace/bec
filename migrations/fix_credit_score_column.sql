-- Fix credit_score column to support 0-850 range
-- The current DECIMAL(3,2) only supports -9.99 to 9.99
-- We need INTEGER to support 0-850 range

-- Alter the credit_score column to INTEGER
ALTER TABLE users 
ALTER COLUMN credit_score TYPE INTEGER 
USING (credit_score::INTEGER);

-- Set default value
ALTER TABLE users 
ALTER COLUMN credit_score SET DEFAULT 60;

-- Update existing records to have a valid credit score if null or 0
UPDATE users 
SET credit_score = 60 
WHERE credit_score IS NULL OR credit_score = 0;
