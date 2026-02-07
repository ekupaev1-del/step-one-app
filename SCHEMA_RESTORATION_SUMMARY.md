# Supabase Schema Restoration - Summary

## ✅ Deliverables

### 1. Complete SQL Migration
**File**: `migrations/000_initial_schema_complete.sql`

Creates all 8 tables from scratch:
- `users` - Core user table (BIGINT id, telegram_id)
- `diary` - Food diary entries (source: text/photo/audio, channel: telegram/webapp/admin/api)
- `subscriptions` - User subscriptions (one per user)
- `payments` - Payment records
- `reminders` - Food/water reminders
- `water_logs` - Water intake tracking
- `app_logs` - Application logging
- `robokassa_invoices` - Payment provider invoices

### 2. Documentation
**Files**:
- `SCHEMA_RESTORATION_GUIDE.md` - Complete guide with verification queries
- `SCHEMA_RESTORATION_SUMMARY.md` - This file

### 3. Code Compatibility
✅ **No code changes needed** - Existing codebase already matches the schema:
- `diaryNormalize.ts` expects `source` ('text'/'photo'/'audio') and `channel` ('telegram'/'webapp'/'admin'/'api')
- `logging.ts` expects `app_logs` with `chat_id` (TEXT), `payload` (JSONB)
- All handlers use BIGINT `user_id` and `telegram_user_id`
- Supabase clients use service role keys correctly

## 🔑 Key Design Decisions

### 1. User ID Strategy: BIGINT
- All `user_id` columns are `BIGINT` (not UUID)
- Consistent with Telegram user IDs (numeric)
- Better performance for joins and queries

### 2. Diary Source vs Channel
- **`source`**: Content type (`'text'`, `'photo'`, `'audio'`)
- **`channel`**: Communication channel (`'telegram'`, `'webapp'`, `'admin'`, `'api'`)
- Separates content type from delivery mechanism

### 3. RLS Policies
- **Service role**: Full access (required for bot/API)
- **Authenticated users**: Can read their own data
- All policies explicitly defined

### 4. Constraints
- `diary_source_check`: Allows `'text'`, `'photo'`, `'audio'` (not `'telegram'`)
- All CHECK constraints match code expectations
- Foreign keys with appropriate CASCADE/SET NULL rules

## 📋 Quick Start

1. **Open Supabase SQL Editor**
2. **Run migration**: Copy/paste `migrations/000_initial_schema_complete.sql`
3. **Verify**: Check that 8 tables exist
4. **Test**: 
   - Create user via bot `/start`
   - Send food message via Telegram
   - Check `app_logs` for any errors

## ✅ Verification Checklist

- [ ] All 8 tables exist
- [ ] `diary.source` constraint allows: 'text', 'photo', 'audio'
- [ ] `diary.channel` column exists with default 'telegram'
- [ ] All `user_id` columns are `BIGINT` (not UUID)
- [ ] RLS policies allow service role operations
- [ ] Foreign keys are properly defined
- [ ] Indexes exist for performance
- [ ] Test user creation works
- [ ] Test diary insert works
- [ ] Test app_logs insert works

## 🚀 Next Steps

1. Run the migration in Supabase SQL Editor
2. Verify using queries in `SCHEMA_RESTORATION_GUIDE.md`
3. Test bot functionality:
   - `/start` command
   - Food text message
   - Food photo message
   - Food voice message
4. Monitor `app_logs` for any errors
5. Deploy code to Vercel (no code changes needed)

## 📝 Notes

- Migration is **idempotent** - safe to run multiple times
- All tables use proper indexes for performance
- RLS policies ensure security while allowing service role access
- Schema matches existing codebase expectations exactly
