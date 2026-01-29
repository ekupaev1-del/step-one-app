/**
 * Robokassa ResultURL Webhook
 * POST /api/subscription/webhook/robokassa-result
 * 
 * Handles Robokassa payment confirmation (server-to-server)
 * Must respond with "OK" + InvId if payment valid
 * 
 * CRITICAL: This is the source of truth for payment status.
 * Success URL is only informational.
 */

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabaseAdmin";
import { verifyRobokassaResultSignature, parseShpParams, getRobokassaConfig } from "@/lib/robokassa";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const requestId = `robokassa-result-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    // Parse query params (Robokassa sends data via POST body as form data or query params)
    const url = new URL(req.url);
    const searchParams = url.searchParams;

    // Also try to parse from request body if it's form data
    let bodyParams = new URLSearchParams();
    try {
      const contentType = req.headers.get("content-type") || "";
      if (contentType.includes("application/x-www-form-urlencoded")) {
        const bodyText = await req.text();
        bodyParams = new URLSearchParams(bodyText);
      }
    } catch (e) {
      // Ignore body parsing errors
    }

    // Combine query params and body params (query params take precedence)
    const params = new URLSearchParams(searchParams);
    bodyParams.forEach((value, key) => {
      if (!params.has(key)) {
        params.set(key, value);
      }
    });

    const outSum = params.get("OutSum");
    const invId = params.get("InvId");
    const signature = params.get("SignatureValue");

    if (!outSum || !invId || !signature) {
      console.error(`[robokassa-result:${requestId}] Missing required params:`, {
        hasOutSum: !!outSum,
        hasInvId: !!invId,
        hasSignature: !!signature,
      });
      return new NextResponse("ERROR: Missing required parameters", { status: 400 });
    }

    // Parse Shp_ parameters
    const shpParams = parseShpParams(params);

    // Verify signature (pass requestId for debug logging)
    const isValid = verifyRobokassaResultSignature({
      outSum,
      invId,
      signature,
      shpParams,
      requestId,
    });

    if (!isValid) {
      console.error(`[robokassa-result:${requestId}] Invalid signature:`, {
        invId,
        outSum,
        signature: signature.substring(0, 10) + "...",
      });
      return new NextResponse("ERROR: Invalid signature", { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    // Store raw payload for debugging
    const providerPayload: any = {
      outSum,
      invId,
      signature: signature.substring(0, 10) + "...", // Mask signature in payload
      shpParams,
      receivedAt: new Date().toISOString(),
    };

    // Try to get userId from Shp params or invoice
    let userId: number | null = null;
    
    // First, try to get from Shp_userId
    if (shpParams.userId) {
      const userIdNum = Number(shpParams.userId);
      if (Number.isFinite(userIdNum) && userIdNum > 0) {
        userId = userIdNum;
      }
    }

    // If not found, try to find from robokassa_invoices table
    if (!userId) {
      const invIdNum = Number(invId);
      if (Number.isFinite(invIdNum) && invIdNum > 0) {
        const { data: invoiceData } = await supabase
          .from("robokassa_invoices")
          .select("user_id")
          .eq("id", invIdNum)
          .maybeSingle();
        
        if (invoiceData?.user_id) {
          userId = invoiceData.user_id;
        }
      }
    }

    if (!userId) {
      console.error(`[robokassa-result:${requestId}] Cannot determine userId from webhook`);
      // Still return OK to Robokassa, but log the error
      return new NextResponse(`OK${invId}`, { status: 200 });
    }

    // Parse amount
    const amount = Number(outSum);
    if (!Number.isFinite(amount) || amount <= 0) {
      console.error(`[robokassa-result:${requestId}] Invalid amount: ${outSum}`);
      return new NextResponse("ERROR: Invalid amount", { status: 400 });
    }

    // Check if payment already exists (idempotency)
    const { data: existingPayment } = await supabase
      .from("payments")
      .select("id, status")
      .eq("provider", "robokassa")
      .eq("inv_id", invId)
      .maybeSingle();

    if (existingPayment && existingPayment.status === "paid") {
      console.log(`[robokassa-result:${requestId}] Payment already processed:`, invId);
      return new NextResponse(`OK${invId}`, { status: 200 });
    }

    // Get subscription ID from Shp params or provider payload
    const subscriptionId = shpParams.subscriptionId || shpParams.subscription_id || null;
    const isRecurring = !!subscriptionId || shpParams.is_recurring === "true";

    // Upsert payment (idempotent)
    const paymentData = {
      user_id: userId,
      provider: "robokassa",
      inv_id: invId,
      amount: amount,
      currency: "RUB",
      status: "paid" as const,
      is_recurring: isRecurring,
      subscription_id: subscriptionId,
      paid_at: new Date().toISOString(),
      provider_payload: providerPayload,
    };

    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .upsert(paymentData, {
        onConflict: "provider,inv_id",
        ignoreDuplicates: false,
      })
      .select("id")
      .single();

    if (paymentError) {
      console.error(`[robokassa-result:${requestId}] DB error upserting payment:`, paymentError);
      // Still return OK to Robokassa to avoid retries
      return new NextResponse(`OK${invId}`, { status: 200 });
    }

    // Calculate subscription dates
    const now = new Date();
    const paidAt = new Date(now);
    
    // If webhook provides dates, use them; otherwise infer
    let currentPeriodStart = paidAt;
    let currentPeriodEnd = new Date(paidAt);
    currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1); // Add 1 month
    let nextChargeAt = new Date(currentPeriodEnd);

    // Try to get dates from Shp params if provided
    if (shpParams.current_period_end) {
      try {
        currentPeriodEnd = new Date(shpParams.current_period_end);
        nextChargeAt = new Date(currentPeriodEnd);
      } catch (e) {
        // Use inferred dates
      }
    }

    if (shpParams.next_charge_at) {
      try {
        nextChargeAt = new Date(shpParams.next_charge_at);
      } catch (e) {
        // Use inferred dates
      }
    }

    // Upsert subscription
    const subscriptionData = {
      user_id: userId,
      provider: "robokassa",
      provider_subscription_id: subscriptionId,
      status: "active" as const,
      started_at: existingPayment ? undefined : paidAt.toISOString(), // Only set on first payment
      current_period_start: currentPeriodStart.toISOString(),
      current_period_end: currentPeriodEnd.toISOString(),
      next_charge_at: nextChargeAt.toISOString(),
      last_payment_id: payment?.id || null,
      updated_at: new Date().toISOString(),
    };

    const { data: subscription, error: subError } = await supabase
      .from("subscriptions")
      .upsert(subscriptionData, {
        onConflict: "user_id",
        ignoreDuplicates: false,
      })
      .select("id")
      .single();

    if (subError) {
      console.error(`[robokassa-result:${requestId}] DB error upserting subscription:`, subError);
      // Payment is already marked as paid, so we still return OK
    } else {
      console.log(`[robokassa-result:${requestId}] Payment processed and subscription updated:`, {
        userId,
        invId,
        paymentId: payment?.id,
        subscriptionId: subscription?.id,
      });
    }

    // Robokassa expects "OK" + InvId
    return new NextResponse(`OK${invId}`, { status: 200 });
  } catch (error: any) {
    console.error(`[robokassa-result:${requestId}] Unexpected error:`, error);
    // Still return OK to avoid Robokassa retries
    const invId = new URL(req.url).searchParams.get("InvId") || "unknown";
    return new NextResponse(`OK${invId}`, { status: 200 });
  }
}
