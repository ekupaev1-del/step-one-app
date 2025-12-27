import { NextResponse } from 'next/server';
import { getRobokassaConfig } from '../../../../lib/robokassa';

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
    const merchantLogin = process.env.ROBOKASSA_MERCHANT_LOGIN;
    const password1 = process.env.ROBOKASSA_PASSWORD1;
    const password2 = process.env.ROBOKASSA_PASSWORD2;
    const testMode = process.env.ROBOKASSA_TEST_MODE;

    // Try to get full config (will throw if missing)
    let config;
    try {
      config = getRobokassaConfig();
    } catch (error: any) {
      return NextResponse.json({
        ok: false,
        error: error.message,
        merchantLogin: merchantLogin || null,
        testMode: testMode || null,
        hasPassword1: !!password1,
        hasPassword2: !!password2,
      });
    }

    return NextResponse.json({
      ok: true,
      merchantLogin: config.merchantLogin,
      testMode: config.isTest,
      robokassaTestMode: testMode,
      hasPassword1: !!password1,
      hasPassword2: !!password2,
    });
  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      error: error.message,
    }, { status: 500 });
  }
}

