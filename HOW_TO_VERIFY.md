# How to Verify Database Fixes

## Step 1: Run Database Migration

1. Open Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Go to **SQL Editor**
4. Click **New Query**
5. Copy entire contents of `supabase/migrations/0001_init.sql`
6. Paste into SQL Editor
7. Click **Run** (or press `Ctrl+Enter`)
8. Verify: Should see "Success. No rows returned"

## Step 2: Verify Environment Variables in Vercel

1. Open Vercel Dashboard: https://vercel.com/dashboard
2. Select your project
3. Go to **Settings** → **Environment Variables**
4. Verify these are set for **Production**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `TELEGRAM_BOT_TOKEN`
   - `OPENAI_API_KEY` (if used)

## Step 3: Deploy to Vercel

1. Push changes to GitHub `main` branch:
   ```bash
   git add .
   git commit -m "Fix database errors and add logging"
   git push origin main
   ```
2. Wait for Vercel deployment (automatic via Git integration)
3. Check deployment status in Vercel Dashboard

## Step 4: Test Health Endpoint

1. Open: `https://your-app.vercel.app/api/health/db`
2. Expected response:
   ```json
   {
     "ok": true,
     "database": "connected",
     "tests": {
       "select": { "success": true, "rowCount": 0 },
       "tables": {
         "users": true,
         "diary": true,
         "subscriptions": true,
         "payments": true,
         "reminders": true,
         "water_logs": true,
         "app_logs": true,
         "robokassa_invoices": true
       },
       "insert": { "success": true }
     },
     "requestId": "health-db-...",
     "timestamp": "..."
   }
   ```
3. If `ok: false`, check error details in response

## Step 5: Test Telegram Bot

1. Open Telegram
2. Find your bot
3. Send `/start` command
4. Expected: Bot responds with main menu (no "Database error")
5. Send a food message (e.g., "Я съел яблоко")
6. Expected: Bot analyzes and saves to diary

## Step 6: Check Vercel Logs

1. Open Vercel Dashboard
2. Go to **Deployments** → Latest deployment
3. Click **Logs**
4. Look for structured JSON logs:
   ```json
   {"type":"db_error","timestamp":"...","requestId":"...","route":"telegram.start","operation":"select","table":"users","error":{"code":"42P01","message":"..."}}
   ```
5. Verify:
   - Logs include `requestId`
   - Logs include error `code`, `message`, `details`, `hint`
   - No "relation does not exist" errors after migration

## Step 7: Verify Database Tables

1. Open Supabase Dashboard
2. Go to **Table Editor**
3. Verify these tables exist:
   - `users`
   - `diary`
   - `subscriptions`
   - `payments`
   - `reminders`
   - `water_logs`
   - `app_logs`
   - `robokassa_invoices`

## Troubleshooting

### Health endpoint returns `ok: false`
- Check error details in response
- Verify environment variables are set
- Check Vercel logs for client creation errors

### Bot still shows "Database error"
- Check Vercel logs for specific error code
- Verify migration ran successfully
- Check RLS policies allow `service_role` access

### Tables missing after migration
- Re-run migration in Supabase SQL Editor
- Check for errors in SQL Editor output
- Verify you're running migration in correct project

### Environment variables not working
- Ensure variables are set for **Production** environment
- Redeploy after adding variables
- Check variable names match exactly (case-sensitive)
