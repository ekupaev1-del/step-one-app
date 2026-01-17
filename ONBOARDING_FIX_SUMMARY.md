# Onboarding Guard Fix Summary

## Problem

After completing the questionnaire and saving profile data, navigating to any bottom navigation button (Reports / Recommendations / Profile) redirected users back to the consent/onboarding screen, forcing them to complete the questionnaire again.

## Root Cause

1. **Incomplete State Checks**: Pages only checked privacy consent (`/api/privacy/check`), not profile completion
2. **No Unified State**: Each page had its own logic for checking onboarding status
3. **Root Page Always Redirected**: Root page (`app/page.tsx`) always redirected to `/registration` without checking if user was already onboarded
4. **Inconsistent Identifiers**: Different pages used different parameter names (`userId` vs `id`)

## Solution

### 1. Unified Onboarding Status API

**File:** `miniapp/app/api/onboarding/status/route.ts`

**Endpoint:** `GET /api/onboarding/status?userId=<id>`

**Returns:**
```json
{
  "ok": true,
  "hasUser": true,
  "hasConsent": true,
  "profileComplete": true,
  "userId": 123,
  "telegram_id": 456,
  "requestId": "...",
  "timestamp": "..."
}
```

**Logic:**
- `hasUser`: User exists in database
- `hasConsent`: Both `privacy_accepted` AND `terms_accepted` are `true`
- `profileComplete`: `calories` is not null/undefined and > 0 (indicates completed questionnaire)

### 2. Onboarding State Utility Library

**File:** `miniapp/lib/onboardingState.ts`

**Functions:**
- `getOnboardingState(userId)`: Fetches state from API
- `getRedirectPath(state)`: Determines redirect path based on state

**Redirect Rules:**
- `hasConsent = false` → `/privacy/consent?id=<userId>`
- `profileComplete = false` → `/registration?id=<userId>`
- Both `true` → `null` (no redirect needed)

### 3. Updated All Pages

**Files Updated:**
- `miniapp/app/profile/page.tsx`
- `miniapp/app/report/page.tsx`
- `miniapp/app/recommendations/page.tsx`
- `miniapp/app/questionnaire.tsx`

**Changes:**
- Replaced `/api/privacy/check` with `/api/onboarding/status`
- Check both `hasConsent` AND `profileComplete`
- Only redirect if consent missing OR profile incomplete
- Graceful degradation on errors (allow continue)

### 4. Fixed Root Page

**File:** `miniapp/app/page.tsx`

**Before:**
- Always redirected to `/registration` if `id` was present

**After:**
- Checks onboarding status server-side
- If fully onboarded → redirect to `/profile`
- If consent missing → redirect to `/privacy/consent`
- If profile incomplete → redirect to `/registration`
- Only redirects when needed

### 5. Debug Helpers

**DebugOverlay Enhancement:**
- Shows onboarding state when `?debug=1` is in URL
- Displays: `hasUser`, `hasConsent`, `profileComplete`, `userId`
- Helps diagnose onboarding issues

**OnboardingGuard Component:**
- Created reusable guard component (for future use)
- Can wrap pages to automatically handle redirects

## Testing Checklist

### ✅ Test 1: New User Flow
1. Open app with `?id=<newUserId>`
2. Should redirect to `/privacy/consent`
3. Accept consent → redirect to `/registration`
4. Complete questionnaire → save
5. Navigate to any tab → should work (no redirect)

### ✅ Test 2: Existing User with Complete Profile
1. Open app with `?id=<existingUserId>` (user has consent + profile)
2. Should redirect to `/profile` (not `/registration`)
3. Navigate to any tab → should work (no redirect)

### ✅ Test 3: User with Consent but Incomplete Profile
1. Open app with `?id=<userId>` (user has consent but no calories)
2. Should redirect to `/registration`
3. Complete questionnaire → save
4. Navigate to any tab → should work (no redirect)

### ✅ Test 4: Debug Mode
1. Open app with `?id=<userId>&debug=1`
2. Check DebugOverlay (bottom-right)
3. Should show onboarding state: `hasUser`, `hasConsent`, `profileComplete`

## Files Changed

1. **New Files:**
   - `miniapp/app/api/onboarding/status/route.ts` - Unified onboarding status API
   - `miniapp/lib/onboardingState.ts` - Client-side utility library
   - `miniapp/app/components/OnboardingGuard.tsx` - Reusable guard component

2. **Modified Files:**
   - `miniapp/app/page.tsx` - Root page with onboarding check
   - `miniapp/app/profile/page.tsx` - Unified onboarding check
   - `miniapp/app/report/page.tsx` - Unified onboarding check
   - `miniapp/app/recommendations/page.tsx` - Unified onboarding check
   - `miniapp/app/questionnaire.tsx` - Unified onboarding check
   - `miniapp/app/components/DebugOverlay.tsx` - Added onboarding state display

## Key Improvements

1. **Single Source of Truth**: `/api/onboarding/status` is the only place that determines onboarding state
2. **Consistent Logic**: All pages use the same check
3. **No Redirect Loops**: Pages only redirect when actually needed
4. **Better UX**: Users who completed onboarding can navigate freely
5. **Debuggable**: Debug overlay shows exact onboarding state

## Next Steps

1. Test in production with real users
2. Monitor logs for any onboarding-related errors
3. Consider using `OnboardingGuard` component for future pages
4. Add analytics to track onboarding completion rates
