-- Update subscription system for trial + autopayment flow
-- 1. Add paid_until field
ALTER TABLE users
ADD COLUMN IF NOT EXISTS paid_until TIMESTAMPTZ;

-- 2. Update subscription_status enum to include 'payment_failed' and 'none'
-- First, drop the constraint
ALTER TABLE users
DROP CONSTRAINT IF EXISTS users_subscription_status_check;

-- Add new constraint with all statuses
ALTER TABLE users
ADD CONSTRAINT users_subscription_status_check 
CHECK (subscription_status IN ('none', 'trial', 'active', 'expired', 'payment_failed'));

-- 3. Update default status to 'none' (was 'trial')
ALTER TABLE users
ALTER COLUMN subscription_status SET DEFAULT 'none';

-- 4. Create index for recurring billing queries
CREATE INDEX IF NOT EXISTS idx_users_trial_expired 
ON users(subscription_status, trial_end_at) 
WHERE subscription_status = 'trial' AND trial_end_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_active_expired 
ON users(subscription_status, paid_until) 
WHERE subscription_status = 'active' AND paid_until IS NOT NULL;
