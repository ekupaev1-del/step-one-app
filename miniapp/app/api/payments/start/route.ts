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
import { generateRobokassaUrl } from "../../../../lib/robokassa";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const requestId = Date.now().toString();
  const startTime = Date.now();
  
  try {
    let body: any;
    try {
      body = await req.json();
    } catch (parseError: any) {
      console.error(`[payments/start:${requestId}] CREATE_PAYMENT_ERROR`, { 
        errorMessage: "Invalid JSON body",
        error: parseError.message 
      });
      return NextResponse.json(
        { 
          ok: false, 
          error: "Invalid request body", 
          details: "Expected JSON",
          debug: { requestId, timestamp: new Date().toISOString() }
        },
        { status: 400 }
      );
    }
    
    const userId = body.userId;
    const planCode = body.plan || "trial_3d_199"; // Default plan
    const amount = "1.00"; // 1 RUB for trial
    const isTest = process.env.ROBOKASSA_TEST_MODE === "true" || process.env.ROBOKASSA_TEST_MODE === "1";
    const recurring = false; // Recurring is configured in merchant settings, not in URL
    
    // Check for debug mode
    const url = new URL(req.url);
    const debugMode = url.searchParams.get("debug") === "1" || req.headers.get("x-debug") === "1" || process.env.NODE_ENV !== "production";
    
    console.log(`[payments/start:${requestId}] CREATE_PAYMENT_START`, {
      userId,
      outSum: amount,
      recurring,
      isTest,
      timestamp: new Date().toISOString()
    });

    if (!userId) {
      console.error(`[payments/start:${requestId}] CREATE_PAYMENT_ERROR`, {
        errorMessage: "Missing userId"
      });
      return NextResponse.json(
        { 
          ok: false, 
          error: "userId is required", 
          details: "userId must be provided in request body",
          debug: { requestId, timestamp: new Date().toISOString() }
        },
        { status: 400 }
      );
    }

    const numericUserId = Number(userId);
    if (!Number.isFinite(numericUserId) || numericUserId <= 0) {
      console.error(`[payments/start:${requestId}] CREATE_PAYMENT_ERROR`, {
        errorMessage: "Invalid userId",
        received: userId
      });
      return NextResponse.json(
        { 
          ok: false, 
          error: "userId must be a positive number", 
          details: `Received: ${userId}`,
          debug: { requestId, timestamp: new Date().toISOString() }
        },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();
    
    // Verify user exists (with timeout protection)
    try {
      const { data: user, error: userError } = await supabase
        .from("users")
        .select("id")
        .eq("id", numericUserId)
        .maybeSingle();
      
      if (userError) {
        console.error(`[payments/start:${requestId}] CREATE_PAYMENT_ERROR`, {
          errorMessage: "Supabase error",
          error: userError.message
        });
        return NextResponse.json(
          { 
            ok: false, 
            error: "Database error", 
            details: userError.message,
            debug: { requestId, timestamp: new Date().toISOString() }
          },
          { status: 500 }
        );
      }
      
      if (!user) {
        console.error(`[payments/start:${requestId}] CREATE_PAYMENT_ERROR`, {
          errorMessage: "User not found",
          userId: numericUserId
        });
        return NextResponse.json(
          { 
            ok: false, 
            error: "User not found", 
            details: `User with id ${numericUserId} does not exist`,
            debug: { requestId, timestamp: new Date().toISOString() }
          },
          { status: 404 }
        );
      }
    } catch (dbError: any) {
      console.error(`[payments/start:${requestId}] CREATE_PAYMENT_ERROR`, {
        errorMessage: "Database query error",
        error: dbError.message
      });
      return NextResponse.json(
        { 
          ok: false, 
          error: "Database connection error", 
          details: dbError.message,
          debug: { requestId, timestamp: new Date().toISOString() }
        },
        { status: 500 }
      );
    }

    // Create payment record in database to get auto-generated ID
    const description = "Пробный период 3 дня";
    
    const { data: paymentRecord, error: insertError } = await supabase
      .from("payments")
      .insert({
        user_id: numericUserId,
        plan_code: planCode,
        amount: parseFloat(amount),
        currency: "RUB",
        status: "created",
      })
      .select("id")
      .single();

    if (insertError || !paymentRecord) {
      console.error(`[payments/start:${requestId}] CREATE_PAYMENT_ERROR`, {
        errorMessage: "Failed to create payment record",
        error: insertError?.message || "No payment record returned"
      });
      return NextResponse.json(
        { 
          ok: false, 
          error: "Failed to create payment record", 
          details: insertError?.message || "Database insert failed",
          debug: { requestId, timestamp: new Date().toISOString() }
        },
        { status: 500 }
      );
    }

    // Use database-generated ID as InvId (must be within Robokassa limits)
    const invId = paymentRecord.id.toString();
    
    // Validate InvId is reasonable (Robokassa typically accepts up to 2,147,483,647 for bigint)
    if (paymentRecord.id > 2147483647) {
      console.warn(`[payments/start:${requestId}] WARNING: InvId ${paymentRecord.id} exceeds typical Robokassa limits`);
    }

    console.log(`[payments/start:${requestId}] Created payment record with InvId:`, invId);

    // Calculate trial end date (now + 3 days)
    const trialEndAt = new Date();
    trialEndAt.setDate(trialEndAt.getDate() + 3);

    // Update user subscription status
    const { error: updateError } = await supabase
      .from("users")
      .update({
        subscription_status: "trial",
        trial_end_at: trialEndAt.toISOString(),
        robokassa_parent_invoice_id: invId,
      })
      .eq("id", numericUserId);

    if (updateError) {
      console.error(`[payments/start:${requestId}] CREATE_PAYMENT_ERROR`, {
        errorMessage: "Database update error",
        error: updateError.message
      });
      // Don't fail the payment creation, just log the error
      console.warn(`[payments/start:${requestId}] User subscription update failed, but payment record created`);
    }

    // Generate Robokassa payment URL with debug info
    const result = generateRobokassaUrl(
      amount,
      invId,
      description,
      userId.toString(),
      isTest,
      debugMode // includeDebug based on debug mode
    );

    const paymentUrl = typeof result === "string" ? result : result.paymentUrl;
    const debug = typeof result === "string" ? undefined : result.debug;

    if (!paymentUrl || typeof paymentUrl !== "string" || !paymentUrl.startsWith("https://")) {
      console.error(`[payments/start:${requestId}] CREATE_PAYMENT_ERROR`, {
        errorMessage: "Invalid payment URL generated",
        urlType: typeof paymentUrl,
        urlPrefix: paymentUrl?.substring(0, 20)
      });
      return NextResponse.json(
        { 
          ok: false, 
          error: "Failed to generate payment URL", 
          details: "Generated URL is invalid",
          debug: debugMode ? { requestId, timestamp: new Date().toISOString() } : undefined
        },
        { status: 500 }
      );
    }

    // Update payment record with Robokassa details
    const { error: updatePaymentError } = await supabase
      .from("payments")
      .update({
        robokassa_invoice_id: paymentRecord.id,
        payment_url: paymentUrl,
        signature: debug?.signatureValue || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", paymentRecord.id);

    if (updatePaymentError) {
      console.warn(`[payments/start:${requestId}] Failed to update payment record with URL:`, updatePaymentError.message);
    }

    // Log signature information
    if (debug) {
      console.log(`[payments/start:${requestId}] CREATE_PAYMENT_SIGNATURE`, {
        signatureString: debug.signatureStringMasked,
        signatureHash: debug.signatureValue?.substring(0, 8) + "...",
        signatureChecks: debug.signatureChecks
      });
    }

    const elapsed = Date.now() - startTime;
    console.log(`[payments/start:${requestId}] CREATE_PAYMENT_OK InvId=${invId} status=created elapsed=${elapsed}ms`);

    // Build response
    const response: any = {
      ok: true,
      paymentUrl,
      invoiceId: invId,
      amount,
    };

    // Include debug info only in debug mode
    if (debugMode && debug) {
      response.debug = {
        robokassa: {
          ...debug,
          urlLength: paymentUrl.length,
        },
      };
    }

    return NextResponse.json(response);
  } catch (error: any) {
    const elapsed = Date.now() - startTime;
    console.error(`[payments/start:${requestId}] CREATE_PAYMENT_ERROR`, { 
      errorMessage: error.message || "Internal server error",
      error: error.stack?.substring(0, 200),
      elapsed: `${elapsed}ms`
    });
    return NextResponse.json(
      { 
        ok: false, 
        error: error.message || "Internal server error", 
        details: error.stack?.substring(0, 200),
        debug: { requestId, timestamp: new Date().toISOString() }
      },
      { status: 500 }
    );
  }
}
