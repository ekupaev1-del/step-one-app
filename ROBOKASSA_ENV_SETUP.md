# Robokassa Environment Variables Setup

## Required Environment Variables for Production

### Core Robokassa Configuration

1. **ROBOKASSA_MERCHANT_LOGIN** (required)
   - Your Robokassa merchant login
   - Example: `steopone`

2. **ROBOKASSA_PASSWORD1** (required)
   - Password #1 for payment URL signature generation
   - ⚠️ **SECRET** - never expose in client code or logs

3. **ROBOKASSA_PASSWORD2** (required)
   - Password #2 for webhook signature verification
   - ⚠️ **SECRET** - never expose in client code or logs

4. **ROBOKASSA_TEST_MODE** (optional, default: false)
   - Set to `"true"`, `"1"`, or `true` to enable test mode
   - Set to `"false"`, `"0"`, or `false` for production
   - In production, this should be `false` to send `IsTest=0` to Robokassa

### Debug Configuration (Optional)

5. **DEBUG_PAYMENTS** (optional, default: false)
   - Set to `"true"` or `"1"` to enable debug output in production
   - When enabled, server returns detailed debug JSON in responses
   - ⚠️ Only enable when debugging - contains sensitive information

6. **DEBUG_PAYMENTS_TOKEN** (optional, required if using header-based debug)
   - Secret token for production debug mode
   - Client must send `X-Debug-Token` header matching this value
   - ⚠️ **SECRET** - use a strong random string

7. **NEXT_PUBLIC_DEBUG_PAYMENTS** (optional, client-side)
   - Set to `"true"` to enable debug UI on client
   - Client will send debug headers to server

8. **NEXT_PUBLIC_DEBUG_PAYMENTS_TOKEN** (optional, client-side)
   - Client-side token for debug headers
   - Must match `DEBUG_PAYMENTS_TOKEN` on server

### Database Configuration

9. **NEXT_PUBLIC_SUPABASE_URL** (required)
   - Supabase project URL
   - Example: `https://xxxxx.supabase.co`

10. **SUPABASE_SERVICE_ROLE_KEY** (required)
    - Supabase service role key (bypasses RLS)
    - ⚠️ **SECRET** - never expose in client code

## Vercel Setup

### Production Environment

1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add all required variables for **Production** environment:

```
ROBOKASSA_MERCHANT_LOGIN=your_merchant_login
ROBOKASSA_PASSWORD1=your_password1
ROBOKASSA_PASSWORD2=your_password2
ROBOKASSA_TEST_MODE=false
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### Optional Debug Variables (Production)

Only add these if you need to debug in production:

```
DEBUG_PAYMENTS=false
DEBUG_PAYMENTS_TOKEN=your_strong_random_token_here
NEXT_PUBLIC_DEBUG_PAYMENTS=false
NEXT_PUBLIC_DEBUG_PAYMENTS_TOKEN=your_strong_random_token_here
```

### Preview/Development Environment

For preview deployments, you can use test mode:

```
ROBOKASSA_TEST_MODE=true
DEBUG_PAYMENTS=true
```

## Database Migration

**CRITICAL**: Before using payments, execute the migration:

1. Open Supabase Dashboard → SQL Editor
2. Execute the SQL from `migrations/create_robokassa_invoices.sql`
3. This creates the `robokassa_invoices` table with auto-increment integer IDs

## Verification

After deployment, check server logs for:

```json
{
  "event": "robokassa_config_loaded",
  "nodeEnv": "production",
  "testMode": false,
  "merchantLogin": "your_login",
  "hasPassword1": true,
  "hasPassword2": true
}
```

If you see this log, configuration is loaded correctly.

## Troubleshooting

### "Payment unavailable" (Error 29/500)

1. **Check InvId**: Must be small integer (≤ 10 digits). Verify `robokassa_invoices` table exists and uses SERIAL.
2. **Check IsTest**: In production, must be `0`. Verify `ROBOKASSA_TEST_MODE=false`.
3. **Check signature**: Verify passwords are correct and signature is uppercase MD5.
4. **Check encoding**: Description should be encoded once, not double-encoded.

### "userId is required"

1. Verify client sends `userId` in query params (`?userId=347` or `?id=347`)
2. Verify client sends `userId` in JSON body
3. Check server logs for `userIdResolution` details

### Debug not showing

1. In production, set `DEBUG_PAYMENTS=true` OR
2. Send headers: `X-Debug-Payments: 1` and `X-Debug-Token: <token>`
3. Verify `DEBUG_PAYMENTS_TOKEN` matches on server and client
