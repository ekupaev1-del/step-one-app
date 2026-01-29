-- Migration: Create robokassa_invoices table
-- Execute in Supabase SQL Editor
-- Idempotent - safe to run multiple times
--
-- Purpose: Store Robokassa invoice records with auto-increment integer IDs.
-- The invoice.id will be used as Robokassa InvId (must be small integer, not timestamp/UUID).
-- This fixes Robokassa error 29 "Оплата счетов недоступна" caused by large/non-numeric InvId.

-- ============================================================================
-- Step 1: Create robokassa_invoices table
-- ============================================================================

CREATE TABLE IF NOT EXISTS robokassa_invoices (
  id SERIAL PRIMARY KEY,  -- Auto-increment integer (small, within Robokassa's supported range)
  user_id BIGINT NOT NULL,
  plan_code TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('card', 'sbp')),
  amount NUMERIC(12, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'RUB',
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'paid', 'failed', 'expired')),
  request_id TEXT,  -- Our internal request ID for tracking (can contain hyphens/letters)
  payment_url TEXT,  -- Generated Robokassa payment URL
  raw_payload JSONB DEFAULT '{}'::jsonb,  -- Optional: store full request/response data
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for robokassa_invoices
CREATE INDEX IF NOT EXISTS idx_robokassa_invoices_user_id ON robokassa_invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_robokassa_invoices_status ON robokassa_invoices(status);
CREATE INDEX IF NOT EXISTS idx_robokassa_invoices_request_id ON robokassa_invoices(request_id);
CREATE INDEX IF NOT EXISTS idx_robokassa_invoices_created_at ON robokassa_invoices(created_at);

-- ============================================================================
-- Step 2: Trigger for updating updated_at timestamps
-- ============================================================================

-- Function to update updated_at (reuse if exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for robokassa_invoices
DROP TRIGGER IF EXISTS update_robokassa_invoices_updated_at ON robokassa_invoices;
CREATE TRIGGER update_robokassa_invoices_updated_at
  BEFORE UPDATE ON robokassa_invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Step 3: Comments for documentation
-- ============================================================================

COMMENT ON TABLE robokassa_invoices IS 'Robokassa invoice records. The id field is used as InvId in Robokassa payment URLs (must be small integer).';
COMMENT ON COLUMN robokassa_invoices.id IS 'Auto-increment integer used as Robokassa InvId (small integer, within supported range)';
COMMENT ON COLUMN robokassa_invoices.request_id IS 'Internal request ID for tracking (can contain hyphens/letters, stored separately from InvId)';
COMMENT ON COLUMN robokassa_invoices.raw_payload IS 'Optional JSONB field for storing full request/response data for debugging';

-- ============================================================================
-- Step 4: CRITICAL - Reload PostgREST schema cache
-- ============================================================================

SELECT pg_notify('pgrst', 'reload schema');
