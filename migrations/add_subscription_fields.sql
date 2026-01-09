-- Migration: Add subscription fields to users table
-- Execute in Supabase SQL Editor

-- Add subscription fields if they don't exist
ALTER TABLE users
ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT NULL;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS trial_end_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS subscription_end_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS robokassa_parent_invoice_id TEXT DEFAULT NULL;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS last_payment_at TIMESTAMPTZ DEFAULT NULL;

-- IMPORTANT: Clean up any existing invalid subscription_status values
-- Set any invalid values to NULL before adding constraint
UPDATE users
SET subscription_status = NULL
WHERE subscription_status IS NOT NULL 
  AND subscription_status NOT IN ('trial', 'active', 'expired');

-- Drop existing constraint if it exists (in case of re-running migration)
ALTER TABLE users
DROP CONSTRAINT IF EXISTS users_subscription_status_check;

-- Add check constraint for subscription_status
ALTER TABLE users
ADD CONSTRAINT users_subscription_status_check 
CHECK (subscription_status IS NULL OR subscription_status IN ('trial', 'active', 'expired'));

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_users_subscription_status 
ON users(subscription_status) 
WHERE subscription_status = 'trial';

CREATE INDEX IF NOT EXISTS idx_users_trial_end_at 
ON users(trial_end_at) 
WHERE subscription_status = 'trial';

-- Comments for documentation
COMMENT ON COLUMN users.subscription_status IS 'Subscription status: trial | active | expired';
COMMENT ON COLUMN users.trial_end_at IS 'End date of trial period';
COMMENT ON COLUMN users.subscription_end_at IS 'End date of active subscription';
COMMENT ON COLUMN users.robokassa_parent_invoice_id IS 'Parent invoice ID from Robokassa for recurring payments';
COMMENT ON COLUMN users.last_payment_at IS 'Last successful payment timestamp';
