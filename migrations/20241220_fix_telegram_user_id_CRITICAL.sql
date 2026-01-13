-- CRITICAL FIX: Convert telegram_user_id from INTEGER to TEXT
-- This fixes error: 22P02: invalid input syntax for type integer: "web:253"
-- Execute this in Supabase SQL Editor IMMEDIATELY

-- ============================================================================
-- Convert telegram_user_id to TEXT (preserves existing data)
-- ============================================================================

-- Step 1: Drop index if exists
DROP INDEX IF EXISTS idx_payments_telegram_user_id;

-- Step 2: Convert column type from INTEGER/BIGINT to TEXT
-- This preserves all existing data by converting numbers to strings
ALTER TABLE payments 
ALTER COLUMN telegram_user_id 
TYPE TEXT 
USING CASE 
  WHEN telegram_user_id IS NULL THEN 'unknown'
  ELSE telegram_user_id::TEXT
END;

-- Step 3: Ensure NOT NULL constraint
ALTER TABLE payments 
ALTER COLUMN telegram_user_id 
SET NOT NULL;

-- Step 4: Set default for future inserts
ALTER TABLE payments 
ALTER COLUMN telegram_user_id 
SET DEFAULT '';

-- Step 5: Recreate index
CREATE INDEX IF NOT EXISTS idx_payments_telegram_user_id 
ON payments(telegram_user_id);

-- ============================================================================
-- CRITICAL: Reload PostgREST schema cache
-- ============================================================================

SELECT pg_notify('pgrst', 'reload schema');

-- ============================================================================
-- Verification (run this to confirm)
-- ============================================================================

-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns 
-- WHERE table_name = 'payments' 
-- AND column_name = 'telegram_user_id';
-- 
-- Expected: data_type = 'text', is_nullable = 'NO'
