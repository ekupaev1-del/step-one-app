# Robokassa Error 29 Fix & Postgres Migration Summary

## Task A: Robokassa SignatureValue Fix (Error 29)

### Changes Implemented

1. **Double URL Encoding for Receipt** ✅
   - `receiptOnce = urlencode(JSON string)` - used in SignatureValue calculation
   - `receiptTwice = urlencode(receiptOnce)` - sent in HTTP form as Receipt parameter
   - SignatureValue now uses `receiptOnce` (single-encoded), NOT `receiptTwice` (double-encoded)

2. **Signature String Order** ✅
   - Order: `MerchantLogin:OutSum:InvId:receiptOnce:Password1:Shp_userId=...`
   - Shp_* parameters are sorted alphabetically AFTER Password1
   - Receipt (receiptOnce) is included BEFORE Password1 if present

3. **OutSum and InvId Formatting** ✅
   - OutSum: Invariant culture with exactly 2 decimals (e.g., "1.00")
   - InvId: Plain integer string (converted from number)

4. **Recurring Parameter** ✅
   - `Recurring=true` is included in form when mode is 'recurring'
   - Recurring is NOT included in SignatureValue (only in form)

5. **Detailed Debug Logging** ✅
   - Logs `receiptRaw` JSON
   - Logs `receiptOnce` and `receiptTwice` lengths + first 80 chars
   - Logs exact signature base string (with Password1 masked)
   - Logs final SignatureValue
   - Logs final form fields sent to Robokassa

### Files Modified

- `miniapp/lib/robokassa.ts`:
  - Updated `buildRobokassaFields()` to implement double encoding
  - Updated `buildRobokassaSignature()` to use receiptOnce for signature
  - Added comprehensive debug logging
  - Updated all receipt references to distinguish receiptOnce vs receiptTwice

- `miniapp/app/api/robokassa/create-trial/route.ts`:
  - Updated to generate receiptOnce and receiptTwice
  - Updated `storePaymentAttempt()` to use receiptOnce in debug field

## Task B: Postgres Error Fix (PGRST204)

### Error
```
PGRST204 "Could not find the 'description' column of 'payments' in the schema 'cache'"
```

### Solution

1. **SQL Migration Created** ✅
   - File: `migrations/fix_cache_payments_description.sql`
   - Adds `description` column to `public.payments` table (TEXT, nullable)
   - Includes PostgREST schema cache reload
   - Verifies column existence and all required columns

2. **Code Verification** ✅
   - Verified `insertPayload` in `create-trial/route.ts` matches schema
   - All required columns are present: `user_id`, `telegram_user_id`, `inv_id`, `out_sum`, `mode`, `status`, `description`, `debug`

### Migration Files

- `migrations/fix_cache_payments_description.sql` (new, enhanced version)
- `migrations/add_description_to_payments.sql` (existing, still valid)

## Production Verification Checklist

### 1. Robokassa Error 29 Fix

- [ ] Deploy code changes to Vercel
- [ ] Test payment creation in test mode
- [ ] Verify debug logs show:
  - [ ] `receiptOnce` (single-encoded) used in signature
  - [ ] `receiptTwice` (double-encoded) sent in form
  - [ ] Signature string order: `MerchantLogin:OutSum:InvId:receiptOnce:Password1:Shp_userId=...`
  - [ ] SignatureValue is 32-character lowercase hex MD5
- [ ] Submit test payment to Robokassa
- [ ] Verify no Error 29 (Invalid SignatureValue)
- [ ] Check Vercel logs for detailed debug output

### 2. Postgres Migration

- [ ] Run SQL migration in Supabase SQL Editor:
  ```sql
  -- Execute: migrations/fix_cache_payments_description.sql
  ```
- [ ] Verify migration completes without errors
- [ ] Check that `description` column exists:
  ```sql
  SELECT column_name, data_type 
  FROM information_schema.columns 
  WHERE table_schema = 'public' 
  AND table_name = 'payments' 
  AND column_name = 'description';
  ```
- [ ] Test payment creation API endpoint
- [ ] Verify no PGRST204 errors in Vercel logs
- [ ] Check that payment record is inserted successfully with description field

### 3. End-to-End Test

- [ ] Create trial payment via API: `/api/robokassa/create-trial?telegramUserId=XXX&mode=recurring`
- [ ] Verify response includes debug info with receiptOnce/receiptTwice
- [ ] Submit payment form to Robokassa
- [ ] Verify payment processes successfully (no Error 29)
- [ ] Check database: payment record should have `description` field populated
- [ ] Verify no PostgREST errors in logs

### 4. Debug Logging Verification

Check Vercel logs for:
- [ ] `[robokassa] ========== RECEIPT ENCODING (Error 29 Fix) ==========`
- [ ] `receiptRaw JSON:` (full JSON)
- [ ] `receiptOnce (length):` and preview (first 80 chars)
- [ ] `receiptTwice (length):` and preview (first 80 chars)
- [ ] `[robokassa] ========== SIGNATURE CALCULATION (Error 29 Debug) ==========`
- [ ] `Exact signature string (masked):` (with Password1 hidden)
- [ ] `Signature value (MD5, lowercase):` (32-char hex)
- [ ] `[robokassa] ========== FIELD-BY-FIELD VERIFICATION (Error 29) ==========`
- [ ] All field matches show ✅

## Key Implementation Details

### Receipt Encoding Flow

```
receipt (object)
  ↓ JSON.stringify()
receiptJson (string)
  ↓ encodeURIComponent() [FIRST]
receiptOnce (single-encoded) ← Used in SignatureValue
  ↓ encodeURIComponent() [SECOND]
receiptTwice (double-encoded) ← Sent in HTTP form as Receipt parameter
```

### Signature Calculation

```
SignatureValue = MD5(
  MerchantLogin:OutSum:InvId:receiptOnce:Password1:Shp_userId=...
)
```

**Important**: 
- Form sends `receiptTwice` (double-encoded)
- Signature uses `receiptOnce` (single-encoded)
- These are DIFFERENT values - this is CORRECT!

### Form Fields Sent to Robokassa

```
MerchantLogin: steopone
OutSum: 1.00
InvId: <integer>
Description: Trial subscription 3 days
Receipt: <receiptTwice - double-encoded>
Recurring: true
Shp_userId: <telegram_user_id>
SignatureValue: <MD5 hash>
IsTest: 1 (if test mode)
```

## Rollback Plan

If issues occur:

1. **Robokassa Error 29 persists:**
   - Check debug logs for exact signature string
   - Verify receiptOnce vs receiptTwice usage
   - Compare with Robokassa official examples
   - Check Password1 value is correct

2. **Postgres Error persists:**
   - Verify migration was executed
   - Check PostgREST cache refresh
   - Restart PostgREST service if needed
   - Verify table schema matches code expectations

## Files Changed

### Modified Files
- `miniapp/lib/robokassa.ts` - Receipt double encoding, signature fix, debug logging
- `miniapp/app/api/robokassa/create-trial/route.ts` - Updated to use receiptOnce/receiptTwice

### New Files
- `migrations/fix_cache_payments_description.sql` - Enhanced migration for description column

### Existing Files (unchanged, but referenced)
- `migrations/add_description_to_payments.sql` - Original migration (still valid)
- `migrations/create_payments_table_final.sql` - Base table schema

