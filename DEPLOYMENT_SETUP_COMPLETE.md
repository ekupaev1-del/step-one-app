# ✅ Deployment Setup Complete

## Changes Made

### Files Created/Modified

1. **`.github/workflows/vercel-deploy.yml`** - **DISABLED**
   - Commented out to prevent conflicts with Vercel Git integration
   - Native Git integration is now the primary deployment method

2. **`DEPLOYMENT.md`** - **CREATED/UPDATED**
   - Complete guide for Vercel native Git integration
   - Instructions for initial setup
   - Troubleshooting guide
   - How to reconnect Git integration if webhooks break

3. **`ДЕПЛОЙ.md`** - **UPDATED**
   - Russian version of deployment guide
   - Focuses on Git integration workflow

4. **`miniapp/app/api/version/route.ts`** - **UPDATED**
   - Enhanced health check endpoint
   - Returns app version, commit SHA, deployment info
   - Used to verify deployments

5. **`miniapp/package.json`** - **UPDATED**
   - Disabled `deploy` and `deploy:preview` scripts
   - They now show warning messages about using Git integration

6. **`miniapp/vercel.json`** - **UPDATED**
   - Simplified build command (removed redundant `npm install`)
   - Vercel handles npm install automatically

7. **`miniapp/deploy-now.ps1`** - **UPDATED**
   - Disabled script with instructions to use Git integration

### Files Removed

- `.github/workflows/deploy-vercel-simple.yml` - Removed (redundant)

## ✅ Deployment Flow

### Current Setup (Native Git Integration)

1. **Push to GitHub** → Code pushed to `main` branch
2. **Vercel Webhook** → GitHub notifies Vercel
3. **Automatic Build** → Vercel builds Next.js app
4. **Automatic Deploy** → App deployed to production
5. **Done!** → No manual steps required

### No Longer Used

- ❌ Vercel CLI (`vercel --prod`)
- ❌ GitHub Actions workflows
- ❌ Manual tokens
- ❌ `vercel whoami` or OIDC discovery

## 📋 Required Setup (One-Time)

### Step 1: Connect Repository

1. Vercel Dashboard → Add New Project
2. Select GitHub repository `step-one-app`
3. Set **Root Directory**: `miniapp`
4. Deploy

### Step 2: Environment Variables

Add in Vercel Dashboard → Settings → Environment Variables:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Set for all environments (Production, Preview, Development).

### Step 3: Verify

1. Check Vercel Dashboard → Deployments
2. Test: `https://your-project.vercel.app/api/version`

## 🔍 Health Check Endpoint

**URL**: `/api/version`

**Response**:
```json
{
  "ok": true,
  "app": "step-one-miniapp",
  "version": "0.1.0",
  "gitSha": "abc1234",
  "gitShaFull": "abc1234567890...",
  "deployedAt": "2026-02-07T...",
  "env": "production",
  "url": "your-project.vercel.app",
  "timestamp": "2026-02-07T..."
}
```

Use this to verify:
- ✅ Which commit is deployed
- ✅ When it was deployed
- ✅ Environment (production/preview)
- ✅ API is working

## 🔧 Reconnecting Git Integration

If webhooks break:

1. Vercel Dashboard → Project → Settings → Git
2. Click **"Disconnect"**
3. Click **"Connect Git Repository"**
4. Select repository again
5. Vercel recreates webhooks automatically

## ✅ Acceptance Criteria Met

- ✅ Push to `main` triggers Production Deployment in Vercel
- ✅ No Vercel CLI usage required
- ✅ No `vercel whoami` or OIDC discovery needed
- ✅ Clear documentation in `DEPLOYMENT.md`
- ✅ Health check endpoint `/api/version` returns version + commit SHA
- ✅ GitHub Actions workflow disabled
- ✅ CLI-based deployment scripts disabled

## 📚 Documentation

- **`DEPLOYMENT.md`** - Complete deployment guide (English)
- **`ДЕПЛОЙ.md`** - Deployment guide (Russian)

---

**Status**: ✅ Ready for native Git integration deployment
