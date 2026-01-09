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
    const amount = "1.00"; // 1 RUB for trial
    const isTest = false; // Production mode
    const recurring = false; // Recurring is configured in merchant settings, not in URL
    
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

    // Generate invoice ID
    const invId = generateInvoiceId();
    const description = "Пробный период 3 дня";

    // Calculate trial end date (now + 3 days)
    const trialEndAt = new Date();
    trialEndAt.setDate(trialEndAt.getDate() + 3);

    console.log(`[payments/start:${requestId}] Trial end date:`, trialEndAt.toISOString());

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
      console.error(`[payments/start:${requestId}] CREATE_PAYMENT_ERROR`, {
        errorMessage: "Database update error",
        error: updateError.message
      });
      return NextResponse.json(
        { 
          ok: false, 
          error: "Failed to update user subscription", 
          details: updateError.message,
          debug: { requestId, timestamp: new Date().toISOString() }
        },
        { status: 500 }
      );
    }

    // Generate Robokassa payment URL with debug info
    const result = generateRobokassaUrl(
      amount,
      invId,
      description,
      userId.toString(),
      isTest,
      true // includeDebug
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
          debug: { requestId, timestamp: new Date().toISOString() }
        },
        { status: 500 }
      );
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
    console.log(`[payments/start:${requestId}] CREATE_PAYMENT_OK`, { 
      invId, 
      outSum: amount,
      recurring,
      isTest,
      elapsed: `${elapsed}ms`
    });
    console.log(`[payments/start:${requestId}] CREATE_PAYMENT_URL`, {
      url: paymentUrl.substring(0, 120) + "...",
      urlLength: paymentUrl.length
    });

    return NextResponse.json({
      ok: true,
      paymentUrl,
      invoiceId: invId,
      amount,
      debug: debug ? { robokassa: debug } : undefined,
    });
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
