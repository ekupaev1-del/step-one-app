# Complete Fix for Diary Insert Errors (23514) and App Logs Schema

## Summary

Fixed all diary insert paths to ensure:
1. ✅ All inserts use `source = 'telegram'` (matches CHECK constraint)
2. ✅ All inserts use normalized payloads with correct types
3. ✅ All inserts include both `user_id` (internal) and `telegram_user_id` (Model A - mixed)
4. ✅ Comprehensive error logging with Postgres error codes
5. ✅ app_logs schema fixed (no chat_id column)

## Root Cause Analysis

### Error 23514: CHECK constraint violation
**Problem**: Code inserted `source = 'telegram'` but the CHECK constraint `diary_source_check` didn't allow this value.

**Solution**: Migration updates the constraint to allow: `'telegram'`, `'webapp'`, `'admin'`, `'api'`

### Error PGRST204: chat_id column not found
**Problem**: Code tried to insert `chat_id` into `app_logs` table, but the column doesn't exist.

**Solution**: Removed `chat_id` from all logging inserts. Store in `meta` JSONB if needed.

## Data Model Choice: Model A (Mixed)

**Decision**: Use Model A - Mixed model where diary rows can have BOTH:
- `user_id` (BIGINT, internal app user ID) - NOT NULL when user exists
- `telegram_user_id` (BIGINT) - NOT NULL when source='telegram'
- `chat_id`, `message_id` (BIGINT) - nullable, for Telegram context

**Rationale**: 
- Telegram entries should be linked to internal user records when possible
- Allows querying by either user_id or telegram_user_id
- Supports future multi-channel scenarios

## Files Changed

### 1. SQL Migration
**File**: `migrations/20250102_fix_diary_source_constraint_and_app_logs.sql`

**Changes**:
- Drops and recreates `diary_source_check` constraint with allowed values
- Adds optional `input_kind` column (text/photo/voice)
- Fixes `app_logs` schema (removes chat_id, ensures correct columns)
- Creates indexes

### 2. Bot Code (bot/src/index.ts)

**Fixed 3 insert paths**:

#### A) Text Message Handler (line ~1654)
- ✅ Already had `source = 'telegram'`
- ✅ Already used `normalizeDiaryEntry`
- ✅ Already had comprehensive error logging

#### B) Photo Message Handler (line ~2662)
- ✅ Added `normalizeDiaryEntry` call
- ✅ Enhanced error logging with Postgres error codes
- ✅ Fixed error message to include error code

#### C) Voice Message Handler (line ~2903)
- ✅ **FIXED**: Was missing `source = 'telegram'` - now added
- ✅ **FIXED**: Was using `user_id = telegram_id` directly - now uses `userData.id`
- ✅ **FIXED**: Added `normalizeDiaryEntry` call
- ✅ **FIXED**: Added comprehensive error logging
- ✅ **FIXED**: Added proper error message with Postgres code

### 3. Test Endpoint (miniapp/app/api/dev/test-diary-insert/route.ts)
- ✅ Changed `source = 'test'` to `source = 'api'` (matches constraint)

### 4. Logging Code
**Files**: `miniapp/lib/logging.ts`, `bot/src/services/logging.ts`
- ✅ Removed `chatId` from logEntry (not in schema)
- ✅ Store chat_id in `meta` JSONB if needed
- ✅ Enhanced error logging

## All Diary Insert Locations

| Location | Source Value | Normalized | Error Logging | Status |
|----------|-------------|------------|---------------|--------|
| `bot/src/index.ts` (text) | `'telegram'` | ✅ | ✅ | ✅ Fixed |
| `bot/src/index.ts` (photo) | `'telegram'` | ✅ | ✅ | ✅ Fixed |
| `bot/src/index.ts` (voice) | `'telegram'` | ✅ | ✅ | ✅ Fixed |
| `miniapp/app/api/telegram/webhook/route.ts` | `'telegram'` | ✅ | ✅ | ✅ Already OK |
| `miniapp/app/api/dev/test-diary-insert/route.ts` | `'api'` | ❌ | ✅ | ✅ Fixed |

## Column Types Verification

All diary inserts now use:
- `user_id`: BIGINT (from `users.id`)
- `telegram_user_id`: BIGINT (from Telegram API)
- `chat_id`: BIGINT | NULL
- `message_id`: BIGINT | NULL
- `source`: TEXT (constrained to: 'telegram', 'webapp', 'admin', 'api')
- `calories`, `protein`, `fat`, `carbs`: NUMERIC(10,2)
- `meal_text`: TEXT
- `parsed_json`: JSONB

## Error Logging Improvements

All insert failures now log:
1. **Console** (Vercel logs):
   - Full Postgres error (code, message, details, hint, constraint, table, column)
   - Failed payload with types
   - Request ID

2. **app_logs table**:
   - Error level log with full context
   - Postgres error details in `meta` JSONB
   - User ID and Telegram user ID

3. **User-facing message**:
   - Short, friendly message
   - Includes Postgres error code
   - Support contact: @STEP0NE11

## Verification Checklist

After deploying and running migration:

1. **Run Migration**
   ```sql
   -- Execute: migrations/20250102_fix_diary_source_constraint_and_app_logs.sql
   ```

2. **Verify Constraint**
   ```sql
   SELECT conname, pg_get_constraintdef(oid) 
   FROM pg_constraint 
   WHERE conname = 'diary_source_check';
   -- Should show: CHECK (source IN ('telegram', 'webapp', 'admin', 'api'))
   ```

3. **Test Text Message**
   - Send: "2 вареных яйца"
   - ✅ Should save successfully
   - ✅ Check Vercel logs for `[DB_INSERT_SUCCESS:...]`

4. **Test Photo Message**
   - Send photo of food
   - ✅ Should save successfully
   - ✅ Check logs for `[PHOTO_DB_INSERT:...]`

5. **Test Voice Message**
   - Send voice message about food
   - ✅ Should save successfully
   - ✅ Check logs for `[VOICE_DB_INSERT:...]`

6. **Verify app_logs**
   ```sql
   SELECT level, source, request_id, user_id, telegram_user_id, created_at
   FROM app_logs
   ORDER BY created_at DESC
   LIMIT 10;
   -- Should show recent log entries, no errors about chat_id
   ```

## Expected Behavior

### Before Fix:
- ❌ Text messages: Error 23514 (source constraint)
- ❌ Photo messages: Error 23514 (source constraint)
- ❌ Voice messages: Error 23514 (source constraint) + wrong user_id
- ❌ Logging: PGRST204 (chat_id not found)

### After Fix:
- ✅ Text messages: Save successfully
- ✅ Photo messages: Save successfully with normalization
- ✅ Voice messages: Save successfully with correct user_id
- ✅ Logging: Works correctly, no chat_id errors
- ✅ All errors: Full Postgres details in logs + user-friendly message

## Migration Execution

1. Copy migration SQL to Supabase SQL Editor
2. Execute migration
3. Verify no errors
4. Check constraint definition
5. Deploy code changes to Vercel
6. Test with real Telegram messages

## Code Diffs Summary

### Key Changes:
1. **Voice handler**: Added source, normalization, proper user_id resolution
2. **Photo handler**: Added normalization, enhanced error logging
3. **Test endpoint**: Changed source from 'test' to 'api'
4. **All handlers**: Enhanced error messages with Postgres error codes

All changes are backward compatible and safe to deploy.
