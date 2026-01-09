# Subscription System Implementation

## Overview

This document describes the subscription system implementation with Robokassa payment integration.

## Architecture

- **Mini App (Next.js)**: User interface and API endpoints
- **Supabase (Postgres)**: Single source of truth for all subscription data
- **Robokassa**: Payment provider (RUB)
- **Vercel Cron Jobs**: Automated subscription management

## Database Schema

### Users Table Fields

The following fields have been added to the `users` table:

- `subscription_status` (TEXT): `'trial' | 'active' | 'expired' | NULL`
- `trial_end_at` (TIMESTAMPTZ): End date of trial period
- `subscription_end_at` (TIMESTAMPTZ): End date of active subscription
- `robokassa_parent_invoice_id` (TEXT): Parent invoice ID from Robokassa
- `last_payment_at` (TIMESTAMPTZ): Last successful payment timestamp

**Migration File**: `migrations/add_subscription_fields.sql`

Execute this migration in Supabase SQL Editor before deploying.

## API Endpoints

### 1. Payment Start
**Endpoint**: `POST /api/payments/start`

**Request Body**:
```json
{
  "userId": 123456789
}
```

**Response**:
```json
{
  "ok": true,
  "paymentUrl": "https://auth.robokassa.ru/Merchant/Index.aspx?...",
  "invoiceId": "1234567890",
  "amount": "1.00"
}
```

**Responsibilities**:
- Creates Robokassa invoice for 1 RUB
- Sets `subscription_status = 'trial'`
- Sets `trial_end_at = now() + 3 days`
- Stores `robokassa_parent_invoice_id`

**Location**: `miniapp/app/api/payments/start/route.ts`

### 2. Robokassa Callback
**Endpoint**: `POST /api/robokassa/result`

**Request**: Form data from Robokassa

**Response**: `OK{InvId}` (Robokassa requirement)

**Responsibilities**:
- Validates signature using PASSWORD2
- Confirms trial payment
- Updates `last_payment_at`
- Does NOT activate subscription (handled by cron)

**Location**: `miniapp/app/api/robokassa/result/route.ts`

### 3. Cron Endpoint
**Endpoint**: `GET /api/cron/subscriptions`

**Security**: Requires `Authorization: Bearer ${CRON_SECRET}` header

**Schedule**: Every 10 minutes (`*/10 * * * *`)

**Logic**:
1. Finds users where `subscription_status = 'trial'` AND `trial_end_at < now()`
2. Attempts to charge 199 RUB via Robokassa
3. If successful: `subscription_status = 'active'`, `subscription_end_at = now() + 30 days`
4. If failed: `subscription_status = 'expired'`

**Location**: `miniapp/app/api/cron/subscriptions/route.ts`

**Logs**:
- `[cron] started <ISO timestamp>`
- `[cron] user <id> charged successfully`
- `[cron] user <id> payment failed`

## Vercel Cron Configuration

**File**: `vercel.json` (project root)

```json
{
  "crons": [
    {
      "path": "/api/cron/subscriptions",
      "schedule": "*/10 * * * *"
    }
  ]
}
```

**Important**: 
- If Vercel Root Directory = `miniapp`, move `vercel.json` to `miniapp/vercel.json`
- Otherwise, keep it in project root

## Robokassa Integration

### Signature Algorithm

**DO NOT MODIFY** - Uses existing Robokassa signature logic:

1. **MD5 Hash**: Always lowercase
2. **Format**: `MerchantLogin:OutSum:InvId:Password1:Shp_userId=...`
3. **Shp_* parameters**: Sorted alphabetically AFTER Password1
4. **Validation**: Must match `/^[0-9a-f]{32}$/`

**Location**: `miniapp/lib/robokassa.ts`

### Environment Variables

Required in Vercel:
- `ROBOKASSA_MERCHANT_LOGIN`
- `ROBOKASSA_PASSWORD1`
- `ROBOKASSA_PASSWORD2`
- `CRON_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`

## UI Component

**Subscription Button**

**Location**: `miniapp/app/profile/page.tsx`

**Text**: "Оформить подписку — 1 ₽ за 3 дня, затем 199 ₽"

**Behavior**:
- Calls `/api/payments/start`
- Redirects to Robokassa payment URL
- No payment logic in UI

## Subscription Flow

1. User clicks "Оформить подписку" button
2. Mini App calls `/api/payments/start` with `userId`
3. Backend creates Robokassa invoice for 1 RUB
4. User redirected to Robokassa payment page
5. User completes payment
6. Robokassa calls `/api/robokassa/result` (callback)
7. Callback validates signature and confirms payment
8. User has `subscription_status = 'trial'` for 3 days
9. After 3 days, cron endpoint runs:
   - Finds expired trials
   - Attempts to charge 199 RUB
   - Updates subscription status

## Verification

### Check Cron Execution

1. **Vercel Dashboard** → **Logs**
2. Wait 10 minutes after deployment
3. Look for: `[cron] started <timestamp>`

### Manual Test

```bash
curl -H "Authorization: Bearer <CRON_SECRET>" \
  https://<production-domain>/api/cron/subscriptions
```

### Verify Cron Registration

1. **Vercel Dashboard** → **Settings** → **Cron Jobs**
2. Should see: `/api/cron/subscriptions` scheduled every 10 minutes

## Important Notes

### Robokassa Automatic Charging

**Current Limitation**: Robokassa requires user interaction for payments. The cron endpoint generates a payment URL but cannot automatically charge without user action.

**Future Enhancement**: 
- Integrate Robokassa Recurring Payments API
- Or send payment URL to user via Telegram bot notification
- User completes payment manually
- Payment confirmation activates subscription

### Database Migration

**CRITICAL**: Execute `migrations/add_subscription_fields.sql` in Supabase SQL Editor before first deployment.

### Security

- Cron endpoint requires `CRON_SECRET` in Authorization header
- Unauthorized attempts are logged
- Robokassa signatures validated with PASSWORD2

## Files Created/Modified

1. `migrations/add_subscription_fields.sql` - Database migration
2. `miniapp/lib/robokassa.ts` - Robokassa utility (signature, URL generation)
3. `miniapp/app/api/payments/start/route.ts` - Payment start endpoint
4. `miniapp/app/api/robokassa/result/route.ts` - Robokassa callback
5. `miniapp/app/api/cron/subscriptions/route.ts` - Cron endpoint
6. `miniapp/app/profile/page.tsx` - Added subscription button
7. `vercel.json` - Added cron configuration

## Deployment Checklist

- [ ] Execute database migration in Supabase
- [ ] Verify all environment variables in Vercel
- [ ] Deploy to Vercel
- [ ] Verify cron appears in Vercel Dashboard
- [ ] Test payment flow manually
- [ ] Monitor Vercel logs for cron execution
- [ ] Verify subscription status updates in Supabase
