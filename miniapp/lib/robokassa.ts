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
 * Generate Robokassa payment URL
 * @param amount - Payment amount (e.g., "1.00")
 * @param invId - Invoice ID (unique)
 * @param description - Payment description
 * @param userId - Telegram user ID (for Shp_userId parameter)
 * @param isTest - Use test mode
 * @returns Robokassa payment URL
 */
export function generateRobokassaUrl(
  amount: string,
  invId: string,
  description: string,
  userId: string,
  isTest: boolean = false
): string {
  // Format amount with 2 decimals
  const outSum = parseFloat(amount).toFixed(2);

  // Build signature parts: MerchantLogin:OutSum:InvId:Password1:Shp_*
  const signatureParts: string[] = [
    ROBOKASSA_MERCHANT_LOGIN,
    outSum,
    invId,
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

  // Build URL parameters
  const params = new URLSearchParams({
    MerchantLogin: ROBOKASSA_MERCHANT_LOGIN,
    OutSum: outSum,
    InvId: invId,
    Description: description,
    SignatureValue: signatureValue,
    Shp_userId: userId,
    ...(isTest && { IsTest: "1" }),
  });

  return `${ROBOKASSA_BASE_URL}?${params.toString()}`;
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
 */
export function generateInvoiceId(): string {
  return Date.now().toString();
}
