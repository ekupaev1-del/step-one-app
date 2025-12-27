import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * GET /api/subscription/status
 * 
 * STEP 8: Subscription status API
 * 
 * Query params:
 * - telegramUserId: Telegram user ID (required)
 * 
 * Returns:
 * - status: 'trial' | 'active' | 'expired' | null
 * - trial_end_at: Date when trial ends (if status = 'trial')
 * - next_charge_at: Date of next charge (if status = 'active')
 * - price: 199 (monthly price in RUB)
 * - is_active: boolean (true if user has access)
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const telegramUserIdParam = url.searchParams.get('telegramUserId');

    if (!telegramUserIdParam) {
      return NextResponse.json(
        { ok: false, error: 'telegramUserId is required' },
        { status: 400 }
      );
    }

    const telegramUserId = Number(telegramUserIdParam);
    if (!Number.isFinite(telegramUserId) || telegramUserId <= 0) {
      return NextResponse.json(
        { ok: false, error: 'Invalid telegramUserId' },
        { status: 400 }
      );
    }

    // Initialize Supabase
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get subscription
    const { data: subscription, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('telegram_user_id', telegramUserId)
      .maybeSingle();

    if (error) {
      console.error('[subscription/status] ❌ Supabase error:', error);
      return NextResponse.json(
        { ok: false, error: 'Database error' },
        { status: 500 }
      );
    }

    // If no subscription, user has no active subscription
    if (!subscription) {
      return NextResponse.json({
        ok: true,
        status: null,
        trial_end_at: null,
        next_charge_at: null,
        price: 199,
        is_active: false,
      });
    }

    // Check if subscription is active
    const now = new Date();
    let isActive = false;

    if (subscription.status === 'trial') {
      const trialEnd = new Date(subscription.trial_end_at);
      isActive = now < trialEnd;
    } else if (subscription.status === 'active') {
      const nextCharge = subscription.next_charge_at
        ? new Date(subscription.next_charge_at)
        : null;
      // Active if next_charge_at is in the future or null
      isActive = !nextCharge || now < nextCharge;
    }

    return NextResponse.json({
      ok: true,
      status: subscription.status,
      trial_end_at: subscription.trial_end_at,
      next_charge_at: subscription.next_charge_at,
      price: 199,
      is_active: isActive,
    });
  } catch (error: any) {
    console.error('[subscription/status] ❌ CRITICAL ERROR:', error);
    return NextResponse.json(
      {
        ok: false,
        error: error.message || 'Internal server error',
      },
      { status: 500 }
    );
  }
}

