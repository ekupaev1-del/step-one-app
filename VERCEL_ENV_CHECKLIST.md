# Vercel Environment Variables Checklist

## Required Variables for Production

Set these in **Vercel Dashboard → Project → Settings → Environment Variables** for **Production** environment:

### Supabase Configuration

1. **`NEXT_PUBLIC_SUPABASE_URL`**
   - **Value**: Your Supabase project URL
   - **Format**: `https://xxxxx.supabase.co`
   - **Where to find**: Supabase Dashboard → Settings → API → Project URL
   - **Scope**: Public (safe to expose to client)

2. **`NEXT_PUBLIC_SUPABASE_ANON_KEY`**
   - **Value**: Supabase anon/public key
   - **Format**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (starts with `eyJ`)
   - **Where to find**: Supabase Dashboard → Settings → API → Project API keys → `anon` `public`
   - **Scope**: Public (safe to expose to client)
   - **Used in**: Client-side code only

3. **`SUPABASE_SERVICE_ROLE_KEY`** ⚠️ **SECRET**
   - **Value**: Supabase service role key
   - **Format**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (much longer than anon key, ~200+ chars)
   - **Where to find**: Supabase Dashboard → Settings → API → Project API keys → `service_role` `secret`
   - **Scope**: **SECRET** - Never expose to client
   - **Used in**: Server-side code only (API routes, bot handlers)

### Telegram Bot

4. **`TELEGRAM_BOT_TOKEN`** ⚠️ **SECRET**
   - **Value**: Your Telegram bot token
   - **Format**: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`
   - **Where to find**: [@BotFather](https://t.me/botfather) on Telegram
   - **Scope**: **SECRET** - Server-side only

### OpenAI (if used)

5. **`OPENAI_API_KEY`** ⚠️ **SECRET**
   - **Value**: Your OpenAI API key
   - **Format**: `sk-...`
   - **Where to find**: [OpenAI Platform](https://platform.openai.com/api-keys)
   - **Scope**: **SECRET** - Server-side only

### Optional

6. **`DEBUG`**
   - **Value**: `1` or `true` (optional, for verbose logging)
   - **Scope**: Server-side only

## Local Development (.env.local)

For local development, create `.env.local` in `miniapp/` directory:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
TELEGRAM_BOT_TOKEN=your-bot-token
OPENAI_API_KEY=your-openai-key
DEBUG=false
```

For bot development, create `.env` in `bot/` directory:

```bash
TELEGRAM_BOT_TOKEN=your-bot-token
SUPABASE_URL=https://your-project.supabase.co
# OR
# NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
OPENAI_API_KEY=your-openai-key
DEBUG=false
```

## Verification

After setting variables in Vercel:

1. **Redeploy** (or wait for next push to main)
2. **Check logs**: Vercel Dashboard → Deployments → Latest → Logs
3. **Test endpoint**: `GET /api/health/db` should return `ok: true`
4. **Test bot**: Send `/start` to Telegram bot

## Important Notes

- ✅ All variables must be set for **Production** environment
- ✅ `NEXT_PUBLIC_*` variables are exposed to client (safe for anon key)
- ⚠️ `SUPABASE_SERVICE_ROLE_KEY` is **SECRET** - never expose to client
- ⚠️ Never commit `.env.local` or `.env` files to git
- ✅ Variables are automatically available in Vercel deployments
