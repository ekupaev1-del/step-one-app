-- Combined Migration: Payments and Subscriptions Tables
-- Execute this entire file in Supabase SQL Editor
-- This migration is idempotent and safe to run multiple times

-- ============================================================================
-- PART 1: Payments Table
-- ============================================================================

-- Drop existing table if needed (uncomment if starting fresh)
-- DROP TABLE IF EXISTS payments CASCADE;

-- Create payments table
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL,
  telegram_user_id TEXT NOT NULL,
  plan_code TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'RUB',
  method TEXT NOT NULL, -- 'sbp' | 'card'
  provider TEXT NOT NULL DEFAULT 'robokassa',
  inv_id TEXT NOT NULL, -- Provider invoice/payment ID (as text for flexibility)
  status TEXT NOT NULL DEFAULT 'created', -- created|pending|paid|failed|canceled
  payment_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Constraints
  CONSTRAINT payments_status_check CHECK (status IN ('created', 'pending', 'paid', 'failed', 'canceled')),
  CONSTRAINT payments_currency_check CHECK (currency = 'RUB'),
  CONSTRAINT payments_method_check CHECK (method IN ('sbp', 'card')),
  CONSTRAINT payments_amount_check CHECK (amount > 0)
);

-- Create unique index on inv_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_inv_id_unique ON payments(inv_id);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_telegram_user_id ON payments(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at);
CREATE INDEX IF NOT EXISTS idx_payments_provider ON payments(provider);
CREATE INDEX IF NOT EXISTS idx_payments_method ON payments(method);

-- Add columns if table exists but missing new columns
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

  -- Change inv_id to TEXT if it's BIGINT
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payments' AND column_name = 'inv_id' AND data_type = 'bigint'
  ) THEN
    -- Drop unique constraint if exists
    DROP INDEX IF EXISTS idx_payments_inv_id_unique;
    -- Convert to text
    ALTER TABLE payments ALTER COLUMN inv_id TYPE TEXT USING inv_id::TEXT;
    -- Recreate unique index
    CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_inv_id_unique ON payments(inv_id);
  END IF;
END $$;

-- Add comments
COMMENT ON TABLE payments IS 'Payment records for subscription purchases';
COMMENT ON COLUMN payments.user_id IS 'Reference to users.id';
COMMENT ON COLUMN payments.telegram_user_id IS 'Telegram user ID from initData (as string)';
COMMENT ON COLUMN payments.plan_code IS 'Subscription plan code (e.g., trial_3d_then_199)';
COMMENT ON COLUMN payments.method IS 'Payment method: sbp or card';
COMMENT ON COLUMN payments.provider IS 'Payment provider name (robokassa, yookassa, etc.)';
COMMENT ON COLUMN payments.inv_id IS 'Provider invoice/payment ID (unique)';
COMMENT ON COLUMN payments.status IS 'Payment status: created|pending|paid|failed|canceled';
COMMENT ON COLUMN payments.payment_url IS 'Provider payment URL for redirect';

-- Trigger to update updated_at
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
-- PART 2: Subscriptions Table
-- ============================================================================

-- Drop table if exists (to start fresh)
DROP TABLE IF EXISTS subscriptions CASCADE;

-- Create subscriptions table
CREATE TABLE subscriptions (
  user_id INTEGER PRIMARY KEY,
  active_until TIMESTAMPTZ,
  next_charge_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'inactive', -- inactive|active|canceled|past_due
  provider TEXT,
  plan_code TEXT,
  recurring_token TEXT, -- Provider recurring payment token/mandate ID
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Constraints
  CONSTRAINT subscriptions_status_check CHECK (status IN ('inactive', 'active', 'canceled', 'past_due'))
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_active_until ON subscriptions(active_until) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_subscriptions_next_charge_at ON subscriptions(next_charge_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_subscriptions_provider ON subscriptions(provider);

-- Add comments
COMMENT ON TABLE subscriptions IS 'User subscription records';
COMMENT ON COLUMN subscriptions.user_id IS 'Reference to users.id (primary key)';
COMMENT ON COLUMN subscriptions.active_until IS 'Subscription expiration date';
COMMENT ON COLUMN subscriptions.next_charge_at IS 'Next recurring charge date';
COMMENT ON COLUMN subscriptions.status IS 'Subscription status: inactive|active|canceled|past_due';
COMMENT ON COLUMN subscriptions.provider IS 'Payment provider name';
COMMENT ON COLUMN subscriptions.plan_code IS 'Subscription plan code';
COMMENT ON COLUMN subscriptions.recurring_token IS 'Provider recurring payment token/mandate ID';

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS subscriptions_updated_at_trigger ON subscriptions;
CREATE TRIGGER subscriptions_updated_at_trigger
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_subscriptions_updated_at();

-- ============================================================================
-- Final: Notify PostgREST to reload schema cache
-- ============================================================================

SELECT pg_notify('pgrst', 'reload schema');

-- ============================================================================
-- Verification Queries (optional - uncomment to verify)
-- ============================================================================

-- Verify payments table structure
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'payments' 
-- ORDER BY ordinal_position;

-- Verify subscriptions table structure
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'subscriptions' 
-- ORDER BY ordinal_position;
