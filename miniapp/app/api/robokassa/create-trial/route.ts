import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  getRobokassaConfig,
  generateReceipt,
  generatePaymentForm,
} from '../../../../lib/robokassa';

export const dynamic = 'force-dynamic';

/**
 * POST /api/robokassa/create-trial
 * 
 * Creates trial payment (1 RUB) with Recurring=true and Receipt
 * 
 * Query params:
 * - telegramUserId: Telegram user ID (required)
 * 
 * Returns:
 * - On success: { ok: true, html: string, debug: object }
 * - On error: { ok: false, error: string, debug: object }
 */
export async function POST(req: Request) {
  const debug: any = {
    timestamp: new Date().toISOString(),
    step: 'start',
  };

  try {
    console.log('[robokassa/create-trial] ========== CREATE TRIAL PAYMENT ==========');

    // Get telegramUserId from query string
    const url = new URL(req.url);
    const telegramUserIdParam = url.searchParams.get('telegramUserId');

    debug.step = 'validate_input';
    debug.telegramUserIdParam = telegramUserIdParam;

    if (!telegramUserIdParam) {
      console.error('[robokassa/create-trial] ❌ telegramUserId missing');
      return NextResponse.json({
        ok: false,
        error: 'telegramUserId is required in query string',
        debug: { ...debug, error: 'telegramUserId missing' },
      }, { status: 400 });
    }

    const telegramUserId = Number(telegramUserIdParam);
    if (!Number.isFinite(telegramUserId) || telegramUserId <= 0) {
      console.error('[robokassa/create-trial] ❌ Invalid telegramUserId:', telegramUserIdParam);
      return NextResponse.json({
        ok: false,
        error: 'telegramUserId must be a positive number',
        debug: { ...debug, error: 'Invalid telegramUserId', value: telegramUserIdParam },
      }, { status: 400 });
    }

    debug.telegramUserId = telegramUserId;
    console.log('[robokassa/create-trial] Telegram User ID:', telegramUserId);

    // Initialize Supabase
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    debug.step = 'check_user';

    // Check if user exists
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, telegram_id')
      .eq('telegram_id', telegramUserId)
      .maybeSingle();

    if (userError) {
      console.error('[robokassa/create-trial] ❌ Supabase error:', userError);
      debug.step = 'user_error';
      debug.userError = userError.message;
      return NextResponse.json({
        ok: false,
        error: 'Database error',
        debug,
      }, { status: 500 });
    }

    if (!user) {
      console.error('[robokassa/create-trial] ❌ User not found:', telegramUserId);
      debug.step = 'user_not_found';
      return NextResponse.json({
        ok: false,
        error: 'User not found. Please use /start in bot first.',
        debug,
      }, { status: 404 });
    }

    debug.userId = user.id;
    debug.step = 'get_config';
    console.log('[robokassa/create-trial] User found, id:', user.id);

    // Get Robokassa config
    let config;
    try {
      config = getRobokassaConfig();
      debug.configLoaded = true;
      debug.merchantLogin = config.merchantLogin;
      debug.isTest = config.isTest;
      console.log('[robokassa/create-trial] Robokassa config loaded, merchant:', config.merchantLogin);
    } catch (configError: any) {
      console.error('[robokassa/create-trial] ❌ Config error:', configError.message);
      debug.step = 'config_error';
      debug.configError = configError.message;
      return NextResponse.json({
        ok: false,
        error: 'Robokassa configuration error',
        debug,
      }, { status: 500 });
    }

    debug.step = 'generate_invoice';

    // Generate unique InvoiceID (integer, never reused)
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000000);
    const invoiceId = `${timestamp}${random}`;

    debug.invoiceId = invoiceId;
    debug.invoiceIdGenerated = true;
    console.log('[robokassa/create-trial] Generated InvoiceID:', invoiceId);

    // Payment amount: 1.000000 (exactly 6 decimals as string)
    const outSum = '1.000000';
    const description = 'Trial subscription (3 days)';

    debug.outSum = outSum;
    debug.description = description;

    // Generate Receipt for fiscalization
    const receipt = generateReceipt(1.0);
    debug.receipt = receipt;
    debug.receiptItemSum = receipt.items[0].sum;
    debug.receiptMatchesOutSum = receipt.items[0].sum === 1.0;

    debug.step = 'generate_form';

    // Generate payment form WITH Receipt
    const { html, debug: formDebug } = generatePaymentForm(
      config,
      outSum,
      invoiceId,
      description,
      receipt,
      telegramUserId
    );

    debug.formGeneration = formDebug;
    debug.step = 'success';

    console.log('[robokassa/create-trial] ========== SUCCESS ==========');
    console.log('[robokassa/create-trial] InvoiceID:', invoiceId);
    console.log('[robokassa/create-trial] OutSum:', outSum);
    console.log('[robokassa/create-trial] Receipt encoded length:', formDebug.encodedReceiptLength);

    return NextResponse.json({
      ok: true,
      html,
      debug,
    });
  } catch (error: any) {
    console.error('[robokassa/create-trial] ❌ CRITICAL ERROR:', error);
    console.error('[robokassa/create-trial] Error stack:', error.stack);

    debug.step = 'critical_error';
    debug.error = error.message;
    debug.errorStack = error.stack;

    return NextResponse.json({
      ok: false,
      error: error.message || 'Internal server error',
      debug,
    }, { status: 500 });
  }
}

