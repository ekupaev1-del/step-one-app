# Enhanced DB Error Logging Summary

## RequestId: start-1768639275054-5hfm6638l

This document explains the enhanced logging added to help diagnose DB insert failures using the requestId provided by users.

## Changes Made

### 1. Enhanced Postgres Error Logging

**File:** `bot/src/index.ts`

**Added all Postgres error fields:**
- `message` - Human-readable error message
- `code` - Postgres error code (e.g., `23502`, `23505`, `42P01`)
- `details` - Additional error details
- `hint` - Suggested fix from Postgres
- `constraint` - Name of constraint that failed
- `table` - Table name where error occurred
- `column` - Column name where error occurred
- `schema` - Schema name
- `internal` - Internal Postgres error details
- `internalQuery` - Internal query that failed
- `internalPosition` - Position in query where error occurred
- `where` - WHERE clause context
- `file` - Postgres source file
- `line` - Line number in source file
- `routine` - Function/routine name
- `stack` - JavaScript stack trace

### 2. DB Failure Snapshot Log

**File:** `bot/src/index.ts`

**Added `DB_FAILURE_SNAPSHOT` JSON log entry** with:
- `requestId` - Same as user's error code (e.g., `start-1768639275054-5hfm6638l`)
- `operation` - Operation name (`createUserOnStart`)
- `telegramUserId` - Telegram user ID
- `userId` - User ID in DB (undefined if not created yet)
- `env` - Node environment (`production`, `development`, etc.)
- `vercelEnv` - Vercel environment (`production`, `preview`, etc.)
- `hasDbUrl` - Boolean: whether SUPABASE_URL is set
- `hasDbKey` - Boolean: whether SUPABASE_SERVICE_ROLE_KEY is set
- `isProduction` - Boolean: whether in production
- `payloadKeys` - Array of keys being inserted (e.g., `["telegram_id"]`)
- `payloadValues` - Sanitized payload values (types and lengths, not secrets)

**Why separate log entry:**
- Easy to find in Vercel logs: search for `DB_FAILURE_SNAPSHOT`
- Easy to parse: valid JSON on a single line
- Contains all diagnostic info without secrets

### 3. Applied to All DB Operations

**Enhanced logging is applied to:**
- SELECT operation (checking existing user)
- UPSERT operation (creating new user)
- Unexpected errors (catch blocks)

## How to Use RequestId for Diagnosis

### Step 1: Search Vercel Logs

1. Open Vercel Dashboard → Your Project → Deployments → Latest → Logs
2. Search for: `start-1768639275054-5hfm6638l`

You'll find entries like:
```
[bot:start-1768639275054-5hfm6638l] Operation: createUserOnStart
[bot:start-1768639275054-5hfm6638l] Environment: isProduction=true, hasSupabaseUrl=true, hasSupabaseKey=true
[bot:start-1768639275054-5hfm6638l] DB_FAILURE_SNAPSHOT: { ... }
[bot:start-1768639275054-5hfm6638l] Ошибка upsert (createUserOnStart): { ... }
```

### Step 2: Check DB_FAILURE_SNAPSHOT

Look for the `DB_FAILURE_SNAPSHOT` log entry. It will show:
- Whether DB config is present (`hasDbUrl`, `hasDbKey`)
- Whether in production (`isProduction`)
- What payload was being inserted (`payloadKeys`, `payloadValues`)

### Step 3: Check dbError Object

Look for the error log entry with `dbError` object. Check:
- `code` - Postgres error code (see `DB_ERROR_DIAGNOSIS.md` for code meanings)
- `message` - Human-readable error message
- `table`, `column`, `constraint` - If present, indicates schema/constraint issues

### Step 4: Match Error Code to Root Cause

Common Postgres error codes:
- `23502` = NOT NULL violation → Missing required column
- `23505` = UNIQUE violation → Duplicate key (should be handled by upsert)
- `42P01` = Table doesn't exist → Missing table / wrong schema
- `42703` = Column doesn't exist → Missing column / migration not applied
- `42501` = RLS policy violation → Row Level Security blocking INSERT

See `DB_ERROR_DIAGNOSIS.md` for full diagnosis guide.

## Health Check Endpoint

**Endpoint:** `GET /api/health/db`

**Response (success):**
```json
{
  "ok": true,
  "requestId": "health-db-...",
  "timestamp": "2024-01-17T..."
}
```

**Response (failure):**
```json
{
  "ok": false,
  "requestId": "health-db-...",
  "error": "Database connection failed",
  "dbErrorCode": "42P01"
}
```

**Usage:**
```bash
curl https://your-app.vercel.app/api/health/db
```

## Files Changed

1. **bot/src/index.ts**
   - Enhanced error logging in `/start` handler
   - Added all Postgres error fields extraction
   - Added `DB_FAILURE_SNAPSHOT` log entry
   - Applied to SELECT, UPSERT, and catch blocks

2. **miniapp/app/api/health/db/route.ts**
   - Already created (from previous commit)
   - Health check endpoint for DB connectivity

3. **DB_ERROR_DIAGNOSIS.md** (new)
   - Complete guide for diagnosing DB errors using requestId
   - Error code reference
   - Common root causes and fixes

## Test Plan

### Local Testing

1. **Test with successful insert:**
   ```bash
   cd bot
   npm run dev
   # Send /start to bot
   # Check console logs for requestId
   # Verify DB_FAILURE_SNAPSHOT is NOT logged (no error)
   ```

2. **Test with DB error (simulate):**
   - Temporarily break DB connection or use wrong table name
   - Send /start to bot
   - Check logs for `DB_FAILURE_SNAPSHOT` with full error details
   - Verify requestId is in both logs and user message

### Production Testing

1. **Check health endpoint:**
   ```bash
   curl https://your-app.vercel.app/api/health/db
   ```
   - Should return `{ ok: true }` if DB is accessible

2. **Test /start with real user:**
   - Send `/start` to bot in Telegram
   - If error occurs, note the requestId from error message
   - Search Vercel logs for that requestId
   - Find `DB_FAILURE_SNAPSHOT` and `dbError` entries
   - Diagnose root cause using `DB_ERROR_DIAGNOSIS.md`

3. **Verify logs contain:**
   - ✅ `Operation: createUserOnStart`
   - ✅ `Environment: isProduction=...`
   - ✅ `DB_FAILURE_SNAPSHOT` JSON entry (if error occurs)
   - ✅ `dbError` object with all Postgres fields
   - ✅ requestId in user-facing error message

### Next Steps After Diagnosis

Once you have the requestId and can see the logs:

1. **Check error code** - Match to common causes (see `DB_ERROR_DIAGNOSIS.md`)
2. **Check DB_FAILURE_SNAPSHOT** - Verify environment config
3. **Check dbError.table/column** - Identify schema issues
4. **Check dbError.constraint** - Identify constraint violations
5. **Apply fix** - Based on root cause:
   - Apply missing migrations
   - Fix RLS policies
   - Fix schema mismatches
   - Fix connection/config issues

## Expected Log Output (Success)

```
[bot:start-1768639275054-5hfm6638l] Operation: createUserOnStart
[bot:start-1768639275054-5hfm6638l] Environment: isProduction=true, hasSupabaseUrl=true, hasSupabaseKey=true
[bot:start-1768639275054-5hfm6638l] /start вызван для telegram_id: 123456789
[bot:start-1768639275054-5hfm6638l] Создание новой записи для telegram_id: 123456789
[bot:start-1768639275054-5hfm6638l] Insert payload keys: ["telegram_id"]
[bot:start-1768639275054-5hfm6638l] Создана новая запись, id: 42
```

## Expected Log Output (Error)

```
[bot:start-1768639275054-5hfm6638l] Operation: createUserOnStart
[bot:start-1768639275054-5hfm6638l] Environment: isProduction=true, hasSupabaseUrl=true, hasSupabaseKey=true
[bot:start-1768639275054-5hfm6638l] /start вызван для telegram_id: 123456789
[bot:start-1768639275054-5hfm6638l] Создание новой записи для telegram_id: 123456789
[bot:start-1768639275054-5hfm6638l] Insert payload keys: ["telegram_id"]
[bot:start-1768639275054-5hfm6638l] DB_FAILURE_SNAPSHOT: {
  "requestId": "start-1768639275054-5hfm6638l",
  "operation": "createUserOnStart",
  "telegramUserId": 123456789,
  "userId": undefined,
  "env": "production",
  "vercelEnv": "production",
  "hasDbUrl": true,
  "hasDbKey": true,
  "isProduction": true,
  "payloadKeys": ["telegram_id"],
  "payloadValues": {
    "telegram_id": "number"
  }
}
[bot:start-1768639275054-5hfm6638l] Ошибка upsert (createUserOnStart): {
  "operation": "createUserOnStart",
  "telegram_id": 123456789,
  "payloadKeys": ["telegram_id"],
  "dbError": {
    "message": "...",
    "code": "23502",
    "details": "...",
    "hint": "...",
    "constraint": "...",
    "table": "users",
    "column": "...",
    ...
  }
}
```

## Notes

- ✅ All logs are sanitized - no secrets are logged
- ✅ `DB_FAILURE_SNAPSHOT` is logged as separate JSON entry for easy parsing
- ✅ requestId is included in user-facing error messages
- ✅ All Postgres error fields are extracted for comprehensive diagnosis
- ✅ Health check endpoint available for monitoring DB connectivity
