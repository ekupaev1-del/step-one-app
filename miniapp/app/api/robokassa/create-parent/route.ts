import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createParentRecurringPaymentForm, generateSafeInvoiceId } from '../../../../lib/robokassa';
import { getRobokassaConfig } from '../../../../lib/robokassaConfig';

export const dynamic = 'force-dynamic';

/**
 * Generate unique InvoiceID with DB collision check
 * Returns string (digits only)
 */
async function generateUniqueInvoiceId(
  supabase: any,
  maxAttempts: number = 5
): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const invoiceId = generateSafeInvoiceId();
    
    // Check if invoiceId already exists
    const { data: existing } = await supabase
      .from('payments')
      .select('inv_id')
      .eq('inv_id', invoiceId)
      .maybeSingle();
    
    if (!existing) {
      return invoiceId;
    }
    
    console.warn(`[robokassa/create-parent] InvoiceID collision: ${invoiceId}, retrying...`);
  }
  
  throw new Error('Failed to generate unique InvoiceID after multiple attempts');
}

/**
 * POST /api/robokassa/create-parent?telegramUserId=...
 * 
 * Creates parent recurring payment (1 RUB) for card binding
 * Per Robokassa docs: POST to Index.aspx with Recurring=true
 * 
 * Returns: { ok: true, html, debug } or { ok: false, stage, message, debug }
 */
export async function POST(req: Request) {
  const debug: any = {
    timestamp: new Date().toISOString(),
    stage: 'start',
  };

  try {
    console.log('[robokassa/create-parent] ========== CREATE PARENT RECURRING PAYMENT ==========');

    const url = new URL(req.url);
    const telegramUserIdParam = url.searchParams.get('telegramUserId');

    if (!telegramUserIdParam) {
      return NextResponse.json({
        ok: false,
        stage: 'validate_input',
        message: 'telegramUserId is required in query string',
        debug,
      }, { status: 400 });
    }

    const telegramUserId = Number(telegramUserIdParam);
    if (!Number.isFinite(telegramUserId) || telegramUserId <= 0) {
      return NextResponse.json({
        ok: false,
        stage: 'validate_input',
        message: 'telegramUserId must be a positive number',
        debug,
      }, { status: 400 });
    }

    debug.telegramUserId = telegramUserId;
    debug.stage = 'check_user';

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
      console.error('[robokassa/create-parent] ❌ Supabase error:', userError);
      return NextResponse.json({
        ok: false,
        stage: 'check_user',
        message: 'Database error',
        debug,
      }, { status: 500 });
    }

    if (!user) {
      return NextResponse.json({
        ok: false,
        stage: 'check_user',
        message: 'User not found. Please use /start in bot first.',
        debug,
      }, { status: 404 });
    }

    debug.userId = user.id;
    debug.stage = 'get_config';

    // Get Robokassa config
    const config = getRobokassaConfig();
    debug.merchantLogin = config.merchantLogin;
    debug.isTest = config.isTest;

    debug.stage = 'generate_invoice_id';

    // Generate unique InvoiceID
    let invoiceId: string;
    try {
      invoiceId = await generateUniqueInvoiceId(supabase);
      debug.invoiceId = invoiceId;
      console.log('[robokassa/create-parent] Generated InvoiceID:', invoiceId);
    } catch (invoiceIdError: any) {
      console.error('[robokassa/create-parent] ❌ InvoiceID generation error:', invoiceIdError.message);
      return NextResponse.json({
        ok: false,
        stage: 'generate_invoice_id',
        message: 'Failed to generate unique payment ID',
        debug,
      }, { status: 500 });
    }

    // Parent payment: 1.00 RUB with Recurring=true
    const outSum = '1.00';
    const description = 'Step One — trial 3 days';

    debug.outSum = outSum;
    debug.description = description;
    debug.stage = 'generate_form';

    // Create parent recurring payment form
    let formResult;
    try {
      formResult = createParentRecurringPaymentForm(
        config,
        invoiceId,
        outSum,
        description,
        telegramUserId
      );
    } catch (formError: any) {
      console.error('[robokassa/create-parent] ❌ Form generation error:', formError.message);
      return NextResponse.json({
        ok: false,
        stage: 'generate_form',
        message: 'Payment form generation failed',
        error: formError.message,
        debug,
      }, { status: 400 });
    }

    // Store parent invoice ID in subscriptions table (non-blocking)
    debug.stage = 'store_subscription';
    try {
      // Check if subscription already exists
      const { data: existingSubscription } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('telegram_user_id', telegramUserId)
        .maybeSingle();

      if (existingSubscription) {
        // Update existing subscription
        const updateData: any = {
          parent_invoice_id: Number(invoiceId),
          updated_at: new Date().toISOString(),
        };
        
        // Only update status if it's not already set
        if (!existingSubscription.status || existingSubscription.status === 'trial') {
          updateData.status = 'trial';
        }
        
        const { error: updateError } = await supabase
          .from('subscriptions')
          .update(updateData)
          .eq('telegram_user_id', telegramUserId);

        if (updateError) {
          console.warn('[robokassa/create-parent] ⚠️ Subscription update failed:', updateError);
          debug.subscriptionUpdateError = updateError;
        } else {
          console.log('[robokassa/create-parent] ✅ Subscription updated with parent_invoice_id');
        }
      } else {
        // Create new subscription
        const insertData: any = {
          telegram_user_id: telegramUserId,
          user_id: user.id,
          parent_invoice_id: Number(invoiceId),
          status: 'trial',
          plan_type: 'trial',
          started_at: null, // Will be set after payment confirmation
          expires_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days from now
          trial_ends_at: null, // Will be set after payment confirmation
        };
        
        const { error: insertError } = await supabase
          .from('subscriptions')
          .insert(insertData);

        if (insertError) {
          console.warn('[robokassa/create-parent] ⚠️ Subscription insert failed:', insertError);
          debug.subscriptionInsertError = insertError;
        } else {
          console.log('[robokassa/create-parent] ✅ Subscription created with parent_invoice_id');
        }
      }
    } catch (dbError: any) {
      console.warn('[robokassa/create-parent] ⚠️ Subscription DB exception:', dbError.message);
      debug.subscriptionDbError = dbError.message;
    }

    // Store payment attempt in payments table (non-blocking)
    try {
      const { error: insertError } = await supabase
        .from('payments')
        .insert({
          user_id: user.id,
          telegram_user_id: telegramUserId,
          inv_id: invoiceId,
          invoice_id: invoiceId,
          amount: parseFloat(outSum),
          out_sum: parseFloat(outSum),
          mode: 'recurring',
          status: 'trial_pending_payment',
          description: description,
        });

      if (insertError) {
        console.warn('[robokassa/create-parent] ⚠️ Payment insert failed:', insertError);
        debug.paymentInsertError = insertError;
      } else {
        console.log('[robokassa/create-parent] ✅ Payment stored in DB');
      }
    } catch (dbError: any) {
      console.warn('[robokassa/create-parent] ⚠️ Payment DB exception:', dbError.message);
      debug.paymentDbError = dbError.message;
    }

    debug.stage = 'success';

    return NextResponse.json({
      ok: true,
      html: formResult.html,
      debug: formResult.debug,
    });

  } catch (error: any) {
    console.error('[robokassa/create-parent] ❌ CRITICAL ERROR:', error);
    console.error('[robokassa/create-parent] Error stack:', error.stack);

    debug.stage = 'critical_error';
    debug.error = error.message;
    debug.errorStack = error.stack;

    return NextResponse.json({
      ok: false,
      stage: 'critical_error',
      message: error.message || 'Internal server error',
      debug,
    }, { status: 500 });
  }
}

