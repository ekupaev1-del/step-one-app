# Vercel Environment Variables Required

## Required Variables for Miniapp

Set these in Vercel Dashboard → Settings → Environment Variables:

1. **NEXT_PUBLIC_SUPABASE_URL**
   - Value: `https://ipgxnqplwzptxyfjjssrr.supabase.co`
   - Scope: Production, Preview, Development

2. **NEXT_PUBLIC_SUPABASE_ANON_KEY**
   - Value: Your Supabase anon/public key
   - Scope: Production, Preview, Development

3. **SUPABASE_SERVICE_ROLE_KEY**
   - Value: Your Supabase service_role key (200+ chars)
   - Scope: Production, Preview, Development
   - ⚠️ Never expose this to client-side code

4. **SUPABASE_URL**
   - Value: `https://ipgxnqplwzptxyfjjssrr.supabase.co` (same as NEXT_PUBLIC_SUPABASE_URL)
   - Scope: Production, Preview, Development
   - Used by bot and server-side code

5. **TELEGRAM_BOT_TOKEN**
   - Value: Your Telegram bot token
   - Scope: Production, Preview, Development

6. **OPENAI_API_KEY**
   - Value: Your OpenAI API key
   - Scope: Production, Preview, Development

## How to Get Values

1. **Supabase Dashboard**: https://supabase.com/dashboard
   - Go to your project → Settings → API
   - Copy "Project URL" → `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_URL`
   - Copy "anon public" key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Copy "service_role" key → `SUPABASE_SERVICE_ROLE_KEY`

2. **Telegram Bot Token**: From @BotFather on Telegram

3. **OpenAI API Key**: From https://platform.openai.com/api-keys

## Verification

After setting variables, check:
- Bot startup logs show: `project=ipgxnqplwzptxyfjjssrr`
- Miniapp build succeeds without import errors
- No "column does not exist" errors at runtime
