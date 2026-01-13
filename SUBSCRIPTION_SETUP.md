# Subscription Payment System Setup

## Overview

This document describes how to set up and configure the subscription payment system with Robokassa integration.

## Database Migrations

Execute the following SQL migrations in Supabase SQL Editor (in order):

1. **Create payments table:**
   ```sql
   -- Run: migrations/create_payments_table.sql
   ```

2. **Create subscriptions table:**
   ```sql
   -- Run: migrations/create_subscriptions_table.sql
   ```

After running migrations, wait 1-2 minutes for PostgREST schema cache to refresh automatically, or restart Supabase API if needed.

## Environment Variables

Add the following environment variables to your Vercel project (or `.env.local` for local development):

```bash
# Robokassa Payment Provider
ROBO_MERCHANT_LOGIN=your_merchant_login
ROBO_PASSWORD1=your_password1
ROBO_PASSWORD2=your_password2
ROBO_IS_TEST=true  # Set to "false" for production

# Application Base URL (for callbacks)
APP_BASE_URL=https://your-domain.vercel.app

# Supabase (should already be configured)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### Getting Robokassa Credentials

1. Register at [Robokassa](https://robokassa.ru/)
2. Get your Merchant Login from the dashboard
3. Set Password #1 and Password #2 in the merchant settings
4. Configure Result URL: `https://your-domain.vercel.app/api/payments/callback`
5. Configure Success URL: `https://your-domain.vercel.app/api/payments/return`
6. Enable test mode during development (`ROBO_IS_TEST=true`)

## API Endpoints

### POST /api/payments/start
Creates a payment record and returns payment URL.

**Request:**
```json
{
  "method": "sbp" | "card",
  "planCode": "monthly_199",
  "amount": 199,
  "currency": "RUB",
  "userId": 123456789
}
```

**Response:**
```json
{
  "ok": true,
  "invId": "1234567890123",
  "paymentUrl": "https://auth.robokassa.ru/Merchant/Index.aspx?...",
  "paymentId": "uuid",
  "debug": { ... }
}
```

### POST /api/payments/callback
Server-to-server notification from Robokassa (handles payment confirmation).

### GET /api/payments/return
User redirect after payment completion.

### GET /api/subscription/me?userId=123
Get user subscription status.

**Response:**
```json
{
  "ok": true,
  "subscription": {
    "isActive": true,
    "activeUntil": "2024-02-15T00:00:00Z",
    "planCode": "monthly_199"
  }
}
```

## Frontend Routes

- `/subscription?id=123` - Subscription page with payment form

## Testing

1. **Test Payment Flow:**
   - Navigate to `/subscription?id=YOUR_USER_ID`
   - Select payment method (SBP or Card)
   - Check both consent checkboxes
   - Click "Pay"
   - Should redirect to Robokassa payment page

2. **Test Callback:**
   - After payment, Robokassa will call `/api/payments/callback`
   - Check Supabase `payments` table - status should be `paid`
   - Check `subscriptions` table - should have active subscription

3. **Debug Mode:**
   - Click "Show Debug Info" on subscription page
   - View request/response JSON and debug logs
   - Use "Copy JSON" to copy debug data

## Troubleshooting

### Schema Cache Issues
If you see "column not found" errors:
- Wait 1-2 minutes after migration
- Or restart Supabase API
- Migrations include `pg_notify('pgrst', 'reload schema')` to trigger refresh

### Payment URL Not Opening
- Check if `Telegram.WebApp.openLink` is available
- Falls back to `window.location.href` if not
- Works in both Telegram WebApp and regular browser

### Signature Verification Fails
- Verify `ROBO_PASSWORD1` and `ROBO_PASSWORD2` are correct
- Check that Shp_* parameters are included in signature
- Ensure signature is lowercase MD5 hex

### Subscription Not Activating
- Check `/api/payments/callback` logs
- Verify payment status is updated to `paid`
- Check subscription record is created/updated
- Verify `active_until` is set correctly (30 days from payment)

## Database Schema

### payments table
- `id` (uuid, pk)
- `user_id` (integer, not null)
- `telegram_user_id` (text, not null)
- `plan_code` (text, not null)
- `amount` (numeric, not null)
- `currency` (text, default 'RUB')
- `inv_id` (bigint, not null)
- `provider` (text, default 'robokassa')
- `status` (text, default 'created')
- `payment_url` (text)
- `created_at`, `updated_at` (timestamptz)

### subscriptions table
- `user_id` (integer, pk)
- `plan_code` (text, not null)
- `active_until` (timestamptz)
- `is_active` (boolean, default false)
- `created_at`, `updated_at` (timestamptz)

## Notes

- Payment URLs are generated server-side for security
- All payment records are created BEFORE redirect
- Subscription is activated automatically when payment is confirmed
- Debug drawer is collapsed by default but available for troubleshooting
- Works in both Telegram WebApp and regular browser environments
