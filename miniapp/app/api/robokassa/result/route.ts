import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getRobokassaConfig, verifyResultSignature } from '../../../../lib/robokassa';

export const dynamic = 'force-dynamic';

/**
 * POST /api/robokassa/result
 * 
 * STEP 6: Robokassa callback handler
 * 
 * Responsibilities:
 * - Verify signature using Password2
 * - Extract: InvoiceID, Shp_userid, RecurringID
 * - Save subscription:
 *   - status = trial
 *   - recurring_id = RecurringID
 *   - trial_end_at = now + 3 days
 *   - next_charge_at = trial_end_at
 * - Grant access to the bot
 * 
 * Robokassa sends:
 * - OutSum: payment amount
 * - InvId: InvoiceID
 * - SignatureValue: signature
 * - Shp_userId: telegram user ID (if sent)
 * - RecurringID: recurring payment ID (if Recurring=true)
 */
export async function POST(req: Request) {
  try {
    console.log('[robokassa/result] ========== PAYMENT RESULT CALLBACK ==========');

    // Parse request body (Robokassa sends form data)
    const formData = await req.formData();
    
    // Extract parameters
    const outSum = formData.get('OutSum')?.toString();
    const invId = formData.get('InvId')?.toString();
    const signature = formData.get('SignatureValue')?.toString();
    const shpUserId = formData.get('Shp_userId')?.toString();
    const recurringId = formData.get('RecurringID')?.toString();

    console.log('[robokassa/result] OutSum:', outSum);
    console.log('[robokassa/result] InvId:', invId);
    console.log('[robokassa/result] SignatureValue:', signature);
    console.log('[robokassa/result] Shp_userId:', shpUserId);
    console.log('[robokassa/result] RecurringID:', recurringId);

    // Validate required parameters
    if (!outSum || !invId || !signature) {
      console.error('[robokassa/result] ❌ Missing required parameters');
      return new NextResponse('ERROR: Missing required parameters', { status: 400 });
    }

    if (!shpUserId) {
      console.error('[robokassa/result] ❌ Shp_userId missing');
      return new NextResponse('ERROR: Shp_userId missing', { status: 400 });
    }

    const telegramUserId = Number(shpUserId);
    if (!Number.isFinite(telegramUserId) || telegramUserId <= 0) {
      console.error('[robokassa/result] ❌ Invalid Shp_userId:', shpUserId);
      return new NextResponse('ERROR: Invalid Shp_userId', { status: 400 });
    }

    // Get Robokassa config
    let config;
    try {
      config = getRobokassaConfig();
    } catch (configError: any) {
      console.error('[robokassa/result] ❌ Config error:', configError.message);
      return new NextResponse('ERROR: Configuration error', { status: 500 });
    }

    // Verify signature using Password2
    // Formula: OutSum:InvId:Password2
    const isValid = verifyResultSignature(config, outSum, invId, signature);

    if (!isValid) {
      console.error('[robokassa/result] ❌ Invalid signature');
      console.error('[robokassa/result] Expected: OutSum:InvId:Password2');
      console.error('[robokassa/result] Received signature:', signature);
      return new NextResponse('ERROR: Invalid signature', { status: 400 });
    }

    console.log('[robokassa/result] ✅ Signature verified');

    // Initialize Supabase
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Check if user exists
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, telegram_id')
      .eq('telegram_id', telegramUserId)
      .maybeSingle();

    if (userError) {
      console.error('[robokassa/result] ❌ Supabase error:', userError);
      return new NextResponse('ERROR: Database error', { status: 500 });
    }

    if (!user) {
      console.error('[robokassa/result] ❌ User not found:', telegramUserId);
      return new NextResponse('ERROR: User not found', { status: 404 });
    }

    console.log('[robokassa/result] User found, id:', user.id);

    // Check if RecurringID is present (required for recurring payments)
    if (!recurringId) {
      console.error('[robokassa/result] ❌ RecurringID missing - this is required for recurring payments');
      return new NextResponse('ERROR: RecurringID missing', { status: 400 });
    }

    // Calculate trial dates
    const now = new Date();
    const trialEndAt = new Date(now);
    trialEndAt.setDate(trialEndAt.getDate() + 3); // 3 days trial

    console.log('[robokassa/result] Trial end date:', trialEndAt.toISOString());

    // Save or update subscription
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .upsert(
        {
          telegram_user_id: telegramUserId,
          status: 'trial',
          recurring_id: recurringId,
          trial_end_at: trialEndAt.toISOString(),
          next_charge_at: trialEndAt.toISOString(), // Next charge after trial ends
          last_invoice_id: invId,
          updated_at: now.toISOString(),
        },
        {
          onConflict: 'telegram_user_id',
          ignoreDuplicates: false,
        }
      )
      .select()
      .single();

    if (subError) {
      console.error('[robokassa/result] ❌ Error saving subscription:', subError);
      return new NextResponse('ERROR: Failed to save subscription', { status: 500 });
    }

    console.log('[robokassa/result] ✅ Subscription saved');
    console.log('[robokassa/result] Subscription ID:', subscription.id);
    console.log('[robokassa/result] Status: trial');
    console.log('[robokassa/result] RecurringID:', recurringId);
    console.log('[robokassa/result] Trial end:', trialEndAt.toISOString());

    // Grant access to the bot (subscription is now active)
    console.log('[robokassa/result] ✅ Access granted to bot');

    // Return OK response to Robokassa
    // Format: OK{InvId}
    const response = `OK${invId}`;
    console.log('[robokassa/result] Response to Robokassa:', response);
    console.log('[robokassa/result] ========== SUCCESS ==========');

    return new NextResponse(response, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
      },
    });
  } catch (error: any) {
    console.error('[robokassa/result] ❌ CRITICAL ERROR:', error);
    console.error('[robokassa/result] Error stack:', error.stack);

    return new NextResponse('ERROR: Internal server error', { status: 500 });
  }
}

// Also support GET for compatibility
export async function GET(req: Request) {
  console.log('[robokassa/result] GET request received, redirecting to POST handler');
  return POST(req);
}

