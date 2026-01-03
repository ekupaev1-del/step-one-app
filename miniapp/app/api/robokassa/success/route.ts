import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/robokassa/success
 * 
 * Редирект пользователя после успешной оплаты
 * Robokassa перенаправляет пользователя на этот URL после успешной оплаты
 * 
 * Query params:
 * - InvId: номер счета
 * - OutSum: сумма оплаты
 * - SignatureValue: подпись для проверки
 * - Shp_*: пользовательские параметры
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const invId = url.searchParams.get('InvId');
    const outSum = url.searchParams.get('OutSum');
    const signatureValue = url.searchParams.get('SignatureValue');
    const shpUserId = url.searchParams.get('Shp_userId');

    console.log('[robokassa/success] ========== SUCCESS REDIRECT ==========');
    console.log('[robokassa/success] InvId:', invId);
    console.log('[robokassa/success] OutSum:', outSum);
    console.log('[robokassa/success] Shp_userId:', shpUserId);

    // Проверяем подпись (опционально, т.к. result уже проверил)
    // Но для безопасности лучше проверить и здесь
    const password1 = process.env.ROBOKASSA_PASSWORD1;
    if (password1 && invId && outSum && signatureValue) {
      const { createHash } = await import('crypto');
      const signatureString = `${outSum}:${invId}:${password1}`;
      const calculatedSignature = createHash('md5')
        .update(signatureString)
        .digest('hex')
        .toLowerCase();

      if (calculatedSignature !== signatureValue.toLowerCase()) {
        console.error('[robokassa/success] ❌ Invalid signature');
        // Все равно редиректим, но логируем ошибку
      }
    }

    // Редиректим пользователя на страницу подписки или профиля
    // Если есть Shp_userId, используем его для редиректа
    if (shpUserId) {
      const redirectUrl = `/subscription?id=${shpUserId}&success=true&invId=${invId}`;
      console.log('[robokassa/success] Redirecting to:', redirectUrl);
      return NextResponse.redirect(new URL(redirectUrl, req.url));
    } else {
      // Если нет userId, редиректим на главную
      console.log('[robokassa/success] No userId, redirecting to home');
      return NextResponse.redirect(new URL('/?payment=success', req.url));
    }
  } catch (error: any) {
    console.error('[robokassa/success] ❌ ERROR:', error);
    // В случае ошибки редиректим на главную
    return NextResponse.redirect(new URL('/?payment=error', req.url));
  }
}

