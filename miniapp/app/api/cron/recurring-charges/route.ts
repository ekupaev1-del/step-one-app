/**
 * Cron Endpoint: Recurring Charges
 * GET /api/cron/recurring-charges
 * 
 * Processes recurring subscription charges for users with next_charge_at <= now()
 * Runs via Vercel Cron (configure in vercel.json)
 */

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabaseAdmin";
import {
  generatePaymentUrl,
  generateInvoiceId,
  getProviderConfig,
  PaymentRequest,
  PaymentProvider,
} from "../../../../lib/paymentProviders";

export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET || "";

/**
 * Create a recurring charge payment URL for a user
 */
async function createRecurringCharge(
  userId: number,
  telegramUserId: string,
  planCode: string,
  provider: PaymentProvider
): Promise<{ success: boolean; paymentUrl?: string; invId?: string; error?: string }> {
  try {
    const config = getProviderConfig(provider);
    if (!config) {
      return { success: false, error: "Provider not configured" };
    }

    const invId = generateInvoiceId();
    const amount = "199.00"; // Monthly recurring charge
    const baseUrl = config.baseUrl || process.env.APP_BASE_URL || "";
    const returnUrl = `${baseUrl}/subscription?id=${userId}`;

    const paymentRequest: PaymentRequest = {
      amount,
      invId,
      description: `Ежемесячная подписка ${planCode}`,
      telegramUserId,
      method: "card", // Default to card for recurring
      planCode,
      returnUrl,
    };

    const paymentResponse = generatePaymentUrl(config, paymentRequest);

    // Create payment record
    const supabase = createServerSupabaseClient();
    await supabase.from("payments").insert({
      user_id: userId,
      telegram_user_id: telegramUserId,
      plan_code: planCode,
      amount: amount,
      currency: "RUB",
      method: "card",
      provider: provider,
      inv_id: invId,
      status: "created",
      payment_url: paymentResponse.paymentUrl,
    });

    return {
      success: true,
      paymentUrl: paymentResponse.paymentUrl,
      invId,
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function GET(req: Request) {
  const timestamp = new Date().toISOString();
  console.log("[cron/recurring-charges] ========== RECURRING CHARGES CRON STARTED ==========");
  console.log("[cron/recurring-charges] started", timestamp);

  // Security check: Verify CRON_SECRET
  const authHeader = req.headers.get("authorization");
  const expectedAuth = `Bearer ${CRON_SECRET}`;

  if (!authHeader || authHeader !== expectedAuth) {
    console.error("[cron/recurring-charges] Unauthorized access attempt");
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const supabase = createServerSupabaseClient();

    // Find users with due recurring charges
    const now = new Date().toISOString();
    const { data: dueSubscriptions, error: queryError } = await supabase
      .from("subscriptions")
      .select("user_id, plan_code, provider, next_charge_at")
      .eq("status", "active")
      .not("next_charge_at", "is", null)
      .lte("next_charge_at", now);

    if (queryError) {
      console.error("[cron/recurring-charges] Database query error:", queryError);
      return NextResponse.json(
        { ok: false, error: "Database query failed" },
        { status: 500 }
      );
    }

    if (!dueSubscriptions || dueSubscriptions.length === 0) {
      console.log("[cron/recurring-charges] No due recurring charges found");
      return NextResponse.json({
        ok: true,
        message: "No due recurring charges",
        processed: 0,
      });
    }

    console.log(`[cron/recurring-charges] Found ${dueSubscriptions.length} due recurring charges`);

    let successCount = 0;
    let failCount = 0;

    // Process each due subscription
    for (const subscription of dueSubscriptions) {
      const userId = subscription.user_id;
      const planCode = subscription.plan_code || "trial_3d_then_199";
      const provider = (subscription.provider as PaymentProvider) || "robokassa";

      console.log(`[cron/recurring-charges] Processing user ${userId}`);

      // Get user's telegram_user_id from payments table (latest payment)
      const { data: latestPayment } = await supabase
        .from("payments")
        .select("telegram_user_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!latestPayment) {
        console.error(`[cron/recurring-charges] No payment history for user ${userId}`);
        failCount++;
        continue;
      }

      const telegramUserId = latestPayment.telegram_user_id;

      // Create recurring charge
      const chargeResult = await createRecurringCharge(userId, telegramUserId, planCode, provider);

      if (chargeResult.success && chargeResult.paymentUrl) {
        // Update next_charge_at to 30 days from now (will be updated when payment is confirmed)
        const nextCharge = new Date();
        nextCharge.setDate(nextCharge.getDate() + 30);

        await supabase
          .from("subscriptions")
          .update({
            next_charge_at: nextCharge.toISOString(),
          })
          .eq("user_id", userId);

        console.log(`[cron/recurring-charges] Recurring charge created for user ${userId}`);
        // TODO: Send notification to user via Telegram bot with payment URL
        successCount++;
      } else {
        console.error(`[cron/recurring-charges] Failed to create charge for user ${userId}:`, chargeResult.error);
        failCount++;
      }
    }

    console.log(`[cron/recurring-charges] Processed: ${dueSubscriptions.length}, Success: ${successCount}, Failed: ${failCount}`);
    console.log("[cron/recurring-charges] ========== CRON COMPLETED ==========");

    return NextResponse.json({
      ok: true,
      processed: dueSubscriptions.length,
      success: successCount,
      failed: failCount,
    });
  } catch (error: any) {
    console.error("[cron/recurring-charges] Error:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
