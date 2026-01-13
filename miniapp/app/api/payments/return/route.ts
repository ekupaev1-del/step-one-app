/**
 * Payment Return Endpoint (User Redirect)
 * GET /api/payments/return
 * 
 * Handles user redirect after payment completion
 */

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabaseAdmin";
import { verifyReturnSignature } from "../../../../lib/paymentProvider";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const requestId = `return-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  console.log(`[payments/return:${requestId}] ========== RETURN REQUEST ==========`);

  try {
    const url = new URL(req.url);
    const params: Record<string, string> = {};
    for (const [key, value] of url.searchParams.entries()) {
      params[key] = value;
    }

    console.log(`[payments/return:${requestId}] Received params:`, Object.keys(params));

    const {
      OutSum,
      InvId,
      SignatureValue,
      Shp_userId,
      Shp_planCode,
      Shp_method,
    } = params;

    // Validate required fields
    if (!OutSum || !InvId || !SignatureValue) {
      console.error(`[payments/return:${requestId}] Missing required fields`);
      return NextResponse.redirect(new URL("/subscription?error=missing_fields", req.url));
    }

    // Get payment provider config
    const password1 = process.env.ROBO_PASSWORD1;
    if (!password1) {
      console.error(`[payments/return:${requestId}] ROBO_PASSWORD1 not configured`);
      return NextResponse.redirect(new URL("/subscription?error=config_error", req.url));
    }

    // Verify signature (use password1 for return URL)
    const isValid = verifyReturnSignature(
      {
        merchantLogin: process.env.ROBO_MERCHANT_LOGIN || "",
        password1,
        password2: process.env.ROBO_PASSWORD2 || "",
        baseUrl: "",
      },
      {
        OutSum,
        InvId,
        SignatureValue,
        Shp_userId,
        Shp_planCode,
        Shp_method,
      }
    );

    if (!isValid) {
      console.error(`[payments/return:${requestId}] Invalid signature`);
      return NextResponse.redirect(new URL("/subscription?error=invalid_signature", req.url));
    }

    console.log(`[payments/return:${requestId}] Signature verified`);

    // Initialize Supabase
    const supabase = createServerSupabaseClient();

    // Find payment record
    const { data: payment, error: findError } = await supabase
      .from("payments")
      .select("*")
      .eq("inv_id", InvId)
      .maybeSingle();

    if (findError || !payment) {
      console.error(`[payments/return:${requestId}] Payment not found`);
      return NextResponse.redirect(new URL("/subscription?error=payment_not_found", req.url));
    }

    // Update payment status if not already paid
    if (payment.status !== "paid") {
      const { error: updateError } = await supabase
        .from("payments")
        .update({
          status: "paid",
          updated_at: new Date().toISOString(),
        })
        .eq("id", payment.id);

      if (updateError) {
        console.error(`[payments/return:${requestId}] Failed to update payment:`, updateError);
      } else {
        console.log(`[payments/return:${requestId}] Payment marked as paid: ${payment.id}`);

        // Update or create subscription
        const userId = payment.user_id;
        const planCode = payment.plan_code;
        const activeUntil = new Date();
        activeUntil.setDate(activeUntil.getDate() + 30); // 30 days subscription

        await supabase
          .from("subscriptions")
          .upsert(
            {
              user_id: userId,
              plan_code: planCode,
              active_until: activeUntil.toISOString(),
              is_active: true,
            },
            { onConflict: "user_id" }
          );
      }
    }

    // Redirect to subscription page with success
    const userId = payment.user_id;
    return NextResponse.redirect(new URL(`/subscription?id=${userId}&payment=success`, req.url));
  } catch (error: any) {
    console.error(`[payments/return:${requestId}] Unexpected error:`, error);
    return NextResponse.redirect(new URL("/subscription?error=internal_error", req.url));
  }
}
