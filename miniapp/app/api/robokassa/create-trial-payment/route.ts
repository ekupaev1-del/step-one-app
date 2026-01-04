import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  buildRobokassaForm,
  generateSafeInvId,
  generateReceipt,
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
    const invId = generateSafeInvId();
    
    const { data: existing } = await supabase
      .from('payments')
      .select('inv_id')
      .eq('inv_id', invId)
      .maybeSingle();
    
    if (!existing) {
      return invId;
    }
    
    console.warn(`[robokassa/create-trial-payment] InvId collision: ${invId}, retrying...`);
  }
  
  throw new Error('Failed to generate unique InvId after multiple attempts');
}

/**
 * POST /api/robokassa/create-trial-payment?telegramUserId=...
 * 
 * Creates trial payment (1 RUB) with Recurring=true (parent payment for card binding)
 * 
 * Flow:
 * 1. User pays 1 RUB with Recurring=true
 * 2. Card is saved by Robokassa
 * 3. After 3 days, cron triggers recurring charge (199 RUB) using PreviousInvoiceID
 */
export async function POST(req: Request) {
  const debug: any = {
    timestamp: new Date().toISOString(),
    stage: 'start',
  };

  try {
    console.log('[robokassa/create-trial-payment] ========== CREATE TRIAL PAYMENT ==========');

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
      console.error('[robokassa/create-trial-payment] ❌ Supabase error:', userError);
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

    debug.stage = 'generate_inv_id';

    // Generate unique InvId
    let invId: string;
    try {
      invId = await generateUniqueInvId(supabase);
      debug.invId = invId;
      console.log('[robokassa/create-trial-payment] Generated InvId:', invId);
    } catch (invIdError: any) {
      console.error('[robokassa/create-trial-payment] ❌ InvId generation error:', invIdError.message);
      return NextResponse.json({
        ok: false,
        stage: 'generate_inv_id',
        message: 'Failed to generate unique payment ID',
        debug,
      }, { status: 500 });
    }

    // Trial payment: 1.00 RUB with Recurring=true
    const outSum = '1.00';
    const description = 'Step One — trial 3 days';

    debug.outSum = outSum;
    debug.description = description;
    debug.stage = 'generate_form';

    // Generate Receipt for trial payment
    const receipt = generateReceipt(1.00, description);

    // Build form using canonical builder with Recurring=true
    let formResult;
    try {
      formResult = buildRobokassaForm({
        merchantLogin: config.merchantLogin,
        password1: config.pass1,
        outSum: outSum,
        invId: invId,
        description: description,
        recurring: true, // CRITICAL: Recurring=true for parent payment
        receipt: receipt, // Include Receipt for fiscalization
        shpParams: {
          userId: String(telegramUserId),
        },
        isTest: config.isTest,
      });
    } catch (validationError: any) {
      console.error('[robokassa/create-trial-payment] ❌ Form validation failed:', validationError.message);
      return NextResponse.json({
        ok: false,
        stage: 'generate_form',
        message: 'Payment form validation failed',
        error: validationError.message,
        debug,
      }, { status: 400 });
    }

    // CRITICAL: Server-side logging
    const finalFormFields = formResult.fields;
    const shpParams: string[] = [];
    for (const [key, value] of Object.entries(finalFormFields)) {
      if (key.startsWith('Shp_')) {
        shpParams.push(`${key}=${value}`);
      }
    }
    shpParams.sort();

    console.log('[robokassa/create-trial-payment] ========== TRIAL PAYMENT FORM READY ==========');
    console.log('[robokassa/create-trial-payment] MerchantLogin:', config.merchantLogin);
    console.log('[robokassa/create-trial-payment] OutSum:', outSum);
    console.log('[robokassa/create-trial-payment] InvId:', invId);
    console.log('[robokassa/create-trial-payment] Recurring: true (parent payment)');
    console.log('[robokassa/create-trial-payment] HasReceipt: true');
    console.log('[robokassa/create-trial-payment] ShpParams:', shpParams);
    console.log('[robokassa/create-trial-payment] SignatureString (masked):', formResult.signature.baseString);
    console.log('[robokassa/create-trial-payment] Validation passed:', formResult.validation.passed);
    if (formResult.validation.warnings.length > 0) {
      console.warn('[robokassa/create-trial-payment] Warnings:', formResult.validation.warnings);
    }
    console.log('[robokassa/create-trial-payment] =========================================');

    // Store payment attempt in DB with status "trial_pending_payment"
    debug.stage = 'store_payment';
    try {
      const receiptJson = JSON.stringify(receipt);
      const receiptEncoded = finalFormFields.Receipt;

      const { error: insertError } = await supabase
        .from('payments')
        .insert({
          user_id: user.id,
          telegram_user_id: telegramUserId,
          inv_id: invId,
          invoice_id: invId,
          amount: parseFloat(outSum),
          out_sum: parseFloat(outSum),
          mode: 'recurring', // Parent recurring payment
          status: 'trial_pending_payment', // Will be updated to "trial_active" after ResultURL confirms payment
          description: description,
          debug: {
            receipt_raw: receiptJson,
            receipt_encoded: receiptEncoded,
            signature_base: formResult.signature.baseString,
            timestamp: new Date().toISOString(),
          },
        });

      if (insertError) {
        console.warn('[robokassa/create-trial-payment] ⚠️ DB store failed, but continuing:', insertError);
        debug.dbInsertError = insertError;
      } else {
        console.log('[robokassa/create-trial-payment] ✅ Payment stored in DB with status: trial_pending_payment');
      }
    } catch (dbError: any) {
      console.warn('[robokassa/create-trial-payment] ⚠️ DB store exception, but continuing:', dbError.message);
      debug.dbError = dbError.message;
    }

    debug.stage = 'success';

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
  <title>Robokassa Trial Payment</title>
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
        outSumFormat: outSum === '1.00',
        invId: invId,
        invIdValid: /^\d+$/.test(invId) && parseInt(invId, 10) > 0 && parseInt(invId, 10) <= 2000000000,
        description: description,
        recurring: true,
        isTest: config.isTest,
        hasIsTestInForm: 'IsTest' in finalFormFields,
      },
      shpParams: {
        list: shpParams,
        sorted: JSON.stringify(shpParams) === JSON.stringify([...shpParams].sort()),
        count: shpParams.length,
      },
      receipt: {
        present: true,
        encodedLength: finalFormFields.Receipt?.length || 0,
        inSignature: true,
        json: JSON.stringify(receipt),
        encoded: finalFormFields.Receipt || null,
      },
      formFields: finalFormFields,
      validation: formResult.validation,
      meta: {
        timestamp: new Date().toISOString(),
        stage: 'success',
        dbStored: !debug.dbInsertError && !debug.dbError,
      },
    };

    // Build debug output (only if debug=1)
    const requestUrl = new URL(req.url);
    const debugMode = requestUrl.searchParams.get('debug') === '1';
    
    const debugOutput = debugMode ? {
      exactSignatureStringMasked: formResult.signature.baseString,
      signatureValue: formResult.signature.value,
      fieldsKeys: Object.keys(finalFormFields),
      actionUrl: baseUrl,
      receiptIncluded: true,
      note: 'Parent recurring payment: Receipt included in signature',
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
    console.error('[robokassa/create-trial-payment] ❌ CRITICAL ERROR:', error);
    console.error('[robokassa/create-trial-payment] Error stack:', error.stack);

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

