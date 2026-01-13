-- Fix Payments Table Schema
-- Execute this in Supabase SQL Editor
-- This migration ensures all required columns exist and are properly typed
-- Idempotent - safe to run multiple times

-- ============================================================================
-- Step 1: Ensure payments table exists with correct structure
-- ============================================================================

-- Create table if not exists
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL,
  telegram_user_id TEXT NOT NULL,
  plan_code TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'RUB',
  method TEXT NOT NULL DEFAULT 'card',
  provider TEXT NOT NULL DEFAULT 'robokassa',
  inv_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'created',
  payment_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- Step 2: Add missing columns if table already exists
-- ============================================================================

DO $$ 
BEGIN
  -- Add method column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payments' AND column_name = 'method'
  ) THEN
    ALTER TABLE payments ADD COLUMN method TEXT NOT NULL DEFAULT 'card';
  END IF;

  -- Add provider column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payments' AND column_name = 'provider'
  ) THEN
    ALTER TABLE payments ADD COLUMN provider TEXT NOT NULL DEFAULT 'robokassa';
  END IF;

  -- Add currency column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payments' AND column_name = 'currency'
  ) THEN
    ALTER TABLE payments ADD COLUMN currency TEXT NOT NULL DEFAULT 'RUB';
  END IF;

  -- Add plan_code column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payments' AND column_name = 'plan_code'
  ) THEN
    ALTER TABLE payments ADD COLUMN plan_code TEXT NOT NULL DEFAULT 'trial_3d_then_199';
  END IF;

  -- Add telegram_user_id column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payments' AND column_name = 'telegram_user_id'
  ) THEN
    ALTER TABLE payments ADD COLUMN telegram_user_id TEXT NOT NULL DEFAULT '';
  END IF;

  -- Add inv_id column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payments' AND column_name = 'inv_id'
  ) THEN
    ALTER TABLE payments ADD COLUMN inv_id TEXT NOT NULL DEFAULT '';
  END IF;

  -- Add payment_url column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payments' AND column_name = 'payment_url'
  ) THEN
    ALTER TABLE payments ADD COLUMN payment_url TEXT;
  END IF;

  -- Add status column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payments' AND column_name = 'status'
  ) THEN
    ALTER TABLE payments ADD COLUMN status TEXT NOT NULL DEFAULT 'created';
  END IF;

  -- Add created_at column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payments' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE payments ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT now();
  END IF;

  -- Add updated_at column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payments' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE payments ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
  END IF;

  -- Convert inv_id to TEXT if it's BIGINT or INTEGER
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payments' 
    AND column_name = 'inv_id' 
    AND data_type IN ('bigint', 'integer')
  ) THEN
    -- Drop unique constraint if exists
    DROP INDEX IF EXISTS idx_payments_inv_id_unique;
    -- Convert to text
    ALTER TABLE payments ALTER COLUMN inv_id TYPE TEXT USING inv_id::TEXT;
  END IF;

  -- Make telegram_user_id nullable if needed (for backward compatibility)
  -- But we prefer NOT NULL, so only make nullable if there are existing NULL values
  IF EXISTS (
    SELECT 1 FROM payments WHERE telegram_user_id IS NULL LIMIT 1
  ) THEN
    -- Allow NULL temporarily, but set defaults for existing rows
    ALTER TABLE payments ALTER COLUMN telegram_user_id DROP NOT NULL;
    UPDATE payments SET telegram_user_id = 'unknown' WHERE telegram_user_id IS NULL;
    ALTER TABLE payments ALTER COLUMN telegram_user_id SET NOT NULL;
  END IF;

  -- Make inv_id NOT NULL if it's nullable
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payments' 
    AND column_name = 'inv_id' 
    AND is_nullable = 'YES'
  ) THEN
    -- Set defaults for existing NULL values
    UPDATE payments SET inv_id = 'unknown_' || id::text WHERE inv_id IS NULL;
    ALTER TABLE payments ALTER COLUMN inv_id SET NOT NULL;
  END IF;
END $$;

-- ============================================================================
-- Step 3: Add constraints
-- ============================================================================

-- Drop existing constraints if they exist (to avoid errors on re-run)
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_currency_check;
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_method_check;
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_amount_check;

-- Add constraints
ALTER TABLE payments ADD CONSTRAINT payments_status_check 
  CHECK (status IN ('created', 'pending', 'paid', 'failed', 'canceled'));

ALTER TABLE payments ADD CONSTRAINT payments_currency_check 
  CHECK (currency = 'RUB');

ALTER TABLE payments ADD CONSTRAINT payments_method_check 
  CHECK (method IN ('sbp', 'card'));

ALTER TABLE payments ADD CONSTRAINT payments_amount_check 
  CHECK (amount > 0);

-- ============================================================================
-- Step 4: Create indexes
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_inv_id_unique ON payments(inv_id);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_telegram_user_id ON payments(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at);
CREATE INDEX IF NOT EXISTS idx_payments_provider ON payments(provider);
CREATE INDEX IF NOT EXISTS idx_payments_method ON payments(method);

-- ============================================================================
-- Step 5: Add trigger for updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS payments_updated_at_trigger ON payments;
CREATE TRIGGER payments_updated_at_trigger
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_payments_updated_at();

-- ============================================================================
-- Step 6: Add comments
-- ============================================================================

COMMENT ON TABLE payments IS 'Payment records for subscription purchases';
COMMENT ON COLUMN payments.user_id IS 'Reference to users.id';
COMMENT ON COLUMN payments.telegram_user_id IS 'Telegram user ID from initData (as string)';
COMMENT ON COLUMN payments.plan_code IS 'Subscription plan code (e.g., trial_3d_then_199)';
COMMENT ON COLUMN payments.method IS 'Payment method: sbp or card';
COMMENT ON COLUMN payments.provider IS 'Payment provider name (robokassa, yookassa, etc.)';
COMMENT ON COLUMN payments.inv_id IS 'Provider invoice/payment ID (unique, as text)';
COMMENT ON COLUMN payments.status IS 'Payment status: created|pending|paid|failed|canceled';
COMMENT ON COLUMN payments.payment_url IS 'Provider payment URL for redirect';

-- ============================================================================
-- Step 7: Notify PostgREST to reload schema cache
-- ============================================================================

SELECT pg_notify('pgrst', 'reload schema');

-- ============================================================================
-- Verification (optional - uncomment to verify)
-- ============================================================================

-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns 
-- WHERE table_name = 'payments' 
-- ORDER BY ordinal_position;
