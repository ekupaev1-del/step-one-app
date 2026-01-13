/**
 * Payment Provider Integration (Robokassa)
 * Handles payment URL generation for SBP and Card methods
 */

import { createHash } from "crypto";

export interface PaymentProviderConfig {
  merchantLogin: string;
  password1: string;
  password2: string;
  baseUrl: string;
  isTest?: boolean;
}

export interface PaymentRequest {
  amount: string; // e.g., "199.00"
  invId: string; // Invoice ID (bigint as string)
  description: string;
  telegramUserId: string;
  method: "sbp" | "card";
  planCode: string;
}

export interface PaymentResponse {
  paymentUrl: string;
  invId: string;
}

/**
 * Calculate MD5 signature for Robokassa
 * Returns lowercase hex string (32 characters)
 */
function calculateSignature(...parts: string[]): string {
  const signatureString = parts.join(":");
  const hash = createHash("md5").update(signatureString).digest("hex");
  return hash.toLowerCase();
}

/**
 * Generate Robokassa payment URL
 */
export function generatePaymentUrl(
  config: PaymentProviderConfig,
  request: PaymentRequest
): PaymentResponse {
  const { merchantLogin, password1, baseUrl, isTest = false } = config;
  const { amount, invId, description, telegramUserId, method, planCode } = request;

  // Robokassa base URL
  const robokassaBaseUrl = isTest
    ? "https://auth.robokassa.ru/Merchant/Index.aspx"
    : "https://auth.robokassa.ru/Merchant/Index.aspx";

  // Build signature string: MerchantLogin:OutSum:InvId:Password1
  const signatureParts = [merchantLogin, amount, invId, password1];
  const signatureValue = calculateSignature(...signatureParts);

  // Build payment URL parameters
  const params = new URLSearchParams({
    MerchantLogin: merchantLogin,
    OutSum: amount,
    InvId: invId,
    Description: description,
    SignatureValue: signatureValue,
    IsTest: isTest ? "1" : "0",
    Shp_userId: telegramUserId,
    Shp_planCode: planCode,
    Shp_method: method,
  });

  // Add SBP parameter if SBP method selected
  if (method === "sbp") {
    params.append("PaymentMethod", "sbp");
  }

  const paymentUrl = `${robokassaBaseUrl}?${params.toString()}`;

  return {
    paymentUrl,
    invId,
  };
}

/**
 * Verify Robokassa callback signature (server-to-server, uses password2)
 */
export function verifyCallbackSignature(
  config: PaymentProviderConfig,
  params: {
    OutSum: string;
    InvId: string;
    SignatureValue: string;
    Shp_userId?: string;
    Shp_planCode?: string;
    Shp_method?: string;
  }
): boolean {
  const { password2 } = config;
  const { OutSum, InvId, SignatureValue, Shp_userId, Shp_planCode, Shp_method } = params;

  // Build signature string: OutSum:InvId:Password2:Shp_*
  const signatureParts = [OutSum, InvId, password2];

  // Add Shp_ parameters in alphabetical order
  const shpParams: string[] = [];
  if (Shp_userId) shpParams.push(`Shp_userId=${Shp_userId}`);
  if (Shp_planCode) shpParams.push(`Shp_planCode=${Shp_planCode}`);
  if (Shp_method) shpParams.push(`Shp_method=${Shp_method}`);
  shpParams.sort();
  signatureParts.push(...shpParams);

  const expectedSignature = calculateSignature(...signatureParts);
  return expectedSignature.toLowerCase() === SignatureValue.toLowerCase();
}

/**
 * Verify Robokassa return URL signature (user redirect, uses password1)
 */
export function verifyReturnSignature(
  config: PaymentProviderConfig,
  params: {
    OutSum: string;
    InvId: string;
    SignatureValue: string;
    Shp_userId?: string;
    Shp_planCode?: string;
    Shp_method?: string;
  }
): boolean {
  const { password1 } = config;
  const { OutSum, InvId, SignatureValue, Shp_userId, Shp_planCode, Shp_method } = params;

  // Build signature string: OutSum:InvId:Password1:Shp_*
  const signatureParts = [OutSum, InvId, password1];

  // Add Shp_ parameters in alphabetical order
  const shpParams: string[] = [];
  if (Shp_userId) shpParams.push(`Shp_userId=${Shp_userId}`);
  if (Shp_planCode) shpParams.push(`Shp_planCode=${Shp_planCode}`);
  if (Shp_method) shpParams.push(`Shp_method=${Shp_method}`);
  shpParams.sort();
  signatureParts.push(...shpParams);

  const expectedSignature = calculateSignature(...signatureParts);
  return expectedSignature.toLowerCase() === SignatureValue.toLowerCase();
}

/**
 * Generate unique invoice ID (timestamp-based)
 */
export function generateInvoiceId(): string {
  // Use timestamp in milliseconds + random component for uniqueness
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000);
  return `${timestamp}${random}`;
}
