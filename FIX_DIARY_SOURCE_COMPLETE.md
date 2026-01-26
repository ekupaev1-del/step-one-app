# Fix Diary Source Constraint and App Logs - Complete

## Summary

Fixed the production bug where diary inserts failed with error 23514 (CHECK constraint violation). The issue was that code used `source='telegram'` but the constraint only allowed content types: `'text'`, `'photo'`, `'audio'`.

## Changes Made

### 1. SQL Migration (`migrations/20250102_fix_diary_source_and_channel.sql`)

**Key Changes:**
- ✅ Added `diary.channel` column (TEXT, default 'telegram') to track communication channel
- ✅ Updated `diary_source_check` constraint to allow: `'text'`, `'photo'`, `'audio'` (content types)
- ✅ Created/fixed `app_logs` table with correct schema:
  - `id` BIGSERIAL (not UUID)
  - `chat_id` TEXT (nullable)
  - `payload` JSONB (renamed from `meta` if exists)
  - All required columns: `level`, `source`, `request_id`, `user_id`, `telegram_user_id`, `message`

### 2. Code Updates

**A) Bot Text Handler** (`bot/src/index.ts` ~line 1654)
- Changed: `source: 'telegram'` → `source: 'text'`
- Added: `channel: 'telegram'`

**B) Bot Photo Handler** (`bot/src/index.ts` ~line 2662)
- Changed: `source: 'telegram'` → `source: 'photo'`
- Added: `channel: 'telegram'`

**C) Bot Voice Handler** (`bot/src/index.ts` ~line 2956)
- Changed: `source: 'telegram'` → `source: 'audio'`
- Added: `channel: 'telegram'`

**D) Webhook Route** (`miniapp/app/api/telegram/webhook/route.ts`)
- Added message type detection:
  - Photo → `source: 'photo'`
  - Voice/Audio → `source: 'audio'`
  - Text → `source: 'text'` (default)
- Added: `channel: 'telegram'`

**E) Normalization Functions** (`miniapp/lib/diaryNormalize.ts`, `bot/src/services/diaryNormalize.ts`)
- Updated to accept `channel` parameter
- Validates `source` is one of: `'text'`, `'photo'`, `'audio'`
- Defaults `channel` to `'telegram'` if not specified

**F) Logging** (`miniapp/lib/logging.ts`, `bot/src/services/logging.ts`)
- Added `chat_id` as TEXT column (matches schema)
- Changed `meta` to `payload` (matches schema)
- Enhanced error logging with full Postgres details

### 3. Enhanced Logging

All diary inserts now log:
- Message kind (text/photo/audio)
- Resolved userId and telegramUserId
- Source and channel values
- Full insert object with types
- Postgres error details on failure

## Data Model

**diary.source**: Content type (`'text'`, `'photo'`, `'audio'`)
**diary.channel**: Communication channel (`'telegram'`, `'webapp'`, `'admin'`, `'api'`)

This separation allows:
- Querying by content type (e.g., all photos)
- Querying by channel (e.g., all Telegram entries)
- Future expansion (e.g., WhatsApp with text/photo/audio)

## Verification Checklist

After deploying and running migration:

1. **Run Migration**
   ```sql
   -- Execute: migrations/20250102_fix_diary_source_and_channel.sql
   -- In Supabase SQL Editor
   ```

2. **Verify Constraint**
   ```sql
   SELECT conname, pg_get_constraintdef(oid) 
   FROM pg_constraint 
   WHERE conname = 'diary_source_check';
   -- Should show: CHECK (source IN ('text', 'photo', 'audio'))
   ```

3. **Verify Channel Column**
   ```sql
   SELECT column_name, data_type, column_default
   FROM information_schema.columns
   WHERE table_schema = 'public' 
     AND table_name = 'diary'
     AND column_name = 'channel';
   -- Should show: channel, text, 'telegram'::text
   ```

4. **Verify app_logs Schema**
   ```sql
   SELECT column_name, data_type 
   FROM information_schema.columns 
   WHERE table_schema = 'public' 
     AND table_name = 'app_logs'
   ORDER BY ordinal_position;
   -- Should have: id (bigint), created_at, level, source, request_id, user_id, telegram_user_id, chat_id (text), message, payload
   ```

5. **Test Text Message**
   - Send: "2 вареных яйца"
   - ✅ Should save with `source='text'`, `channel='telegram'`
   - ✅ Check Vercel logs for `[DB_INSERT_START:...]` with messageKind='text'

6. **Test Photo Message**
   - Send photo of food
   - ✅ Should save with `source='photo'`, `channel='telegram'`
   - ✅ Check logs for `[PHOTO_DB_INSERT:...]` with messageKind='photo'

7. **Test Voice Message**
   - Send voice message about food
   - ✅ Should save with `source='audio'`, `channel='telegram'`
   - ✅ Check logs for `[VOICE_DB_INSERT:...]` with messageKind='audio'

8. **Verify app_logs**
   ```sql
   SELECT level, source, request_id, user_id, telegram_user_id, chat_id, created_at
   FROM app_logs
   ORDER BY created_at DESC
   LIMIT 10;
   -- Should show recent log entries, no errors about missing columns
   ```

## Expected Behavior

### Before Fix:
- ❌ All inserts failed with error 23514 (source='telegram' not allowed)
- ❌ app_logs errors: "Could not find table" or "Could not find chat_id column"

### After Fix:
- ✅ Text messages: Save with `source='text'`, `channel='telegram'`
- ✅ Photo messages: Save with `source='photo'`, `channel='telegram'`
- ✅ Voice messages: Save with `source='audio'`, `channel='telegram'`
- ✅ app_logs: Works correctly with all columns
- ✅ Detailed logging: Full context in Vercel logs and app_logs

## Files Changed

1. **New**: `migrations/20250102_fix_diary_source_and_channel.sql`
2. **Modified**: `bot/src/index.ts` (3 handlers: text, photo, voice)
3. **Modified**: `miniapp/app/api/telegram/webhook/route.ts` (message type detection)
4. **Modified**: `miniapp/lib/diaryNormalize.ts` (channel support)
5. **Modified**: `bot/src/services/diaryNormalize.ts` (channel support)
6. **Modified**: `miniapp/lib/logging.ts` (chat_id, payload)
7. **Modified**: `bot/src/services/logging.ts` (chat_id, payload)

## Testing Notes

**Unit Test Example:**
```typescript
// Test source normalization
const entry1 = normalizeDiaryEntry({ user_id: 1, meal_text: "test", calories: 100, source: 'telegram' });
// Should result in: source='text' (fallback), channel='telegram'

const entry2 = normalizeDiaryEntry({ user_id: 1, meal_text: "test", calories: 100, source: 'photo', channel: 'telegram' });
// Should result in: source='photo', channel='telegram'
```

**Manual Test:**
1. Send "2 вареных яйца" → Check diary: `source='text'`, `channel='telegram'`
2. Send photo → Check diary: `source='photo'`, `channel='telegram'`
3. Send voice → Check diary: `source='audio'`, `channel='telegram'`

All changes are backward compatible and safe to deploy.
