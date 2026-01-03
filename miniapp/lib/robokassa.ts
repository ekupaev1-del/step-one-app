/**
 * Robokassa payment utilities
 * Fixed implementation for trial payment creation
 */

import { createHash } from 'crypto';

export interface RobokassaConfig {
  merchantLogin: string;
  password1: string;
  password2: string;
  isTest?: boolean;
}

export interface Receipt {
  sno: string;
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
 * CRITICAL: Returns UPPERCASE hex (Robokassa requirement for form submission)
 * Also logs lowercase for debugging
 */
function calculateSignature(...args: string[]): string {
  const signatureString = args.join(':');
  // #region agent log
  if (typeof window === 'undefined') {
    fetch('http://127.0.0.1:7242/ingest/43e8883f-375d-4d43-af6f-fef79b5ebbe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'robokassa.ts:calculateSignature',message:'MD5 signature calculation',data:{signatureStringLength:signatureString.length,signatureStringPreview:signatureString.substring(0,200),argsCount:args.length,argsTypes:args.map(a=>typeof a)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  }
  // #endregion
  const hash = createHash('md5').update(signatureString).digest('hex');
  const hashUppercase = hash.toUpperCase(); // Robokassa requires UPPERCASE
  const hashLowercase = hash.toLowerCase(); // For debugging
  // #region agent log
  if (typeof window === 'undefined') {
    console.log('[robokassa] MD5 hash (lowercase, for debug):', hashLowercase);
    console.log('[robokassa] MD5 hash (UPPERCASE, for form):', hashUppercase);
    fetch('http://127.0.0.1:7242/ingest/43e8883f-375d-4d43-af6f-fef79b5ebbe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'robokassa.ts:calculateSignature',message:'MD5 hash result',data:{hashOriginal:hash,hashUppercase:hashUppercase,hashLowercase:hashLowercase,length:hashUppercase.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  }
  // #endregion
  return hashUppercase; // Return UPPERCASE for Robokassa
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
 * Order: MerchantLogin:OutSum:InvId[:ReceiptEncoded]:Password1[:Shp_* params]
 * 
 * @param merchantLogin - Merchant login
 * @param outSum - Payment amount as string (e.g., "1.00")
 * @param invId - Unique InvId (integer)
 * @param encodedReceipt - Receipt encoded (only for recurring mode, optional)
 * @param password1 - Password1 for signature
 * @param customParams - Array of custom params in format "Shp_key=value" (sorted alphabetically)
 * @returns Array of signature parts in correct order
 */
function buildSignatureBaseParts(
  merchantLogin: string,
  outSum: string,
  invId: number,
  encodedReceipt: string | undefined,
  password1: string,
  customParams: string[]
): string[] {
  // CRITICAL: Convert invId to string to match Robokassa's exact format
  const parts: string[] = [
    merchantLogin,
    outSum,
    String(invId), // Convert to string
  ];
  
  // Add ReceiptEncoded if present (recurring mode) - BEFORE Password1
  if (encodedReceipt) {
    parts.push(encodedReceipt);
  }
  
  // Add Password1 BEFORE custom params
  parts.push(password1);
  
  // Add custom params (Shp_*) AFTER Password1 - sorted alphabetically
  if (customParams.length > 0) {
    parts.push(...customParams);
  }
  
  return parts;
}

/**
 * Generate Receipt for fiscalization (54-FZ)
 * For Robocheki SMZ, use "npd" (налог на профессиональный доход)
 * 
 * @param amount - Payment amount (must match OutSum exactly, e.g., 1.00)
 * @returns Receipt object
 */
export function generateReceipt(amount: number): Receipt {
  // CRITICAL: Ensure sum matches OutSum format exactly
  // Format amount to 2 decimal places to match OutSum format (e.g., "1.00")
  const formattedAmount = parseFloat(amount.toFixed(2));
  
  return {
    sno: 'npd', // НПД (налог на профессиональный доход) for Robocheki SMZ
    items: [
      {
        name: 'Trial subscription 3 days',
        quantity: 1,
        sum: formattedAmount, // MUST equal OutSum exactly (1.00)
        payment_method: 'full_payment',
        payment_object: 'service',
        tax: 'none',
      },
    ],
  };
}

/**
 * Unified signature generator for both minimal and recurring modes
 * Signature rule: MD5(MerchantLogin:OutSum:InvId[:ReceiptEncoded]:Password1:Shp_* params)
 * 
 * CRITICAL: Shp_* params MUST be AFTER Password1, not before!
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
  invId: number,
  receiptEncoded: string | undefined,
  customParams: string[] = []
): { signature: string; signatureBase: string; signatureBaseFull: string; signatureParts: string[] } {
  // Build signature parts in CORRECT order using helper
  const signatureParts = buildSignatureBaseParts(
    config.merchantLogin,
    outSum,
    invId,
    receiptEncoded,
    config.password1,
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
 * Signature: MD5(MerchantLogin:OutSum:InvId:Password1[:Shp_* params])
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
  invId: number,
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
 * Signature: MD5(MerchantLogin:OutSum:InvId:ReceiptEncoded:Password1[:Shp_* params])
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
  invId: number,
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
  invId: number;
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
  
  // Build base fields
  const fields: Record<string, string> = {
    MerchantLogin: payload.merchantLogin,
    OutSum: outSumFormatted,
    InvId: String(payload.invId),
    Description: payload.description,
  };
  
  // Add Shp_* params if telegramUserId provided
  if (payload.telegramUserId) {
    fields.Shp_userId = String(payload.telegramUserId);
  }
  
  // Add Receipt and Recurring for recurring mode
  if (payload.mode === 'recurring') {
    if (!payload.receipt) {
      throw new Error('Receipt is required for recurring mode');
    }
    
    // CRITICAL: Robokassa requires Receipt to be URL-encoded exactly ONCE
    // The same encoded value is used both in the form field AND in the signature
    const receiptJson = JSON.stringify(payload.receipt);
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
    fields.Recurring = 'true';
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
 * Signature format: MD5("MerchantLogin:OutSum:InvId[:Receipt]:Password1[:Shp_*...]")
 * 
 * Rules:
 * - Include Receipt ONLY if "Receipt" field is present in fields
 * - Include all Shp_* parameters that are present in fields
 * - Sort Shp_* parameters alphabetically by parameter name
 * - Returns lowercase MD5 hex
 * 
 * @param fields - Final form fields (without SignatureValue)
 * @param password1 - Password1 for signature calculation
 * @returns Signature value and debug info
 */
function buildRobokassaSignature(
  fields: Record<string, string>,
  password1: string
): {
  signatureValue: string;
  exactSignatureString: string;
  exactSignatureStringMasked: string;
  signatureParts: string[];
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
  
  // #region agent log
  if (typeof window === 'undefined') {
    console.log('[robokassa] ========== SIGNATURE RECEIPT EXTRACTION ==========');
    console.log('[robokassa] receipt present:', !!receipt, 'length:', receipt?.length || 0);
    console.log('[robokassa] Using receipt (single-encoded) for signature:', !!receipt);
    if (receipt) {
      console.log('[robokassa] receipt preview:', receipt.substring(0, 80));
    }
    console.log('[robokassa] ==================================================');
    
    fetch('http://127.0.0.1:7242/ingest/43e8883f-375d-4d43-af6f-fef79b5ebbe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'robokassa.ts:buildRobokassaSignature',message:'Extracted values with receipt',data:{merchantLogin:merchantLogin,merchantLoginIsSteopone:merchantLogin==='steopone',outSum:outSum,outSumType:typeof outSum,outSumIs100:outSum==='1.00',invId:invId,invIdType:typeof invId,receiptPresent:!!receipt,receiptLength:receipt?.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
  }
  // #endregion
  
  // Build signature parts in correct order
  // CRITICAL: All parts must be strings to match Robokassa's exact format
  const signatureParts: string[] = [
    merchantLogin,
    outSum,
    invId, // String, not number
  ];
  
  // Add Receipt (single-encoded) ONLY if it's present
  // CRITICAL: Use the same receipt value that is sent in the form
  if (receipt) {
    signatureParts.push(receipt);
  }
  
  // Add Password1
  signatureParts.push(password1);
  
  // Extract and sort Shp_* parameters alphabetically
  // CRITICAL: Only include Shp_* parameters in signature, NOT Description, Recurring, IsTest, etc.
  const shpParams: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    // Only include Shp_* parameters in signature
    // Exclude: Description, Recurring, IsTest, SignatureValue (not yet added)
    if (key.startsWith('Shp_')) {
      // Format: "Shp_key=value" (NO URL encoding)
      shpParams.push(`${key}=${value}`);
    }
  }
  
  // #region agent log
  if (typeof window === 'undefined') {
    fetch('http://127.0.0.1:7242/ingest/43e8883f-375d-4d43-af6f-fef79b5ebbe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'robokassa.ts:buildRobokassaSignature',message:'Shp params before sort',data:{shpParamsBeforeSort:[...shpParams],shpParamsCount:shpParams.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
  }
  // #endregion
  
  // Sort alphabetically by parameter name (case-sensitive)
  shpParams.sort();
  
  // #region agent log
  if (typeof window === 'undefined') {
    fetch('http://127.0.0.1:7242/ingest/43e8883f-375d-4d43-af6f-fef79b5ebbe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'robokassa.ts:buildRobokassaSignature',message:'Shp params after sort',data:{shpParamsAfterSort:[...shpParams],isSorted:JSON.stringify(shpParams)===JSON.stringify([...shpParams].sort()),password1Index:signatureParts.length-1},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
  }
  // #endregion
  
  // Add Shp_* params AFTER Password1
  if (shpParams.length > 0) {
    signatureParts.push(...shpParams);
  }
  
  // #region agent log
  if (typeof window === 'undefined') {
    const password1Index = signatureParts.findIndex(p => p === password1);
    const shpAfterPassword1 = signatureParts.slice(password1Index + 1).filter(p => p.startsWith('Shp_'));
    fetch('http://127.0.0.1:7242/ingest/43e8883f-375d-4d43-af6f-fef79b5ebbe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'robokassa.ts:buildRobokassaSignature',message:'Signature parts order check',data:{signaturePartsCount:signatureParts.length,password1Index:password1Index,shpAfterPassword1:shpAfterPassword1,shpAfterPassword1Count:shpAfterPassword1.length,partsOrder:signatureParts.map((p,i)=>({index:i,value:typeof p==='string'&&p===password1?'[PASSWORD1]':p.substring(0,50),isPassword:p===password1,isShp:p.startsWith('Shp_'),isReceipt:p===receipt}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  }
  // #endregion
  
  // Build exact signature string
  // All parts are already strings, so just join them
  const exactSignatureString = signatureParts.join(':');
  
  // Build masked signature string (for debug)
  const exactSignatureStringMasked = signatureParts.map(p => 
    p === password1 ? '[PASSWORD1_HIDDEN]' : p
  ).join(':');
  
  // #region agent log
  if (typeof window === 'undefined') {
    fetch('http://127.0.0.1:7242/ingest/43e8883f-375d-4d43-af6f-fef79b5ebbe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'robokassa.ts:buildRobokassaSignature',message:'Exact signature string before MD5',data:{exactSignatureStringLength:exactSignatureString.length,exactSignatureStringPreview:exactSignatureString.substring(0,300),exactSignatureStringMasked:exactSignatureStringMasked},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  }
  // #endregion
  
  // Calculate MD5 signature (UPPERCASE for Robokassa)
  const signatureValue = calculateSignature(...signatureParts);
  
  // #region agent log
  if (typeof window === 'undefined') {
    // CRITICAL: Log exact signature string for debugging Error 29
    // This helps verify that the signature matches what Robokassa expects
    console.log('[robokassa] ========== SIGNATURE CALCULATION (Error 29 Debug) ==========');
    console.log('[robokassa] Exact signature string (masked):', exactSignatureStringMasked);
    console.log('[robokassa] Exact signature string (full, length):', exactSignatureString.length);
    console.log('[robokassa] Signature parts count:', signatureParts.length);
    console.log('[robokassa] Signature parts:', signatureParts.map((p, i) => ({
      index: i + 1,
      part: p === password1 ? '[PASSWORD1]' : (p.startsWith('Shp_') ? p : p.substring(0, 50)),
      isPassword: p === password1,
      isShp: p.startsWith('Shp_'),
      isReceipt: p === receipt,
    })));
    if (receipt) {
      console.log('[robokassa] Receipt in signature (receiptEncoded, length):', receipt.length);
      console.log('[robokassa] Receipt in signature (receiptEncoded, preview):', receipt.substring(0, 80));
    }
    console.log('[robokassa] Shp_* params in signature:', shpParams);
    console.log('[robokassa] Signature value (MD5, UPPERCASE):', signatureValue);
    console.log('[robokassa] Signature value (MD5, lowercase, for debug):', signatureValue.toLowerCase());
    console.log('[robokassa] Signature value length:', signatureValue.length);
    console.log('[robokassa] Signature value is uppercase:', signatureValue === signatureValue.toUpperCase());
    console.log('[robokassa] Signature value is hex:', /^[0-9A-F]{32}$/i.test(signatureValue));
    console.log('[robokassa] ============================================================');
    
    fetch('http://127.0.0.1:7242/ingest/43e8883f-375d-4d43-af6f-fef79b5ebbe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'robokassa.ts:buildRobokassaSignature',message:'Signature value result',data:{signatureValue:signatureValue,signatureValueLength:signatureValue.length,signatureValueIsLowercase:signatureValue===signatureValue.toLowerCase(),signatureValueIsHex:/^[0-9a-f]{32}$/.test(signatureValue),exactSignatureStringLength:exactSignatureString.length,signaturePartsCount:signatureParts.length,shpParamsInSignature:shpParams},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  }
  // #endregion
  
  return {
    signatureValue,
    exactSignatureString,
    exactSignatureStringMasked,
    signatureParts,
  };
}

/**
 * Generate HTML form for Robokassa payment
 * 
 * @param config - Robokassa configuration
 * @param outSum - Payment amount as string (e.g., "1.00")
 * @param invId - Unique InvId (integer, <= 2_000_000_000)
 * @param description - Payment description (ASCII, no emojis)
 * @param mode - Payment mode: 'minimal' or 'recurring'
 * @param receipt - Receipt object (only used in recurring mode)
 * @param telegramUserId - Telegram user ID (for Shp_userId)
 * @param debugMode - If true, return debug HTML instead of auto-submitting
 * @returns HTML form and debug info
 */
export function generatePaymentForm(
  config: RobokassaConfig,
  outSum: string | number,
  invId: number,
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
  const signatureResult = buildRobokassaSignature(
    formFieldsWithoutSignature,
    config.password1
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
  let receiptEncoded: string | undefined; // Single-encoded (used in both form and signature)
  if (mode === 'recurring' && receipt) {
    receiptJson = JSON.stringify(receipt);
    receiptEncoded = formFieldsWithoutSignature.Receipt; // Single-encoded for both form and signature
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
    password1Set: !!config.password1,
    password1Masked: maskPassword(config.password1),
    password2Set: !!config.password2,
    password2Masked: maskPassword(config.password2),
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
    
    // InvId checks
    invIdIsNumber: typeof invId === 'number',
    invIdIsInteger: Number.isInteger(invId),
    invIdWithinRange: invId > 0 && invId <= 2000000000,
    invIdString: String(invId),
    
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
    shpParamsAfterPassword1: (() => {
      const password1Index = signatureResult.signatureParts.findIndex(p => typeof p === 'string' && p === config.password1);
      if (password1Index === -1) return false;
      const shpInSignature = signatureResult.signatureParts.slice(password1Index + 1).some(p => typeof p === 'string' && p.startsWith('Shp_'));
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
      ? signatureResult.signatureParts.some(p => typeof p === 'string' && p === receiptEncoded)
      : null,
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
    signatureParts: signatureResult.signatureParts.map((p, i) => ({
      index: i + 1,
      part: typeof p === 'string' && p === config.password1 ? '[PASSWORD1_HIDDEN]' : String(p),
      type: typeof p,
      isPassword: typeof p === 'string' && p === config.password1,
      isShp: typeof p === 'string' && p.startsWith('Shp_'),
      isReceipt: typeof p === 'string' && p === receiptEncoded,
    })),
    customParams: customParams, // Show which Shp_* params were included in signature (after Password1)
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
    receiptEncoded: receiptEncoded, // Single-encoded (used in both form and signature)
    receiptEncodedLength: receiptEncoded?.length || 0,
    receiptEncodedPreview: receiptEncoded ? receiptEncoded.substring(0, 80) + '...' : undefined,
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
      value: typeof p === 'string' && p === config.password1 ? '[PASSWORD1]' : String(p).substring(0, 50),
      isPassword: typeof p === 'string' && p === config.password1,
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
    
    const password1Index = signatureResult.signatureParts.findIndex(p => typeof p === 'string' && p === config.password1);
    console.log('[robokassa] Password1 index in signature:', password1Index);
    
    if (customParams.length > 0) {
      console.log('[robokassa] Shp_* params after Password1:');
      const shpInSignature = signatureResult.signatureParts.slice(password1Index + 1).filter(p => typeof p === 'string' && p.startsWith('Shp_'));
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
  if (p === config.password1) return `${i + 1}. Password1: [HIDDEN]`;
  if (p.startsWith('Shp_')) return `${i + 1}. ${p}`;
  if (p === receiptEncoded) return `${i + 1}. Receipt (receiptEncoded, for signature and form): [single-encoded, length: ${p.length}]`;
  return `${i + 1}. ${String(p).substring(0, 50)}`;
}).join('\n')}
<strong>8. Exact Signature String (masked):</strong>
${signatureResult.exactSignatureStringMasked}
<strong>9. Signature Value (MD5, UPPERCASE):</strong>
${signatureResult.signatureValue}
<strong>9b. Signature Value (MD5, lowercase, for debug):</strong>
${signatureResult.signatureValue.toLowerCase()}
<strong>10. Signature Length:</strong> ${signatureResult.signatureValue.length} (должно быть 32)
<strong>11. Signature is Lowercase:</strong> ${signatureResult.signatureValue === signatureResult.signatureValue.toLowerCase() ? '✅ Да' : '❌ НЕТ!'}
<strong>12. Signature is Hex:</strong> ${/^[0-9a-f]{32}$/.test(signatureResult.signatureValue) ? '✅ Да' : '❌ НЕТ!'}
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
  signatureFormulaParts.push('Password1');
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
  if (typeof p === 'string' && p === config.password1) {
    return `${i + 1}. Password1: [HIDDEN]`;
  }
  if (typeof p === 'number') {
    if (i === 2) return `${i + 1}. InvId: ${p} (number)`;
  }
  if (typeof p === 'string') {
    if (p === config.merchantLogin) return `${i + 1}. MerchantLogin: "${p}" (length: ${p.length})`;
    if (p === outSumFormatted) return `${i + 1}. OutSum: "${p}" (type: string, length: ${p.length})`;
    if (p === receiptEncoded) return `${i + 1}. ReceiptEncoded (for signature and form): "${p.substring(0, 100)}..." (length: ${p.length}, single-encoded)`;
    if (p.startsWith('Shp_')) return `${i + 1}. ${p} (Shp_* param, after Password1)`;
  }
  return `${i + 1}. ${String(p)} (unknown)`;
}).join('\n')}

Custom Params (Shp_*) - должны быть ПОСЛЕ Password1, отсортированы алфавитно:
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
- Hex формат: ${/^[0-9a-f]{32}$/.test(signatureResult.signatureValue) ? '✅ Да' : '❌ НЕТ!'}

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
 * Get Robokassa config from environment variables
 * IMPORTANT: MerchantLogin must be exactly "steopone" (case-sensitive)
 * Always read from ENV - never hardcode
 */
export function getRobokassaConfig(): RobokassaConfig {
  const merchantLogin = process.env.ROBOKASSA_MERCHANT_LOGIN;
  const password1 = process.env.ROBOKASSA_PASSWORD1;
  const password2 = process.env.ROBOKASSA_PASSWORD2;
  const vercelEnv = process.env.VERCEL_ENV || 'unknown';
  const nodeEnv = process.env.NODE_ENV || 'unknown';
  // Parse ROBOKASSA_TEST_MODE - can be 'true' or '1'
  const testModeEnv = process.env.ROBOKASSA_TEST_MODE;
  const isTest = testModeEnv === 'true' || testModeEnv === '1';

  // STRICT RUNTIME CHECK: Log environment variables (server-side only, never in client)
  if (typeof window === 'undefined') {
    console.log('[robokassa] ========== ENVIRONMENT CHECK ==========');
    console.log('[robokassa] VERCEL_ENV:', vercelEnv);
    console.log('[robokassa] NODE_ENV:', nodeEnv);
    console.log('[robokassa] ROBOKASSA_MERCHANT_LOGIN:', merchantLogin || '[NOT SET]');
    console.log('[robokassa] ROBOKASSA_PASSWORD1:', password1 ? maskPassword(password1) : '[NOT SET]');
    console.log('[robokassa] ROBOKASSA_PASSWORD2:', password2 ? maskPassword(password2) : '[NOT SET]');
    console.log('[robokassa] ROBOKASSA_TEST_MODE (raw):', testModeEnv || '[NOT SET]');
    console.log('[robokassa] ROBOKASSA_TEST_MODE (parsed):', isTest);
    console.log('[robokassa] ========================================');
  }

  if (!merchantLogin || !password1 || !password2) {
    throw new Error(
      'Robokassa credentials missing. Set ROBOKASSA_MERCHANT_LOGIN, ROBOKASSA_PASSWORD1, ROBOKASSA_PASSWORD2'
    );
  }

  // Strict check: merchantLogin must be exactly "steopone"
  if (merchantLogin !== 'steopone') {
    console.error('[robokassa] ❌ CRITICAL: merchantLogin is not "steopone"! Current value:', merchantLogin);
    console.error('[robokassa] ❌ This will cause Robokassa Error 26!');
  }

  return {
    merchantLogin, // Use exactly as from env (must be "steopone")
    password1,
    password2,
    isTest,
  };
}

/**
 * Generate safe InvId (<= 2_000_000_000)
 * Uses timestamp modulo to ensure it's within safe range
 */
export function generateSafeInvId(): number {
  const maxInvId = 2_000_000_000;
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000000);
  
  // Use timestamp % maxInvId + random, then ensure it's within range
  const invId = (timestamp % maxInvId) + random;
  
  // If it exceeds max, wrap around
  return invId > maxInvId ? invId % maxInvId : invId;
}
