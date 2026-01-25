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
import { buildRobokassaPaymentUrl, getRobokassaConfig, parseBoolEnv } from "@/lib/robokassa";

export const dynamic = "force-dynamic";

interface CreatePaymentRequest {
  method: "card" | "sbp";
  planCode: string;
  returnPath?: string;
  userId?: number;
  id?: number;
  email?: string; // Optional: customer email for Robokassa
}

// Helper to mask sensitive values in logs
function maskValue(value: string, first: number = 6, last: number = 4): string {
  if (!value || value.length <= first + last) {
    return "***";
  }
  return `${value.substring(0, first)}...${value.substring(value.length - last)}`;
}

// Helper to parse boolean from env (robust)
// Use parseBoolEnv from robokassa lib for consistency
// Keep backward compatibility alias
function parseBooleanEnv(value: string | undefined, defaultValue: boolean = false): boolean {
  return parseBoolEnv(value, defaultValue);
}

// Helper to check if debug should be included (safe for production)
function shouldIncludeDebug(req: NextRequest): boolean {
  // Always enable in non-production
  if (process.env.NODE_ENV !== "production") {
    return true;
  }
  
  // In production: check DEBUG_PAYMENTS env var
  const debugPaymentsEnv = parseBooleanEnv(process.env.DEBUG_PAYMENTS, false);
  if (debugPaymentsEnv) {
    return true;
  }
  
  // In production: check debug query param with token header
  // Format: ?debug=1 AND x-debug-token header matches DEBUG_TOKEN
  const url = new URL(req.url);
  const debugParam = url.searchParams.get("debug");
  const debugToken = req.headers.get("x-debug-token");
  const expectedToken = process.env.DEBUG_TOKEN;
  
  if (debugParam === "1" && debugToken && expectedToken && debugToken === expectedToken) {
    return true;
  }
  
  // In production: check debug headers (requires token)
  const debugHeader = req.headers.get("x-debug-payments");
  const debugPaymentsToken = req.headers.get("x-debug-token");
  const expectedPaymentsToken = process.env.DEBUG_PAYMENTS_TOKEN;
  
  if (debugHeader === "1" && debugPaymentsToken && expectedPaymentsToken && debugPaymentsToken === expectedPaymentsToken) {
    return true;
  }
  
  // Check query params: ?debugPayments=1, or ?debugKey=anything
  const debugPayments = url.searchParams.get("debugPayments");
  const debugKey = url.searchParams.get("debugKey");
  
  if (debugPayments === "1" || debugKey) {
    return true;
  }
  
  // Fallback: check DEBUG_KEY query param (for backward compatibility)
  const expectedKey = process.env.DEBUG_KEY;
  
  if (debugKey && expectedKey && debugKey === expectedKey) {
    return true;
  }
  
  return false;
}

// Structured logging helper - NEVER logs passwords or full signatures
function logEvent(event: string, data: Record<string, any>, requestId: string) {
  // Never log passwords or full signatures
  const safeData = { ...data };
  if (safeData.password1) safeData.password1 = "<PASSWORD1>";
  if (safeData.password2) safeData.password2 = "<PASSWORD2>";
  if (safeData.signature) safeData.signature = maskValue(safeData.signature);
  if (safeData.signatureValue) safeData.signatureValue = maskValue(safeData.signatureValue);
  if (safeData.serviceKey) safeData.serviceKey = maskValue(safeData.serviceKey);
  
  console.log(JSON.stringify({
    event,
    requestId,
    timestamp: new Date().toISOString(),
    ...safeData,
  }));
}

// Helper to create detailed DB error response
function createDbErrorResponse(
  operation: string,
  table: string,
  error: any,
  userId: number | null,
  requestId: string,
  payloadPreview: Record<string, any>,
  shouldDebug: boolean
): NextResponse {
  // Structured error logging with full details
  logEvent("create-payment:error", {
    error: "DATABASE_ERROR",
    operation,
    table,
    userId,
    requestId,
    payloadKeys: Object.keys(payloadPreview),
    dbError: {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    },
  }, requestId);
  
  const response: any = {
    ok: false,
    error: "Ошибка создания платежа",
    code: "DATABASE_ERROR",
    requestId,
  };

  // Include detailed DB error in debug mode
  if (shouldDebug) {
    response.dbError = {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    };
    response.debug = {
      userId,
      step: operation,
      table,
      payloadPreview,
      payloadKeys: Object.keys(payloadPreview),
    };
  }

  return NextResponse.json(response, { status: 500 });
}

export async function POST(req: NextRequest) {
  const requestId = `create-payment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const shouldDebug = shouldIncludeDebug(req);
  
  logEvent("create-payment:start", { url: req.url }, requestId);
  
  try {
    // Check Robokassa config
    const config = getRobokassaConfig();
    const debugWarnings: string[] = [];
    const diagnostics: string[] = [];
    
    if (!config) {
      logEvent("create-payment:error", { 
        error: "ROBOKASSA_CONFIG_MISSING",
        missingVars: [
          !process.env.ROBOKASSA_MERCHANT_LOGIN ? "ROBOKASSA_MERCHANT_LOGIN" : null,
          !process.env.ROBOKASSA_TEST_MODE ? "ROBOKASSA_TEST_MODE (check if test/prod passwords are set)" : null,
          parseBoolEnv(process.env.ROBOKASSA_TEST_MODE, false) 
            ? (!process.env.ROBOKASSA_TEST_PASSWORD1 ? "ROBOKASSA_TEST_PASSWORD1" : null)
            : (!process.env.ROBOKASSA_PASSWORD1 ? "ROBOKASSA_PASSWORD1" : null),
          parseBoolEnv(process.env.ROBOKASSA_TEST_MODE, false)
            ? (!process.env.ROBOKASSA_TEST_PASSWORD2 ? "ROBOKASSA_TEST_PASSWORD2" : null)
            : (!process.env.ROBOKASSA_PASSWORD2 ? "ROBOKASSA_PASSWORD2" : null),
        ].filter(Boolean),
      }, requestId);
      
      const response: any = {
        ok: false,
        error: "Платежный провайдер не настроен",
        code: "ROBOKASSA_CONFIG_MISSING",
        requestId,
      };

      if (shouldDebug) {
        const testMode = parseBoolEnv(process.env.ROBOKASSA_TEST_MODE, false);
        response.debug = {
          missingEnvVars: [
            !process.env.ROBOKASSA_MERCHANT_LOGIN ? "ROBOKASSA_MERCHANT_LOGIN" : null,
            testMode 
              ? (!process.env.ROBOKASSA_TEST_PASSWORD1 ? "ROBOKASSA_TEST_PASSWORD1" : null)
              : (!process.env.ROBOKASSA_PASSWORD1 ? "ROBOKASSA_PASSWORD1" : null),
            testMode
              ? (!process.env.ROBOKASSA_TEST_PASSWORD2 ? "ROBOKASSA_TEST_PASSWORD2" : null)
              : (!process.env.ROBOKASSA_PASSWORD2 ? "ROBOKASSA_PASSWORD2" : null),
          ].filter(Boolean),
          testMode,
          diagnostic: "If testMode=true, you need ROBOKASSA_TEST_PASSWORD1 and ROBOKASSA_TEST_PASSWORD2. If testMode=false, you need ROBOKASSA_PASSWORD1 and ROBOKASSA_PASSWORD2.",
        };
      }

      return NextResponse.json(response, { status: 500 });
    }

    // Preflight diagnostic: check config completeness and warn about error 29
    const debugPayments = parseBoolEnv(process.env.DEBUG_PAYMENTS, false);
    if (shouldDebug || debugPayments) {
      // Check if in prod mode
      if (!config.testMode) {
        diagnostics.push("PROD mode: If Robokassa shows error 29, the shop is likely not activated or invoice payments are disabled.");
        diagnostics.push("Solution: Switch to TEST mode (ROBOKASSA_TEST_MODE=true) and set ROBOKASSA_TEST_PASSWORD1 and ROBOKASSA_TEST_PASSWORD2 in Robokassa LK test payment settings.");
      } else {
        diagnostics.push("TEST mode: Using test passwords. Payments will work in test mode.");
      }
      
      // Check config completeness
      if (config.debug) {
        if (!config.debug.testPassword1Present && config.testMode) {
          diagnostics.push("WARNING: TEST mode enabled but ROBOKASSA_TEST_PASSWORD1 is missing!");
        }
        if (!config.debug.testPassword2Present && config.testMode) {
          diagnostics.push("WARNING: TEST mode enabled but ROBOKASSA_TEST_PASSWORD2 is missing!");
        }
      }
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

      if (shouldDebug) {
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
    
    // Check if email is required and get user email if available
    const requireEmail = parseBooleanEnv(process.env.ROBOKASSA_REQUIRE_EMAIL, false);
    let userEmail: string | null = null;
    
    if (requireEmail || body.email) {
      // Try to get email from request body first
      if (body.email && typeof body.email === "string") {
        userEmail = body.email;
      } else {
        // Try to get email from user record in DB
        const { data: userData } = await supabase
          .from("users")
          .select("email")
          .eq("id", userId)
          .maybeSingle();
        
        if (userData?.email) {
          userEmail = userData.email;
        }
      }
      
      if (requireEmail && !userEmail) {
        logEvent("create-payment:error", {
          error: "EMAIL_REQUIRED",
          userId,
          requireEmail,
        }, requestId);
        
        const response: any = {
          ok: false,
          error: "Email обязателен для оплаты. Пожалуйста, укажите email.",
          code: "EMAIL_REQUIRED",
          requestId,
        };
        
        if (shouldDebug) {
          response.debug = {
            requireEmail,
            emailFromBody: body.email || null,
            message: "ROBOKASSA_REQUIRE_EMAIL=true but email not found in body or user record",
          };
        }
        
        return NextResponse.json(response, { status: 400 });
      }
    }

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

    const payloadPreview = {
      user_id: invoiceRecord.user_id,
      plan_code: invoiceRecord.plan_code,
      method: invoiceRecord.method,
      amount: invoiceRecord.amount,
      currency: invoiceRecord.currency,
      status: invoiceRecord.status,
      hasRequestId: !!invoiceRecord.request_id,
      hasRawPayload: !!invoiceRecord.raw_payload,
    };

    logEvent("create-payment:invoice-creating", {
      userId,
      planCode,
      method,
      amount,
      table: "robokassa_invoices",
      payloadKeys: Object.keys(invoiceRecord),
    }, requestId);

    const { data: invoice, error: insertError } = await supabase
      .from("robokassa_invoices")
      .insert(invoiceRecord)
      .select("id, inv_id, user_id, plan_code, method, amount, status, request_id, created_at")
      .single();

    if (insertError) {
      return createDbErrorResponse(
        "insert_invoice",
        "robokassa_invoices",
        insertError,
        userId,
        requestId,
        payloadPreview,
        shouldDebug
      );
    }

    // CRITICAL: Use invoice.inv_id (int32) for Robokassa InvId, not invoice.id
    // inv_id is guaranteed to be within int32 range (1..2147483647)
    if (!invoice.inv_id) {
      logEvent("create-payment:error:missing_inv_id", {
        invoiceId: invoice.id,
        userId,
        error: "inv_id is missing from invoice record",
      }, requestId);
      
      const response: any = {
        ok: false,
        error: "Ошибка создания платежа: inv_id отсутствует",
        code: "INV_ID_MISSING",
        requestId,
      };
      
      if (shouldDebug) {
        response.debug = {
          invoiceId: invoice.id,
          invoice,
          message: "Invoice record created but inv_id is missing. Check database schema.",
        };
      }
      
      return NextResponse.json(response, { status: 500 });
    }

    // Validate inv_id is within int32 range (1..2147483647)
    const invIdNum = Number(invoice.inv_id);
    const INT32_MAX = 2147483647;
    
    if (!Number.isFinite(invIdNum) || invIdNum < 1 || invIdNum > INT32_MAX) {
      logEvent("create-payment:error:inv_id_out_of_range", {
        invoiceId: invoice.id,
        invId: invoice.inv_id,
        invIdNum,
        userId,
        error: `inv_id ${invIdNum} is out of int32 range (1..${INT32_MAX})`,
      }, requestId);
      
      const response: any = {
        ok: false,
        error: "Ошибка создания платежа: inv_id вне допустимого диапазона",
        code: "INV_ID_OUT_OF_RANGE",
        requestId,
      };
      
      if (shouldDebug) {
        response.debug = {
          invoiceId: invoice.id,
          invId: invoice.inv_id,
          invIdNum,
          validRange: `1..${INT32_MAX}`,
          message: `inv_id must be within int32 range (1..${INT32_MAX})`,
        };
      }
      
      return NextResponse.json(response, { status: 500 });
    }

    const invId = String(invoice.inv_id); // Convert to string for Robokassa URL
    const invoiceDbId = invoice.id; // Keep original DB ID for internal reference
    
    logEvent("create-payment:invoice-created", {
      invoiceId: invoice.id,
      invId: invoice.inv_id,
      invIdStr: invId,
      userId,
      planCode,
      method,
      amount,
      invIdWithinRange: invIdNum >= 1 && invIdNum <= INT32_MAX,
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
      email: userEmail || undefined, // Include email if available
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

      if (shouldDebug) {
        response.debug = {
          message: "Failed to build payment URL",
          configPresent: !!config,
          invoiceId: invoice.id,
        };
      }

      return NextResponse.json(response, { status: 500 });
    }

    // Update invoice record with payment_url
    const { error: updateError } = await supabase
      .from("robokassa_invoices")
      .update({ payment_url: paymentUrlResult.url })
      .eq("id", invoice.id);

    if (updateError) {
      // Log update error but don't fail the request (payment URL is already generated)
      logEvent("create-payment:error", {
        error: "DATABASE_UPDATE_WARNING",
        operation: "update_invoice_payment_url",
        table: "robokassa_invoices",
        invoiceId: invoice.id,
        userId,
        requestId,
        dbError: {
          message: updateError.message,
          code: updateError.code,
          details: updateError.details,
          hint: updateError.hint,
        },
      }, requestId);
      
      // Continue - payment URL is already generated and returned
      // The invoice record exists, just payment_url update failed
    }

    logEvent("create-payment:url-generated", {
      invoiceId: invoice.id,
      invId,
      userId,
      method,
      planCode,
      amount,
      isTest: config.testMode,
      merchantLogin: config.merchantLogin,
      signatureMasked: paymentUrlResult.debug?.signatureMasked,
      paymentUrlLength: paymentUrlResult.url.length,
      sanityChecklist: paymentUrlResult.debug?.sanityChecklist,
    }, requestId);

    // Build response
    const successResponse: any = {
      ok: true,
      invId, // int32 value from invoice.inv_id
      invIdUsed: invId, // Explicit field for debug (the actual value sent to Robokassa)
      invoiceDbId: invoice.id, // The database id (can be larger than int32)
      paymentUrl: paymentUrlResult.url,
      requestId,
      timestamp: new Date().toISOString(),
    };

    // Include comprehensive debug echo when debug enabled
    if (shouldDebug) {
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
          notes: userIdResolution.notes,
        },
        telegramInitData: {
          present: userIdResolution.candidates.telegram_user_id !== null,
          userId: userIdResolution.candidates.telegram_user_id,
          source: userIdResolution.source === "telegram_initData_user_id" ? "initData" : "not_used",
        },
        invoiceId: invoice.id, // DB-generated small integer
        merchantLogin: robokassaDebug?.mrchLogin,
        outSumRaw: robokassaDebug?.outSumRaw,
        outSumFormatted: robokassaDebug?.outSumFormatted,
        invId: robokassaDebug?.invId, // Should match invoice.inv_id
        invIdUsed: invId, // The actual InvId sent to Robokassa (from invoice.inv_id)
        invIdType: robokassaDebug?.invIdType || "number",
        invoiceDbId: invoiceDbId, // The database id (can be larger than int32)
        descriptionRaw: robokassaDebug?.descriptionRaw,
        descriptionEncodedOnce: robokassaDebug?.descriptionEncoded,
        signatureAlgoUsed: robokassaDebug?.signatureAlgoUsed || config.signatureAlgorithm,
        signatureBaseString: robokassaDebug?.signatureBaseString, // Password masked as <PASSWORD1>
        signatureMD5Masked: robokassaDebug?.signatureMD5Masked, // First 3 + last 3 chars
        signatureSHA256Masked: robokassaDebug?.signatureSHA256Masked, // First 3 + last 3 chars
        signatureValue: robokassaDebug?.signatureMasked, // Masked signature (first 3 + last 3 chars) of algorithm used
        merchantLoginUsed: robokassaDebug?.mrchLogin,
        outSumUsed: robokassaDebug?.outSumFormatted,
        isTest: config.testMode,
        robokassaTestMode: config.testMode,
        robokassaTestModeRaw: config.debug?.testModeRaw,
        envVarSources: {
          merchantLoginSourceUsed: config.debug?.merchantLoginSourceUsed || "ROBOKASSA_MERCHANT_LOGIN",
          password1SourceUsed: config.debug?.password1SourceUsed || "ROBOKASSA_PASSWORD1",
          password1Length: config.debug?.password1Length || 0,
          password1TrimmedChanged: config.debug?.password1TrimmedChanged || false,
          password2SourceUsed: config.debug?.password2SourceUsed || "ROBOKASSA_PASSWORD2",
          password2Length: config.debug?.password2Length || 0,
          password2TrimmedChanged: config.debug?.password2TrimmedChanged || false,
          signatureAlgoRaw: config.debug?.signatureAlgoRaw || "default (md5)",
        },
        shpParamsSorted: robokassaDebug?.sortedShpKeys,
        shpParams: robokassaDebug?.shpParams, // Raw (decoded) values used for signature
        fullPaymentUrl: robokassaDebug?.finalPaymentUrlMasked, // URL with masked SignatureValue
        signatureValueLength: robokassaDebug?.signatureValueLength, // 32 for MD5, 64 for SHA256
        sanityChecklist: {
          ...(robokassaDebug?.sanityChecklist || {}),
          invIdWithinRange: invIdNum >= 1 && invIdNum <= INT32_MAX, // Add explicit range check
          signatureHasMerchantLogin: robokassaDebug?.sanityChecklist?.signatureHasMerchantLogin ?? true, // Verify MerchantLogin is in base string
        },
        // Additional context
        queryParams,
        bodyPreview,
        parsedBodyKeys: body && typeof body === "object" ? Object.keys(body) : [],
        bodyHasUserId: body?.userId !== undefined,
        bodyHasId: body?.id !== undefined,
        headersSubset,
        debugWarnings: debugWarnings.length > 0 ? debugWarnings : undefined,
        diagnostics: diagnostics.length > 0 ? diagnostics : undefined,
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

    if (shouldDebug) {
      response.debug = {
        message: error?.message || "Internal server error",
        stack: error?.stack ? error.stack.substring(0, 500) : undefined,
      };
    }

    return NextResponse.json(response, { status: 500 });
  }
}
