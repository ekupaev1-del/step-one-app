# Database Restoration - Complete Guide

This document describes the complete restoration of Supabase database connectivity after creating a new Supabase project.

## ✅ What Was Fixed

### 1. Database Schema Migration
- **File**: `supabase/migrations/20260207175729_restore_schema_for_new_project.sql`
- **Purpose**: Complete schema restoration for new Supabase project
- **Tables Created**:
  - `users` - Core user table with Telegram integration
  - `diary` - Food diary entries
  - `subscriptions` - User subscription records
  - `payments` - Payment records
  - `reminders` - User reminders for food and water
  - `water_logs` - Water intake tracking
  - `app_logs` - Application logs
  - `robokassa_invoices` - Payment invoice records

### 2. Supabase Client Configuration
- **Bot**: `bot/src/services/supabase.ts` - Uses `SUPABASE_SERVICE_ROLE_KEY` ✅
- **Miniapp Server**: `miniapp/lib/supabase/server.ts` - Uses `SUPABASE_SERVICE_ROLE_KEY` ✅
- **Miniapp Client**: `miniapp/lib/supabase/client.ts` - Uses `NEXT_PUBLIC_SUPABASE_ANON_KEY` ✅
- **Bot Config**: Updated to support both `SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_URL`

### 3. RLS Policies
- All tables have RLS enabled
- All policies allow `service_role` full access (required for bot/API)
- Policies are safe for Telegram users (don't rely on `auth.uid()`)

### 4. Diagnostic Endpoint
- **File**: `miniapp/app/api/health/db/route.ts`
- **Endpoint**: `GET /api/health/db`
- **Features**:
  - Tests database connectivity
  - Checks all required tables exist
  - Tests INSERT operation
  - Returns detailed error information (code, message, details, hint)
  - Never leaks secrets

### 5. Enhanced Logging
- Bot logs include `requestId` for correlation
- All DB errors log: error code, message, details, hint, constraint, table, column
- Structured JSON logging for Vercel logs

### 6. Environment Variables
- Created `.env.example` files for bot and miniapp
- Documented all required variables

## 📋 Files Changed

### Created Files
1. `supabase/migrations/20260207175729_restore_schema_for_new_project.sql` - Main migration
2. `miniapp/app/api/health/db/route.ts` - Diagnostic endpoint
3. `scripts/test-db-connectivity.ts` - Test script
4. `bot/.env.example` - Bot environment template
5. `miniapp/.env.example` - Miniapp environment template
6. `DB_RESTORATION_COMPLETE.md` - This file

### Modified Files
1. `bot/src/config/env.ts` - Support both `SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_URL`
2. `bot/src/index.ts` - Enhanced error logging with requestId

## 🚀 How to Apply Migration

### Option 1: Supabase SQL Editor (Recommended)
1. Go to Supabase Dashboard → SQL Editor
2. Copy contents of `supabase/migrations/20260207175729_restore_schema_for_new_project.sql`
3. Paste and run

### Option 2: Supabase CLI
```bash
cd miniapp
supabase db push
```

## 🔧 Environment Variables Checklist

### Vercel Environment Variables

**Required:**
- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anon/public key (for client)
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (for server/bot)

**Bot Environment Variables (if running separately):**
- `TELEGRAM_BOT_TOKEN` - Telegram bot token
- `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL` - Supabase URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key
- `OPENAI_API_KEY` - OpenAI API key

## ✅ Verification Steps

### 1. Check Database Health
```bash
curl https://your-app.vercel.app/api/health/db
```

Should return:
```json
{
  "ok": true,
  "database": "connected",
  "tests": {
    "select": { "success": true, "rowCount": 0 },
    "tables": {
      "users": true,
      "diary": true,
      ...
    },
    "insert": { "success": true }
  }
}
```

### 2. Test /start Command
1. Send `/start` to Telegram bot
2. Should create/update user in `users` table
3. Should return welcome message (not "Database error")

### 3. Test Diary Insert
1. After `/start`, send "2 boiled eggs" to bot
2. Should insert row into `diary` table
3. Should return "✅ Добавлено: ..." (not error)

### 4. Run Test Script (Optional)
```bash
cd step-one-app
npx tsx scripts/test-db-connectivity.ts
```

## 🔍 Troubleshooting

### Error: "relation users does not exist"
**Solution**: Run the migration file in Supabase SQL Editor

### Error: "permission denied for table users"
**Solution**: Check RLS policies - ensure `service_role` has access. Re-run migration.

### Error: "invalid input syntax for type uuid: '347'"
**Solution**: Already fixed - all `user_id` columns use `BIGINT` (not UUID)

### Error: "violates check constraint diary_source_check"
**Solution**: Already fixed - constraint allows 'text', 'photo', 'audio'

### /start returns "Database error"
**Check**:
1. Environment variables set in Vercel
2. Migration executed in Supabase
3. RLS policies allow `service_role` access
4. Check `/api/health/db` endpoint for detailed error

## 📊 Logging

All database errors are logged with:
- `requestId` - For correlation across logs
- `errorCode` - Postgres error code (e.g., "42P01")
- `errorMessage` - Human-readable error message
- `errorDetails` - Additional error details
- `errorHint` - Suggested fix
- `constraint` - Constraint name if applicable
- `table` - Table name if applicable
- `column` - Column name if applicable

Example log entry:
```json
{
  "requestId": "req-1234567890-abc123",
  "operation": "users.select",
  "telegramUserId": 123456789,
  "errorCode": "42P01",
  "errorMessage": "relation \"users\" does not exist",
  "table": "users"
}
```

## 🎯 Next Steps

1. ✅ Run migration in Supabase SQL Editor
2. ✅ Verify environment variables in Vercel
3. ✅ Test `/api/health/db` endpoint
4. ✅ Test `/start` command in Telegram bot
5. ✅ Test sending a food message
6. ✅ Monitor Vercel logs for any errors

## 📝 Notes

- All server-side code uses `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS)
- All client-side code uses `NEXT_PUBLIC_SUPABASE_ANON_KEY` (respects RLS)
- RLS policies allow `service_role` full access (required for bot)
- Telegram users are NOT Supabase Auth users, so policies don't rely on `auth.uid()`
- All `user_id` columns use `BIGINT` (not UUID) for consistency
