/**
 * Cron Endpoint: Subscription Management
 * GET /api/cron/subscriptions
 * 
 * Location: miniapp/app/api/cron/subscriptions/route.ts
 * 
 * Runs every 10 minutes (cron schedule: every 10 minutes) to:
 * 1. Find users with trial_end_at < now() and subscription_status = 'trial'
 * 2. Attempt to charge 199 RUB via Robokassa (generates payment URL)
 * 3. Update subscription status based on payment result
 * 
 * Security: Requires Authorization header with CRON_SECRET
 * 
 * Vercel Cron Configuration: vercel.json (project root)
 * Schedule: every 10 minutes
 * 
 * Manual Test:
 * curl -H "Authorization: Bearer <CRON_SECRET>" https://<domain>/api/cron/subscriptions
 * 
 * Verification:
 * - Vercel Dashboard → Logs → wait 10 minutes after deploy
 * - Look for: [cron] started <ISO timestamp>
 * - Vercel Dashboard → Settings → Cron Jobs → should see /api/cron/subscriptions
 */

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabaseAdmin";
import { generateRobokassaUrl, generateInvoiceId } from "../../../../lib/robokassa";

export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET || "";

/**
 * Attempt to charge user 199 RUB
 * 
 * NOTE: Robokassa requires user interaction for payments.
 * This function generates a payment URL that should be sent to the user
 * via Telegram bot notification. For automatic charging, you would need
 * to integrate with Robokassa's recurring payment API (requires setup).
 * 
 * Returns payment URL if successful, null if failed
 */
async function attemptCharge(
  userId: number,
  invoiceId: string
): Promise<{ success: boolean; paymentUrl?: string; error?: string }> {
  try {
    const amount = "199.00";
    const description = "Подписка на 30 дней";

    // Generate payment URL (without debug for cron)
    const result = generateRobokassaUrl(
      amount,
      invoiceId,
      description,
      userId.toString(),
      "month", // planCode
      false, // isTest
      false // includeDebug
    );

    // result is always string when includeDebug is false
    const paymentUrl = typeof result === "string" ? result : result.paymentUrl;

    if (!paymentUrl) {
      return { success: false, error: "Failed to generate payment URL" };
    }

    // NOTE: In production, you should:
    // 1. Send payment URL to user via Telegram bot
    // 2. Or integrate Robokassa recurring payments API
    // 3. For now, we return the URL but mark as "needs payment"
    //    The user must complete payment manually
    
    return { success: true, paymentUrl };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function GET(req: Request) {
  const timestamp = new Date().toISOString();
  console.log("[cron] ========== SUBSCRIPTION CRON STARTED ==========");
  console.log("[cron] started", timestamp);

  // Security check: Verify CRON_SECRET
  const authHeader = req.headers.get("authorization");
  const expectedAuth = `Bearer ${CRON_SECRET}`;

  if (!authHeader || authHeader !== expectedAuth) {
    console.error("[cron] Unauthorized access attempt");
    console.error("[cron] Expected:", expectedAuth.substring(0, 20) + "...");
    console.error("[cron] Received:", authHeader?.substring(0, 20) + "...");
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const supabase = createServerSupabaseClient();

    // Find users with expired trials
    const now = new Date().toISOString();
    const { data: expiredTrials, error: queryError } = await supabase
      .from("users")
      .select("id, robokassa_parent_invoice_id")
      .eq("subscription_status", "trial")
      .lt("trial_end_at", now);

    if (queryError) {
      console.error("[cron] Database query error:", queryError);
      return NextResponse.json(
        { ok: false, error: "Database query failed" },
        { status: 500 }
      );
    }

    if (!expiredTrials || expiredTrials.length === 0) {
      console.log("[cron] No expired trials found");
      console.log("[cron] ========== CRON COMPLETED ==========");
      return NextResponse.json({
        ok: true,
        message: "No expired trials",
        processed: 0,
      });
    }

    console.log(`[cron] Found ${expiredTrials.length} expired trials`);

    let successCount = 0;
    let failCount = 0;

    // Process each expired trial
    for (const user of expiredTrials) {
      const userId = user.id; // id is the telegram user id

      console.log(`[cron] Processing user ${userId}`);

      // Generate new invoice ID for the charge
      const invoiceId = generateInvoiceId();

      // Attempt to charge 199 RUB
      const chargeResult = await attemptCharge(Number(userId), invoiceId);

      if (chargeResult.success && chargeResult.paymentUrl) {
        // NOTE: Since Robokassa requires user interaction, we generate the URL
        // but cannot automatically charge. In production, you should:
        // 1. Send payment URL to user via Telegram bot (/api/notify-bot)
        // 2. Wait for user to complete payment
        // 3. When payment is confirmed via /api/robokassa/result, activate subscription
        
        // For now, we'll mark as expired since automatic charge isn't possible
        // The user can manually subscribe again
        const { error: updateError } = await supabase
          .from("users")
          .update({
            subscription_status: "expired",
            robokassa_parent_invoice_id: invoiceId,
          })
          .eq("id", userId);

        if (updateError) {
          console.error(`[cron] user ${userId} expiration update failed:`, updateError);
          failCount++;
        } else {
          console.log(`[cron] user ${userId} payment URL generated but requires user action`);
          console.log(`[cron] user ${userId} payment URL: ${chargeResult.paymentUrl.substring(0, 50)}...`);
          // TODO: Send notification to user via Telegram bot with payment URL
          failCount++; // Count as failed since it requires manual action
        }
      } else {
        // Mark subscription as expired
        const { error: updateError } = await supabase
          .from("users")
          .update({
            subscription_status: "expired",
          })
          .eq("id", userId);

        if (updateError) {
          console.error(`[cron] user ${userId} expiration update failed:`, updateError);
        } else {
          console.log(`[cron] user ${userId} payment failed:`, chargeResult.error);
          failCount++;
        }
      }
    }

    console.log(`[cron] Processed: ${expiredTrials.length}, Success: ${successCount}, Failed: ${failCount}`);
    console.log("[cron] ========== CRON COMPLETED ==========");

    return NextResponse.json({
      ok: true,
      processed: expiredTrials.length,
      success: successCount,
      failed: failCount,
    });
  } catch (error: any) {
    console.error("[cron] Error:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
