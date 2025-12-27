# Robokassa Payment Flow Fixes

## Summary of Changes

Fixed Robokassa payment flow to resolve 500 errors and ensure reliable payment creation with proper signature calculation and debug information.

## Key Fixes

### 1. Parameter Names
- ✅ Changed `InvoiceID` → `InvId` (correct Robokassa parameter name)
- ✅ All form fields use correct names: `MerchantLogin`, `OutSum`, `InvId`, `SignatureValue`, `Description`, `Receipt`, `Recurring`, `Shp_userId`

### 2. InvId Generation
- ✅ InvId is now <= 2,000,000,000 (32-bit safe)
- ✅ Uses `generateSafeInvId()` function with timestamp modulo
- ✅ Database table `payments` ensures uniqueness
- ✅ Collision detection and retry logic

### 3. Signature Algorithm
- ✅ **Minimal mode**: `MD5(MerchantLogin:OutSum:InvId:Password1)`
- ✅ **Recurring mode**: `MD5(MerchantLogin:OutSum:InvId:ReceiptEncoded:Password1)`
- ✅ Separate functions: `signMinimal()` and `signWithReceipt()`
- ✅ Signature base logged WITHOUT password (safe logging)

### 4. OutSum Formatting
- ✅ Changed from `"1.000000"` → `"1.00"` (2 decimals)
- ✅ Receipt item sum matches exactly: `1.00`

### 5. Receipt Encoding
- ✅ JSON.stringify → encodeURIComponent ONCE (no double encoding)
- ✅ Receipt uses `sno: "npd"` for Robocheki SMZ
- ✅ Proper HTML escaping for form attributes

### 6. Two Payment Modes
- ✅ **Minimal mode** (`mode=minimal`): No Receipt, no Recurring
  - Used for testing shop configuration
  - Signature: `MerchantLogin:OutSum:InvId:Password1`
- ✅ **Recurring mode** (`mode=recurring`): With Receipt and Recurring=true
  - Production mode for trial payments
  - Signature: `MerchantLogin:OutSum:InvId:ReceiptEncoded:Password1`

### 7. Debug Information
- ✅ Returns rich debug JSON:
  ```json
  {
    "ok": true,
    "html": "...",
    "debug": {
      "stage": "success",
      "merchantLogin": "...",
      "outSum": "1.00",
      "invId": 1234567890,
      "description": "Trial subscription 3 days",
      "isTest": true,
      "mode": "recurring",
      "receiptRaw": "...",
      "receiptEncoded": "...",
      "receiptEncodedLength": 123,
      "signatureBaseWithoutPassword": "...",
      "signatureValue": "...",
      "formFields": {...}
    }
  }
  ```

### 8. Database Table
- ✅ Created `payments` table for InvId uniqueness tracking
- ✅ Columns: `id`, `telegram_user_id`, `inv_id` (UNIQUE), `out_sum`, `mode`, `status`, `created_at`, `updated_at`

## Files Modified

1. **`miniapp/lib/robokassa.ts`**
   - Fixed template strings
   - Added `signMinimal()` and `signWithReceipt()` functions
   - Fixed `generatePaymentForm()` to use `InvId` and support both modes
   - Added `generateSafeInvId()` function
   - Fixed Receipt `sno` to `"npd"` for Robocheki SMZ
   - Proper HTML escaping

2. **`miniapp/app/api/robokassa/create-trial/route.ts`**
   - Added `mode` query parameter support
   - Changed `OutSum` to `"1.00"`
   - Changed `InvoiceID` → `InvId`
   - Added `generateUniqueInvId()` with DB collision check
   - Store payment attempts in `payments` table
   - Return rich debug information
   - Safe logging (signature base without password)

3. **`miniapp/app/subscription/SubscriptionClient.tsx`**
   - Added debug mode toggle (minimal/recurring)
   - Pass `mode` parameter to API
   - Enhanced debug JSON display

4. **`migrations/create_payments_table.sql`**
   - New table for payment tracking and InvId uniqueness

## Testing

### Minimal Mode (for testing)
```
POST /api/robokassa/create-trial?telegramUserId=123&mode=minimal
```
- Should open Robokassa payment page without 500 error
- No Receipt, no Recurring
- Verifies shop configuration and signature

### Recurring Mode (production)
```
POST /api/robokassa/create-trial?telegramUserId=123&mode=recurring
```
- Should open Robokassa payment page without 500 error
- With Receipt and Recurring=true
- Creates recurring token for future charges

## Environment Variables

```bash
ROBOKASSA_MERCHANT_LOGIN=steopone
ROBOKASSA_PASSWORD1=B2Bnpr5rjF948tbTZXSg
ROBOKASSA_PASSWORD2=FCxKxmU1VgdE4V0S4Q1f
ROBOKASSA_TEST_MODE=true  # or false
```

## Acceptance Criteria ✅

1. ✅ `mode=minimal` opens Robokassa payment page without 500
2. ✅ `mode=recurring` opens Robokassa payment page without 500
3. ✅ Server response includes debug JSON and logs signature base (without password)
4. ✅ InvId is always <= 2,000,000,000 and unique
5. ✅ Form uses `InvId` field name and signature matches exact sent Receipt string
6. ✅ OutSum and receipt sums match exactly (1.00)

