/**
 * Payment Start Endpoint
 * POST /api/payments/start
 * 
 * Location: miniapp/app/api/payments/start/route.ts
 * 
 * Creates Robokassa invoice for 1 RUB trial payment
 * Sets user subscription_status to 'trial' and trial_end_at to now() + 3 days
 * 
 * Called from: Mini App UI (profile page subscription button)
 */

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabaseAdmin";
import { generateRobokassaUrl, generateInvoiceId } from "../../../../lib/robokassa";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const requestId = Date.now().toString();
  const startTime = Date.now();
  console.log(`[payments/start:${requestId}] CREATE_PAYMENT_START`, { timestamp: new Date().toISOString() });

  try {
    let body: any;
    try {
      body = await req.json();
    } catch (parseError: any) {
      console.error(`[payments/start:${requestId}] CREATE_PAYMENT_FAIL: Invalid JSON body`, parseError.message);
      return NextResponse.json(
        { ok: false, error: "Invalid request body", details: "Expected JSON" },
        { status: 400 }
      );
    }
    
    const userId = body.userId;
    console.log(`[payments/start:${requestId}] CREATE_PAYMENT_START userId:`, userId);

    if (!userId) {
      console.error(`[payments/start:${requestId}] CREATE_PAYMENT_FAIL: Missing userId`);
      return NextResponse.json(
        { ok: false, error: "userId is required", details: "userId must be provided in request body" },
        { status: 400 }
      );
    }

    const numericUserId = Number(userId);
    if (!Number.isFinite(numericUserId) || numericUserId <= 0) {
      console.error(`[payments/start:${requestId}] CREATE_PAYMENT_FAIL: Invalid userId:`, userId);
      return NextResponse.json(
        { ok: false, error: "userId must be a positive number", details: `Received: ${userId}` },
        { status: 400 }
      );
    }

    console.log(`[payments/start:${requestId}] Processing payment for userId:`, numericUserId);

    const supabase = createServerSupabaseClient();
    
    // Verify user exists (with timeout protection)
    try {
      const { data: user, error: userError } = await supabase
        .from("users")
        .select("id")
        .eq("id", numericUserId)
        .maybeSingle();
      
      if (userError) {
        console.error(`[payments/start:${requestId}] CREATE_PAYMENT_FAIL: Supabase error`, userError);
        return NextResponse.json(
          { ok: false, error: "Database error", details: userError.message },
          { status: 500 }
        );
      }
      
      if (!user) {
        console.error(`[payments/start:${requestId}] CREATE_PAYMENT_FAIL: User not found`, numericUserId);
        return NextResponse.json(
          { ok: false, error: "User not found", details: `User with id ${numericUserId} does not exist` },
          { status: 404 }
        );
      }
    } catch (dbError: any) {
      console.error(`[payments/start:${requestId}] CREATE_PAYMENT_FAIL: Database query error`, dbError);
      return NextResponse.json(
        { ok: false, error: "Database connection error", details: dbError.message },
        { status: 500 }
      );
    }

    // Generate invoice ID
    const invId = generateInvoiceId();
    const amount = "1.00"; // 1 RUB for trial
    const description = "Пробный период 3 дня";

    console.log(`[payments/start:${requestId}] Generated invoice ID:`, invId);
    console.log(`[payments/start:${requestId}] Amount:`, amount);
    console.log(`[payments/start:${requestId}] Description:`, description);

    // Calculate trial end date (now + 3 days)
    const trialEndAt = new Date();
    trialEndAt.setDate(trialEndAt.getDate() + 3);

    console.log(`[payments/start:${requestId}] Trial end date:`, trialEndAt.toISOString());

    // Update user in database
    const { error: updateError } = await supabase
      .from("users")
      .update({
        subscription_status: "trial",
        trial_end_at: trialEndAt.toISOString(),
        robokassa_parent_invoice_id: invId,
      })
      .eq("id", numericUserId);

    if (updateError) {
      console.error(`[payments/start:${requestId}] CREATE_PAYMENT_FAIL: Database update error:`, updateError);
      return NextResponse.json(
        { ok: false, error: "Failed to update user subscription", details: updateError.message },
        { status: 500 }
      );
    }

    console.log(`[payments/start:${requestId}] User subscription updated to trial`);

    // Generate Robokassa payment URL with debug info
    const result = generateRobokassaUrl(
      amount,
      invId,
      description,
      userId.toString(),
      false, // isTest
      true // includeDebug
    );

    const paymentUrl = typeof result === "string" ? result : result.paymentUrl;
    const debug = typeof result === "string" ? undefined : result.debug;

    if (!paymentUrl || typeof paymentUrl !== "string" || !paymentUrl.startsWith("https://")) {
      console.error(`[payments/start:${requestId}] CREATE_PAYMENT_FAIL: Invalid payment URL generated`);
      return NextResponse.json(
        { ok: false, error: "Failed to generate payment URL", details: "Generated URL is invalid" },
        { status: 500 }
      );
    }

    const elapsed = Date.now() - startTime;
    console.log(`[payments/start:${requestId}] CREATE_PAYMENT_OK`, { 
      invId, 
      outSum: amount,
      elapsed: `${elapsed}ms`
    });
    console.log(`[payments/start:${requestId}] CREATE_PAYMENT_URL`, paymentUrl.substring(0, 80) + "...");
    console.log(`[payments/start:${requestId}] Payment URL length:`, paymentUrl.length);
    console.log(`[payments/start:${requestId}] Invoice ID:`, invId);
    if (debug) {
      console.log(`[payments/start:${requestId}] Signature string (masked):`, debug.signatureStringMasked);
      console.log(`[payments/start:${requestId}] Signature value:`, debug.signatureValue?.substring(0, 8) + "...");
      console.log(`[payments/start:${requestId}] Signature checks:`, debug.signatureChecks);
    }

    return NextResponse.json({
      ok: true,
      paymentUrl,
      invoiceId: invId,
      amount,
      debug: debug ? { robokassa: debug } : undefined,
    });
  } catch (error: any) {
    const elapsed = Date.now() - startTime;
    console.error(`[payments/start:${requestId}] CREATE_PAYMENT_FAIL`, { 
      error: error.message,
      stack: error.stack,
      elapsed: `${elapsed}ms`
    });
    return NextResponse.json(
      { ok: false, error: error.message || "Internal server error", details: error.stack?.substring(0, 200) },
      { status: 500 }
    );
  }
}
