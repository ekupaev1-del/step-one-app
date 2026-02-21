# ✅ Vercel Auto-Deploy Checklist

## A) Code Fix Status

✅ **File:** `app/report/page.tsx`
- ✅ Has `"use client"` directive (line 1)
- ✅ `useState` imported from React (line 3)
- ✅ Error state declared: `const [reportError, setReportError] = useState<string | null>(null);` (line 63)
- ✅ All calls use `setReportError` (not `setError`)
- ✅ Line 266: `setReportError(null);` ✅ CORRECT

**Code is already fixed!** The error message might be from a cached build.

---

## B) Vercel Configuration Checklist

### 1. Vercel Dashboard → Your Project → Settings → General

**Root Directory:**
```
miniapp
```
⚠️ **MUST BE SET** - This is a monorepo, Next.js app is in `miniapp/` subdirectory

**Build Command:**
```
cd miniapp && npm install && npm run build
```
(Or leave empty - Vercel will auto-detect from `vercel.json`)

**Output Directory:**
```
miniapp/.next
```
(Or leave empty - Vercel will auto-detect from `vercel.json`)

**Install Command:**
```
cd miniapp && npm install
```
(Or leave empty - Vercel will auto-detect)

---

### 2. Vercel Dashboard → Your Project → Settings → Git

**Production Branch:**
```
main
```
⚠️ **MUST MATCH** your actual production branch name

**Connected Repository:**
```
ekupaev1-del/step-one-app
```
✅ Should show as connected

**Ignored Build Step:**
```
(empty)
```
⚠️ **MUST BE EMPTY** - If there's any command here, it might block deployments

**Auto-assign Custom Domain:**
- Can be enabled/disabled (doesn't affect auto-deploy)

**Deployment Protection:**
- Should be disabled for automatic deployments

---

### 3. GitHub → Your Repository → Settings → Webhooks

**URL:** Should contain `vercel.com` or `vercel.app`
**Events:** Should include `push` event
**Active:** Should be ✅ (green checkmark)

**Recent Deliveries:**
- Click on the webhook
- Check "Recent Deliveries" tab
- Should show recent push events with status 200 (success)
- If you see 4xx/5xx errors → webhook is broken, need to reconnect

---

### 4. GitHub → Your Repository → Settings → Integrations → GitHub Apps

**Vercel:**
- Should be installed
- Should have access to repository `ekupaev1-del/step-one-app`
- Permissions should include: Contents (Read), Metadata (Read), Pull requests (Read/Write)

**If missing:**
1. Go to Vercel Dashboard
2. Settings → Git → Disconnect
3. Connect Repository → Select `ekupaev1-del/step-one-app`
4. This will reinstall the GitHub App

---

## C) Test Commit Instructions

After verifying all settings above:

```bash
# Make a small harmless change
echo "# Test auto-deploy $(date)" >> README.md

# Commit and push
git add README.md
git commit -m "Test: trigger Vercel auto-deploy"
git push origin main
```

**Expected Result:**
1. Within 30-60 seconds, check Vercel Dashboard → Deployments
2. Should see a NEW deployment entry (green or red - doesn't matter, just needs to appear)
3. Deployment should show:
   - Source: GitHub
   - Branch: `main`
   - Commit: Your test commit hash
   - Status: Building → Ready (or Error if build fails)

**If no deployment appears:**
- Check GitHub webhook deliveries (step 3 above)
- Reconnect Git in Vercel (step 4 above)
- Verify Root Directory is `miniapp` (step 1 above)

---

## D) Build Command Verification

**Local build test:**
```bash
cd step-one-app/step-one-app/miniapp
npm run build
```

**Expected:** Should complete successfully (may have warnings, but no TypeScript errors)

**If build fails locally:**
- Fix errors before expecting Vercel to deploy
- The `setError` issue should already be fixed (using `setReportError`)

---

## Summary

✅ Code is fixed (using `setReportError`)
✅ Repository: `ekupaev1-del/step-one-app`
✅ Branch: `main`
✅ Monorepo: Yes, Root Directory must be `miniapp`
✅ Build command: `cd miniapp && npm install && npm run build`

**Next steps:**
1. Verify Vercel Settings → General → Root Directory = `miniapp`
2. Verify Vercel Settings → Git → Production Branch = `main`
3. Verify Vercel Settings → Git → Ignored Build Step = (empty)
4. Check GitHub webhook is active and receiving events
5. Make test commit and verify deployment appears
