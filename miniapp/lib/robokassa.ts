/**
 * Robokassa payment utilities
 * Phase 1: Basic payment URL generation (without Receipt to avoid 500 errors)
 */

import { createHash } from 'crypto';

export interface RobokassaConfig {
  merchantLogin: string;
  password1: string;
  password2: string;
  isTest?: boolean;
}

/**
 * Calculate MD5 signature for Robokassa
 */
function calculateSignature(...args: (string | number)[]): string {
  const signatureString = args.map(arg => String(arg)).join(':');
  return createHash('md5').update(signatureString).digest('hex').toLowerCase();
}

/**
 * Generate payment URL for Robokassa
 * 
 * Phase 1: WITHOUT Receipt to avoid 500 errors
 * 
 * @param config - Robokassa configuration
 * @param amount - Payment amount (e.g., 1.00 for trial)
 * @param invoiceId - Unique invoice ID
 * @param description - Payment description
 * @param recurring - Whether this is a recurring payment (default: true for trial)
 * @param userId - User ID (optional, for Shp_userId parameter)
 * @returns Payment URL and signature data
 */
export function generatePaymentUrl(
  config: RobokassaConfig,
  amount: number,
  invoiceId: string,
  description: string,
  recurring: boolean = true,
  userId?: number
): { url: string; signature: string } {
  // Format amount with 2 decimal places
  const outSum = amount.toFixed(2);

  // Calculate signature: MerchantLogin:OutSum:InvId:Password1
  // NOTE: Phase 1 - NO Receipt in signature to avoid 500 errors
  const signature = calculateSignature(
    config.merchantLogin,
    outSum,
    invoiceId,
    config.password1
  );

  // Build URL parameters
  const params = new URLSearchParams({
    MerchantLogin: config.merchantLogin,
    OutSum: outSum,
    InvoiceID: invoiceId, // Robokassa expects InvoiceID (not InvId)
    Description: description,
    SignatureValue: signature,
  });

  // Add Recurring parameter if needed
  if (recurring) {
    params.append('Recurring', '1'); // IMPORTANT: "1", not "true"!
  }

  // Add test mode if configured
  if (config.isTest) {
    params.append('IsTest', '1');
  }

  // Add user ID as Shp parameter (Robokassa will return it in callback)
  if (userId) {
    params.append('Shp_userId', String(userId));
  }

  // Build full URL
  const baseUrl = config.isTest
    ? 'https://auth.robokassa.ru/Merchant/Index.aspx' // Test URL (same as production for now)
    : 'https://auth.robokassa.ru/Merchant/Index.aspx';

  const url = `${baseUrl}?${params.toString()}`;

  return { url, signature };
}

/**
 * Verify Robokassa result signature
 * 
 * @param config - Robokassa configuration
 * @param outSum - Amount from Robokassa
 * @param invId - Invoice ID from Robokassa
 * @param signature - Signature from Robokassa
 * @returns true if signature is valid
 */
export function verifyResultSignature(
  config: RobokassaConfig,
  outSum: string,
  invId: string,
  signature: string
): boolean {
  // Formula: OutSum:InvId:Password2
  const calculatedSignature = calculateSignature(
    outSum,
    invId,
    config.password2
  );

  return calculatedSignature.toLowerCase() === signature.toLowerCase();
}

/**
 * Get Robokassa config from environment variables
 */
export function getRobokassaConfig(): RobokassaConfig {
  const merchantLogin = process.env.ROBOKASSA_MERCHANT_LOGIN;
  const password1 = process.env.ROBOKASSA_PASSWORD1;
  const password2 = process.env.ROBOKASSA_PASSWORD2;

  if (!merchantLogin || !password1 || !password2) {
    throw new Error(
      'Robokassa credentials missing. Set ROBOKASSA_MERCHANT_LOGIN, ROBOKASSA_PASSWORD1, ROBOKASSA_PASSWORD2'
    );
  }

  return {
    merchantLogin,
    password1,
    password2,
    isTest: process.env.ROBOKASSA_TEST_MODE === 'true',
  };
}

