import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// App version - update this when releasing new versions
const APP_VERSION = '0.1.0';

/**
 * GET /api/version
 * Health check endpoint that returns app version and deployment information
 * Used to verify deployments are working correctly
 * 
 * Returns:
 * - app: Application name
 * - version: App version from package.json
 * - gitSha: Short commit SHA (7 chars)
 * - gitShaFull: Full commit SHA
 * - deployedAt: Deployment timestamp
 * - env: Environment (production/preview/development)
 * - url: Vercel deployment URL
 * - timestamp: Current server time
 */
export async function GET() {
  const gitSha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || 'unknown';
  const deployedAt = process.env.VERCEL_DEPLOYMENT_DATE || new Date().toISOString();
  const env = process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown';
  const vercelUrl = process.env.VERCEL_URL || 'local';

  return NextResponse.json({
    ok: true,
    app: 'step-one-miniapp',
    version: APP_VERSION,
    gitSha: gitSha !== 'unknown' ? gitSha.substring(0, 7) : 'unknown',
    gitShaFull: gitSha,
    deployedAt,
    env,
    url: vercelUrl,
    timestamp: new Date().toISOString(),
  });
}

