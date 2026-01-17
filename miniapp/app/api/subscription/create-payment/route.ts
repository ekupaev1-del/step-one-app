/**
 * Create Payment Endpoint
 * POST /api/subscription/create-payment
 * 
 * Creates payment record and returns Robokassa payment URL
 */

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabaseAdmin";
import { getUserIdFromRequest } from "@/lib/getUserId";
import { buildRobokassaPaymentUrl, getRobokassaConfig } from "@/lib/robokassa";

export const dynamic = "force-dynamic";

interface CreatePaymentRequest {
  method: "card" | "sbp";
  planCode: string;
  returnPath?: string;
}

export async function POST(req: Request) {
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
          details: {
            hasRobokassaMerchantLogin: !!process.env.ROBOKASSA_MERCHANT_LOGIN,
            hasRobokassaPassword1: !!process.env.ROBOKASSA_PASSWORD1,
            hasRobokassaPassword2: !!process.env.ROBOKASSA_PASSWORD2,
          }
        },
        { status: 500 }
      );
    }

    // Get user ID
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json(
        { 
          ok: false, 
          error: "userId обязателен",
          requestId 
        },
        { status: 400 }
      );
    }

    // Parse request body
    let body: CreatePaymentRequest;
    try {
      body = await req.json();
    } catch (e) {
      return NextResponse.json(
        { 
          ok: false, 
          error: "Invalid JSON body",
          requestId 
        },
        { status: 400 }
      );
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
      return NextResponse.json(
        { 
          ok: false, 
          error: "Ошибка создания платежа",
          details: insertError.message,
          requestId 
        },
        { status: 500 }
      );
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
      return NextResponse.json(
        { 
          ok: false, 
          error: "Ошибка создания платежной ссылки",
          requestId 
        },
        { status: 500 }
      );
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
    return NextResponse.json(
      { 
        ok: false, 
        error: error?.message || "Internal server error",
        requestId 
      },
      { status: 500 }
    );
  }
}
