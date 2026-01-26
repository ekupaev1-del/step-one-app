-- Migration: Fix diary source constraint and app_logs schema
-- Date: 2025-01-02
-- Description: 
--   1. Fixes diary.source CHECK constraint to allow 'telegram' and other channels
--   2. Ensures app_logs table has correct schema (no chat_id column)
--   3. Adds input_kind column to diary for message type tracking
-- Idempotent - safe to run multiple times

-- ============================================================================
-- Step 1: Fix diary.source CHECK constraint
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'diary') THEN
    -- Drop existing constraint if it exists
    ALTER TABLE public.diary DROP CONSTRAINT IF EXISTS diary_source_check;
    
    -- Recreate constraint with allowed values: telegram, webapp, admin, api
    ALTER TABLE public.diary 
      ADD CONSTRAINT diary_source_check 
      CHECK (source IN ('telegram', 'webapp', 'admin', 'api'));
    
    RAISE NOTICE 'Updated diary.source CHECK constraint to allow: telegram, webapp, admin, api';
  END IF;
END $$;

-- ============================================================================
-- Step 2: Add input_kind column to diary (optional, for tracking message type)
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'diary') THEN
    -- Add input_kind column if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'diary' 
        AND column_name = 'input_kind'
    ) THEN
      ALTER TABLE public.diary 
        ADD COLUMN input_kind TEXT 
        CHECK (input_kind IS NULL OR input_kind IN ('text', 'photo', 'voice'));
      
      CREATE INDEX IF NOT EXISTS idx_diary_input_kind ON public.diary(input_kind) WHERE input_kind IS NOT NULL;
      
      RAISE NOTICE 'Added input_kind column to diary table';
    END IF;
  END IF;
END $$;

-- ============================================================================
-- Step 3: Ensure app_logs table exists with correct schema (no chat_id)
-- ============================================================================

-- Drop existing app_logs if it has wrong schema (has chat_id or wrong columns)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'app_logs') THEN
    -- Check if it has chat_id column (which we don't want)
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' 
        AND table_name = 'app_logs'
        AND column_name = 'chat_id'
    ) THEN
      -- Drop the column instead of dropping the whole table
      ALTER TABLE public.app_logs DROP COLUMN IF EXISTS chat_id;
      RAISE NOTICE 'Removed chat_id column from app_logs';
    END IF;
    
    -- Check if it has UUID id or user_id (should be BIGINT)
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

-- Create app_logs table with correct schema (NO chat_id)
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

-- Add missing columns if they don't exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'app_logs') THEN
    -- Add message column if missing
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'app_logs' AND column_name = 'message'
    ) THEN
      ALTER TABLE public.app_logs ADD COLUMN message TEXT;
    END IF;
    
    -- Add meta column if missing
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'app_logs' AND column_name = 'meta'
    ) THEN
      ALTER TABLE public.app_logs ADD COLUMN meta JSONB DEFAULT '{}'::jsonb;
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
COMMENT ON COLUMN public.app_logs.message IS 'Error message or log message';
COMMENT ON COLUMN public.app_logs.meta IS 'Additional metadata as JSONB';
COMMENT ON TABLE public.diary IS 'Food diary entries. Uses BIGINT user_id to reference users.id';
COMMENT ON COLUMN public.diary.source IS 'Source channel: telegram, webapp, admin, or api';
COMMENT ON COLUMN public.diary.input_kind IS 'Input type: text, photo, or voice (optional)';

-- ============================================================================
-- Step 6: Reload PostgREST schema cache
-- ============================================================================

SELECT pg_notify('pgrst', 'reload schema');
