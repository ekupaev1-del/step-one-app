/**
 * Subscription Charge Cron Job
 * POST /api/cron/subscription/charge
 * 
 * Finds subscriptions due for charging and attempts recurring payment
 * Protected by CRON_SECRET env var
 */

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabaseAdmin";
import { getRobokassaConfig } from "@/lib/robokassa";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const requestId = `cron-charge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    // Verify CRON_SECRET
    const cronSecret = req.headers.get("authorization")?.replace("Bearer ", "") || 
                       new URL(req.url).searchParams.get("secret");
    const expectedSecret = process.env.CRON_SECRET;

    if (!expectedSecret || cronSecret !== expectedSecret) {
      console.error(`[cron/charge:${requestId}] Invalid or missing CRON_SECRET`);
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const supabase = createServerSupabaseClient();

    // Find subscriptions due for charging
    const now = new Date().toISOString();
    const { data: subscriptions, error: findError } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("status", "active")
      .lte("next_charge_at", now);

    if (findError) {
      console.error(`[cron/charge:${requestId}] DB error finding subscriptions:`, findError);
      return NextResponse.json(
        { ok: false, error: "Database error", requestId },
        { status: 500 }
      );
    }

    if (!subscriptions || subscriptions.length === 0) {
      console.log(`[cron/charge:${requestId}] No subscriptions due for charging`);
      return NextResponse.json({
        ok: true,
        processed: 0,
        message: "No subscriptions due for charging",
        requestId,
      });
    }

    const config = getRobokassaConfig();
    const monthlyAmount = "199.00";  // Monthly subscription amount

    let processed = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const subscription of subscriptions) {
      try {
        // Check if recurring token is available
        if (!subscription.provider_recurring_id) {
          console.warn(`[cron/charge:${requestId}] Subscription ${subscription.id} has no provider_recurring_id. Recurring charge not possible yet.`);
          errors.push(`Subscription ${subscription.id}: No recurring token available`);
          failed++;
          continue;
        }

        // Attempt recurring charge
        // NOTE: Actual recurring charge implementation depends on Robokassa API
        // For now, we create a payment record and log that we need provider integration
        console.log(`[cron/charge:${requestId}] Attempting recurring charge for subscription ${subscription.id}`, {
          userId: subscription.user_id,
          recurringId: subscription.provider_recurring_id,
        });

        // Create payment record for this charge
        const invId = `recurring-${Date.now()}-${subscription.id}`;
        const { data: payment, error: paymentError } = await supabase
          .from("payments")
          .insert({
            user_id: subscription.user_id,
            provider: "robokassa",
            inv_id: invId,
            method: "card",  // Recurring charges are always card
            plan_code: subscription.plan_code,
            amount: Number(monthlyAmount),
            currency: "RUB",
            status: "created",  // Will be updated when webhook confirms
            out_sum: Number(monthlyAmount),
            provider_payload: {
              type: "recurring",
              subscriptionId: subscription.id,
              recurringId: subscription.provider_recurring_id,
            },
          })
          .select("id")
          .single();

        if (paymentError) {
          console.error(`[cron/charge:${requestId}] Failed to create payment record:`, paymentError);
          errors.push(`Subscription ${subscription.id}: Failed to create payment record`);
          failed++;
          continue;
        }

        // TODO: Make actual API call to Robokassa for recurring charge
        // This depends on Robokassa API documentation for recurring payments
        // For now, we log that we need provider integration
        console.log(`[cron/charge:${requestId}] Payment record created for recurring charge:`, {
          paymentId: payment.id,
          invId,
          subscriptionId: subscription.id,
          note: "Actual recurring charge API call not yet implemented - requires Robokassa API integration",
        });

        // Update subscription: extend active_until by 1 month
        const activeUntil = new Date(subscription.active_until || now);
        activeUntil.setMonth(activeUntil.getMonth() + 1);
        
        const nextChargeAt = new Date(activeUntil);
        nextChargeAt.setMonth(nextChargeAt.getMonth() + 1);

        const { error: updateError } = await supabase
          .from("subscriptions")
          .update({
            active_until: activeUntil.toISOString(),
            next_charge_at: nextChargeAt.toISOString(),
            status: "active",
            updated_at: new Date().toISOString(),
          })
          .eq("id", subscription.id);

        if (updateError) {
          console.error(`[cron/charge:${requestId}] Failed to update subscription:`, updateError);
          errors.push(`Subscription ${subscription.id}: Failed to update subscription`);
          failed++;
        } else {
          processed++;
        }
      } catch (error: any) {
        console.error(`[cron/charge:${requestId}] Error processing subscription ${subscription.id}:`, error);
        errors.push(`Subscription ${subscription.id}: ${error?.message || "Unknown error"}`);
        failed++;
      }
    }

    return NextResponse.json({
      ok: true,
      processed,
      failed,
      total: subscriptions.length,
      errors: errors.length > 0 ? errors : undefined,
      requestId,
      note: processed > 0 ? "Payment records created. Actual recurring charge requires Robokassa API integration." : undefined,
    });
  } catch (error: any) {
    console.error(`[cron/charge:${requestId}] Unexpected error:`, error);
    return NextResponse.json(
      { ok: false, error: error?.message || "Internal server error", requestId },
      { status: 500 }
    );
  }
}
