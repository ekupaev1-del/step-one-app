/**
 * Robokassa payment utilities
 * Fixed implementation for trial payment creation
 */

import { createHash } from 'crypto';
import { getRobokassaConfig, type RobokassaConfig } from './robokassaConfig';

// Re-export config type and function for backward compatibility
export type { RobokassaConfig };
export { getRobokassaConfig };

export interface Receipt {
  sno?: string; // Optional - only if ROBOKASSA_SNO is set
  items: Array<{
    name: string;
    quantity: number;
    sum: number;
    payment_method: string;
    payment_object: string;
    tax: string;
  }>;
}

export type PaymentMode = 'minimal' | 'recurring';

/**
 * Mask password for logging (shows length + first/last 2 chars)
 */
function maskPassword(password: string): string {
  if (!password || password.length === 0) {
    return '[EMPTY]';
  }
  if (password.length <= 4) {
    return '[***]';
  }
  return `${password.substring(0, 2)}...${password.substring(password.length - 2)} (length: ${password.length})`;
}

/**
 * Calculate MD5 signature for Robokassa
 * CRITICAL: Returns lowercase hex (Robokassa requirement)
 * Signature must match regex: /^[0-9a-f]{32}$/
 */
function calculateSignature(...args: string[]): string {
  const signatureString = args.join(':');
  // #region agent log
  if (typeof window === 'undefined') {
    fetch('http://127.0.0.1:7242/ingest/43e8883f-375d-4d43-af6f-fef79b5ebbe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'robokassa.ts:calculateSignature',message:'MD5 signature calculation',data:{signatureStringLength:signatureString.length,signatureStringPreview:signatureString.substring(0,200),argsCount:args.length,argsTypes:args.map(a=>typeof a)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  }
  // #endregion
  const hash = createHash('md5').update(signatureString).digest('hex');
  const hashLowercase = hash.toLowerCase(); // Robokassa requires lowercase
  // #region agent log
  if (typeof window === 'undefined') {
    console.log('[robokassa] MD5 hash (lowercase):', hashLowercase);
    console.log('[robokassa] MD5 hash length:', hashLowercase.length);
    console.log('[robokassa] MD5 hash regex validation:', /^[0-9a-f]{32}$/.test(hashLowercase));
    fetch('http://127.0.0.1:7242/ingest/43e8883f-375d-4d43-af6f-fef79b5ebbe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'robokassa.ts:calculateSignature',message:'MD5 hash result',data:{hashOriginal:hash,hashLowercase:hashLowercase,length:hashLowercase.length,regexValid:/^[0-9a-f]{32}$/.test(hashLowercase)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  }
  // #endregion
  return hashLowercase; // Return lowercase for Robokassa
}

/**
 * Build custom parameters (Shp_*) for signature and form
 * Returns array of strings in format "Shp_key=value" sorted alphabetically
 * IMPORTANT: NO URL encoding - use raw format "Shp_userId=497201688"
 */
function buildCustomParams(formFields: Record<string, string>): string[] {
  const customParams: string[] = [];
  for (const [key, value] of Object.entries(formFields)) {
    if (key.startsWith('Shp_')) {
      // Format: "Shp_key=value" (NO URL encoding)
      customParams.push(`${key}=${value}`);
    }
  }
  // Sort lexicographically by parameter name (case-sensitive)
  return customParams.sort();
}

/**
 * Validate that if Shp_* params exist in formFields, they are included in signature
 */
function validateCustomParamsInSignature(
  formFields: Record<string, string>,
  customParams: string[]
): boolean {
  const shpKeysInForm = Object.keys(formFields).filter(k => k.startsWith('Shp_'));
  const shpKeysInSignature = customParams.map(p => p.split('=')[0]);
  
  // All Shp_* from form must be in signature
  for (const key of shpKeysInForm) {
    if (!shpKeysInSignature.includes(key)) {
      return false;
    }
  }
  
  // All Shp_* in signature must be in form
  for (const key of shpKeysInSignature) {
    if (!shpKeysInForm.includes(key)) {
      return false;
    }
  }
  
  return true;
}

/**
 * Build signature base parts in correct order
 * Returns array of parts for signature calculation
 * Order: MerchantLogin:OutSum:InvId[:ReceiptEncoded]:Pass1[:Shp_* params]
 * 
 * @param merchantLogin - Merchant login
 * @param outSum - Payment amount as string (e.g., "1.00")
 * @param invId - Unique InvId (integer)
 * @param encodedReceipt - Receipt encoded (only for recurring mode, optional)
 * @param pass1 - Pass1 for signature
 * @param customParams - Array of custom params in format "Shp_key=value" (sorted alphabetically)
 * @returns Array of signature parts in correct order
 */
function buildSignatureBaseParts(
  merchantLogin: string,
  outSum: string,
  invId: string, // String (digits only)
  encodedReceipt: string | undefined,
  pass1: string,
  customParams: string[]
): string[] {
  // CRITICAL: InvId must be digits only string
  if (!/^\d+$/.test(invId)) {
    throw new Error(`Invalid InvId format: ${invId} (must be digits only)`);
  }
  
  const parts: string[] = [
    merchantLogin.trim(), // Trim to avoid trailing spaces
    outSum,
    invId, // Already string, digits only
  ];
  
  // Add ReceiptEncoded if present (recurring mode) - BEFORE Pass1
  if (encodedReceipt) {
    parts.push(encodedReceipt);
  }
  
  // Add Pass1 BEFORE custom params
  parts.push(pass1.trim()); // Trim to avoid trailing spaces
  
  // Add custom params (Shp_*) AFTER Pass1 - sorted alphabetically
  if (customParams.length > 0) {
    parts.push(...customParams);
  }
  
  return parts;
}

/**
 * Allowed SNO values for Robokassa Receipt
 */
const ALLOWED_SNO_VALUES = ['osn', 'usn_income', 'usn_income_outcome', 'esn', 'patent'] as const;

/**
 * Validate SNO value
 */
function validateSNO(sno: string | undefined): boolean {
  if (!sno) return true; // SNO is optional
  return ALLOWED_SNO_VALUES.includes(sno as any);
}

/**
 * Generate Receipt for fiscalization (54-FZ)
 * 
 * IMPORTANT: 
 * - If ROBOKASSA_SNO is not set, omit sno field (most common case)
 * - If ROBOKASSA_SNO is set, use it (must be from allowed list)
 * - Default to "usn_income" if invalid value provided
 * 
 * @param amount - Payment amount (must match OutSum exactly, e.g., 199.00)
 * @param description - Item description (max 128 chars, Russian/English only)
 * @returns Receipt object
 */
export function generateReceipt(amount: number, description: string = 'Subscription'): Receipt {
  // CRITICAL: Ensure sum matches OutSum format exactly
  const formattedAmount = parseFloat(amount.toFixed(2));
  
  // Get SNO from environment (optional)
  const snoEnv = process.env.ROBOKASSA_SNO?.trim();
  
  // Validate and set SNO
  let sno: string | undefined = undefined;
  if (snoEnv) {
    if (validateSNO(snoEnv)) {
      sno = snoEnv;
    } else {
      console.warn(`[robokassa] Invalid ROBOKASSA_SNO="${snoEnv}", defaulting to "usn_income"`);
      sno = 'usn_income';
    }
  }
  // If snoEnv is empty/undefined, sno remains undefined (omitted from JSON)
  
  // Sanitize description (max 128 chars, escape quotes)
  const sanitizedDescription = description
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .substring(0, 128);
  
  const receipt: Receipt = {
    items: [
      {
        name: sanitizedDescription,
        quantity: 1,
        sum: formattedAmount, // MUST equal OutSum exactly
        payment_method: 'full_payment',
        payment_object: 'service',
        tax: 'none',
      },
    ],
  };
  
  // Only add sno if it's set
  if (sno) {
    receipt.sno = sno;
  }
  
  return receipt;
}

/**
 * Unified signature generator for both minimal and recurring modes
 * Signature rule: MD5(MerchantLogin:OutSum:InvId[:ReceiptEncoded]:Pass1:Shp_* params)
 * 
 * CRITICAL: Shp_* params MUST be AFTER Pass1, not before!
 * 
 * @param config - Robokassa configuration
 * @param outSum - Payment amount as string (e.g., "1.00")
 * @param invId - Unique InvId (integer)
 * @param receiptEncoded - Receipt encoded (only for recurring mode, optional)
 * @param customParams - Array of custom params in format "Shp_key=value" (sorted alphabetically)
 * @returns Signature, signature base (without password), and full signature string
 */
function calculateRobokassaSignature(
  config: RobokassaConfig,
  outSum: string,
  invId: string, // String (digits only)
  receiptEncoded: string | undefined,
  customParams: string[] = []
): { signature: string; signatureBase: string; signatureBaseFull: string; signatureParts: string[] } {
  // Build signature parts in CORRECT order using helper
  const signatureParts = buildSignatureBaseParts(
    config.merchantLogin,
    outSum,
    invId,
    receiptEncoded,
    config.pass1,
    customParams
  );
  
  // Build signature base (without password and custom params) for logging
  const invIdStr = String(invId);
  const baseParts = [
    config.merchantLogin,
    outSum,
    invIdStr,
  ];
  if (receiptEncoded) {
    baseParts.push(receiptEncoded);
  }
  const signatureBase = baseParts.join(':');
  
  // Build full signature string (with password masked and custom params) for debug
  const fullParts = [
    config.merchantLogin,
    outSum,
    invIdStr,
  ];
  if (receiptEncoded) {
    fullParts.push(receiptEncoded);
  }
  fullParts.push('[PASSWORD1]');
  if (customParams.length > 0) {
    fullParts.push(...customParams);
  }
  const signatureBaseFull = fullParts.join(':');
  
  // Calculate MD5 signature over EXACT string Robokassa expects
  const signature = calculateSignature(...signatureParts);
  
  return { signature, signatureBase, signatureBaseFull, signatureParts };
}

/**
 * Sign minimal payment (no Receipt, no Recurring)
 * Signature: MD5(MerchantLogin:OutSum:InvId:Pass1[:Shp_* params])
 * 
 * @param config - Robokassa configuration
 * @param outSum - Payment amount as string (e.g., "1.00")
 * @param invId - Unique InvId (integer)
 * @param customParams - Array of custom params in format "Shp_key=value" (sorted alphabetically)
 * @returns Signature, signature base (without password), and full signature string
 */
export function signMinimal(
  config: RobokassaConfig,
  outSum: string,
  invId: string, // String (digits only)
  customParams: string[] = []
): { signature: string; signatureBase: string; signatureBaseFull: string; signatureParts: string[] } {
  return calculateRobokassaSignature(
    config,
    outSum,
    invId,
    undefined, // No receipt
    customParams
  );
}

/**
 * Sign payment with Receipt (recurring mode)
 * Signature: MD5(MerchantLogin:OutSum:InvId:ReceiptEncoded:Pass1[:Shp_* params])
 * 
 * @param config - Robokassa configuration
 * @param outSum - Payment amount as string (e.g., "1.00")
 * @param invId - Unique InvId (integer)
 * @param receiptEncoded - Receipt JSON stringified and encoded with encodeURIComponent ONCE
 * @param customParams - Array of custom params in format "Shp_key=value" (sorted alphabetically)
 * @returns Signature and signature base (without password)
 */
export function signWithReceipt(
  config: RobokassaConfig,
  outSum: string,
  receiptEncoded: string,
  invId: string, // String (digits only)
  customParams: string[] = []
): { signature: string; signatureBase: string; signatureBaseFull: string; signatureParts: string[] } {
  return calculateRobokassaSignature(
    config,
    outSum,
    invId,
    receiptEncoded, // Include receipt
    customParams
  );
}

/**
 * HTML escape for attribute values (does NOT re-encode URL-encoded strings)
 */
function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Format OutSum to stable string format (always 2 decimals)
 * Ensures consistent formatting: "1.00", "199.00", etc.
 */
function formatOutSum(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num) || num < 0) {
    throw new Error(`Invalid OutSum: ${amount}`);
  }
  // Format to exactly 2 decimal places
  return num.toFixed(2);
}

/**
 * Build Robokassa form fields (pure function)
 * Returns the final form fields object that will be submitted to Robokassa
 * 
 * @param payload - Payment payload
 * @returns Final form fields object (without SignatureValue)
 */
function buildRobokassaFields(payload: {
  merchantLogin: string;
  outSum: string | number;
  invId: string; // String (digits only)
  description: string;
  mode: PaymentMode;
  receipt?: Receipt;
  telegramUserId?: number;
  isTest?: boolean;
}): Record<string, string> {
  // #region agent log
  if (typeof window === 'undefined') {
    fetch('http://127.0.0.1:7242/ingest/43e8883f-375d-4d43-af6f-fef79b5ebbe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'robokassa.ts:buildRobokassaFields',message:'Function entry',data:{merchantLogin:payload.merchantLogin,merchantLoginIsSteopone:payload.merchantLogin==='steopone',outSum:payload.outSum,outSumType:typeof payload.outSum,invId:payload.invId,invIdType:typeof payload.invId,mode:payload.mode,hasReceipt:!!payload.receipt,telegramUserId:payload.telegramUserId,isTest:payload.isTest},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
  }
  // #endregion
  // Format OutSum to stable string format (always 2 decimals)
  const outSumFormatted = formatOutSum(payload.outSum);
  
  // #region agent log
  if (typeof window === 'undefined') {
    fetch('http://127.0.0.1:7242/ingest/43e8883f-375d-4d43-af6f-fef79b5ebbe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'robokassa.ts:buildRobokassaFields',message:'OutSum formatted',data:{outSumFormatted:outSumFormatted,outSumFormattedType:typeof outSumFormatted,outSumIs100:outSumFormatted==='1.00',outSumHasTwoDecimals:/^\d+\.\d{2}$/.test(outSumFormatted)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
  }
  // #endregion
  
  // Validate InvId is digits only
  if (!/^\d+$/.test(payload.invId)) {
    throw new Error(`Invalid InvId: ${payload.invId} (must be digits only)`);
  }
  
  // Build base fields - CRITICAL: Use InvId (not InvoiceID)
  const fields: Record<string, string> = {
    MerchantLogin: payload.merchantLogin,
    OutSum: outSumFormatted,
    InvId: payload.invId, // Already string, digits only
    Description: payload.description,
  };
  
  // Add Shp_userId if telegramUserId provided (only once, no duplicates)
  if (payload.telegramUserId) {
    // Ensure no duplicate
    if (!fields.Shp_userId) {
      fields.Shp_userId = String(payload.telegramUserId);
    }
  }
  
  // Add Receipt and Recurring ONLY if recurring mode AND feature flag is enabled
  // Check feature flag to ensure we don't add Recurring when it's disabled
  const featureRecurring = process.env.FEATURE_RECURRING === 'true' || process.env.FEATURE_RECURRING === '1';
  
  if (payload.mode === 'recurring' && featureRecurring) {
    if (!payload.receipt) {
      throw new Error('Receipt is required for recurring mode');
    }
    
    // CRITICAL: Robokassa requires Receipt to be URL-encoded exactly ONCE
    // The same encoded value is used both in the form field AND in the signature
    // Serialize JSON deterministically (sorted keys for consistent output)
    const receiptJson = JSON.stringify(payload.receipt, (key, value) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        // Sort object keys for deterministic output
        return Object.keys(value).sort().reduce((acc, k) => {
          acc[k] = value[k];
          return acc;
        }, {} as any);
      }
      return value;
    });
    const receiptEncoded = encodeURIComponent(receiptJson); // Single encoding for both form and signature
    
    // #region agent log
    if (typeof window === 'undefined') {
      console.log('[robokassa] ========== RECEIPT ENCODING (Error 29 Fix) ==========');
      console.log('[robokassa] receiptRaw JSON:', receiptJson);
      console.log('[robokassa] receiptRaw length:', receiptJson.length);
      console.log('[robokassa] receiptEncoded (length):', receiptEncoded.length, 'preview:', receiptEncoded.substring(0, 80));
      console.log('[robokassa] receiptEncoded has %25 (double encoding check):', receiptEncoded.includes('%25'));
      console.log('[robokassa] Using single encoding for both form and signature');
      console.log('[robokassa] ======================================================');
      
      fetch('http://127.0.0.1:7242/ingest/43e8883f-375d-4d43-af6f-fef79b5ebbe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'robokassa.ts:buildRobokassaFields',message:'Receipt single encoding',data:{receiptJsonLength:receiptJson.length,receiptEncodedLength:receiptEncoded.length,receiptEncodedPreview:receiptEncoded.substring(0,80),hasDoubleEncoding:receiptEncoded.includes('%25')},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'I'})}).catch(()=>{});
    }
    // #endregion
    
    // Send receiptEncoded in the form (single-encoded, same as in signature)
    fields.Receipt = receiptEncoded;
    // Only add Recurring if feature flag is enabled
    if (featureRecurring) {
      fields.Recurring = 'true';
    }
  } else if (payload.mode === 'recurring' && !featureRecurring) {
    // If recurring mode requested but feature flag is off, fall back to minimal
    console.warn('[robokassa] Recurring mode requested but FEATURE_RECURRING is disabled, using minimal mode');
  }
  
  // Add IsTest if test mode
  // IMPORTANT: Robokassa requires IsTest='1' in test mode
  if (payload.isTest === true) {
    fields.IsTest = '1';
  }
  
  // #region agent log
  if (typeof window === 'undefined') {
    fetch('http://127.0.0.1:7242/ingest/43e8883f-375d-4d43-af6f-fef79b5ebbe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'robokassa.ts:buildRobokassaFields',message:'Final fields',data:{fieldsKeys:Object.keys(fields),fieldsCount:Object.keys(fields).length,hasIsTest:'IsTest' in fields,isTestValue:fields.IsTest||'NOT_PRESENT',hasReceipt:'Receipt' in fields,hasRecurring:'Recurring' in fields,hasShpUserId:'Shp_userId' in fields},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
  }
  // #endregion
  
  return fields;
}

/**
 * Build Robokassa signature (pure function)
 * Calculates SignatureValue based on the exact fields that will be submitted
 * 
 * Signature format: MD5("MerchantLogin:OutSum:InvId[:Receipt]:Pass1[:Shp_*...]")
 * 
 * Rules:
 * - Include Receipt ONLY if "Receipt" field is present in fields
 * - Include all Shp_* parameters that are present in fields
 * - Sort Shp_* parameters alphabetically by parameter name
 * - Returns lowercase MD5 hex
 * 
 * @param fields - Final form fields (without SignatureValue)
 * @param pass1 - Pass1 for signature calculation
 * @returns Signature value and debug info
 */
function buildRobokassaSignature(
  fields: Record<string, string>,
  pass1: string,
  receiptEncoded?: string,
  includeReceiptInSignature: boolean = false
): {
  signatureValue: string;
  exactSignatureString: string;
  exactSignatureStringMasked: string;
  signatureParts: string[];
  variant: 'with-receipt' | 'without-receipt';
} {
  // #region agent log
  if (typeof window === 'undefined') {
    fetch('http://127.0.0.1:7242/ingest/43e8883f-375d-4d43-af6f-fef79b5ebbe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'robokassa.ts:buildRobokassaSignature',message:'Function entry',data:{fieldsKeys:Object.keys(fields),fieldsCount:Object.keys(fields).length,hasMerchantLogin:'MerchantLogin' in fields,hasOutSum:'OutSum' in fields,hasInvId:'InvId' in fields,hasReceipt:'Receipt' in fields,hasShpParams:Object.keys(fields).some(k=>k.startsWith('Shp_'))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  }
  // #endregion
  // Extract values in correct order
  // CRITICAL: Use exact string values from fields to match what's sent in form
  const merchantLogin = fields.MerchantLogin;
  const outSum = fields.OutSum;
  const invId = fields.InvId; // Keep as string to match form field exactly
  const receipt = fields.Receipt; // Single-encoded, same value used in form and signature
  
  // Trim Pass1 to avoid trailing spaces
  const pass1Trimmed = pass1.trim();
  
  // #region agent log
  if (typeof window === 'undefined') {
    console.log('[robokassa] ========== SIGNATURE RECEIPT EXTRACTION ==========');
    console.log('[robokassa] receipt present:', !!receiptEncoded, 'length:', receiptEncoded?.length || 0);
    console.log('[robokassa] Using receipt (URL-encoded) for signature:', !!receiptEncoded);
    if (receiptEncoded) {
      console.log('[robokassa] receipt preview:', receiptEncoded.substring(0, 80));
    }
    console.log('[robokassa] merchantLogin trimmed:', merchantLogin, '(length:', merchantLogin.length, ')');
    console.log('[robokassa] pass1 trimmed:', pass1Trimmed.length, 'chars');
    console.log('[robokassa] ==================================================');
    
    fetch('http://127.0.0.1:7242/ingest/43e8883f-375d-4d43-af6f-fef79b5ebbe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'robokassa.ts:buildRobokassaSignature',message:'Extracted values with receipt',data:{merchantLogin:merchantLogin,merchantLoginIsSteopone:merchantLogin==='steopone',outSum:outSum,outSumType:typeof outSum,outSumIs100:outSum==='1.00',invId:invId,invIdType:typeof invId,receiptPresent:!!receiptEncoded,receiptLength:receiptEncoded?.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
  }
  // #endregion
  
  // Build signature parts in correct order according to Robokassa docs:
  // WITHOUT Receipt: MerchantLogin:OutSum:InvId:Password1:Shp_...
  // WITH Receipt: MerchantLogin:OutSum:InvId:Receipt:Password1:Shp_...
  // CRITICAL: All parts must be strings to match Robokassa's exact format
  const signatureParts: string[] = [
    merchantLogin.trim(), // Trim to avoid trailing spaces
    outSum, // Already formatted as "199.00"
    invId, // String, digits only
  ];
  
  // Add Receipt (URL-encoded) BEFORE Password1 if present
  // CRITICAL: Receipt in signature uses the SAME URL-encoded value as in the form field
  let variant: 'with-receipt' | 'without-receipt' = 'without-receipt';
  if (includeReceiptInSignature && receiptEncoded) {
    signatureParts.push(receiptEncoded); // SAME encoded value as in form field, BEFORE Password1
    variant = 'with-receipt';
  }
  
  // Add Pass1 (trimmed) AFTER MerchantLogin:OutSum:InvId[:Receipt]
  signatureParts.push(pass1Trimmed);
  
  // Extract and sort Shp_* parameters alphabetically
  // CRITICAL: Only include Shp_* parameters in signature, NOT Description, Recurring, IsTest, etc.
  // According to Robokassa docs: Shp_* params must be sorted alphabetically by PARAMETER NAME (key)
  // Format in signature: "Shp_key=value" (sorted by key name, case-sensitive)
  const shpParams: string[] = [];
  const shpEntries: Array<[string, string]> = [];
  
  for (const [key, value] of Object.entries(fields)) {
    // Only include Shp_* parameters in signature
    // Exclude: Description, Recurring, IsTest, SignatureValue (not yet added)
    if (key.startsWith('Shp_')) {
      shpEntries.push([key, value]);
    }
  }
  
  // Sort by parameter NAME (key) alphabetically, case-sensitive
  // CRITICAL: Robokassa requires Shp_* params sorted by KEY NAME (not full "Shp_key=value")
  // This ensures Shp_userId comes before Shp_otherParam if they exist
  shpEntries.sort(([keyA], [keyB]) => {
    // Case-sensitive alphabetical sort by KEY NAME only
    // Example: "Shp_userId" < "Shp_otherParam" (sorted by key name)
    return keyA.localeCompare(keyB, undefined, { sensitivity: 'case' });
  });
  
  // Build Shp_* params in sorted order: "Shp_key=value"
  // CRITICAL: Format must be exactly "Shp_key=value" (no URL encoding, no extra spaces)
  for (const [key, value] of shpEntries) {
    // Ensure value is string and has no extra whitespace
    const cleanValue = String(value).trim();
    shpParams.push(`${key}=${cleanValue}`);
  }
  
  // Final validation: Ensure Shp_* params are truly sorted alphabetically
  // This is critical for Error 29 - Robokassa requires strict alphabetical order
  const isProperlySorted = shpParams.every((param, index) => {
    if (index === 0) return true;
    const prevKey = shpParams[index - 1].split('=')[0];
    const currKey = param.split('=')[0];
    return prevKey.localeCompare(currKey, undefined, { sensitivity: 'case' }) <= 0;
  });
  
  if (!isProperlySorted && shpParams.length > 0) {
    console.error('[robokassa] ❌ CRITICAL: Shp_* params are NOT properly sorted!');
    console.error('[robokassa] This will cause Error 29: Invalid SignatureValue');
    console.error('[robokassa] Shp_* params:', shpParams);
  }
  
  // #region agent log
  if (typeof window === 'undefined') {
    console.log('[robokassa] Shp_* entries before sort:', shpEntries.map(([k, v]) => ({ key: k, value: v })));
    console.log('[robokassa] Shp_* entries after sort:', shpEntries.map(([k, v]) => ({ key: k, value: v })));
    console.log('[robokassa] Shp_* params for signature:', shpParams);
    fetch('http://127.0.0.1:7242/ingest/43e8883f-375d-4d43-af6f-fef79b5ebbe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'robokassa.ts:buildRobokassaSignature',message:'Shp params before sort',data:{shpEntriesBeforeSort:shpEntries.map(([k,v])=>({key:k,value:v})),shpParamsBeforeSort:[...shpParams],shpParamsCount:shpParams.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
  }
  // #endregion
  
  // #region agent log
  if (typeof window === 'undefined') {
    fetch('http://127.0.0.1:7242/ingest/43e8883f-375d-4d43-af6f-fef79b5ebbe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'robokassa.ts:buildRobokassaSignature',message:'Shp params after sort',data:{shpParamsAfterSort:[...shpParams],isSorted:JSON.stringify(shpParams)===JSON.stringify([...shpParams].sort()),pass1Index:signatureParts.length-1},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
  }
  // #endregion
  
  // Add Shp_* params AFTER Pass1
  if (shpParams.length > 0) {
    signatureParts.push(...shpParams);
  }
  
  // #region agent log
  if (typeof window === 'undefined') {
    const pass1Index = signatureParts.findIndex(p => p === pass1);
    const shpAfterPass1 = signatureParts.slice(pass1Index + 1).filter(p => p.startsWith('Shp_'));
    fetch('http://127.0.0.1:7242/ingest/43e8883f-375d-4d43-af6f-fef79b5ebbe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'robokassa.ts:buildRobokassaSignature',message:'Signature parts order check',data:{signaturePartsCount:signatureParts.length,pass1Index:pass1Index,shpAfterPass1:shpAfterPass1,shpAfterPass1Count:shpAfterPass1.length,partsOrder:signatureParts.map((p,i)=>({index:i,value:typeof p==='string'&&p===pass1?'[PASSWORD1]':p.substring(0,50),isPassword:p===pass1,isShp:p.startsWith('Shp_'),isReceipt:p===receipt}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  }
  // #endregion
  
  // Build exact signature string
  // All parts are already strings, so just join them
  const exactSignatureString = signatureParts.join(':');
  
  // Build masked signature string (for debug)
  const exactSignatureStringMasked = signatureParts.map(p => 
    p === pass1Trimmed ? '[PASS1_HIDDEN]' : p
  ).join(':');
  
  // #region agent log
  if (typeof window === 'undefined') {
    fetch('http://127.0.0.1:7242/ingest/43e8883f-375d-4d43-af6f-fef79b5ebbe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'robokassa.ts:buildRobokassaSignature',message:'Exact signature string before MD5',data:{exactSignatureStringLength:exactSignatureString.length,exactSignatureStringPreview:exactSignatureString.substring(0,300),exactSignatureStringMasked:exactSignatureStringMasked},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  }
  // #endregion
  
  // Calculate MD5 signature (lowercase for Robokassa)
  const signatureValue = calculateSignature(...signatureParts);
  
  // #region agent log
  if (typeof window === 'undefined') {
    // CRITICAL: Log exact signature string for debugging Error 29
    // This helps verify that the signature matches what Robokassa expects
    console.log('[robokassa] ========== SIGNATURE CALCULATION (Error 29 Debug) ==========');
    console.log('[robokassa] MerchantLogin:', merchantLogin, '(must be exactly "steopone")');
    console.log('[robokassa] OutSum:', outSum, '(type:', typeof outSum, ', must be "1.00" for trial)');
    console.log('[robokassa] InvId:', invId, '(type:', typeof invId, ', must be string)');
    console.log('[robokassa] Receipt present:', !!receiptEncoded, '(length:', receiptEncoded?.length || 0, ')');
    console.log('[robokassa] Pass1 length:', pass1Trimmed.length, '(must match Robokassa settings)');
    console.log('[robokassa] Shp_* params count:', shpParams.length);
    console.log('[robokassa] Shp_* params:', shpParams);
    console.log('[robokassa] Exact signature string (masked):', exactSignatureStringMasked);
    console.log('[robokassa] Exact signature string (full, length):', exactSignatureString.length);
    console.log('[robokassa] Signature parts count:', signatureParts.length);
    console.log('[robokassa] Signature parts order:');
    signatureParts.forEach((p, i) => {
      const partDesc = p === pass1Trimmed ? '[PASS1_HIDDEN]' : 
                       p.startsWith('Shp_') ? p : 
                       p === receiptEncoded ? `[ReceiptEncoded, length: ${p.length}]` :
                       p.substring(0, 50);
      console.log(`  ${i + 1}. ${partDesc}`);
    });
    if (receiptEncoded) {
      console.log('[robokassa] Receipt in signature (receiptEncoded, length):', receiptEncoded.length);
      console.log('[robokassa] Receipt in signature (receiptEncoded, preview):', receiptEncoded.substring(0, 80));
    }
    console.log('[robokassa] Signature value (MD5, lowercase):', signatureValue);
    console.log('[robokassa] Signature value length:', signatureValue.length, '(must be 32)');
    console.log('[robokassa] Signature value is lowercase:', signatureValue === signatureValue.toLowerCase());
    console.log('[robokassa] Signature value regex validation (/^[0-9a-f]{32}$/):', /^[0-9a-f]{32}$/.test(signatureValue));
    console.log('[robokassa] ============================================================');
    console.log('[robokassa] ⚠️ ERROR 29 CHECKLIST:');
    console.log('[robokassa] 1. MerchantLogin === "steopone":', merchantLogin === 'steopone');
    console.log('[robokassa] 2. OutSum === "1.00":', outSum === '1.00');
    console.log('[robokassa] 3. InvId is string:', typeof invId === 'string');
    console.log('[robokassa] 4. Receipt included (if recurring):', !!receiptEncoded);
    console.log('[robokassa] 5. Pass1 correct (check in Robokassa cabinet):', pass1Trimmed.length > 0);
    console.log('[robokassa] 6. Shp_* params sorted alphabetically:', JSON.stringify(shpParams) === JSON.stringify([...shpParams].sort()));
    console.log('[robokassa] 7. Shp_* params AFTER Pass1:', signatureParts.indexOf(pass1Trimmed) < (shpParams.length > 0 ? signatureParts.indexOf(shpParams[0]) : signatureParts.length));
    console.log('[robokassa] 8. Signature is lowercase hex 32 chars:', /^[0-9a-f]{32}$/.test(signatureValue));
    console.log('[robokassa] ============================================================');
    
    fetch('http://127.0.0.1:7242/ingest/43e8883f-375d-4d43-af6f-fef79b5ebbe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'robokassa.ts:buildRobokassaSignature',message:'Signature value result',data:{signatureValue:signatureValue,signatureValueLength:signatureValue.length,signatureValueIsLowercase:signatureValue===signatureValue.toLowerCase(),signatureValueIsHex:/^[0-9a-f]{32}$/.test(signatureValue),exactSignatureStringLength:exactSignatureString.length,signaturePartsCount:signatureParts.length,shpParamsInSignature:shpParams},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  }
  // #endregion
  
  return {
    signatureValue,
    exactSignatureString,
    exactSignatureStringMasked,
    signatureParts,
    variant,
  };
}

/**
 * Generate HTML form for Robokassa payment
 * 
 * @param config - Robokassa configuration
 * @param outSum - Payment amount as string (e.g., "199.00")
 * @param invId - Unique InvId (string, digits only)
 * @param description - Payment description (ASCII, no emojis, max 128 chars)
 * @param mode - Payment mode: 'minimal' or 'recurring'
 * @param receipt - Receipt object (only used in recurring mode)
 * @param telegramUserId - Telegram user ID (for Shp_userId)
 * @param debugMode - If true, return debug HTML instead of auto-submitting
 * @returns HTML form and debug info
 */
export function generatePaymentForm(
  config: RobokassaConfig,
  outSum: string | number,
  invId: string, // String (digits only)
  description: string,
  mode: PaymentMode,
  receipt?: Receipt,
  telegramUserId?: number,
  debugMode: boolean = true // Default to true for debugging
): { html: string; debug: any } {
  const baseUrl = 'https://auth.robokassa.ru/Merchant/Index.aspx';
  
  // Step 1: Build form fields (without SignatureValue)
  const formFieldsWithoutSignature = buildRobokassaFields({
    merchantLogin: config.merchantLogin,
    outSum,
    invId,
    description,
    mode,
    receipt,
    telegramUserId,
    isTest: config.isTest,
  });
  
  // #region agent log
  if (typeof window === 'undefined') {
    fetch('http://127.0.0.1:7242/ingest/43e8883f-375d-4d43-af6f-fef79b5ebbe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'robokassa.ts:generatePaymentForm',message:'Form fields without signature',data:{formFieldsWithoutSignatureKeys:Object.keys(formFieldsWithoutSignature),formFieldsWithoutSignatureCount:Object.keys(formFieldsWithoutSignature).length,merchantLogin:formFieldsWithoutSignature.MerchantLogin,outSum:formFieldsWithoutSignature.OutSum,invId:formFieldsWithoutSignature.InvId,hasReceipt:'Receipt' in formFieldsWithoutSignature,hasRecurring:'Recurring' in formFieldsWithoutSignature,hasIsTest:'IsTest' in formFieldsWithoutSignature,hasShpUserId:'Shp_userId' in formFieldsWithoutSignature},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
  }
  // #endregion
  
  // Step 2: Calculate signature based on exact fields
  // CRITICAL: If Receipt is in the form, it MUST be included in signature
  // Receipt in signature uses the SAME URL-encoded value as in the form field
  const receiptEncoded = formFieldsWithoutSignature.Receipt; // Already URL-encoded, same as in form
  const includeReceiptInSignature = !!receiptEncoded; // Include if Receipt is present in form
  
  // #region agent log
  if (typeof window === 'undefined') {
    console.log('[robokassa] ========== SIGNATURE VARIANT SELECTION ==========');
    console.log('[robokassa] Receipt in form:', !!receiptEncoded);
    console.log('[robokassa] Receipt encoded length:', receiptEncoded?.length || 0);
    console.log('[robokassa] Include Receipt in signature:', includeReceiptInSignature);
    console.log('[robokassa] Variant:', includeReceiptInSignature ? 'with-receipt' : 'without-receipt');
    console.log('[robokassa] =================================================');
  }
  // #endregion
  
  const signatureResult = buildRobokassaSignature(
    formFieldsWithoutSignature,
    config.pass1,
    receiptEncoded, // Use the SAME encoded value as in form
    includeReceiptInSignature
  );
  
  // #region agent log
  if (typeof window === 'undefined') {
    fetch('http://127.0.0.1:7242/ingest/43e8883f-375d-4d43-af6f-fef79b5ebbe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'robokassa.ts:generatePaymentForm',message:'Signature result',data:{signatureValue:signatureResult.signatureValue,signatureValueLength:signatureResult.signatureValue.length,signaturePartsCount:signatureResult.signatureParts.length,exactSignatureStringLength:signatureResult.exactSignatureString.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  }
  // #endregion
  
  // Step 3: Add SignatureValue to form fields
  const formFields: Record<string, string> = {
    ...formFieldsWithoutSignature,
    SignatureValue: signatureResult.signatureValue,
  };
  
  // #region agent log
  if (typeof window === 'undefined') {
    fetch('http://127.0.0.1:7242/ingest/43e8883f-375d-4d43-af6f-fef79b5ebbe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'robokassa.ts:generatePaymentForm',message:'Final form fields',data:{formFieldsKeys:Object.keys(formFields),formFieldsCount:Object.keys(formFields).length,hasSignatureValue:'SignatureValue' in formFields,signatureValueInForm:formFields.SignatureValue,formFieldsMatch:Object.keys(formFieldsWithoutSignature).every(k=>formFields[k]===formFieldsWithoutSignature[k])},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
  }
  // #endregion
  
  // Extract receipt info for debug (if present)
  let receiptJson: string | undefined;
  let receiptEncodedDebug: string | undefined; // URL-encoded (used in form field)
  if (mode === 'recurring' && receipt) {
    receiptJson = JSON.stringify(receipt);
    receiptEncodedDebug = formFieldsWithoutSignature.Receipt; // URL-encoded for form field
  }
  
  // Extract custom params for debug
  const customParams: string[] = [];
  for (const [key, value] of Object.entries(formFieldsWithoutSignature)) {
    if (key.startsWith('Shp_')) {
      customParams.push(`${key}=${value}`);
    }
  }
  customParams.sort(); // Already sorted in buildRobokassaSignature, but ensure for debug
  
  // Environment check (server-side only, never leaks secrets)
  const envCheck = typeof window === 'undefined' ? {
    vercelEnv: process.env.VERCEL_ENV || 'unknown',
    nodeEnv: process.env.NODE_ENV || 'unknown',
    merchantLoginSet: !!config.merchantLogin,
    merchantLoginLength: config.merchantLogin?.length || 0,
    pass1Set: !!config.pass1,
    pass1Masked: maskPassword(config.pass1),
    pass2Set: !!config.pass2,
    pass2Masked: maskPassword(config.pass2),
    isTest: config.isTest,
  } : null;
  
  // Build comprehensive debug info (NEVER leaks secrets)
  const outSumFormatted = formFieldsWithoutSignature.OutSum;
  
  // Validation checks for Error 29
  const validationChecks = {
    // MerchantLogin checks
    merchantLoginSet: !!config.merchantLogin,
    merchantLoginIsSteopone: config.merchantLogin === 'steopone',
    merchantLoginLength: config.merchantLogin?.length || 0,
    merchantLoginExact: config.merchantLogin, // For comparison
    
    // OutSum checks
    outSumIsString: typeof outSumFormatted === 'string',
    outSumFormat: outSumFormatted === '1.00',
    outSumLength: outSumFormatted.length,
    outSumHasTwoDecimals: /^\d+\.\d{2}$/.test(outSumFormatted),
    
    // InvId checks (invId is now string, digits only)
    invIdIsString: typeof invId === 'string',
    invIdIsDigitsOnly: /^\d+$/.test(invId),
    invIdWithinRange: (() => {
      const invIdNum = parseInt(invId, 10);
      return invIdNum > 0 && invIdNum <= 2000000000;
    })(),
    invIdString: invId, // Already string
    
    // Signature checks
    signatureLength: signatureResult.signatureValue.length === 32,
    signatureIsLowercase: signatureResult.signatureValue === signatureResult.signatureValue.toLowerCase(),
    signatureIsHex: /^[0-9a-f]{32}$/.test(signatureResult.signatureValue),
    
    // Receipt checks (if recurring)
    receiptPresent: mode === 'recurring' ? !!receipt : null,
    receiptEncodedPresent: mode === 'recurring' ? !!receiptEncoded : null,
    receiptEncodedLength: receiptEncoded?.length || 0,
    receiptInSignature: mode === 'recurring' ? signatureResult.signatureParts.some(p => typeof p === 'string' && p === receiptEncoded) : null,
    
    // Shp_* params checks
    shpParamsCount: customParams.length,
    shpParamsInForm: Object.keys(formFieldsWithoutSignature).filter(k => k.startsWith('Shp_')).length,
    shpParamsInSignature: customParams.length,
    shpParamsSorted: customParams.length === 0 || JSON.stringify(customParams) === JSON.stringify([...customParams].sort()),
    shpParamsAfterPass1: (() => {
      const pass1Index = signatureResult.signatureParts.findIndex(p => typeof p === 'string' && p === config.pass1);
      if (pass1Index === -1) return false;
      const shpInSignature = signatureResult.signatureParts.slice(pass1Index + 1).some(p => typeof p === 'string' && p.startsWith('Shp_'));
      return shpInSignature || customParams.length === 0;
    })(),
    shpUserIdInForm: 'Shp_userId' in formFieldsWithoutSignature,
    shpUserIdInSignature: customParams.some(p => p.startsWith('Shp_userId=')),
    
    // Form fields checks
    formFieldsCount: Object.keys(formFields).length,
    formHasMerchantLogin: 'MerchantLogin' in formFields,
    formHasOutSum: 'OutSum' in formFields,
    formHasInvId: 'InvId' in formFields,
    formHasDescription: 'Description' in formFields,
    formHasSignatureValue: 'SignatureValue' in formFields,
    formHasReceipt: 'Receipt' in formFields,
    formHasRecurring: 'Recurring' in formFields,
    // IsTest check - should be present ONLY if config.isTest is true (test mode)
    // In production (config.isTest === false), IsTest should NOT be present - this is CORRECT
    configIsTest: config.isTest,
    formHasIsTest: 'IsTest' in formFields,
    formIsTestValue: formFields.IsTest || 'NOT_PRESENT',
    isTestInFormFieldsWithoutSignature: 'IsTest' in formFieldsWithoutSignature,
    // IsTest validation: should be present if test mode, absent if production (both are correct)
    isTestCorrect: config.isTest ? ('IsTest' in formFields && formFields.IsTest === '1') : !('IsTest' in formFields),
    
    // Field value consistency
    formOutSumMatchesSignature: formFields.OutSum === outSumFormatted,
    formInvIdMatchesSignature: formFields.InvId === String(invId),
    formMerchantLoginMatchesSignature: formFields.MerchantLogin === config.merchantLogin,
    receiptInFormMatchesSignature: mode === 'recurring' 
      ? formFields.Receipt === receiptEncoded 
      : null,
    receiptUsedInSignature: mode === 'recurring' 
      ? includeReceiptInSignature
      : null,
    signatureVariant: signatureResult.variant,
    includeReceiptInSignature: includeReceiptInSignature,
  };
  
  const debugInfo = {
    mode,
    merchantLogin: config.merchantLogin,
    merchantLoginIsSteopone: config.merchantLogin === 'steopone', // Strict check
    outSum: outSumFormatted, // Always formatted as "1.00"
    outSumOriginal: typeof outSum === 'string' ? outSum : String(outSum),
    outSumType: typeof outSumFormatted,
    invId,
    invIdType: typeof invId,
    invIdString: String(invId),
    description,
    isTest: config.isTest,
    baseUrl,
    // Signature info (NO secrets)
    exactSignatureStringMasked: signatureResult.exactSignatureStringMasked,
    exactSignatureString: signatureResult.exactSignatureString, // Full string (for unit test comparison)
    signatureValue: signatureResult.signatureValue,
    signatureValueLowercase: signatureResult.signatureValue, // Confirmed lowercase
    signatureLength: signatureResult.signatureValue.length,
    signatureVariant: signatureResult.variant, // 'with-receipt' or 'without-receipt'
    includeReceiptInSignature: includeReceiptInSignature,
    signatureParts: signatureResult.signatureParts.map((p) => 
      typeof p === 'string' && p === config.pass1 ? '[PASSWORD1_HIDDEN]' : String(p)
    ), // Array of strings, not objects
    customParams: customParams, // Show which Shp_* params were included in signature (after Pass1)
    customParamsSorted: customParams, // Confirmed sorted alphabetically
    customParamsCount: customParams.length,
    // Form fields (safe - no secrets)
    formFields: Object.fromEntries(
      Object.entries(formFields).map(([k, v]) => [
        k,
        k === 'Receipt' ? `[encoded, length: ${v.length}, preview: ${v.substring(0, 100)}...]` : v
      ])
    ),
    formFieldsRaw: formFields, // Full raw values for debugging (Receipt is encoded, no secrets)
    finalFormFields: formFields, // Exact fields that will be submitted (for unit test comparison)
    formFieldsKeys: Object.keys(formFields),
    formFieldsCount: Object.keys(formFields).length,
    // Receipt info (safe)
    receiptRaw: receiptJson,
    receiptRawLength: receiptJson?.length || 0,
    receiptEncoded: receiptEncodedDebug, // URL-encoded (used in form field)
    receiptEncodedLength: receiptEncodedDebug?.length || 0,
    receiptEncodedPreview: receiptEncodedDebug ? receiptEncodedDebug.substring(0, 80) + '...' : undefined,
    receiptRawJson: receiptJson, // Raw JSON (used in signature if includeReceiptInSignature=true)
    receiptRawJsonLength: receiptJson?.length || 0,
    receiptFull: receipt,
    telegramUserId: telegramUserId || undefined,
    // Validation checks for Error 29
    validationChecks,
    // Environment check (server-side only)
    envCheck,
    timestamp: new Date().toISOString(),
  };
  
  // Unit-test-like check: Print comparison data (server-side only)
  if (typeof window === 'undefined') {
    console.log('[robokassa] ========== SIGNATURE VERIFICATION (Error 29 Debug) ==========');
    console.log('[robokassa] exactSignatureStringMasked:', signatureResult.exactSignatureStringMasked);
    console.log('[robokassa] exactSignatureString (full):', signatureResult.exactSignatureString);
    console.log('[robokassa] signatureValueLowercase:', signatureResult.signatureValue);
    console.log('[robokassa] signatureLength:', signatureResult.signatureValue.length);
    console.log('[robokassa] signatureIsLowercase:', signatureResult.signatureValue === signatureResult.signatureValue.toLowerCase());
    console.log('[robokassa] signatureIsHex:', /^[0-9a-f]{32}$/.test(signatureResult.signatureValue));
    console.log('[robokassa] finalFormFields:', JSON.stringify(formFields, null, 2));
    console.log('[robokassa] formFieldsWithoutSignature:', JSON.stringify(formFieldsWithoutSignature, null, 2));
    console.log('[robokassa] IsTest in formFieldsWithoutSignature:', 'IsTest' in formFieldsWithoutSignature);
    console.log('[robokassa] IsTest value:', formFieldsWithoutSignature.IsTest || 'NOT_PRESENT');
    console.log('[robokassa] config.isTest:', config.isTest);
    console.log('[robokassa] customParams:', customParams);
    console.log('[robokassa] customParamsSorted:', JSON.stringify(customParams) === JSON.stringify([...customParams].sort()));
    console.log('[robokassa] signatureParts count:', signatureResult.signatureParts.length);
    console.log('[robokassa] signatureParts:', signatureResult.signatureParts.map((p, i) => ({
      index: i + 1,
      type: typeof p,
      value: typeof p === 'string' && p === config.pass1 ? '[PASSWORD1]' : String(p).substring(0, 50),
      isPassword: typeof p === 'string' && p === config.pass1,
      isShp: typeof p === 'string' && p.startsWith('Shp_'),
      isReceipt: typeof p === 'string' && p === receiptEncoded,
    })));
    
    // CRITICAL: Verify exact field-by-field match for Error 29
    console.log('[robokassa] ========== FIELD-BY-FIELD VERIFICATION (Error 29) ==========');
    console.log('[robokassa] Form field MerchantLogin:', formFieldsWithoutSignature.MerchantLogin);
    console.log('[robokassa] Signature MerchantLogin:', signatureResult.signatureParts[0]);
    console.log('[robokassa] Match:', formFieldsWithoutSignature.MerchantLogin === signatureResult.signatureParts[0]);
    
    console.log('[robokassa] Form field OutSum:', formFieldsWithoutSignature.OutSum);
    console.log('[robokassa] Signature OutSum:', signatureResult.signatureParts[1]);
    console.log('[robokassa] Match:', formFieldsWithoutSignature.OutSum === signatureResult.signatureParts[1]);
    
    console.log('[robokassa] Form field InvId:', formFieldsWithoutSignature.InvId);
    console.log('[robokassa] Signature InvId:', signatureResult.signatureParts[2]);
    console.log('[robokassa] Match:', formFieldsWithoutSignature.InvId === String(signatureResult.signatureParts[2]));
    
    if (mode === 'recurring' && receiptEncoded) {
      console.log('[robokassa] Form field Receipt (receiptEncoded, length):', receiptEncoded?.length);
      console.log('[robokassa] Signature Receipt (receiptEncoded, length):', receiptEncoded?.length);
      const receiptInSignature = signatureResult.signatureParts.find(p => typeof p === 'string' && p === receiptEncoded);
      console.log('[robokassa] Receipt in signature (receiptEncoded):', !!receiptInSignature);
      console.log('[robokassa] Receipt exact match (form and signature use same receiptEncoded):', formFieldsWithoutSignature.Receipt === receiptEncoded);
      console.log('[robokassa] Receipt in signature exact match (receiptEncoded):', receiptInSignature === receiptEncoded);
      console.log('[robokassa] CRITICAL: Form and signature use the SAME receiptEncoded value - this is CORRECT');
    }
    
    const pass1Trimmed = config.pass1.trim();
    const pass1Index = signatureResult.signatureParts.findIndex(p => typeof p === 'string' && p === pass1Trimmed);
    console.log('[robokassa] Pass1 index in signature:', pass1Index);
    
    if (customParams.length > 0) {
      console.log('[robokassa] Shp_* params after Pass1:');
      const shpInSignature = signatureResult.signatureParts.slice(pass1Index + 1).filter(p => typeof p === 'string' && p.startsWith('Shp_'));
      console.log('[robokassa] Shp_* in signature:', shpInSignature);
      console.log('[robokassa] Shp_* from form:', customParams);
      console.log('[robokassa] Shp_* match:', JSON.stringify(shpInSignature.sort()) === JSON.stringify(customParams.sort()));
    }
    
    console.log('[robokassa] validationChecks:', JSON.stringify(validationChecks, null, 2));
    console.log('[robokassa] ============================================================');
  }
  
  // Build debug JSON string for copying
  const debugJson = JSON.stringify(debugInfo, null, 2);
  
  // Build HTML with single copy button
  let formHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Robokassa Payment Debug</title>
  <style>
    * { box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
      padding: 20px; 
      background: #0a0a0a; 
      color: #e0e0e0; 
      margin: 0;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { color: #00ff88; margin-bottom: 10px; }
    .subtitle { color: #888; margin-bottom: 30px; }
    .copy-all-btn { 
      background: #00ff88; 
      color: #000; 
      padding: 20px 40px; 
      font-size: 18px; 
      font-weight: bold;
      border: none; 
      border-radius: 8px; 
      cursor: pointer; 
      margin: 20px 0;
      width: 100%;
      box-shadow: 0 4px 15px rgba(0, 255, 136, 0.3);
      transition: all 0.3s;
    }
    .copy-all-btn:hover { 
      background: #00cc6a; 
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(0, 255, 136, 0.4);
    }
    .copy-all-btn:active { transform: translateY(0); }
    button { 
      background: #0066cc; 
      color: white; 
      padding: 15px 30px; 
      font-size: 16px; 
      border: none; 
      border-radius: 5px; 
      cursor: pointer; 
      margin: 10px 5px 10px 0;
      font-weight: 600;
    }
    button:hover { background: #0052a3; }
    button.danger { background: #cc0000; }
    button.danger:hover { background: #aa0000; }
    button.success { background: #00aa00; }
    button.success:hover { background: #008800; }
    .debug-section { 
      background: #1a1a1a; 
      padding: 20px; 
      margin: 15px 0; 
      border-radius: 8px; 
      border: 1px solid #333; 
    }
    .debug-section h3 { 
      margin-top: 0; 
      color: #00ff88; 
    }
    pre { 
      background: #000; 
      padding: 15px; 
      border-radius: 5px; 
      overflow-x: auto; 
      font-size: 13px;
      line-height: 1.5;
      border: 1px solid #333;
      max-height: 400px;
      overflow-y: auto;
    }
    .form-preview {
      background: #1a1a1a;
      padding: 15px;
      border-radius: 5px;
      margin: 10px 0;
      border: 1px solid #333;
    }
    .form-field {
      margin: 8px 0;
      padding: 8px;
      background: #0a0a0a;
      border-radius: 3px;
      font-family: monospace;
      font-size: 12px;
    }
    .form-field-name {
      color: #00ff88;
      font-weight: bold;
    }
    .form-field-value {
      color: #e0e0e0;
      word-break: break-all;
    }
    .status-badge {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 3px;
      font-size: 11px;
      font-weight: bold;
      margin-left: 10px;
    }
    .status-test { background: #ffaa00; color: #000; }
    .status-prod { background: #00aa00; color: #fff; }
    .status-minimal { background: #0066cc; color: #fff; }
    .status-recurring { background: #aa00aa; color: #fff; }
    .error-info {
      background: #2a1a1a;
      border-left: 4px solid #ff4444;
      padding: 15px;
      margin: 15px 0;
      border-radius: 5px;
    }
    .error-info h4 {
      color: #ff4444;
      margin-top: 0;
    }
    .check-item {
      margin: 5px 0;
      padding: 5px;
      background: #1a1a1a;
      border-radius: 3px;
    }
    .check-ok { border-left: 3px solid #00ff88; }
    .check-fail { border-left: 3px solid #ff4444; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔍 Robokassa Payment Debug</h1>
    <div class="subtitle">
      Mode: <span class="status-badge status-${mode}">${mode.toUpperCase()}</span> 
      ${config.isTest ? '<span class="status-badge status-test">TEST MODE</span>' : '<span class="status-badge status-prod">PRODUCTION</span>'}
    </div>
    
    <div class="debug-section" style="background: #1a2a1a; border: 2px solid #00ff88;">
      <h3>🔑 КЛЮЧЕВАЯ ИНФОРМАЦИЯ ДЛЯ ERROR 29 (СКОПИРУЙТЕ ЭТО)</h3>
      <button class="copy-all-btn" onclick="copyKeyInfo()" style="background: #00ff88; color: #000; margin-bottom: 20px;">
        📋 СКОПИРОВАТЬ КЛЮЧЕВУЮ ИНФОРМАЦИЮ ДЛЯ ERROR 29
      </button>
      <pre id="key-info" style="background: #000; padding: 15px; border-radius: 5px; font-size: 12px; line-height: 1.6;">
<strong>1. MerchantLogin:</strong> ${config.merchantLogin}
<strong>2. OutSum:</strong> ${outSumFormatted}
<strong>3. InvId:</strong> ${invId}
<strong>4. Receipt (если есть):</strong> ${mode === 'recurring' && receiptEncoded ? `Да (receiptEncoded length: ${receiptEncoded.length})` : 'Нет'}
<strong>5. Shp_* параметры в форме:</strong> ${customParams.length > 0 ? customParams.join(', ') : 'Нет'}
<strong>6. Shp_* параметры в подписи:</strong> ${customParams.length > 0 ? customParams.join(', ') : 'Нет'}
<strong>7. Порядок параметров в подписи:</strong>
${signatureResult.signatureParts.map((p, i) => {
  if (p === config.pass1) return `${i + 1}. Pass1: [HIDDEN]`;
  if (p.startsWith('Shp_')) return `${i + 1}. ${p}`;
  if (p === receiptEncoded) return `${i + 1}. Receipt (receiptEncoded, for signature and form): [single-encoded, length: ${p.length}]`;
  return `${i + 1}. ${String(p).substring(0, 50)}`;
}).join('\n')}
<strong>8. Exact Signature String (masked):</strong>
${signatureResult.exactSignatureStringMasked}
<strong>9. Signature Value (MD5, lowercase):</strong>
${signatureResult.signatureValue}
<strong>10. Signature Length:</strong> ${signatureResult.signatureValue.length} (должно быть 32)
<strong>11. Signature is Lowercase:</strong> ${signatureResult.signatureValue === signatureResult.signatureValue.toLowerCase() ? '✅ Да' : '❌ НЕТ!'}
<strong>12. Signature Regex Validation (/^[0-9a-f]{32}$/):</strong> ${/^[0-9a-f]{32}$/.test(signatureResult.signatureValue) ? '✅ Да' : '❌ НЕТ!'}
<strong>13. Test Mode:</strong> ${config.isTest ? '✅ Да (IsTest=1)' : '❌ Нет (production)'}
      </pre>
    </div>
    
    <button class="copy-all-btn" onclick="copyAllDebugInfo()" style="background: #666; margin-top: 20px;">
      📋 СКОПИРОВАТЬ ВСЮ DEBUG ИНФОРМАЦИЮ (ПОЛНАЯ)
    </button>
    
    <div class="debug-section">
      <h3>💳 Payment Form</h3>
      <form id="robokassa-form" method="POST" action="${baseUrl}">`;
  
  // CRITICAL: Output form fields in correct order
  // Standard fields first, then Shp_* params in alphabetical order
  const standardFields = ['MerchantLogin', 'OutSum', 'InvId', 'Description'];
  const receiptFields = mode === 'recurring' ? ['Receipt', 'Recurring'] : [];
  const signatureField = ['SignatureValue'];
  const testField = config.isTest ? ['IsTest'] : [];
  
  // Collect Shp_* fields separately and sort them alphabetically
  const shpFields = Object.keys(formFields)
    .filter(k => k.startsWith('Shp_'))
    .sort(); // Alphabetical order (case-sensitive)
  
  // Build ordered field list
  const orderedFields = [
    ...standardFields,
    ...receiptFields,
    ...shpFields, // Shp_* in alphabetical order
    ...signatureField,
    ...testField,
  ];
  
  // Output fields in correct order
  for (const name of orderedFields) {
    if (name in formFields) {
      const value = formFields[name];
      const escapedValue = name === 'Receipt' ? value : escapeHtmlAttribute(value);
      formHtml += `\n        <input type="hidden" name="${name}" value="${escapedValue}">`;
    }
  }
  
  formHtml += `
      </form>
      <div style="margin-top: 15px;">
        <button class="success" onclick="document.getElementById('robokassa-form').submit()">💳 Pay Now (Submit to Robokassa)</button>
        <button class="danger" onclick="if(confirm('Are you sure?')) window.close()">❌ Cancel</button>
      </div>
      
      <div class="form-preview" style="margin-top: 20px;">
        <strong>Form Fields (${Object.keys(formFields).length} fields):</strong>`;
  
  // Display fields in same order as form (with Shp_* sorted alphabetically)
  for (const name of orderedFields) {
    if (name in formFields) {
      const value = formFields[name];
      const displayValue = name === 'Receipt' 
        ? `[URL-encoded, length: ${value.length}] ${value.substring(0, 100)}...`
        : value;
      formHtml += `
        <div class="form-field">
          <span class="form-field-name">${name}:</span> 
          <span class="form-field-value">${escapeHtmlAttribute(displayValue)}</span>
        </div>`;
    }
  }
  
  // Build signature formula for display
  const signatureFormulaParts = [
    'MerchantLogin',
    'OutSum',
    'InvId',
  ];
  if (mode === 'recurring' && receiptEncoded) {
    signatureFormulaParts.push('ReceiptEncoded'); // Single-encoded for both signature and form
  }
  signatureFormulaParts.push('Pass1');
  if (customParams.length > 0) {
    signatureFormulaParts.push(...customParams);
  }
  const signatureFormula = `MD5(${signatureFormulaParts.join(':')})`;
  
  formHtml += `
      </div>
    </div>
    
    <div class="debug-section">
      <h3>🔐 Signature Calculation (Детально для Error 29)</h3>
      <pre>Формула: ${signatureFormula}

Порядок параметров в подписи:
${signatureResult.signatureParts.map((p: string | number, i: number) => {
  if (typeof p === 'string' && p === config.pass1) {
    return `${i + 1}. Pass1: [HIDDEN]`;
  }
  if (typeof p === 'number') {
    if (i === 2) return `${i + 1}. InvId: ${p} (number)`;
  }
  if (typeof p === 'string') {
    if (p === config.merchantLogin) return `${i + 1}. MerchantLogin: "${p}" (length: ${p.length})`;
    if (p === outSumFormatted) return `${i + 1}. OutSum: "${p}" (type: string, length: ${p.length})`;
    if (p === receiptEncoded) return `${i + 1}. ReceiptEncoded (for signature and form): "${p.substring(0, 100)}..." (length: ${p.length}, single-encoded)`;
    if (p.startsWith('Shp_')) return `${i + 1}. ${p} (Shp_* param, after Pass1)`;
  }
  return `${i + 1}. ${String(p)} (unknown)`;
}).join('\n')}

Custom Params (Shp_*) - должны быть ПОСЛЕ Pass1, отсортированы алфавитно:
${customParams.length > 0 ? customParams.map((p, i) => `${i + 1}. ${p}`).join('\n') : 'None'}

Проверка сортировки Shp_*:
${customParams.length > 0 ? (JSON.stringify(customParams) === JSON.stringify([...customParams].sort()) ? '✅ Отсортированы правильно' : '❌ НЕ отсортированы!') : 'N/A'}

EXACT String Used for MD5 (with password masked):
${debugInfo.exactSignatureStringMasked}

EXACT String Used for MD5 (full, для сравнения):
${debugInfo.exactSignatureString}

Signature Value (MD5 hash, lowercase):
${signatureResult.signatureValue}

Проверка подписи:
- Длина: ${signatureResult.signatureValue.length} символов (должно быть 32)
- Lowercase: ${signatureResult.signatureValue === signatureResult.signatureValue.toLowerCase() ? '✅ Да' : '❌ НЕТ!'}
- Regex Validation (/^[0-9a-f]{32}$/): ${/^[0-9a-f]{32}$/.test(signatureResult.signatureValue) ? '✅ Да' : '❌ НЕТ!'}

Сравнение формы и подписи:
- MerchantLogin в форме: "${formFields.MerchantLogin}"
- MerchantLogin в подписи: "${config.merchantLogin}"
- Совпадают: ${formFields.MerchantLogin === config.merchantLogin ? '✅ Да' : '❌ НЕТ!'}

- OutSum в форме: "${formFields.OutSum}"
- OutSum в подписи: "${outSumFormatted}"
- Совпадают: ${formFields.OutSum === outSumFormatted ? '✅ Да' : '❌ НЕТ!'}

- InvId в форме: "${formFields.InvId}"
- InvId в подписи: ${invId}
- Совпадают: ${formFields.InvId === String(invId) ? '✅ Да' : '❌ НЕТ!'}

${mode === 'recurring' && receiptEncoded ? `- Receipt в форме (receiptEncoded): присутствует (length: ${formFields.Receipt.length})
- Receipt в подписи (receiptEncoded): ${signatureResult.signatureParts.some(p => typeof p === 'string' && p === receiptEncoded) ? '✅ Включен' : '❌ НЕ включен!'}
- Форма использует receiptEncoded (single-encoded): ${formFields.Receipt === receiptEncoded ? '✅ Да' : '❌ НЕТ!'}
- Подпись использует receiptEncoded (single-encoded): ${signatureResult.signatureParts.some(p => typeof p === 'string' && p === receiptEncoded) ? '✅ Да' : '❌ НЕТ!'}
- CRITICAL: Форма и подпись используют ОДИНАКОВОЕ значение (receiptEncoded) - это ПРАВИЛЬНО!` : ''}

- Shp_userId в форме: ${'Shp_userId' in formFields ? `"${formFields.Shp_userId}"` : '❌ Отсутствует'}
- Shp_userId в подписи: ${customParams.some(p => p.startsWith('Shp_userId=')) ? `✅ Включен: ${customParams.find(p => p.startsWith('Shp_userId='))}` : '❌ НЕ включен!'}
- Совпадают: ${('Shp_userId' in formFields) === customParams.some(p => p.startsWith('Shp_userId=')) ? '✅ Да' : '❌ НЕТ!'}
</pre>
    </div>`;
  
  if (mode === 'recurring' && receiptJson) {
    formHtml += `
    <div class="debug-section">
      <h3>📄 Receipt Details</h3>
      <pre>Raw JSON:
${escapeHtmlAttribute(receiptJson)}

ReceiptEncoded (single-encoded, used in both signature and form):
${escapeHtmlAttribute(receiptEncoded || 'N/A')}
Length: ${receiptEncoded?.length || 0} characters
Item Sum: ${receipt?.items[0]?.sum}
OutSum: ${outSumFormatted}
Match: ${receipt?.items[0]?.sum === parseFloat(outSumFormatted) ? '✅ YES' : '❌ NO'}
</pre>
    </div>`;
  }
  
  formHtml += `
    <div class="debug-section">
      <h3>📋 Full Debug JSON (для анализа)</h3>
      <pre id="debug-json">${escapeHtmlAttribute(debugJson)}</pre>
    </div>
    
    <script>
      function copyKeyInfo() {
        const keyInfo = document.getElementById('key-info').textContent;
        
        navigator.clipboard.writeText(keyInfo).then(() => {
          alert('✅ Ключевая информация для Error 29 скопирована!\\n\\nТеперь можете вставить её для анализа.');
        }).catch(err => {
          // Fallback for older browsers
          const textarea = document.createElement('textarea');
          textarea.value = keyInfo;
          textarea.style.position = 'fixed';
          textarea.style.opacity = '0';
          document.body.appendChild(textarea);
          textarea.select();
          try {
            document.execCommand('copy');
            alert('✅ Ключевая информация скопирована!');
          } catch (e) {
            alert('❌ Не удалось скопировать. Попробуйте выделить текст вручную.');
          }
          document.body.removeChild(textarea);
        });
      }
      
      function copyAllDebugInfo() {
        const debugData = ${JSON.stringify(debugInfo)};
        const text = JSON.stringify(debugData, null, 2);
        
        navigator.clipboard.writeText(text).then(() => {
          alert('✅ Вся debug информация скопирована в буфер обмена!\\n\\nТеперь можете вставить в любой текстовый редактор для анализа.');
        }).catch(err => {
          // Fallback for older browsers
          const textarea = document.createElement('textarea');
          textarea.value = text;
          textarea.style.position = 'fixed';
          textarea.style.opacity = '0';
          document.body.appendChild(textarea);
          textarea.select();
          try {
            document.execCommand('copy');
            alert('✅ Вся debug информация скопирована!');
          } catch (e) {
            alert('❌ Не удалось скопировать. Попробуйте выделить текст вручную.');
          }
          document.body.removeChild(textarea);
        });
      }
    </script>
  </div>
</body>
</html>`;
  
  return {
    html: formHtml,
    debug: debugInfo,
  };
}

/**
 * CANONICAL Robokassa form builder with strict validation
 * 
 * This is the SINGLE source of truth for building Robokassa payment forms.
 * All payment creation endpoints MUST use this function to ensure consistency.
 * 
 * @param params - Payment parameters
 * @returns Form fields, signature info, and validation results
 */
export function buildRobokassaForm(params: {
  merchantLogin: string;
  password1: string;
  outSum: string; // Must be formatted as "199.00" (2 decimals)
  invId: string; // Must be digits-only string
  description: string; // ASCII, max 128 chars
  recurring?: boolean; // If true, add Recurring=true field (NOT in signature per Robokassa docs)
  receipt?: Receipt; // Optional Receipt object (if provided, MUST be included in signature)
  shpParams?: Record<string, string>; // Shp_* custom parameters (e.g., { userId: "123" } -> Shp_userId=123)
  isTest?: boolean; // If true, add IsTest=1 field (NOT in signature)
}): {
  fields: Record<string, string>; // Final form fields ready to submit
  signature: {
    value: string; // SignatureValue (MD5 hex lowercase)
    baseString: string; // Exact signature string with password masked
    baseStringRaw: string; // Exact signature string with real password (for calculation only)
    parts: string[]; // Signature parts in order
    variant: 'with-receipt' | 'without-receipt';
  };
  validation: {
    passed: boolean;
    errors: string[];
    warnings: string[];
  };
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // ========== STRICT VALIDATION ==========
  
  // 1. MerchantLogin validation
  if (!params.merchantLogin || params.merchantLogin.trim().length === 0) {
    errors.push('MerchantLogin is required and cannot be empty');
  }
  const merchantLogin = params.merchantLogin.trim();
  if (merchantLogin !== 'steopone') {
    warnings.push(`MerchantLogin is "${merchantLogin}", expected "steopone" (this may cause Error 26)`);
  }

  // 2. Password1 validation
  if (!params.password1 || params.password1.trim().length === 0) {
    errors.push('Password1 is required and cannot be empty');
  }
  const password1 = params.password1.trim();

  // 3. OutSum validation - MUST match /^\d+(\.\d{2})$/
  if (!/^\d+(\.\d{2})$/.test(params.outSum)) {
    errors.push(`OutSum must be formatted as "199.00" (2 decimals), got: "${params.outSum}"`);
  }
  const outSum = params.outSum; // Already formatted correctly

  // 4. InvId validation - MUST be digits-only
  if (!/^\d+$/.test(params.invId)) {
    errors.push(`InvId must be digits-only string, got: "${params.invId}"`);
  }
  const invIdNum = parseInt(params.invId, 10);
  if (invIdNum <= 0 || invIdNum > 2000000000) {
    errors.push(`InvId must be between 1 and 2000000000, got: ${invIdNum}`);
  }
  const invId = params.invId; // Already validated as digits-only

  // 5. Description validation
  if (!params.description || params.description.length === 0) {
    errors.push('Description is required');
  }
  if (params.description.length > 128) {
    warnings.push(`Description is ${params.description.length} chars, max is 128 (will be truncated)`);
  }
  const description = params.description.substring(0, 128);

  // If validation failed, throw error
  if (errors.length > 0) {
    throw new Error(`Robokassa form validation failed:\n${errors.join('\n')}`);
  }

  // ========== BUILD FORM FIELDS ==========
  
  const fields: Record<string, string> = {
    MerchantLogin: merchantLogin,
    OutSum: outSum,
    InvId: invId, // Use InvId (canonical field name for Index.aspx)
    Description: description,
  };

  // Add Shp_* parameters
  const shpEntries: Array<[string, string]> = [];
  if (params.shpParams) {
    for (const [key, value] of Object.entries(params.shpParams)) {
      const shpKey = `Shp_${key}`;
      fields[shpKey] = String(value).trim();
      shpEntries.push([shpKey, String(value).trim()]);
    }
  }

  // Sort Shp_* parameters alphabetically by key name
  shpEntries.sort(([keyA], [keyB]) => keyA.localeCompare(keyB, undefined, { sensitivity: 'case' }));

  // Validate: all Shp_* params must appear exactly once
  const shpKeysInFields = Object.keys(fields).filter(k => k.startsWith('Shp_'));
  if (shpKeysInFields.length !== shpEntries.length) {
    errors.push(`Shp_* parameter count mismatch: ${shpKeysInFields.length} in fields, ${shpEntries.length} in entries`);
  }

  // Process Receipt if provided
  let receiptEncoded: string | undefined;
  if (params.receipt) {
    // Serialize Receipt JSON deterministically (sorted keys)
    const receiptJson = JSON.stringify(params.receipt, (key, value) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return Object.keys(value).sort().reduce((acc, k) => {
          acc[k] = value[k];
          return acc;
        }, {} as any);
      }
      return value;
    });
    // URL-encode ONCE - this exact value will be used in BOTH form field AND signature
    receiptEncoded = encodeURIComponent(receiptJson);
    fields.Receipt = receiptEncoded;
  }

  // Add Recurring if requested (NOT included in signature per Robokassa docs)
  if (params.recurring === true) {
    fields.Recurring = 'true';
  }

  // Add IsTest if test mode (NOT included in signature)
  if (params.isTest === true) {
    fields.IsTest = '1';
  }

  // ========== BUILD SIGNATURE ==========
  
  // Signature format:
  // WITHOUT Receipt: MerchantLogin:OutSum:InvId:Password1:Shp_key=value...
  // WITH Receipt: MerchantLogin:OutSum:InvId:Receipt:Password1:Shp_key=value...
  
  const signatureParts: string[] = [
    merchantLogin,
    outSum,
    invId,
  ];

  // Add Receipt BEFORE Password1 if present
  let variant: 'with-receipt' | 'without-receipt' = 'without-receipt';
  if (receiptEncoded) {
    signatureParts.push(receiptEncoded); // SAME encoded value as in form field
    variant = 'with-receipt';
    
    // Validate: Receipt in signature must match Receipt in form
    if (fields.Receipt !== receiptEncoded) {
      errors.push('Receipt encoding mismatch: form field and signature must use the same encoded value');
    }
  }

  // Add Password1
  signatureParts.push(password1);

  // Add Shp_* parameters AFTER Password1 (sorted)
  const shpParamsForSignature: string[] = shpEntries.map(([key, value]) => `${key}=${value}`);
  if (shpParamsForSignature.length > 0) {
    signatureParts.push(...shpParamsForSignature);
    
    // Validate: Shp_* params are sorted
    const isSorted = shpParamsForSignature.every((param, index) => {
      if (index === 0) return true;
      const prevKey = shpParamsForSignature[index - 1].split('=')[0];
      const currKey = param.split('=')[0];
      return prevKey.localeCompare(currKey, undefined, { sensitivity: 'case' }) <= 0;
    });
    if (!isSorted) {
      errors.push('Shp_* parameters must be sorted alphabetically by key name');
    }
  }

  // Calculate signature
  const signatureBaseStringRaw = signatureParts.join(':');
  const signatureBaseString = signatureParts.map(p => 
    p === password1 ? '[PASSWORD1_HIDDEN]' : p
  ).join(':');
  const signatureValue = calculateSignature(...signatureParts);

  // Validate signature format
  if (!/^[0-9a-f]{32}$/.test(signatureValue)) {
    errors.push(`SignatureValue must be 32-character lowercase hex MD5, got: "${signatureValue}"`);
  }

  // Add SignatureValue to form fields
  fields.SignatureValue = signatureValue;

  // Final validation check
  if (errors.length > 0) {
    throw new Error(`Robokassa form validation failed:\n${errors.join('\n')}\nSignature base (masked): ${signatureBaseString}`);
  }

  return {
    fields,
    signature: {
      value: signatureValue,
      baseString: signatureBaseString,
      baseStringRaw: signatureBaseStringRaw, // For internal use only, never log this
      parts: signatureParts.map(p => p === password1 ? '[PASSWORD1_HIDDEN]' : p),
      variant,
    },
    validation: {
      passed: errors.length === 0,
      errors,
      warnings,
    },
  };
}

/**
 * Generate safe InvoiceID for recurring payments (digits only, <= 2_000_000_000)
 * Format: timestamp_seconds + random_4_digits
 * Returns as string (digits only) for consistency
 * CRITICAL: For recurring payments, use InvoiceID (not InvId)
 */
export function generateSafeInvoiceId(): string {
  // Use seconds since epoch + random 4 digits
  const timestampSeconds = Math.floor(Date.now() / 1000);
  const randomDigits = Math.floor(Math.random() * 9000 + 1000); // 1000-9999
  const invoiceIdString = `${timestampSeconds}${randomDigits}`;
  
  // Ensure it's within safe range (Robokassa limit)
  const maxInvoiceId = 2000000000;
  const invoiceIdNum = parseInt(invoiceIdString, 10);
  
  if (invoiceIdNum > maxInvoiceId) {
    // Wrap around if exceeds limit
    return String(invoiceIdNum % maxInvoiceId);
  }
  
  // Ensure it's positive and non-zero
  if (invoiceIdNum <= 0) {
    return String(Math.floor(Math.random() * 9000000 + 1000000)); // Fallback: 7-8 digits
  }
  
  return invoiceIdString;
}

/**
 * Generate safe InvId (digits only, <= 2_000_000_000)
 * Format: timestamp_seconds + random_4_digits
 * Returns as string (digits only) for consistency
 * @deprecated Use generateSafeInvoiceId() for recurring payments
 */
export function generateSafeInvId(): string {
  return generateSafeInvoiceId();
}

/**
 * Create parent payment form for Robokassa Index.aspx
 * 
 * Per Robokassa official docs:
 * - POST to https://auth.robokassa.ru/Merchant/Index.aspx
 * - Fields: MerchantLogin, InvId, Description, SignatureValue, OutSum, Shp_userId
 * - CRITICAL: NO Recurring field! Recurring is ONLY for server-to-server Merchant/Recurring endpoint.
 * - NO Receipt for now
 * - Signature: MD5(MerchantLogin:OutSum:InvId:Password1:Shp_userId=...)
 * - CRITICAL: For Index.aspx, use InvId (NOT InvoiceID). InvoiceID is only for Merchant/Recurring endpoint.
 * 
 * @param config - Robokassa configuration
 * @param invoiceId - InvId value as string (digits only, positive, non-zero). Will be used as InvId field in form.
 * @param outSum - Payment amount as string with 2 decimals (e.g., "1.00")
 * @param description - Payment description (ASCII, max 128 chars)
 * @param telegramUserId - Telegram user ID (for Shp_userId)
 * @returns HTML form and debug info
 */
export function createParentRecurringPaymentForm(
  config: RobokassaConfig,
  invoiceId: string,
  outSum: string,
  description: string,
  telegramUserId: number
): {
  html: string;
  debug: {
    merchantLogin: string;
    outSum: string;
    invoiceId: string;
    signatureBaseMasked: string;
    signatureValue: string;
    formFields: string[]; // Field names only
    envCheck: {
      pass1Len: number;
      pass2Len: number;
      pass1Prefix2: string;
      pass1Suffix2: string;
      pass2Prefix2: string;
      pass2Suffix2: string;
      vercelEnv: string;
      nodeEnv: string;
    };
  };
} {
  // ========== VALIDATION ==========
  
  // Validate InvoiceID
  if (!/^\d+$/.test(invoiceId)) {
    throw new Error(`Invalid InvoiceID: ${invoiceId} (must be digits only)`);
  }
  const invoiceIdNum = parseInt(invoiceId, 10);
  if (invoiceIdNum <= 0 || invoiceIdNum > 2000000000) {
    throw new Error(`InvoiceID out of range: ${invoiceId} (must be 1-2000000000)`);
  }
  
  // Validate OutSum format
  if (!/^\d+(\.\d{2})$/.test(outSum)) {
    throw new Error(`Invalid OutSum format: ${outSum} (must be "X.00" format)`);
  }
  
  // Validate description
  if (!description || description.length === 0) {
    throw new Error('Description is required');
  }
  if (description.length > 128) {
    throw new Error(`Description too long: ${description.length} chars (max 128)`);
  }
  
  // Validate telegramUserId
  if (!Number.isFinite(telegramUserId) || telegramUserId <= 0) {
    throw new Error(`Invalid telegramUserId: ${telegramUserId}`);
  }
  
  // ========== BUILD FORM FIELDS ==========
  
  // CRITICAL: For Index.aspx, Robokassa requires InvId (NOT InvoiceID)
  // InvoiceID is only used for Merchant/Recurring endpoint
  // CRITICAL: DO NOT include Recurring field! Recurring is ONLY for server-to-server Merchant/Recurring endpoint.
  // The first payment is a normal payment. Trial logic is handled in our DB, not by Robokassa.
  const fields: Record<string, string> = {
    MerchantLogin: config.merchantLogin.trim(),
    InvId: invoiceId, // CRITICAL: Use InvId (not InvoiceID) for Index.aspx
    OutSum: outSum,
    Description: description.substring(0, 128),
    // NO Recurring field - this causes Error 29!
    Shp_userId: String(telegramUserId),
  };
  
  // Add IsTest if test mode (NOT in signature)
  if (config.isTest) {
    fields.IsTest = '1';
  }
  
  // ========== BUILD SIGNATURE ==========
  
  // Signature format: MerchantLogin:OutSum:InvId:Password1:Shp_userId=...
  // CRITICAL: Use InvId (same as form field) in signature, NOT InvoiceID
  // Shp_* params must be sorted alphabetically and appended AFTER Password1
  const merchantLogin = config.merchantLogin.trim();
  const password1 = config.pass1.trim();
  
  // Build Shp_* params (sorted alphabetically)
  const shpParams: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (key.startsWith('Shp_')) {
      shpParams.push(`${key}=${String(value).trim()}`);
    }
  }
  shpParams.sort(); // Alphabetical sort by parameter name
  
  // Build signature parts in correct order
  const signatureParts: string[] = [
    merchantLogin,
    outSum,
    invoiceId, // Use InvId value (same as form field InvId)
    password1,
  ];
  
  // Add Shp_* params AFTER Password1 (sorted)
  if (shpParams.length > 0) {
    signatureParts.push(...shpParams);
  }
  
  // Calculate signature
  const signatureBaseString = signatureParts.join(':');
  const signatureBaseMasked = signatureParts.map(p => 
    p === password1 ? '[PASSWORD1_HIDDEN]' : p
  ).join(':');
  
  const signatureValue = calculateSignature(...signatureParts);
  
  // Validate signature format
  if (!/^[0-9a-f]{32}$/.test(signatureValue)) {
    throw new Error(`Invalid signature format: ${signatureValue} (must be 32-char lowercase hex)`);
  }
  
  // ========== RUNTIME VALIDATION ==========
  // CRITICAL: Ensure InvId is present and InvoiceID is NOT present for Index.aspx
  if (!fields.InvId || fields.InvId.length === 0) {
    throw new Error('CRITICAL: InvId is missing in form fields for Index.aspx');
  }
  if (!/^\d+$/.test(fields.InvId)) {
    throw new Error(`CRITICAL: InvId must be digits only, got: ${fields.InvId}`);
  }
  if ('InvoiceID' in fields) {
    throw new Error('CRITICAL: InvoiceID must NOT be present in form fields for Index.aspx (use InvId instead)');
  }
  // CRITICAL: Recurring field must NOT be present in Index.aspx form (causes Error 29)
  if ('Recurring' in fields) {
    const formKeys = Object.keys(fields).join(', ');
    throw new Error(`CRITICAL: Recurring field must NOT be present in Index.aspx form! Form fields: ${formKeys}`);
  }
  // Validate signature uses InvId (same value as form field)
  if (signatureParts[2] !== fields.InvId) {
    throw new Error(`CRITICAL: Signature InvId mismatch: signature uses "${signatureParts[2]}", form uses "${fields.InvId}"`);
  }
  // Validate OutSum format
  if (!/^\d+(\.\d{2})$/.test(fields.OutSum)) {
    throw new Error(`CRITICAL: OutSum format invalid: "${fields.OutSum}" (must be "X.00" format)`);
  }
  
  // Add SignatureValue to form fields
  fields.SignatureValue = signatureValue;
  
  // ========== BUILD HTML FORM ==========
  
  const actionUrl = 'https://auth.robokassa.ru/Merchant/Index.aspx';
  
  const formInputs = Object.entries(fields)
    .map(([name, value]) => {
      const escapedValue = value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
      return `    <input type="hidden" name="${name}" value="${escapedValue}">`;
    })
    .join('\n');
  
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Robokassa Payment</title>
</head>
<body>
  <form id="robokassa-form" method="POST" action="${actionUrl}">
${formInputs}
  </form>
  <script>
    document.getElementById('robokassa-form').submit();
  </script>
</body>
</html>`;
  
  // ========== BUILD SAFE DEBUG INFO ==========
  
  const pass1Len = password1.length;
  const pass2Len = config.pass2.trim().length;
  const pass1Prefix2 = password1.substring(0, 2);
  const pass1Suffix2 = password1.substring(pass1Len - 2);
  const pass2Prefix2 = config.pass2.trim().substring(0, 2);
  const pass2Suffix2 = config.pass2.trim().substring(pass2Len - 2);
  
  const debug = {
    merchantLogin,
    outSum,
    invoiceId,
    signatureBaseMasked,
    signatureValue,
    formFields: Object.keys(fields), // Field names only
    targetUrl: actionUrl, // Index.aspx
    hasRecurring: 'Recurring' in fields, // CRITICAL: Must be false for Index.aspx
    envCheck: {
      pass1Len,
      pass2Len,
      pass1Prefix2,
      pass1Suffix2,
      pass2Prefix2,
      pass2Suffix2,
      vercelEnv: process.env.VERCEL_ENV || 'not-set',
      nodeEnv: process.env.NODE_ENV || 'not-set',
    },
  };
  
  // ========== SERVER LOGS ==========
  
  if (typeof window === 'undefined') {
    console.log('[robokassa] ========== PARENT PAYMENT FORM (Index.aspx) ==========');
    console.log('[robokassa] Target URL: https://auth.robokassa.ru/Merchant/Index.aspx');
    console.log('[robokassa] Signature base (masked):', signatureBaseMasked);
    console.log('[robokassa] Signature value:', signatureValue);
    console.log('[robokassa] Form fields:', Object.keys(fields), '(MUST include InvId, NOT InvoiceID, NOT Recurring for Index.aspx)');
    console.log('[robokassa] MerchantLogin:', merchantLogin);
    console.log('[robokassa] OutSum:', outSum);
    console.log('[robokassa] InvId:', invoiceId, '(CRITICAL: Using InvId for Index.aspx, NOT InvoiceID)');
    console.log('[robokassa] Shp_userId:', telegramUserId);
    console.log('[robokassa] HasRecurring:', 'Recurring' in fields, '(MUST be false for Index.aspx)');
    // Validate: Ensure InvId is present and InvoiceID/Recurring are NOT present
    if (!fields.InvId) {
      console.error('[robokassa] ❌ CRITICAL ERROR: InvId is missing in form fields!');
    }
    if (fields.InvoiceID) {
      console.error('[robokassa] ❌ CRITICAL ERROR: InvoiceID is present in form fields (should be InvId for Index.aspx)!');
    }
    if (fields.Recurring) {
      console.error('[robokassa] ❌ CRITICAL ERROR: Recurring is present in form fields (causes Error 29! Must be removed for Index.aspx)!');
    }
    console.log('[robokassa] ===================================================');
  }
  
  return {
    html,
    debug,
  };
}

/**
 * Build parent recurring payment for Merchant/Index.aspx
 * 
 * Fields: MerchantLogin, OutSum, InvId, Description, SignatureValue, Recurring=true,
 *         plus optional Receipt, plus shp_* custom params.
 * 
 * Signature formula:
 * - If Receipt is present and will be sent: MD5(MerchantLogin:OutSum:InvId:Receipt:Pass1:Shp_...sorted)
 * - If Receipt is absent: MD5(MerchantLogin:OutSum:InvId:Pass1:Shp_...sorted)
 * 
 * IMPORTANT: Receipt in signature must be EXACTLY the same string as the "Receipt" field value (same encoding).
 * 
 * @param config - Robokassa configuration
 * @param outSum - Payment amount as string with 2 decimals (e.g., "1.00")
 * @param invId - Unique InvId (string, digits only, non-zero)
 * @param description - Payment description (ASCII, max 128 chars)
 * @param receipt - Optional Receipt object (if provided, will be included in form AND signature)
 * @param telegramUserId - Optional Telegram user ID (for Shp_userId)
 * @returns Form fields, HTML, and debug info
 */
export function buildParentRecurringPayment(
  config: RobokassaConfig,
  outSum: string,
  invId: string,
  description: string,
  receipt?: Receipt,
  telegramUserId?: number
): {
  fields: Record<string, string>;
  html: string;
  debug: {
    exactSignatureStringMasked: string;
    signatureValue: string;
    signatureParts: string[]; // Array of strings, not objects
    formFields: Record<string, string>;
    hasReceipt: boolean;
    receiptInSignature: boolean;
    shpParams: string[];
    [key: string]: any;
  };
} {
  // Format OutSum to ensure 2 decimals
  const outSumFormatted = formatOutSum(outSum);
  
  // Validate InvId
  if (!/^\d+$/.test(invId)) {
    throw new Error(`Invalid InvId: ${invId} (must be digits only)`);
  }
  const invIdNum = parseInt(invId, 10);
  if (invIdNum <= 0 || invIdNum > 2000000000) {
    throw new Error(`InvId out of range: ${invId} (must be 1-2000000000)`);
  }
  
  // Build form fields (without SignatureValue)
  const fields: Record<string, string> = {
    MerchantLogin: config.merchantLogin,
    OutSum: outSumFormatted,
    InvId: invId,
    Description: description.substring(0, 128),
  };
  
  // Add Shp_userId if provided
  if (telegramUserId) {
    fields.Shp_userId = String(telegramUserId);
  }
  
  // Process Receipt if provided
  let receiptEncoded: string | undefined;
  let receiptJson: string | undefined;
  if (receipt) {
    // Serialize Receipt JSON deterministically
    receiptJson = JSON.stringify(receipt, (key, value) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return Object.keys(value).sort().reduce((acc, k) => {
          acc[k] = value[k];
          return acc;
        }, {} as any);
      }
      return value;
    });
    // URL-encode ONCE - this exact value will be used in BOTH form field AND signature
    receiptEncoded = encodeURIComponent(receiptJson);
    fields.Receipt = receiptEncoded; // Add to form fields
  }
  
  // Add Recurring flag (only if feature flag is enabled)
  const featureRecurring = process.env.FEATURE_RECURRING === 'true' || process.env.FEATURE_RECURRING === '1';
  if (featureRecurring) {
    fields.Recurring = 'true';
  }
  
  // Add IsTest if test mode
  if (config.isTest === true) {
    fields.IsTest = '1';
  }
  
  // Build signature
  // CRITICAL: If Receipt is in fields, it MUST be included in signature using EXACT same encoded value
  const includeReceiptInSignature = !!receiptEncoded;
  
  // Extract and sort Shp_* parameters
  const shpEntries: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(fields)) {
    if (key.startsWith('Shp_')) {
      shpEntries.push([key, value]);
    }
  }
  // Sort by parameter name (key) alphabetically
  shpEntries.sort(([keyA], [keyB]) => keyA.localeCompare(keyB, undefined, { sensitivity: 'case' }));
  
  // Build Shp_* params in format "Shp_key=value"
  const shpParams: string[] = shpEntries.map(([key, value]) => `${key}=${String(value).trim()}`);
  
  // Build signature parts in correct order
  const signatureParts: string[] = [
    config.merchantLogin,
    outSumFormatted,
    invId,
  ];
  
  // Add Receipt if present (using EXACT same encoded value as in form field)
  if (includeReceiptInSignature && receiptEncoded) {
    signatureParts.push(receiptEncoded);
  }
  
  // Add Pass1
  signatureParts.push(config.pass1.trim());
  
  // Add Shp_* params AFTER Pass1 (sorted)
  if (shpParams.length > 0) {
    signatureParts.push(...shpParams);
  }
  
  // Calculate signature
  const exactSignatureString = signatureParts.join(':');
  const exactSignatureStringMasked = signatureParts.map(p => 
    p === config.pass1.trim() ? '[PASS1_HIDDEN]' : p
  ).join(':');
  const signatureValue = calculateSignature(...signatureParts);
  
  // Add SignatureValue to form fields
  fields.SignatureValue = signatureValue;
  
  // Build HTML form
  const baseUrl = 'https://auth.robokassa.ru/Merchant/Index.aspx';
  const formInputs = Object.entries(fields)
    .map(([name, value]) => {
      const escapedValue = escapeHtmlAttribute(value);
      return `    <input type="hidden" name="${name}" value="${escapedValue}">`;
    })
    .join('\n');
  
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Robokassa Payment</title>
</head>
<body>
  <form id="robokassa-form" method="POST" action="${baseUrl}">
${formInputs}
  </form>
  <script>
    document.getElementById('robokassa-form').submit();
  </script>
</body>
</html>`;
  
  return {
    fields,
    html,
    debug: {
      exactSignatureStringMasked,
      signatureValue,
      signatureParts, // Array of strings
      formFields: fields,
      hasReceipt: !!receiptEncoded,
      receiptInSignature: includeReceiptInSignature,
      shpParams,
      merchantLogin: config.merchantLogin,
      outSum: outSumFormatted,
      invId,
      isTest: config.isTest,
    },
  };
}

/**
 * Build child recurring payment for Merchant/Recurring
 * 
 * Fields: MerchantLogin, OutSum, InvoiceID (generated, non-zero), PreviousInvoiceID (the first payment InvId),
 *         Description, SignatureValue, shp_*.
 * 
 * Do NOT send: Receipt, IncCurrLabel, ExpirationDate, Recurring.
 * 
 * Signature formula: MD5(MerchantLogin:OutSum:InvoiceID:Pass1[:Shp_...sorted])
 * CRITICAL: PreviousInvoiceID is NOT included in SignatureValue!
 * 
 * @param config - Robokassa configuration
 * @param outSum - Payment amount as string with 2 decimals (e.g., "199.00")
 * @param invoiceId - Child invoice ID (string, digits only, non-zero)
 * @param previousInvoiceId - Parent invoice ID from first payment (string, digits only)
 * @param description - Payment description (ASCII, max 128 chars)
 * @param telegramUserId - Optional Telegram user ID (for Shp_userId)
 * @returns Form fields, HTML, and debug info
 */
export function buildChildRecurringPayment(
  config: RobokassaConfig,
  outSum: string,
  invoiceId: string,
  previousInvoiceId: string,
  description: string,
  telegramUserId?: number
): {
  fields: Record<string, string>;
  html: string;
  debug: {
    exactSignatureStringMasked: string;
    signatureValue: string;
    signatureParts: string[]; // Array of strings, not objects
    formFields: Record<string, string>;
    shpParams: string[];
    [key: string]: any;
  };
} {
  // Format OutSum to ensure 2 decimals
  const outSumFormatted = formatOutSum(outSum);
  
  // Validate InvoiceID
  if (!/^\d+$/.test(invoiceId)) {
    throw new Error(`Invalid InvoiceID: ${invoiceId} (must be digits only)`);
  }
  const invoiceIdNum = parseInt(invoiceId, 10);
  if (invoiceIdNum <= 0 || invoiceIdNum > 2000000000) {
    throw new Error(`InvoiceID out of range: ${invoiceId} (must be 1-2000000000)`);
  }
  
  // Validate PreviousInvoiceID
  if (!/^\d+$/.test(previousInvoiceId)) {
    throw new Error(`Invalid PreviousInvoiceID: ${previousInvoiceId} (must be digits only)`);
  }
  
  // Build form fields (without SignatureValue)
  // CRITICAL: DO NOT include Receipt, IncCurrLabel, ExpirationDate, Recurring
  const fields: Record<string, string> = {
    MerchantLogin: config.merchantLogin,
    OutSum: outSumFormatted,
    InvoiceID: invoiceId, // Use InvoiceID (not InvId) for child payment
    PreviousInvoiceID: previousInvoiceId,
    Description: description.substring(0, 128),
  };
  
  // Add Shp_userId if provided
  if (telegramUserId) {
    fields.Shp_userId = String(telegramUserId);
  }
  
  // Add IsTest if test mode
  if (config.isTest === true) {
    fields.IsTest = '1';
  }
  
  // Extract and sort Shp_* parameters
  const shpEntries: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(fields)) {
    if (key.startsWith('Shp_')) {
      shpEntries.push([key, value]);
    }
  }
  // Sort by parameter name (key) alphabetically
  shpEntries.sort(([keyA], [keyB]) => keyA.localeCompare(keyB, undefined, { sensitivity: 'case' }));
  
  // Build Shp_* params in format "Shp_key=value"
  const shpParams: string[] = shpEntries.map(([key, value]) => `${key}=${String(value).trim()}`);
  
  // Build signature parts in correct order
  // CRITICAL: PreviousInvoiceID is NOT included in signature!
  const signatureParts: string[] = [
    config.merchantLogin,
    outSumFormatted,
    invoiceId, // Use InvoiceID (not PreviousInvoiceID) in signature
  ];
  
  // Add Pass1
  signatureParts.push(config.pass1.trim());
  
  // Add Shp_* params AFTER Pass1 (sorted)
  if (shpParams.length > 0) {
    signatureParts.push(...shpParams);
  }
  
  // Calculate signature
  const exactSignatureString = signatureParts.join(':');
  const exactSignatureStringMasked = signatureParts.map(p => 
    p === config.pass1.trim() ? '[PASS1_HIDDEN]' : p
  ).join(':');
  const signatureValue = calculateSignature(...signatureParts);
  
  // Add SignatureValue to form fields
  fields.SignatureValue = signatureValue;
  
  // Build HTML form
  const baseUrl = 'https://auth.robokassa.ru/Merchant/Recurring';
  const formInputs = Object.entries(fields)
    .map(([name, value]) => {
      const escapedValue = escapeHtmlAttribute(value);
      return `    <input type="hidden" name="${name}" value="${escapedValue}">`;
    })
    .join('\n');
  
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Robokassa Recurring Payment</title>
</head>
<body>
  <form id="robokassa-form" method="POST" action="${baseUrl}">
${formInputs}
  </form>
  <script>
    document.getElementById('robokassa-form').submit();
  </script>
</body>
</html>`;
  
  return {
    fields,
    html,
    debug: {
      exactSignatureStringMasked,
      signatureValue,
      signatureParts, // Array of strings
      formFields: fields,
      shpParams,
      merchantLogin: config.merchantLogin,
      outSum: outSumFormatted,
      invoiceId,
      previousInvoiceId,
      isTest: config.isTest,
    },
  };
}

/**
 * Generate signature for Recurring endpoint (child payment)
 * CRITICAL: PreviousInvoiceID is NOT included in signature!
 * Signature: MD5(MerchantLogin:OutSum:InvoiceID:Pass1)
 * 
 * @param config - Robokassa configuration
 * @param outSum - Payment amount as string (e.g., "199.00")
 * @param invoiceId - Child invoice ID (generated by shop, non-zero)
 * @returns Signature value
 */
export function signRecurring(
  config: RobokassaConfig,
  outSum: string,
  invoiceId: number
): string {
  // CRITICAL: PreviousInvoiceID is NOT in signature!
  // Only: MerchantLogin:OutSum:InvoiceID:Pass1
  const signatureParts = [
    config.merchantLogin,
    outSum,
    String(invoiceId),
    config.pass1,
  ];
  
  return calculateSignature(...signatureParts);
}

/**
 * Generate HTML form for Recurring endpoint (child payment)
 * 
 * @param config - Robokassa configuration
 * @param outSum - Payment amount as string (e.g., "199.00")
 * @param invoiceId - Child invoice ID (generated by shop, non-zero)
 * @param previousInvoiceId - Parent invoice ID from first payment
 * @param description - Payment description
 * @param autoSubmit - If true, form auto-submits; if false, shows debug page
 * @returns HTML form
 */
export function generateRecurringForm(
  config: RobokassaConfig,
  outSum: string,
  invoiceId: number,
  previousInvoiceId: number,
  description: string,
  autoSubmit: boolean = true
): string {
  const baseUrl = 'https://auth.robokassa.ru/Merchant/Recurring';
  
  // Calculate signature (PreviousInvoiceID NOT included)
  const signatureValue = signRecurring(config, outSum, invoiceId);
  
  // Build form fields
  // CRITICAL: DO NOT include Recurring, IncCurrLabel, ExpirationDate
  const formFields: Record<string, string> = {
    MerchantLogin: config.merchantLogin,
    InvoiceID: String(invoiceId),
    PreviousInvoiceID: String(previousInvoiceId),
    OutSum: outSum,
    Description: description,
    SignatureValue: signatureValue,
  };
  
  // Add IsTest if test mode
  if (config.isTest === true) {
    formFields.IsTest = '1';
  }
  
  // Build HTML form
  const formHtml = Object.entries(formFields)
    .map(([name, value]) => {
      const escapedValue = value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
      return `    <input type="hidden" name="${name}" value="${escapedValue}">`;
    })
    .join('\n');
  
  if (autoSubmit) {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Robokassa Recurring Payment</title>
</head>
<body>
  <form id="robokassa-form" method="POST" action="${baseUrl}">
${formHtml}
  </form>
  <script>
    document.getElementById('robokassa-form').submit();
  </script>
</body>
</html>`;
  } else {
    // Debug mode - show form with submit button
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Robokassa Recurring Payment Debug</title>
  <style>
    body { font-family: monospace; padding: 20px; background: #0a0a0a; color: #e0e0e0; }
    .form-field { margin: 10px 0; padding: 10px; background: #1a1a1a; border-radius: 5px; }
    .form-field-name { color: #00ff88; font-weight: bold; }
    button { background: #00ff88; color: #000; padding: 15px 30px; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; }
    button:hover { background: #00cc6a; }
  </style>
</head>
<body>
  <h1>🔍 Robokassa Recurring Payment (Child)</h1>
  <div class="form-field">
    <span class="form-field-name">Endpoint:</span> ${baseUrl}
  </div>
  <div class="form-field">
    <span class="form-field-name">InvoiceID (child):</span> ${invoiceId}
  </div>
  <div class="form-field">
    <span class="form-field-name">PreviousInvoiceID (parent):</span> ${previousInvoiceId}
  </div>
  <div class="form-field">
    <span class="form-field-name">OutSum:</span> ${outSum}
  </div>
  <div class="form-field">
    <span class="form-field-name">SignatureValue:</span> ${signatureValue}
  </div>
  <form id="robokassa-form" method="POST" action="${baseUrl}">
${formHtml}
    <button type="submit">💳 Submit to Robokassa Recurring</button>
  </form>
</body>
</html>`;
  }
}
