/**
 * Create Payment Endpoint
 * POST /api/subscription/create-payment
 * 
 * Creates payment record and returns Robokassa payment URL
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabaseAdmin";
import { resolveUserIdFromRequest } from "@/lib/resolveUserIdFromRequest";
import { buildRobokassaPaymentUrl, getRobokassaConfig } from "@/lib/robokassa";

export const dynamic = "force-dynamic";

interface CreatePaymentRequest {
  method: "card" | "sbp";
  planCode: string;
  returnPath?: string;
  userId?: number;
  id?: number;
}

// Helper to check if debug should be included
function shouldIncludeDebug(req: NextRequest): boolean {
  // Check env flag
  if (process.env.DEBUG_PAYMENTS === "true" || process.env.NODE_ENV !== "production") {
    return true;
  }
  
  // Check DEBUG_KEY query param (for production debugging)
  const url = new URL(req.url);
  const debugKey = url.searchParams.get("debugKey");
  const expectedKey = process.env.DEBUG_KEY;
  
  if (debugKey && expectedKey && debugKey === expectedKey) {
    return true;
  }
  
  return false;
}

export async function POST(req: NextRequest) {
  const requestId = `create-payment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    // Check Robokassa config
    const config = getRobokassaConfig();
    const debugWarnings: string[] = [];
    
    if (!config) {
      console.error(`[subscription/create-payment:${requestId}] Robokassa not configured`);
      const missingVars: string[] = [];
      if (!process.env.ROBOKASSA_MERCHANT_LOGIN) missingVars.push("ROBOKASSA_MERCHANT_LOGIN");
      if (!process.env.ROBOKASSA_PASSWORD1) missingVars.push("ROBOKASSA_PASSWORD1");
      if (!process.env.ROBOKASSA_PASSWORD2) missingVars.push("ROBOKASSA_PASSWORD2");
      
      const response: any = {
        ok: false,
        error: "Платежный провайдер не настроен",
        code: "ROBOKASSA_CONFIG_MISSING",
        requestId,
      };

      if (shouldIncludeDebug(req)) {
        response.debug = {
          missingEnvVars: missingVars,
          hasRobokassaMerchantLogin: !!process.env.ROBOKASSA_MERCHANT_LOGIN,
          hasRobokassaPassword1: !!process.env.ROBOKASSA_PASSWORD1,
          hasRobokassaPassword2: !!process.env.ROBOKASSA_PASSWORD2,
        };
      }

      return NextResponse.json(response, { status: 500 });
    }

    // Test/prod mismatch detection
    if (process.env.NODE_ENV === "production" && config.testMode) {
      debugWarnings.push("WARNING: NODE_ENV=production but ROBOKASSA_TEST_MODE=true - payment will use test mode");
    }

    // Parse request body first (can only be read once)
    let body: CreatePaymentRequest = {} as CreatePaymentRequest;
    let bodyText = "";
    let bodyPreview = "";
    try {
      bodyText = await req.text();
      bodyPreview = bodyText.substring(0, 500);
      if (bodyText) {
        body = JSON.parse(bodyText);
      }
    } catch (e) {
      // Body might be empty or not JSON - that's ok, continue without body
    }

    // Resolve userId with full diagnostics (pass parsed body to avoid double reading)
    const userIdResolution = await resolveUserIdFromRequest(req, body);
    const userId = userIdResolution.userId;

    // Collect query params for debug
    const url = new URL(req.url);
    const queryParams: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
      queryParams[key] = value;
    });

    // Collect safe headers for debug
    const headersSubset: Record<string, string> = {};
    const safeHeaders = ["content-type", "user-agent", "accept", "accept-language"];
    safeHeaders.forEach((headerName) => {
      const value = req.headers.get(headerName);
      if (value) {
        headersSubset[headerName] = value;
      }
    });

    if (!userId) {
      const response: any = {
        ok: false,
        error: "userId is required",
        code: "USER_ID_MISSING",
        requestId,
        timestamp: new Date().toISOString(),
      };

      // Include debug info only when DEBUG_PAYMENTS=true or not production
      if (shouldIncludeDebug(req)) {
        response.debug = {
          queryParams,
          bodyPreview,
          parsedBody: body && typeof body === "object" ? Object.keys(body) : null,
          parsedBodyKeys: body && typeof body === "object" ? Object.keys(body) : [],
          bodyHasUserId: body?.userId !== undefined,
          bodyHasId: body?.id !== undefined,
          userIdResolution,
          headersSubset,
        };
      }

      return NextResponse.json(response, { status: 400 });
    }

    const { method, planCode, returnPath = "/subscription" } = body;

    // Validate method
    if (method !== "card" && method !== "sbp") {
      return NextResponse.json(
        { 
          ok: false, 
          error: "method must be 'card' or 'sbp'",
          requestId 
        },
        { status: 400 }
      );
    }

    // Validate planCode
    if (!planCode || planCode !== "trial_3d_then_199") {
      return NextResponse.json(
        { 
          ok: false, 
          error: "Invalid planCode. Only 'trial_3d_then_199' is supported",
          requestId 
        },
        { status: 400 }
      );
    }

    // Determine amount based on plan
    // First payment: 1 RUB for 3-day trial
    const amount = "1.00";
    const description = `Подписка: Первые 3 дня за 1 ₽, далее 199 ₽/мес`;

    // Generate unique invoice ID - MUST be numeric (Robokassa requirement)
    // Use Date.now() which returns a number (milliseconds since epoch)
    // This ensures InvId is ALWAYS a pure integer, no hyphens or letters
    const invId = Date.now().toString(); // Pure numeric string, e.g., "1768658664801"
    
    // Store requestId separately in Shp_requestId for tracking (not in InvId)
    // requestId can contain hyphens/letters for uniqueness, but InvId must be numeric
    const orderToken = requestId; // Use requestId as order token

    const supabase = createServerSupabaseClient();

    // Create payment record
    const paymentRecord = {
      user_id: userId,
      provider: "robokassa",
      inv_id: invId,
      method,
      plan_code: planCode,
      amount: Number(amount),
      currency: "RUB",
      status: "created",
      out_sum: Number(amount),  // Important: out_sum must match amount
      provider_payload: {
        returnPath,
        testMode: config.testMode,
      },
    };

    const { data: payment, error: insertError } = await supabase
      .from("payments")
      .insert(paymentRecord)
      .select("id, inv_id")
      .single();

    if (insertError) {
      console.error(`[subscription/create-payment:${requestId}] DB insert error:`, insertError);
      const response: any = {
        ok: false,
        error: "Ошибка создания платежа",
        code: "DATABASE_ERROR",
        requestId,
      };

      if (shouldIncludeDebug(req)) {
        response.debug = {
          databaseError: {
            message: insertError.message,
            code: insertError.code,
            hint: insertError.hint,
          },
        };
      }

      return NextResponse.json(response, { status: 500 });
    }

    // Build Robokassa payment URL (pass requestId for debug logging)
    // Include orderToken in Shp params for tracking (not in InvId)
    const paymentUrlResult = buildRobokassaPaymentUrl({
      invId,
      outSum: amount,
      description,
      userId,
      planCode,
      method,
      returnPath,
      orderToken, // Store in Shp_requestId for tracking
    }, requestId);

    if (!paymentUrlResult) {
      console.error(`[subscription/create-payment:${requestId}] Failed to build payment URL`);
      const response: any = {
        ok: false,
        error: "Ошибка создания платежной ссылки",
        code: "PAYMENT_URL_BUILD_ERROR",
        requestId,
      };

      if (shouldIncludeDebug(req)) {
        response.debug = {
          message: "Failed to build payment URL",
          configPresent: !!config,
        };
      }

      return NextResponse.json(response, { status: 500 });
    }

    // Update payment record with payment_url
    await supabase
      .from("payments")
      .update({ payment_url: paymentUrlResult.url })
      .eq("id", payment.id);

    console.log(`[subscription/create-payment:${requestId}] Payment created:`, {
      userId,
      invId,
      method,
      planCode,
      amount,
    });

    const successResponse: any = {
      ok: true,
      invId,
      paymentUrl: paymentUrlResult.url,
      requestId,
      timestamp: new Date().toISOString(),
    };

    // Include comprehensive debug echo when debug enabled
    if (shouldIncludeDebug(req)) {
      const robokassaDebug = paymentUrlResult.debug;
      successResponse.debug = {
        requestId,
        env: {
          nodeEnv: process.env.NODE_ENV,
          debugPayments: process.env.DEBUG_PAYMENTS === "true",
        },
        merchantLogin: robokassaDebug?.mrchLogin,
        outSumRaw: robokassaDebug?.outSumRaw,
        outSumFormatted: robokassaDebug?.outSumFormatted,
        invId: robokassaDebug?.invId, // Should be numeric
        descriptionRaw: robokassaDebug?.descriptionRaw,
        descriptionEncodedOnce: robokassaDebug?.descriptionEncoded,
        shpParams: robokassaDebug?.shpParams,
        signatureBaseString: robokassaDebug?.signatureBaseString, // Password masked as <PASSWORD1>
        signatureMasked: robokassaDebug?.signatureMasked,
        finalPaymentUrl: robokassaDebug?.finalPaymentUrlMasked, // Masked for safety
        sanityChecklist: robokassaDebug?.sanityChecklist || {},
        // Additional context
        queryParams,
        bodyPreview,
        parsedBodyKeys: body && typeof body === "object" ? Object.keys(body) : [],
        bodyHasUserId: body?.userId !== undefined,
        bodyHasId: body?.id !== undefined,
        userIdResolution,
        headersSubset,
        resolvedUserId: userId,
        debugWarnings: debugWarnings.length > 0 ? debugWarnings : undefined,
      };
    }

    return NextResponse.json(successResponse);
  } catch (error: any) {
    console.error(`[subscription/create-payment:${requestId}] Unexpected error:`, error);
    const response: any = {
      ok: false,
      error: error?.message || "Internal server error",
      code: "INTERNAL_ERROR",
      requestId,
    };

    if (shouldIncludeDebug(req)) {
      response.debug = {
        message: error?.message || "Internal server error",
        stack: error?.stack ? error.stack.substring(0, 500) : undefined,
      };
    }

    return NextResponse.json(response, { status: 500 });
  }
}
