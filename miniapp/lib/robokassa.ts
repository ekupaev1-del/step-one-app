/**
 * Minimal Robokassa payment integration
 * Phase 1: One-time payment only (199.00 RUB)
 * 
 * Rules:
 * - Build finalFields FIRST, then compute signature ONLY from finalFields
 * - No filtering, no truthy removals
 * - Receipt always enabled (sno="npd")
 */

import crypto from 'crypto';
import { getRobokassaConfig } from './robokassaConfig';

/**
 * Format OutSum to stable string format (always 2 decimals)
 * Ensures consistent formatting: "199.00"
 */
export function formatOutSum(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (!Number.isFinite(num) || num < 0) {
    throw new Error(`Invalid amount for OutSum: ${amount}`);
  }
  return num.toFixed(2);
}

/**
 * Build Receipt JSON and encoded string
 * 
 * @param plan - Payment plan (currently only "month" supported)
 * @returns { json: object, encoded: string }
 */
export function buildReceipt(plan: string): { json: object; encoded: string } {
  if (plan !== 'month') {
    throw new Error(`Unsupported plan: ${plan}`);
  }

  const receiptJson = {
    sno: 'npd',
    items: [
      {
        name: 'Step One — 1 month',
        quantity: 1,
        sum: 199,
        payment_method: 'full_payment',
        payment_object: 'service',
        tax: 'none',
      },
    ],
  };

  const encoded = encodeURIComponent(JSON.stringify(receiptJson));
  return { json: receiptJson, encoded };
}

/**
 * Build MD5 signature from fields
 * 
 * Signature rule WITH Receipt:
 * MerchantLogin:OutSum:InvId:Receipt:Password1:Shp_userId=...
 * 
 * @param fields - Final fields object
 * @param password1 - Password #1
 * @returns { signatureValue: string, signatureStringMasked: string }
 */
export function buildSignature(
  fields: Record<string, string>,
  password1: string
): { signatureValue: string; signatureStringMasked: string } {
  // Extract Shp_* params and sort
  const shpParams: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (key.startsWith('Shp_')) {
      shpParams.push(`${key}=${String(value).trim()}`);
    }
  }
  shpParams.sort(); // Lexicographic sort

  // Build signature parts in correct order
  const signatureParts: string[] = [
    fields.MerchantLogin,
    fields.OutSum,
    fields.InvId,
  ];

  // Add Receipt BEFORE Password1 if present
  if (fields.Receipt) {
    signatureParts.push(fields.Receipt);
  }

  // Add Password1
  signatureParts.push(password1.trim());

  // Add Shp_* params AFTER Password1 (sorted)
  if (shpParams.length > 0) {
    signatureParts.push(...shpParams);
  }

  // Build signature string
  const signatureString = signatureParts.join(':');
  
  // Compute MD5 (lowercase hex)
  const signatureValue = crypto
    .createHash('md5')
    .update(signatureString, 'utf8')
    .digest('hex')
    .toLowerCase();

  // Mask password in signature string for logging
  const signatureStringMasked = signatureString.replace(
    password1.trim(),
    '[PASSWORD1_HIDDEN]'
  );

  return { signatureValue, signatureStringMasked };
}

/**
 * Generate InvId (digits only, <= 2^31-1)
 */
function generateInvId(): string {
  // Use timestamp-based ID (seconds since epoch)
  const timestampId = Math.floor(Date.now() / 1000).toString();
  
  // Ensure it's within valid range (max 2^31-1 = 2147483647)
  const maxId = 2147483647;
  const id = parseInt(timestampId, 10);
  
  if (id > maxId) {
    // If timestamp exceeds max, use random 9-10 digits
    const randomId = Math.floor(100000000 + Math.random() * 900000000);
    return randomId.toString();
  }
  
  return timestampId;
}

/**
 * Build Robokassa form
 * 
 * @param plan - Payment plan (currently only "month" supported)
 * @param userId - Telegram user ID
 * @returns Form data with fields, signature, and debug info
 */
export function buildForm(
  plan: string,
  userId: number
): {
  actionUrl: string;
  fieldsOrder: string[];
  fieldsObject: Record<string, string>;
  signatureStringMasked: string;
  debug: {
    merchantLogin: string;
    outSum: string;
    invId: string;
    hasReceipt: boolean;
    receiptEncodedLength: number;
    shpParams: string[];
  };
} {
  if (plan !== 'month') {
    throw new Error(`Unsupported plan: ${plan}`);
  }

  const config = getRobokassaConfig();
  const outSum = formatOutSum(199);
  const invId = generateInvId();
  const description = 'Step One — 1 month subscription';

  // Build Receipt
  const receipt = buildReceipt(plan);

  // ========== BUILD FINAL FIELDS FIRST ==========
  // CRITICAL: Build finalFields FIRST, no filtering, no truthy checks
  const finalFields: Record<string, string> = {
    MerchantLogin: config.merchantLogin.trim(),
    OutSum: outSum,
    InvId: invId,
    Description: description,
    Receipt: receipt.encoded,
    Shp_userId: String(userId),
  };

  // Add IsTest if test mode (NOT in signature)
  if (config.isTest) {
    finalFields.IsTest = '1';
  }

  // ========== BUILD SIGNATURE FROM FINAL FIELDS ==========
  // CRITICAL: Signature computed ONLY from finalFields values
  const { signatureValue, signatureStringMasked } = buildSignature(
    finalFields,
    config.pass1
  );

  // Add SignatureValue to finalFields
  finalFields.SignatureValue = signatureValue;

  // Define field order (for form submission)
  const fieldsOrder = [
    'MerchantLogin',
    'OutSum',
    'InvId',
    'Description',
    'Receipt',
    'Shp_userId',
    'SignatureValue',
  ];

  // Add IsTest at the end if present
  if (finalFields.IsTest) {
    fieldsOrder.push('IsTest');
  }

  // Extract Shp params for debug
  const shpParams: string[] = [];
  for (const [key, value] of Object.entries(finalFields)) {
    if (key.startsWith('Shp_')) {
      shpParams.push(`${key}=${value}`);
    }
  }
  shpParams.sort();

  return {
    actionUrl: 'https://auth.robokassa.ru/Merchant/Index.aspx',
    fieldsOrder,
    fieldsObject: finalFields,
    signatureStringMasked,
    debug: {
      merchantLogin: config.merchantLogin.trim(),
      outSum,
      invId,
      hasReceipt: true,
      receiptEncodedLength: receipt.encoded.length,
      shpParams,
    },
  };
}
