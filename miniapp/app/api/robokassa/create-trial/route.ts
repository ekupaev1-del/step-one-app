import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  getRobokassaConfig,
  generateReceipt,
  generatePaymentForm,
  generateSafeInvId,
  PaymentMode,
} from '../../../../lib/robokassa';

export const dynamic = 'force-dynamic';

/**
 * Generate unique InvId with DB collision check
 */
async function generateUniqueInvId(
  supabase: any,
  maxAttempts: number = 5
): Promise<number> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const invId = generateSafeInvId();
    
    // Check if invId already exists
    const { data: existing } = await supabase
      .from('payments')
      .select('inv_id')
      .eq('inv_id', invId)
      .maybeSingle();
    
    if (!existing) {
      return invId;
    }
    
    console.warn(`[robokassa/create-trial] InvId collision detected: ${invId}, retrying...`);
  }
  
  throw new Error('Failed to generate unique InvId after multiple attempts');
}

/**
 * Store payment attempt in DB (non-blocking)
 * Uses schema: user_id (UUID), telegram_user_id (bigint), inv_id, out_sum/amount, mode, status, description
 * Returns debug info about the operation
 * IMPORTANT: This must NOT fail the payment flow if DB insert fails
 */
async function storePaymentAttempt(
  supabase: any,
  userId: string, // UUID from users table
  telegramUserId: number,
  invId: number,
  outSum: string,
  mode: PaymentMode,
  description: string,
  receiptJson?: string,
  receiptEncoded?: string,
  signatureBase?: string,
  signatureValue?: string
): Promise<{ ok: boolean; error?: any; debug?: any }> {
  try {
    // Build insert payload matching EXACT column names in DB
    // Include debug field (jsonb) - migration should add this column
    // CRITICAL: Use 'amount' if it exists, otherwise use 'out_sum'
    // Also handle 'invoice_id' vs 'inv_id' mismatch
    // Description column should exist after migration add_description_to_payments.sql
    const insertPayload: any = {
      user_id: userId,
      telegram_user_id: telegramUserId,
      // Try both inv_id and invoice_id to handle schema mismatch
      inv_id: invId,
      invoice_id: invId, // Also set invoice_id in case it exists
      // Try both amount and out_sum to handle schema mismatch
      amount: parseFloat(outSum), // Use 'amount' if it exists (NOT NULL constraint)
      out_sum: parseFloat(outSum), // Also set out_sum in case it exists
      mode: mode,
      status: 'created',
      description: description || null, // Should exist after migration
      debug: {
        receipt_raw: receiptJson || null,
        receipt_encoded: receiptEncoded || null,
        receipt_json_length: receiptJson?.length || 0,
        receipt_encoded_length: receiptEncoded?.length || 0,
        signature_base: signatureBase || null,
        signature_value_length: signatureValue?.length || 0,
        timestamp: new Date().toISOString(),
      },
    };

    // Log insert payload keys for debugging (without sensitive data)
    const payloadKeys = Object.keys(insertPayload);
    console.log('[robokassa/create-trial] DB insert payload keys:', payloadKeys);
    console.log('[robokassa/create-trial] DB insert payload (safe):', {
      user_id: insertPayload.user_id,
      telegram_user_id: insertPayload.telegram_user_id,
      inv_id: insertPayload.inv_id,
      invoice_id: insertPayload.invoice_id,
      amount: insertPayload.amount,
      out_sum: insertPayload.out_sum,
      mode: insertPayload.mode,
      status: insertPayload.status,
      description: insertPayload.description,
      has_debug: !!insertPayload.debug,
      debug_keys: Object.keys(insertPayload.debug || {}),
    });

    const { error: insertError, data } = await supabase
      .from('payments')
      .insert(insertPayload)
      .select()
      .single();

    if (insertError) {
      // Enhanced error logging with exact insert payload keys and Supabase error fields
      console.error('[robokassa/create-trial] ❌ DB insert error:', {
        // Supabase/PostgREST error fields
        code: insertError.code,
        message: insertError.message,
        details: insertError.details,
        hint: insertError.hint,
        // Additional error context
        insertPayloadKeys: payloadKeys,
        insertPayloadKeysCount: payloadKeys.length,
        // Full error object (for debugging)
        fullError: insertError,
      });
      
      // Also log the error in a structured format for easier debugging
      console.error('[robokassa/create-trial] DB error details:', JSON.stringify({
        code: insertError.code,
        message: insertError.message,
        details: insertError.details,
        hint: insertError.hint,
        insertPayloadKeys: payloadKeys,
      }, null, 2));
      
      return {
        ok: false,
        error: {
          code: insertError.code,
          message: insertError.message,
          details: insertError.details,
          hint: insertError.hint,
          insertPayloadKeys: payloadKeys, // Include payload keys for debugging
        },
      };
    }

    return { ok: true, debug: { inserted: data } };
  } catch (dbError: any) {
    // Enhanced exception logging
    console.error('[robokassa/create-trial] ❌ DB insert exception:', {
      message: dbError.message,
      stack: dbError.stack,
      name: dbError.name,
      fullError: dbError,
    });
    
    return {
      ok: false,
      error: {
        message: dbError.message,
        stack: dbError.stack,
        name: dbError.name,
      },
    };
  }
}

/**
 * POST /api/robokassa/create-trial
 * 
 * Creates trial payment (1 RUB) with optional Receipt and Recurring
 * 
 * Query params:
 * - telegramUserId: Telegram user ID (required)
 * - mode: 'minimal' | 'recurring' (default: 'recurring')
 * 
 * Returns:
 * - On success: { ok: true, html: string, debug: object }
 * - On error: { ok: false, stage: string, message: string, debug: object }
 */
export async function POST(req: Request) {
  const debug: any = {
    timestamp: new Date().toISOString(),
    stage: 'start',
  };

  try {
    console.log('[robokassa/create-trial] ========== CREATE TRIAL PAYMENT ==========');

    // Get query parameters
    const url = new URL(req.url);
    const telegramUserIdParam = url.searchParams.get('telegramUserId');
    const modeParam = (url.searchParams.get('mode') || 'recurring') as PaymentMode;

    debug.stage = 'validate_input';
    debug.telegramUserIdParam = telegramUserIdParam;
    debug.modeParam = modeParam;

    if (!telegramUserIdParam) {
      console.error('[robokassa/create-trial] ❌ telegramUserId missing');
      return NextResponse.json({
        ok: false,
        stage: 'validate_input',
        message: 'telegramUserId is required in query string',
        debug,
      }, { status: 500 });
    }

    if (modeParam !== 'minimal' && modeParam !== 'recurring') {
      console.error('[robokassa/create-trial] ❌ Invalid mode:', modeParam);
      return NextResponse.json({
        ok: false,
        stage: 'validate_input',
        message: 'mode must be "minimal" or "recurring"',
        debug,
      }, { status: 500 });
    }

    const telegramUserId = Number(telegramUserIdParam);
    if (!Number.isFinite(telegramUserId) || telegramUserId <= 0) {
      console.error('[robokassa/create-trial] ❌ Invalid telegramUserId:', telegramUserIdParam);
      return NextResponse.json({
        ok: false,
        stage: 'validate_input',
        message: 'telegramUserId must be a positive number',
        debug,
      }, { status: 500 });
    }

    debug.telegramUserId = telegramUserId;
    debug.mode = modeParam;
    console.log('[robokassa/create-trial] Telegram User ID:', telegramUserId);
    console.log('[robokassa/create-trial] Mode:', modeParam);

    // Initialize Supabase
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    debug.stage = 'check_user';

    // Check if user exists
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, telegram_id')
      .eq('telegram_id', telegramUserId)
      .maybeSingle();

    if (userError) {
      console.error('[robokassa/create-trial] ❌ Supabase error:', userError);
      return NextResponse.json({
        ok: false,
        stage: 'check_user',
        message: 'Database error',
        debug,
      }, { status: 500 });
    }

    if (!user) {
      console.error('[robokassa/create-trial] ❌ User not found:', telegramUserId);
      return NextResponse.json({
        ok: false,
        stage: 'check_user',
        message: 'User not found. Please use /start in bot first.',
        debug,
      }, { status: 500 });
    }

    debug.userId = user.id;
    debug.stage = 'get_config';
    console.log('[robokassa/create-trial] User found, id:', user.id);

    // Get Robokassa config
    let config;
    try {
      config = getRobokassaConfig();
      debug.merchantLogin = config.merchantLogin;
      debug.isTest = config.isTest;
      debug.robokassaTestMode = process.env.ROBOKASSA_TEST_MODE;
      
      // TEMP DEBUG: Log merchantLogin value (not masked) for error 26 diagnosis
      // IMPORTANT: Must be exactly "steopone" (case-sensitive)
      console.log('[robokassa/create-trial] TEMP DEBUG: merchantLogin:', config.merchantLogin);
      if (config.merchantLogin !== 'steopone') {
        console.error('[robokassa/create-trial] ❌ CRITICAL: merchantLogin is not "steopone"! Current value:', config.merchantLogin);
        console.error('[robokassa/create-trial] ❌ This will cause Robokassa Error 26!');
      }
      console.log('[robokassa/create-trial] Robokassa config loaded, merchant:', config.merchantLogin);
      console.log('[robokassa/create-trial] Test mode:', config.isTest);
    } catch (configError: any) {
      console.error('[robokassa/create-trial] ❌ Config error:', configError.message);
      return NextResponse.json({
        ok: false,
        stage: 'get_config',
        message: 'Robokassa configuration error',
        debug,
      }, { status: 500 });
    }

    debug.stage = 'generate_inv_id';

    // Generate unique InvId (<= 2_000_000_000)
    let invId: number;
    try {
      invId = await generateUniqueInvId(supabase);
      debug.invId = invId;
      debug.invIdGenerated = true;
      
      // TEMP DEBUG: Log invId for error 26 diagnosis
      console.log('[robokassa/create-trial] TEMP DEBUG: Generated InvId:', invId);
    } catch (invIdError: any) {
      console.error('[robokassa/create-trial] ❌ InvId generation error:', invIdError.message);
      return NextResponse.json({
        ok: false,
        stage: 'generate_inv_id',
        message: 'Failed to generate unique payment ID',
        debug,
      }, { status: 500 });
    }

    // Payment amount: 1.00 (exactly 2 decimals as string)
    const outSum = '1.00';
    const description = 'Trial subscription 3 days'; // ASCII, no emojis

    debug.outSum = outSum;
    debug.description = description;

    // TEMP DEBUG: Log outSum for error 26 diagnosis
    console.log('[robokassa/create-trial] TEMP DEBUG: outSum:', outSum);

    debug.stage = 'generate_form';

    // Generate Receipt only for recurring mode
    let receipt;
    let receiptJson: string | undefined;
    let receiptEncoded: string | undefined;
    if (modeParam === 'recurring') {
      receipt = generateReceipt(1.00);
      receiptJson = JSON.stringify(receipt);
      receiptEncoded = encodeURIComponent(receiptJson);
      debug.receipt = receipt;
      debug.receiptItemSum = receipt.items[0].sum;
      debug.receiptMatchesOutSum = receipt.items[0].sum === 1.00;
    }

    // Always use debug mode (no auto-submit) for easier debugging
    const debugMode = true; // Always true to show debug page

    // Generate payment form - IMPORTANT: pass telegramUserId so Shp_userId is included in signature
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/43e8883f-375d-4d43-af6f-fef79b5ebbe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'create-trial/route.ts:POST',message:'Before generatePaymentForm',data:{configMerchantLogin:config.merchantLogin,configIsTest:config.isTest,outSum:outSum,outSumType:typeof outSum,invId:invId,invIdType:typeof invId,description:description,modeParam:modeParam,hasReceipt:!!receipt,telegramUserId:telegramUserId,telegramUserIdType:typeof telegramUserId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'J'})}).catch(()=>{});
    // #endregion
    const { html, debug: formDebug } = generatePaymentForm(
      config,
      outSum,
      invId,
      description,
      modeParam,
      receipt,
      telegramUserId, // Pass telegramUserId so Shp_userId is included in form AND signature
      debugMode
    );
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/43e8883f-375d-4d43-af6f-fef79b5ebbe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'create-trial/route.ts:POST',message:'After generatePaymentForm',data:{formDebugSignatureValue:formDebug.signatureValue,formDebugSignatureLength:formDebug.signatureLength,formDebugMerchantLoginIsSteopone:formDebug.merchantLoginIsSteopone,formDebugOutSum:formDebug.outSum,formDebugCustomParams:formDebug.customParams,formDebugFormFieldsKeys:Object.keys(formDebug.finalFormFields||{})},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
    // #endregion

    // ========== DETAILED DEBUG FOR ERROR 29 ==========
    console.log('[robokassa/create-trial] ========== ERROR 29 DIAGNOSTICS ==========');
    console.log('[robokassa/create-trial] Mode:', modeParam);
    console.log('[robokassa/create-trial] MerchantLogin:', config.merchantLogin);
    console.log('[robokassa/create-trial] MerchantLogin is "steopone":', config.merchantLogin === 'steopone');
    console.log('[robokassa/create-trial] OutSum:', outSum, '(type:', typeof outSum, ')');
    console.log('[robokassa/create-trial] OutSum formatted:', formDebug.outSum);
    console.log('[robokassa/create-trial] InvId:', invId, '(type:', typeof invId, ', <= 2B:', invId <= 2000000000, ')');
    console.log('[robokassa/create-trial] Description:', description);
    console.log('[robokassa/create-trial] TelegramUserId:', telegramUserId);
    console.log('[robokassa/create-trial] IsTest:', config.isTest);
    console.log('[robokassa/create-trial] Receipt present:', !!receipt);
    console.log('[robokassa/create-trial] Receipt encoded length:', formDebug.receiptEncodedLength || 0);
    console.log('[robokassa/create-trial] Custom params (Shp_*):', formDebug.customParams || []);
    console.log('[robokassa/create-trial] Custom params count:', formDebug.customParams?.length || 0);
    console.log('[robokassa/create-trial] Custom params sorted:', JSON.stringify(formDebug.customParams || []) === JSON.stringify([...(formDebug.customParams || [])].sort()));
    console.log('[robokassa/create-trial] Exact signature string (masked):', formDebug.exactSignatureStringMasked);
    console.log('[robokassa/create-trial] Signature value:', formDebug.signatureValue);
    console.log('[robokassa/create-trial] Signature length:', formDebug.signatureLength);
    console.log('[robokassa/create-trial] Signature is lowercase:', formDebug.signatureValue === formDebug.signatureValue.toLowerCase());
    console.log('[robokassa/create-trial] Form fields keys:', Object.keys(formDebug.finalFormFields || {}));
    console.log('[robokassa/create-trial] Form fields count:', Object.keys(formDebug.finalFormFields || {}).length);
    console.log('[robokassa/create-trial] Shp_userId in form:', 'Shp_userId' in (formDebug.finalFormFields || {}));
    console.log('[robokassa/create-trial] Receipt in form:', 'Receipt' in (formDebug.finalFormFields || {}));
    console.log('[robokassa/create-trial] Recurring in form:', 'Recurring' in (formDebug.finalFormFields || {}));
    console.log('[robokassa/create-trial] SignatureValue in form:', 'SignatureValue' in (formDebug.finalFormFields || {}));
    console.log('[robokassa/create-trial] ============================================');

    // Store payment attempt in DB (non-blocking - do not fail request if this fails)
    debug.stage = 'store_payment';
    const dbStoreResult = await storePaymentAttempt(
      supabase,
      user.id, // UUID
      telegramUserId,
      invId,
      outSum,
      modeParam,
      description,
      receiptJson,
      receiptEncoded,
      formDebug.signatureBaseWithoutPassword,
      formDebug.signatureValue
    );
    debug.dbStore = dbStoreResult;
    
    // IMPORTANT: Do NOT fail the payment flow if DB insert fails
    if (!dbStoreResult.ok) {
      console.warn('[robokassa/create-trial] ⚠️ DB store failed, but continuing payment flow');
      console.warn('[robokassa/create-trial] DB error details:', JSON.stringify(dbStoreResult.error, null, 2));
      // Return debug info about DB failure but still return success
      debug.dbInsertError = {
        stage: 'db_insert',
        message: dbStoreResult.error?.message || 'DB insert failed',
        details: dbStoreResult.error?.details,
        hint: dbStoreResult.error?.hint,
      };
    } else {
      console.log('[robokassa/create-trial] ✅ Payment stored in DB');
    }

    // Merge debug info
    debug.stage = 'success';
    debug.formGeneration = formDebug;
    debug.debugModeEnabled = debugMode;

    // Log success summary
    console.log('[robokassa/create-trial] ========== SUCCESS ==========');
    console.log('[robokassa/create-trial] Payment form generated successfully');
    console.log('[robokassa/create-trial] DB store result:', dbStoreResult.ok ? 'OK' : 'FAILED');
    if (!dbStoreResult.ok) {
      console.error('[robokassa/create-trial] DB error details:', JSON.stringify(dbStoreResult.error, null, 2));
    }

    return NextResponse.json({
      ok: true,
      html,
      debug: {
        stage: debug.stage,
        mode: debug.mode,
        merchantLogin: debug.merchantLogin,
        merchantLoginIsSteopone: formDebug.merchantLoginIsSteopone,
        outSum: debug.outSum,
        invId: debug.invId,
        description: debug.description,
        isTest: debug.isTest,
        isTestIncluded: debug.isTest,
        robokassaTestMode: debug.robokassaTestMode,
        debugModeEnabled: debug.debugModeEnabled,
        signatureBaseWithoutPassword: formDebug.signatureBaseWithoutPassword,
        signatureValue: formDebug.signatureValue, // Will be masked in UI
        customParams: formDebug.customParams || [], // Show which Shp_* params were included
        formFields: formDebug.formFields,
        receiptRawLength: formDebug.receiptRawLength,
        receiptEncodedLength: formDebug.receiptEncodedLength,
        receiptEncodedPreview: formDebug.receiptEncodedPreview,
        dbInsertOk: dbStoreResult.ok,
        dbError: dbStoreResult.error || undefined,
        dbInsertError: debug.dbInsertError || undefined,
      },
    });
  } catch (error: any) {
    console.error('[robokassa/create-trial] ❌ CRITICAL ERROR:', error);
    console.error('[robokassa/create-trial] Error stack:', error.stack);

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
