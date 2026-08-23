-- ============================================================
-- Fix Bank Merchant Account Deletion
-- ============================================================
-- bank_deposit_requests.merchant_account_id referenced
-- bank_merchant_accounts(id) with the default ON DELETE NO ACTION,
-- which silently blocked deleting a merchant account once any
-- deposit request had been submitted against it (the request's
-- own country/bank_name columns already carry the record —
-- merchant_account_id is just a soft back-reference for admin
-- convenience, so it's safe to null out on delete).
-- Run this in the Supabase SQL Editor.
-- ============================================================

ALTER TABLE bank_deposit_requests
  DROP CONSTRAINT IF EXISTS bank_deposit_requests_merchant_account_id_fkey;

ALTER TABLE bank_deposit_requests
  ADD CONSTRAINT bank_deposit_requests_merchant_account_id_fkey
  FOREIGN KEY (merchant_account_id) REFERENCES bank_merchant_accounts(id) ON DELETE SET NULL;
