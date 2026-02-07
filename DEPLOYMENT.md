# Deployment Guide

This project uses **Vercel's native Git integration** for automatic deployments. No CLI, no manual tokens, no GitHub Actions required.

## 🚀 How It Works

### Automatic Deployment Flow

1. **Push to GitHub** → Push code to `main` branch
2. **Vercel detects push** → Vercel webhook receives notification from GitHub
3. **Automatic build** → Vercel builds your Next.js app
4. **Automatic deploy** → App is deployed to production
5. **Done!** → Your app is live

**That's it!** No manual steps required.

## 📋 Initial Setup (One-Time)

### Step 1: Connect GitHub Repository to Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click **"Add New Project"**
3. Select your GitHub repository (`step-one-app`)
4. Configure project settings:
   - **Root Directory**: `miniapp` ⚠️ **IMPORTANT!**
   - **Framework Preset**: Next.js (auto-detected)
   - **Build Command**: `npm run build` (auto-detected)
   - **Output Directory**: `.next` (auto-detected)
5. Click **"Deploy"**

### Step 2: Configure Environment Variables

In Vercel Dashboard → Your Project → Settings → Environment Variables, add:

**Required:**
- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anon public key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role secret key

**Optional:**
- `DEBUG` - Set to `1` for verbose logging

⚠️ **Important**: Set these for **all environments** (Production, Preview, Development)

### Step 3: Verify Deployment

After first deployment:
1. Check Vercel Dashboard → Deployments
2. Verify deployment status is "Ready"
3. Visit your production URL
4. Test health check: `https://your-project.vercel.app/api/version`

## ✅ After Setup

Once connected, **every push to `main` automatically triggers a new production deployment**.

- ✅ No manual steps needed
- ✅ No CLI commands required
- ✅ No tokens to manage
- ✅ Automatic builds and deployments

## 🔍 Checking Deployments

### In Vercel Dashboard

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project
3. Click **"Deployments"** tab
4. You'll see:
   - All deployments (production and preview)
   - Deployment status (Building, Ready, Error)
   - Commit SHA and message
   - Deployment URL
   - Build logs

### Via Health Check Endpoint

Visit: `https://your-project.vercel.app/api/version`

Returns:
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
- ✅ Which commit is deployed (gitSha)
- ✅ When it was deployed (deployedAt)
- ✅ Environment (production/preview)
- ✅ That the API is working

## 🔧 Troubleshooting

### Deployment Not Triggering

**Problem**: Push to `main` doesn't trigger deployment

**Solution**: Check Git integration
1. Vercel Dashboard → Project → Settings → Git
2. Verify repository is connected
3. Check "Production Branch" is set to `main`
4. If disconnected, click **"Disconnect"** then **"Connect Git Repository"** again

### Build Fails

**Problem**: Deployment shows "Build Failed"

**Solution**:
1. Check build logs in Vercel Dashboard → Deployments → Failed deployment → Logs
2. Common issues:
   - Missing environment variables → Add them in Settings → Environment Variables
   - Build errors → Check logs for specific error messages
   - Dependency issues → Verify `package.json` is correct

### Wrong Root Directory

**Problem**: Vercel can't find Next.js app

**Solution**:
1. Vercel Dashboard → Project → Settings → General
2. Set **Root Directory** to `miniapp`
3. Save and redeploy

### Webhook Issues

**Problem**: Git integration stops working (webhooks break)

**Solution**: Reconnect Git integration
1. Vercel Dashboard → Project → Settings → Git
2. Click **"Disconnect"**
3. Click **"Connect Git Repository"**
4. Select your repository again
5. Vercel will recreate webhooks automatically

## 📝 Manual Deployment (If Needed)

If you need to trigger a deployment manually:

1. Vercel Dashboard → Project → Deployments
2. Click **"Redeploy"** on the latest deployment
3. Or click **"Deploy"** → Select branch → Deploy

## 🔐 Security Notes

- ✅ All environment variables are stored securely in Vercel
- ✅ Service role key is never exposed to client
- ✅ Git integration uses secure webhooks
- ✅ No tokens or credentials in code

## 📚 Additional Resources

- [Vercel Git Integration Docs](https://vercel.com/docs/concepts/git)
- [Vercel Environment Variables](https://vercel.com/docs/environment-variables)
- [Next.js on Vercel](https://vercel.com/docs/frameworks/nextjs)

---

## ✅ Quick Checklist

- [ ] Repository connected to Vercel
- [ ] Root Directory set to `miniapp`
- [ ] Environment variables configured
- [ ] First deployment successful
- [ ] Health check endpoint working: `/api/version`
- [ ] Push to `main` triggers automatic deployment

**Once all checked, you're done!** Just push to GitHub and Vercel handles the rest.
