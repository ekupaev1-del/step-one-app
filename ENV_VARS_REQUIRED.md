# Required Environment Variables

## Bot (bot/.env)

Required variables:
- `TELEGRAM_BOT_TOKEN` - Telegram bot token
- `SUPABASE_URL` - Supabase project URL (e.g., https://ipgxnqplwzptxyfjjsrr.supabase.co)
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (for server-side operations)
- `EXPECTED_SUPABASE_PROJECT_REF` - Expected project reference (e.g., ipgxnqplwzptxyfjjsrr)
- `OPENAI_API_KEY` - OpenAI API key

Optional:
- `SUPABASE_ANON_PUBLIC_KEY` - Supabase anon key (if used by bot)

## Miniapp (Vercel Environment Variables)

Required variables:
- `SUPABASE_URL` - Supabase project URL (e.g., https://ipgxnqplwzptxyfjjsrr.supabase.co)
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (for API routes)
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL (for client-side)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anon key (for client-side)
- `EXPECTED_SUPABASE_PROJECT_REF` - Expected project reference (e.g., ipgxnqplwzptxyfjjsrr)

Optional:
- `CRON_SECRET` - Secret for protecting cron endpoints

## Notes

- Never commit `.env` files to git
- All secrets should be stored in Vercel Environment Variables for miniapp
- Bot reads from `bot/.env` file (loaded via dotenv)
- Both bot and miniapp validate that the project ref matches EXPECTED_SUPABASE_PROJECT_REF
- Diagnostics log only: URL, project ref, key type (anon/service_role), key suffix (last 6 chars)
- Full keys are NEVER logged
