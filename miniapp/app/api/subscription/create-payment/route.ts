/**
 * Create Payment Endpoint
 * POST /api/subscription/create-payment
 * 
 * Creates payment record and returns Robokassa payment URL
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabaseAdmin";
import { resolveUserIdFromRequest } from "@/lib/resolveUserIdFromRequest";
import { buildRobokassaPaymentUrl, getRobokassaConfig } from "@/lib/robokassa";

export const dynamic = "force-dynamic";

interface CreatePaymentRequest {
  method: "card" | "sbp";
  planCode: string;
  returnPath?: string;
  userId?: number;
  id?: number;
}

// Helper to check if debug should be included
function shouldIncludeDebug(): boolean {
  return (
    process.env.DEBUG_PAYMENTS === "true" ||
    process.env.NODE_ENV !== "production"
  );
}

export async function POST(req: NextRequest) {
  const requestId = `create-payment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    // Check Robokassa config
    const config = getRobokassaConfig();
    if (!config) {
      console.error(`[subscription/create-payment:${requestId}] Robokassa not configured`);
      return NextResponse.json(
        { 
          ok: false, 
          error: "Платежный провайдер не настроен",
          requestId,
          ...(shouldIncludeDebug() && {
            debug: {
              hasRobokassaMerchantLogin: !!process.env.ROBOKASSA_MERCHANT_LOGIN,
              hasRobokassaPassword1: !!process.env.ROBOKASSA_PASSWORD1,
              hasRobokassaPassword2: !!process.env.ROBOKASSA_PASSWORD2,
            }
          })
        },
        { status: 500 }
      );
    }

    // Parse request body first (can only be read once)
    let body: CreatePaymentRequest = {} as CreatePaymentRequest;
    try {
      body = await req.json();
    } catch (e) {
      // Body might be empty or not JSON - that's ok, continue without body
    }

    // Resolve userId with full diagnostics (pass parsed body to avoid double reading)
    const userIdResolution = await resolveUserIdFromRequest(req, body);
    const userId = userIdResolution.userId;

    if (!userId) {
      const response: any = {
        ok: false,
        error: "userId is required",
        code: "USER_ID_MISSING",
        requestId,
      };

      // Include debug info only when DEBUG_PAYMENTS=true or not production
      if (shouldIncludeDebug()) {
        response.debug = {
          userIdResolution,
        };
      }

      return NextResponse.json(response, { status: 400 });
    }

    const { method, planCode, returnPath = "/subscription" } = body;

    // Validate method
    if (method !== "card" && method !== "sbp") {
      return NextResponse.json(
        { 
          ok: false, 
          error: "method must be 'card' or 'sbp'",
          requestId 
        },
        { status: 400 }
      );
    }

    // Validate planCode
    if (!planCode || planCode !== "trial_3d_then_199") {
      return NextResponse.json(
        { 
          ok: false, 
          error: "Invalid planCode. Only 'trial_3d_then_199' is supported",
          requestId 
        },
        { status: 400 }
      );
    }

    // Determine amount based on plan
    // First payment: 1 RUB for 3-day trial
    const amount = "1.00";
    const description = `Подписка: Первые 3 дня за 1 ₽, далее 199 ₽/мес`;

    // Generate unique invoice ID
    const invId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const supabase = createServerSupabaseClient();

    // Create payment record
    const paymentRecord = {
      user_id: userId,
      provider: "robokassa",
      inv_id: invId,
      method,
      plan_code: planCode,
      amount: Number(amount),
      currency: "RUB",
      status: "created",
      out_sum: Number(amount),  // Important: out_sum must match amount
      provider_payload: {
        returnPath,
        testMode: config.testMode,
      },
    };

    const { data: payment, error: insertError } = await supabase
      .from("payments")
      .insert(paymentRecord)
      .select("id, inv_id")
      .single();

    if (insertError) {
      console.error(`[subscription/create-payment:${requestId}] DB insert error:`, insertError);
      const response: any = {
        ok: false,
        error: "Ошибка создания платежа",
        code: "DATABASE_ERROR",
        requestId,
      };

      if (shouldIncludeDebug()) {
        response.debug = {
          databaseError: {
            message: insertError.message,
            code: insertError.code,
            hint: insertError.hint,
          },
        };
      }

      return NextResponse.json(response, { status: 500 });
    }

    // Build Robokassa payment URL
    const paymentUrlResult = buildRobokassaPaymentUrl({
      invId,
      outSum: amount,
      description,
      userId,
      planCode,
      method,
      returnPath,
    });

    if (!paymentUrlResult) {
      console.error(`[subscription/create-payment:${requestId}] Failed to build payment URL`);
      const response: any = {
        ok: false,
        error: "Ошибка создания платежной ссылки",
        code: "PAYMENT_URL_BUILD_ERROR",
        requestId,
      };

      if (shouldIncludeDebug()) {
        response.debug = {
          message: "Failed to build payment URL",
        };
      }

      return NextResponse.json(response, { status: 500 });
    }

    // Update payment record with payment_url
    await supabase
      .from("payments")
      .update({ payment_url: paymentUrlResult.url })
      .eq("id", payment.id);

    console.log(`[subscription/create-payment:${requestId}] Payment created:`, {
      userId,
      invId,
      method,
      planCode,
      amount,
    });

    return NextResponse.json({
      ok: true,
      invId,
      paymentUrl: paymentUrlResult.url,
      requestId,
    });
  } catch (error: any) {
    console.error(`[subscription/create-payment:${requestId}] Unexpected error:`, error);
    const response: any = {
      ok: false,
      error: error?.message || "Internal server error",
      code: "INTERNAL_ERROR",
      requestId,
    };

    if (shouldIncludeDebug()) {
      response.debug = {
        message: error?.message || "Internal server error",
        stack: error?.stack ? error.stack.substring(0, 500) : undefined,
      };
    }

    return NextResponse.json(response, { status: 500 });
  }
}
