-- Migration: Create subscriptions and payments tables
-- Execute in Supabase SQL Editor
-- Idempotent - safe to run multiple times

-- ============================================================================
-- Step 1: Ensure users table has no subscription constraints that break /start
-- ============================================================================

-- Drop any subscription-related CHECK constraints on users table
DO $$ 
DECLARE
  constraint_name TEXT;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'users' 
    AND c.contype = 'c'  -- CHECK constraint
    AND (conname LIKE '%subscription%' OR pg_get_constraintdef(c.oid) LIKE '%subscription%')
  LOOP
    EXECUTE format('ALTER TABLE users DROP CONSTRAINT IF EXISTS %I', constraint_name);
    RAISE NOTICE 'Dropped constraint: %', constraint_name;
  END LOOP;
END $$;

-- ============================================================================
-- Step 2: Create payments table
-- ============================================================================

CREATE TABLE IF NOT EXISTS payments (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'robokassa',
  inv_id TEXT NOT NULL UNIQUE,
  method TEXT NOT NULL CHECK (method IN ('card', 'sbp')),
  plan_code TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'RUB',
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'paid', 'failed')),
  out_sum NUMERIC(12, 2) NOT NULL,  -- Robokassa requires out_sum
  payment_url TEXT,
  provider_payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for payments
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_inv_id ON payments(inv_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_provider ON payments(provider);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at);

-- ============================================================================
-- Step 3: Create subscriptions table
-- ============================================================================

CREATE TABLE IF NOT EXISTS subscriptions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE,  -- One subscription per user
  status TEXT NOT NULL DEFAULT 'trialing' CHECK (status IN ('active', 'canceled', 'past_due', 'trialing')),
  active_until TIMESTAMPTZ,
  next_charge_at TIMESTAMPTZ,
  plan_code TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'robokassa',
  provider_customer_id TEXT,  -- Customer ID from Robokassa (if available)
  provider_recurring_id TEXT,  -- Recurring payment token/ID (if available)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for subscriptions
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_active_until ON subscriptions(active_until) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_subscriptions_next_charge_at ON subscriptions(next_charge_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_subscriptions_provider ON subscriptions(provider);

-- Foreign key constraints (optional, can be deferred if needed)
-- ALTER TABLE payments ADD CONSTRAINT fk_payments_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
-- ALTER TABLE subscriptions ADD CONSTRAINT fk_subscriptions_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- ============================================================================
-- Step 4: Trigger for updating updated_at timestamps
-- ============================================================================

-- Function to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for payments
DROP TRIGGER IF EXISTS update_payments_updated_at ON payments;
CREATE TRIGGER update_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Triggers for subscriptions
DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Step 5: Comments for documentation
-- ============================================================================

COMMENT ON TABLE payments IS 'Payment records for subscriptions';
COMMENT ON TABLE subscriptions IS 'User subscription records';
COMMENT ON COLUMN payments.out_sum IS 'Payment amount as required by Robokassa (same as amount)';
COMMENT ON COLUMN subscriptions.provider_recurring_id IS 'Token/ID for recurring charges from Robokassa (if available)';

-- ============================================================================
-- Step 6: CRITICAL - Reload PostgREST schema cache
-- ============================================================================

SELECT pg_notify('pgrst', 'reload schema');
