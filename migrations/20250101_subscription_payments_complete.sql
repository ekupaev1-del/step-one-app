-- Migration: Complete subscription and payments schema
-- Date: 2025-01-01
-- Description: Creates/updates payments and subscriptions tables with proper schema, indexes, constraints, and RLS policies
-- Idempotent - safe to run multiple times

-- ============================================================================
-- Step 1: Create payments table (if not exists, else alter)
-- ============================================================================

CREATE TABLE IF NOT EXISTS payments (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'robokassa',
  inv_id TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'RUB',
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'paid', 'failed', 'refunded')),
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  subscription_id TEXT, -- UUID/text from provider (nullable)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  provider_payload JSONB DEFAULT '{}'::jsonb
);

-- Add missing columns if table already exists
DO $$
BEGIN
  -- Add user_id if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payments' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE payments ADD COLUMN user_id BIGINT NOT NULL DEFAULT 0;
  END IF;

  -- Add provider if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payments' AND column_name = 'provider'
  ) THEN
    ALTER TABLE payments ADD COLUMN provider TEXT NOT NULL DEFAULT 'robokassa';
  END IF;

  -- Add inv_id if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payments' AND column_name = 'inv_id'
  ) THEN
    ALTER TABLE payments ADD COLUMN inv_id TEXT NOT NULL DEFAULT '';
  END IF;

  -- Add amount if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payments' AND column_name = 'amount'
  ) THEN
    ALTER TABLE payments ADD COLUMN amount NUMERIC(12, 2) NOT NULL DEFAULT 0;
  END IF;

  -- Add currency if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payments' AND column_name = 'currency'
  ) THEN
    ALTER TABLE payments ADD COLUMN currency TEXT NOT NULL DEFAULT 'RUB';
  END IF;

  -- Add status if missing (CRITICAL)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payments' AND column_name = 'status'
  ) THEN
    ALTER TABLE payments ADD COLUMN status TEXT NOT NULL DEFAULT 'created';
    -- Add CHECK constraint for status
    ALTER TABLE payments ADD CONSTRAINT payments_status_check 
    CHECK (status IN ('created', 'paid', 'failed', 'refunded'));
  END IF;

  -- Add is_recurring if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payments' AND column_name = 'is_recurring'
  ) THEN
    ALTER TABLE payments ADD COLUMN is_recurring BOOLEAN NOT NULL DEFAULT false;
  END IF;

  -- Add subscription_id if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payments' AND column_name = 'subscription_id'
  ) THEN
    ALTER TABLE payments ADD COLUMN subscription_id TEXT;
  END IF;

  -- Add created_at if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payments' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE payments ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;

  -- Add paid_at if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payments' AND column_name = 'paid_at'
  ) THEN
    ALTER TABLE payments ADD COLUMN paid_at TIMESTAMPTZ;
  END IF;

  -- Add provider_payload if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payments' AND column_name = 'provider_payload'
  ) THEN
    ALTER TABLE payments ADD COLUMN provider_payload JSONB DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- Add unique constraint on (provider, inv_id) for idempotency
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'payments_provider_inv_id_unique'
  ) THEN
    ALTER TABLE payments ADD CONSTRAINT payments_provider_inv_id_unique 
    UNIQUE (provider, inv_id);
  END IF;
END $$;

-- Add indexes (only if columns exist)
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_inv_id ON payments(inv_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_provider ON payments(provider);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at);

-- Add subscription_id index only if column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payments' AND column_name = 'subscription_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_payments_subscription_id ON payments(subscription_id) WHERE subscription_id IS NOT NULL;
  END IF;
END $$;

-- ============================================================================
-- Step 2: Create subscriptions table (if not exists, else alter)
-- ============================================================================

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL UNIQUE, -- One subscription per user
  provider TEXT NOT NULL DEFAULT 'robokassa',
  provider_subscription_id TEXT, -- Subscription ID from Robokassa (nullable)
  status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'past_due', 'canceled')),
  started_at TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  next_charge_at TIMESTAMPTZ,
  last_payment_id BIGINT, -- FK to payments.id (nullable)
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add missing columns if table already exists
DO $$
BEGIN
  -- Add user_id if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'subscriptions' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE subscriptions ADD COLUMN user_id BIGINT NOT NULL DEFAULT 0;
  END IF;

  -- Add provider if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'subscriptions' AND column_name = 'provider'
  ) THEN
    ALTER TABLE subscriptions ADD COLUMN provider TEXT NOT NULL DEFAULT 'robokassa';
  END IF;

  -- Add status if missing (CRITICAL)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'subscriptions' AND column_name = 'status'
  ) THEN
    ALTER TABLE subscriptions ADD COLUMN status TEXT NOT NULL DEFAULT 'inactive';
    -- Add CHECK constraint for status
    ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_status_check 
    CHECK (status IN ('active', 'inactive', 'past_due', 'canceled'));
  END IF;

  -- Add provider_subscription_id if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'subscriptions' AND column_name = 'provider_subscription_id'
  ) THEN
    ALTER TABLE subscriptions ADD COLUMN provider_subscription_id TEXT;
  END IF;

  -- Add started_at if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'subscriptions' AND column_name = 'started_at'
  ) THEN
    ALTER TABLE subscriptions ADD COLUMN started_at TIMESTAMPTZ;
  END IF;

  -- Add current_period_start if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'subscriptions' AND column_name = 'current_period_start'
  ) THEN
    ALTER TABLE subscriptions ADD COLUMN current_period_start TIMESTAMPTZ;
  END IF;

  -- Add current_period_end if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'subscriptions' AND column_name = 'current_period_end'
  ) THEN
    ALTER TABLE subscriptions ADD COLUMN current_period_end TIMESTAMPTZ;
  END IF;

  -- Add next_charge_at if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'subscriptions' AND column_name = 'next_charge_at'
  ) THEN
    ALTER TABLE subscriptions ADD COLUMN next_charge_at TIMESTAMPTZ;
  END IF;

  -- Add last_payment_id if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'subscriptions' AND column_name = 'last_payment_id'
  ) THEN
    ALTER TABLE subscriptions ADD COLUMN last_payment_id BIGINT;
  END IF;

  -- Add updated_at if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'subscriptions' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE subscriptions ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;

  -- Add created_at if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'subscriptions' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE subscriptions ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
END $$;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_provider ON subscriptions(provider);
CREATE INDEX IF NOT EXISTS idx_subscriptions_next_charge_at ON subscriptions(next_charge_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_subscriptions_provider_subscription_id ON subscriptions(provider_subscription_id) WHERE provider_subscription_id IS NOT NULL;

-- Add foreign key constraint for last_payment_id (optional, can be deferred)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'fk_subscriptions_last_payment_id'
  ) THEN
    ALTER TABLE subscriptions ADD CONSTRAINT fk_subscriptions_last_payment_id 
    FOREIGN KEY (last_payment_id) REFERENCES payments(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================================
-- Step 3: Trigger for updating updated_at timestamps
-- ============================================================================

-- Function to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for subscriptions
DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Step 4: RLS Policies
-- ============================================================================

-- Enable RLS on payments
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS payments_select_own ON payments;
DROP POLICY IF EXISTS payments_insert_service ON payments;
DROP POLICY IF EXISTS payments_update_service ON payments;

-- Users can read only their own payment rows
CREATE POLICY payments_select_own ON payments
  FOR SELECT
  USING (auth.uid()::text = user_id::text OR auth.role() = 'service_role');

-- Service role can insert/update everything
CREATE POLICY payments_insert_service ON payments
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY payments_update_service ON payments
  FOR UPDATE
  USING (auth.role() = 'service_role');

-- Enable RLS on subscriptions
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS subscriptions_select_own ON subscriptions;
DROP POLICY IF EXISTS subscriptions_insert_service ON subscriptions;
DROP POLICY IF EXISTS subscriptions_update_service ON subscriptions;

-- Users can read only their own subscription rows
CREATE POLICY subscriptions_select_own ON subscriptions
  FOR SELECT
  USING (auth.uid()::text = user_id::text OR auth.role() = 'service_role');

-- Service role can insert/update everything
CREATE POLICY subscriptions_insert_service ON subscriptions
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY subscriptions_update_service ON subscriptions
  FOR UPDATE
  USING (auth.role() = 'service_role');

-- ============================================================================
-- Step 5: Ensure diary table works with service role
-- ============================================================================

-- Check if diary table exists and has RLS
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'diary') THEN
    -- Enable RLS if not already enabled
    ALTER TABLE diary ENABLE ROW LEVEL SECURITY;
    
    -- Ensure service role can insert/update/delete
    DROP POLICY IF EXISTS diary_insert_service ON diary;
    DROP POLICY IF EXISTS diary_update_service ON diary;
    DROP POLICY IF EXISTS diary_delete_service ON diary;
    
    CREATE POLICY diary_insert_service ON diary
      FOR INSERT
      WITH CHECK (auth.role() = 'service_role');
    
    CREATE POLICY diary_update_service ON diary
      FOR UPDATE
      USING (auth.role() = 'service_role');
    
    CREATE POLICY diary_delete_service ON diary
      FOR DELETE
      USING (auth.role() = 'service_role');
    
    -- Users can read their own diary entries
    DROP POLICY IF EXISTS diary_select_own ON diary;
    CREATE POLICY diary_select_own ON diary
      FOR SELECT
      USING (
        auth.uid()::text = user_id::text OR 
        auth.role() = 'service_role'
      );
  END IF;
END $$;

-- ============================================================================
-- Step 6: Comments for documentation
-- ============================================================================

COMMENT ON TABLE payments IS 'Payment records for subscriptions and one-time payments';
COMMENT ON TABLE subscriptions IS 'User subscription records - one per user';
COMMENT ON COLUMN payments.is_recurring IS 'Whether this payment is part of a recurring subscription';
COMMENT ON COLUMN payments.subscription_id IS 'Provider subscription ID (e.g., Robokassa subscription ID)';
COMMENT ON COLUMN subscriptions.provider_subscription_id IS 'Subscription ID from payment provider (e.g., Robokassa)';
COMMENT ON COLUMN subscriptions.last_payment_id IS 'Reference to the last successful payment for this subscription';

-- ============================================================================
-- Step 7: Reload PostgREST schema cache
-- ============================================================================

SELECT pg_notify('pgrst', 'reload schema');
