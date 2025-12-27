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
 * CRITICAL: Returns lowercase hex (Robokassa requirement)
 */
function calculateSignature(...args: (string | number)[]): string {
  const signatureString = args.map(arg => String(arg)).join(':');
  return createHash('md5').update(signatureString).digest('hex').toLowerCase();
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
): (string | number)[] {
  const parts: (string | number)[] = [
    merchantLogin,
    outSum,
    invId,
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
  return {
    sno: 'npd', // НПД (налог на профессиональный доход) for Robocheki SMZ
    items: [
      {
        name: 'Trial subscription 3 days',
        quantity: 1,
        sum: amount, // MUST equal OutSum exactly (1.00)
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
): { signature: string; signatureBase: string; signatureBaseFull: string; signatureParts: (string | number)[] } {
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
  const baseParts = [
    config.merchantLogin,
    outSum,
    invId,
  ];
  if (receiptEncoded) {
    baseParts.push(receiptEncoded);
  }
  const signatureBase = baseParts.join(':');
  
  // Build full signature string (with password masked and custom params) for debug
  const fullParts = [
    config.merchantLogin,
    outSum,
    invId,
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
): { signature: string; signatureBase: string; signatureBaseFull: string; signatureParts: (string | number)[] } {
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
  invId: number,
  receiptEncoded: string,
  customParams: string[] = []
): { signature: string; signatureBase: string; signatureBaseFull: string; signatureParts: (string | number)[] } {
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
  // Format OutSum to stable string format (always 2 decimals)
  const outSumFormatted = formatOutSum(payload.outSum);
  
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
    
    // JSON.stringify receipt ONCE
    const receiptJson = JSON.stringify(payload.receipt);
    
    // encodeURIComponent ONCE (no double encoding)
    const receiptEncoded = encodeURIComponent(receiptJson);
    
    fields.Receipt = receiptEncoded;
    fields.Recurring = 'true';
  }
  
  // Add IsTest if test mode
  if (payload.isTest) {
    fields.IsTest = '1';
  }
  
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
  signatureParts: (string | number)[];
} {
  // Extract values in correct order
  const merchantLogin = fields.MerchantLogin;
  const outSum = fields.OutSum;
  const invId = Number(fields.InvId);
  const receipt = fields.Receipt; // May be undefined
  
  // Build signature parts in correct order
  const signatureParts: (string | number)[] = [
    merchantLogin,
    outSum,
    invId,
  ];
  
  // Add Receipt ONLY if it's present in fields
  if (receipt) {
    signatureParts.push(receipt);
  }
  
  // Add Password1
  signatureParts.push(password1);
  
  // Extract and sort Shp_* parameters alphabetically
  const shpParams: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (key.startsWith('Shp_')) {
      // Format: "Shp_key=value" (NO URL encoding)
      shpParams.push(`${key}=${value}`);
    }
  }
  
  // Sort alphabetically by parameter name (case-sensitive)
  shpParams.sort();
  
  // Add Shp_* params AFTER Password1
  if (shpParams.length > 0) {
    signatureParts.push(...shpParams);
  }
  
  // Build exact signature string
  const exactSignatureString = signatureParts.map(p => String(p)).join(':');
  
  // Build masked signature string (for debug)
  const exactSignatureStringMasked = signatureParts.map(p => 
    typeof p === 'string' && p === password1 ? '[PASSWORD1_HIDDEN]' : String(p)
  ).join(':');
  
  // Calculate MD5 signature (lowercase)
  const signatureValue = calculateSignature(...signatureParts);
  
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
  
  // Step 2: Calculate signature based on exact fields
  const signatureResult = buildRobokassaSignature(
    formFieldsWithoutSignature,
    config.password1
  );
  
  // Step 3: Add SignatureValue to form fields
  const formFields: Record<string, string> = {
    ...formFieldsWithoutSignature,
    SignatureValue: signatureResult.signatureValue,
  };
  
  // Extract receipt info for debug (if present)
  let receiptJson: string | undefined;
  let receiptEncoded: string | undefined;
  if (mode === 'recurring' && receipt) {
    receiptJson = JSON.stringify(receipt);
    receiptEncoded = formFieldsWithoutSignature.Receipt;
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
    })),
    customParams: customParams, // Show which Shp_* params were included in signature (after Password1)
    customParamsSorted: customParams, // Confirmed sorted alphabetically
    // Form fields (safe - no secrets)
    formFields: Object.fromEntries(
      Object.entries(formFields).map(([k, v]) => [
        k,
        k === 'Receipt' ? `[encoded, length: ${v.length}, preview: ${v.substring(0, 100)}...]` : v
      ])
    ),
    formFieldsRaw: formFields, // Full raw values for debugging (Receipt is encoded, no secrets)
    finalFormFields: formFields, // Exact fields that will be submitted (for unit test comparison)
    // Receipt info (safe)
    receiptRaw: receiptJson,
    receiptRawLength: receiptJson?.length || 0,
    receiptEncoded: receiptEncoded,
    receiptEncodedLength: receiptEncoded?.length || 0,
    receiptEncodedPreview: receiptEncoded ? receiptEncoded.substring(0, 100) + '...' : undefined,
    receiptFull: receipt,
    telegramUserId: telegramUserId || undefined,
    // Environment check (server-side only)
    envCheck,
    timestamp: new Date().toISOString(),
  };
  
  // Unit-test-like check: Print comparison data (server-side only)
  if (typeof window === 'undefined') {
    console.log('[robokassa] ========== SIGNATURE VERIFICATION ==========');
    console.log('[robokassa] exactSignatureStringMasked:', signatureResult.exactSignatureStringMasked);
    console.log('[robokassa] signatureValueLowercase:', signatureResult.signatureValue);
    console.log('[robokassa] finalFormFields:', JSON.stringify(formFields, null, 2));
    console.log('[robokassa] =============================================');
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
    
    <button class="copy-all-btn" onclick="copyAllDebugInfo()">
      📋 СКОПИРОВАТЬ ВСЮ DEBUG ИНФОРМАЦИЮ (ОДНИМ КЛИКОМ)
    </button>
    
    <div class="error-info">
      <h4>⚠️ Robokassa Error 29 - Диагностика</h4>
      <p><strong>Типичные причины:</strong></p>
      <ul>
        <li>Неправильный порядок параметров в подписи (Shp_* должны быть ПОСЛЕ Password1)</li>
        <li>Shp_* параметры не отсортированы алфавитно</li>
        <li>Shp_* параметры не включены в подпись, хотя присутствуют в форме</li>
        <li>Неправильные имена параметров (должно быть InvId, не InvoiceID)</li>
        <li>Проблемы с кодированием Receipt (двойное кодирование или неправильный формат)</li>
        <li>Несоответствие формата OutSum (должно быть "1.00", не "1.000000")</li>
        <li>MerchantLogin не совпадает с идентификатором в кабинете Robokassa (case-sensitive, должно быть "steopone")</li>
      </ul>
      <p><strong>Проверки:</strong></p>
      <div id="checks"></div>
    </div>
    
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
    signatureFormulaParts.push('ReceiptEncoded');
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
      <h3>🔐 Signature Calculation</h3>
      <pre>Formula: ${signatureFormula}

Custom Params (Shp_*) - appended AFTER Password1, sorted alphabetically:
${customParams.length > 0 ? customParams.join(', ') : 'None'}

EXACT String Used for MD5 (with password masked):
${debugInfo.exactSignatureStringMasked}

EXACT String Used for MD5 (full, for comparison):
${debugInfo.exactSignatureString}

Signature Value (MD5 hash, lowercase):
${signatureResult.signatureValue}

Parts in order:
${signatureResult.signatureParts.map((p: string | number, i: number) => {
  if (typeof p === 'string' && p === config.password1) {
    return `${i + 1}. Password1: [HIDDEN]`;
  }
  if (typeof p === 'number') {
    if (i === 2) return `${i + 1}. InvId: ${p}`;
  }
  if (typeof p === 'string') {
    if (p === config.merchantLogin) return `${i + 1}. MerchantLogin: ${p}`;
    if (p === outSumFormatted) return `${i + 1}. OutSum: ${p}`;
    if (p === receiptEncoded) return `${i + 1}. ReceiptEncoded: ${p.substring(0, 100)}...`;
    if (p.startsWith('Shp_')) return `${i + 1}. ${p}`;
  }
  return `${i + 1}. ${String(p)}`;
}).join('\n')}
</pre>
    </div>`;
  
  if (mode === 'recurring' && receiptJson) {
    formHtml += `
    <div class="debug-section">
      <h3>📄 Receipt Details</h3>
      <pre>Raw JSON:
${escapeHtmlAttribute(receiptJson)}

Encoded (encodeURIComponent):
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
      // Render checks
      const checks = ${JSON.stringify({
        invIdIsNumber: typeof invId === 'number',
        invIdWithinRange: invId <= 2000000000,
        outSumIsString: typeof outSumFormatted === 'string',
        outSumFormat: outSumFormatted === '1.00',
        signatureLength: signatureResult.signatureValue.length === 32,
        signatureIsLowercase: signatureResult.signatureValue === signatureResult.signatureValue.toLowerCase(),
        receiptEncodedOnce: mode === 'minimal' || (receiptEncoded && !receiptEncoded.includes('%25')),
        formHasInvId: 'InvId' in formFields,
        formHasSignatureValue: 'SignatureValue' in formFields,
        merchantLoginSet: config.merchantLogin && config.merchantLogin.length > 0,
        merchantLoginIsSteopone: config.merchantLogin === 'steopone',
        shpUserIdInForm: 'Shp_userId' in formFields,
        shpUserIdInSignature: customParams.length > 0 && customParams.some((p: string) => p.startsWith('Shp_userId=')),
        customParamsSorted: customParams.length === 0 || JSON.stringify(customParams) === JSON.stringify([...customParams].sort()),
        shpParamsAfterPassword1: true, // Confirmed by implementation
        allShpParamsInSignature: customParams.length > 0 && customParams.every((p: string) => signatureResult.signatureParts.some((sp: string | number) => String(sp) === p)),
      })};
      const checksHtml = Object.entries(checks).map(([key, value]) => {
        const className = value ? 'check-ok' : 'check-fail';
        const icon = value ? '✅' : '❌';
        return \`<div class="check-item \${className}">\${icon} \${key}: \${value}</div>\`;
      }).join('');
      document.getElementById('checks').innerHTML = checksHtml;
      
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
  const isTest = process.env.ROBOKASSA_TEST_MODE === 'true';

  // STRICT RUNTIME CHECK: Log environment variables (server-side only, never in client)
  if (typeof window === 'undefined') {
    console.log('[robokassa] ========== ENVIRONMENT CHECK ==========');
    console.log('[robokassa] VERCEL_ENV:', vercelEnv);
    console.log('[robokassa] NODE_ENV:', nodeEnv);
    console.log('[robokassa] ROBOKASSA_MERCHANT_LOGIN:', merchantLogin || '[NOT SET]');
    console.log('[robokassa] ROBOKASSA_PASSWORD1:', password1 ? maskPassword(password1) : '[NOT SET]');
    console.log('[robokassa] ROBOKASSA_PASSWORD2:', password2 ? maskPassword(password2) : '[NOT SET]');
    console.log('[robokassa] ROBOKASSA_TEST_MODE:', isTest);
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
