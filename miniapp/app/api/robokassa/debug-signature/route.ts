import { NextResponse } from 'next/server';
import { getRobokassaConfig } from '../../../../lib/robokassa';

export const dynamic = 'force-dynamic';

/**
 * GET /api/robokassa/debug-signature
 * 
 * Returns signature configuration and variant info without secrets
 * Useful for debugging Error 29
 */
export async function GET() {
  try {
    const config = getRobokassaConfig();
    const includeReceiptInSignature = process.env.ROBOKASSA_INCLUDE_RECEIPT_IN_SIGNATURE === 'true';
    
    return NextResponse.json({
      ok: true,
      variant: includeReceiptInSignature ? 'with-receipt' : 'without-receipt',
      includeReceiptInSignature,
      merchantLogin: config.merchantLogin,
      isTest: config.isTest,
      env: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
      note: includeReceiptInSignature 
        ? 'Signature includes Receipt (raw JSON, NOT URL-encoded)'
        : 'Signature does NOT include Receipt (default, recommended)',
      signatureFormat: includeReceiptInSignature
        ? 'MD5(MerchantLogin:OutSum:InvId:ReceiptRawJson:Password1[:Shp_*])'
        : 'MD5(MerchantLogin:OutSum:InvId:Password1[:Shp_*])',
    });
  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      message: error.message || 'Internal server error',
    }, { status: 500 });
  }
}
