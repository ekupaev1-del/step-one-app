# Final Fixes Summary - Payments Table & Robokassa Error 29

## (A) Database Migration - Complete SQL

**File:** `migrations/fix_payments_table_complete.sql`

This migration is **SAFE and IDEMPOTENT** - can be run multiple times without errors.

### Key Features:
- Creates table if it doesn't exist
- Adds missing columns: `invoice_id` (text), `amount` (numeric(12,2)), `description` (text)
- Updates column types and constraints
- Creates indexes and unique constraints
- Verifies final structure

### Execute in Supabase SQL Editor:
```sql
-- Copy entire content from: migrations/fix_payments_table_complete.sql
-- Then click "Run"
```

### PostgREST Cache Refresh:
After migration, cache refreshes automatically. If needed:
- Wait 1-2 minutes
- Or restart Supabase API
- Migration includes `pg_notify('pgrst', 'reload schema')`

---

## (B) Robokassa Signature Generation - Code Snippet

### Signature Calculation Function:

```typescript
/**
 * Calculate MD5 signature for Robokassa
 * CRITICAL: Returns lowercase hex (Robokassa requirement)
 * Signature must match regex: /^[0-9a-f]{32}$/
 */
function calculateSignature(...args: string[]): string {
  const signatureString = args.join(':');
  const hash = createHash('md5').update(signatureString).digest('hex');
  const hashLowercase = hash.toLowerCase(); // Robokassa requires lowercase
  return hashLowercase;
}
```

### Signature String Composition:

```typescript
// Order: MerchantLogin:OutSum:InvId:Receipt:Password1:Shp_*
const signatureParts: string[] = [
  merchantLogin,    // e.g., "steopone"
  outSum,           // e.g., "1.00" (exactly 2 decimals)
  invId,            // e.g., "123456789" (string)
];

// Add Receipt ONLY if it's present in the form
if (receipt) {
  signatureParts.push(receipt); // Single URL-encoded
}

// Add Password1
signatureParts.push(password1);

// Add Shp_* parameters AFTER Password1, sorted alphabetically
const shpParams: string[] = [];
for (const [key, value] of Object.entries(fields)) {
  if (key.startsWith('Shp_')) {
    shpParams.push(`${key}=${value}`); // Format: "Shp_userId=497201688"
  }
}
shpParams.sort(); // Alphabetical order
signatureParts.push(...shpParams);

// Calculate signature
const signatureValue = calculateSignature(...signatureParts);
// Result: 32-character lowercase hex string matching /^[0-9a-f]{32}$/
```

### Rules:
1. ✅ **MD5 hash:** Always lowercase (`toLowerCase()`)
2. ✅ **Regex:** Must match `/^[0-9a-f]{32}$/`
3. ✅ **Receipt:** Included ONLY if present in form, single-encoded
4. ✅ **Shp_*:** Sorted alphabetically, AFTER Password1
5. ✅ **Recurring:** Does NOT participate in signature
6. ✅ **IsTest:** Does NOT participate in signature

---

## Verification Checklist

### In Supabase (After Migration):

```sql
-- 1. Verify all columns exist
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'payments'
ORDER BY ordinal_position;

-- Expected columns:
-- id, created_at, updated_at, user_id, telegram_user_id, 
-- inv_id, invoice_id, amount, out_sum, mode, status, description, debug

-- 2. Verify indexes
SELECT indexname FROM pg_indexes 
WHERE tablename = 'payments' AND schemaname = 'public';

-- 3. Verify unique constraint on inv_id
SELECT conname FROM pg_constraint 
WHERE conrelid = 'public.payments'::regclass 
AND contype = 'u';
```

### In Vercel Logs (After Deploy):

**Startup logs (first request):**
```
[robokassa/create-trial] ========== PAYMENTS TABLE SCHEMA INFO ==========
[robokassa/create-trial] Using Supabase client with default schema: public
[robokassa/create-trial] Payments table: public.payments (default schema)
[robokassa/create-trial] Insert will target: public.payments
```

**Signature generation logs:**
```
[robokassa] ========== SIGNATURE CALCULATION (Error 29 Debug) ==========
[robokassa] Exact signature string (masked): MerchantLogin:OutSum:InvId:Receipt:[PASSWORD1_HIDDEN]:Shp_userId=...
[robokassa] Signature value (MD5, lowercase): <32-char hex>
[robokassa] Signature value regex validation (/^[0-9a-f]{32}$/): true
[robokassa] Signature value length: 32
[robokassa] Signature value is lowercase: true
```

**Payment creation logs:**
```
[robokassa/create-trial] Signature value: <32-char lowercase hex>
[robokassa/create-trial] Signature regex validation (/^[0-9a-f]{32}$/): true
[robokassa/create-trial] Exact signature string (masked): <masked string>
```

**No errors:**
- ✅ No PGRST204 errors
- ✅ No "schema cache" errors
- ✅ No "missing column" errors

### Test Payment:

1. **Create payment:**
   ```
   GET /api/robokassa/create-trial?telegramUserId=497201688&mode=recurring
   ```

2. **Verify response:**
   - HTML form with all fields
   - SignatureValue is 32-character lowercase hex
   - Receipt is single-encoded

3. **Submit to Robokassa:**
   - No Error 29
   - Payment processes successfully

4. **Check database:**
   - Record created in `public.payments`
   - All fields populated correctly

---

## Files Changed

1. **`migrations/fix_payments_table_complete.sql`** - Complete table migration
2. **`miniapp/lib/robokassa.ts`** - Signature generation (lowercase), regex validation
3. **`miniapp/app/api/robokassa/create-trial/route.ts`** - Debug logs, invoice_id handling

---

## Summary

### Database (A):
- ✅ Complete migration with all required columns
- ✅ Idempotent and safe to run multiple times
- ✅ Proper indexes and constraints
- ✅ PostgREST cache refresh included

### Robokassa Signature (B):
- ✅ Lowercase MD5 hash (was UPPERCASE)
- ✅ Regex validation `/^[0-9a-f]{32}$/`
- ✅ Correct signature order
- ✅ Receipt included only if present
- ✅ Recurring/IsTest excluded from signature
- ✅ Comprehensive debug logging

**All changes committed and pushed to `dev` branch.**

