/**
 * Robokassa Diagnosis Endpoint
 * GET /api/subscription/robokassa-diagnose?userId=...
 * 
 * Returns comprehensive debug information about Robokassa payment URL generation
 * and verifies signature correctness by recomputing from URL parameters.
 * 
 * PROTECTED: Only accessible when debug is enabled (DEBUG_PAYMENTS=true OR debug=1 with x-debug-token)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabaseAdmin";
import { resolveUserIdFromRequest } from "@/lib/resolveUserIdFromRequest";
import { buildRobokassaPaymentUrl, getRobokassaConfig, generateSignatureHash } from "@/lib/robokassa";
import * as crypto from "crypto";

export const dynamic = "force-dynamic";

// Helper to parse boolean from env (robust)
function parseBooleanEnv(value: string | undefined, defaultValue: boolean = false): boolean {
  if (!value) return defaultValue;
  const normalized = value.toLowerCase().trim();
  return normalized === "true" || normalized === "1";
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
  
  return false;
}

// Helper to mask sensitive value
function maskValue(value: string, first: number = 3, last: number = 3): string {
  if (!value || value.length <= first + last) {
    return "***";
  }
  return `${value.substring(0, first)}...${value.substring(value.length - last)}`;
}

// Helper to recompute signature from URL parameters
function recomputeSignatureFromUrl(url: string, password1: string, algorithm: "md5" | "sha256"): {
  success: boolean;
  computedSignature: string;
  baseString: string;
  urlSignature: string | null;
  match: boolean;
} {
  try {
    const urlObj = new URL(url);
    const merchantLogin = urlObj.searchParams.get("MerchantLogin");
    const outSum = urlObj.searchParams.get("OutSum");
    const invId = urlObj.searchParams.get("InvId");
    const urlSignature = urlObj.searchParams.get("SignatureValue");
    
    if (!merchantLogin || !outSum || !invId || !password1) {
      return {
        success: false,
        computedSignature: "",
        baseString: "",
        urlSignature,
        match: false,
      };
    }
    
    // Extract Shp_ parameters and sort them
    const shpParams: Record<string, string> = {};
    urlObj.searchParams.forEach((value, key) => {
      if (key.startsWith("Shp_")) {
        shpParams[key] = value; // Keep Shp_ prefix for signature
      }
    });
    
    const sortedShpKeys = Object.keys(shpParams).sort();
    const shpString = sortedShpKeys.map((key) => `${key}=${shpParams[key]}`).join(":");
    
    // Build signature base string
    let baseString: string;
    if (shpString) {
      baseString = `${merchantLogin}:${outSum}:${invId}:${password1}:${shpString}`;
    } else {
      baseString = `${merchantLogin}:${outSum}:${invId}:${password1}`;
    }
    
    // Compute signature
    const computedSignature = crypto.createHash(algorithm).update(baseString, "utf8").digest("hex").toUpperCase();
    
    return {
      success: true,
      computedSignature,
      baseString: baseString.replace(password1, "<PASSWORD1>"), // Mask password in base string
      urlSignature,
      match: urlSignature?.toUpperCase() === computedSignature,
    };
  } catch (error) {
    return {
      success: false,
      computedSignature: "",
      baseString: "",
      urlSignature: null,
      match: false,
    };
  }
}

export async function GET(req: NextRequest) {
  const requestId = `robokassa-diagnose-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const shouldDebug = shouldIncludeDebug(req);
  
  if (!shouldDebug) {
    return NextResponse.json({
      ok: false,
      error: "Debug mode not enabled",
      code: "DEBUG_NOT_ENABLED",
      message: "Server debug is OFF. Set DEBUG_PAYMENTS=true or use ?debug=1 with x-debug-token header matching DEBUG_TOKEN.",
      requestId,
    }, { status: 403 });
  }
  
  try {
    const config = getRobokassaConfig();
    if (!config) {
      return NextResponse.json({
        ok: false,
        error: "Robokassa not configured",
        code: "ROBOKASSA_CONFIG_MISSING",
        requestId,
      }, { status: 500 });
    }
    
    // Parse query params
    const url = new URL(req.url);
    const userIdParam = url.searchParams.get("userId") || url.searchParams.get("id");
    
    // Resolve userId
    const userIdResolution = await resolveUserIdFromRequest(req, {});
    const userId = userIdResolution.userId || (userIdParam ? Number(userIdParam) : null);
    
    if (!userId) {
      return NextResponse.json({
        ok: false,
        error: "userId is required",
        code: "USER_ID_MISSING",
        requestId,
        debug: {
          userIdResolution,
          queryParams: {
            userId: url.searchParams.get("userId"),
            id: url.searchParams.get("id"),
          },
        },
      }, { status: 400 });
    }
    
    // Use sample values for diagnosis
    const method = (url.searchParams.get("method") || "card") as "card" | "sbp";
    const planCode = url.searchParams.get("planCode") || "trial_3d_then_199";
    const amount = "1.00";
    const description = `Подписка: Первые 3 дня за 1 ₽, далее 199 ₽/мес`;
    
    // Create a test invoice to get a real inv_id
    const supabase = createServerSupabaseClient();
    const { data: testInvoice } = await supabase
      .from("robokassa_invoices")
      .insert({
        user_id: userId,
        plan_code: planCode,
        method,
        amount: Number(amount),
        currency: "RUB",
        status: "created",
        request_id: requestId,
      })
      .select("id, inv_id")
      .single();
    
    if (!testInvoice?.inv_id) {
      return NextResponse.json({
        ok: false,
        error: "Failed to create test invoice",
        code: "INVOICE_CREATION_FAILED",
        requestId,
      }, { status: 500 });
    }
    
    const invId = String(testInvoice.inv_id);
    
    // Build payment URL
    const paymentUrlResult = buildRobokassaPaymentUrl({
      invId,
      outSum: amount,
      description,
      userId,
      planCode,
      method,
      returnPath: `/subscription?id=${userId}`,
      orderToken: requestId,
    }, requestId);
    
    if (!paymentUrlResult) {
      return NextResponse.json({
        ok: false,
        error: "Failed to build payment URL",
        code: "PAYMENT_URL_BUILD_ERROR",
        requestId,
      }, { status: 500 });
    }
    
    // Recompute signature from URL to verify
    const signatureCheckMD5 = recomputeSignatureFromUrl(paymentUrlResult.url, config.password1, "md5");
    const signatureCheckSHA256 = recomputeSignatureFromUrl(paymentUrlResult.url, config.password1, "sha256");
    
    const robokassaDebug = paymentUrlResult.debug;
    
    return NextResponse.json({
      ok: true,
      message: "Robokassa diagnosis completed",
      requestId,
      timestamp: new Date().toISOString(),
      debug: {
        config: {
          merchantLogin: config.merchantLogin,
          isTest: config.testMode,
          signatureAlgoUsed: config.signatureAlgorithm,
          hasPassword1: !!config.password1,
          hasPassword2: !!config.password2,
        },
        userId,
        invoiceId: testInvoice.id,
        invIdUsed: invId,
        outSumFormatted: robokassaDebug?.outSumFormatted,
        merchantLogin: robokassaDebug?.mrchLogin,
        signatureAlgoUsed: robokassaDebug?.signatureAlgoUsed || config.signatureAlgorithm,
        signatureBaseString: robokassaDebug?.signatureBaseString,
        signatureMD5Masked: robokassaDebug?.signatureMD5Masked,
        signatureSHA256Masked: robokassaDebug?.signatureSHA256Masked,
        signatureMasked: robokassaDebug?.signatureMasked,
        signatureValueLength: robokassaDebug?.signatureValueLength,
        sortedShpKeys: robokassaDebug?.sortedShpKeys,
        shpParams: robokassaDebug?.shpParams,
        finalPaymentUrl: robokassaDebug?.finalPaymentUrlMasked,
        sanityChecklist: robokassaDebug?.sanityChecklist,
        signatureVerification: {
          md5: {
            computed: maskValue(signatureCheckMD5.computedSignature),
            urlSignature: signatureCheckMD5.urlSignature ? maskValue(signatureCheckMD5.urlSignature) : null,
            match: signatureCheckMD5.match,
            baseString: signatureCheckMD5.baseString,
          },
          sha256: {
            computed: maskValue(signatureCheckSHA256.computedSignature),
            urlSignature: signatureCheckSHA256.urlSignature ? maskValue(signatureCheckSHA256.urlSignature) : null,
            match: signatureCheckSHA256.match,
            baseString: signatureCheckSHA256.baseString,
          },
        },
      },
    });
  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      error: error?.message || "Internal server error",
      code: "INTERNAL_ERROR",
      requestId,
    }, { status: 500 });
  }
}
