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
  console.log(`[payments/start:${requestId}] ========== PAYMENT START REQUEST ==========`);
  console.log(`[payments/start:${requestId}] Timestamp:`, new Date().toISOString());

  try {
    const body = await req.json();
    const userId = body.userId;
    
    console.log(`[payments/start:${requestId}] Request body:`, { 
      userId, 
      hasUserId: !!userId 
    });

    if (!userId) {
      console.error(`[payments/start:${requestId}] Missing userId`);
      return NextResponse.json(
        { ok: false, error: "userId is required" },
        { status: 400 }
      );
    }

    const numericUserId = Number(userId);
    if (!Number.isFinite(numericUserId) || numericUserId <= 0) {
      console.error(`[payments/start:${requestId}] Invalid userId:`, userId);
      return NextResponse.json(
        { ok: false, error: "userId must be a positive number" },
        { status: 400 }
      );
    }

    console.log(`[payments/start:${requestId}] Processing payment for userId:`, numericUserId);

    const supabase = createServerSupabaseClient();

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
      console.error(`[payments/start:${requestId}] Database update error:`, updateError);
      return NextResponse.json(
        { ok: false, error: "Failed to update user subscription" },
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

    console.log(`[payments/start:${requestId}] Payment URL generated successfully`);
    console.log(`[payments/start:${requestId}] Payment URL length:`, paymentUrl?.length || 0);
    console.log(`[payments/start:${requestId}] Invoice ID:`, invId);
    if (debug) {
      console.log(`[payments/start:${requestId}] Signature string (masked):`, debug.signatureStringMasked);
      console.log(`[payments/start:${requestId}] Signature value:`, debug.signatureValue);
      console.log(`[payments/start:${requestId}] Signature checks:`, debug.signatureChecks);
    }
    console.log(`[payments/start:${requestId}] ========== PAYMENT START SUCCESS ==========`);

    return NextResponse.json({
      ok: true,
      paymentUrl,
      invoiceId: invId,
      amount,
      debug: debug ? { robokassa: debug } : undefined,
    });
  } catch (error: any) {
    console.error(`[payments/start:${requestId}] Error:`, error);
    console.error(`[payments/start:${requestId}] Error stack:`, error.stack);
    return NextResponse.json(
      { ok: false, error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
