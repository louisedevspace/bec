-- ============================================================
-- Wallet-Connect Deposits Migration
-- ============================================================
-- Adds optional on-chain proof columns to deposit_requests
-- (tx_hash, wallet_address, network) for users who connect their
-- own wallet (MetaMask/TronLink/WalletConnect) and send the
-- deposit themselves instead of copying the admin's fixed
-- address. These are purely additive/nullable — the existing
-- manual-copy deposit flow (screenshot only) is unaffected and
-- admin approval logic does not change.
--
-- wallet_connect_settings: singleton admin toggle (enable/disable
-- wallet-connect deposits) plus an optional WalletConnect Cloud
-- Project ID (not a secret — safe to expose to the client, same
-- as a publishable API key).
-- Run this in the Supabase SQL Editor.
-- ============================================================

ALTER TABLE deposit_requests ADD COLUMN IF NOT EXISTS tx_hash TEXT;
ALTER TABLE deposit_requests ADD COLUMN IF NOT EXISTS wallet_address TEXT;
ALTER TABLE deposit_requests ADD COLUMN IF NOT EXISTS network TEXT;

CREATE TABLE IF NOT EXISTS wallet_connect_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  walletconnect_project_id TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT,
  CONSTRAINT wallet_connect_settings_singleton CHECK (id = 1)
);

INSERT INTO wallet_connect_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;
