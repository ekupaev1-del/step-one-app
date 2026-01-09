/**
 * Robokassa payment utility
 * DO NOT MODIFY signature algorithm - it's used by existing system
 */

import { createHash } from "crypto";

const ROBOKASSA_MERCHANT_LOGIN = process.env.ROBOKASSA_MERCHANT_LOGIN || "";
const ROBOKASSA_PASSWORD1 = process.env.ROBOKASSA_PASSWORD1 || "";
const ROBOKASSA_PASSWORD2 = process.env.ROBOKASSA_PASSWORD2 || "";
const ROBOKASSA_BASE_URL = process.env.NODE_ENV === "production"
  ? "https://auth.robokassa.ru/Merchant/Index.aspx"
  : "https://auth.robokassa.ru/Merchant/Index.aspx"; // Use production URL for testing

/**
 * Calculate MD5 signature for Robokassa
 * CRITICAL: Returns lowercase hex (Robokassa requirement)
 * Signature must match regex: /^[0-9a-f]{32}$/
 */
export function calculateSignature(...args: string[]): string {
  const signatureString = args.join(":");
  const hash = createHash("md5").update(signatureString).digest("hex");
  const hashLowercase = hash.toLowerCase(); // Robokassa requires lowercase
  return hashLowercase;
}

/**
 * Generate Robokassa payment URL with optional debug information
 * @param amount - Payment amount (e.g., "1.00")
 * @param invId - Invoice ID (unique)
 * @param description - Payment description
 * @param userId - Telegram user ID (for Shp_userId parameter)
 * @param isTest - Use test mode
 * @param includeDebug - Include debug information in return value
 * @returns Robokassa payment URL or object with URL and debug info
 */
export function generateRobokassaUrl(
  amount: string,
  invId: string,
  description: string,
  userId: string,
  isTest: boolean = false,
  includeDebug: boolean = false
): string | { paymentUrl: string; debug: any } {
  // Overload: if includeDebug is false, return string; if true, return object
  // Format amount with 2 decimals
  const outSum = parseFloat(amount).toFixed(2);

  // Build signature parts: MerchantLogin:OutSum:InvId:Password1:Shp_*
  // Signature formula: MerchantLogin:OutSum:InvId:Password1:Shp_userId=userId
  const signatureParts: string[] = [
    ROBOKASSA_MERCHANT_LOGIN,
    outSum,
    invId.toString(), // Ensure InvId is string
  ];

  // Add Password1
  signatureParts.push(ROBOKASSA_PASSWORD1);

  // Add Shp_* parameters AFTER Password1, sorted alphabetically
  const shpParams: string[] = [];
  shpParams.push(`Shp_userId=${userId}`);
  shpParams.sort(); // Alphabetical order
  signatureParts.push(...shpParams);

  // Calculate signature
  const signatureValue = calculateSignature(...signatureParts);

  // Validate signature format
  if (!/^[0-9a-f]{32}$/.test(signatureValue)) {
    throw new Error(`Invalid signature format: ${signatureValue}`);
  }

  // Get base URL for return URLs
  const baseUrl = process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_VERCEL_URL 
    ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
    : "https://step-one-app-emins-projects-4717eabc.vercel.app";
  
  const successUrl = `${baseUrl}/api/robokassa/success`;
  const failUrl = `${baseUrl}/api/robokassa/fail`;
  const resultUrl = `${baseUrl}/api/robokassa/result`;

  // Build URL parameters
  // Description should be URL-encoded for safety (URLSearchParams handles this automatically)
  const params = new URLSearchParams({
    MerchantLogin: ROBOKASSA_MERCHANT_LOGIN,
    OutSum: outSum,
    InvId: invId.toString(), // Ensure InvId is string
    Description: description, // URLSearchParams will encode this automatically
    SignatureValue: signatureValue,
    Shp_userId: userId,
    SuccessURL: successUrl,
    FailURL: failUrl,
    ...(isTest && { IsTest: "1" }),
  });

  const paymentUrl = `${ROBOKASSA_BASE_URL}?${params.toString()}`;
  
  // Note: ResultURL must be configured in Robokassa merchant settings, not in URL params

  if (!includeDebug) {
    return paymentUrl;
  }

  // Generate debug information
  const signatureStringMasked = [
    ROBOKASSA_MERCHANT_LOGIN,
    outSum,
    invId,
    "[PASSWORD1_HIDDEN]",
    ...shpParams,
  ].join(":");

  const customParams: Record<string, string> = {
    Shp_userId: userId,
  };

  const debug = {
    merchantLogin: ROBOKASSA_MERCHANT_LOGIN,
    outSum,
    invoiceId: invId,
    isTest,
    targetUrl: ROBOKASSA_BASE_URL,
    signatureAlgorithm: "MD5",
    signatureStringMasked,
    signatureStringParts: [
      ROBOKASSA_MERCHANT_LOGIN,
      outSum,
      invId,
      "[PASSWORD1_HIDDEN]",
      ...shpParams,
    ],
    signatureValue,
    signatureChecks: {
      lengthIs32: signatureValue.length === 32,
      lowercase: signatureValue === signatureValue.toLowerCase(),
      hexOnly: /^[0-9a-f]{32}$/.test(signatureValue),
    },
    customParams: {
      raw: customParams,
      sorted: Object.entries(customParams)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`),
      count: Object.keys(customParams).length,
    },
    environment: {
      nodeEnv: process.env.NODE_ENV || "unknown",
      vercelEnv: process.env.VERCEL_ENV || "unknown",
      password1Length: ROBOKASSA_PASSWORD1.length,
      password1Prefix2: ROBOKASSA_PASSWORD1.substring(0, 2),
      password1Suffix2: ROBOKASSA_PASSWORD1.substring(ROBOKASSA_PASSWORD1.length - 2),
    },
  };

  return { paymentUrl, debug };
}

/**
 * Verify Robokassa callback signature using PASSWORD2
 * @param outSum - Payment amount
 * @param invId - Invoice ID
 * @param signature - Signature from callback
 * @param userId - Telegram user ID
 * @returns true if signature is valid
 */
export function verifyCallbackSignature(
  outSum: string,
  invId: string,
  signature: string,
  userId: string
): boolean {
  // Signature format: OutSum:InvId:Password2:Shp_*
  const signatureParts: string[] = [
    outSum,
    invId,
    ROBOKASSA_PASSWORD2,
  ];

  // Add Shp_* parameters sorted alphabetically
  const shpParams: string[] = [];
  shpParams.push(`Shp_userId=${userId}`);
  shpParams.sort();
  signatureParts.push(...shpParams);

  const calculatedSignature = calculateSignature(...signatureParts);
  return calculatedSignature.toLowerCase() === signature.toLowerCase();
}

/**
 * Generate unique invoice ID
 * DEPRECATED: Use database-generated ID from payments table instead
 * This function is kept for backward compatibility but should not be used
 */
export function generateInvoiceId(): string {
  // This creates very large numbers that Robokassa may reject
  // Use database-generated ID from payments table instead
  return Date.now().toString();
}
