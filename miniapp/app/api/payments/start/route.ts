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
  console.log("[payments/start] ========== PAYMENT START REQUEST ==========");
  console.log("[payments/start] Timestamp:", new Date().toISOString());

  try {
    const body = await req.json();
    const userId = body.userId;

    if (!userId) {
      console.error("[payments/start] Missing userId");
      return NextResponse.json(
        { ok: false, error: "userId is required" },
        { status: 400 }
      );
    }

    const numericUserId = Number(userId);
    if (!Number.isFinite(numericUserId) || numericUserId <= 0) {
      console.error("[payments/start] Invalid userId:", userId);
      return NextResponse.json(
        { ok: false, error: "userId must be a positive number" },
        { status: 400 }
      );
    }

    console.log("[payments/start] Processing payment for userId:", numericUserId);

    const supabase = createServerSupabaseClient();

    // Generate invoice ID
    const invId = generateInvoiceId();
    const amount = "1.00"; // 1 RUB for trial
    const description = "Пробный период 3 дня";

    console.log("[payments/start] Generated invoice ID:", invId);

    // Calculate trial end date (now + 3 days)
    const trialEndAt = new Date();
    trialEndAt.setDate(trialEndAt.getDate() + 3);

    console.log("[payments/start] Trial end date:", trialEndAt.toISOString());

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
      console.error("[payments/start] Database update error:", updateError);
      return NextResponse.json(
        { ok: false, error: "Failed to update user subscription" },
        { status: 500 }
      );
    }

    console.log("[payments/start] User subscription updated to trial");

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

    console.log("[payments/start] Payment URL generated successfully");
    console.log("[payments/start] ========== PAYMENT START SUCCESS ==========");

    return NextResponse.json({
      ok: true,
      paymentUrl,
      invoiceId: invId,
      amount,
      debug: debug ? { robokassa: debug } : undefined,
    });
  } catch (error: any) {
    console.error("[payments/start] Error:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
