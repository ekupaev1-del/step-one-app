# Robokassa Error 29 Fix - Testing Checklist

## Summary of Changes

### 1. Database Migration
- **File:** `migrations/create_payments_table.sql`
- **Action:** Run this SQL in Supabase SQL Editor to create the `payments` table
- **Purpose:** Use auto-incrementing `id` (BIGSERIAL) as InvId instead of `Date.now()`

### 2. Code Changes
- **File:** `miniapp/app/api/payments/start/route.ts`
  - Now inserts into `payments` table first
  - Uses database-generated `id` as `InvId`
  - Updates payment record with Robokassa details
  - Improved debug output (only in debug mode)

- **File:** `miniapp/lib/robokassa.ts`
  - Ensured `InvId` is converted to string
  - Marked `generateInvoiceId()` as deprecated

## Pre-Deployment Steps

### Step 1: Run Database Migration
1. Open Supabase Dashboard → SQL Editor
2. Copy contents of `migrations/create_payments_table.sql`
3. Paste and click "Run"
4. Verify table was created:
   ```sql
   SELECT * FROM public.payments LIMIT 1;
   ```

### Step 2: Verify Environment Variables
Ensure these are set in Vercel:
- `ROBOKASSA_MERCHANT_LOGIN`
- `ROBOKASSA_PASSWORD1`
- `ROBOKASSA_PASSWORD2`
- `ROBOKASSA_TEST_MODE` (optional, set to "true" for test mode)
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Testing Checklist

### ✅ Test 1: Payment URL Contains Small InvId
1. Click "Pay" button in Mini App
2. Check browser console or network response
3. **Expected:** `invoiceId` in response should be a small number (e.g., 1, 2, 3, ...)
4. **NOT Expected:** Large timestamp like `1767963870710`
5. **Verify:** Payment URL should contain `InvId=1` (or similar small number)

### ✅ Test 2: Robokassa Page Opens Without Error 29
1. After clicking "Pay", Robokassa payment page should open
2. **Expected:** No error code 29 displayed
3. **Expected:** Payment form loads successfully
4. **If Error 29 appears:** Check Vercel logs for signature calculation issues

### ✅ Test 3: Debug Overlay Shows Correct Fields
1. Add `?debug=1` to URL or wait for payment error
2. Debug panel should show:
   - **Merchant Login:** Your merchant login
   - **Режим:** Тестовый or Продакшн
   - **Сумма (OutSum):** 1.00
   - **Recurring:** Нет
   - **Invoice ID:** Small number (not timestamp)
   - **Payment URL:** First 120 chars of URL
   - **Vercel Env:** production/preview/development
   - **Node Env:** production/development
   - **Signature String:** Masked signature string
   - **Signature Value:** First 8 chars of hash
   - **Signature Checks:** ✓ for length, lowercase, hex

### ✅ Test 4: Payments Row Appears in Supabase
1. After clicking "Pay", check Supabase `public.payments` table
2. **Expected:** New row with:
   - `id`: Small auto-incrementing number (1, 2, 3, ...)
   - `user_id`: Your user ID
   - `plan_code`: "trial_3d_199"
   - `amount`: 1.00
   - `currency`: "RUB"
   - `status`: "created"
   - `robokassa_invoice_id`: Same as `id`
   - `payment_url`: Full Robokassa payment URL
   - `signature`: MD5 hash (if debug mode)
   - `created_at`: Current timestamp

3. **Verify:** `robokassa_invoice_id` matches the `InvId` in payment URL

## Verification Queries

### Check Payments Table Structure
```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'payments'
ORDER BY ordinal_position;
```

### Check Latest Payment
```sql
SELECT id, user_id, plan_code, amount, status, robokassa_invoice_id, created_at
FROM public.payments
ORDER BY created_at DESC
LIMIT 5;
```

### Verify InvId is Small
```sql
SELECT id, robokassa_invoice_id, 
       CASE WHEN id > 2147483647 THEN 'WARNING: Too large' ELSE 'OK' END as size_check
FROM public.payments
ORDER BY id DESC
LIMIT 10;
```

## Vercel Logs to Check

After clicking "Pay", look for these log entries:

```
[payments/start:...] CREATE_PAYMENT_START { userId, outSum, recurring, isTest }
[payments/start:...] Created payment record with InvId: 1
[payments/start:...] CREATE_PAYMENT_SIGNATURE { signatureString, signatureHash, signatureChecks }
[payments/start:...] CREATE_PAYMENT_OK InvId=1 status=created elapsed=XXXms
```

**Key indicators:**
- InvId should be small (1, 2, 3, ...)
- Signature checks should all be `true`
- No errors about "Invalid payment URL"

## Troubleshooting

### If Error 29 Still Appears:
1. Check signature string format in logs
2. Verify `ROBOKASSA_PASSWORD1` is correct
3. Verify `ROBOKASSA_MERCHANT_LOGIN` matches Robokassa account
4. Check if `IsTest` parameter matches Robokassa merchant settings

### If Payment Record Not Created:
1. Check Supabase connection (verify `SUPABASE_SERVICE_ROLE_KEY`)
2. Check RLS policies (should allow service role to insert)
3. Check Vercel logs for database errors

### If InvId Still Large:
1. Verify migration was run successfully
2. Check that code is using `paymentRecord.id` not `generateInvoiceId()`
3. Verify deployment includes latest code changes

## Success Criteria

✅ InvId is small number (≤ 2,147,483,647)  
✅ Robokassa page opens without Error 29  
✅ Debug overlay shows all fields correctly  
✅ Payment record exists in Supabase with correct data  
✅ Signature validation passes (all checks ✓)
