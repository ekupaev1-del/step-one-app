-- Fix out_sum Column Migration
-- CRITICAL: Removes NOT NULL constraint from legacy out_sum column
-- App uses 'amount' as canonical, out_sum is legacy
-- Execute this in Supabase SQL Editor
-- Idempotent - safe to run multiple times

-- ============================================================================
-- Step 1: Handle legacy out_sum column
-- ============================================================================

DO $$ 
BEGIN
  -- Check if out_sum column exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payments' 
    AND column_name = 'out_sum'
  ) THEN
    -- Option A: Drop NOT NULL constraint (preferred - keeps data)
    -- This allows out_sum to be NULL, app will use 'amount' instead
    BEGIN
      ALTER TABLE payments 
      ALTER COLUMN out_sum 
      DROP NOT NULL;
      
      RAISE NOTICE 'Dropped NOT NULL constraint from out_sum column';
    EXCEPTION WHEN OTHERS THEN
      -- If constraint doesn't exist, that's fine
      RAISE NOTICE 'out_sum NOT NULL constraint already removed or does not exist';
    END;
    
    -- Optional: Backfill out_sum from amount for existing rows
    UPDATE payments 
    SET out_sum = amount::numeric 
    WHERE out_sum IS NULL 
    AND amount IS NOT NULL;
    
    RAISE NOTICE 'Backfilled out_sum from amount for existing rows';
  ELSE
    RAISE NOTICE 'out_sum column does not exist, no action needed';
  END IF;
END $$;

-- ============================================================================
-- Step 2: Ensure amount column exists and is NOT NULL
-- ============================================================================

DO $$ 
BEGIN
  -- Add amount column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payments' 
    AND column_name = 'amount'
  ) THEN
    ALTER TABLE payments 
    ADD COLUMN amount NUMERIC(12, 2) NOT NULL DEFAULT 0;
    
    -- If out_sum exists, copy values
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'payments' 
      AND column_name = 'out_sum'
    ) THEN
      UPDATE payments 
      SET amount = out_sum::numeric 
      WHERE amount = 0 
      AND out_sum IS NOT NULL;
    END IF;
    
    RAISE NOTICE 'Added amount column and backfilled from out_sum';
  ELSE
    -- Ensure amount is NOT NULL
    BEGIN
      ALTER TABLE payments 
      ALTER COLUMN amount 
      SET NOT NULL;
      
      RAISE NOTICE 'Ensured amount column is NOT NULL';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'amount column already NOT NULL';
    END;
    
    -- Ensure amount type is numeric
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'payments' 
      AND column_name = 'amount' 
      AND data_type NOT IN ('numeric', 'decimal')
    ) THEN
      ALTER TABLE payments 
      ALTER COLUMN amount 
      TYPE NUMERIC(12, 2) 
      USING amount::numeric;
      
      RAISE NOTICE 'Converted amount column to NUMERIC(12, 2)';
    END IF;
  END IF;
END $$;

-- ============================================================================
-- Step 3: Add amount check constraint if missing
-- ============================================================================

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_amount_check;
ALTER TABLE payments ADD CONSTRAINT payments_amount_check 
  CHECK (amount > 0);

-- ============================================================================
-- Step 4: CRITICAL - Reload PostgREST schema cache
-- ============================================================================

SELECT pg_notify('pgrst', 'reload schema');

-- ============================================================================
-- Verification (run this to confirm)
-- ============================================================================

-- Check out_sum constraint
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns 
-- WHERE table_name = 'payments' 
-- AND column_name IN ('out_sum', 'amount')
-- ORDER BY column_name;
-- 
-- Expected:
-- - amount: data_type = 'numeric', is_nullable = 'NO'
-- - out_sum: data_type = 'numeric' (if exists), is_nullable = 'YES' (nullable)
