/**
 * Payment Start Endpoint
 * POST /api/payments/start
 * 
 * Creates a payment record and returns payment URL
 */

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabaseAdmin";
import {
  generatePaymentUrl,
  generateInvoiceId,
  getProviderConfig,
  PaymentRequest,
  PaymentProvider,
} from "../../../../lib/paymentProviders";

export const dynamic = "force-dynamic";

interface StartPaymentRequest {
  userId: number;
  telegramUserId: string;
  method: "sbp" | "card";
  planCode: string;
  returnPath?: string;
}

/**
 * Get Telegram user ID from request
 */
function getTelegramUserId(req: Request, body: StartPaymentRequest): string {
  // Priority: 1) From request body, 2) From initData header, 3) Fallback
  if (body.telegramUserId) {
    return body.telegramUserId;
  }

  const initDataHeader = req.headers.get("x-telegram-init-data");
  if (initDataHeader) {
    try {
      const params = new URLSearchParams(initDataHeader);
      const userParam = params.get("user");
      if (userParam) {
        const user = JSON.parse(decodeURIComponent(userParam));
        return user.id?.toString() || `web:${body.userId}`;
      }
    } catch (e) {
      console.error("[payments/start] Failed to parse initData:", e);
    }
  }

  return `web:${body.userId}`;
}

/**
 * Determine payment amount based on plan code
 */
function getPaymentAmount(planCode: string, subscriptionExists: boolean): string {
  // Trial logic: first payment is 1 RUB for 3 days, then 199 RUB monthly
  if (planCode === "trial_3d_then_199") {
    return subscriptionExists ? "199.00" : "1.00";
  }
  return "199.00";
}

export async function POST(req: Request) {
  const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  console.log(`[payments/start:${requestId}] ========== PAYMENT START REQUEST ==========`);

  try {
    // Parse request body
    let body: StartPaymentRequest;
    try {
      body = await req.json();
    } catch (e) {
      console.error(`[payments/start:${requestId}] JSON parse error:`, e);
      return NextResponse.json(
        { ok: false, error: "Неверный формат запроса", requestId },
        { status: 400 }
      );
    }

    const { userId, method, planCode } = body;

    // Validate required fields
    if (!userId || typeof userId !== "number" || userId <= 0) {
      return NextResponse.json(
        { ok: false, error: "Не указан ID пользователя", requestId },
        { status: 400 }
      );
    }

    if (!method || (method !== "sbp" && method !== "card")) {
      return NextResponse.json(
        { ok: false, error: "Неверный способ оплаты", requestId },
        { status: 400 }
      );
    }

    if (!planCode || typeof planCode !== "string") {
      return NextResponse.json(
        { ok: false, error: "Не указан код тарифа", requestId },
        { status: 400 }
      );
    }

    // Get Telegram user ID
    const telegramUserId = getTelegramUserId(req, body);
    console.log(`[payments/start:${requestId}] userId: ${userId}, telegramUserId: ${telegramUserId}, method: ${method}`);

    // Initialize Supabase
    const supabase = createServerSupabaseClient();

    // Check if user has existing subscription (for trial logic)
    const { data: existingSubscription } = await supabase
      .from("subscriptions")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();

    // Determine payment amount
    const amount = getPaymentAmount(planCode, !!existingSubscription);
    console.log(`[payments/start:${requestId}] Payment amount: ${amount} RUB`);

    // Generate invoice ID
    const invId = generateInvoiceId();
    console.log(`[payments/start:${requestId}] Generated invId: ${invId}`);

    // Get provider config (try robokassa first, fallback to others)
    let provider: PaymentProvider = "robokassa";
    let config = getProviderConfig("robokassa");

    if (!config) {
      // Try other providers if robokassa not configured
      // For now, return error if no provider configured
      console.error(`[payments/start:${requestId}] No payment provider configured`);
      return NextResponse.json(
        { ok: false, error: "Платежный провайдер не настроен", requestId },
        { status: 500 }
      );
    }

    // Build return URL
    const baseUrl = config.baseUrl || process.env.APP_BASE_URL || "";
    const returnPath = body.returnPath || "/subscription";
    const returnUrl = `${baseUrl}${returnPath}?id=${userId}`;

    // Generate payment URL
    const paymentRequest: PaymentRequest = {
      amount,
      invId,
      description: `Подписка ${planCode}`,
      telegramUserId,
      method,
      planCode,
      returnUrl,
    };

    let paymentResponse;
    try {
      paymentResponse = generatePaymentUrl(config, paymentRequest);
    } catch (error: any) {
      console.error(`[payments/start:${requestId}] Failed to generate payment URL:`, error);
      return NextResponse.json(
        { ok: false, error: `Ошибка генерации ссылки на оплату: ${error.message}`, requestId },
        { status: 500 }
      );
    }

    console.log(`[payments/start:${requestId}] Generated payment URL: ${paymentResponse.paymentUrl.substring(0, 100)}...`);

    // Create payment record in database BEFORE returning URL
    const { data: paymentRecord, error: insertError } = await supabase
      .from("payments")
      .insert({
        user_id: userId,
        telegram_user_id: telegramUserId,
        plan_code: planCode,
        amount: amount,
        currency: "RUB",
        method: method,
        provider: provider,
        inv_id: invId,
        status: "created",
        payment_url: paymentResponse.paymentUrl,
      })
      .select()
      .single();

    if (insertError || !paymentRecord) {
      console.error(`[payments/start:${requestId}] Failed to create payment record:`, insertError);
      return NextResponse.json(
        {
          ok: false,
          error: "Не удалось создать запись о платеже",
          details: insertError?.message,
          requestId,
        },
        { status: 500 }
      );
    }

    console.log(`[payments/start:${requestId}] Payment record created: ${paymentRecord.id}`);

    // Return success response
    return NextResponse.json({
      ok: true,
      paymentUrl: paymentResponse.paymentUrl,
      provider: provider,
      invId,
      amount,
      currency: "RUB",
      requestId,
    });
  } catch (error: any) {
    console.error(`[payments/start:${requestId}] Unexpected error:`, error);
    return NextResponse.json(
      {
        ok: false,
        error: error.message || "Внутренняя ошибка сервера",
        requestId,
      },
      { status: 500 }
    );
  }
}
