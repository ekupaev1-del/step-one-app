import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generatePaymentUrl, getRobokassaConfig } from '../../../../lib/robokassa';

export const dynamic = 'force-dynamic';

/**
 * POST /api/robokassa/create
 * 
 * Phase 1: Creates initial payment (1 RUB) with Recurring=true
 * WITHOUT Receipt to avoid 500 errors
 * 
 * Query params:
 * - userId: User ID (required)
 * 
 * Returns:
 * - paymentUrl: URL to redirect user to Robokassa
 * - invoiceId: Generated invoice ID
 */
export async function POST(req: Request) {
  try {
    console.log('[robokassa/create] ========== CREATE PAYMENT REQUEST ==========');

    // Get userId from query string
    const url = new URL(req.url);
    const userIdParam = url.searchParams.get('userId');

    if (!userIdParam) {
      console.error('[robokassa/create] ❌ userId missing in query');
      return NextResponse.json(
        { ok: false, error: 'userId is required in query string' },
        { status: 400 }
      );
    }

    const userId = Number(userIdParam);
    if (!Number.isFinite(userId) || userId <= 0) {
      console.error('[robokassa/create] ❌ Invalid userId:', userIdParam);
      return NextResponse.json(
        { ok: false, error: 'userId must be a positive number' },
        { status: 400 }
      );
    }

    console.log('[robokassa/create] User ID:', userId);

    // Initialize Supabase
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Check if user exists
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, subscription_status')
      .eq('id', userId)
      .maybeSingle();

    if (userError) {
      console.error('[robokassa/create] ❌ Supabase error:', userError);
      return NextResponse.json(
        { ok: false, error: 'Database error' },
        { status: 500 }
      );
    }

    if (!user) {
      console.error('[robokassa/create] ❌ User not found:', userId);
      return NextResponse.json(
        { ok: false, error: 'User not found' },
        { status: 404 }
      );
    }

    console.log('[robokassa/create] User found, status:', user.subscription_status);

    // Get Robokassa config
    let config;
    try {
      config = getRobokassaConfig();
      console.log('[robokassa/create] Robokassa config loaded, merchant:', config.merchantLogin);
    } catch (configError: any) {
      console.error('[robokassa/create] ❌ Config error:', configError.message);
      return NextResponse.json(
        { ok: false, error: 'Robokassa configuration error' },
        { status: 500 }
      );
    }

    // Generate unique InvoiceID
    // Format: timestamp_userId_random
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000);
    const invoiceId = `${timestamp}_${userId}_${random}`;

    console.log('[robokassa/create] Generated InvoiceID:', invoiceId);

    // Payment amount: 1 RUB for trial
    const amount = 1.0;
    const description = 'Step One subscription - Trial activation (1 RUB)';

    // Generate payment URL
    // Phase 1: WITHOUT Receipt to avoid 500 errors
    // Recurring=true is required for recurring payments
    const { url: paymentUrl, signature } = generatePaymentUrl(
      config,
      amount,
      invoiceId,
      description,
      true, // recurring = true
      userId // Shp_userId parameter
    );

    console.log('[robokassa/create] Payment URL generated');
    console.log('[robokassa/create] Signature:', signature);
    console.log('[robokassa/create] URL length:', paymentUrl.length);

    // Save payment record to database
    const { error: paymentError } = await supabase.from('payments').insert({
      user_id: userId,
      invoice_id: invoiceId,
      amount: amount,
      status: 'pending',
      is_recurring: true,
    });

    if (paymentError) {
      console.error('[robokassa/create] ❌ Error saving payment:', paymentError);
      // Continue anyway - payment URL is generated
    } else {
      console.log('[robokassa/create] ✅ Payment record saved');
    }

    // Log final URL (first 200 chars for security)
    console.log('[robokassa/create] Payment URL (first 200 chars):', paymentUrl.substring(0, 200));

    console.log('[robokassa/create] ========== SUCCESS ==========');

    return NextResponse.json({
      ok: true,
      paymentUrl,
      invoiceId,
    });
  } catch (error: any) {
    console.error('[robokassa/create] ❌ CRITICAL ERROR:', error);
    console.error('[robokassa/create] Error stack:', error.stack);

    return NextResponse.json(
      {
        ok: false,
        error: error.message || 'Internal server error',
      },
      { status: 500 }
    );
  }
}

