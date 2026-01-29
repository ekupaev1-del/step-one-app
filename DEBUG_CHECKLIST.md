# Debug Checklist for /start DB Errors

## Quick Reference

### Find Error Details by requestId

**RequestId example:** `start-1768639275054-5hfm6638l`

### Method 1: Vercel Logs (Primary)

1. **Open Vercel Dashboard**
   - Go to: https://vercel.com/dashboard
   - Select your project
   - Deployments → Latest deployment → **Logs** tab

2. **Search for requestId**
   - In logs search box: `start-1768639275054-5hfm6638l`
   - Look for: `[bot:start-1768639275054-5hfm6638l] ERROR:`
   - This shows structured JSON error log

3. **Parse Error**
   - Find the JSON line starting with `{"code":"start-...`
   - Check `db.code` field:
     - `42501` = RLS policy blocking insert
     - `23502` = NOT NULL constraint violation
     - `23505` = UNIQUE violation (should be handled)
     - `42P01` = Table doesn't exist
     - `42703` = Column doesn't exist

### Method 2: Debug Endpoint (If DEBUG_ADMIN_KEY is set)

**Endpoint:** `GET /api/debug/error?code=<requestId>`

**Note:** This endpoint is for miniapp API route errors. Bot errors are logged directly to Vercel logs (see Method 1).

**Usage:**
```bash
# Set DEBUG_ADMIN_KEY in Vercel env vars first
curl -H "x-debug-key: your-debug-admin-key" \
  https://your-app.vercel.app/api/debug/error?code=start-1768639275054-5hfm6638l
```

**Setup:**
1. Vercel Dashboard → Settings → Environment Variables
2. Add `DEBUG_ADMIN_KEY` (e.g., a random string)
3. Add to Production environment
4. Redeploy

## Structured Log Format

When error occurs, you'll see in Vercel logs:

```json
{"code":"start-1768639275054-5hfm6638l","route":"/start","requestId":"start-1768639275054-5hfm6638l","telegram":{"chatId":123456789,"userId":123456789},"db":{"message":"new row violates row-level security policy","code":"42501","detail":null,"hint":null,"constraint":null,"table":"users","column":null},"payloadKeys":["telegram_id"],"payloadPreview":{"telegram_id":123456789},"timestamp":"2024-01-17T10:30:45.123Z","operation":"createUserOnStart"}
```

**Key Fields:**
- `code` / `requestId` - Same as user's error code
- `route` - Always `/start` for bot start command
- `telegram.chatId` - Telegram chat ID
- `telegram.userId` - Telegram user ID
- `db.code` - Postgres error code (most important)
- `db.message` - Error message
- `db.table` - Table name (if applicable)
- `db.column` - Column name (if applicable)
- `db.constraint` - Constraint name (if applicable)
- `payloadKeys` - Keys being inserted
- `payloadPreview` - Sanitized preview of payload values

## Common Error Codes and Fixes

### 42501 - RLS Policy Violation

**Symptom:** `new row violates row-level security policy`

**Fix:**
1. Supabase Dashboard → Authentication → Policies
2. Check `users` table policies
3. Ensure service_role can insert:
   ```sql
   CREATE POLICY "Allow service role inserts" 
   ON users FOR INSERT 
   TO service_role 
   WITH CHECK (true);
   ```
4. Or disable RLS for service_role (not recommended for production)

### 23502 - NOT NULL Violation

**Symptom:** `null value in column "X" violates not-null constraint`

**Fix:**
- Check `users` table schema in Supabase
- Ensure `telegram_id` column is nullable or has a default
- Apply migrations if column was recently added with NOT NULL

### 42P01 - Table Doesn't Exist

**Symptom:** `relation "users" does not exist`

**Fix:**
1. Check if `users` table exists in Supabase SQL Editor:
   ```sql
   SELECT * FROM users LIMIT 1;
   ```
2. If table doesn't exist, apply migrations in Supabase SQL Editor
3. Check migrations folder for `users` table creation script

### 42703 - Column Doesn't Exist

**Symptom:** `column "telegram_id" does not exist`

**Fix:**
1. Check `users` table columns in Supabase:
   ```sql
   SELECT column_name, data_type 
   FROM information_schema.columns 
   WHERE table_name = 'users' AND column_name = 'telegram_id';
   ```
2. If column doesn't exist, apply migrations
3. Check migrations for `telegram_id` column addition

### 23505 - UNIQUE Violation

**Symptom:** `duplicate key value violates unique constraint "users_telegram_id_key"`

**Fix:**
- Should be handled by `upsert` with `onConflict: "telegram_id"`
- If this error occurs, it means upsert isn't working correctly
- Check Supabase client version and upsert options

## Verification Steps

After fixing the root cause:

1. **Test Health Check:**
   ```bash
   curl https://your-app.vercel.app/api/health/db
   ```
   Should return: `{"ok":true,"requestId":"...","timestamp":"..."}`

2. **Test /start:**
   - Send `/start` to bot in Telegram
   - Should create user successfully
   - Should show welcome message (not error)

3. **Check Logs:**
   - Vercel logs should show success:
     ```
     [bot:start-...] Создана новая запись, id: 42
     ```
   - No ERROR log entries

## Summary

✅ **Primary Method:** Search Vercel logs by requestId  
✅ **Structured Log:** Single-line JSON with all error fields  
✅ **Debug Endpoint:** `/api/debug/error?code=<requestId>` (requires DEBUG_ADMIN_KEY)  
✅ **Bot Errors:** Logged directly to Vercel logs (not in errorStore)  
✅ **Miniapp Errors:** Can be retrieved via debug endpoint (if stored in errorStore)

## Next Steps

1. ✅ Structured logging is in place
2. ✅ Debug endpoint is ready (for miniapp API routes)
3. ⏳ **Await next error occurrence** to get structured log with `db.code`
4. ⏳ **Fix root cause** based on `db.code` using checklist above
5. ⏳ **Verify fix** by testing `/start` command
