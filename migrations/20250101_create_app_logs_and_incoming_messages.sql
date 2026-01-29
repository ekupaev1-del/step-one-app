-- Migration: Create app_logs and incoming_messages tables for robust logging
-- Date: 2025-01-01
-- Description: Creates app_logs table for comprehensive application logging and incoming_messages table for tracking all Telegram messages
-- Idempotent - safe to run multiple times
--
-- REQUIRED ENV VARS ON VERCEL:
-- - NEXT_PUBLIC_SUPABASE_URL: Your Supabase project URL
-- - SUPABASE_SERVICE_ROLE_KEY: Service role key from Supabase (Settings → API → service_role key)

-- ============================================================================
-- Step 1: Create app_logs table for comprehensive logging
-- ============================================================================

CREATE TABLE IF NOT EXISTS app_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  level TEXT NOT NULL CHECK (level IN ('info', 'warn', 'error')),
  source TEXT NOT NULL,
  request_id TEXT,
  telegram_user_id TEXT,
  chat_id TEXT,
  payload JSONB,
  error_message TEXT,
  error_stack TEXT
);

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_app_logs_created_at ON app_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_logs_level ON app_logs(level);
CREATE INDEX IF NOT EXISTS idx_app_logs_source ON app_logs(source);
CREATE INDEX IF NOT EXISTS idx_app_logs_request_id ON app_logs(request_id) WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_app_logs_telegram_user_id ON app_logs(telegram_user_id) WHERE telegram_user_id IS NOT NULL;

-- ============================================================================
-- Step 2: Create incoming_messages table for tracking all Telegram messages
-- ============================================================================

CREATE TABLE IF NOT EXISTS incoming_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  telegram_user_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  text TEXT,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processed', 'failed')),
  error TEXT,
  request_id TEXT,
  message_id BIGINT,
  update_payload JSONB
);

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_incoming_messages_created_at ON incoming_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incoming_messages_telegram_user_id ON incoming_messages(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_incoming_messages_status ON incoming_messages(status);
CREATE INDEX IF NOT EXISTS idx_incoming_messages_request_id ON incoming_messages(request_id) WHERE request_id IS NOT NULL;

-- ============================================================================
-- Step 3: RLS Policies for app_logs table (service role only)
-- ============================================================================

-- Enable RLS on app_logs
ALTER TABLE app_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS app_logs_insert_service ON app_logs;
DROP POLICY IF EXISTS app_logs_select_service ON app_logs;

-- Only service role can read/write logs (for security)
CREATE POLICY app_logs_insert_service ON app_logs
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY app_logs_select_service ON app_logs
  FOR SELECT
  USING (auth.role() = 'service_role');

-- ============================================================================
-- Step 4: RLS Policies for incoming_messages table (service role only)
-- ============================================================================

-- Enable RLS on incoming_messages
ALTER TABLE incoming_messages ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS incoming_messages_insert_service ON incoming_messages;
DROP POLICY IF EXISTS incoming_messages_select_service ON incoming_messages;
DROP POLICY IF EXISTS incoming_messages_update_service ON incoming_messages;

-- Only service role can read/write/update messages (for security)
CREATE POLICY incoming_messages_insert_service ON incoming_messages
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY incoming_messages_select_service ON incoming_messages
  FOR SELECT
  USING (auth.role() = 'service_role');

CREATE POLICY incoming_messages_update_service ON incoming_messages
  FOR UPDATE
  USING (auth.role() = 'service_role');

-- ============================================================================
-- Step 5: Comments for documentation
-- ============================================================================

COMMENT ON TABLE app_logs IS 'Comprehensive application logs for observability and debugging';
COMMENT ON TABLE incoming_messages IS 'Tracks all incoming Telegram messages for audit and debugging';
COMMENT ON COLUMN app_logs.level IS 'Log level: info, warn, or error';
COMMENT ON COLUMN app_logs.source IS 'Source of the log entry (e.g., telegram_webhook, food_analysis, db_insert)';
COMMENT ON COLUMN app_logs.request_id IS 'Unique request identifier for tracing';
COMMENT ON COLUMN incoming_messages.status IS 'Message processing status: received, processed, or failed';

-- ============================================================================
-- Step 6: Reload PostgREST schema cache
-- ============================================================================

SELECT pg_notify('pgrst', 'reload schema');
