import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  generateReceipt,
  generatePaymentForm,
  generateSafeInvId,
  PaymentMode,
} from '../../../../lib/robokassa';
import { getRobokassaConfig } from '../../../../lib/robokassaConfig';

export const dynamic = 'force-dynamic';

/**
 * Generate unique InvId with DB collision check
 * Returns string (digits only)
 */
async function generateUniqueInvId(
  supabase: any,
  maxAttempts: number = 5
): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const invId = generateSafeInvId(); // Returns string
    
    // Check if invId already exists
    const { data: existing } = await supabase
      .from('payments')
      .select('inv_id')
      .eq('inv_id', invId)
      .maybeSingle();
    
    if (!existing) {
      return invId;
    }
    
    console.warn(`[robokassa/create-monthly] InvId collision detected: ${invId}, retrying...`);
  }
  
  throw new Error('Failed to generate unique InvId after multiple attempts');
}

/**
 * POST /api/robokassa/create-monthly?telegramUserId=...
 * 
 * Creates a simple one-time payment (199 RUB monthly subscription)
 * For LIVE production use - no recurring, just one-time payment
 */
export async function POST(req: Request) {
  const debug: any = {
    timestamp: new Date().toISOString(),
    stage: 'start',
  };

  try {
    console.log('[robokassa/create-monthly] ========== CREATE MONTHLY PAYMENT ==========');

    // Get query parameters
    const url = new URL(req.url);
    const telegramUserIdParam = url.searchParams.get('telegramUserId');

    if (!telegramUserIdParam) {
      return NextResponse.json({
        ok: false,
        stage: 'validate_input',
        message: 'telegramUserId is required in query string',
        debug,
      }, { status: 400 });
    }

    const telegramUserId = Number(telegramUserIdParam);
    if (!Number.isFinite(telegramUserId) || telegramUserId <= 0) {
      return NextResponse.json({
        ok: false,
        stage: 'validate_input',
        message: 'telegramUserId must be a positive number',
        debug,
      }, { status: 400 });
    }

    debug.telegramUserId = telegramUserId;
    debug.stage = 'check_user';

    // Initialize Supabase
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Check if user exists
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, telegram_id')
      .eq('telegram_id', telegramUserId)
      .maybeSingle();

    if (userError) {
      console.error('[robokassa/create-monthly] ❌ Supabase error:', userError);
      return NextResponse.json({
        ok: false,
        stage: 'check_user',
        message: 'Database error',
        debug,
      }, { status: 500 });
    }

    if (!user) {
      return NextResponse.json({
        ok: false,
        stage: 'check_user',
        message: 'User not found. Please use /start in bot first.',
        debug,
      }, { status: 404 });
    }

    debug.userId = user.id;
    debug.stage = 'get_config';

    // Get Robokassa config
    const config = getRobokassaConfig();
    debug.merchantLogin = config.merchantLogin;
    debug.isTest = config.isTest;

    // Check if recurring is enabled (feature flag)
    const featureRecurring = process.env.FEATURE_RECURRING === 'true' || process.env.FEATURE_RECURRING === '1';
    debug.featureRecurring = featureRecurring;

    debug.stage = 'generate_inv_id';

    // Generate unique InvId (digits only string)
    let invId: string;
    try {
      invId = await generateUniqueInvId(supabase);
      debug.invId = invId;
      console.log('[robokassa/create-monthly] Generated InvId:', invId);
    } catch (invIdError: any) {
      console.error('[robokassa/create-monthly] ❌ InvId generation error:', invIdError.message);
      return NextResponse.json({
        ok: false,
        stage: 'generate_inv_id',
        message: 'Failed to generate unique payment ID',
        debug,
      }, { status: 500 });
    }

    // Payment amount: 199.00 RUB
    const outSum = '199.00';
    const description = 'Monthly subscription';

    debug.outSum = outSum;
    debug.description = description;
    debug.stage = 'generate_form';

    // Determine payment mode
    // For now, use 'minimal' (no Receipt, no Recurring) for simple one-time payment
    // If FEATURE_RECURRING is enabled, we can use 'recurring' mode later
    const mode: PaymentMode = featureRecurring ? 'recurring' : 'minimal';

    // Generate Receipt only if recurring mode
    let receipt = undefined;
    if (mode === 'recurring') {
      receipt = generateReceipt(199.00, description);
    }

    // Generate payment form
    const { html, debug: formDebug } = generatePaymentForm(
      config,
      outSum,
      invId,
      description,
      mode,
      receipt,
      telegramUserId,
      false // Production mode - auto-submit
    );

    // CRITICAL: Server-side logging before returning form
    const finalFormFields = formDebug.finalFormFields || {};
    const shpParams: string[] = [];
    for (const [key, value] of Object.entries(finalFormFields)) {
      if (key.startsWith('Shp_')) {
        shpParams.push(`${key}=${value}`);
      }
    }
    shpParams.sort();

    console.log('[robokassa/create-monthly] ========== PAYMENT FORM READY ==========');
    console.log('[robokassa/create-monthly] MerchantLogin:', config.merchantLogin);
    console.log('[robokassa/create-monthly] OutSum:', outSum);
    console.log('[robokassa/create-monthly] InvId:', invId);
    console.log('[robokassa/create-monthly] Description:', description);
    console.log('[robokassa/create-monthly] HasReceipt:', !!receipt);
    console.log('[robokassa/create-monthly] ReceiptLength:', formDebug.receiptEncodedLength || 0);
    console.log('[robokassa/create-monthly] ShpParams:', shpParams);
    console.log('[robokassa/create-monthly] SignatureString (masked):', formDebug.exactSignatureStringMasked);
    console.log('[robokassa/create-monthly] FormFields keys:', Object.keys(finalFormFields));
    console.log('[robokassa/create-monthly] FormFields (no passwords):', 
      Object.fromEntries(
        Object.entries(finalFormFields).map(([k, v]) => [
          k,
          k === 'SignatureValue' ? `${String(v).substring(0, 8)}...` : v
        ])
      )
    );
    console.log('[robokassa/create-monthly] =========================================');

    // Store payment attempt in DB (non-blocking)
    debug.stage = 'store_payment';
    try {
      const { error: insertError } = await supabase
        .from('payments')
        .insert({
          user_id: user.id,
          telegram_user_id: telegramUserId,
          inv_id: invId,
          invoice_id: invId, // Same as inv_id
          amount: parseFloat(outSum),
          out_sum: parseFloat(outSum),
          mode: mode,
          status: 'created',
          description: description,
        });

      if (insertError) {
        console.warn('[robokassa/create-monthly] ⚠️ DB store failed, but continuing:', insertError);
        debug.dbInsertError = insertError;
      } else {
        console.log('[robokassa/create-monthly] ✅ Payment stored in DB');
      }
    } catch (dbError: any) {
      console.warn('[robokassa/create-monthly] ⚠️ DB store exception, but continuing:', dbError.message);
      debug.dbError = dbError.message;
    }

    debug.stage = 'success';

    // Единый информативный debug объект (такой же формат как в create-trial)
    const unifiedDebug = {
      // Подпись (самое важное для Error 29)
      signature: {
        value: formDebug.signatureValue || 'N/A',
        length: formDebug.signatureValue?.length || 0,
        isValid: formDebug.signatureValue ? /^[0-9a-f]{32}$/.test(formDebug.signatureValue) : false,
        stringMasked: formDebug.exactSignatureStringMasked || 'N/A',
        stringLength: formDebug.exactSignatureString?.length || formDebug.exactSignatureStringMasked?.length || 0,
        parts: formDebug.signatureParts?.map((p: any) => String(p)) || [],
      },
      
      // Параметры платежа
      payment: {
        merchantLogin: config.merchantLogin,
        merchantLoginCorrect: config.merchantLogin === 'steopone',
        outSum: outSum,
        outSumFormat: outSum === '199.00',
        invId: invId,
        invIdValid: (() => {
          const invIdNum = parseInt(invId, 10);
          return invIdNum > 0 && invIdNum <= 2000000000;
        })(),
        description: description,
        mode: mode,
        isTest: config.isTest,
        hasIsTestInForm: 'IsTest' in finalFormFields,
      },
      
      // Shp_* параметры
      shpParams: {
        list: shpParams,
        sorted: JSON.stringify(shpParams) === JSON.stringify([...shpParams].sort()),
        count: shpParams.length,
      },
      
      // Receipt (если есть)
      receipt: {
        present: !!receipt,
        encodedLength: formDebug.receiptEncodedLength || 0,
        inSignature: formDebug.includeReceiptInSignature || false,
        json: receipt ? JSON.stringify(receipt) : null,
        encoded: finalFormFields.Receipt || null,
      },
      
      // Поля формы (что реально отправляется)
      formFields: finalFormFields,
      
      // Проверки валидности
      validation: {
        merchantLoginCorrect: config.merchantLogin === 'steopone',
        outSumFormat: outSum === '199.00',
        invIdValid: (() => {
          const invIdNum = parseInt(invId, 10);
          return invIdNum > 0 && invIdNum <= 2000000000;
        })(),
        signatureFormat: formDebug.signatureValue ? /^[0-9a-f]{32}$/.test(formDebug.signatureValue) : false,
        shpParamsSorted: JSON.stringify(shpParams) === JSON.stringify([...shpParams].sort()),
        receiptConsistent: true, // For minimal mode, no receipt
      },
      
      // Метаданные
      meta: {
        timestamp: new Date().toISOString(),
        stage: 'success',
        dbStored: !debug.dbInsertError && !debug.dbError,
      },
    };

    return NextResponse.json({
      ok: true,
      html, // HTML form for auto-submit
      paymentUrl: 'https://auth.robokassa.ru/Merchant/Index.aspx',
      fields: finalFormFields, // Form fields for manual form creation
      debug: unifiedDebug,
    });

  } catch (error: any) {
    console.error('[robokassa/create-monthly] ❌ CRITICAL ERROR:', error);
    console.error('[robokassa/create-monthly] Error stack:', error.stack);

    debug.stage = 'critical_error';
    debug.error = error.message;
    debug.errorStack = error.stack;

    return NextResponse.json({
      ok: false,
      stage: 'critical_error',
      message: error.message || 'Internal server error',
      debug,
    }, { status: 500 });
  }
}
