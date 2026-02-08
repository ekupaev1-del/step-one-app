-- ============================================================================
-- FIX: users_calories_check constraint to allow 0
-- ============================================================================
-- This migration fixes the constraint that was preventing calories = 0
-- The old constraint was CHECK (calories > 0), new is CHECK (calories >= 0)
-- ============================================================================

-- Drop existing constraint if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conrelid = 'public.users'::regclass 
    AND conname = 'users_calories_check'
  ) THEN
    ALTER TABLE users DROP CONSTRAINT users_calories_check;
    RAISE NOTICE 'Dropped old users_calories_check constraint';
  END IF;
END $$;

-- Add correct constraint (allows 0)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conrelid = 'public.users'::regclass 
    AND conname = 'users_calories_check'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_calories_check CHECK (calories >= 0);
    RAISE NOTICE 'Added users_calories_check constraint (calories >= 0)';
  END IF;
END $$;

-- Ensure DEFAULT 0 exists
ALTER TABLE users ALTER COLUMN calories SET DEFAULT 0;

-- Update existing NULL values to 0 (optional)
UPDATE users SET calories = 0 WHERE calories IS NULL;

-- Reload schema cache
SELECT pg_notify('pgrst', 'reload schema');
