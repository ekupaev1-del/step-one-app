# Diagnostic Plan: Fix Database Errors After Supabase Project Recreation

## 🔍 Diagnostic Plan

### Phase 1: Audit Current State
1. ✅ Locate all Supabase client initializations
2. ✅ Identify client vs server code paths
3. ✅ Check environment variable usage
4. ✅ Verify table schema matches code expectations
5. ✅ Check RLS policies

### Phase 2: Identify Root Causes
- Missing tables in new Supabase project
- Wrong Supabase key used (anon vs service role)
- RLS policies blocking operations
- Missing environment variables
- Schema mismatches (column types, constraints)

### Phase 3: Implement Fixes
1. Create consolidated SQL migration
2. Fix Supabase client usage (ensure service role on server)
3. Add robust logging with requestId
4. Fix/verify RLS policies
5. Create /api/health/db endpoint
6. Update documentation

### Phase 4: Verification
1. Push to GitHub (triggers Vercel deployment)
2. Check Vercel logs for structured JSON
3. Test /api/health/db endpoint
4. Test /start in Telegram bot
5. Verify diary insert works

## 🎯 Expected Root Causes

Based on common issues after Supabase project recreation:
1. **Missing tables** - New project has no schema
2. **Wrong key usage** - Server code using anon key instead of service role
3. **RLS blocking** - Policies not allowing service_role access
4. **Missing env vars** - Variables not set in Vercel Production

## 📋 Implementation Steps

1. Audit Supabase clients
2. Create consolidated migration
3. Add logging infrastructure
4. Fix RLS policies
5. Create health check endpoint
6. Update documentation
