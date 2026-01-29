-- Migration: Create subscriptions table (v2 - updated schema)
-- Execute in Supabase SQL Editor
-- This migration is idempotent and safe to run multiple times

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

-- Add foreign key constraint (if users table exists)
-- ALTER TABLE subscriptions ADD CONSTRAINT fk_subscriptions_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

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

-- Notify PostgREST to reload schema cache
SELECT pg_notify('pgrst', 'reload schema');
