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
  invId: string; // Must be numeric only (Robokassa requirement)
  outSum: string;
  description: string;
  userId: number;
  planCode: string;
  method: "card" | "sbp";
  returnPath?: string;
  orderToken?: string; // Optional: store in Shp_requestId for tracking
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

  const { invId, outSum, description, userId, planCode, method, returnPath = "/subscription", orderToken } = params;

  // Validate and format OutSum (must be dot decimal with 2 decimals)
  const outSumNum = Number(outSum);
  if (!Number.isFinite(outSumNum) || outSumNum <= 0) {
    console.error(`[robokassa:${requestId}] Invalid OutSum: ${outSum}`);
    return null;
  }
  const formattedOutSum = outSumNum.toFixed(2); // Always "1.00", "199.00", etc.

  // Validate InvId - MUST be numeric only (Robokassa requirement)
  const invIdStr = String(invId);
  const invIdIsNumeric = /^\d+$/.test(invIdStr);
  if (!invIdIsNumeric) {
    console.error(`[robokassa:${requestId}] Invalid InvId (must be numeric): ${invIdStr}`);
    return null;
  }
  const invIdValid = invIdIsNumeric && invIdStr.length > 0;

  // Description: DO NOT pre-encode - URLSearchParams will encode it once
  // CRITICAL: If description is already encoded (contains %XX patterns), decode it first
  // Then pass raw description string to URLSearchParams.set() - it will encode once
  let descriptionRaw = description;
  
  // Check if description is already URL-encoded (contains %XX patterns that decode to valid UTF-8)
  // If it decodes successfully and is different, it was pre-encoded
  try {
    const decoded = decodeURIComponent(description);
    // If decoding succeeds and produces different result, and original contains %XX, it was encoded
    if (decoded !== description && /%[0-9A-Fa-f]{2}/.test(description)) {
      console.warn(`[robokassa:${requestId}] Description appears pre-encoded, decoding first: ${description.substring(0, 50)}...`);
      descriptionRaw = decoded; // Use decoded version
    }
  } catch (e) {
    // Not encoded or invalid - use as-is
    descriptionRaw = description;
  }
  
  // This is what URLSearchParams will produce (for reference/debugging)
  const descriptionEncodedOnce = encodeURIComponent(descriptionRaw);

  // Build Shp_ parameters
  const shpParamsData: Record<string, string> = {
    userId: String(userId),
    planCode,
    method,
    returnPath,
  };
  
  // Add orderToken if provided (for tracking, separate from InvId)
  if (orderToken) {
    shpParamsData.requestId = orderToken;
  }
  
  const shpParams = buildShpParams(shpParamsData);

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
  // IMPORTANT: Do NOT pre-encode Description - URLSearchParams.set() will encode it once
  const url = new URL(config.baseUrl || "https://auth.robokassa.ru/Merchant/Index.aspx");
  url.searchParams.set("MerchantLogin", config.merchantLogin);
  url.searchParams.set("OutSum", formattedOutSum);
  url.searchParams.set("InvId", invIdStr);
  url.searchParams.set("Description", descriptionRaw); // Pass raw - URLSearchParams encodes once
  url.searchParams.set("SignatureValue", signature);
  url.searchParams.set("IsTest", config.testMode ? "1" : "0");

  // Add Shp_ parameters in sorted order (must match signature order)
  sortedShpKeys.forEach((key) => {
    url.searchParams.set(key, shpParams[key]);
  });

  const finalUrl = url.toString();
  
  // Check for double encoding in Description (if URL contains %25D0%25, it's double encoded)
  // %25 is the encoded version of %, so %25D0%25 means %D0% which is double-encoded
  const descriptionDoubleEncoded = finalUrl.includes("%25D0%25") || finalUrl.includes("%25D1%25");
  
  // Extract actual encoded description from URL for verification
  const urlObj = new URL(finalUrl);
  const descriptionInUrl = urlObj.searchParams.get("Description") || "";
  
  // Additional sanity check: if descriptionInUrl starts with %25, it's likely double-encoded
  const likelyDoubleEncoded = descriptionInUrl.startsWith("%25") && descriptionInUrl.length > 3;

  // Sanity checklist
  const sanityChecklist = {
    outSumFormatValid: /^\d+\.\d{2}$/.test(formattedOutSum),
    outSumValid: Number.isFinite(outSumNum) && outSumNum > 0,
    invIdIsInteger: invIdIsNumeric,
    invIdValid: invIdValid,
    merchantLoginPresent: !!config.merchantLogin && config.merchantLogin.length > 0,
    password1Used: true, // We always use password1 for payment URL
    shpParamsSorted: JSON.stringify(sortedShpKeys) === JSON.stringify(Object.keys(shpParams).sort()),
    signatureComputed: signature.length === 32, // MD5 is 32 hex chars
    urlBuilt: finalUrl.includes("MerchantLogin") && finalUrl.includes("SignatureValue"),
    descriptionDoubleEncoded: descriptionDoubleEncoded || likelyDoubleEncoded, // Flag if double encoded detected
    descriptionEncodedOnce: !descriptionDoubleEncoded && !likelyDoubleEncoded && descriptionInUrl.length > 0,
  };

  // Debug info (always computed)
  const debugInfo: PaymentUrlDebugInfo = {
    outSum: formattedOutSum,
    outSumRaw: outSum,
    outSumFormatted: formattedOutSum,
    invId: invIdStr,
    invIdValid: invIdIsNumeric, // Must be numeric
    mrchLogin: config.merchantLogin,
    descriptionRaw: descriptionRaw,
    descriptionEncoded: descriptionInUrl, // Actual encoded value from URL
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
      descriptionRaw: descriptionRaw,
      descriptionEncoded: descriptionEncodedOnce,
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
