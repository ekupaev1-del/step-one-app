import { NextResponse } from 'next/server';
import { getRobokassaConfig } from '../../../../lib/robokassaConfig';
import { buildRobokassaForm, generateSafeInvId } from '../../../../lib/robokassa';

export const dynamic = 'force-dynamic';

/**
 * GET /api/debug/robokassa-sign?telegramUserId=...
 * 
 * Protected debug endpoint for Robokassa signature generation
 * Requires X-Debug-Key header matching ROBOKASSA_DEBUG_KEY env var
 * 
 * Returns debug information without creating actual payment
 */
export async function GET(req: Request) {
  try {
    // Check debug key
    const debugKey = req.headers.get('X-Debug-Key');
    const expectedKey = process.env.ROBOKASSA_DEBUG_KEY;
    
    if (!expectedKey) {
      return NextResponse.json({
        ok: false,
        error: 'Debug endpoint not configured (ROBOKASSA_DEBUG_KEY not set)',
      }, { status: 503 });
    }
    
    if (debugKey !== expectedKey) {
      return NextResponse.json({
        ok: false,
        error: 'Invalid debug key',
      }, { status: 401 });
    }

    // Get query parameters
    const url = new URL(req.url);
    const telegramUserIdParam = url.searchParams.get('telegramUserId');
    const outSumParam = url.searchParams.get('outSum') || '199.00';
    const recurringParam = url.searchParams.get('recurring') === 'true';
    
    if (!telegramUserIdParam) {
      return NextResponse.json({
        ok: false,
        error: 'telegramUserId is required in query string',
      }, { status: 400 });
    }

    const telegramUserId = Number(telegramUserIdParam);
    if (!Number.isFinite(telegramUserId) || telegramUserId <= 0) {
      return NextResponse.json({
        ok: false,
        error: 'telegramUserId must be a positive number',
      }, { status: 400 });
    }

    // Get config
    const config = getRobokassaConfig();
    
    // Generate sample InvId
    const invId = generateSafeInvId();
    
    // Build form using canonical builder
    const result = buildRobokassaForm({
      merchantLogin: config.merchantLogin,
      password1: config.pass1,
      outSum: outSumParam,
      invId: invId,
      description: 'Debug payment',
      recurring: recurringParam,
      shpParams: {
        userId: String(telegramUserId),
      },
      isTest: config.isTest,
    });
    
    return NextResponse.json({
      ok: true,
      merchantLogin: config.merchantLogin,
      outSum: outSumParam,
      invId: invId,
      shpParams: result.fields.Shp_userId ? [`Shp_userId=${result.fields.Shp_userId}`] : [],
      receiptIncluded: !!result.fields.Receipt,
      receiptEncoded: result.fields.Receipt || null,
      signatureBaseString: result.signature.baseString,
      signatureValue: result.signature.value,
      variant: result.signature.variant,
      formFields: result.fields,
      validation: result.validation,
    });
  } catch (error: any) {
    console.error('[debug/robokassa-sign] Error:', error);
    return NextResponse.json({
      ok: false,
      error: error.message || 'Internal server error',
    }, { status: 500 });
  }
}

