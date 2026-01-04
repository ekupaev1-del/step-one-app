import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  getRobokassaConfig,
  generateRecurringForm,
  generateSafeInvId,
} from '../../../../lib/robokassa';

export const dynamic = 'force-dynamic';

/**
 * Generate unique InvoiceID with DB collision check
 */
async function generateUniqueInvoiceId(
  supabase: any,
  maxAttempts: number = 5
): Promise<number> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const invoiceId = generateSafeInvId();
    
    // Check if invoiceId already exists
    const { data: existing } = await supabase
      .from('payments')
      .select('inv_id')
      .eq('inv_id', invoiceId)
      .maybeSingle();
    
    if (!existing) {
      return invoiceId;
    }
    
    console.warn(`[robokassa/create-monthly] InvoiceID collision detected: ${invoiceId}, retrying...`);
  }
  
  throw new Error('Failed to generate unique InvoiceID after multiple attempts');
}

/**
 * POST /api/robokassa/create-monthly?telegramUserId=...
 * 
 * Creates a child recurring payment (199 RUB monthly charge)
 * Uses PreviousInvoiceID from parent payment (1 RUB trial)
 */
export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const telegramUserIdParam = url.searchParams.get('telegramUserId');

    if (!telegramUserIdParam) {
      return NextResponse.json({
        ok: false,
        message: 'telegramUserId is required in query string',
      }, { status: 400 });
    }

    const telegramUserId = Number(telegramUserIdParam);
    if (!Number.isFinite(telegramUserId) || telegramUserId <= 0) {
      return NextResponse.json({
        ok: false,
        message: 'telegramUserId must be a positive number',
      }, { status: 400 });
    }

    // Initialize Supabase
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Find user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, telegram_id')
      .eq('telegram_id', telegramUserId)
      .maybeSingle();

    if (userError || !user) {
      return NextResponse.json({
        ok: false,
        message: 'User not found. Please use /start in bot first.',
      }, { status: 404 });
    }

    // Find parent payment (trial payment with Recurring=true, status='paid')
    // Parent payment should have amount=1.00 and no parent_invoice_id
    const { data: parentPayment, error: parentError } = await supabase
      .from('payments')
      .select('inv_id, amount, status, mode')
      .eq('telegram_user_id', telegramUserId)
      .eq('status', 'paid')
      .is('parent_invoice_id', null)
      .eq('amount', 1.00)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (parentError) {
      console.error('[robokassa/create-monthly] Error finding parent payment:', parentError);
      return NextResponse.json({
        ok: false,
        message: 'Database error',
      }, { status: 500 });
    }

    if (!parentPayment) {
      return NextResponse.json({
        ok: false,
        message: 'Parent payment not found. Please complete trial payment first.',
      }, { status: 404 });
    }

    const parentInvoiceId = parentPayment.inv_id;
    console.log('[robokassa/create-monthly] Parent invoice ID:', parentInvoiceId);

    // Get Robokassa config
    const config = getRobokassaConfig();

    // Generate unique child InvoiceID
    const childInvoiceId = await generateUniqueInvoiceId(supabase);
    console.log('[robokassa/create-monthly] Child invoice ID:', childInvoiceId);

    // Payment amount: 199.00 (monthly subscription)
    const outSum = '199.00';
    const description = 'Monthly subscription';

    // Store child payment in DB
    const { error: insertError } = await supabase
      .from('payments')
      .insert({
        user_id: user.id,
        telegram_user_id: telegramUserId,
        inv_id: childInvoiceId,
        invoice_id: String(childInvoiceId),
        amount: parseFloat(outSum),
        out_sum: parseFloat(outSum),
        mode: 'recurring',
        status: 'created',
        description: description,
        parent_invoice_id: parentInvoiceId,
      });

    if (insertError) {
      console.error('[robokassa/create-monthly] Error storing payment:', insertError);
      // Continue anyway - payment form will still be generated
    }

    // Generate HTML form for Recurring endpoint
    const html = generateRecurringForm(
      config,
      outSum,
      childInvoiceId,
      parentInvoiceId,
      description,
      true // auto-submit
    );

    return NextResponse.json({
      ok: true,
      html,
      invoiceId: childInvoiceId,
      previousInvoiceId: parentInvoiceId,
    });

  } catch (error: any) {
    console.error('[robokassa/create-monthly] Error:', error);
    return NextResponse.json({
      ok: false,
      message: error.message || 'Internal server error',
    }, { status: 500 });
  }
}

