-- Migration: Fix diary.user_id type mismatch and create app_logs table
-- Date: 2025-01-02
-- Description: 
--   1. Fixes diary.user_id if it's UUID (convert to BIGINT to match users.id)
--   2. Creates app_logs table with BIGINT user_id (consistent with project strategy)
--   3. Ensures all user_id columns use BIGINT consistently
-- Idempotent - safe to run multiple times

-- ============================================================================
-- Step 1: Drop all RLS policies that depend on diary.user_id
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'diary') THEN
    -- Drop all existing policies on diary table (they will be recreated later)
    DROP POLICY IF EXISTS "Users can view own diary" ON public.diary;
    DROP POLICY IF EXISTS "Users can insert own diary" ON public.diary;
    DROP POLICY IF EXISTS "Users can update own diary" ON public.diary;
    DROP POLICY IF EXISTS "Users can delete own diary" ON public.diary;
    DROP POLICY IF EXISTS diary_select_own ON public.diary;
    DROP POLICY IF EXISTS diary_insert_service ON public.diary;
    DROP POLICY IF EXISTS diary_update_service ON public.diary;
    DROP POLICY IF EXISTS diary_delete_service ON public.diary;
    DROP POLICY IF EXISTS diary_select_service ON public.diary;
    
    RAISE NOTICE 'Dropped all existing RLS policies on diary table';
  END IF;
END $$;

-- ============================================================================
-- Step 2: Check and fix diary.user_id type (UUID -> BIGINT if needed)
-- ============================================================================

DO $$
DECLARE
  current_type TEXT;
BEGIN
  -- Check if diary table exists
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'diary') THEN
    -- Get current type of user_id column
    SELECT data_type INTO current_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'diary'
      AND column_name = 'user_id';

    -- If user_id is UUID, we need to convert it
    IF current_type = 'uuid' THEN
      RAISE NOTICE 'Found diary.user_id as UUID, converting to BIGINT...';
      
      -- Step 1: Add temporary column with BIGINT
      ALTER TABLE diary ADD COLUMN IF NOT EXISTS user_id_bigint BIGINT;
      
      -- Step 2: Try to map UUID to BIGINT user_id from users table
      -- This assumes users.id is BIGINT and we can find matching records
      UPDATE diary d
      SET user_id_bigint = COALESCE(
        (SELECT u.id FROM users u WHERE u.id::text = d.user_id::text LIMIT 1),
        0
      )
      WHERE user_id_bigint IS NULL;
      
      -- Step 3: For rows that couldn't be mapped, set to 0
      UPDATE diary
      SET user_id_bigint = 0
      WHERE user_id_bigint IS NULL;
      
      -- Step 4: Make user_id_bigint NOT NULL with default
      ALTER TABLE diary ALTER COLUMN user_id_bigint SET NOT NULL;
      ALTER TABLE diary ALTER COLUMN user_id_bigint SET DEFAULT 0;
      
      -- Step 5: Drop old UUID column (now safe since policies are dropped)
      ALTER TABLE diary DROP COLUMN user_id CASCADE;
      
      -- Step 6: Rename new column to user_id
      ALTER TABLE diary RENAME COLUMN user_id_bigint TO user_id;
      
      RAISE NOTICE 'Successfully converted diary.user_id from UUID to BIGINT';
    ELSIF current_type IS NULL THEN
      -- Column doesn't exist, create it
      ALTER TABLE diary ADD COLUMN user_id BIGINT NOT NULL DEFAULT 0;
      RAISE NOTICE 'Created diary.user_id as BIGINT';
    ELSIF current_type = 'bigint' THEN
      RAISE NOTICE 'diary.user_id is already BIGINT, no change needed';
    ELSE
      RAISE NOTICE 'diary.user_id has unexpected type: %, leaving as is', current_type;
    END IF;
  ELSE
    RAISE NOTICE 'diary table does not exist, skipping user_id fix';
  END IF;
END $$;

-- ============================================================================
-- Step 2: Ensure diary table has all required columns with correct types
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'diary') THEN
    -- Add telegram_user_id if missing
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'diary' AND column_name = 'telegram_user_id'
    ) THEN
      ALTER TABLE diary ADD COLUMN telegram_user_id BIGINT;
      CREATE INDEX IF NOT EXISTS idx_diary_telegram_user_id ON diary(telegram_user_id) WHERE telegram_user_id IS NOT NULL;
    END IF;

    -- Ensure user_id is BIGINT (double-check after conversion)
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'diary' AND column_name = 'user_id'
      AND data_type != 'bigint'
    ) THEN
      -- Force conversion if still wrong type
      ALTER TABLE diary ALTER COLUMN user_id TYPE BIGINT USING user_id::text::bigint;
    END IF;

    -- Ensure user_id is NOT NULL with default
    ALTER TABLE diary ALTER COLUMN user_id SET NOT NULL;
    ALTER TABLE diary ALTER COLUMN user_id SET DEFAULT 0;
  END IF;
END $$;

-- ============================================================================
-- Step 3: Create app_logs table with BIGINT user_id (consistent strategy)
-- ============================================================================

-- Drop existing app_logs if it has wrong schema (UUID id or UUID user_id)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'app_logs') THEN
    -- Check if it has UUID id or user_id
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' 
        AND table_name = 'app_logs'
        AND (column_name = 'id' AND data_type = 'uuid')
    ) OR EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'app_logs'
        AND column_name = 'user_id' AND data_type = 'uuid'
    ) THEN
      DROP TABLE IF EXISTS public.app_logs CASCADE;
      RAISE NOTICE 'Dropped existing app_logs table with UUID columns';
    END IF;
  END IF;
END $$;

-- Create app_logs table with BIGSERIAL id and BIGINT user_id
CREATE TABLE IF NOT EXISTS public.app_logs (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  level TEXT NOT NULL CHECK (level IN ('info', 'warn', 'error')),
  source TEXT NOT NULL,
  request_id TEXT,
  user_id BIGINT,
  telegram_user_id BIGINT,
  message TEXT,
  meta JSONB DEFAULT '{}'::jsonb
);

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_app_logs_created_at ON public.app_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_logs_level ON public.app_logs(level);
CREATE INDEX IF NOT EXISTS idx_app_logs_source ON public.app_logs(source);
CREATE INDEX IF NOT EXISTS idx_app_logs_request_id ON public.app_logs(request_id) WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_app_logs_user_id ON public.app_logs(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_app_logs_telegram_user_id ON public.app_logs(telegram_user_id) WHERE telegram_user_id IS NOT NULL;

-- ============================================================================
-- Step 4: RLS Policies for app_logs (service role only)
-- ============================================================================

ALTER TABLE public.app_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS app_logs_insert_service ON public.app_logs;
DROP POLICY IF EXISTS app_logs_select_service ON public.app_logs;

-- Only service role can read/write logs
CREATE POLICY app_logs_insert_service ON public.app_logs
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY app_logs_select_service ON public.app_logs
  FOR SELECT
  USING (auth.role() = 'service_role');

-- ============================================================================
-- Step 5: Recreate diary RLS policies (after column conversion)
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'diary') THEN
    ALTER TABLE public.diary ENABLE ROW LEVEL SECURITY;
    
    -- Service role can do everything (CRITICAL for bot writes)
    CREATE POLICY diary_insert_service ON public.diary
      FOR INSERT
      WITH CHECK (auth.role() = 'service_role');
    
    CREATE POLICY diary_update_service ON public.diary
      FOR UPDATE
      USING (auth.role() = 'service_role');
    
    CREATE POLICY diary_delete_service ON public.diary
      FOR DELETE
      USING (auth.role() = 'service_role');
    
    -- Users can read their own diary entries (by user_id as BIGINT)
    CREATE POLICY diary_select_own ON public.diary
      FOR SELECT
      USING (
        auth.role() = 'service_role' OR 
        (auth.uid() IS NOT NULL AND user_id::text = auth.uid()::text)
      );
    
    RAISE NOTICE 'Recreated RLS policies on diary table';
  END IF;
END $$;

-- ============================================================================
-- Step 6: Comments for documentation
-- ============================================================================

COMMENT ON TABLE public.app_logs IS 'Application logs for debugging and observability. Uses BIGINT user_id to match project strategy.';
COMMENT ON COLUMN public.app_logs.user_id IS 'Internal user ID (BIGINT from users table)';
COMMENT ON COLUMN public.app_logs.telegram_user_id IS 'Telegram user ID (BIGINT)';
COMMENT ON TABLE public.diary IS 'Food diary entries. Uses BIGINT user_id to reference users.id';

-- ============================================================================
-- Step 7: Reload PostgREST schema cache
-- ============================================================================

SELECT pg_notify('pgrst', 'reload schema');
