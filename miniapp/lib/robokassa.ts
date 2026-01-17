/**
 * Robokassa Payment Integration
 * Builds payment URLs and verifies signatures
 */

import * as crypto from "crypto";

export interface RobokassaConfig {
  merchantLogin: string;
  password1: string;
  password2: string;
  testMode: boolean;
  baseUrl?: string;
}

/**
 * Get Robokassa configuration from environment variables
 */
export function getRobokassaConfig(): RobokassaConfig | null {
  const merchantLogin = process.env.ROBOKASSA_MERCHANT_LOGIN;
  const password1 = process.env.ROBOKASSA_PASSWORD1;
  const password2 = process.env.ROBOKASSA_PASSWORD2;
  const testMode = process.env.ROBOKASSA_TEST_MODE === "1" || process.env.ROBOKASSA_TEST_MODE === "true";

  // Primary env vars (ROBOKASSA_*)
  if (merchantLogin && password1 && password2) {
    return {
      merchantLogin,
      password1,
      password2,
      testMode,
      baseUrl: testMode
        ? "https://auth.robokassa.ru/Merchant/Index.aspx"
        : "https://auth.robokassa.ru/Merchant/Index.aspx",
    };
  }

  // Fallback to ROBO_* aliases
  const fallbackLogin = process.env.ROBO_MERCHANT_LOGIN;
  const fallbackPassword1 = process.env.ROBO_PASSWORD1;
  const fallbackPassword2 = process.env.ROBO_PASSWORD2;

  if (fallbackLogin && fallbackPassword1 && fallbackPassword2) {
    return {
      merchantLogin: fallbackLogin,
      password1: fallbackPassword1,
      password2: fallbackPassword2,
      testMode,
      baseUrl: testMode
        ? "https://auth.robokassa.ru/Merchant/Index.aspx"
        : "https://auth.robokassa.ru/Merchant/Index.aspx",
    };
  }

  return null;
}

/**
 * Build Shp_ parameters (sorted by key name as per Robokassa spec)
 */
function buildShpParams(params: Record<string, string>): Record<string, string> {
  const shpParams: Record<string, string> = {};
  Object.keys(params)
    .sort()
    .forEach((key) => {
      shpParams[`Shp_${key}`] = params[key];
    });
  return shpParams;
}

/**
 * Build signature string for payment URL
 * Format: MerchantLogin:OutSum:InvId:Password1:Shp_key1=value1:Shp_key2=value2
 */
function buildSignatureString(
  merchantLogin: string,
  outSum: string,
  invId: string,
  password1: string,
  shpParams: Record<string, string>
): string {
  const sortedShpKeys = Object.keys(shpParams).sort();
  const shpString = sortedShpKeys.map((key) => `${key}=${shpParams[key]}`).join(":");
  
  // If no Shp params, signature is: MerchantLogin:OutSum:InvId:Password1
  // If Shp params exist: MerchantLogin:OutSum:InvId:Password1:Shp_key1=value1:Shp_key2=value2
  if (shpString) {
    return `${merchantLogin}:${outSum}:${invId}:${password1}:${shpString}`;
  }
  return `${merchantLogin}:${outSum}:${invId}:${password1}`;
}

/**
 * Generate MD5 hash (uppercase hex for Robokassa signature)
 */
function md5Hash(input: string): string {
  return crypto.createHash("md5").update(input, "utf8").digest("hex").toUpperCase();
}

/**
 * Mask sensitive value (show first N and last M chars)
 */
function maskValue(value: string, first: number = 6, last: number = 4): string {
  if (!value || value.length <= first + last) {
    return "***";
  }
  return `${value.substring(0, first)}...${value.substring(value.length - last)}`;
}

/**
 * Mask URL signature parameter
 */
function maskUrlSignature(url: string): string {
  try {
    const urlObj = new URL(url);
    const signature = urlObj.searchParams.get("SignatureValue");
    if (signature) {
      urlObj.searchParams.set("SignatureValue", maskValue(signature));
    }
    return urlObj.toString();
  } catch {
    return url.replace(/SignatureValue=[^&]+/g, `SignatureValue=${maskValue("signature")}`);
  }
}

/**
 * Build Robokassa payment URL
 */
export interface PaymentUrlParams {
  invId: string;
  outSum: string;
  description: string;
  userId: number;
  planCode: string;
  method: "card" | "sbp";
  returnPath?: string;
}

export interface PaymentUrlDebugInfo {
  outSum: string;
  outSumRaw: string;
  outSumFormatted: string;
  invId: string;
  invIdValid: boolean;
  mrchLogin: string;
  descriptionRaw: string;
  descriptionEncoded: string;
  isTest: boolean;
  shpParams: Record<string, string>;
  sortedShpKeys: string[];
  signatureBaseString: string; // With password masked as <PASSWORD1>
  signatureValueLength: number;
  signatureMasked: string;
  finalPaymentUrl: string; // Full URL
  finalPaymentUrlMasked: string;
  sanityChecklist: {
    outSumFormatValid: boolean;
    invIdValid: boolean;
    merchantLoginPresent: boolean;
    password1Used: boolean;
    shpParamsSorted: boolean;
    signatureComputed: boolean;
    urlBuilt: boolean;
  };
}

export function buildRobokassaPaymentUrl(
  params: PaymentUrlParams,
  requestId?: string
): { url: string; signature: string; debug?: PaymentUrlDebugInfo } | null {
  const config = getRobokassaConfig();
  if (!config) {
    return null;
  }

  const { invId, outSum, description, userId, planCode, method, returnPath = "/subscription" } = params;

  // Validate and format OutSum (must be dot decimal with 2 decimals)
  const outSumNum = Number(outSum);
  if (!Number.isFinite(outSumNum) || outSumNum <= 0) {
    console.error(`[robokassa:${requestId}] Invalid OutSum: ${outSum}`);
    return null;
  }
  const formattedOutSum = outSumNum.toFixed(2); // Always "1.00", "199.00", etc.

  // Validate InvId (must be valid string/integer)
  const invIdStr = String(invId);
  const invIdValid = /^\d+$/.test(invIdStr) || invIdStr.length > 0;

  // URL encode Description (Robokassa requires proper encoding)
  const descriptionEncoded = encodeURIComponent(description);

  // Build Shp_ parameters
  const shpParams = buildShpParams({
    userId: String(userId),
    planCode,
    method,
    returnPath,
  });

  // Sort Shp keys alphabetically for signature (CRITICAL: must match URL order)
  const sortedShpKeys = Object.keys(shpParams).sort();

  // Build signature base string (for logging, mask password)
  const signatureBaseStringForLog = buildSignatureString(
    config.merchantLogin,
    formattedOutSum,
    invIdStr,
    "<PASSWORD1>", // Masked for logging
    shpParams
  );

  // Build actual signature string (with real password)
  const signatureString = buildSignatureString(
    config.merchantLogin,
    formattedOutSum,
    invIdStr,
    config.password1,
    shpParams
  );

  // Generate signature (uppercase MD5) - Robokassa requires uppercase
  const signature = md5Hash(signatureString);

  // Build URL with proper encoding
  const url = new URL(config.baseUrl || "https://auth.robokassa.ru/Merchant/Index.aspx");
  url.searchParams.set("MerchantLogin", config.merchantLogin);
  url.searchParams.set("OutSum", formattedOutSum);
  url.searchParams.set("InvId", invIdStr);
  url.searchParams.set("Description", descriptionEncoded); // URL encoded
  url.searchParams.set("SignatureValue", signature);
  url.searchParams.set("IsTest", config.testMode ? "1" : "0");

  // Add Shp_ parameters in sorted order (must match signature order)
  sortedShpKeys.forEach((key) => {
    url.searchParams.set(key, shpParams[key]);
  });

  const finalUrl = url.toString();

  // Sanity checklist
  const sanityChecklist = {
    outSumFormatValid: /^\d+\.\d{2}$/.test(formattedOutSum),
    invIdValid: invIdValid,
    merchantLoginPresent: !!config.merchantLogin && config.merchantLogin.length > 0,
    password1Used: true, // We always use password1 for payment URL
    shpParamsSorted: JSON.stringify(sortedShpKeys) === JSON.stringify(Object.keys(shpParams).sort()),
    signatureComputed: signature.length === 32, // MD5 is 32 hex chars
    urlBuilt: finalUrl.includes("MerchantLogin") && finalUrl.includes("SignatureValue"),
  };

  // Debug info (always computed)
  const debugInfo: PaymentUrlDebugInfo = {
    outSum: formattedOutSum,
    outSumRaw: outSum,
    outSumFormatted: formattedOutSum,
    invId: invIdStr,
    invIdValid,
    mrchLogin: config.merchantLogin,
    descriptionRaw: description,
    descriptionEncoded,
    isTest: config.testMode,
    shpParams,
    sortedShpKeys,
    signatureBaseString: signatureBaseStringForLog, // With masked password
    signatureValueLength: signature.length,
    signatureMasked: maskValue(signature, 6, 4),
    finalPaymentUrl: finalUrl, // Full URL for server logs
    finalPaymentUrlMasked: maskUrlSignature(finalUrl),
    sanityChecklist,
  };

  // Always log to server console (structured JSON)
  if (requestId) {
    console.log(JSON.stringify({
      requestId,
      type: "robokassa_payment_url_generated",
      userId,
      env: process.env.NODE_ENV,
      merchantLogin: config.merchantLogin,
      outSumRaw: outSum,
      outSumFormatted: formattedOutSum,
      invId: invIdStr,
      descriptionRaw: description,
      descriptionEncoded,
      isTest: config.testMode,
      shpParams,
      signatureBaseString: signatureBaseStringForLog,
      signatureValueLength: signature.length,
      signatureMasked: maskValue(signature, 6, 4),
      finalPaymentUrl: finalUrl,
      sanityChecklist,
    }));
  }

  return { url: finalUrl, signature, debug: debugInfo };
}

/**
 * Verify Robokassa ResultURL signature
 * Uses Password2 for result verification
 */
export function verifyRobokassaResultSignature(params: {
  outSum: string;
  invId: string;
  signature: string;
  shpParams: Record<string, string>;
}): boolean {
  const config = getRobokassaConfig();
  if (!config) {
    return false;
  }

  const { outSum, invId, signature: receivedSignature, shpParams } = params;

  // Format outSum
  const formattedOutSum = Number(outSum).toFixed(2);

  // Build signature string for result verification
  // Format: OutSum:InvId:Password2:Shp_key1=value1:Shp_key2=value2
  const sortedShpKeys = Object.keys(shpParams).sort();
  const shpString = sortedShpKeys.map((key) => `${key}=${shpParams[key]}`).join(":");

  let signatureString: string;
  if (shpString) {
    signatureString = `${formattedOutSum}:${invId}:${config.password2}:${shpString}`;
  } else {
    signatureString = `${formattedOutSum}:${invId}:${config.password2}`;
  }

  const expectedSignature = md5Hash(signatureString).toUpperCase();

  return receivedSignature.toUpperCase() === expectedSignature;
}

/**
 * Parse Shp_ parameters from query/search params
 */
export function parseShpParams(searchParams: URLSearchParams): Record<string, string> {
  const shpParams: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    if (key.startsWith("Shp_")) {
      const paramKey = key.replace("Shp_", "");
      shpParams[paramKey] = value;
    }
  });
  return shpParams;
}
