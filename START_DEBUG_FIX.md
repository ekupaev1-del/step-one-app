# /start Debug Fix Summary

## Changes Made

### 1. Enhanced Structured Logging

**File:** `bot/src/index.ts`

**Improvements:**
- ✅ Structured JSON error log: Single line `console.error` with all required fields
- ✅ Format: `{ code, route, requestId, telegram: { chatId, userId }, db: { message, code, detail, hint, constraint, table, column }, payloadKeys, payloadPreview, timestamp, operation }`
- ✅ No secrets logged (only sanitized preview)
- ✅ requestId format preserved: `start-<timestamp>-<random>`

**Example log output:**
```json
{"code":"start-1768639275054-5hfm6638l","route":"/start","requestId":"start-1768639275054-5hfm6638l","telegram":{"chatId":123456789,"userId":123456789},"db":{"message":"new row violates row-level security policy","code":"42501","detail":null,"hint":null,"constraint":null,"table":"users","column":null},"payloadKeys":["telegram_id"],"payloadPreview":{"telegram_id":123456789},"timestamp":"2024-01-17T...","operation":"createUserOnStart"}
```

### 2. In-Memory Error Store

**File:** `miniapp/lib/errorStore.ts` (new)

**Features:**
- Stores last ~100 errors by requestId/code
- Simple Map-based in-memory storage
- Easy lookup by code or requestId

### 3. Debug Endpoint

**File:** `miniapp/app/api/debug/error/route.ts` (new)

**Endpoint:** `GET /api/debug/error?code=<requestId>`

**Protection:**
- Requires `DEBUG_ADMIN_KEY` env variable
- Requires `x-debug-key` header matching `DEBUG_ADMIN_KEY`
- Returns 403 if `DEBUG_ADMIN_KEY` not set
- Returns 401 if header doesn't match

**Usage:**
```bash
curl -H "x-debug-key: your-debug-admin-key" \
  https://your-app.vercel.app/api/debug/error?code=start-1768639275054-5hfm6638l
```

**Response (found):**
```json
{
  "ok": true,
  "error": {
    "code": "start-1768639275054-5hfm6638l",
    "route": "/start",
    "requestId": "start-1768639275054-5hfm6638l",
    "telegram": { "chatId": 123456789, "userId": 123456789 },
    "db": { "message": "...", "code": "42501", ... },
    "payloadKeys": ["telegram_id"],
    "payloadPreview": { "telegram_id": 123456789 },
    "timestamp": "2024-01-17T...",
    "operation": "createUserOnStart"
  },
  "requestId": "debug-error-..."
}
```

**Response (not found):**
```json
{
  "ok": false,
  "error": "not_found",
  "code": "start-1768639275054-5hfm6638l"
}
```

### 4. DB Insert Fixes

**File:** `bot/src/index.ts`

**Fixes:**
- ✅ Validate `telegram_id` is a valid number before insert
- ✅ Ensure `telegram_id` is cast to Number for type safety
- ✅ Upsert is already idempotent with `onConflict: "telegram_id", ignoreDuplicates: false`
- ✅ Better error handling with structured logging

**Note:** The upsert already handles idempotency correctly - if user exists, it updates; if not, it inserts.

## Environment Variables Required

**Vercel Production:**
- `DEBUG_ADMIN_KEY` - (optional) Key for accessing debug endpoint
- `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- `TELEGRAM_BOT_TOKEN` - Telegram bot token

## Debugging Checklist

When user reports error code `start-1768639275054-5hfm6638l`:

### Step 1: Check Vercel Logs

1. Open Vercel Dashboard → Your Project → Deployments → Latest → Logs
2. Search for: `start-1768639275054-5hfm6638l`
3. Find structured JSON error log entry

### Step 2: Use Debug Endpoint (if DEBUG_ADMIN_KEY is set)

```bash
# Set DEBUG_ADMIN_KEY in Vercel env vars first
curl -H "x-debug-key: your-debug-admin-key" \
  https://your-app.vercel.app/api/debug/error?code=start-1768639275054-5hfm6638l
```

### Step 3: Analyze Error

Check `db.code`:
- `42501` = RLS policy violation → Check Supabase RLS policies
- `23502` = NOT NULL violation → Check required columns
- `23505` = UNIQUE violation → Should be handled by upsert
- `42P01` = Table doesn't exist → Apply migrations
- `42703` = Column doesn't exist → Apply migrations

## Files Changed

1. **bot/src/index.ts**
   - Enhanced structured JSON logging for DB errors
   - Added telegram_id validation
   - Improved error formatting

2. **miniapp/lib/errorStore.ts** (new)
   - In-memory error storage
   - Stores last ~100 errors

3. **miniapp/app/api/debug/error/route.ts** (new)
   - Protected debug endpoint
   - Fetches errors by code/requestId

## Next Steps

1. **Set DEBUG_ADMIN_KEY in Vercel** (optional, for debug endpoint)
2. **Deploy changes**
3. **Test /start command** - errors will now be logged in structured format
4. **If error occurs**:
   - Search Vercel logs for requestId
   - Check structured JSON error log
   - Use debug endpoint if needed
   - Fix root cause based on `db.code`

## Common Root Causes and Fixes

### RLS Policy Blocking (code: `42501`)

**Fix:**
1. Supabase Dashboard → Authentication → Policies
2. Check `users` table policies
3. Add policy allowing service_role inserts:
   ```sql
   CREATE POLICY "Allow service role inserts" 
   ON users FOR INSERT 
   TO service_role 
   WITH CHECK (true);
   ```

### Missing Table/Column (code: `42P01` or `42703`)

**Fix:**
1. Check if `users` table exists in Supabase
2. Apply missing migrations in Supabase SQL Editor
3. Verify `telegram_id` column exists and has correct type (BIGINT or INTEGER)

### Type Mismatch (code: `22P02`)

**Fix:**
- Ensure `telegram_id` column is BIGINT or INTEGER (not TEXT)
- Bot sends numeric telegram_id (already fixed in code)

## Testing

### Local Test

1. Set environment variables in `bot/.env`
2. Run bot: `cd bot && npm run dev`
3. Send `/start` to bot
4. Check console for structured JSON error log (if error occurs)

### Production Test

1. Deploy changes to Vercel
2. Send `/start` to bot in Telegram
3. If error occurs, note the requestId
4. Search Vercel logs for that requestId
5. Check structured JSON error log
6. Use debug endpoint if `DEBUG_ADMIN_KEY` is set
