-- Migration: Fix diary source constraint and add channel column
-- Date: 2025-01-02
-- Description: 
--   1. Adds diary.channel column to track communication channel (telegram, webapp, etc)
--   2. Updates diary.source CHECK constraint to allow 'text', 'photo', 'audio' (content types)
--   3. Ensures app_logs table exists with correct schema (including chat_id)
-- Idempotent - safe to run multiple times

-- ============================================================================
-- Step 1: Add channel column to diary table
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'diary') THEN
    -- Add channel column if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'diary' 
        AND column_name = 'channel'
    ) THEN
      ALTER TABLE public.diary 
        ADD COLUMN channel TEXT DEFAULT 'telegram';
      
      CREATE INDEX IF NOT EXISTS idx_diary_channel ON public.diary(channel) WHERE channel IS NOT NULL;
      
      RAISE NOTICE 'Added channel column to diary table';
    END IF;
  END IF;
END $$;

-- ============================================================================
-- Step 2: Fix diary.source CHECK constraint (text, photo, audio)
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'diary') THEN
    -- Drop existing constraint if it exists
    ALTER TABLE public.diary DROP CONSTRAINT IF EXISTS diary_source_check;
    
    -- Recreate constraint with allowed values: text, photo, audio
    ALTER TABLE public.diary 
      ADD CONSTRAINT diary_source_check 
      CHECK (source IN ('text', 'photo', 'audio'));
    
    RAISE NOTICE 'Updated diary.source CHECK constraint to allow: text, photo, audio';
  END IF;
END $$;

-- ============================================================================
-- Step 3: Ensure app_logs table exists with correct schema (including chat_id)
-- ============================================================================

-- Drop existing app_logs if it has wrong schema (UUID id or UUID user_id)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'app_logs') THEN
    -- Check if it has UUID id or user_id (should be BIGINT/BIGSERIAL)
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

-- Create app_logs table with correct schema (including chat_id as TEXT)
CREATE TABLE IF NOT EXISTS public.app_logs (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  level TEXT NOT NULL CHECK (level IN ('info', 'warn', 'error')),
  source TEXT NOT NULL,
  request_id TEXT,
  user_id BIGINT,
  telegram_user_id BIGINT,
  chat_id TEXT, -- TEXT to match code expectations
  message TEXT,
  payload JSONB DEFAULT '{}'::jsonb
);

-- Add missing columns if they don't exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'app_logs') THEN
    -- Add chat_id column if missing
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'app_logs' AND column_name = 'chat_id'
    ) THEN
      ALTER TABLE public.app_logs ADD COLUMN chat_id TEXT;
    END IF;
    
    -- Add message column if missing
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'app_logs' AND column_name = 'message'
    ) THEN
      ALTER TABLE public.app_logs ADD COLUMN message TEXT;
    END IF;
    
    -- Add payload column if missing (or rename meta to payload if meta exists)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'app_logs' AND column_name = 'payload'
    ) THEN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'app_logs' AND column_name = 'meta'
      ) THEN
        -- Rename meta to payload
        ALTER TABLE public.app_logs RENAME COLUMN meta TO payload;
      ELSE
        ALTER TABLE public.app_logs ADD COLUMN payload JSONB DEFAULT '{}'::jsonb;
      END IF;
    END IF;
  END IF;
END $$;

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
-- Step 5: Comments for documentation
-- ============================================================================

COMMENT ON TABLE public.app_logs IS 'Application logs for debugging and observability. Uses BIGINT user_id to match project strategy.';
COMMENT ON COLUMN public.app_logs.user_id IS 'Internal user ID (BIGINT from users table)';
COMMENT ON COLUMN public.app_logs.telegram_user_id IS 'Telegram user ID (BIGINT)';
COMMENT ON COLUMN public.app_logs.chat_id IS 'Telegram chat ID (TEXT)';
COMMENT ON COLUMN public.app_logs.message IS 'Error message or log message';
COMMENT ON COLUMN public.app_logs.payload IS 'Additional metadata as JSONB';
COMMENT ON TABLE public.diary IS 'Food diary entries. Uses BIGINT user_id to reference users.id';
COMMENT ON COLUMN public.diary.source IS 'Content type: text, photo, or audio';
COMMENT ON COLUMN public.diary.channel IS 'Communication channel: telegram, webapp, admin, or api';

-- ============================================================================
-- Step 6: Reload PostgREST schema cache
-- ============================================================================

SELECT pg_notify('pgrst', 'reload schema');
