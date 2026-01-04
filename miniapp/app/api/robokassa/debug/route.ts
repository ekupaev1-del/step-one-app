import { NextResponse } from 'next/server';
import { getRobokassaConfig } from '../../../../lib/robokassaConfig';
import { generateSafeInvId } from '../../../../lib/robokassa';

export const dynamic = 'force-dynamic';

/**
 * GET /api/robokassa/debug?telegramUserId=...
 * 
 * Returns debug information for Robokassa payment signature generation
 * Shows exactly what will be sent to Robokassa without actually creating a payment
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const telegramUserIdParam = url.searchParams.get('telegramUserId');
    
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
    
    // Payment amount: 199.00 (always 2 decimals as string)
    const outSum = '199.00';
    
    // Build Shp_userId parameter
    const shpUserId = `Shp_userId=${telegramUserId}`;
    const shpParams = [shpUserId];
    
    // For one-time payment: NO Receipt
    // Signature: MerchantLogin:OutSum:InvId:Password1:Shp_userId=...
    const signatureBaseParts = [
      config.merchantLogin.trim(),
      outSum,
      invId,
      '[HIDDEN]', // Password1 masked
      ...shpParams,
    ];
    
    const signatureBaseString = signatureBaseParts.join(':');
    
    // Calculate actual signature (with real password)
    // Signature format: MerchantLogin:OutSum:InvId:Password1:Shp_userId=...
    const { createHash } = await import('crypto');
    const actualSignatureParts = [
      config.merchantLogin.trim(),
      outSum,
      invId,
      config.pass1.trim(),
      ...shpParams,
    ];
    const actualSignatureString = actualSignatureParts.join(':');
    const signatureValue = createHash('md5')
      .update(actualSignatureString)
      .digest('hex')
      .toLowerCase();
    
    return NextResponse.json({
      ok: true,
      merchantLogin: config.merchantLogin,
      outSum: outSum,
      invId: invId,
      shpParams: shpParams,
      receiptEncoded: null, // No receipt for one-time payment
      signatureBaseString: signatureBaseString,
      signatureValue: signatureValue,
      variant: 'without-receipt',
      formFields: {
        MerchantLogin: config.merchantLogin,
        OutSum: outSum,
        InvId: invId,
        Description: 'Monthly subscription',
        Shp_userId: String(telegramUserId),
        SignatureValue: signatureValue,
        ...(config.isTest ? { IsTest: '1' } : {}),
      },
      validation: {
        merchantLoginCorrect: config.merchantLogin === 'steopone',
        outSumFormat: outSum === '199.00',
        invIdValid: /^\d+$/.test(invId) && parseInt(invId, 10) > 0 && parseInt(invId, 10) <= 2000000000,
        signatureFormat: /^[0-9a-f]{32}$/.test(signatureValue),
        shpParamsSorted: true,
      },
    });
  } catch (error: any) {
    console.error('[robokassa/debug] Error:', error);
    return NextResponse.json({
      ok: false,
      error: error.message || 'Internal server error',
    }, { status: 500 });
  }
}

