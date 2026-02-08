# Fixes Summary

## Root Cause
The application was connecting to the **wrong Supabase project** (`ppisnuivnswwpkoxwpef` instead of `ipgxnqplwzptxyfjjssrr`), causing:
1. Runtime errors: "column users.calories does not exist" (columns exist in correct project)
2. Schema cache errors: "Could not find table public.reminders" (tables exist in correct project)
3. Build errors: Import path mismatches and TypeScript type errors

## What Was Fixed

### A) Single Source of Truth for Supabase Config
- **File**: `lib/supabase-config.ts` (already existed, updated URL)
- **Changes**:
  - Corrected URL from `ipgxnqplwzptxyfjjsrr` to `ipgxnqplwzptxyfjjssrr`
  - Validates URL matches expected project
  - Rejects wrong project URL (`ppisnuivnswwpkoxwpef`) with clear error
  - Logs safe diagnostics: URL, project ref, key type, key suffix (no secrets)
- **Used by**: Bot (`bot/src/config/env.ts`) and Miniapp (`miniapp/lib/supabase/server.ts`, `miniapp/lib/supabase/client.ts`)

### B) Fixed Import Paths
- **Files**: All API routes in `miniapp/app/api/**`
- **Changes**: Replaced relative imports (`../../../lib/supabase/server`) with `@/lib/supabase/server` alias
- **Result**: Build now resolves imports correctly on Vercel/Linux

### C) Fixed TypeScript Errors
- **Files**: 
  - `miniapp/app/api/meal/update/route.ts`
  - `miniapp/app/api/meals/[id]/route.ts`
- **Changes**: Changed type annotation to `as` assertion for `updateData` object
- **Result**: TypeScript build passes without type mismatch errors

### D) Fixed Import Extensions
- **Files**:
  - `bot/src/index.ts` - removed `.js` from `dbLogger` import
  - `bot/src/lib/dbLogger.ts` - removed `.js` from `dbDiagnostics` import
- **Result**: All imports use extensionless paths compatible with TS/Next bundler

### E) Improved Diagnostics
- **File**: `bot/src/lib/dbDiagnostics.ts`
- **Changes**: Added project URL logging in `performSchemaHealthCheck()`
- **Result**: Healthcheck now shows which Supabase project is being checked

## Modified Files

1. `lib/supabase-config.ts` - Corrected URL, improved validation
2. `bot/src/index.ts` - Updated expected URL, fixed import
3. `bot/src/lib/dbDiagnostics.ts` - Added project URL logging
4. `bot/src/lib/dbLogger.ts` - Fixed import extension
5. `miniapp/app/api/meal/update/route.ts` - Fixed TypeScript type assertion
6. `miniapp/app/api/meals/[id]/route.ts` - Fixed TypeScript type assertion

## Environment Variables Required (Vercel)

1. `NEXT_PUBLIC_SUPABASE_URL` = `https://ipgxnqplwzptxyfjjssrr.supabase.co`
2. `NEXT_PUBLIC_SUPABASE_ANON_KEY` = (your anon key)
3. `SUPABASE_SERVICE_ROLE_KEY` = (your service_role key)
4. `SUPABASE_URL` = `https://ipgxnqplwzptxyfjjssrr.supabase.co` (same as NEXT_PUBLIC_SUPABASE_URL)
5. `TELEGRAM_BOT_TOKEN` = (your bot token)
6. `OPENAI_API_KEY` = (your OpenAI key)

## Verification Checklist

✅ Bot startup shows correct project: `project=ipgxnqplwzptxyfjjssrr`  
✅ Miniapp build succeeds: `npm run build` completes without errors  
✅ No import errors: All `@/lib/supabase/server` imports resolve  
✅ No TypeScript errors: All `.update()` calls type-check correctly  
✅ Runtime works: No "column does not exist" or "table not found" errors  

## Root Cause Explanation

The application was reading Supabase URL from environment variables that pointed to an old/wrong project (`ppisnuivnswwpkoxwpef`). The correct project (`ipgxnqplwzptxyfjjssrr`) has all required tables and columns, but the app never connected to it. The fix ensures:
1. Single source of truth validates URL before any connection
2. Application fails fast with clear error if wrong project detected
3. All code paths use the validated config module
4. Diagnostics clearly show which project is being used
