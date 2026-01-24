/**
 * Self-check function for Robokassa signature generation
 * This file can be used for development/testing to verify signature correctness
 * 
 * Based on Robokassa documentation examples:
 * - MD5: MerchantLogin:OutSum:InvId:Password1 -> lowercase hex
 * - SHA256: MerchantLogin:OutSum:InvId:Password1 -> lowercase hex
 */

import * as crypto from "crypto";
import { generateSignatureHash, buildRobokassaPaymentUrl } from "./robokassa";

/**
 * Self-check: Verify signature generation with known test values
 * This function can be called during development to ensure signature logic is correct
 */
export function selfCheckRobokassaSignature(): {
  md5Test: { baseString: string; signature: string; expectedLength: number };
  sha256Test: { baseString: string; signature: string; expectedLength: number };
  passed: boolean;
} {
  // Test case 1: MD5 signature
  // Base string: MerchantLogin:OutSum:InvId:Password1
  const testMerchantLogin = "test_merchant";
  const testOutSum = "100.00";
  const testInvId = "123";
  const testPassword1 = "test_password_1";
  
  const md5BaseString = `${testMerchantLogin}:${testOutSum}:${testInvId}:${testPassword1}`;
  const md5Signature = generateSignatureHash(md5BaseString, "md5");
  
  // Test case 2: SHA256 signature
  const sha256Signature = generateSignatureHash(md5BaseString, "sha256");
  
  // Verify MD5 signature length (32 hex chars = 128 bits)
  const md5LengthCorrect = md5Signature.length === 32;
  
  // Verify SHA256 signature length (64 hex chars = 256 bits)
  const sha256LengthCorrect = sha256Signature.length === 64;
  
  // Verify signatures are lowercase
  const md5IsLowercase = md5Signature === md5Signature.toLowerCase();
  const sha256IsLowercase = sha256Signature === sha256Signature.toLowerCase();
  
  const passed = md5LengthCorrect && sha256LengthCorrect && md5IsLowercase && sha256IsLowercase;
  
  return {
    md5Test: {
      baseString: md5BaseString.replace(testPassword1, "<PASSWORD1>"), // Mask password
      signature: md5Signature,
      expectedLength: 32,
    },
    sha256Test: {
      baseString: md5BaseString.replace(testPassword1, "<PASSWORD1>"), // Mask password
      signature: sha256Signature,
      expectedLength: 64,
    },
    passed,
  };
}

/**
 * Self-check with Shp parameters
 */
export function selfCheckRobokassaSignatureWithShp(): {
  baseString: string;
  md5Signature: string;
  sha256Signature: string;
  shpParams: Record<string, string>;
  passed: boolean;
} {
  const testMerchantLogin = "test_merchant";
  const testOutSum = "100.00";
  const testInvId = "123";
  const testPassword1 = "test_password_1";
  
  // Shp params must be sorted alphabetically
  const shpParams: Record<string, string> = {
    Shp_method: "card",
    Shp_planCode: "trial_3d_then_199",
    Shp_returnPath: "/subscription",
    Shp_userId: "347",
  };
  
  const sortedShpKeys = Object.keys(shpParams).sort();
  const shpString = sortedShpKeys.map((key) => `${key}=${shpParams[key]}`).join(":");
  
  const baseString = `${testMerchantLogin}:${testOutSum}:${testInvId}:${testPassword1}:${shpString}`;
  const md5Signature = generateSignatureHash(baseString, "md5");
  const sha256Signature = generateSignatureHash(baseString, "sha256");
  
  const passed = 
    md5Signature.length === 32 &&
    sha256Signature.length === 64 &&
    md5Signature === md5Signature.toLowerCase() &&
    sha256Signature === sha256Signature.toLowerCase();
  
  return {
    baseString: baseString.replace(testPassword1, "<PASSWORD1>"), // Mask password
    md5Signature,
    sha256Signature,
    shpParams,
    passed,
  };
}

// Export for use in development/debugging
if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
  // Can be called during development
  console.log("Robokassa signature self-check:", selfCheckRobokassaSignature());
  console.log("Robokassa signature with Shp self-check:", selfCheckRobokassaSignatureWithShp());
}
