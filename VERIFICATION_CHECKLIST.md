# Verification Checklist: Fix 22P02 Error and Restore Food Saving

## After Deploying to Vercel

### Step 1: Run Migration in Supabase

1. Open Supabase Dashboard → SQL Editor
2. Execute: `migrations/20250102_fix_diary_user_id_and_app_logs.sql`
3. Verify migration completed without errors
4. Check that:
   - `diary.user_id` is now `BIGINT` (not UUID)
   - `app_logs` table exists with `BIGSERIAL id` and `BIGINT user_id`

**SQL to verify:**
```sql
-- Check diary.user_id type
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'diary' 
  AND column_name = 'user_id';

-- Check app_logs exists
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name = 'app_logs';

-- Check app_logs schema
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'app_logs';
```

### Step 2: Test Telegram Bot

1. Send a food message to the bot: "2 вареных яйца и булгур 300"
2. **Expected**: Bot responds with food analysis (calories, macros)
3. **Check Vercel logs** for:
   - `[TELEGRAM_WEBHOOK:req-...]` entries
   - `[DB_INSERT_START:req-...]` with user_id types
   - `[DB_INSERT_SUCCESS:req-...]` (not error)
   - No `22P02` errors

### Step 3: Verify Database

**Check diary table:**
```sql
SELECT id, user_id, telegram_user_id, meal_text, calories, created_at
FROM diary
ORDER BY created_at DESC
LIMIT 5;
```

**Expected:**
- `user_id` is a number (BIGINT), not UUID
- `telegram_user_id` is a number (BIGINT)
- Row exists for your test message

**Check app_logs table:**
```sql
SELECT id, level, source, request_id, user_id, telegram_user_id, created_at
FROM app_logs
ORDER BY created_at DESC
LIMIT 10;
```

**Expected:**
- Multiple log entries for your test message
- `user_id` is BIGINT (number) or NULL
- `telegram_user_id` is BIGINT (number) or NULL
- Logs include: `telegram_webhook_received`, `db_insert_start`, `db_insert_success`

### Step 4: Test Error Handling

1. **Simulate error** (optional - can skip if everything works):
   - Temporarily break something to trigger an error
   - Verify error is logged to both console and app_logs
   - Verify bot still responds to user (doesn't crash)

### Step 5: Verify Logging Works

**Check Vercel Function Logs:**
- Go to Vercel Dashboard → Your Project → Functions → View Logs
- Look for recent webhook calls
- Should see detailed logs with requestId

**Check app_logs in Supabase:**
```sql
-- Recent errors (if any)
SELECT * FROM app_logs 
WHERE level = 'error' 
ORDER BY created_at DESC 
LIMIT 5;

-- Recent info logs
SELECT level, source, request_id, user_id, telegram_user_id, created_at
FROM app_logs 
WHERE level = 'info'
ORDER BY created_at DESC 
LIMIT 10;
```

## Success Criteria

✅ **Food messages are saved**: Diary entries appear in database  
✅ **No 22P02 errors**: Vercel logs show no "invalid input syntax for type uuid"  
✅ **Logging works**: app_logs table receives entries  
✅ **User-friendly errors**: Bot responds with error code if something fails  
✅ **Diagnostic logs**: Vercel logs show detailed type information  

## Troubleshooting

### If 22P02 error still occurs:

1. **Check migration ran**: Verify `diary.user_id` is BIGINT
2. **Check code**: Ensure `normalizeDiaryEntry` is being called
3. **Check logs**: Look for `[DB_INSERT:req-...]` to see actual types being inserted
4. **Check user_id source**: Verify `userId` from users table is BIGINT, not UUID

### If app_logs insert fails:

1. **Check table exists**: Run verification SQL above
2. **Check RLS policies**: Service role should have insert permission
3. **Check logs**: Look for `[logEvent] Failed to write to app_logs` in Vercel logs
4. **Note**: Logging failures should NOT crash the request (they're logged to console as fallback)

### If diary insert still fails:

1. **Check error details**: Look for `[DB_INSERT_ERROR:req-...]` in Vercel logs
2. **Check Postgres error**: Look for `code`, `message`, `details`, `hint` in logs
3. **Check payload types**: Verify all numeric fields are numbers, not strings
4. **Check user_id**: Verify it's a number, not string or UUID

## Quick Test Script

You can test the webhook endpoint directly:

```bash
curl -X POST https://your-app.vercel.app/api/telegram/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "update_id": 123456,
    "message": {
      "message_id": 1,
      "from": {
        "id": YOUR_TELEGRAM_ID,
        "is_bot": false,
        "first_name": "Test"
      },
      "chat": {
        "id": YOUR_TELEGRAM_ID,
        "type": "private"
      },
      "date": 1234567890,
      "text": "2 вареных яйца"
    }
  }'
```

Replace `YOUR_TELEGRAM_ID` with your actual Telegram user ID.
