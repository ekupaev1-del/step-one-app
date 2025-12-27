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
 * Returns debug info about the operation
 */
async function storePaymentAttempt(
  supabase: any,
  telegramUserId: number,
  invId: number,
  outSum: string,
  mode: PaymentMode
): Promise<{ ok: boolean; error?: any; debug?: any }> {
  try {
    const { error: insertError, data } = await supabase
      .from('payments')
      .insert({
        telegram_user_id: telegramUserId,
        inv_id: invId,
        out_sum: parseFloat(outSum),
        mode: mode,
        status: 'created',
      })
      .select()
      .single();

    if (insertError) {
      // Log full PostgREST error details
      console.error('[robokassa/create-trial] ❌ DB insert error:', {
        code: insertError.code,
        message: insertError.message,
        details: insertError.details,
        hint: insertError.hint,
        fullError: insertError,
      });
      
      return {
        ok: false,
        error: {
          code: insertError.code,
          message: insertError.message,
          details: insertError.details,
          hint: insertError.hint,
        },
      };
    }

    return { ok: true, debug: { inserted: data } };
  } catch (dbError: any) {
    console.error('[robokassa/create-trial] ❌ DB insert exception:', {
      message: dbError.message,
      stack: dbError.stack,
      fullError: dbError,
    });
    
    return {
      ok: false,
      error: {
        message: dbError.message,
        stack: dbError.stack,
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
      console.log('[robokassa/create-trial] Generated InvId:', invId);
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

    // Store payment attempt in DB (non-blocking)
    debug.stage = 'store_payment';
    const dbStoreResult = await storePaymentAttempt(
      supabase,
      telegramUserId,
      invId,
      outSum,
      modeParam
    );
    debug.dbStore = dbStoreResult;
    
    if (!dbStoreResult.ok) {
      console.warn('[robokassa/create-trial] ⚠️ DB store failed, but continuing payment flow');
    } else {
      console.log('[robokassa/create-trial] ✅ Payment stored in DB');
    }

    debug.stage = 'generate_form';

    // Generate Receipt only for recurring mode
    let receipt;
    if (modeParam === 'recurring') {
      receipt = generateReceipt(1.00);
      debug.receipt = receipt;
      debug.receiptItemSum = receipt.items[0].sum;
      debug.receiptMatchesOutSum = receipt.items[0].sum === 1.00;
    }

    // Check if debug mode is enabled
    const debugMode = process.env.ROBOKASSA_DEBUG_FORM === 'true';

    // Generate payment form
    const { html, debug: formDebug } = generatePaymentForm(
      config,
      outSum,
      invId,
      description,
      modeParam,
      receipt,
      telegramUserId,
      debugMode
    );

    // Merge debug info
    debug.stage = 'success';
    debug.formGeneration = formDebug;
    debug.debugModeEnabled = debugMode;

    // Log signature base WITHOUT password (safe logging)
    console.log('[robokassa/create-trial] ========== SUCCESS ==========');
    console.log('[robokassa/create-trial] Mode:', modeParam);
    console.log('[robokassa/create-trial] InvId:', invId);
    console.log('[robokassa/create-trial] OutSum:', outSum);
    console.log('[robokassa/create-trial] Signature base (no password):', formDebug.signatureBaseWithoutPassword);
    console.log('[robokassa/create-trial] Form fields (safe):', Object.keys(formDebug.formFields));
    console.log('[robokassa/create-trial] DB store result:', dbStoreResult.ok ? 'OK' : 'FAILED');
    console.log('[robokassa/create-trial] Debug mode:', debugMode);

    return NextResponse.json({
      ok: true,
      html,
      debug: {
        stage: debug.stage,
        mode: debug.mode,
        merchantLogin: debug.merchantLogin,
        outSum: debug.outSum,
        invId: debug.invId,
        description: debug.description,
        isTest: debug.isTest,
        isTestIncluded: debug.isTest,
        robokassaTestMode: debug.robokassaTestMode,
        debugModeEnabled: debug.debugModeEnabled,
        signatureBaseWithoutPassword: formDebug.signatureBaseWithoutPassword,
        signatureValue: formDebug.signatureValue,
        formFields: formDebug.formFields,
        receiptRawLength: formDebug.receiptRawLength,
        receiptEncodedLength: formDebug.receiptEncodedLength,
        receiptEncodedPreview: formDebug.receiptEncodedPreview,
        dbStore: {
          ok: dbStoreResult.ok,
          error: dbStoreResult.error || undefined,
        },
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
