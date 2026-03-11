-- Add min_deposit and max_deposit columns to deposit_addresses table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='deposit_addresses' AND column_name='min_deposit') THEN
    ALTER TABLE deposit_addresses ADD COLUMN min_deposit DECIMAL(20,8) DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='deposit_addresses' AND column_name='max_deposit') THEN
    ALTER TABLE deposit_addresses ADD COLUMN max_deposit DECIMAL(20,8) DEFAULT NULL;
  END IF;
END $$;
