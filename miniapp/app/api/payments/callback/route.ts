/**
 * Payment Callback Endpoint (Server-to-Server)
 * POST /api/payments/callback
 * 
 * Handles Robokassa server-to-server payment notifications
 */

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabaseAdmin";
import { verifyCallbackSignature } from "../../../../lib/paymentProvider";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const requestId = `callback-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  console.log(`[payments/callback:${requestId}] ========== CALLBACK REQUEST ==========`);

  try {
    // Parse form data (Robokassa sends form-encoded data)
    const formData = await req.formData();
    const params: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
      params[key] = value.toString();
    }

    console.log(`[payments/callback:${requestId}] Received params:`, Object.keys(params));

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
      console.error(`[payments/callback:${requestId}] Missing required fields`);
      return NextResponse.text("ERROR: Missing required fields", { status: 400 });
    }

    // Get payment provider config
    const password2 = process.env.ROBO_PASSWORD2;
    if (!password2) {
      console.error(`[payments/callback:${requestId}] ROBO_PASSWORD2 not configured`);
      return NextResponse.text("ERROR: Payment provider not configured", { status: 500 });
    }

    // Verify signature
    const isValid = verifyCallbackSignature(
      {
        merchantLogin: process.env.ROBO_MERCHANT_LOGIN || "",
        password1: process.env.ROBO_PASSWORD1 || "",
        password2,
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
      console.error(`[payments/callback:${requestId}] Invalid signature`);
      return NextResponse.text("ERROR: Invalid signature", { status: 400 });
    }

    console.log(`[payments/callback:${requestId}] Signature verified`);

    // Initialize Supabase
    const supabase = createServerSupabaseClient();

    // Find payment record
    const { data: payment, error: findError } = await supabase
      .from("payments")
      .select("*")
      .eq("inv_id", InvId)
      .maybeSingle();

    if (findError) {
      console.error(`[payments/callback:${requestId}] Database error:`, findError);
      return NextResponse.text("ERROR: Database error", { status: 500 });
    }

    if (!payment) {
      console.error(`[payments/callback:${requestId}] Payment not found for invId: ${InvId}`);
      return NextResponse.text("ERROR: Payment not found", { status: 404 });
    }

    // Check if already paid
    if (payment.status === "paid") {
      console.log(`[payments/callback:${requestId}] Payment already marked as paid`);
      return NextResponse.text(`OK${InvId}`);
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
      console.error(`[payments/callback:${requestId}] Failed to update payment:`, updateError);
      return NextResponse.text("ERROR: Failed to update payment", { status: 500 });
    }

    console.log(`[payments/callback:${requestId}] Payment marked as paid: ${payment.id}`);

    // Update or create subscription
    const userId = payment.user_id;
    const planCode = payment.plan_code;
    const activeUntil = new Date();
    activeUntil.setDate(activeUntil.getDate() + 30); // 30 days subscription

    const { error: subError } = await supabase
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

    if (subError) {
      console.error(`[payments/callback:${requestId}] Failed to update subscription:`, subError);
      // Don't fail the callback - payment is already marked as paid
    } else {
      console.log(`[payments/callback:${requestId}] Subscription updated for user: ${userId}`);
    }

    // Return OK with InvId (Robokassa requirement)
    return NextResponse.text(`OK${InvId}`);
  } catch (error: any) {
    console.error(`[payments/callback:${requestId}] Unexpected error:`, error);
    return NextResponse.text("ERROR: Internal server error", { status: 500 });
  }
}
