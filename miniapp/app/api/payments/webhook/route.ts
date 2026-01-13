/**
 * Payment Webhook Endpoint (Server-to-Server)
 * POST /api/payments/webhook
 * 
 * Handles payment provider server-to-server notifications
 */

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabaseAdmin";
import {
  verifyRobokassaCallback,
  getProviderConfig,
  PaymentProvider,
} from "../../../../lib/paymentProviders";

export const dynamic = "force-dynamic";

/**
 * Calculate subscription dates based on plan code and payment amount
 */
function calculateSubscriptionDates(planCode: string, amount: string): {
  activeUntil: Date;
  nextChargeAt: Date | null;
} {
  const now = new Date();
  let activeUntil: Date;
  let nextChargeAt: Date | null = null;

  if (planCode === "trial_3d_then_199") {
    if (amount === "1.00") {
      // Trial: 3 days
      activeUntil = new Date(now);
      activeUntil.setDate(activeUntil.getDate() + 3);
      // Next charge in 3 days
      nextChargeAt = new Date(activeUntil);
    } else {
      // Regular monthly: 30 days
      activeUntil = new Date(now);
      activeUntil.setDate(activeUntil.getDate() + 30);
      // Next charge in 30 days
      nextChargeAt = new Date(activeUntil);
    }
  } else {
    // Default: 30 days
    activeUntil = new Date(now);
    activeUntil.setDate(activeUntil.getDate() + 30);
    nextChargeAt = new Date(activeUntil);
  }

  return { activeUntil, nextChargeAt };
}

export async function POST(req: Request) {
  const requestId = `webhook-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  console.log(`[payments/webhook:${requestId}] ========== WEBHOOK REQUEST ==========`);

  try {
    // Parse form data (Robokassa sends form-encoded data)
    const formData = await req.formData();
    const params: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
      params[key] = value.toString();
    }

    console.log(`[payments/webhook:${requestId}] Received params:`, Object.keys(params));

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
      console.error(`[payments/webhook:${requestId}] Missing required fields`);
      return new Response("ERROR: Missing required fields", { status: 400 });
    }

    // Get provider config (assume robokassa for now)
    const provider: PaymentProvider = "robokassa";
    const config = getProviderConfig(provider);

    if (!config) {
      console.error(`[payments/webhook:${requestId}] Provider not configured`);
      return new Response("ERROR: Payment provider not configured", { status: 500 });
    }

    // Verify signature
    let isValid = false;
    if (provider === "robokassa") {
      isValid = verifyRobokassaCallback(config, {
        OutSum,
        InvId,
        SignatureValue,
        Shp_userId,
        Shp_planCode,
        Shp_method,
      });
    }

    if (!isValid) {
      console.error(`[payments/webhook:${requestId}] Invalid signature`);
      return new Response("ERROR: Invalid signature", { status: 400 });
    }

    console.log(`[payments/webhook:${requestId}] Signature verified`);

    // Initialize Supabase
    const supabase = createServerSupabaseClient();

    // Find payment record
    const { data: payment, error: findError } = await supabase
      .from("payments")
      .select("*")
      .eq("inv_id", InvId)
      .maybeSingle();

    if (findError) {
      console.error(`[payments/webhook:${requestId}] Database error:`, findError);
      return new Response("ERROR: Database error", { status: 500 });
    }

    if (!payment) {
      console.error(`[payments/webhook:${requestId}] Payment not found for invId: ${InvId}`);
      return new Response("ERROR: Payment not found", { status: 404 });
    }

    // Check if already paid
    if (payment.status === "paid") {
      console.log(`[payments/webhook:${requestId}] Payment already marked as paid`);
      return new Response(`OK${InvId}`);
    }

    // Update payment status
    const { error: updateError } = await supabase
      .from("payments")
      .update({
        status: "paid",
        updated_at: new Date().toISOString(),
      })
      .eq("id", payment.id);

    if (updateError) {
      console.error(`[payments/webhook:${requestId}] Failed to update payment:`, updateError);
      return new Response("ERROR: Failed to update payment", { status: 500 });
    }

    console.log(`[payments/webhook:${requestId}] Payment marked as paid: ${payment.id}`);

    // Calculate subscription dates
    const { activeUntil, nextChargeAt } = calculateSubscriptionDates(
      payment.plan_code,
      payment.amount.toString()
    );

    // Update or create subscription
    const userId = payment.user_id;
    const { error: subError } = await supabase
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

    if (subError) {
      console.error(`[payments/webhook:${requestId}] Failed to update subscription:`, subError);
      // Don't fail the webhook - payment is already marked as paid
    } else {
      console.log(`[payments/webhook:${requestId}] Subscription updated for user: ${userId}, active until: ${activeUntil.toISOString()}`);
    }

    // Return OK with InvId (Robokassa requirement)
    return new Response(`OK${InvId}`);
  } catch (error: any) {
    console.error(`[payments/webhook:${requestId}] Unexpected error:`, error);
    return new Response("ERROR: Internal server error", { status: 500 });
  }
}
