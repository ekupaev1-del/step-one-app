# Robust Logging Implementation - Verification Checklist

## Overview

This document provides a checklist for verifying that the robust logging system is working correctly in production.

## Implementation Summary

### 1. Database Tables Created
- ✅ `app_logs` table - stores all application logs (info, warn, error)
- ✅ `incoming_messages` table - tracks all incoming Telegram messages

### 2. Logging Infrastructure
- ✅ `logEvent()` helper function (server-only, never throws)
- ✅ `logError()` helper for error logging
- ✅ `generateRequestId()` for unique request tracing

### 3. API Routes
- ✅ `/api/telegram/webhook` - Comprehensive webhook handler with full error handling
- ✅ `/api/debug/health` - Protected debug endpoint for health checks

### 4. Bot Updates
- ✅ Bot code updated to use new logging system
- ✅ All critical errors logged with requestId
- ✅ User-friendly error messages include requestId

## Production Verification Checklist

### Step 1: Run Database Migrations

1. **Execute the migration in Supabase SQL Editor:**
   ```sql
   -- Run: migrations/20250101_create_app_logs_and_incoming_messages.sql
   ```

2. **Verify tables exist:**
   ```sql
   SELECT table_name FROM information_schema.tables 
   WHERE table_name IN ('app_logs', 'incoming_messages');
   ```

3. **Verify RLS policies:**
   ```sql
   SELECT tablename, policyname FROM pg_policies 
   WHERE tablename IN ('app_logs', 'incoming_messages');
   ```

### Step 2: Verify Environment Variables

Ensure these are set in Vercel:
- ✅ `NEXT_PUBLIC_SUPABASE_URL`
- ✅ `SUPABASE_SERVICE_ROLE_KEY`
- ✅ `TELEGRAM_BOT_TOKEN`
- ✅ `OPENAI_API_KEY`
- ✅ `DEBUG_SECRET` (for health endpoint)

### Step 3: Test Debug Health Endpoint

1. **Set DEBUG_SECRET in Vercel environment variables** (e.g., a random string)

2. **Call the health endpoint:**
   ```bash
   curl "https://your-app.vercel.app/api/debug/health?secret=YOUR_DEBUG_SECRET"
   ```

3. **Expected response:**
   ```json
   {
     "ok": true,
     "requestId": "req-...",
     "timestamp": "...",
     "environment": {
       "hasSupabaseUrl": true,
       "hasServiceRoleKey": true,
       "hasTelegramBotToken": true,
       "hasOpenaiKey": true,
       "hasDebugSecret": true,
       "deploymentId": "..."
     },
     "supabase": {
       "canInsertLogs": true,
       "error": null
     }
   }
   ```

4. **Verify:**
   - ✅ All environment booleans are `true`
   - ✅ `canInsertLogs` is `true`
   - ✅ No errors in response

### Step 4: Test Telegram Bot Message Flow

1. **Send a text message to the bot** (e.g., "куриная грудка 200г с рисом")

2. **Check `incoming_messages` table:**
   ```sql
   SELECT * FROM incoming_messages 
   ORDER BY created_at DESC 
   LIMIT 1;
   ```
   
   **Expected:**
   - ✅ Row exists with your message
   - ✅ `status` is either 'received', 'processed', or 'failed'
   - ✅ `request_id` is populated
   - ✅ `telegram_user_id` matches your Telegram ID
   - ✅ `text` contains your message

3. **Check `app_logs` table:**
   ```sql
   SELECT level, source, request_id, telegram_user_id, created_at 
   FROM app_logs 
   WHERE telegram_user_id = 'YOUR_TELEGRAM_ID'
   ORDER BY created_at DESC 
   LIMIT 10;
   ```
   
   **Expected log entries:**
   - ✅ `telegram_webhook_received` (info)
   - ✅ `telegram_message_parsed` (info)
   - ✅ `food_analysis_start` (info)
   - ✅ `openai_analysis_start` (info)
   - ✅ `openai_analysis_success` (info) OR `openai_analysis` (error)
   - ✅ `user_resolve_start` (info)
   - ✅ `user_resolve_success` (info) OR `user_resolve` (error)
   - ✅ `db_insert_start` (info)
   - ✅ `db_insert_success` (info) OR `db_insert` (error)
   - ✅ `telegram_send_message_success` (info) OR `telegram_send_message` (error)
   - ✅ `telegram_webhook_success` (info)

4. **Verify bot response:**
   - ✅ Bot responds with food analysis or error message
   - ✅ Error messages include requestId (if any error occurred)

### Step 5: Test Error Scenarios

1. **Test with invalid food description** (e.g., "hello world"):
   - ✅ Bot responds with "Это не про еду" message
   - ✅ `incoming_messages.status` is 'processed'
   - ✅ Logs show `openai_analysis_not_food` entry

2. **Test with database error** (temporarily break DB connection):
   - ✅ Bot responds with error message including requestId
   - ✅ `incoming_messages.status` is 'failed'
   - ✅ `app_logs` contains error entry with full context
   - ✅ Vercel logs show detailed error information

### Step 6: Verify Vercel Logs

1. **Check Vercel Function Logs:**
   - Go to Vercel Dashboard → Your Project → Functions → View Logs
   - Look for recent webhook calls

2. **Expected log entries:**
   - ✅ `[TELEGRAM_WEBHOOK_RECEIVED]` entries
   - ✅ `[FOOD_ANALYSIS_START]` entries
   - ✅ `[DB_INSERT_START]` entries
   - ✅ `[DB_INSERT_SUCCESS]` or `[DB_INSERT_ERROR]` entries
   - ✅ All errors include requestId

3. **Verify error logs:**
   - ✅ Errors include full stack traces
   - ✅ Errors include requestId for tracing
   - ✅ Errors include relevant context (telegram_user_id, chat_id, etc.)

### Step 7: Verify RequestId Flow

1. **Send a message to the bot**

2. **Extract requestId from bot response** (if error occurred) or from logs

3. **Query logs by requestId:**
   ```sql
   SELECT level, source, created_at, payload, error_message 
   FROM app_logs 
   WHERE request_id = 'YOUR_REQUEST_ID'
   ORDER BY created_at ASC;
   ```

4. **Expected:**
   - ✅ Multiple log entries with same requestId
   - ✅ Complete trace of request processing
   - ✅ All critical steps logged

## Troubleshooting

### Issue: `canInsertLogs` is false

**Possible causes:**
1. RLS policies not configured correctly
2. Service role key not set or incorrect
3. Table doesn't exist

**Solution:**
1. Verify `SUPABASE_SERVICE_ROLE_KEY` is set correctly
2. Re-run migration to ensure RLS policies are correct
3. Check Supabase logs for detailed error

### Issue: No logs in `app_logs` table

**Possible causes:**
1. Logging function failing silently
2. RLS blocking inserts
3. Service role key issue

**Solution:**
1. Check Vercel logs for `[logEvent]` errors
2. Verify service role key has correct permissions
3. Test with debug health endpoint

### Issue: `incoming_messages` not being created

**Possible causes:**
1. Webhook not receiving updates
2. Insert failing silently

**Solution:**
1. Verify Telegram webhook is configured correctly
2. Check webhook route is accessible
3. Review Vercel logs for errors

## Monitoring Recommendations

1. **Set up alerts** for:
   - High error rate in `app_logs` (level='error')
   - Failed message processing (`incoming_messages.status='failed'`)
   - Missing logs (no entries for recent messages)

2. **Regular checks:**
   - Review error logs daily
   - Monitor `app_logs` table size
   - Check for patterns in errors

3. **Query examples:**
   ```sql
   -- Recent errors
   SELECT * FROM app_logs 
   WHERE level = 'error' 
   ORDER BY created_at DESC 
   LIMIT 20;
   
   -- Failed messages
   SELECT * FROM incoming_messages 
   WHERE status = 'failed' 
   ORDER BY created_at DESC 
   LIMIT 20;
   
   -- Error rate by source
   SELECT source, COUNT(*) as error_count 
   FROM app_logs 
   WHERE level = 'error' 
   AND created_at > NOW() - INTERVAL '24 hours'
   GROUP BY source;
   ```

## Success Criteria

✅ All database tables exist and have correct schema
✅ Debug health endpoint returns `canInsertLogs: true`
✅ Every message creates an `incoming_messages` row
✅ Every message processing creates multiple `app_logs` entries
✅ All errors include requestId in user-facing messages
✅ Vercel logs contain detailed error information
✅ RequestId can be used to trace complete request flow

## Next Steps

After verification:
1. Monitor logs for 24-48 hours
2. Review error patterns
3. Adjust logging levels if needed
4. Set up automated alerts
5. Document any production-specific issues
