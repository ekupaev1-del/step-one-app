import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  buildRobokassaForm,
  generateSafeInvId,
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

    // Payment amount: 199.00 RUB (always 2 decimals as string)
    const outSum = '199.00';
    const description = 'Monthly subscription';

    debug.outSum = outSum;
    debug.description = description;
    debug.stage = 'generate_form';

    // Build form using canonical builder (NO Receipt, NO Recurring for one-time payment)
    let formResult;
    try {
      formResult = buildRobokassaForm({
        merchantLogin: config.merchantLogin,
        password1: config.pass1,
        outSum: outSum,
        invId: invId,
        description: description,
        recurring: false, // One-time payment, no recurring
        shpParams: {
          userId: String(telegramUserId),
        },
        isTest: config.isTest,
      });
    } catch (validationError: any) {
      console.error('[robokassa/create-monthly] ❌ Form validation failed:', validationError.message);
      return NextResponse.json({
        ok: false,
        stage: 'generate_form',
        message: 'Payment form validation failed',
        error: validationError.message,
        debug,
      }, { status: 400 });
    }

    // CRITICAL: Server-side logging before returning form
    const finalFormFields = formResult.fields;
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
    console.log('[robokassa/create-monthly] HasReceipt: false (one-time payment)');
    console.log('[robokassa/create-monthly] ShpParams:', shpParams);
    console.log('[robokassa/create-monthly] SignatureString (masked):', formResult.signature.baseString);
    console.log('[robokassa/create-monthly] SignatureValue:', formResult.signature.value);
    console.log('[robokassa/create-monthly] FormFields keys:', Object.keys(finalFormFields));
    console.log('[robokassa/create-monthly] Validation passed:', formResult.validation.passed);
    if (formResult.validation.warnings.length > 0) {
      console.warn('[robokassa/create-monthly] Warnings:', formResult.validation.warnings);
    }
    console.log('[robokassa/create-monthly] =========================================');

    // Generate HTML form for auto-submit
    const baseUrl = 'https://auth.robokassa.ru/Merchant/Index.aspx';
    const formInputs = Object.entries(finalFormFields)
      .map(([name, value]) => {
        const escapedValue = value
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
        return `    <input type="hidden" name="${name}" value="${escapedValue}">`;
      })
      .join('\n');
    
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Robokassa Payment</title>
</head>
<body>
  <form id="robokassa-form" method="POST" action="${baseUrl}">
${formInputs}
  </form>
  <script>
    document.getElementById('robokassa-form').submit();
  </script>
</body>
</html>`;

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
          mode: 'minimal', // One-time payment
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

    // Unified debug object
    const unifiedDebug = {
      signature: {
        value: formResult.signature.value,
        length: formResult.signature.value.length,
        isValid: /^[0-9a-f]{32}$/.test(formResult.signature.value),
        stringMasked: formResult.signature.baseString,
        stringLength: formResult.signature.baseStringRaw.length,
        parts: formResult.signature.parts,
        variant: formResult.signature.variant,
      },
      payment: {
        merchantLogin: config.merchantLogin,
        merchantLoginCorrect: config.merchantLogin === 'steopone',
        outSum: outSum,
        outSumFormat: outSum === '199.00',
        invId: invId,
        invIdValid: /^\d+$/.test(invId) && parseInt(invId, 10) > 0 && parseInt(invId, 10) <= 2000000000,
        description: description,
        isTest: config.isTest,
        hasIsTestInForm: 'IsTest' in finalFormFields,
      },
      shpParams: {
        list: shpParams,
        sorted: JSON.stringify(shpParams) === JSON.stringify([...shpParams].sort()),
        count: shpParams.length,
      },
      receipt: {
        present: false, // One-time payment, no receipt
        encodedLength: 0,
        inSignature: false,
        json: null,
        encoded: null,
      },
      formFields: finalFormFields,
      validation: formResult.validation,
      meta: {
        timestamp: new Date().toISOString(),
        stage: 'success',
        dbStored: !debug.dbInsertError && !debug.dbError,
      },
    };

    // Build simplified debug output (only critical fields for Error 29)
    const requestUrl = new URL(req.url);
    const debugMode = requestUrl.searchParams.get('debug') === '1';
    
    const debugOutput = debugMode ? {
      // CRITICAL: Only fields needed to fix Error 29
      exactSignatureStringMasked: formResult.signature.baseString,
      signatureValue: formResult.signature.value,
      merchantLogin: config.merchantLogin,
      outSum: outSum,
      invId: invId,
      receiptIncluded: false,
      shpParams: shpParams,
      actionUrl: baseUrl,
    } : undefined;

    return NextResponse.json({
      ok: true,
      actionUrl: baseUrl, // For form action
      fields: finalFormFields, // Form fields
      html, // HTML form for auto-submit (backward compatibility)
      paymentUrl: baseUrl, // Backward compatibility
      debug: debugOutput, // Only if debug=1
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
