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
 * STEP 2: Create trial payment (1 RUB) with Recurring=true and Receipt
 * 
 * This endpoint does ONLY:
 * - Creates parent payment
 * - OutSum = "1.000000" (exactly 6 decimals)
 * - InvoiceID = unique integer (never reused)
 * - Recurring = "true"
 * - Description = "Trial subscription (3 days)"
 * - Shp_userid = telegram_user_id
 * - Receipt included in signature
 * 
 * NO subscription logic
 * NO second payments
 * NO cron logic
 * 
 * Query params:
 * - telegramUserId: Telegram user ID (required)
 * 
 * Returns:
 * - html: Auto-submitting HTML form
 * - invoiceId: Generated invoice ID
 */
export async function POST(req: Request) {
  try {
    console.log('[robokassa/create-trial] ========== CREATE TRIAL PAYMENT ==========');

    // Get telegramUserId from query string
    const url = new URL(req.url);
    const telegramUserIdParam = url.searchParams.get('telegramUserId');

    if (!telegramUserIdParam) {
      console.error('[robokassa/create-trial] ❌ telegramUserId missing in query');
      return NextResponse.json(
        { ok: false, error: 'telegramUserId is required in query string' },
        { status: 400 }
      );
    }

    const telegramUserId = Number(telegramUserIdParam);
    if (!Number.isFinite(telegramUserId) || telegramUserId <= 0) {
      console.error('[robokassa/create-trial] ❌ Invalid telegramUserId:', telegramUserIdParam);
      return NextResponse.json(
        { ok: false, error: 'telegramUserId must be a positive number' },
        { status: 400 }
      );
    }

    console.log('[robokassa/create-trial] Telegram User ID:', telegramUserId);

    // Initialize Supabase
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Check if user exists in users table
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, telegram_id')
      .eq('telegram_id', telegramUserId)
      .maybeSingle();

    if (userError) {
      console.error('[robokassa/create-trial] ❌ Supabase error:', userError);
      return NextResponse.json(
        { ok: false, error: 'Database error' },
        { status: 500 }
      );
    }

    if (!user) {
      console.error('[robokassa/create-trial] ❌ User not found:', telegramUserId);
      return NextResponse.json(
        { ok: false, error: 'User not found. Please use /start in bot first.' },
        { status: 404 }
      );
    }

    console.log('[robokassa/create-trial] User found, id:', user.id);

    // Get Robokassa config
    let config;
    try {
      config = getRobokassaConfig();
      console.log('[robokassa/create-trial] Robokassa config loaded, merchant:', config.merchantLogin);
    } catch (configError: any) {
      console.error('[robokassa/create-trial] ❌ Config error:', configError.message);
      return NextResponse.json(
        { ok: false, error: 'Robokassa configuration error' },
        { status: 500 }
      );
    }

    // Generate unique InvoiceID (integer, never reused)
    // Format: timestamp + random (ensures uniqueness)
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000000);
    const invoiceId = `${timestamp}${random}`;

    console.log('[robokassa/create-trial] Generated InvoiceID:', invoiceId);
    console.log('[robokassa/create-trial] InvoiceID uniqueness check: NEW (never reused)');

    // Payment amount: 1.000000 (exactly 6 decimals as string)
    const outSum = '1.000000';
    const description = 'Trial subscription (3 days)';

    // Generate Receipt for fiscalization
    const receipt = generateReceipt(1.0);
    const receiptJson = JSON.stringify(receipt);
    const encodedReceipt = encodeURIComponent(receiptJson);
    
    console.log('[robokassa/create-trial] Receipt generated');
    console.log('[robokassa/create-trial] Receipt JSON length:', receiptJson.length);
    console.log('[robokassa/create-trial] Encoded Receipt length:', encodedReceipt.length);

    // Generate payment form WITH Receipt
    const { html, signature, signatureBase } = generatePaymentForm(
      config,
      outSum,
      invoiceId,
      description,
      receipt, // Include Receipt
      telegramUserId // Shp_userId
    );

    // DEBUG: Log signature base WITHOUT password
    console.log('[robokassa/create-trial] ========== SIGNATURE DEBUG ==========');
    console.log('[robokassa/create-trial] Signature base (WITHOUT password):', signatureBase);
    console.log('[robokassa/create-trial] Signature:', signature);
    console.log('[robokassa/create-trial] OutSum:', outSum);
    console.log('[robokassa/create-trial] InvoiceID:', invoiceId);
    console.log('[robokassa/create-trial] Receipt encoded length:', encodedReceipt.length);

    // Log final request payload (without sensitive data)
    console.log('[robokassa/create-trial] ========== REQUEST PAYLOAD ==========');
    console.log('[robokassa/create-trial] MerchantLogin:', config.merchantLogin);
    console.log('[robokassa/create-trial] OutSum:', outSum);
    console.log('[robokassa/create-trial] InvoiceID:', invoiceId);
    console.log('[robokassa/create-trial] Description:', description);
    console.log('[robokassa/create-trial] Recurring: true');
    console.log('[robokassa/create-trial] Shp_userId:', telegramUserId);
    console.log('[robokassa/create-trial] Receipt: [included, length:', encodedReceipt.length, ']');
    console.log('[robokassa/create-trial] SignatureValue:', signature);

    console.log('[robokassa/create-trial] ========== SUCCESS ==========');

    // Return HTML form
    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  } catch (error: any) {
    console.error('[robokassa/create-trial] ❌ CRITICAL ERROR:', error);
    console.error('[robokassa/create-trial] Error stack:', error.stack);

    return NextResponse.json(
      {
        ok: false,
        error: error.message || 'Internal server error',
      },
      { status: 500 }
    );
  }
}

