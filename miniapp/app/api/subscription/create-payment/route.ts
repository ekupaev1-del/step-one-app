/**
 * Create Payment Endpoint
 * POST /api/subscription/create-payment
 * 
 * Creates Robokassa invoice record and returns payment URL.
 * 
 * CRITICAL FIX: Uses DB-generated auto-increment integer as InvId (not timestamp).
 * Robokassa requires InvId to be a small integer (<= 10 digits / 32-bit range).
 * Large timestamps (13+ digits) or non-numeric IDs cause error 29 "Оплата счетов недоступна".
 * 
 * Flow:
 * 1. Resolve userId from query params (?userId= or ?id=) or body ({ userId } or { id })
 * 2. Create invoice record in robokassa_invoices table
 * 3. Use invoice.id (small integer) as Robokassa InvId
 * 4. Build payment URL with proper signature
 * 5. Return payment URL to client
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

// Helper to mask sensitive values in logs
function maskValue(value: string, first: number = 6, last: number = 4): string {
  if (!value || value.length <= first + last) {
    return "***";
  }
  return `${value.substring(0, first)}...${value.substring(value.length - last)}`;
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

// Structured logging helper
function logEvent(event: string, data: Record<string, any>, requestId: string) {
  // Never log passwords or full signatures
  const safeData = { ...data };
  if (safeData.password1) safeData.password1 = "<PASSWORD1>";
  if (safeData.password2) safeData.password2 = "<PASSWORD2>";
  if (safeData.signature) safeData.signature = maskValue(safeData.signature);
  if (safeData.signatureValue) safeData.signatureValue = maskValue(safeData.signatureValue);
  
  console.log(JSON.stringify({
    event,
    requestId,
    timestamp: new Date().toISOString(),
    ...safeData,
  }));
}

export async function POST(req: NextRequest) {
  const requestId = `create-payment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  logEvent("create-payment:start", { url: req.url }, requestId);
  
  try {
    // Check Robokassa config
    const config = getRobokassaConfig();
    const debugWarnings: string[] = [];
    
    if (!config) {
      logEvent("create-payment:error", { 
        error: "ROBOKASSA_CONFIG_MISSING",
        missingVars: [
          !process.env.ROBOKASSA_MERCHANT_LOGIN ? "ROBOKASSA_MERCHANT_LOGIN" : null,
          !process.env.ROBOKASSA_PASSWORD1 ? "ROBOKASSA_PASSWORD1" : null,
          !process.env.ROBOKASSA_PASSWORD2 ? "ROBOKASSA_PASSWORD2" : null,
        ].filter(Boolean),
      }, requestId);
      
      const response: any = {
        ok: false,
        error: "Платежный провайдер не настроен",
        code: "ROBOKASSA_CONFIG_MISSING",
        requestId,
      };

      if (shouldIncludeDebug(req)) {
        response.debug = {
          missingEnvVars: [
            !process.env.ROBOKASSA_MERCHANT_LOGIN ? "ROBOKASSA_MERCHANT_LOGIN" : null,
            !process.env.ROBOKASSA_PASSWORD1 ? "ROBOKASSA_PASSWORD1" : null,
            !process.env.ROBOKASSA_PASSWORD2 ? "ROBOKASSA_PASSWORD2" : null,
          ].filter(Boolean),
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
    // Supports both query params (?userId= or ?id=) and body ({ userId } or { id })
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
      logEvent("create-payment:error", {
        error: "USER_ID_MISSING",
        userIdResolution,
        queryParams,
        bodyHasUserId: body?.userId !== undefined,
        bodyHasId: body?.id !== undefined,
      }, requestId);
      
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

    const supabase = createServerSupabaseClient();

    // CRITICAL: Create invoice record FIRST, then use invoice.id as InvId
    // This ensures InvId is a small integer (auto-increment), not a large timestamp
    const invoiceRecord = {
      user_id: userId,
      plan_code: planCode,
      method,
      amount: Number(amount),
      currency: "RUB",
      status: "created",
      request_id: requestId, // Store requestId separately (can contain hyphens/letters)
      raw_payload: {
        returnPath,
        testMode: config.testMode,
        userIdResolution,
      },
    };

    logEvent("create-payment:invoice-creating", {
      userId,
      planCode,
      method,
      amount,
    }, requestId);

    const { data: invoice, error: insertError } = await supabase
      .from("robokassa_invoices")
      .insert(invoiceRecord)
      .select("id, user_id, plan_code, method, amount, status, request_id, created_at")
      .single();

    if (insertError) {
      logEvent("create-payment:error", {
        error: "DATABASE_ERROR",
        databaseError: {
          message: insertError.message,
          code: insertError.code,
          hint: insertError.hint,
        },
      }, requestId);
      
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

    // Use invoice.id as InvId (small integer, within Robokassa's supported range)
    const invId = String(invoice.id); // Convert to string for Robokassa URL
    
    logEvent("create-payment:invoice-created", {
      invoiceId: invoice.id,
      invId,
      userId,
      planCode,
      method,
      amount,
    }, requestId);

    // Build Robokassa payment URL using invoice.id as InvId
    // Include requestId in Shp params for tracking (not in InvId)
    const paymentUrlResult = buildRobokassaPaymentUrl({
      invId, // Small integer from DB
      outSum: amount,
      description,
      userId,
      planCode,
      method,
      returnPath,
      orderToken: requestId, // Store in Shp_requestId for tracking
    }, requestId);

    if (!paymentUrlResult) {
      logEvent("create-payment:error", {
        error: "PAYMENT_URL_BUILD_ERROR",
        invoiceId: invoice.id,
      }, requestId);
      
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
          invoiceId: invoice.id,
        };
      }

      return NextResponse.json(response, { status: 500 });
    }

    // Update invoice record with payment_url
    await supabase
      .from("robokassa_invoices")
      .update({ payment_url: paymentUrlResult.url })
      .eq("id", invoice.id);

    logEvent("create-payment:url-generated", {
      invoiceId: invoice.id,
      invId,
      userId,
      method,
      planCode,
      amount,
      isTest: config.testMode,
      paymentUrlLength: paymentUrlResult.url.length,
    }, requestId);

    // Build response
    const successResponse: any = {
      ok: true,
      invId, // Small integer from DB
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
        resolvedUserId: userId,
        userIdResolution: {
          source: userIdResolution.source,
          candidates: userIdResolution.candidates,
        },
        invoiceId: invoice.id, // DB-generated small integer
        merchantLogin: robokassaDebug?.mrchLogin,
        outSumRaw: robokassaDebug?.outSumRaw,
        outSumFormatted: robokassaDebug?.outSumFormatted,
        invId: robokassaDebug?.invId, // Should match invoice.id
        descriptionRaw: robokassaDebug?.descriptionRaw,
        descriptionEncodedOnce: robokassaDebug?.descriptionEncoded,
        shpParams: robokassaDebug?.shpParams,
        signatureBaseString: robokassaDebug?.signatureBaseString, // Password masked as <PASSWORD1>
        signatureMasked: robokassaDebug?.signatureMasked,
        finalPaymentUrl: robokassaDebug?.finalPaymentUrlMasked, // Masked for safety
        sanityChecklist: robokassaDebug?.sanityChecklist || {},
        isTest: config.testMode,
        // Additional context
        queryParams,
        bodyPreview,
        parsedBodyKeys: body && typeof body === "object" ? Object.keys(body) : [],
        bodyHasUserId: body?.userId !== undefined,
        bodyHasId: body?.id !== undefined,
        headersSubset,
        debugWarnings: debugWarnings.length > 0 ? debugWarnings : undefined,
      };
    }

    return NextResponse.json(successResponse);
  } catch (error: any) {
    logEvent("create-payment:error", {
      error: "INTERNAL_ERROR",
      message: error?.message,
      stack: error?.stack ? error.stack.substring(0, 500) : undefined,
    }, requestId);
    
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
