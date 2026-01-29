-- Migration: Create app_errors table and ensure diary table works correctly
-- Date: 2025-01-01
-- Description: Creates app_errors table for error logging and ensures diary table has correct schema and RLS policies
-- Idempotent - safe to run multiple times
--
-- REQUIRED ENV VARS ON VERCEL:
-- - NEXT_PUBLIC_SUPABASE_URL: Your Supabase project URL (e.g., https://xxxxx.supabase.co)
-- - SUPABASE_SERVICE_ROLE_KEY: Service role key from Supabase (Settings → API → service_role key)
--
-- To get these values:
-- 1. Open Supabase Dashboard: https://supabase.com/dashboard
-- 2. Select your project
-- 3. Go to Settings → API
-- 4. Copy "Project URL" → NEXT_PUBLIC_SUPABASE_URL
-- 5. Copy "service_role" key → SUPABASE_SERVICE_ROLE_KEY (⚠️ SECRET - never expose to client!)
--
-- After adding env vars in Vercel:
-- 1. Redeploy the application
-- 2. Verify in Vercel logs that no "missing environment variable" errors appear

-- ============================================================================
-- Step 1: Create app_errors table for error logging
-- ============================================================================

CREATE TABLE IF NOT EXISTS app_errors (
  id BIGSERIAL PRIMARY KEY,
  request_id TEXT NOT NULL,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add index on request_id for quick lookups
CREATE INDEX IF NOT EXISTS idx_app_errors_request_id ON app_errors(request_id);
CREATE INDEX IF NOT EXISTS idx_app_errors_created_at ON app_errors(created_at DESC);

-- ============================================================================
-- Step 2: Ensure diary table has correct schema and columns
-- ============================================================================

-- Check if diary table exists and add missing columns
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'diary') THEN
    -- Add telegram_user_id if missing (for direct telegram_id storage if needed)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'diary' AND column_name = 'telegram_user_id'
    ) THEN
      ALTER TABLE diary ADD COLUMN telegram_user_id BIGINT;
      -- Create index for telegram_user_id
      CREATE INDEX IF NOT EXISTS idx_diary_telegram_user_id ON diary(telegram_user_id) WHERE telegram_user_id IS NOT NULL;
    END IF;

    -- Add source column if missing
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'diary' AND column_name = 'source'
    ) THEN
      ALTER TABLE diary ADD COLUMN source TEXT DEFAULT 'telegram';
    END IF;

    -- Add message_id if missing
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'diary' AND column_name = 'message_id'
    ) THEN
      ALTER TABLE diary ADD COLUMN message_id BIGINT;
    END IF;

    -- Add chat_id if missing
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'diary' AND column_name = 'chat_id'
    ) THEN
      ALTER TABLE diary ADD COLUMN chat_id BIGINT;
    END IF;

    -- Add parsed_json if missing (for storing OpenAI analysis result)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'diary' AND column_name = 'parsed_json'
    ) THEN
      ALTER TABLE diary ADD COLUMN parsed_json JSONB;
    END IF;

    -- Ensure user_id exists (should already exist, but check)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'diary' AND column_name = 'user_id'
    ) THEN
      ALTER TABLE diary ADD COLUMN user_id BIGINT NOT NULL DEFAULT 0;
    END IF;

    -- Ensure meal_text exists
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'diary' AND column_name = 'meal_text'
    ) THEN
      ALTER TABLE diary ADD COLUMN meal_text TEXT NOT NULL DEFAULT '';
    END IF;

    -- Ensure calories exists
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'diary' AND column_name = 'calories'
    ) THEN
      ALTER TABLE diary ADD COLUMN calories NUMERIC(10, 2) NOT NULL DEFAULT 0;
    END IF;

    -- Ensure protein exists
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'diary' AND column_name = 'protein'
    ) THEN
      ALTER TABLE diary ADD COLUMN protein NUMERIC(10, 2) NOT NULL DEFAULT 0;
    END IF;

    -- Ensure fat exists
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'diary' AND column_name = 'fat'
    ) THEN
      ALTER TABLE diary ADD COLUMN fat NUMERIC(10, 2) NOT NULL DEFAULT 0;
    END IF;

    -- Ensure carbs exists
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'diary' AND column_name = 'carbs'
    ) THEN
      ALTER TABLE diary ADD COLUMN carbs NUMERIC(10, 2) NOT NULL DEFAULT 0;
    END IF;

    -- Ensure created_at exists
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'diary' AND column_name = 'created_at'
    ) THEN
      ALTER TABLE diary ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    END IF;
  END IF;
END $$;

-- Add/update indexes for diary table
CREATE INDEX IF NOT EXISTS idx_diary_user_id_created_at ON diary(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_diary_created_at ON diary(created_at DESC);

-- ============================================================================
-- Step 3: RLS Policies for diary table (ensure service role can write)
-- ============================================================================

-- Enable RLS on diary if not already enabled
ALTER TABLE diary ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (to recreate them correctly)
DROP POLICY IF EXISTS diary_select_own ON diary;
DROP POLICY IF EXISTS diary_insert_service ON diary;
DROP POLICY IF EXISTS diary_update_service ON diary;
DROP POLICY IF EXISTS diary_delete_service ON diary;

-- Service role can do everything (CRITICAL for bot writes)
CREATE POLICY diary_insert_service ON diary
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY diary_update_service ON diary
  FOR UPDATE
  USING (auth.role() = 'service_role');

CREATE POLICY diary_delete_service ON diary
  FOR DELETE
  USING (auth.role() = 'service_role');

-- Users can read their own diary entries (by user_id)
CREATE POLICY diary_select_own ON diary
  FOR SELECT
  USING (
    auth.uid()::text = user_id::text OR 
    auth.role() = 'service_role'
  );

-- ============================================================================
-- Step 4: RLS Policies for app_errors table (service role only)
-- ============================================================================

-- Enable RLS on app_errors
ALTER TABLE app_errors ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS app_errors_select_service ON app_errors;
DROP POLICY IF EXISTS app_errors_insert_service ON app_errors;

-- Only service role can read/write errors (for security)
CREATE POLICY app_errors_insert_service ON app_errors
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY app_errors_select_service ON app_errors
  FOR SELECT
  USING (auth.role() = 'service_role');

-- ============================================================================
-- Step 5: Comments for documentation
-- ============================================================================

COMMENT ON TABLE app_errors IS 'Application error logs for debugging and observability';
COMMENT ON TABLE diary IS 'Food diary entries - stores meals with nutritional information';
COMMENT ON COLUMN diary.user_id IS 'ID from users table (NOT telegram_id directly)';
COMMENT ON COLUMN diary.telegram_user_id IS 'Telegram user ID (for direct lookup if needed)';
COMMENT ON COLUMN diary.source IS 'Source of entry: telegram, miniapp, etc.';
COMMENT ON COLUMN diary.parsed_json IS 'Raw JSON from OpenAI analysis (for debugging)';

-- ============================================================================
-- Step 6: Reload PostgREST schema cache
-- ============================================================================

SELECT pg_notify('pgrst', 'reload schema');
