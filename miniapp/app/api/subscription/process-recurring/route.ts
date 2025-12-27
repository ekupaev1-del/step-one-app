import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createRecurringPayment } from '../../../../lib/robokassaRecurring';

export const dynamic = 'force-dynamic';

/**
 * POST /api/subscription/process-recurring
 * 
 * STEP 7: Cron/worker endpoint for recurring charges
 * 
 * This endpoint should be called periodically (hourly or daily) to:
 * 1. Find subscriptions where status = 'trial' and now >= trial_end_at → charge 199 RUB
 * 2. Find subscriptions where status = 'active' and now >= next_charge_at → charge 199 RUB
 * 
 * Recurring charge rules:
 * - Use Robokassa RecurringPayment API
 * - Use RecurringID (from first payment)
 * - New unique InvoiceID
 * - OutSum = "199.000000"
 * - NO Receipt
 * - NO Recurring flag
 * 
 * On success:
 * - status = 'active'
 * - next_charge_at += 30 days
 * 
 * On failure:
 * - status = 'expired'
 * - Revoke access
 * 
 * Security: Add secret token check in production
 */
export async function POST(req: Request) {
  try {
    console.log('[subscription/process-recurring] ========== PROCESS RECURRING CHARGES ==========');

    // Optional: Check secret token for security
    const authHeader = req.headers.get('authorization');
    const secretToken = process.env.RECURRING_CRON_SECRET;
    
    if (secretToken && authHeader !== `Bearer ${secretToken}`) {
      console.error('[subscription/process-recurring] ❌ Unauthorized');
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Initialize Supabase
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const now = new Date();
    const nowISO = now.toISOString();

    // Find subscriptions that need charging
    // 1. Trial subscriptions that expired
    const { data: expiredTrials, error: trialsError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('status', 'trial')
      .lte('trial_end_at', nowISO)
      .not('recurring_id', 'is', null);

    if (trialsError) {
      console.error('[subscription/process-recurring] ❌ Error fetching expired trials:', trialsError);
    } else {
      console.log('[subscription/process-recurring] Found expired trials:', expiredTrials?.length || 0);
    }

    // 2. Active subscriptions that need renewal
    const { data: activeRenewals, error: activeError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('status', 'active')
      .lte('next_charge_at', nowISO)
      .not('recurring_id', 'is', null);

    if (activeError) {
      console.error('[subscription/process-recurring] ❌ Error fetching active renewals:', activeError);
    } else {
      console.log('[subscription/process-recurring] Found active renewals:', activeRenewals?.length || 0);
    }

    const subscriptionsToCharge = [
      ...(expiredTrials || []),
      ...(activeRenewals || []),
    ];

    console.log('[subscription/process-recurring] Total subscriptions to charge:', subscriptionsToCharge.length);

    const results = {
      processed: 0,
      success: 0,
      failed: 0,
      errors: [] as string[],
    };

    // Process each subscription
    for (const subscription of subscriptionsToCharge) {
      try {
        console.log('[subscription/process-recurring] Processing subscription:', subscription.id);
        console.log('[subscription/process-recurring] Telegram User ID:', subscription.telegram_user_id);
        console.log('[subscription/process-recurring] RecurringID:', subscription.recurring_id);
        console.log('[subscription/process-recurring] Current status:', subscription.status);

        if (!subscription.recurring_id) {
          console.error('[subscription/process-recurring] ❌ RecurringID missing for subscription:', subscription.id);
          results.errors.push(`Subscription ${subscription.id}: RecurringID missing`);
          continue;
        }

        // Generate unique InvoiceID
        const timestamp = Date.now();
        const random = Math.floor(Math.random() * 1000000);
        const invoiceId = `${timestamp}${random}`;

        console.log('[subscription/process-recurring] Generated InvoiceID:', invoiceId);

        // Create recurring payment
        const paymentResult = await createRecurringPayment(
          subscription.recurring_id,
          invoiceId,
          199.0, // 199 RUB
          'Step One subscription - Monthly payment'
        );

        if (!paymentResult.success) {
          console.error('[subscription/process-recurring] ❌ Payment failed:', paymentResult.error);
          
          // Update subscription status to expired
          await supabase
            .from('subscriptions')
            .update({
              status: 'expired',
              updated_at: nowISO,
            })
            .eq('id', subscription.id);

          results.failed++;
          results.errors.push(`Subscription ${subscription.id}: ${paymentResult.error}`);
          continue;
        }

        console.log('[subscription/process-recurring] ✅ Payment successful');

        // Calculate next charge date (30 days from now)
        const nextChargeAt = new Date(now);
        nextChargeAt.setDate(nextChargeAt.getDate() + 30);

        // Update subscription
        const { error: updateError } = await supabase
          .from('subscriptions')
          .update({
            status: 'active',
            next_charge_at: nextChargeAt.toISOString(),
            last_invoice_id: invoiceId,
            updated_at: nowISO,
          })
          .eq('id', subscription.id);

        if (updateError) {
          console.error('[subscription/process-recurring] ❌ Error updating subscription:', updateError);
          results.errors.push(`Subscription ${subscription.id}: Update failed`);
        } else {
          console.log('[subscription/process-recurring] ✅ Subscription updated');
          console.log('[subscription/process-recurring] Next charge at:', nextChargeAt.toISOString());
          results.success++;
        }

        results.processed++;
      } catch (error: any) {
        console.error('[subscription/process-recurring] ❌ Error processing subscription:', error);
        results.errors.push(`Subscription ${subscription.id}: ${error.message}`);
        results.failed++;
      }
    }

    console.log('[subscription/process-recurring] ========== SUMMARY ==========');
    console.log('[subscription/process-recurring] Processed:', results.processed);
    console.log('[subscription/process-recurring] Success:', results.success);
    console.log('[subscription/process-recurring] Failed:', results.failed);

    return NextResponse.json({
      ok: true,
      ...results,
    });
  } catch (error: any) {
    console.error('[subscription/process-recurring] ❌ CRITICAL ERROR:', error);
    console.error('[subscription/process-recurring] Error stack:', error.stack);

    return NextResponse.json(
      {
        ok: false,
        error: error.message || 'Internal server error',
      },
      { status: 500 }
    );
  }
}

