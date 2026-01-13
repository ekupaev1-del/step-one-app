-- Migration: Create subscriptions table (Safe version - preserves existing data)
-- Execute in Supabase SQL Editor
-- This version adds columns if table exists, or creates new table

-- Check if table exists and create if not
CREATE TABLE IF NOT EXISTS subscriptions (
  user_id INTEGER PRIMARY KEY,
  plan_code TEXT NOT NULL,
  active_until TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add columns if they don't exist (for existing tables)
DO $$ 
BEGIN
  -- Add is_active if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'subscriptions' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE subscriptions ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT false;
  END IF;

  -- Add other columns if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'subscriptions' AND column_name = 'plan_code'
  ) THEN
    ALTER TABLE subscriptions ADD COLUMN plan_code TEXT NOT NULL DEFAULT 'monthly_199';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'subscriptions' AND column_name = 'active_until'
  ) THEN
    ALTER TABLE subscriptions ADD COLUMN active_until TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'subscriptions' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE subscriptions ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT now();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'subscriptions' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE subscriptions ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
  END IF;
END $$;

-- Drop constraint if exists and recreate
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_is_active_check;

-- Add constraint after ensuring all columns exist
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

DROP TRIGGER IF EXISTS subscriptions_updated_at_trigger ON subscriptions;
CREATE TRIGGER subscriptions_updated_at_trigger
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_subscriptions_updated_at();

-- Notify PostgREST to reload schema cache
SELECT pg_notify('pgrst', 'reload schema');
