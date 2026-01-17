/**
 * Robokassa Payment Integration
 * Builds payment URLs and verifies signatures
 */

import crypto from "crypto";

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
 * Generate MD5 hash (lowercase hex)
 */
function md5Hash(input: string): string {
  return crypto.createHash("md5").update(input, "utf8").digest("hex").toLowerCase();
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

export function buildRobokassaPaymentUrl(params: PaymentUrlParams): { url: string; signature: string } | null {
  const config = getRobokassaConfig();
  if (!config) {
    return null;
  }

  const { invId, outSum, description, userId, planCode, method, returnPath = "/subscription" } = params;

  // Format outSum with 2 decimal places (required by Robokassa)
  const formattedOutSum = Number(outSum).toFixed(2);

  // Build Shp_ parameters
  const shpParams = buildShpParams({
    userId: String(userId),
    planCode,
    method,
    returnPath,
  });

  // Build signature string
  const signatureString = buildSignatureString(
    config.merchantLogin,
    formattedOutSum,
    invId,
    config.password1,
    shpParams
  );

  // Generate signature
  const signature = md5Hash(signatureString);

  // Build URL
  const url = new URL(config.baseUrl || "https://auth.robokassa.ru/Merchant/Index.aspx");
  url.searchParams.set("MerchantLogin", config.merchantLogin);
  url.searchParams.set("OutSum", formattedOutSum);
  url.searchParams.set("InvId", invId);
  url.searchParams.set("Description", description);
  url.searchParams.set("SignatureValue", signature);
  url.searchParams.set("IsTest", config.testMode ? "1" : "0");

  // Add Shp_ parameters
  Object.entries(shpParams).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  return { url: url.toString(), signature };
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

  const expectedSignature = md5Hash(signatureString).toLowerCase();

  return receivedSignature.toLowerCase() === expectedSignature;
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
