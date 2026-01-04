import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/version
 * Returns deployment version information for verification
 */
export async function GET() {
  const gitSha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || 'unknown';
  const deployedAt = process.env.VERCEL_DEPLOYMENT_DATE || new Date().toISOString();
  const env = process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown';

  return NextResponse.json({
    gitSha: gitSha.substring(0, 7), // Short SHA
    gitShaFull: gitSha,
    deployedAt,
    env,
    timestamp: new Date().toISOString(),
  });
}

