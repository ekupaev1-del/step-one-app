-- Fix telegram_user_id Type Migration
-- CRITICAL: Converts telegram_user_id from INTEGER/BIGINT to TEXT
-- Execute this in Supabase SQL Editor
-- Idempotent - safe to run multiple times

-- ============================================================================
-- Step 1: Convert telegram_user_id to TEXT if it's INTEGER or BIGINT
-- ============================================================================

DO $$ 
BEGIN
  -- Check if telegram_user_id exists and is numeric type
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payments' 
    AND column_name = 'telegram_user_id' 
    AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    -- Drop index if exists (will recreate after conversion)
    DROP INDEX IF EXISTS idx_payments_telegram_user_id;
    
    -- Convert existing numeric values to text
    -- Preserve existing data by converting to string
    ALTER TABLE payments 
    ALTER COLUMN telegram_user_id 
    TYPE TEXT 
    USING CASE 
      WHEN telegram_user_id IS NULL THEN 'unknown'
      ELSE telegram_user_id::TEXT
    END;
    
    -- Ensure NOT NULL constraint
    ALTER TABLE payments 
    ALTER COLUMN telegram_user_id 
    SET NOT NULL;
    
    -- Set default for future inserts
    ALTER TABLE payments 
    ALTER COLUMN telegram_user_id 
    SET DEFAULT '';
    
    -- Recreate index
    CREATE INDEX IF NOT EXISTS idx_payments_telegram_user_id 
    ON payments(telegram_user_id);
    
    RAISE NOTICE 'telegram_user_id converted from numeric to TEXT';
  ELSE
    -- Column doesn't exist or is already TEXT
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'payments' 
      AND column_name = 'telegram_user_id'
    ) THEN
      -- Add column if missing
      ALTER TABLE payments 
      ADD COLUMN telegram_user_id TEXT NOT NULL DEFAULT '';
      
      CREATE INDEX IF NOT EXISTS idx_payments_telegram_user_id 
      ON payments(telegram_user_id);
      
      RAISE NOTICE 'telegram_user_id column added as TEXT';
    ELSE
      RAISE NOTICE 'telegram_user_id is already TEXT, no conversion needed';
    END IF;
  END IF;
END $$;

-- ============================================================================
-- Step 2: Verify column type
-- ============================================================================

-- Uncomment to verify:
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns 
-- WHERE table_name = 'payments' 
-- AND column_name = 'telegram_user_id';

-- Expected result: data_type = 'text', is_nullable = 'NO'

-- ============================================================================
-- Step 3: CRITICAL - Reload PostgREST schema cache
-- ============================================================================

SELECT pg_notify('pgrst', 'reload schema');

-- ============================================================================
-- Step 4: Optional - Add numeric Telegram ID column for future use
-- ============================================================================

-- If you need to store numeric Telegram IDs separately in the future:
-- ALTER TABLE payments 
-- ADD COLUMN IF NOT EXISTS telegram_user_id_num BIGINT NULL;

-- CREATE INDEX IF NOT EXISTS idx_payments_telegram_user_id_num 
-- ON payments(telegram_user_id_num) 
-- WHERE telegram_user_id_num IS NOT NULL;
