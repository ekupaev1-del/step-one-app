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
import { getRobokassaConfig } from "../../../../lib/payments/robokassaConfig";

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
 * Priority: 1) From request body, 2) From initData header, 3) Safe fallback
 * Never returns NULL - always generates a deterministic value
 */
function getTelegramUserId(req: Request, body: StartPaymentRequest, userId: number): string {
  // Priority 1: From request body
  if (body.telegramUserId && body.telegramUserId.trim()) {
    return body.telegramUserId.trim();
  }

  // Priority 2: From initData header
  const initDataHeader = req.headers.get("x-telegram-init-data");
  if (initDataHeader) {
    try {
      const params = new URLSearchParams(initDataHeader);
      const userParam = params.get("user");
      if (userParam) {
        const user = JSON.parse(decodeURIComponent(userParam));
        if (user.id) {
          return user.id.toString();
        }
      }
    } catch (e) {
      console.error(`[payments/start] Failed to parse initData:`, e);
    }
  }

  // Priority 3: Safe fallback
  // In production, this should not happen, but we need a deterministic value
  const isProduction = process.env.NODE_ENV === "production";
  if (isProduction) {
    // In production, log error but still generate a value
    console.error(`[payments/start] WARNING: No telegram_user_id found in production for userId=${userId}`);
    return `prod:${userId}`;
  } else {
    // In dev, allow this
    return `dev:${userId}`;
  }
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

    // Get Telegram user ID (never null)
    const telegramUserId = getTelegramUserId(req, body, userId);
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

    // Generate invoice ID BEFORE inserting payment record
    // This ensures inv_id is never null
    const invId = generateInvoiceId();
    console.log(`[payments/start:${requestId}] Generated invId: ${invId}`);
    
    // Validate invId is not empty
    if (!invId || invId.trim() === "") {
      console.error(`[payments/start:${requestId}] Generated empty invId`);
      return NextResponse.json(
        { ok: false, error: "Ошибка генерации ID платежа", requestId },
        { status: 500 }
      );
    }

    // Get provider config (try robokassa first, fallback to others)
    let provider: PaymentProvider = "robokassa";
    let config = getProviderConfig("robokassa");

    if (!config) {
      // Get detailed config status for logging
      const configStatus = getRobokassaConfig();
      console.error(
        `[payments/start:${requestId}] Robokassa provider not configured. ` +
        `Source: ${configStatus.source}, ` +
        `Missing: ${configStatus.missingEnvVars.join(", ")}`
      );
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

    // Get config status for debug info (without secrets)
    const configStatus = getRobokassaConfig();

    // Return success response
    return NextResponse.json({
      ok: true,
      paymentUrl: paymentResponse.paymentUrl,
      provider: provider,
      invId,
      amount,
      currency: "RUB",
      requestId,
      debug: {
        configSource: configStatus.source,
        configConfigured: configStatus.configured,
        envVarStatus: configStatus.envVarStatus,
        // Never include secrets
      },
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
