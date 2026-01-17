# DB Error Diagnosis Guide

## RequestId Search in Vercel Logs

When a user reports an error code like `start-1768639275054-5hfm6638l`, use this guide to find the exact server-side error in Vercel logs.

### Step 1: Access Vercel Logs

1. Open Vercel Dashboard: https://vercel.com/dashboard
2. Select your project
3. Go to **Deployments** → Select latest deployment
4. Click **Logs** tab

### Step 2: Search for RequestId

In the logs search box, search for:
```
start-1768639275054-5hfm6638l
```

You should find log entries like:
```
[bot:start-1768639275054-5hfm6638l] Operation: createUserOnStart
[bot:start-1768639275054-5hfm6638l] Environment: isProduction=true, hasSupabaseUrl=true, hasSupabaseKey=true
[bot:start-1768639275054-5hfm6638l] DB_FAILURE_SNAPSHOT: { ... }
[bot:start-1768639275054-5hfm6638l] Ошибка upsert (createUserOnStart): { ... }
```

### Step 3: Analyze DB Error

Look for the log entry with `dbError` object. It contains:

#### Common Postgres Error Fields

- **code**: Postgres error code (e.g., `23502` = NOT NULL violation, `23505` = UNIQUE violation, `42P01` = table doesn't exist)
- **message**: Human-readable error message
- **details**: Additional error details
- **hint**: Suggested fix
- **constraint**: Name of constraint that failed (if applicable)
- **table**: Table name where error occurred
- **column**: Column name where error occurred (if applicable)
- **schema**: Schema name (if applicable)

#### Example Error Codes

| Code | Meaning | Common Cause |
|------|---------|--------------|
| `23502` | NOT NULL violation | Missing required column value |
| `23505` | UNIQUE violation | Duplicate key (upsert should handle this) |
| `42P01` | Table doesn't exist | Table not created / wrong schema |
| `42703` | Column doesn't exist | Column name typo / migration not applied |
| `42883` | Function doesn't exist | Wrong function name / extension not installed |
| `PGRST200` | PostgREST error | Schema cache issue / RLS policy blocking |

### Step 4: Check DB_FAILURE_SNAPSHOT

The `DB_FAILURE_SNAPSHOT` JSON object contains:
- **requestId**: Same as user's error code
- **operation**: `createUserOnStart`
- **telegramUserId**: The Telegram user ID
- **userId**: User ID in DB (undefined if not created yet)
- **env**: Node environment (`production`, `development`, etc.)
- **vercelEnv**: Vercel environment (`production`, `preview`, etc.)
- **hasDbUrl**: `true`/`false` - Whether SUPABASE_URL is set
- **hasDbKey**: `true`/`false` - Whether SUPABASE_SERVICE_ROLE_KEY is set
- **isProduction**: `true`/`false`
- **payloadKeys**: Array of keys being inserted (e.g., `["telegram_id"]`)
- **payloadValues**: Sanitized payload values (types and lengths, not actual secrets)

### Step 5: Common Root Causes

#### 1. Schema Mismatch (Code: `42703` or `23502`)

**Symptom**: `column "telegram_id" does not exist` or `null value in column "X" violates not-null constraint`

**Fix**:
- Check if `users` table exists in production Supabase
- Verify column `telegram_id` exists and has correct type (INTEGER or BIGINT)
- Apply missing migrations in Supabase SQL Editor

#### 2. RLS (Row Level Security) Policy Blocking (Code: `PGRST200`)

**Symptom**: `new row violates row-level security policy` or `permission denied`

**Fix**:
- In Supabase Dashboard → Authentication → Policies
- Check `users` table policies
- Ensure `service_role` key bypasses RLS (should work by default)
- Or add policy allowing INSERT: `CREATE POLICY "Allow service role inserts" ON users FOR INSERT TO service_role WITH CHECK (true);`

#### 3. Missing Migrations in Production

**Symptom**: Table or column doesn't exist

**Fix**:
- Go to Supabase SQL Editor
- Run missing migrations manually
- Or check if migrations are automated in build process

#### 4. Wrong Database Connection

**Symptom**: Connection errors or wrong data

**Fix**:
- Verify `SUPABASE_URL` in Vercel points to production project
- Verify `SUPABASE_SERVICE_ROLE_KEY` is from production project
- Check Vercel Environment Variables are set for **Production** (not just Preview)

#### 5. Type Mismatch (Code: `22P02`)

**Symptom**: `invalid input syntax for type integer: "text"`

**Fix**:
- Ensure `telegram_id` column type matches what's being inserted
- If column is INTEGER, ensure value is a number (not string like "web:253")

## Quick Diagnosis Checklist

When you have a requestId:

- [ ] Search logs for `[bot:requestId]` entries
- [ ] Find `DB_FAILURE_SNAPSHOT` log entry
- [ ] Check `dbError.code` in error log
- [ ] Check `dbError.message` for details
- [ ] Verify `hasDbUrl=true` and `hasDbKey=true` in snapshot
- [ ] Check `isProduction` status
- [ ] Look for `table`, `column`, `constraint` in dbError if present
- [ ] Match error code to common causes above
- [ ] Fix root cause (schema, RLS, migration, connection)
- [ ] Test `/start` again with new requestId

## Example Log Analysis

```
[bot:start-1768639275054-5hfm6638l] Operation: createUserOnStart
[bot:start-1768639275054-5hfm6638l] Environment: isProduction=true, hasSupabaseUrl=true, hasSupabaseKey=true
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
    "message": "new row violates row-level security policy for table \"users\"",
    "code": "42501",
    "details": null,
    "hint": null,
    "constraint": null,
    "table": "users",
    "column": null,
    ...
  }
}
```

**Diagnosis**: RLS policy is blocking INSERT. Need to check Supabase policies or ensure service_role key is used correctly.
