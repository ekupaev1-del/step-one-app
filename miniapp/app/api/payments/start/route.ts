/**
 * Payment Start Endpoint
 * POST /api/payments/start
 * 
 * Creates a payment record and returns payment URL for redirect
 */

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabaseAdmin";
import {
  generatePaymentUrl,
  generateInvoiceId,
  PaymentRequest,
} from "../../../../lib/paymentProvider";

export const dynamic = "force-dynamic";

interface StartPaymentRequest {
  method: "sbp" | "card";
  planCode: string;
  amount: number;
  currency: string;
  userId?: number;
  telegramUserId?: string; // Optional: can be sent from client
}

/**
 * Extract Telegram user ID from initData or request
 */
function getTelegramUserId(req: Request): string | null {
  // Try to get from Telegram WebApp initData
  const initDataHeader = req.headers.get("x-telegram-init-data");
  if (initDataHeader) {
    try {
      const params = new URLSearchParams(initDataHeader);
      const userParam = params.get("user");
      if (userParam) {
        const user = JSON.parse(decodeURIComponent(userParam));
        return user.id?.toString() || null;
      }
    } catch (e) {
      console.error("[payments/start] Failed to parse initData:", e);
    }
  }

  // Try to get from client-side (if available in request body)
  // This will be handled by reading the request body
  return null;
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
        { ok: false, error: "Invalid JSON in request body" },
        { status: 400 }
      );
    }

    const { method, planCode, amount, currency, userId, telegramUserId: clientTelegramUserId } = body;

    // Validate required fields
    if (!method || (method !== "sbp" && method !== "card")) {
      return NextResponse.json(
        { ok: false, error: "method must be 'sbp' or 'card'" },
        { status: 400 }
      );
    }

    if (!planCode || typeof planCode !== "string") {
      return NextResponse.json(
        { ok: false, error: "planCode is required" },
        { status: 400 }
      );
    }

    if (!amount || typeof amount !== "number" || amount <= 0) {
      return NextResponse.json(
        { ok: false, error: "amount must be a positive number" },
        { status: 400 }
      );
    }

    if (!currency || currency !== "RUB") {
      return NextResponse.json(
        { ok: false, error: "currency must be 'RUB'" },
        { status: 400 }
      );
    }

    // Get user ID from request or query params
    let finalUserId: number | null = userId || null;
    if (!finalUserId) {
      const url = new URL(req.url);
      const userIdParam = url.searchParams.get("userId") || url.searchParams.get("id");
      if (userIdParam) {
        finalUserId = Number(userIdParam);
        if (!Number.isFinite(finalUserId) || finalUserId <= 0) {
          finalUserId = null;
        }
      }
    }

    if (!finalUserId) {
      return NextResponse.json(
        { ok: false, error: "userId is required" },
        { status: 400 }
      );
    }

    // Get Telegram user ID
    // Priority: 1) From request body, 2) From initData header, 3) Fallback
    let telegramUserId = clientTelegramUserId || getTelegramUserId(req);
    if (!telegramUserId) {
      // Fallback: use web:<userId> format for browser access
      telegramUserId = `web:${finalUserId}`;
      console.log(`[payments/start:${requestId}] Using fallback telegramUserId: ${telegramUserId}`);
    }

    console.log(`[payments/start:${requestId}] userId: ${finalUserId}, telegramUserId: ${telegramUserId}, method: ${method}`);

    // Initialize Supabase
    const supabase = createServerSupabaseClient();

    // Generate invoice ID
    const invId = generateInvoiceId();
    const invIdNumeric = BigInt(invId);

    console.log(`[payments/start:${requestId}] Generated invId: ${invId}`);

    // Get payment provider config from env
    const merchantLogin = process.env.ROBO_MERCHANT_LOGIN;
    const password1 = process.env.ROBO_PASSWORD1;
    const password2 = process.env.ROBO_PASSWORD2;
    const baseUrl = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_VERCEL_URL || "";
    const isTest = process.env.ROBO_IS_TEST === "true";

    if (!merchantLogin || !password1 || !password2) {
      console.error(`[payments/start:${requestId}] Missing payment provider credentials`);
      return NextResponse.json(
        { ok: false, error: "Payment provider not configured" },
        { status: 500 }
      );
    }

    // Generate payment URL
    const paymentRequest: PaymentRequest = {
      amount: amount.toFixed(2),
      invId,
      description: `Подписка ${planCode}`,
      telegramUserId,
      method,
      planCode,
    };

    const { paymentUrl } = generatePaymentUrl(
      {
        merchantLogin,
        password1,
        password2,
        baseUrl,
        isTest,
      },
      paymentRequest
    );

    console.log(`[payments/start:${requestId}] Generated payment URL: ${paymentUrl.substring(0, 100)}...`);

    // Create payment record in database BEFORE returning URL
    const { data: paymentRecord, error: insertError } = await supabase
      .from("payments")
      .insert({
        user_id: finalUserId,
        telegram_user_id: telegramUserId,
        plan_code: planCode,
        amount: amount.toFixed(2),
        currency: "RUB",
        inv_id: invId,
        provider: "robokassa",
        status: "created",
        payment_url: paymentUrl,
      })
      .select()
      .single();

    if (insertError || !paymentRecord) {
      console.error(`[payments/start:${requestId}] Failed to create payment record:`, insertError);
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to create payment record",
          details: insertError?.message,
        },
        { status: 500 }
      );
    }

    console.log(`[payments/start:${requestId}] Payment record created: ${paymentRecord.id}`);

    // Return success response
    return NextResponse.json({
      ok: true,
      invId,
      paymentUrl,
      paymentId: paymentRecord.id,
      debug: {
        requestId,
        userId: finalUserId,
        telegramUserId,
        method,
        planCode,
        amount,
        currency,
      },
    });
  } catch (error: any) {
    console.error(`[payments/start:${requestId}] Unexpected error:`, error);
    return NextResponse.json(
      {
        ok: false,
        error: error.message || "Internal server error",
        requestId,
      },
      { status: 500 }
    );
  }
}
