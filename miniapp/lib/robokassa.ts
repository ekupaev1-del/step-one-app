/**
 * Robokassa Payment Integration
 * Builds payment URLs and verifies signatures
 */

import * as crypto from "crypto";

export interface RobokassaConfig {
  merchantLogin: string;
  password1: string; // Production password1 or test password1 (based on testMode)
  password2: string; // Production password2 or test password2 (based on testMode)
  testMode: boolean;
  signatureAlgorithm: "md5" | "sha256";
  baseUrl?: string;
  debug?: RobokassaConfigDebug;
}

/**
 * Robustly parse boolean from environment variable
 * Handles Vercel UI quirks (leading "=") and various formats
 * 
 * Rules:
 * - Trims whitespace
 * - Removes optional leading "=" (Vercel UI sometimes keeps "=false/true")
 * - Treats "1", "true", "yes", "on" as true (case-insensitive)
 * - Treats "0", "false", "no", "off", "" as false
 */
export function parseBoolEnv(value: string | undefined, defaultValue: boolean = false): boolean {
  if (!value) return defaultValue;
  
  // Trim whitespace
  let normalized = value.trim();
  
  // Remove leading "=" if present (Vercel UI quirk)
  if (normalized.startsWith("=")) {
    normalized = normalized.substring(1).trim();
  }
  
  // Convert to lowercase for comparison
  normalized = normalized.toLowerCase();
  
  // True values
  if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on") {
    return true;
  }
  
  // False values (explicit check for empty string after trimming)
  if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off" || normalized === "") {
    return false;
  }
  
  // Default to defaultValue for unrecognized values
  return defaultValue;
}

/**
 * @deprecated Use parseBoolEnv instead
 * Kept for backward compatibility
 */
function parseBooleanEnv(value: string | undefined, defaultValue: boolean = false): boolean {
  return parseBoolEnv(value, defaultValue);
}

/**
 * Get Robokassa configuration from environment variables
 * Logs configuration on first call (server-side only)
 */
let configLogged = false;

export interface RobokassaConfigDebug {
  merchantLoginSourceUsed: string;
  password1SourceUsed: string; // Which env var was used (name only, not value)
  password1Length: number;
  password1TrimmedChanged: boolean;
  password2SourceUsed: string; // Which env var was used (name only, not value)
  password2Length: number;
  password2TrimmedChanged: boolean;
  testModeRaw: string | undefined;
  signatureAlgoRaw: string | undefined;
  mode: "test" | "prod"; // Current mode
  testPassword1Present: boolean; // Whether test passwords are configured
  testPassword2Present: boolean;
}

export function getRobokassaConfig(): (RobokassaConfig & { debug?: RobokassaConfigDebug }) | null {
  // Read env vars - use only ROBOKASSA_* (no fallback to ROBO_*)
  const merchantLoginRaw = process.env.ROBOKASSA_MERCHANT_LOGIN;
  const password1Raw = process.env.ROBOKASSA_PASSWORD1;
  const password2Raw = process.env.ROBOKASSA_PASSWORD2;
  const testPassword1Raw = process.env.ROBOKASSA_TEST_PASSWORD1;
  const testPassword2Raw = process.env.ROBOKASSA_TEST_PASSWORD2;
  
  // Always trim secrets to eliminate trailing spaces/newlines
  const merchantLogin = merchantLoginRaw?.trim();
  const password1Prod = password1Raw?.trim();
  const password2Prod = password2Raw?.trim();
  const password1Test = testPassword1Raw?.trim();
  const password2Test = testPassword2Raw?.trim();
  
  // Robust boolean parsing with parseBoolEnv (handles leading "=" and various formats)
  const testModeRaw = process.env.ROBOKASSA_TEST_MODE;
  const testMode = parseBoolEnv(testModeRaw, false);
  
  // Select passwords based on mode
  // If testMode=true, use test passwords; if testMode=false, use prod passwords
  // CRITICAL: If testMode=true but test passwords are missing, throw error (do not silently fall back)
  let password1: string | undefined;
  let password2: string | undefined;
  let password1SourceUsed: string;
  let password2SourceUsed: string;
  
  if (testMode) {
    // Test mode: require test passwords
    if (!password1Test || !password2Test) {
      const missing = [
        !password1Test ? "ROBOKASSA_TEST_PASSWORD1" : null,
        !password2Test ? "ROBOKASSA_TEST_PASSWORD2" : null,
      ].filter(Boolean);
      
      console.error(JSON.stringify({
        event: "robokassa_config_error",
        error: "TEST_MODE_REQUIRES_TEST_PASSWORDS",
        testMode: true,
        testModeRaw,
        missingTestPasswords: missing,
        message: "ROBOKASSA_TEST_MODE=true but test passwords are missing. Set ROBOKASSA_TEST_PASSWORD1 and ROBOKASSA_TEST_PASSWORD2 in Robokassa LK test payment settings.",
      }));
      
      return null;
    }
    
    password1 = password1Test;
    password2 = password2Test;
    password1SourceUsed = "ROBOKASSA_TEST_PASSWORD1";
    password2SourceUsed = "ROBOKASSA_TEST_PASSWORD2";
  } else {
    // Production mode: use production passwords
    password1 = password1Prod;
    password2 = password2Prod;
    password1SourceUsed = "ROBOKASSA_PASSWORD1";
    password2SourceUsed = "ROBOKASSA_PASSWORD2";
  }
  
  // Parse signature algorithm: "md5" | "sha256", default to "md5"
  // Support ROBOKASSA_SIGNATURE_ALGO (primary) and ROBOKASSA_HASH_ALGO for compatibility
  const signatureAlgoRaw = process.env.ROBOKASSA_SIGNATURE_ALGO || process.env.ROBOKASSA_HASH_ALGO;
  let signatureAlgorithm: "md5" | "sha256" = "md5"; // Default to MD5 (Robokassa default)
  if (signatureAlgoRaw) {
    const normalized = signatureAlgoRaw.toLowerCase().trim();
    if (normalized === "md5" || normalized === "sha256") {
      signatureAlgorithm = normalized as "md5" | "sha256";
    }
  }
  
  // Build debug info (do not expose secrets, only metadata)
  const debug: RobokassaConfigDebug = {
    merchantLoginSourceUsed: merchantLoginRaw ? "ROBOKASSA_MERCHANT_LOGIN" : "MISSING",
    password1SourceUsed: password1SourceUsed, // Which env var was used (name only)
    password1Length: password1?.length || 0,
    password1TrimmedChanged: testMode 
      ? (testPassword1Raw && password1 ? testPassword1Raw.length !== password1.length : false)
      : (password1Raw && password1 ? password1Raw.length !== password1.length : false),
    password2SourceUsed: password2SourceUsed, // Which env var was used (name only)
    password2Length: password2?.length || 0,
    password2TrimmedChanged: testMode
      ? (testPassword2Raw && password2 ? testPassword2Raw.length !== password2.length : false)
      : (password2Raw && password2 ? password2Raw.length !== password2.length : false),
    testModeRaw,
    signatureAlgoRaw,
    mode: testMode ? "test" : "prod",
    testPassword1Present: !!password1Test,
    testPassword2Present: !!password2Test,
  };
  
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
      mode: testMode ? "test" : "prod",
      testMode,
      testModeRaw,
      signatureAlgorithm,
      signatureAlgoRaw: signatureAlgoRaw || "default (md5)",
      merchantLogin: merchantLogin || "MISSING",
      merchantLoginSourceUsed: debug.merchantLoginSourceUsed,
      hasPassword1,
      password1SourceUsed: debug.password1SourceUsed, // Which env var was used (name only)
      password1Length: debug.password1Length,
      password1TrimmedChanged: debug.password1TrimmedChanged,
      password1Masked,
      hasPassword2,
      password2SourceUsed: debug.password2SourceUsed, // Which env var was used (name only)
      password2Length: debug.password2Length,
      password2TrimmedChanged: debug.password2TrimmedChanged,
      password2Masked,
      testPassword1Present: debug.testPassword1Present,
      testPassword2Present: debug.testPassword2Present,
      timestamp: new Date().toISOString(),
    }));
    configLogged = true;
  }

  // Validate required config
  if (!merchantLogin || !password1 || !password2) {
    // Log warning if config is missing
    if (!configLogged && typeof process !== "undefined" && process.env) {
      const missing = [
        !merchantLogin ? "ROBOKASSA_MERCHANT_LOGIN" : null,
        !password1 ? (testMode ? "ROBOKASSA_TEST_PASSWORD1" : "ROBOKASSA_PASSWORD1") : null,
        !password2 ? (testMode ? "ROBOKASSA_TEST_PASSWORD2" : "ROBOKASSA_PASSWORD2") : null,
      ].filter(Boolean);
      
      console.warn(JSON.stringify({
        event: "robokassa_config_missing",
        mode: testMode ? "test" : "prod",
        testMode,
        missing,
        debug,
      }));
    }
    
    return null;
  }

  // Return config with selected passwords
  return {
    merchantLogin,
    password1, // Selected based on mode (test or prod)
    password2, // Selected based on mode (test or prod)
    testMode,
    signatureAlgorithm,
    debug,
    baseUrl: "https://auth.robokassa.ru/Merchant/Index.aspx", // Same URL for both test and prod
  };
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
 * Build signature string for payment URL per Robokassa specification
 * CRITICAL: Signature base string MUST be:
 * - Without Shp_: MerchantLogin:OutSum:InvId:Password1
 * - With Shp_: MerchantLogin:OutSum:InvId:Password1:Shp_a=b:Shp_c=d
 * 
 * IMPORTANT: MerchantLogin MUST be included at the beginning of signature base string!
 * 
 * Rules:
 * - Shp_* params must be sorted strictly alphabetically by full key name (case-sensitive)
 * - Values in base string are NOT URL-encoded (raw values)
 * - All parameters are used as sent (non-encoded) for signature calculation
 */
function buildSignatureString(
  merchantLogin: string,
  outSum: string,
  invId: string,
  password1: string,
  shpParams: Record<string, string>
): string {
  // Sort Shp params strictly alphabetically by full key name (case-sensitive, including Shp_ prefix)
  const sortedShpKeys = Object.keys(shpParams).sort();
  const shpString = sortedShpKeys.map((key) => `${key}=${shpParams[key]}`).join(":");
  
  // Base format: MerchantLogin:OutSum:InvId:Password1
  // If Shp params exist, append: :Shp_key1=value1:Shp_key2=value2
  if (shpString) {
    return `${merchantLogin}:${outSum}:${invId}:${password1}:${shpString}`;
  }
  return `${merchantLogin}:${outSum}:${invId}:${password1}`;
}

/**
 * Generate hash for Robokassa signature (MD5 or SHA256)
 * Returns uppercase hex for consistency (Robokassa accepts case-insensitive, but uppercase avoids confusion)
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
    signatureHasMerchantLogin: boolean; // Verify MerchantLogin is in base string
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

  // Validate and format OutSum (must be dot decimal with 2 decimals, no commas)
  // CRITICAL: OutSum must be formatted as string with exactly 2 decimals and dot separator
  const outSumNum = Number(outSum);
  if (!Number.isFinite(outSumNum) || outSumNum <= 0) {
    console.error(`[robokassa:${requestId}] Invalid OutSum: ${outSum}`);
    return null;
  }
  // Format with 2 decimals, dot separator, no commas
  let formattedOutSum = outSumNum.toFixed(2); // Always "1.00", "199.00", etc.
  
  // Ensure no commas (replace if any)
  if (formattedOutSum.includes(",")) {
    console.warn(`[robokassa:${requestId}] OutSum contains comma, replacing with dot: ${formattedOutSum}`);
    formattedOutSum = formattedOutSum.replace(/,/g, ".");
  }

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
  // CRITICAL: Robokassa signature format: MerchantLogin:OutSum:InvId:Password1[:Shp_key1=value1:Shp_key2=value2]
  // MerchantLogin MUST be included at the beginning!
  const signatureBaseStringForLog = buildSignatureString(
    config.merchantLogin,
    formattedOutSum,
    invIdStr,
    "<PASSWORD1>", // Masked for logging
    shpParams
  );

  // Build actual signature string (with real password)
  // CRITICAL: Robokassa signature format: MerchantLogin:OutSum:InvId:Password1[:Shp_key1=value1:Shp_key2=value2]
  // Values are raw (not URL-encoded) in base string
  // Shp params must be sorted lexicographically by key name (case-sensitive)
  const signatureString = buildSignatureString(
    config.merchantLogin,
    formattedOutSum,
    invIdStr,
    config.password1,
    shpParams
  );
  
  // Verify MerchantLogin is in base string (prevent regressions)
  const signatureHasMerchantLogin = signatureString.startsWith(`${config.merchantLogin}:`);
  if (!signatureHasMerchantLogin) {
    console.error(`[robokassa:${requestId}] CRITICAL: MerchantLogin missing from signature base string!`);
  }

  // Generate signature using configured algorithm (MD5 or SHA256)
  // CRITICAL: Use lowercase hex for MD5 (Robokassa accepts case-insensitive, but lowercase is safer)
  // Compute BOTH MD5 and SHA256 for debug comparison
  const signatureMD5 = generateSignatureHash(signatureString, "md5");
  const signatureSHA256 = generateSignatureHash(signatureString, "sha256");
  
  // Use chosen algorithm to set SignatureValue
  const signature = config.signatureAlgorithm === "md5" ? signatureMD5 : signatureSHA256;

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
    signatureLowercase: signature === signature.toLowerCase(), // Robokassa accepts case-insensitive, but we use lowercase
    signatureHasMerchantLogin: signatureHasMerchantLogin, // Verify MerchantLogin is in base string
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
      !sanityChecklist.signatureHasMerchantLogin || !sanityChecklist.urlBuilt || 
      sanityChecklist.descriptionDoubleEncoded) {
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
    sanityChecklist: {
      ...sanityChecklist,
      signatureHasMerchantLogin, // Verify MerchantLogin is in base string
    },
  };

  // Server-side debug logging (always log, but include more details if DEBUG_PAYMENTS is enabled)
  const debugPayments = parseBoolEnv(process.env.DEBUG_PAYMENTS, false);
  if (requestId) {
    const logData: any = {
      requestId,
      type: "robokassa_payment_url_generated",
      userId,
      env: process.env.NODE_ENV,
      mode: config.testMode ? "test" : "prod",
      merchantLogin: config.merchantLogin,
      outSumRaw: outSum,
      outSumFormatted: formattedOutSum,
      invId: invIdStr,
      invIdType: typeof invIdNum === "number" ? "number" : "string",
      descriptionRaw: descriptionRaw,
      descriptionEncoded: descriptionEncodedOnce,
      isTest: config.testMode,
      isTestSet: config.testMode ? "1" : "0",
      signatureAlgorithm: config.signatureAlgorithm,
      password1SourceUsed: config.debug?.password1SourceUsed || "unknown", // Which env var was used (name only)
      shpParams,
      signatureBaseString: signatureBaseStringForLog, // Password already masked as <PASSWORD1>
      signatureValueLength: signature.length,
      signatureMasked: maskValue(signature, 6, 4),
      finalPaymentUrl: finalUrl,
      sanityChecklist,
    };
    
    // Add detailed debug info if DEBUG_PAYMENTS is enabled
    if (debugPayments) {
      logData.debugDetails = {
        signatureBaseStringFull: signatureBaseStringForLog, // Already masked
        signatureValue: maskValue(signature, 6, 4), // Masked
        finalPaymentUrlMasked: maskUrlSignature(finalUrl),
        sortedShpKeys,
        shpParamsCount: sortedShpKeys.length,
      };
      
      // Preflight diagnostic: warn about error 29 if in prod mode
      if (!config.testMode) {
        logData.warning = "If Robokassa shows error 29 in PROD mode, the shop is likely not activated or invoice payments are disabled. Switch to TEST mode (ROBOKASSA_TEST_MODE=true) and set TEST passwords in Robokassa LK.";
      }
    }
    
    console.log(JSON.stringify(logData));
  }

  return { url: finalUrl, signature, debug: debugInfo };
}

/**
 * Verify Robokassa ResultURL signature
 * Uses Password2 for result verification (test or prod based on current mode)
 * 
 * CRITICAL: Signature format for ResultURL is:
 * OutSum:InvId:Password2[:Shp_key1=value1:Shp_key2=value2]
 * 
 * Note: ResultURL signature does NOT include MerchantLogin (unlike payment URL signature)
 */
export function verifyRobokassaResultSignature(params: {
  outSum: string;
  invId: string;
  signature: string;
  shpParams: Record<string, string>;
  requestId?: string; // Optional: for debug logging
}): boolean {
  const config = getRobokassaConfig();
  if (!config) {
    console.error(`[robokassa-result:${params.requestId || "unknown"}] Config missing for signature verification`);
    return false;
  }

  const { outSum, invId, signature: receivedSignature, shpParams, requestId } = params;

  // Format outSum (must be stable: "1.00", dot decimal, 2 digits)
  const outSumNum = Number(outSum);
  if (!Number.isFinite(outSumNum) || outSumNum <= 0) {
    console.error(`[robokassa-result:${requestId || "unknown"}] Invalid OutSum: ${outSum}`);
    return false;
  }
  const formattedOutSum = outSumNum.toFixed(2);

  // Build signature string for result verification
  // Format: OutSum:InvId:Password2[:Shp_key1=value1:Shp_key2=value2]
  // CRITICAL: Shp params must be sorted lexicographically by key name
  const sortedShpKeys = Object.keys(shpParams).sort();
  const shpString = sortedShpKeys.map((key) => `${key}=${shpParams[key]}`).join(":");

  let signatureString: string;
  if (shpString) {
    signatureString = `${formattedOutSum}:${invId}:${config.password2}:${shpString}`;
  } else {
    signatureString = `${formattedOutSum}:${invId}:${config.password2}`;
  }

  // Use configured algorithm (same as payment URL)
  const algorithm = config.signatureAlgorithm;
  const expectedSignature = generateSignatureHash(signatureString, algorithm);

  // Compare signatures (case-insensitive per Robokassa spec, but we use uppercase consistently)
  const isValid = receivedSignature.toUpperCase() === expectedSignature.toUpperCase();

  // Server-side debug logging (only if DEBUG_PAYMENTS is enabled)
  const debugPayments = parseBoolEnv(process.env.DEBUG_PAYMENTS, false);
  if (debugPayments && requestId) {
    console.log(JSON.stringify({
      event: "robokassa_result_signature_verification",
      requestId,
      mode: config.testMode ? "test" : "prod",
      password2SourceUsed: config.debug?.password2SourceUsed || "unknown",
      outSum,
      formattedOutSum,
      invId,
      shpParams,
      sortedShpKeys,
      signatureBaseString: signatureString.replace(config.password2, "<PASSWORD2>"), // Mask password
      receivedSignatureMasked: maskValue(receivedSignature, 6, 4),
      expectedSignatureMasked: maskValue(expectedSignature, 6, 4),
      algorithm,
      isValid,
    }));
  }

  return isValid;
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

/**
 * REQUIRED ENVIRONMENT VARIABLES FOR VERCEL:
 * 
 * Required (always):
 * - ROBOKASSA_MERCHANT_LOGIN: Your Robokassa merchant login (e.g., "steopone")
 * 
 * Required for PRODUCTION mode (ROBOKASSA_TEST_MODE=false or not set):
 * - ROBOKASSA_PASSWORD1: Production password #1 from Robokassa LK (Settings → Technical settings)
 * - ROBOKASSA_PASSWORD2: Production password #2 from Robokassa LK (Settings → Technical settings)
 * 
 * Required for TEST mode (ROBOKASSA_TEST_MODE=true):
 * - ROBOKASSA_TEST_PASSWORD1: Test password #1 from Robokassa LK (Settings → Test payment settings)
 * - ROBOKASSA_TEST_PASSWORD2: Test password #2 from Robokassa LK (Settings → Test payment settings)
 * 
 * Optional:
 * - ROBOKASSA_TEST_MODE: Set to "true" or "1" for test mode, "false" or "0" for production (default: false)
 *   Note: Vercel UI may add leading "=" (e.g., "=false") - this is handled automatically
 * - ROBOKASSA_SIGNATURE_ALGO: "md5" or "sha256" (default: "md5")
 * - DEBUG_PAYMENTS: Set to "true" or "1" to enable detailed server-side debug logging (default: false)
 * - DEBUG_TOKEN: Optional token for secure debug access via x-debug-token header
 * 
 * IMPORTANT NOTES:
 * 1. Error 29 ("Payment of invoices is unavailable") usually means:
 *    - Shop is not activated in Robokassa LK
 *    - Invoice payments are disabled for the merchant account
 *    - Production payments are not allowed yet
 *    Solution: Use TEST mode (ROBOKASSA_TEST_MODE=true) with test passwords until shop is activated
 * 
 * 2. Test passwords are SEPARATE from production passwords:
 *    - Get test passwords from: Robokassa LK → Settings → Test payment settings
 *    - Get prod passwords from: Robokassa LK → Settings → Technical settings
 * 
 * 3. When switching from TEST to PROD:
 *    - Set ROBOKASSA_TEST_MODE=false (or remove it)
 *    - Ensure ROBOKASSA_PASSWORD1 and ROBOKASSA_PASSWORD2 are set
 *    - Ensure shop is activated in Robokassa LK
 * 
 * 4. Signature format (payment URL):
 *    MerchantLogin:OutSum:InvId:Password1[:Shp_key1=value1:Shp_key2=value2]
 *    - Shp_ params must be sorted lexicographically by key name
 *    - OutSum must be formatted as "1.00" (dot decimal, 2 digits)
 *    - InvId must be integer within int32 range (1..2147483647)
 * 
 * 5. Signature format (result URL):
 *    OutSum:InvId:Password2[:Shp_key1=value1:Shp_key2=value2]
 *    - Note: ResultURL signature does NOT include MerchantLogin
 */
