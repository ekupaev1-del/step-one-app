import { NextResponse } from 'next/server';
import { getRobokassaConfig } from '../../../../lib/robokassaConfig';

export const dynamic = 'force-dynamic';

/**
 * GET /api/robokassa/debug-config
 * 
 * TEMP DEBUG endpoint to check Robokassa configuration
 * Returns config info without exposing passwords
 * 
 * Returns:
 * { merchantLogin, testMode, hasPassword1, hasPassword2 }
 */
export async function GET() {
  try {
    // Try to get full config (will throw if missing)
    const config = getRobokassaConfig();
    
    return NextResponse.json({
      ok: true,
      merchantLogin: config.merchantLogin,
      testMode: config.isTest,
      hasPass1: !!config.pass1,
      hasPass2: !!config.pass2,
      pass1Length: config.pass1.length,
      pass2Length: config.pass2.length,
      env: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
    });
  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      error: error.message,
    }, { status: 500 });
  }
}

