/**
 * Robokassa ResultURL Webhook
 * POST /api/subscription/webhook/robokassa-result
 * 
 * Handles Robokassa payment confirmation (server-to-server)
 * Must respond with "OK" + InvId if payment valid
 */

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabaseAdmin";
import { verifyRobokassaResultSignature, parseShpParams } from "@/lib/robokassa";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const requestId = `robokassa-result-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    // Parse query params (Robokassa sends data via POST body as form data or query params)
    const url = new URL(req.url);
    const searchParams = url.searchParams;

    // Also try to parse from request body if it's form data
    let bodyParams = new URLSearchParams();
    try {
      const contentType = req.headers.get("content-type") || "";
      if (contentType.includes("application/x-www-form-urlencoded")) {
        const bodyText = await req.text();
        bodyParams = new URLSearchParams(bodyText);
      }
    } catch (e) {
      // Ignore body parsing errors
    }

    // Combine query params and body params (query params take precedence)
    const params = new URLSearchParams(searchParams);
    bodyParams.forEach((value, key) => {
      if (!params.has(key)) {
        params.set(key, value);
      }
    });

    const outSum = params.get("OutSum");
    const invId = params.get("InvId");
    const signature = params.get("SignatureValue");

    if (!outSum || !invId || !signature) {
      console.error(`[robokassa-result:${requestId}] Missing required params:`, {
        hasOutSum: !!outSum,
        hasInvId: !!invId,
        hasSignature: !!signature,
      });
      return new NextResponse("ERROR: Missing required parameters", { status: 400 });
    }

    // Parse Shp_ parameters
    const shpParams = parseShpParams(params);

    // Verify signature (pass requestId for debug logging)
    const isValid = verifyRobokassaResultSignature({
      outSum,
      invId,
      signature,
      shpParams,
      requestId,
    });

    if (!isValid) {
      console.error(`[robokassa-result:${requestId}] Invalid signature:`, {
        invId,
        outSum,
        signature: signature.substring(0, 10) + "...",
      });
      return new NextResponse("ERROR: Invalid signature", { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    // Find invoice record in robokassa_invoices table (new invoices use DB-generated IDs)
    // InvId is now a small integer (invoice.id), so we can query by id directly
    const invIdNum = Number(invId);
    let invoice = null;
    let payment = null;
    
    if (Number.isFinite(invIdNum) && invIdNum > 0) {
      // Try robokassa_invoices first (new invoices)
      const { data: invoiceData, error: invoiceError } = await supabase
        .from("robokassa_invoices")
        .select("*")
        .eq("id", invIdNum)
        .maybeSingle();
      
      if (invoiceError) {
        console.error(`[robokassa-result:${requestId}] DB error finding invoice:`, invoiceError);
      } else if (invoiceData) {
        invoice = invoiceData;
      }
    }
    
    // Fallback to payments table (old invoices with text inv_id)
    if (!invoice) {
      const { data: paymentData, error: paymentError } = await supabase
        .from("payments")
        .select("*")
        .eq("inv_id", invId)
        .maybeSingle();

      if (paymentError) {
        console.error(`[robokassa-result:${requestId}] DB error finding payment:`, paymentError);
        return new NextResponse("ERROR: Database error", { status: 500 });
      }
      
      if (paymentData) {
        payment = paymentData;
      }
    }

    if (!invoice && !payment) {
      console.error(`[robokassa-result:${requestId}] Invoice/Payment not found:`, invId);
      return new NextResponse("ERROR: Payment not found", { status: 404 });
    }

    // Check if already processed
    const currentStatus = invoice?.status || payment?.status;
    if (currentStatus === "paid") {
      console.log(`[robokassa-result:${requestId}] Payment already processed:`, invId);
      return new NextResponse(`OK${invId}`, { status: 200 });
    }

    // Update invoice/payment status to paid
    let updateError = null;
    if (invoice) {
      const result = await supabase
        .from("robokassa_invoices")
        .update({
          status: "paid",
          updated_at: new Date().toISOString(),
        })
        .eq("id", invoice.id);
      
      updateError = result.error;
      if (updateError) {
        console.error(`[robokassa-result:${requestId}] DB error updating invoice:`, updateError);
        return new NextResponse("ERROR: Failed to update invoice", { status: 500 });
      }
    } else if (payment) {
      const result = await supabase
        .from("payments")
        .update({
          status: "paid",
          updated_at: new Date().toISOString(),
        })
        .eq("id", payment.id);
      
      updateError = result.error;
      if (updateError) {
        console.error(`[robokassa-result:${requestId}] DB error updating payment:`, updateError);
        return new NextResponse("ERROR: Failed to update payment", { status: 500 });
      }
    }

    // Create or update subscription
    const userId = invoice?.user_id || payment?.user_id;
    const planCode = invoice?.plan_code || payment?.plan_code;

    // Calculate dates: 3 days from now for trial
    const now = new Date();
    const activeUntil = new Date(now);
    activeUntil.setDate(activeUntil.getDate() + 3);  // 3-day trial
    const nextChargeAt = new Date(activeUntil);  // First charge after trial ends

    // Upsert subscription
    const { data: subscription, error: subError } = await supabase
      .from("subscriptions")
      .upsert({
        user_id: userId,
        status: "trialing",
        active_until: activeUntil.toISOString(),
        next_charge_at: nextChargeAt.toISOString(),
        plan_code: planCode,
        provider: "robokassa",
        // Store provider recurring token if available in shpParams
        provider_customer_id: shpParams.customerId || null,
        provider_recurring_id: shpParams.recurringId || null,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "user_id",
      })
      .select("id")
      .single();

    if (subError) {
      console.error(`[robokassa-result:${requestId}] DB error creating subscription:`, subError);
      // Payment is already marked as paid, so we still return OK
      // Subscription can be fixed manually if needed
    } else {
      console.log(`[robokassa-result:${requestId}] Payment processed and subscription created:`, {
        userId,
        invId,
        subscriptionId: subscription?.id,
      });
    }

    // Robokassa expects "OK" + InvId
    return new NextResponse(`OK${invId}`, { status: 200 });
  } catch (error: any) {
    console.error(`[robokassa-result:${requestId}] Unexpected error:`, error);
    return new NextResponse("ERROR: Internal server error", { status: 500 });
  }
}
