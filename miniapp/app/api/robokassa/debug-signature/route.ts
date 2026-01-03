import { NextResponse } from 'next/server';
import {
  getRobokassaConfig,
  generateReceipt,
  generatePaymentForm,
  generateSafeInvId,
  PaymentMode,
} from '../../../../lib/robokassa';

export const dynamic = 'force-dynamic';

/**
 * GET /api/robokassa/debug-signature
 * 
 * Debug endpoint to test signature generation
 * Prints exact signature input string, computed MD5 (lower and upper), and final form fields
 * 
 * Query params:
 * - mode: 'minimal' | 'recurring' (default: 'recurring')
 * - telegramUserId: Telegram user ID (optional, for Shp_userId)
 * 
 * Returns:
 * - exactSignatureStringMasked: Signature string with password masked
 * - signatureValueLowercase: MD5 hash in lowercase (for debugging)
 * - signatureValueUppercase: MD5 hash in UPPERCASE (for form submission)
 * - formFieldsRaw: Final form fields to be posted
 * - receiptRaw: Receipt JSON (if recurring mode)
 * - receiptEncoded: Receipt URL-encoded (if recurring mode)
 * - receiptEncodedLength: Length of encoded receipt
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const modeParam = (url.searchParams.get('mode') || 'recurring') as PaymentMode;
    const telegramUserIdParam = url.searchParams.get('telegramUserId');
    
    if (modeParam !== 'minimal' && modeParam !== 'recurring') {
      return NextResponse.json({
        ok: false,
        error: 'mode must be "minimal" or "recurring"',
      }, { status: 400 });
    }

    const config = getRobokassaConfig();
    const invId = generateSafeInvId();
    const outSum = '1.00';
    const description = 'Trial subscription 3 days';
    const telegramUserId = telegramUserIdParam ? Number(telegramUserIdParam) : undefined;

    let receipt;
    let receiptJson: string | undefined;
    let receiptEncoded: string | undefined;
    
    if (modeParam === 'recurring') {
      receipt = generateReceipt(1.00);
      receiptJson = JSON.stringify(receipt);
      receiptEncoded = encodeURIComponent(receiptJson);
    }

    // Generate payment form (this calculates the signature)
    const { debug: formDebug } = generatePaymentForm(
      config,
      outSum,
      invId,
      description,
      modeParam,
      receipt,
      telegramUserId,
      true // debug mode
    );

    // Extract signature info
    const exactSignatureStringMasked = formDebug.exactSignatureStringMasked;
    const signatureValue = formDebug.signatureValue; // This is now UPPERCASE
    const signatureValueLowercase = signatureValue.toLowerCase();
    const signatureValueUppercase = signatureValue.toUpperCase();
    const formFieldsRaw = formDebug.finalFormFields || formDebug.formFieldsRaw || {};

    return NextResponse.json({
      ok: true,
      mode: modeParam,
      merchantLogin: config.merchantLogin,
      outSum,
      invId,
      description,
      telegramUserId: telegramUserId || null,
      isTest: config.isTest,
      
      // Signature info
      exactSignatureStringMasked,
      signatureValueLowercase, // For debugging
      signatureValueUppercase, // For form submission (this is what SignatureValue contains)
      signatureLength: signatureValue.length,
      signatureIsUppercase: signatureValue === signatureValueUppercase,
      signatureIsHex: /^[0-9A-F]{32}$/i.test(signatureValue),
      
      // Receipt info (if recurring)
      receiptRaw: receiptJson || null,
      receiptRawLength: receiptJson?.length || 0,
      receiptEncoded: receiptEncoded || null,
      receiptEncodedLength: receiptEncoded?.length || 0,
      receiptEncodedPreview: receiptEncoded ? receiptEncoded.substring(0, 80) + '...' : null,
      
      // Form fields
      formFieldsRaw,
      formFieldsKeys: Object.keys(formFieldsRaw),
      formFieldsCount: Object.keys(formFieldsRaw).length,
      
      // Additional debug info
      customParams: formDebug.customParams || [],
      signatureParts: formDebug.signatureParts?.map((p: string, i: number) => ({
        index: i + 1,
        part: p === config.password1 ? '[PASSWORD1_HIDDEN]' : String(p).substring(0, 50),
        isPassword: p === config.password1,
        isShp: typeof p === 'string' && p.startsWith('Shp_'),
        isReceipt: typeof p === 'string' && p === receiptEncoded,
      })) || [],
    });
  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    }, { status: 500 });
  }
}

