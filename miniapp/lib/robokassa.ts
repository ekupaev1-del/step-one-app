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
  signatureAlgorithm: "md5" | "sha256";
  baseUrl?: string;
}

/**
 * Robustly parse boolean from environment variable
 * Accepts: "true"/"false", "1"/"0", true/false
 */
function parseBooleanEnv(value: string | undefined, defaultValue: boolean = false): boolean {
  if (!value) return defaultValue;
  const normalized = value.toLowerCase().trim();
  return normalized === "true" || normalized === "1";
}

/**
 * Get Robokassa configuration from environment variables
 * Logs configuration on first call (server-side only)
 */
let configLogged = false;

export function getRobokassaConfig(): RobokassaConfig | null {
  const merchantLogin = process.env.ROBOKASSA_MERCHANT_LOGIN;
  const password1 = process.env.ROBOKASSA_PASSWORD1;
  const password2 = process.env.ROBOKASSA_PASSWORD2;
  
  // Robust boolean parsing: accept "true"/"false", "1"/"0", true/false
  const testModeRaw = process.env.ROBOKASSA_TEST_MODE;
  const testMode = parseBooleanEnv(testModeRaw, false);
  
  // Parse signature algorithm: "md5" | "sha256", default to "md5"
  // Support both ROBOKASSA_SIGNATURE_ALG and ROBOKASSA_SIGNATURE_ALGO for compatibility
  const signatureAlgRaw = process.env.ROBOKASSA_SIGNATURE_ALGO || process.env.ROBOKASSA_SIGNATURE_ALG;
  let signatureAlgorithm: "md5" | "sha256" = "md5"; // Default to MD5 (Robokassa default)
  if (signatureAlgRaw) {
    const normalized = signatureAlgRaw.toLowerCase().trim();
    if (normalized === "md5" || normalized === "sha256") {
      signatureAlgorithm = normalized as "md5" | "sha256";
    }
  }
  
  // Log configuration once on server startup (server-side only)
  if (!configLogged && typeof process !== "undefined" && process.env) {
    const nodeEnv = process.env.NODE_ENV || "unknown";
    const hasPassword1 = !!password1;
    const hasPassword2 = !!password2;
    const password1Masked = hasPassword1 ? `${password1.substring(0, 6)}...${password1.substring(password1.length - 4)}` : "MISSING";
    const password2Masked = hasPassword2 ? `${password2.substring(0, 6)}...${password2.substring(password2.length - 4)}` : "MISSING";
    
    console.log(JSON.stringify({
      event: "robokassa_config_loaded",
      nodeEnv,
      testMode,
      testModeRaw,
      signatureAlgorithm,
      signatureAlgRaw: signatureAlgRaw || "default (md5)",
      merchantLogin: merchantLogin || "MISSING",
      hasPassword1,
      hasPassword2,
      password1Masked,
      password2Masked,
      timestamp: new Date().toISOString(),
    }));
    configLogged = true;
  }

  // Primary env vars (ROBOKASSA_*)
  if (merchantLogin && password1 && password2) {
    return {
      merchantLogin,
      password1,
      password2,
      testMode,
      signatureAlgorithm,
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
      signatureAlgorithm,
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
 * Generate hash for Robokassa signature (MD5 or SHA256)
 * Returns uppercase hex string
 */
export function generateSignatureHash(input: string, algorithm: "md5" | "sha256"): string {
  return crypto.createHash(algorithm).update(input, "utf8").digest("hex").toUpperCase();
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
  email?: string; // Optional: customer email (if required by Robokassa)
}

export interface PaymentUrlDebugInfo {
  outSum: string;
  outSumRaw: string;
  outSumFormatted: string;
  invId: string;
  invIdValid: boolean;
  invIdWithinRange?: boolean; // Explicit int32 range check (1..2147483647)
  invIdType: string; // "number" | "string" | etc.
  mrchLogin: string;
  descriptionRaw: string;
  descriptionEncoded: string;
  isTest: boolean;
  signatureAlgoUsed: "md5" | "sha256"; // Algorithm actually used
  signatureBaseString: string; // With password masked as <PASSWORD1>
  signatureMD5: string; // Full MD5 signature (for server logs only)
  signatureSHA256: string; // Full SHA256 signature (for server logs only)
  signatureMD5Masked: string; // First 3 + last 3 chars
  signatureSHA256Masked: string; // First 3 + last 3 chars
  signatureValue: string; // Full signature (for server logs only, not returned to client)
  signatureValueLength: number;
  signatureMasked: string; // First 3 + last 3 chars (of the algorithm used)
  finalPaymentUrl: string; // Full URL
  finalPaymentUrlMasked: string; // URL with masked SignatureValue
  shpParams: Record<string, string>; // Raw (decoded) values used for signature
  sortedShpKeys: string[];
  sanityChecklist: {
    outSumFormatValid: boolean;
    outSumValid: boolean;
    invIdValid: boolean;
    invIdWithinRange?: boolean; // Explicit int32 range check
    merchantLoginPresent: boolean;
    password1Used: boolean;
    password1Present: boolean;
    shpParamsSorted: boolean;
    shpSorted: boolean; // Alias for shpParamsSorted
    signatureComputed: boolean;
    signatureLengthMatchesAlgo: boolean; // MD5=32, SHA256=64
    signatureAlgorithmCorrect: boolean;
    descriptionEncodedOnce: boolean;
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

  const { invId, outSum, description, userId, planCode, method, returnPath = "/subscription", orderToken, email } = params;

  // Validate and format OutSum (must be dot decimal with 2 decimals)
  const outSumNum = Number(outSum);
  if (!Number.isFinite(outSumNum) || outSumNum <= 0) {
    console.error(`[robokassa:${requestId}] Invalid OutSum: ${outSum}`);
    return null;
  }
  const formattedOutSum = outSumNum.toFixed(2); // Always "1.00", "199.00", etc.

  // Validate InvId - MUST be numeric and within int32 range (1..2147483647)
  // CRITICAL: Robokassa requires InvId to be within int32 range
  // Large values (like Date.now() timestamps) cause error 29 "Оплата счетов недоступна"
  const invIdStr = String(invId);
  const invIdIsNumeric = /^\d+$/.test(invIdStr);
  
  if (!invIdIsNumeric) {
    console.error(`[robokassa:${requestId}] Invalid InvId (must be numeric): ${invIdStr}`);
    return null;
  }
  
  const invIdNum = parseInt(invIdStr, 10);
  const INT32_MAX = 2147483647;
  
  // Enforce int32 range: must be 1 <= invId <= 2147483647
  if (!Number.isFinite(invIdNum) || invIdNum < 1 || invIdNum > INT32_MAX) {
    console.error(`[robokassa:${requestId}] InvId out of range: ${invIdNum} (must be 1..${INT32_MAX})`);
    return null;
  }
  
  const invIdValid = invIdIsNumeric && invIdNum >= 1 && invIdNum <= INT32_MAX;

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
  // CRITICAL: Use exact values as they appear in URL (before encoding)
  // Signature base: MerchantLogin:OutSum:InvId:Password1[:Shp_key1=value1:Shp_key2=value2]
  // Shp params must be sorted lexicographically by key name
  const signatureString = buildSignatureString(
    config.merchantLogin,
    formattedOutSum,
    invIdStr,
    config.password1,
    shpParams
  );

  // Generate signature using configured algorithm (MD5 or SHA256)
  // Robokassa requires uppercase hex
  const signature = generateSignatureHash(signatureString, config.signatureAlgorithm);
  
  // Also compute both MD5 and SHA256 for debug comparison
  const signatureMD5 = generateSignatureHash(signatureString, "md5");
  const signatureSHA256 = generateSignatureHash(signatureString, "sha256");

  // Build URL with proper encoding
  // IMPORTANT: Do NOT pre-encode Description or Shp values - URLSearchParams.set() will encode them once
  // CRITICAL: Signature is computed over RAW (non-encoded) values, but URL uses encoded values
  const url = new URL(config.baseUrl || "https://auth.robokassa.ru/Merchant/Index.aspx");
  
  // Set required parameters first
  url.searchParams.set("MerchantLogin", config.merchantLogin);
  url.searchParams.set("OutSum", formattedOutSum);
  url.searchParams.set("InvId", invIdStr);
  url.searchParams.set("Description", descriptionRaw); // Pass raw - URLSearchParams encodes once
  url.searchParams.set("IsTest", config.testMode ? "1" : "0"); // CRITICAL: 0 for production, 1 for test
  
  // Add Email parameter if provided
  // NOTE: Email is NOT included in signature base string per Robokassa documentation
  // Only MerchantLogin:OutSum:InvId:Password1[:Shp_...] are signed
  if (email) {
    url.searchParams.set("Email", email);
  }
  
  // Add Shp_ parameters in sorted order (must match signature order)
  // CRITICAL: Shp params must be added in the SAME order as in signature
  // URLSearchParams.set() will URL-encode the values automatically (once)
  // The signature was computed over RAW values (before encoding), which is correct
  sortedShpKeys.forEach((key) => {
    // Pass raw value - URLSearchParams will encode it once
    url.searchParams.set(key, shpParams[key]);
  });
  
  // Set SignatureValue LAST (after all Shp params) - this is Robokassa requirement
  url.searchParams.set("SignatureValue", signature);

  const finalUrl = url.toString();
  
  // Check for double encoding in Description (if URL contains %25D0%25, it's double encoded)
  // %25 is the encoded version of %, so %25D0%25 means %D0% which is double-encoded
  const descriptionDoubleEncoded = finalUrl.includes("%25D0%25") || finalUrl.includes("%25D1%25");
  
  // Extract actual encoded description from URL for verification
  const urlObj = new URL(finalUrl);
  const descriptionInUrl = urlObj.searchParams.get("Description") || "";
  
  // Additional sanity check: if descriptionInUrl starts with %25, it's likely double-encoded
  const likelyDoubleEncoded = descriptionInUrl.startsWith("%25") && descriptionInUrl.length > 3;

  // Sanity checklist - comprehensive validation
  const expectedSignatureLength = config.signatureAlgorithm === "md5" ? 32 : 64; // MD5=32, SHA256=64
  const shpSorted = JSON.stringify(sortedShpKeys) === JSON.stringify(Object.keys(shpParams).sort());
  const signatureLengthMatchesAlgo = signature.length === expectedSignatureLength;
  
  const sanityChecklist = {
    outSumFormatValid: /^\d+\.\d{2}$/.test(formattedOutSum),
    outSumValid: Number.isFinite(outSumNum) && outSumNum > 0,
    invIdIsInteger: invIdIsNumeric,
    invIdValid: invIdValid && invIdStr.length <= 10, // Robokassa prefers <= 10 digits
    invIdWithinRange: invIdNum >= 1 && invIdNum <= INT32_MAX, // Explicit int32 range check
    invIdLength: invIdStr.length,
    merchantLoginPresent: !!config.merchantLogin && config.merchantLogin.length > 0,
    password1Used: true, // We always use password1 for payment URL
    password1Present: !!config.password1 && config.password1.length > 0,
    shpParamsSorted: shpSorted,
    shpSorted: shpSorted, // Alias for compatibility
    shpParamsCount: sortedShpKeys.length,
    signatureComputed: signatureLengthMatchesAlgo,
    signatureLengthMatchesAlgo: signatureLengthMatchesAlgo, // MD5=32, SHA256=64 hex chars
    signatureAlgorithmCorrect: config.signatureAlgorithm === "md5" || config.signatureAlgorithm === "sha256",
    signatureUppercase: signature === signature.toUpperCase(), // Robokassa requires uppercase
    urlBuilt: finalUrl.includes("MerchantLogin") && finalUrl.includes("SignatureValue"),
    isTestSet: url.searchParams.get("IsTest") === (config.testMode ? "1" : "0"),
    descriptionDoubleEncoded: descriptionDoubleEncoded || likelyDoubleEncoded, // Flag if double encoded detected
    descriptionEncodedOnce: !descriptionDoubleEncoded && !likelyDoubleEncoded && descriptionInUrl.length > 0,
    allChecksPass: true, // Will be set to false if any check fails
  };
  
  // Mark allChecksPass as false if any critical check fails
  if (!sanityChecklist.outSumFormatValid || !sanityChecklist.invIdValid || 
      !sanityChecklist.invIdWithinRange || !sanityChecklist.merchantLoginPresent || 
      !sanityChecklist.signatureComputed || !sanityChecklist.signatureAlgorithmCorrect || 
      !sanityChecklist.urlBuilt || sanityChecklist.descriptionDoubleEncoded) {
    sanityChecklist.allChecksPass = false;
  }

  // Debug info (always computed)
  const debugInfo: PaymentUrlDebugInfo = {
    outSum: formattedOutSum,
    outSumRaw: outSum,
    outSumFormatted: formattedOutSum,
    invId: invIdStr,
    invIdValid: invIdValid, // Must be numeric and within int32 range
    invIdWithinRange: invIdNum >= 1 && invIdNum <= INT32_MAX, // Explicit range check
    invIdType: typeof invIdNum === "number" ? "number" : "string",
    mrchLogin: config.merchantLogin,
    descriptionRaw: descriptionRaw,
    descriptionEncoded: descriptionInUrl, // Actual encoded value from URL
    isTest: config.testMode,
    signatureAlgoUsed: config.signatureAlgorithm, // Algorithm actually used
    signatureBaseString: signatureBaseStringForLog, // With password masked as <PASSWORD1>
    signatureMD5: signatureMD5, // Full MD5 signature (for server logs only)
    signatureSHA256: signatureSHA256, // Full SHA256 signature (for server logs only)
    signatureMD5Masked: maskValue(signatureMD5, 3, 3), // First 3 + last 3 chars
    signatureSHA256Masked: maskValue(signatureSHA256, 3, 3), // First 3 + last 3 chars
    signatureValue: signature, // Full signature (for server logs, not returned to client)
    signatureValueLength: signature.length,
    signatureMasked: maskValue(signature, 3, 3), // First 3 + last 3 chars (of the algorithm used)
    finalPaymentUrl: finalUrl, // Full URL for server logs
    finalPaymentUrlMasked: maskUrlSignature(finalUrl), // URL with masked SignatureValue
    shpParams, // Raw (decoded) values used for signature
    sortedShpKeys,
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
      invIdType: typeof invIdNum === "number" ? "number" : "string",
      descriptionRaw: descriptionRaw,
      descriptionEncoded: descriptionEncodedOnce,
      isTest: config.testMode,
      signatureAlgorithm: config.signatureAlgorithm,
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

  // Use SHA256 for result verification (most Robokassa accounts use SHA256 now)
  // If your account uses MD5, you may need to adjust this
  // For now, default to SHA256 but could be made configurable
  const robokassaConfig = getRobokassaConfig();
  const algorithm = robokassaConfig?.signatureAlgorithm || "sha256";
  const expectedSignature = generateSignatureHash(signatureString, algorithm);

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
      // Values are URL-decoded by URLSearchParams automatically
      shpParams[paramKey] = value;
    }
  });
  return shpParams;
}

/**
 * Signature test vector helper (for development/debugging)
 * Computes signature for fixed inputs to verify correctness
 */
export function computeSignatureTestVector(
  merchantLogin: string,
  outSum: string,
  invId: string,
  password1: string,
  shpParams: Record<string, string>,
  algorithm: "md5" | "sha256" = "md5"
): {
  baseString: string;
  signature: string;
  algorithm: string;
} {
  const sortedShpKeys = Object.keys(shpParams).sort();
  const shpString = sortedShpKeys.map((key) => `${key}=${shpParams[key]}`).join(":");
  
  let baseString: string;
  if (shpString) {
    baseString = `${merchantLogin}:${outSum}:${invId}:${password1}:${shpString}`;
  } else {
    baseString = `${merchantLogin}:${outSum}:${invId}:${password1}`;
  }
  
  const signature = generateSignatureHash(baseString, algorithm);
  
  return {
    baseString,
    signature,
    algorithm,
  };
}
