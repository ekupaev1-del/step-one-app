/**
 * Payment Return Endpoint (User Redirect)
 * GET /api/payments/return
 * 
 * Handles user redirect after payment completion
 */

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabaseAdmin";
import {
  verifyRobokassaReturn,
  getProviderConfig,
  PaymentProvider,
} from "../../../../lib/paymentProviders";

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

    // Get provider config (assume robokassa for now)
    const provider: PaymentProvider = "robokassa";
    const config = getProviderConfig(provider);

    if (!config) {
      console.error(`[payments/return:${requestId}] Provider not configured`);
      return NextResponse.redirect(new URL("/subscription?error=config_error", req.url));
    }

    // Verify signature (use password1 for return URL)
    let isValid = false;
    if (provider === "robokassa") {
      isValid = verifyRobokassaReturn(config, {
        OutSum,
        InvId,
        SignatureValue,
        Shp_userId,
        Shp_planCode,
        Shp_method,
      });
    }

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

        // Calculate subscription dates
        const now = new Date();
        let activeUntil: Date;
        let nextChargeAt: Date | null = null;

        if (payment.plan_code === "trial_3d_then_199") {
          if (payment.amount.toString() === "1.00") {
            // Trial: 3 days
            activeUntil = new Date(now);
            activeUntil.setDate(activeUntil.getDate() + 3);
            nextChargeAt = new Date(activeUntil);
          } else {
            // Regular monthly: 30 days
            activeUntil = new Date(now);
            activeUntil.setDate(activeUntil.getDate() + 30);
            nextChargeAt = new Date(activeUntil);
          }
        } else {
          activeUntil = new Date(now);
          activeUntil.setDate(activeUntil.getDate() + 30);
          nextChargeAt = new Date(activeUntil);
        }

        // Update or create subscription
        const userId = payment.user_id;
        await supabase
          .from("subscriptions")
          .upsert(
            {
              user_id: userId,
              active_until: activeUntil.toISOString(),
              next_charge_at: nextChargeAt?.toISOString() || null,
              status: "active",
              provider: provider,
              plan_code: payment.plan_code,
              updated_at: new Date().toISOString(),
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
