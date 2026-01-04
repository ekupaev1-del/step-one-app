# Robokassa Recurring Payments Implementation

## Overview

This document describes the two payment flows for Robokassa recurring payments:

1. **Parent Payment (Trial)**: 1 RUB payment with `Recurring=true` to bind card
2. **Child Payment (Monthly)**: 199 RUB recurring charge using `PreviousInvoiceID`

## Endpoints

### 1. Parent Payment (Trial)

**Endpoint**: `POST /api/robokassa/create-trial-payment?telegramUserId=...&debug=1`

**Purpose**: Creates trial payment (1 RUB) with `Recurring=true` for card binding.

**Response**:
```json
{
  "ok": true,
  "actionUrl": "https://auth.robokassa.ru/Merchant/Index.aspx",
  "fields": {
    "MerchantLogin": "steopone",
    "OutSum": "1.00",
    "InvId": "1234567890",
    "Description": "Step One — trial 3 days",
    "Recurring": "true",
    "Receipt": "...",
    "SignatureValue": "...",
    "Shp_userId": "123456789"
  },
  "debug": { ... } // Only if debug=1
}
```

**Signature Formula**:
```
MD5(MerchantLogin:OutSum:InvId:Receipt:Password1:Shp_userId=...)
```

**Notes**:
- Includes `Receipt` for fiscalization
- Includes `Recurring=true` field
- Receipt is URL-encoded and included in signature

### 2. Child Payment (Monthly Recurring)

**Endpoint**: `POST /api/robokassa/create-recurring?telegramUserId=...&previousInvoiceId=...&debug=1`

**Purpose**: Creates child recurring payment (199 RUB) using parent invoice ID.

**Response**:
```json
{
  "ok": true,
  "actionUrl": "https://auth.robokassa.ru/Merchant/Recurring",
  "fields": {
    "MerchantLogin": "steopone",
    "OutSum": "199.00",
    "InvoiceID": "9876543210",
    "PreviousInvoiceID": "1234567890",
    "Description": "Step One — monthly subscription",
    "SignatureValue": "...",
    "Shp_userId": "123456789"
  },
  "debug": { ... } // Only if debug=1
}
```

**Signature Formula**:
```
MD5(MerchantLogin:OutSum:InvoiceID:Password1:Shp_userId=...)
```

**CRITICAL RULES**:
- `PreviousInvoiceID` is **NOT** included in signature
- `Receipt` is **NOT** included (no Receipt field)
- `Recurring` is **NOT** included (no Recurring field)
- Uses `InvoiceID` (not `InvId`) for Recurring endpoint

## Result Handler

**Endpoint**: `POST /api/robokassa/result`

**Purpose**: Handles Robokassa callback after payment completion.

**Actions**:
1. Validates signature using `Password2`
2. Updates payment status:
   - Parent payment (1 RUB): `trial_active`
   - Child payment (199 RUB): `subscription_active`
3. Creates/updates subscription in `subscriptions` table
4. Stores `parent_invoice_id` for recurring charges

## Database Schema

### payments table
- `inv_id`: Invoice ID (BIGINT)
- `parent_invoice_id`: Parent invoice ID for child payments (BIGINT, nullable)
- `status`: Payment status (`trial_pending_payment`, `trial_active`, `subscription_pending`, `subscription_active`, `paid`)
- `mode`: Payment mode (`minimal`, `recurring`)

### subscriptions table
- `user_id`: User ID (BIGINT)
- `status`: Subscription status (`trial`, `active`, `expired`, `cancelled`)
- `plan_type`: Plan type (`trial`, `standard`, `standard_plus`)
- `trial_ends_at`: Trial end date (TIMESTAMPTZ, nullable)

## Environment Variables

Required in Vercel:
- `ROBOKASSA_MERCHANT_LOGIN=steopone`
- `ROBOKASSA_PASSWORD1=...` (for signature generation)
- `ROBOKASSA_PASSWORD2=...` (for callback verification)
- `ROBOKASSA_TEST_MODE=false` (for production)
- `ROBOKASSA_DEBUG_KEY=...` (for debug endpoint)

## Debug Mode

Add `?debug=1` to any endpoint to get debug information:
- `exactSignatureStringMasked`: Signature string with password masked
- `signatureValue`: Calculated signature value
- `fieldsKeys`: List of form field keys
- `actionUrl`: Form action URL
- `receiptIncluded`: Whether Receipt is included
- `note`: Additional notes

## Acceptance Checklist

✅ Parent flow:
- Form posts to `https://auth.robokassa.ru/Merchant/Index.aspx`
- Has `Recurring=true`
- SignatureValue matches Robokassa (no error 29)

✅ After payment, `/api/robokassa/result` stores parent InvId for the user

✅ Child flow:
- Form posts to `https://auth.robokassa.ru/Merchant/Recurring`
- Contains `PreviousInvoiceID` and `InvoiceID`
- SignatureValue does **NOT** include `PreviousInvoiceID`

✅ No "minimal mode" remains in repo

✅ All credentials read from env and validated

✅ Money always "X.00" format, dot separator

