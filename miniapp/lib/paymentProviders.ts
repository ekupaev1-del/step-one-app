/**
 * Payment Provider Abstraction
 * Supports multiple providers: Robokassa, YooKassa, etc.
 */

import { createHash } from "crypto";

export type PaymentMethod = "sbp" | "card";
export type PaymentProvider = "robokassa" | "yookassa" | "cloudpayments";

export interface PaymentProviderConfig {
  provider: PaymentProvider;
  merchantLogin?: string;
  shopId?: string;
  password1?: string;
  password2?: string;
  secretKey?: string;
  publicKey?: string;
  baseUrl: string;
  isTest?: boolean;
}

export interface PaymentRequest {
  amount: string; // e.g., "199.00"
  invId: string; // Invoice ID
  description: string;
  telegramUserId: string;
  method: PaymentMethod;
  planCode: string;
  returnUrl: string;
}

export interface PaymentResponse {
  paymentUrl: string;
  invId: string;
  provider: PaymentProvider;
}

/**
 * Calculate MD5 signature
 */
function calculateMD5Signature(...parts: string[]): string {
  const signatureString = parts.join(":");
  const hash = createHash("md5").update(signatureString).digest("hex");
  return hash.toLowerCase();
}

/**
 * Generate Robokassa payment URL
 */
function generateRobokassaUrl(
  config: PaymentProviderConfig,
  request: PaymentRequest
): PaymentResponse {
  const { merchantLogin, password1, isTest = false } = config;
  const { amount, invId, description, telegramUserId, method, planCode } = request;

  if (!merchantLogin || !password1) {
    throw new Error("Robokassa credentials not configured");
  }

  const robokassaBaseUrl = isTest
    ? "https://auth.robokassa.ru/Merchant/Index.aspx"
    : "https://auth.robokassa.ru/Merchant/Index.aspx";

  // Build signature: MerchantLogin:OutSum:InvId:Password1
  const signatureParts = [merchantLogin, amount, invId, password1];
  const signatureValue = calculateMD5Signature(...signatureParts);

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
    provider: "robokassa",
  };
}

/**
 * Generate YooKassa payment URL (stub - requires credentials)
 */
function generateYooKassaUrl(
  config: PaymentProviderConfig,
  request: PaymentRequest
): PaymentResponse {
  // YooKassa requires API calls to create payment
  // This is a stub - implement when credentials are available
  throw new Error("YooKassa not yet implemented - requires API credentials");
}

/**
 * Generate payment URL based on provider
 */
export function generatePaymentUrl(
  config: PaymentProviderConfig,
  request: PaymentRequest
): PaymentResponse {
  switch (config.provider) {
    case "robokassa":
      return generateRobokassaUrl(config, request);
    case "yookassa":
      return generateYooKassaUrl(config, request);
    default:
      throw new Error(`Unsupported payment provider: ${config.provider}`);
  }
}

/**
 * Verify Robokassa callback signature (server-to-server, uses password2)
 */
export function verifyRobokassaCallback(
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
  if (!password2) return false;

  const { OutSum, InvId, SignatureValue, Shp_userId, Shp_planCode, Shp_method } = params;

  // Build signature: OutSum:InvId:Password2:Shp_*
  const signatureParts = [OutSum, InvId, password2];

  // Add Shp_ parameters in alphabetical order
  const shpParams: string[] = [];
  if (Shp_userId) shpParams.push(`Shp_userId=${Shp_userId}`);
  if (Shp_planCode) shpParams.push(`Shp_planCode=${Shp_planCode}`);
  if (Shp_method) shpParams.push(`Shp_method=${Shp_method}`);
  shpParams.sort();
  signatureParts.push(...shpParams);

  const expectedSignature = calculateMD5Signature(...signatureParts);
  return expectedSignature.toLowerCase() === SignatureValue.toLowerCase();
}

/**
 * Verify Robokassa return URL signature (user redirect, uses password1)
 */
export function verifyRobokassaReturn(
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
  if (!password1) return false;

  const { OutSum, InvId, SignatureValue, Shp_userId, Shp_planCode, Shp_method } = params;

  // Build signature: OutSum:InvId:Password1:Shp_*
  const signatureParts = [OutSum, InvId, password1];

  // Add Shp_ parameters in alphabetical order
  const shpParams: string[] = [];
  if (Shp_userId) shpParams.push(`Shp_userId=${Shp_userId}`);
  if (Shp_planCode) shpParams.push(`Shp_planCode=${Shp_planCode}`);
  if (Shp_method) shpParams.push(`Shp_method=${Shp_method}`);
  shpParams.sort();
  signatureParts.push(...shpParams);

  const expectedSignature = calculateMD5Signature(...signatureParts);
  return expectedSignature.toLowerCase() === SignatureValue.toLowerCase();
}

/**
 * Generate unique invoice ID
 */
export function generateInvoiceId(): string {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  return `${timestamp}${random}`;
}

/**
 * Get Robokassa environment variables with fallback support
 * Primary: ROBOKASSA_* (new naming)
 * Fallback: ROBO_* (backward compatibility)
 */
function getRobokassaEnvVars(): {
  merchantLogin: string | undefined;
  password1: string | undefined;
  password2: string | undefined;
  isTest: boolean;
  source: "ROBOKASSA_*" | "ROBO_*" | "mixed";
} {
  // Primary: ROBOKASSA_* (new naming)
  const robokassaMerchantLogin = process.env.ROBOKASSA_MERCHANT_LOGIN;
  const robokassaPassword1 = process.env.ROBOKASSA_PASSWORD1;
  const robokassaPassword2 = process.env.ROBOKASSA_PASSWORD2;
  const robokassaIsTest = process.env.ROBOKASSA_IS_TEST === "true";

  // Fallback: ROBO_* (backward compatibility)
  const roboMerchantLogin = process.env.ROBO_MERCHANT_LOGIN;
  const roboPassword1 = process.env.ROBO_PASSWORD1;
  const roboPassword2 = process.env.ROBO_PASSWORD2;
  const roboIsTest = process.env.ROBO_IS_TEST === "true";

  // Determine source
  const hasRobokassa = !!(robokassaMerchantLogin || robokassaPassword1 || robokassaPassword2);
  const hasRobo = !!(roboMerchantLogin || roboPassword1 || roboPassword2);
  let source: "ROBOKASSA_*" | "ROBO_*" | "mixed" = "ROBOKASSA_*";
  if (hasRobokassa && hasRobo) {
    source = "mixed";
  } else if (hasRobo && !hasRobokassa) {
    source = "ROBO_*";
  }

  // Use primary (ROBOKASSA_*) with fallback to ROBO_*
  const merchantLogin = robokassaMerchantLogin || roboMerchantLogin;
  const password1 = robokassaPassword1 || roboPassword1;
  const password2 = robokassaPassword2 || roboPassword2;
  const isTest = robokassaIsTest || roboIsTest;

  return {
    merchantLogin,
    password1,
    password2,
    isTest,
    source,
  };
}

/**
 * Get provider config from environment variables
 */
export function getProviderConfig(provider: PaymentProvider): PaymentProviderConfig | null {
  const baseUrl = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_VERCEL_URL || "";

  switch (provider) {
    case "robokassa": {
      const envVars = getRobokassaEnvVars();

      if (!envVars.merchantLogin || !envVars.password1 || !envVars.password2) {
        // Log which env vars are missing
        const missing: string[] = [];
        if (!envVars.merchantLogin) {
          missing.push("ROBOKASSA_MERCHANT_LOGIN (or ROBO_MERCHANT_LOGIN)");
        }
        if (!envVars.password1) {
          missing.push("ROBOKASSA_PASSWORD1 (or ROBO_PASSWORD1)");
        }
        if (!envVars.password2) {
          missing.push("ROBOKASSA_PASSWORD2 (or ROBO_PASSWORD2)");
        }
        console.error(
          `[paymentProviders] Robokassa not configured. Missing env vars: ${missing.join(", ")}. ` +
          `Checked: ROBOKASSA_MERCHANT_LOGIN=${!!process.env.ROBOKASSA_MERCHANT_LOGIN}, ` +
          `ROBOKASSA_PASSWORD1=${!!process.env.ROBOKASSA_PASSWORD1}, ` +
          `ROBOKASSA_PASSWORD2=${!!process.env.ROBOKASSA_PASSWORD2}, ` +
          `ROBO_MERCHANT_LOGIN=${!!process.env.ROBO_MERCHANT_LOGIN}, ` +
          `ROBO_PASSWORD1=${!!process.env.ROBO_PASSWORD1}, ` +
          `ROBO_PASSWORD2=${!!process.env.ROBO_PASSWORD2}`
        );
        return null;
      }

      console.log(
        `[paymentProviders] Robokassa config loaded from ${envVars.source} naming convention`
      );

      return {
        provider: "robokassa",
        merchantLogin: envVars.merchantLogin,
        password1: envVars.password1,
        password2: envVars.password2,
        baseUrl,
        isTest: envVars.isTest,
      };
    }

    case "yookassa":
      // Stub - implement when credentials available
      return null;

    default:
      return null;
  }
}

/**
 * Check Robokassa configuration status
 * Returns which env vars are present (without values)
 */
export function checkRobokassaConfig(): {
  configured: boolean;
  missingEnvVars: string[];
  envVarStatus: {
    robokassaMerchantLogin: boolean;
    robokassaPassword1: boolean;
    robokassaPassword2: boolean;
    roboMerchantLogin: boolean;
    roboPassword1: boolean;
    roboPassword2: boolean;
  };
  source: "ROBOKASSA_*" | "ROBO_*" | "mixed" | "none";
} {
  const envVars = getRobokassaEnvVars();
  const missing: string[] = [];

  if (!envVars.merchantLogin) {
    missing.push("ROBOKASSA_MERCHANT_LOGIN (or ROBO_MERCHANT_LOGIN)");
  }
  if (!envVars.password1) {
    missing.push("ROBOKASSA_PASSWORD1 (or ROBO_PASSWORD1)");
  }
  if (!envVars.password2) {
    missing.push("ROBOKASSA_PASSWORD2 (or ROBO_PASSWORD2)");
  }

  return {
    configured: !!(envVars.merchantLogin && envVars.password1 && envVars.password2),
    missingEnvVars: missing,
    envVarStatus: {
      robokassaMerchantLogin: !!process.env.ROBOKASSA_MERCHANT_LOGIN,
      robokassaPassword1: !!process.env.ROBOKASSA_PASSWORD1,
      robokassaPassword2: !!process.env.ROBOKASSA_PASSWORD2,
      roboMerchantLogin: !!process.env.ROBO_MERCHANT_LOGIN,
      roboPassword1: !!process.env.ROBO_PASSWORD1,
      roboPassword2: !!process.env.ROBO_PASSWORD2,
    },
    source: envVars.merchantLogin && envVars.password1 && envVars.password2 ? envVars.source : "none",
  };
}
