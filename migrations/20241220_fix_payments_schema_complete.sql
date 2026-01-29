-- Complete Payments Table Schema Fix
-- Execute this in Supabase SQL Editor
-- This migration ensures the payments table matches exactly what the API writes
-- Idempotent - safe to run multiple times

-- ============================================================================
-- Step 1: Drop and recreate table with correct schema
-- ============================================================================

-- Drop existing table if it exists (WARNING: This deletes all data!)
-- Uncomment only if you want to start fresh
-- DROP TABLE IF EXISTS payments CASCADE;

-- Create table with exact schema matching API insert payload
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL,
  telegram_user_id TEXT NOT NULL,
  inv_id TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'card',
  plan_code TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'RUB',
  status TEXT NOT NULL DEFAULT 'created',
  payment_url TEXT,
  provider TEXT NOT NULL DEFAULT 'robokassa',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Constraints
  CONSTRAINT payments_status_check CHECK (status IN ('created', 'pending', 'paid', 'failed', 'canceled')),
  CONSTRAINT payments_currency_check CHECK (currency = 'RUB'),
  CONSTRAINT payments_method_check CHECK (method IN ('sbp', 'card')),
  CONSTRAINT payments_amount_check CHECK (amount > 0)
);

-- ============================================================================
-- Step 2: Add missing columns if table already exists (safe migration)
-- ============================================================================

DO $$ 
BEGIN
  -- Add method column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payments' AND column_name = 'method'
  ) THEN
    ALTER TABLE payments ADD COLUMN method TEXT NOT NULL DEFAULT 'card';
    ALTER TABLE payments ADD CONSTRAINT payments_method_check CHECK (method IN ('sbp', 'card'));
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
    ALTER TABLE payments ADD CONSTRAINT payments_currency_check CHECK (currency = 'RUB');
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
    ALTER TABLE payments ADD CONSTRAINT payments_status_check CHECK (status IN ('created', 'pending', 'paid', 'failed', 'canceled'));
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

  -- CRITICAL: Convert telegram_user_id to TEXT if it's INTEGER or BIGINT
  -- This fixes the 22P02 error: invalid input syntax for type integer: "web:253"
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payments' 
    AND column_name = 'telegram_user_id' 
    AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    -- Drop index if exists (will recreate after conversion)
    DROP INDEX IF EXISTS idx_payments_telegram_user_id;
    
    -- Convert existing numeric values to text
    ALTER TABLE payments 
    ALTER COLUMN telegram_user_id 
    TYPE TEXT 
    USING CASE 
      WHEN telegram_user_id IS NULL THEN 'unknown'
      ELSE telegram_user_id::TEXT
    END;
    
    -- Ensure NOT NULL
    ALTER TABLE payments 
    ALTER COLUMN telegram_user_id 
    SET NOT NULL;
    
    -- Set default
    ALTER TABLE payments 
    ALTER COLUMN telegram_user_id 
    SET DEFAULT '';
    
    -- Recreate index
    CREATE INDEX IF NOT EXISTS idx_payments_telegram_user_id 
    ON payments(telegram_user_id);
  END IF;

  -- Ensure telegram_user_id is NOT NULL (fix existing NULLs)
  IF EXISTS (
    SELECT 1 FROM payments WHERE telegram_user_id IS NULL LIMIT 1
  ) THEN
    UPDATE payments SET telegram_user_id = 'unknown_' || id::text WHERE telegram_user_id IS NULL;
  END IF;
  
  -- Ensure inv_id is NOT NULL (fix existing NULLs)
  IF EXISTS (
    SELECT 1 FROM payments WHERE inv_id IS NULL LIMIT 1
  ) THEN
    UPDATE payments SET inv_id = 'unknown_' || id::text WHERE inv_id IS NULL;
  END IF;
END $$;

-- ============================================================================
-- Step 3: Ensure constraints exist
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
-- Step 4: Create indexes (matching API query patterns)
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

COMMENT ON TABLE payments IS 'Payment records for subscription purchases - schema matches API insert payload exactly';
COMMENT ON COLUMN payments.user_id IS 'Reference to users.id (from API: userId)';
COMMENT ON COLUMN payments.telegram_user_id IS 'Telegram user ID from initData (from API: telegramUserId)';
COMMENT ON COLUMN payments.inv_id IS 'Provider invoice/payment ID (from API: invId, generated before insert)';
COMMENT ON COLUMN payments.method IS 'Payment method: sbp or card (from API: method)';
COMMENT ON COLUMN payments.plan_code IS 'Subscription plan code (from API: planCode)';
COMMENT ON COLUMN payments.amount IS 'Payment amount in RUB (from API: amount)';
COMMENT ON COLUMN payments.currency IS 'Currency code, always RUB (from API: currency)';
COMMENT ON COLUMN payments.status IS 'Payment status: created|pending|paid|failed|canceled (from API: status)';
COMMENT ON COLUMN payments.payment_url IS 'Provider payment URL for redirect (from API: paymentUrl)';
COMMENT ON COLUMN payments.provider IS 'Payment provider name: robokassa (from API: provider)';

-- ============================================================================
-- Step 7: CRITICAL - Reload PostgREST schema cache
-- ============================================================================

-- This is ESSENTIAL after schema changes
-- PostgREST caches the schema, so new columns won't be visible until cache is reloaded
SELECT pg_notify('pgrst', 'reload schema');

-- Also try alternative method (some Supabase setups use this)
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- Verification Query (uncomment to verify after migration)
-- ============================================================================

-- SELECT 
--   column_name, 
--   data_type, 
--   is_nullable, 
--   column_default
-- FROM information_schema.columns 
-- WHERE table_name = 'payments' 
-- ORDER BY ordinal_position;

-- Expected columns (in order):
-- id, user_id, telegram_user_id, inv_id, method, plan_code, amount, 
-- currency, status, payment_url, provider, created_at, updated_at
