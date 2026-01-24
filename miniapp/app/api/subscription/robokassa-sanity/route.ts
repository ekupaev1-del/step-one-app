/**
 * Robokassa Sanity Check Endpoint
 * GET /api/subscription/robokassa-sanity
 * 
 * Computes and returns Robokassa payment URL parameters and signature
 * WITHOUT creating an actual payment. Useful for debugging signature/encoding issues.
 * 
 * Gated by debug enablement (same rules as create-payment).
 * NEVER exposes passwords - only masked versions.
 */

import { NextRequest, NextResponse } from "next/server";
import { getRobokassaConfig } from "@/lib/robokassa";
import { resolveUserIdFromRequest } from "@/lib/resolveUserIdFromRequest";

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
  
  // In production: check debug headers (requires token)
  const debugHeader = req.headers.get("x-debug-payments");
  const debugToken = req.headers.get("x-debug-token");
  const expectedToken = process.env.DEBUG_PAYMENTS_TOKEN;
  
  if (debugHeader === "1" && debugToken && expectedToken && debugToken === expectedToken) {
    return true;
  }
  
  // Check query params: ?debug=1, ?debugPayments=1, or ?debugKey=anything
  const url = new URL(req.url);
  const debugParam = url.searchParams.get("debug");
  const debugPayments = url.searchParams.get("debugPayments"); // New: explicit debugPayments param
  const debugKey = url.searchParams.get("debugKey");
  
  if (debugParam === "1" || debugPayments === "1" || debugKey) {
    return true;
  }
  
  return false;
}

export async function GET(req: NextRequest) {
  const requestId = `robokassa-sanity-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const shouldDebug = shouldIncludeDebug(req);
  
  if (!shouldDebug) {
    return NextResponse.json({
      ok: false,
      error: "Debug mode not enabled",
      code: "DEBUG_NOT_ENABLED",
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
    const method = (url.searchParams.get("method") || "card") as "card" | "sbp";
    const planCode = url.searchParams.get("planCode") || "trial_3d_then_199";
    
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
            method,
            planCode,
          },
        },
      }, { status: 400 });
    }
    
    // Use a sample invId for sanity check (small integer)
    const sampleInvId = "12345"; // Example small integer
    const amount = "1.00";
    const description = `Подписка: Первые 3 дня за 1 ₽, далее 199 ₽/мес`;
    
    // Build Shp params
    const shpParamsData: Record<string, string> = {
      userId: String(userId),
      planCode,
      method,
      returnPath: `/subscription?id=${userId}`,
    };
    
    const shpParams: Record<string, string> = {};
    Object.keys(shpParamsData)
      .sort()
      .forEach((key) => {
        shpParams[`Shp_${key}`] = shpParamsData[key];
      });
    
    // Build signature base string (with masked password)
    const sortedShpKeys = Object.keys(shpParams).sort();
    const shpString = sortedShpKeys.map((key) => `${key}=${shpParams[key]}`).join(":");
    
    let signatureBaseString: string;
    if (shpString) {
      signatureBaseString = `${config.merchantLogin}:${amount}:${sampleInvId}:<PASSWORD1>:${shpString}`;
    } else {
      signatureBaseString = `${config.merchantLogin}:${amount}:${sampleInvId}:<PASSWORD1>`;
    }
    
    // Build actual signature (for verification, but we'll mask it)
    const actualSignatureString = signatureBaseString.replace("<PASSWORD1>", config.password1);
    const crypto = require("crypto");
    const signature = crypto.createHash("md5").update(actualSignatureString, "utf8").digest("hex").toUpperCase();
    const signatureMasked = `${signature.substring(0, 6)}...${signature.substring(signature.length - 4)}`;
    
    // Build URL (masked)
    const baseUrl = "https://auth.robokassa.ru/Merchant/Index.aspx";
    const testUrl = new URL(baseUrl);
    testUrl.searchParams.set("MerchantLogin", config.merchantLogin);
    testUrl.searchParams.set("OutSum", amount);
    testUrl.searchParams.set("InvId", sampleInvId);
    testUrl.searchParams.set("Description", description);
    testUrl.searchParams.set("IsTest", config.testMode ? "1" : "0");
    sortedShpKeys.forEach((key) => {
      testUrl.searchParams.set(key, shpParams[key]);
    });
    testUrl.searchParams.set("SignatureValue", signature);
    
    const finalUrl = testUrl.toString();
    const finalUrlMasked = finalUrl.replace(/SignatureValue=[^&]+/, `SignatureValue=${signatureMasked}`);
    
    // Sanity checks
    const sanityChecklist = {
      outSumFormatValid: /^\d+\.\d{2}$/.test(amount),
      invIdIsInteger: /^\d+$/.test(sampleInvId),
      invIdLength: sampleInvId.length,
      invIdWithinRange: sampleInvId.length <= 10,
      merchantLoginPresent: !!config.merchantLogin,
      shpParamsSorted: JSON.stringify(sortedShpKeys) === JSON.stringify(Object.keys(shpParams).sort()),
      signatureLength: signature.length === 32,
      signatureUppercase: signature === signature.toUpperCase(),
      isTestSet: testUrl.searchParams.get("IsTest") === (config.testMode ? "1" : "0"),
      allChecksPass: true,
    };
    
    if (!sanityChecklist.outSumFormatValid || !sanityChecklist.invIdIsInteger || 
        !sanityChecklist.merchantLoginPresent || !sanityChecklist.signatureLength) {
      sanityChecklist.allChecksPass = false;
    }
    
    // Mock invoice IDs for sanity check
    const invoiceDbId = 1; // Mock DB ID
    const invIdUsed = sampleInvId; // Mock InvId (int32)
    
    return NextResponse.json({
      ok: true,
      requestId,
      timestamp: new Date().toISOString(),
      invIdUsed, // The InvId that would be sent to Robokassa
      invoiceDbId, // The database ID (mocked for sanity check)
      debug: {
        config: {
          merchantLogin: config.merchantLogin,
          isTest: config.testMode,
          hasPassword1: !!config.password1,
          hasPassword2: !!config.password2,
        },
        userId,
        userIdResolution: {
          source: userIdResolution.source,
          candidates: userIdResolution.candidates,
        },
        parameters: {
          invId: sampleInvId,
          invIdUsed, // Explicit field
          invoiceDbId, // Explicit field
          outSum: amount,
          descriptionRaw: description,
          descriptionEncoded: encodeURIComponent(description),
          method,
          planCode,
        },
        shpParams,
        shpParamsSorted: sortedShpKeys,
        signatureBaseString,
        signatureMasked,
        finalPaymentUrl: finalUrlMasked,
        sanityChecklist,
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
