# Fixes Checklist - Payments Table & Robokassa Error 29

## (A) Database Migration

### SQL Migration File
**File:** `migrations/fix_payments_table_complete.sql`

### Steps to Execute:
1. Open Supabase Dashboard → SQL Editor
2. Copy and paste the entire content of `fix_payments_table_complete.sql`
3. Click "Run" to execute
4. Verify success message: "Migration completed successfully. All required columns exist in public.payments."

### Expected Table Structure After Migration:
```sql
public.payments:
  - id uuid PRIMARY KEY (default gen_random_uuid())
  - created_at timestamptz NOT NULL (default now())
  - updated_at timestamptz (default now())
  - user_id uuid NULL (references users.id)
  - telegram_user_id bigint NOT NULL
  - inv_id bigint NOT NULL (UNIQUE)
  - invoice_id text NULL
  - amount numeric(12,2) NOT NULL
  - out_sum numeric(12,2) NOT NULL
  - mode text NOT NULL (check: 'minimal'|'recurring')
  - status text NOT NULL (default 'created', check: 'created'|'paid'|'failed'|'canceled')
  - description text NULL
  - debug jsonb NULL

Indexes:
  - payments_telegram_user_id_idx
  - payments_inv_id_idx
  - payments_user_id_idx
  - payments_status_idx

Constraints:
  - payments_inv_id_key (UNIQUE)
  - payments_mode_check
  - payments_status_check
```

### PostgREST Schema Cache Refresh:
After migration, PostgREST cache will refresh automatically. If errors persist:
- Wait 1-2 minutes for automatic refresh
- Or restart Supabase API (if you have access)
- The migration includes `SELECT pg_notify('pgrst', 'reload schema');` to trigger refresh

---

## (B) Robokassa Signature Fix

### Signature Generation Rules:
1. **MD5 Hash:** Always lowercase (`md5(signatureString).toLowerCase()`)
2. **Regex Validation:** Must match `/^[0-9a-f]{32}$/`
3. **Signature String Order:**
   ```
   MerchantLogin:OutSum:InvId:Receipt:Password1:Shp_userId=...
   ```
   - Receipt included ONLY if present in form
   - Shp_* parameters sorted alphabetically AFTER Password1
4. **Receipt Encoding:** Single URL encoding (same value for form and signature)
5. **Recurring:** Does NOT participate in signature
6. **IsTest:** Does NOT participate in signature

### Code Changes:
- `miniapp/lib/robokassa.ts`: Signature now returns lowercase MD5
- `miniapp/app/api/robokassa/create-trial/route.ts`: Added regex validation logs

---

## Verification Checklist

### In Supabase (After Migration):

- [ ] Run migration `fix_payments_table_complete.sql`
- [ ] Verify all columns exist:
  ```sql
  SELECT column_name, data_type, is_nullable 
  FROM information_schema.columns 
  WHERE table_schema = 'public' 
  AND table_name = 'payments'
  ORDER BY ordinal_position;
  ```
- [ ] Verify indexes exist:
  ```sql
  SELECT indexname FROM pg_indexes 
  WHERE tablename = 'payments' AND schemaname = 'public';
  ```
- [ ] Verify unique constraint on inv_id:
  ```sql
  SELECT conname FROM pg_constraint 
  WHERE conrelid = 'public.payments'::regclass 
  AND contype = 'u';
  ```

### In Vercel Logs (After Deploy):

- [ ] Check startup logs for schema info:
  ```
  [robokassa/create-trial] ========== PAYMENTS TABLE SCHEMA INFO ==========
  [robokassa/create-trial] Using Supabase client with default schema: public
  [robokassa/create-trial] Payments table: public.payments (default schema)
  [robokassa/create-trial] Insert will target: public.payments
  ```

- [ ] Test payment creation API:
  ```
  GET /api/robokassa/create-trial?telegramUserId=XXX&mode=recurring
  ```

- [ ] Verify signature logs:
  ```
  [robokassa] Signature value (MD5, lowercase): <32-char hex>
  [robokassa] Signature value regex validation (/^[0-9a-f]{32}$/): true
  [robokassa] Exact signature string (masked): MerchantLogin:OutSum:InvId:Receipt:[PASSWORD1_HIDDEN]:Shp_userId=...
  ```

- [ ] Verify no PGRST204 errors:
  - No "Could not find the 'invoice_id' column" errors
  - No "Could not find the 'description' column" errors
  - No "schema cache" errors

- [ ] Verify database insert succeeds:
  - Check that payment record is created in `public.payments`
  - All fields from insert payload should be present

### Test Payment Flow:

1. **Create Payment:**
   ```
   GET /api/robokassa/create-trial?telegramUserId=497201688&mode=recurring
   ```

2. **Check Response:**
   - Should return HTML form with all fields
   - SignatureValue should be 32-character lowercase hex
   - Receipt should be single-encoded

3. **Submit to Robokassa:**
   - Form should submit successfully
   - No Error 29 (Invalid SignatureValue)
   - Payment should process

4. **Verify Database:**
   - Check `public.payments` table for new record
   - Verify all fields are populated correctly

---

## Summary of Changes

### Files Modified:
1. `migrations/fix_payments_table_complete.sql` - Complete table migration
2. `miniapp/lib/robokassa.ts` - Signature generation (lowercase), regex validation
3. `miniapp/app/api/robokassa/create-trial/route.ts` - Debug logs, invoice_id handling

### Key Fixes:
- ✅ Added missing columns: `invoice_id`, `amount`, `description`
- ✅ Signature now lowercase (was UPPERCASE)
- ✅ Added regex validation `/^[0-9a-f]{32}$/`
- ✅ Receipt included only if present in form
- ✅ Proper signature order: MerchantLogin:OutSum:InvId:Receipt:Password1:Shp_*
- ✅ Recurring and IsTest excluded from signature
- ✅ Startup logging for schema verification

---

## Next Steps

1. **Execute SQL migration** in Supabase
2. **Wait for Vercel deploy** (automatic from dev branch)
3. **Test payment creation** and verify logs
4. **Submit test payment** to Robokassa
5. **Verify no errors** in Vercel logs or Robokassa

