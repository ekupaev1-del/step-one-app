-- Remove subscription-related columns and constraints from users table
-- This migration is idempotent and safe to run multiple times
-- Execute in Supabase SQL Editor

-- ============================================================================
-- Step 1: Check for subscription_status column and constraints
-- ============================================================================

-- First, let's see what subscription-related constraints exist
-- Run this query to inspect:
-- SELECT conname, pg_get_constraintdef(c.oid)
-- FROM pg_constraint c
-- JOIN pg_class t ON c.conrelid = t.oid
-- WHERE t.relname = 'users' AND conname LIKE '%subscription%';

-- ============================================================================
-- Step 2: Drop subscription-related constraints
-- ============================================================================

-- Drop CHECK constraints related to subscription
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

-- Drop NOT NULL constraints (if any) - we'll handle columns separately
-- Note: We can't directly drop NOT NULL on subscription columns without dropping the column

-- ============================================================================
-- Step 3: Drop subscription-related columns
-- ============================================================================

-- Drop subscription_status column if it exists
ALTER TABLE users DROP COLUMN IF EXISTS subscription_status;

-- Drop other potential subscription-related columns
ALTER TABLE users DROP COLUMN IF EXISTS subscription_active;
ALTER TABLE users DROP COLUMN IF EXISTS subscription_plan;
ALTER TABLE users DROP COLUMN IF EXISTS subscription_expires_at;
ALTER TABLE users DROP COLUMN IF EXISTS subscription_created_at;
ALTER TABLE users DROP COLUMN IF EXISTS subscription_updated_at;

-- ============================================================================
-- Step 4: Drop indexes related to subscription columns (if any)
-- ============================================================================

DROP INDEX IF EXISTS idx_users_subscription_status;
DROP INDEX IF EXISTS idx_users_subscription_active;
DROP INDEX IF EXISTS idx_users_subscription_plan;

-- ============================================================================
-- Step 5: Verify cleanup
-- ============================================================================

-- Run this query to verify no subscription-related constraints remain:
-- SELECT conname, pg_get_constraintdef(c.oid)
-- FROM pg_constraint c
-- JOIN pg_class t ON c.conrelid = t.oid
-- WHERE t.relname = 'users' AND conname LIKE '%subscription%';

-- Run this query to verify no subscription-related columns remain:
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'users' AND column_name LIKE '%subscription%';

-- ============================================================================
-- Step 6: Reload PostgREST schema cache
-- ============================================================================

SELECT pg_notify('pgrst', 'reload schema');
