-- Migration: Create subscriptions table
-- Execute in Supabase SQL Editor
-- This migration is idempotent and safe to run multiple times

-- Drop table if exists (to start fresh)
DROP TABLE IF EXISTS subscriptions CASCADE;

-- Create subscriptions table
CREATE TABLE subscriptions (
  user_id INTEGER PRIMARY KEY,
  plan_code TEXT NOT NULL,
  active_until TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add constraint after table creation
ALTER TABLE subscriptions
ADD CONSTRAINT subscriptions_is_active_check CHECK (
  (is_active = true AND active_until IS NOT NULL) OR
  (is_active = false)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_subscriptions_is_active ON subscriptions(is_active);
CREATE INDEX IF NOT EXISTS idx_subscriptions_active_until ON subscriptions(active_until) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan_code ON subscriptions(plan_code);

-- Add foreign key constraint (if users table exists)
-- ALTER TABLE subscriptions ADD CONSTRAINT fk_subscriptions_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Add comments
COMMENT ON TABLE subscriptions IS 'User subscription records';
COMMENT ON COLUMN subscriptions.user_id IS 'Reference to users.id (primary key)';
COMMENT ON COLUMN subscriptions.plan_code IS 'Subscription plan code (e.g., monthly_199)';
COMMENT ON COLUMN subscriptions.active_until IS 'Subscription expiration date';
COMMENT ON COLUMN subscriptions.is_active IS 'Whether subscription is currently active';

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER subscriptions_updated_at_trigger
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_subscriptions_updated_at();

-- Notify PostgREST to reload schema cache
SELECT pg_notify('pgrst', 'reload schema');
