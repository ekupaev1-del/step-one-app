# Deployment Checklist: Payment System Fix

## Pre-Deployment Steps

### 1. Apply Database Migration

**Execute in Supabase SQL Editor:**

1. Open Supabase Dashboard → Your Project → SQL Editor
2. Open file: `migrations/fix_payments_table_schema.sql`
3. Copy entire SQL content
4. Paste into SQL Editor
5. Click "Run" or press Ctrl+Enter
6. Wait for success message
7. Wait 1-2 minutes for schema cache to refresh

**Verification:**
```sql
-- Run this to verify all columns exist
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'payments' 
ORDER BY ordinal_position;

-- Should show: id, user_id, telegram_user_id, plan_code, amount, currency, 
-- method, provider, inv_id, status, payment_url, created_at, updated_at
```

### 2. Verify Environment Variables in Vercel

**Required Variables (Primary):**
- `ROBOKASSA_MERCHANT_LOGIN` ✅
- `ROBOKASSA_PASSWORD1` ✅
- `ROBOKASSA_PASSWORD2` ✅
- `APP_BASE_URL` (e.g., `https://your-app.vercel.app`)

**Optional (Backward Compatibility):**
- `ROBO_MERCHANT_LOGIN` (fallback)
- `ROBO_PASSWORD1` (fallback)
- `ROBO_PASSWORD2` (fallback)

**Check in Vercel:**
1. Go to Project Settings → Environment Variables
2. Verify all `ROBOKASSA_*` variables are set
3. Ensure `APP_BASE_URL` is set to production URL

### 3. Deploy Code

**Via Git Push:**
```bash
git add .
git commit -m "fix: payment system end-to-end with unified config and schema fix"
git push origin main
```

Vercel will automatically deploy.

**Or via Vercel CLI:**
```bash
vercel --prod
```

## Post-Deployment Verification

### 1. Test Health Endpoint

```bash
curl https://your-app.vercel.app/api/payments/health
```

**Expected Response:**
```json
{
  "ok": true,
  "providers": {
    "robokassa": {
      "configured": true,
      "source": "ROBOKASSA_*",
      "envVarStatus": {
        "robokassaMerchantLogin": true,
        "robokassaPassword1": true,
        "robokassaPassword2": true,
        "roboMerchantLogin": false,
        "roboPassword1": false,
        "roboPassword2": false
      },
      "missingEnvVars": []
    }
  }
}
```

### 2. Test Payment Start Flow

1. Open subscription page: `https://your-app.vercel.app/subscription?id=YOUR_USER_ID`
2. Select payment method (SBP or Card)
3. Check both consent checkboxes
4. Click "Оплатить"
5. Verify:
   - ✅ No 500 errors
   - ✅ Payment URL opens
   - ✅ Debug panel shows correct config status
   - ✅ Payment record created in DB

### 3. Verify Database

**Check payment record:**
```sql
SELECT id, user_id, telegram_user_id, method, plan_code, currency, 
       inv_id, status, payment_url, created_at
FROM payments
ORDER BY created_at DESC
LIMIT 5;
```

**Verify:**
- ✅ All columns populated (no NULL in NOT NULL columns)
- ✅ `inv_id` is TEXT and unique
- ✅ `telegram_user_id` is TEXT and not empty
- ✅ `method` is 'sbp' or 'card'
- ✅ `status` is 'created'

## Troubleshooting

### Issue: "Could not find the 'method' column"

**Solution:** Migration not applied. Re-run `fix_payments_table_schema.sql` in Supabase SQL Editor.

### Issue: "Платежный провайдер не настроен"

**Solution:** 
1. Check Vercel env vars: `ROBOKASSA_MERCHANT_LOGIN`, `ROBOKASSA_PASSWORD1`, `ROBOKASSA_PASSWORD2`
2. Verify they're set in Production environment
3. Redeploy after adding vars

### Issue: Schema cache not refreshed

**Solution:**
1. Wait 2-3 minutes after migration
2. Or restart Supabase project (Settings → Restart)
3. Or call: `SELECT pg_notify('pgrst', 'reload schema');` in SQL Editor

### Issue: telegram_user_id is NULL

**Solution:** This should not happen with new code. If it does:
1. Check logs for "WARNING: No telegram_user_id found"
2. Verify Telegram WebApp initData is being sent
3. Check fallback logic in `getTelegramUserId()`

## Rollback Plan

If issues occur:

1. **Revert code:**
   ```bash
   git revert HEAD
   git push origin main
   ```

2. **Database:** Migration is idempotent, no rollback needed. Old columns remain.

3. **Env vars:** Keep both `ROBOKASSA_*` and `ROBO_*` during transition.

## Success Criteria

✅ Health endpoint returns `configured: true`  
✅ Payment start returns 200 with `paymentUrl`  
✅ Payment record created in DB with all columns  
✅ No schema errors in logs  
✅ Debug panel shows correct config status  
✅ Payment URL opens successfully  

## Notes

- Migration is **idempotent** - safe to run multiple times
- Code supports both `ROBOKASSA_*` (primary) and `ROBO_*` (fallback)
- `telegram_user_id` fallback: `dev:${userId}` in dev, `prod:${userId}` in production
- All secrets are **never** exposed in debug output (only booleans)
