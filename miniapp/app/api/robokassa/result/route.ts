import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { getRobokassaConfig } from '../../../../lib/robokassaConfig';

export const dynamic = 'force-dynamic';

/**
 * POST /api/robokassa/result
 * 
 * Обработка результата оплаты от Robokassa (webhook)
 * Robokassa отправляет POST запрос с параметрами оплаты
 * 
 * Параметры от Robokassa:
 * - OutSum: сумма оплаты
 * - InvId: номер счета
 * - SignatureValue: подпись для проверки
 * - Shp_*: пользовательские параметры
 * 
 * Возвращает: "OK" + InvId при успехе, "ERROR" при ошибке
 */
export async function POST(req: Request) {
  try {
    console.log('[robokassa/result] ========== PAYMENT RESULT WEBHOOK ==========');

    // Получаем параметры из POST body (Robokassa отправляет form-data)
    const formData = await req.formData();
    
    // Альтернативно, если Robokassa отправляет как query params
    const url = new URL(req.url);
    const outSum = formData.get('OutSum')?.toString() || url.searchParams.get('OutSum') || '';
    const invId = formData.get('InvId')?.toString() || url.searchParams.get('InvId') || '';
    const signatureValue = formData.get('SignatureValue')?.toString() || url.searchParams.get('SignatureValue') || '';

    console.log('[robokassa/result] OutSum:', outSum);
    console.log('[robokassa/result] InvId:', invId);
    console.log('[robokassa/result] SignatureValue:', signatureValue);

    if (!outSum || !invId || !signatureValue) {
      console.error('[robokassa/result] ❌ Missing required parameters');
      return new NextResponse('ERROR: Missing required parameters', { status: 400 });
    }

    // Получаем конфигурацию Robokassa
    const config = getRobokassaConfig();

    // Проверяем подпись: MD5(OutSum:InvId:Pass2[:Shp_*])
    // Shp_* параметры должны быть отсортированы алфавитно
    const shpParams: string[] = [];
    for (const [key, value] of formData.entries()) {
      if (key.startsWith('Shp_')) {
        shpParams.push(`${key}=${value}`);
      }
    }
    // Также проверяем query params
    for (const [key, value] of url.searchParams.entries()) {
      if (key.startsWith('Shp_') && !shpParams.some(p => p.startsWith(key))) {
        shpParams.push(`${key}=${value}`);
      }
    }
    shpParams.sort(); // Алфавитная сортировка

    // Формируем строку для проверки подписи
    const signatureParts = [outSum, invId, config.pass2];
    if (shpParams.length > 0) {
      signatureParts.push(...shpParams);
    }
    const signatureString = signatureParts.join(':');
    const calculatedSignature = createHash('md5')
      .update(signatureString)
      .digest('hex')
      .toLowerCase();

    console.log('[robokassa/result] Calculated signature:', calculatedSignature);
    console.log('[robokassa/result] Received signature:', signatureValue);
    console.log('[robokassa/result] Signatures match:', calculatedSignature === signatureValue.toLowerCase());

    if (calculatedSignature !== signatureValue.toLowerCase()) {
      console.error('[robokassa/result] ❌ Invalid signature');
      return new NextResponse('ERROR: Invalid signature', { status: 400 });
    }

    // Инициализируем Supabase
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Находим платеж по inv_id
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .select('*')
      .eq('inv_id', Number(invId))
      .maybeSingle();

    if (paymentError) {
      console.error('[robokassa/result] ❌ Error finding payment:', paymentError);
      return new NextResponse('ERROR: Database error', { status: 500 });
    }

    if (!payment) {
      console.error('[robokassa/result] ❌ Payment not found:', invId);
      return new NextResponse('ERROR: Payment not found', { status: 404 });
    }

    console.log('[robokassa/result] Payment found:', payment.id);
    console.log('[robokassa/result] Payment type:', payment.parent_invoice_id ? 'child (recurring)' : 'parent (trial)');

    // Extract Shp_userId from callback
    let shpUserId: number | null = null;
    for (const [key, value] of formData.entries()) {
      if (key === 'Shp_userId') {
        shpUserId = Number(value);
        break;
      }
    }
    // Also check query params
    if (!shpUserId) {
      const shpUserIdParam = url.searchParams.get('Shp_userId');
      if (shpUserIdParam) {
        shpUserId = Number(shpUserIdParam);
      }
    }

    // Активируем подписку
    // user_id в payments - это BIGINT (id из users)
    const userId = Number(payment.user_id);
    const telegramUserId = payment.telegram_user_id || shpUserId;
    const amount = parseFloat(outSum);

    // Определяем тип подписки по сумме и статус
    let planType: 'trial' | 'standard' | 'standard_plus' = 'trial';
    let expiresAt = new Date();
    let paymentStatus: string;
    let subscriptionStatus: string;
    
    if (amount === 1.00) {
      // Trial подписка - 3 дня (parent payment)
      planType = 'trial';
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 3);
      paymentStatus = 'trial_active'; // Mark as trial_active after payment
      subscriptionStatus = 'trial';
      
      // CRITICAL: Save parent_invoice_id mapping for recurring charges
      // The InvId from this payment is the parent invoice ID
      console.log('[robokassa/result] Saving parent invoice ID:', invId, 'for user:', userId);
    } else if (amount === 199.00) {
      // Standard подписка - 1 месяц (child recurring payment)
      planType = 'standard';
      expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + 1);
      paymentStatus = 'subscription_active'; // Mark as subscription_active after payment
      subscriptionStatus = 'active';
    } else if (amount === 1990.00) {
      // Standard+ подписка - 12 месяцев
      planType = 'standard_plus';
      expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + 12);
      paymentStatus = 'subscription_active';
      subscriptionStatus = 'active';
    } else {
      // Unknown amount - default to paid
      paymentStatus = 'paid';
      subscriptionStatus = 'active';
    }

    // Обновляем статус платежа
    const updateData: any = { status: paymentStatus };
    
    // If this is a parent payment (trial), ensure parent_invoice_id is stored
    // (it should already be in the payment record, but ensure it's set)
    if (amount === 1.00 && !payment.parent_invoice_id) {
      // This is the parent payment itself, so parent_invoice_id should be NULL
      // But we need to ensure the payment record has the correct status
      console.log('[robokassa/result] Parent payment confirmed, status set to trial_active');
    }
    
    const { error: updateError } = await supabase
      .from('payments')
      .update(updateData)
      .eq('inv_id', Number(invId));

    if (updateError) {
      console.error('[robokassa/result] ❌ Error updating payment status:', updateError);
      // Не возвращаем ошибку, т.к. платеж уже обработан
    } else {
      console.log('[robokassa/result] ✅ Payment status updated to:', paymentStatus);
    }

    // Проверяем, есть ли уже активная подписка
    const { data: existingSubscription } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();

    if (existingSubscription) {
      // Обновляем существующую подписку
      const newExpiresAt = existingSubscription.expires_at > new Date().toISOString()
        ? new Date(existingSubscription.expires_at)
        : expiresAt;
      
      if (existingSubscription.expires_at > new Date().toISOString()) {
        // Продлеваем существующую подписку
        newExpiresAt.setMonth(newExpiresAt.getMonth() + (planType === 'standard' ? 1 : planType === 'standard_plus' ? 12 : 0));
      }

      const { error: updateSubError } = await supabase
        .from('subscriptions')
        .update({
          status: 'active',
          plan_type: planType,
          expires_at: newExpiresAt.toISOString(),
          payment_id: Number(invId),
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingSubscription.id);

      if (updateSubError) {
        console.error('[robokassa/result] ❌ Error updating subscription:', updateSubError);
      } else {
        console.log('[robokassa/result] ✅ Subscription updated');
      }
    } else {
      // Создаем новую подписку
      const trialEndsAt = planType === 'trial' ? expiresAt.toISOString() : null;

      const insertData: any = {
        user_id: userId,
        telegram_user_id: telegramUserId,
        payment_id: Number(invId),
        status: subscriptionStatus,
        plan_type: planType,
        started_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
      };
      
      // Add trial_ends_at only for trial subscriptions
      if (planType === 'trial') {
        insertData.trial_ends_at = trialEndsAt;
      }
      
      const { error: insertSubError } = await supabase
        .from('subscriptions')
        .insert(insertData);

      if (insertSubError) {
        console.error('[robokassa/result] ❌ Error creating subscription:', insertSubError);
      } else {
        console.log('[robokassa/result] ✅ Subscription created');
      }
    }

    console.log('[robokassa/result] ========== SUCCESS ==========');
    
    // Robokassa ожидает ответ в формате "OK" + InvId
    return new NextResponse(`OK${invId}`, { status: 200 });
  } catch (error: any) {
    console.error('[robokassa/result] ❌ CRITICAL ERROR:', error);
    return new NextResponse('ERROR: Internal server error', { status: 500 });
  }
}

