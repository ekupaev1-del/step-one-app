import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * POST /api/subscription/trigger-monthly?telegramUserId=...
 * 
 * Manually trigger monthly recurring payment for a user
 * This should be called after trial expires (via cron or manual trigger)
 * 
 * Returns the HTML form for Recurring endpoint
 */
export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const telegramUserIdParam = url.searchParams.get('telegramUserId');

    if (!telegramUserIdParam) {
      return NextResponse.json({
        ok: false,
        message: 'telegramUserId is required in query string',
      }, { status: 400 });
    }

    const telegramUserId = Number(telegramUserIdParam);
    if (!Number.isFinite(telegramUserId) || telegramUserId <= 0) {
      return NextResponse.json({
        ok: false,
        message: 'telegramUserId must be a positive number',
      }, { status: 400 });
    }

    // Initialize Supabase
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Find user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, telegram_id')
      .eq('telegram_id', telegramUserId)
      .maybeSingle();

    if (userError || !user) {
      return NextResponse.json({
        ok: false,
        message: 'User not found',
      }, { status: 404 });
    }

    // Find parent payment (trial payment with Recurring=true, status='paid')
    const { data: parentPayment, error: parentError } = await supabase
      .from('payments')
      .select('inv_id, amount, status')
      .eq('telegram_user_id', telegramUserId)
      .eq('status', 'paid')
      .is('parent_invoice_id', null)
      .eq('amount', 1.00)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (parentError || !parentPayment) {
      return NextResponse.json({
        ok: false,
        message: 'Parent payment not found. Please complete trial payment first.',
      }, { status: 404 });
    }

    // Check if subscription is active and trial has ended
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (!subscription) {
      return NextResponse.json({
        ok: false,
        message: 'No active subscription found',
      }, { status: 404 });
    }

    // Check if trial has ended
    const now = new Date();
    const trialEndsAt = subscription.trial_ends_at ? new Date(subscription.trial_ends_at) : null;
    
    if (trialEndsAt && trialEndsAt > now) {
      return NextResponse.json({
        ok: false,
        message: `Trial has not ended yet. Trial ends at: ${trialEndsAt.toISOString()}`,
      }, { status: 400 });
    }

    // Call create-monthly endpoint internally
    const createMonthlyUrl = new URL('/api/robokassa/create-monthly', req.url);
    createMonthlyUrl.searchParams.set('telegramUserId', String(telegramUserId));
    
    const monthlyResponse = await fetch(createMonthlyUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!monthlyResponse.ok) {
      const errorData = await monthlyResponse.json();
      return NextResponse.json({
        ok: false,
        message: errorData.message || 'Failed to create monthly payment',
      }, { status: monthlyResponse.status });
    }

    const monthlyData = await monthlyResponse.json();

    return NextResponse.json({
      ok: true,
      html: monthlyData.html,
      invoiceId: monthlyData.invoiceId,
      previousInvoiceId: monthlyData.previousInvoiceId,
    });

  } catch (error: any) {
    console.error('[subscription/trigger-monthly] Error:', error);
    return NextResponse.json({
      ok: false,
      message: error.message || 'Internal server error',
    }, { status: 500 });
  }
}

