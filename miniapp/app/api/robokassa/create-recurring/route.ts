import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  buildRobokassaForm,
  generateSafeInvId,
} from '../../../../lib/robokassa';
import { getRobokassaConfig } from '../../../../lib/robokassaConfig';

export const dynamic = 'force-dynamic';

/**
 * Generate unique InvoiceID with DB collision check
 * Returns string (digits only)
 */
async function generateUniqueInvoiceId(
  supabase: any,
  maxAttempts: number = 5
): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const invoiceId = generateSafeInvId();
    
    const { data: existing } = await supabase
      .from('payments')
      .select('inv_id')
      .eq('inv_id', invoiceId)
      .maybeSingle();
    
    if (!existing) {
      return invoiceId;
    }
    
    console.warn(`[robokassa/create-recurring] InvoiceID collision: ${invoiceId}, retrying...`);
  }
  
  throw new Error('Failed to generate unique InvoiceID after multiple attempts');
}

/**
 * POST /api/robokassa/create-recurring?telegramUserId=...&previousInvoiceId=...
 * 
 * Creates child recurring payment (199 RUB) using PreviousInvoiceID from parent payment
 * 
 * CRITICAL RULES:
 * - Do NOT include Receipt
 * - Do NOT include Recurring field
 * - Signature MUST NOT include PreviousInvoiceID
 * - Signature format: MerchantLogin:OutSum:InvoiceID:Password1:Shp_userId=...
 * 
 * @param telegramUserId - Telegram user ID
 * @param previousInvoiceId - Parent invoice ID (from trial payment)
 * @param debug - Optional debug mode (1 to enable)
 */
export async function POST(req: Request) {
  const debug: any = {
    timestamp: new Date().toISOString(),
    stage: 'start',
  };

  try {
    console.log('[robokassa/create-recurring] ========== CREATE CHILD RECURRING PAYMENT ==========');

    const url = new URL(req.url);
    const telegramUserIdParam = url.searchParams.get('telegramUserId');
    const previousInvoiceIdParam = url.searchParams.get('previousInvoiceId');
    const debugMode = url.searchParams.get('debug') === '1';

    if (!telegramUserIdParam) {
      return NextResponse.json({
        ok: false,
        stage: 'validate_input',
        message: 'telegramUserId is required in query string',
        debug,
      }, { status: 400 });
    }

    if (!previousInvoiceIdParam) {
      return NextResponse.json({
        ok: false,
        stage: 'validate_input',
        message: 'previousInvoiceId is required in query string',
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

    // Validate PreviousInvoiceID format (digits only)
    if (!/^\d+$/.test(previousInvoiceIdParam)) {
      return NextResponse.json({
        ok: false,
        stage: 'validate_input',
        message: 'previousInvoiceId must be digits only',
        debug,
      }, { status: 400 });
    }

    debug.telegramUserId = telegramUserId;
    debug.previousInvoiceId = previousInvoiceIdParam;
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
      console.error('[robokassa/create-recurring] ❌ Supabase error:', userError);
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

    // Verify parent payment exists and is paid
    const { data: parentPayment, error: parentPaymentError } = await supabase
      .from('payments')
      .select('*')
      .eq('inv_id', previousInvoiceIdParam)
      .eq('telegram_user_id', telegramUserId)
      .maybeSingle();

    if (parentPaymentError) {
      console.error('[robokassa/create-recurring] ❌ Error finding parent payment:', parentPaymentError);
      return NextResponse.json({
        ok: false,
        stage: 'check_parent_payment',
        message: 'Database error',
        debug,
      }, { status: 500 });
    }

    if (!parentPayment) {
      return NextResponse.json({
        ok: false,
        stage: 'check_parent_payment',
        message: 'Parent payment not found. Please complete trial payment first.',
        debug,
      }, { status: 404 });
    }

    if (parentPayment.status !== 'paid' && parentPayment.status !== 'trial_active') {
      return NextResponse.json({
        ok: false,
        stage: 'check_parent_payment',
        message: `Parent payment status is "${parentPayment.status}", expected "paid" or "trial_active"`,
        debug,
      }, { status: 400 });
    }

    debug.userId = user.id;
    debug.parentPaymentId = parentPayment.id;
    debug.stage = 'get_config';

    // Get Robokassa config
    const config = getRobokassaConfig();
    debug.merchantLogin = config.merchantLogin;
    debug.isTest = config.isTest;

    debug.stage = 'generate_invoice_id';

    // Generate unique InvoiceID for child payment
    let invoiceId: string;
    try {
      invoiceId = await generateUniqueInvoiceId(supabase);
      debug.invoiceId = invoiceId;
      console.log('[robokassa/create-recurring] Generated InvoiceID:', invoiceId);
    } catch (invoiceIdError: any) {
      console.error('[robokassa/create-recurring] ❌ InvoiceID generation error:', invoiceIdError.message);
      return NextResponse.json({
        ok: false,
        stage: 'generate_invoice_id',
        message: 'Failed to generate unique payment ID',
        debug,
      }, { status: 500 });
    }

    // Child payment: 199.00 RUB
    const outSum = '199.00';
    const description = 'Step One — monthly subscription';

    debug.outSum = outSum;
    debug.description = description;
    debug.stage = 'generate_form';

    // Build form using canonical builder
    // CRITICAL: NO Receipt, NO Recurring for child payment
    // Signature: MerchantLogin:OutSum:InvoiceID:Password1:Shp_userId=...
    // PreviousInvoiceID is NOT included in signature!
    let formResult;
    try {
      formResult = buildRobokassaForm({
        merchantLogin: config.merchantLogin,
        password1: config.pass1,
        outSum: outSum,
        invId: invoiceId, // Use as InvId in builder, but will be renamed to InvoiceID for Recurring endpoint
        description: description,
        recurring: false, // NO Recurring for child payment
        // NO Receipt for child payment
        shpParams: {
          userId: String(telegramUserId),
        },
        isTest: config.isTest,
      });
    } catch (validationError: any) {
      console.error('[robokassa/create-recurring] ❌ Form validation failed:', validationError.message);
      return NextResponse.json({
        ok: false,
        stage: 'generate_form',
        message: 'Payment form validation failed',
        error: validationError.message,
        debug,
      }, { status: 400 });
    }

    // CRITICAL: For Recurring endpoint, we need to:
    // 1. Rename InvId to InvoiceID
    // 2. Add PreviousInvoiceID (NOT in signature)
    // 3. Remove Receipt if present
    // 4. Remove Recurring if present
    const fields: Record<string, string> = {};
    
    // Copy all fields except InvId, Receipt, Recurring
    for (const [key, value] of Object.entries(formResult.fields)) {
      if (key === 'InvId') {
        // Rename InvId to InvoiceID for Recurring endpoint
        fields['InvoiceID'] = value;
      } else if (key === 'Receipt' || key === 'Recurring') {
        // Skip Receipt and Recurring for child payment
        continue;
      } else {
        fields[key] = value;
      }
    }
    
    // Add PreviousInvoiceID (NOT in signature, just in form)
    fields['PreviousInvoiceID'] = previousInvoiceIdParam;

    // CRITICAL: Server-side logging
    const shpParams: string[] = [];
    for (const [key, value] of Object.entries(fields)) {
      if (key.startsWith('Shp_')) {
        shpParams.push(`${key}=${value}`);
      }
    }
    shpParams.sort();

    console.log('[robokassa/create-recurring] ========== CHILD RECURRING PAYMENT FORM READY ==========');
    console.log('[robokassa/create-recurring] MerchantLogin:', config.merchantLogin);
    console.log('[robokassa/create-recurring] OutSum:', outSum);
    console.log('[robokassa/create-recurring] InvoiceID:', invoiceId);
    console.log('[robokassa/create-recurring] PreviousInvoiceID:', previousInvoiceIdParam);
    console.log('[robokassa/create-recurring] HasReceipt: false (child payment)');
    console.log('[robokassa/create-recurring] HasRecurring: false (child payment)');
    console.log('[robokassa/create-recurring] ShpParams:', shpParams);
    console.log('[robokassa/create-recurring] SignatureString (masked):', formResult.signature.baseString);
    console.log('[robokassa/create-recurring] PreviousInvoiceID NOT in signature: ✅');
    console.log('[robokassa/create-recurring] Validation passed:', formResult.validation.passed);
    console.log('[robokassa/create-recurring] =========================================');

    // Store child payment attempt in DB
    debug.stage = 'store_payment';
    try {
      const { error: insertError } = await supabase
        .from('payments')
        .insert({
          user_id: user.id,
          telegram_user_id: telegramUserId,
          inv_id: invoiceId,
          invoice_id: invoiceId,
          parent_invoice_id: Number(previousInvoiceIdParam),
          amount: parseFloat(outSum),
          out_sum: parseFloat(outSum),
          mode: 'recurring', // Child recurring payment
          status: 'subscription_pending', // Will be updated to "subscription_active" after ResultURL confirms
          description: description,
        });

      if (insertError) {
        console.warn('[robokassa/create-recurring] ⚠️ DB store failed, but continuing:', insertError);
        debug.dbInsertError = insertError;
      } else {
        console.log('[robokassa/create-recurring] ✅ Payment stored in DB with status: subscription_pending');
      }
    } catch (dbError: any) {
      console.warn('[robokassa/create-recurring] ⚠️ DB store exception, but continuing:', dbError.message);
      debug.dbError = dbError.message;
    }

    debug.stage = 'success';

    // Action URL for Recurring endpoint
    const actionUrl = 'https://auth.robokassa.ru/Merchant/Recurring';

    // Build simplified debug output (only critical fields for Error 29)
    const debugOutput = debugMode ? {
      // CRITICAL: Only fields needed to fix Error 29
      exactSignatureStringMasked: formResult.signature.baseString,
      signatureValue: formResult.signature.value,
      merchantLogin: config.merchantLogin,
      outSum: outSum,
      invId: invoiceId,
      receiptIncluded: false,
      shpParams: shpParams,
      actionUrl: actionUrl,
      previousInvoiceId: previousInvoiceIdParam,
      previousInvoiceIdInSignature: false, // CRITICAL: PreviousInvoiceID NOT in signature
    } : undefined;

    return NextResponse.json({
      ok: true,
      actionUrl: actionUrl,
      fields: fields,
      debug: debugMode ? debugOutput : undefined,
    });

  } catch (error: any) {
    console.error('[robokassa/create-recurring] ❌ CRITICAL ERROR:', error);
    console.error('[robokassa/create-recurring] Error stack:', error.stack);

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

