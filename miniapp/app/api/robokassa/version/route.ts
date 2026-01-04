import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/robokassa/version
 * Returns deployment version information for verification
 */
export async function GET() {
  const gitCommit = process.env.VERCEL_GIT_COMMIT_SHA || null;
  const buildTime = new Date().toISOString();
  const env = process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown';
  const app = 'miniapp';

  return NextResponse.json({
    commit: gitCommit,
    buildTime,
    env,
    app,
  });
}

