import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * GET /api/subscription/status
 * 
 * Проверка статуса подписки пользователя
 * 
 * Query params:
 * - userId: ID пользователя (UUID или number)
 * - telegramUserId: Telegram user ID (опционально)
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const userIdParam = url.searchParams.get('userId');
    const telegramUserIdParam = url.searchParams.get('telegramUserId');

    if (!userIdParam && !telegramUserIdParam) {
      return NextResponse.json({
        ok: false,
        error: 'userId or telegramUserId is required',
      }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Если передан telegramUserId, находим user_id
    let userId: string | null = null;
    if (telegramUserIdParam) {
      const { data: user } = await supabase
        .from('users')
        .select('id')
        .eq('telegram_id', Number(telegramUserIdParam))
        .maybeSingle();

      if (user) {
        userId = user.id;
      }
    } else {
      userId = userIdParam;
    }

    if (!userId) {
      return NextResponse.json({
        ok: false,
        error: 'User not found',
      }, { status: 404 });
    }

    // Получаем активную подписку
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();

    if (subError) {
      console.error('[subscription/status] Error:', subError);
      return NextResponse.json({
        ok: false,
        error: 'Database error',
      }, { status: 500 });
    }

    if (!subscription) {
      return NextResponse.json({
        ok: true,
        hasSubscription: false,
        subscription: null,
      });
    }

    // Проверяем, не истекла ли подписка
    const now = new Date();
    const expiresAt = new Date(subscription.expires_at);
    const isExpired = expiresAt < now;

    if (isExpired) {
      // Обновляем статус подписки
      await supabase
        .from('subscriptions')
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .eq('id', subscription.id);

      return NextResponse.json({
        ok: true,
        hasSubscription: false,
        subscription: null,
        expired: true,
      });
    }

    return NextResponse.json({
      ok: true,
      hasSubscription: true,
      subscription: {
        id: subscription.id,
        status: subscription.status,
        planType: subscription.plan_type,
        startedAt: subscription.started_at,
        expiresAt: subscription.expires_at,
        trialEndsAt: subscription.trial_ends_at,
        daysRemaining: Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
      },
    });
  } catch (error: any) {
    console.error('[subscription/status] ❌ ERROR:', error);
    return NextResponse.json({
      ok: false,
      error: error.message || 'Internal server error',
    }, { status: 500 });
  }
}

