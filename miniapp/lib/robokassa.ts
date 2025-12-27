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
 * Calculate MD5 signature for Robokassa
 */
function calculateSignature(...args: (string | number)[]): string {
  const signatureString = args.map(arg => String(arg)).join(':');
  return createHash('md5').update(signatureString).digest('hex').toLowerCase();
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
 * Sign minimal payment (no Receipt, no Recurring)
 * Signature: MD5(MerchantLogin:OutSum:InvId:Password1)
 */
export function signMinimal(
  config: RobokassaConfig,
  outSum: string,
  invId: number
): { signature: string; signatureBase: string } {
  const signatureBase = `${config.merchantLogin}:${outSum}:${invId}`;
  const signature = calculateSignature(
    config.merchantLogin,
    outSum,
    invId,
    config.password1
  );
  
  return { signature, signatureBase };
}

/**
 * Sign payment with Receipt (recurring mode)
 * Signature: MD5(MerchantLogin:OutSum:InvId:ReceiptEncoded:Password1)
 * 
 * @param config - Robokassa configuration
 * @param outSum - Payment amount as string (e.g., "1.00")
 * @param invId - Unique InvId (integer)
 * @param receiptEncoded - Receipt JSON stringified and encoded with encodeURIComponent ONCE
 * @returns Signature and signature base (without password)
 */
export function signWithReceipt(
  config: RobokassaConfig,
  outSum: string,
  invId: number,
  receiptEncoded: string
): { signature: string; signatureBase: string } {
  const signatureBase = `${config.merchantLogin}:${outSum}:${invId}:${receiptEncoded}`;
  const signature = calculateSignature(
    config.merchantLogin,
    outSum,
    invId,
    receiptEncoded,
    config.password1
  );
  
  return { signature, signatureBase };
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
  outSum: string,
  invId: number,
  description: string,
  mode: PaymentMode,
  receipt?: Receipt,
  telegramUserId?: number,
  debugMode: boolean = false
): { html: string; debug: any } {
  const baseUrl = 'https://auth.robokassa.ru/Merchant/Index.aspx';
  
  let signature: string;
  let signatureBase: string;
  let encodedReceipt: string | undefined;
  let receiptJson: string | undefined;
  
  const formFields: Record<string, string> = {
    MerchantLogin: config.merchantLogin,
    OutSum: outSum,
    InvId: String(invId), // Use InvId, not InvoiceID
    Description: description,
  };
  
  if (mode === 'minimal') {
    // Minimal mode: no Receipt, no Recurring
    const signResult = signMinimal(config, outSum, invId);
    signature = signResult.signature;
    signatureBase = signResult.signatureBase;
  } else {
    // Recurring mode: with Receipt and Recurring=true
    if (!receipt) {
      throw new Error('Receipt is required for recurring mode');
    }
    
    // Step 1: JSON.stringify receipt
    receiptJson = JSON.stringify(receipt);
    
    // Step 2: encodeURIComponent ONCE (no double encoding)
    encodedReceipt = encodeURIComponent(receiptJson);
    
    // Step 3: Sign with encoded receipt
    const signResult = signWithReceipt(config, outSum, invId, encodedReceipt);
    signature = signResult.signature;
    signatureBase = signResult.signatureBase;
    
    // Add Receipt and Recurring to form
    formFields.Receipt = encodedReceipt;
    formFields.Recurring = 'true';
  }
  
  formFields.SignatureValue = signature;
  
  if (config.isTest) {
    formFields.IsTest = '1';
  }
  
  if (telegramUserId) {
    formFields.Shp_userId = String(telegramUserId);
  }
  
  // Build form HTML
  let formHtml = '';
  
  if (debugMode) {
    // Debug mode: show form with submit button and debug info
    const debugJson = JSON.stringify({
      mode,
      merchantLogin: config.merchantLogin,
      outSum,
      invId,
      description,
      isTest: config.isTest,
      isTestIncluded: config.isTest,
      signatureBaseWithoutPassword: signatureBase,
      signatureValue: signature,
      formFields: Object.fromEntries(
        Object.entries(formFields).map(([k, v]) => [
          k,
          k === 'Receipt' ? `[encoded, length: ${v.length}, preview: ${v.substring(0, 80)}...]` : v
        ])
      ),
      receiptRawLength: receiptJson?.length || 0,
      receiptEncodedLength: encodedReceipt?.length || 0,
      receiptEncodedPreview: encodedReceipt ? encodedReceipt.substring(0, 80) + '...' : undefined,
    }, null, 2);
    
    formHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Robokassa Payment Debug</title>
  <style>
    body { font-family: monospace; padding: 20px; background: #1a1a1a; color: #00ff00; }
    .container { max-width: 800px; margin: 0 auto; }
    button { background: #0066cc; color: white; padding: 15px 30px; font-size: 16px; border: none; border-radius: 5px; cursor: pointer; margin: 10px 0; }
    button:hover { background: #0052a3; }
    .debug-section { background: #2a2a2a; padding: 15px; margin: 10px 0; border-radius: 5px; border: 1px solid #444; }
    .debug-section h3 { margin-top: 0; color: #00ff00; }
    pre { background: #000; padding: 10px; border-radius: 3px; overflow-x: auto; font-size: 12px; }
    .copy-btn { background: #333; padding: 5px 10px; font-size: 12px; margin-left: 10px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔍 Robokassa Payment Debug Mode</h1>
    
    <div class="debug-section">
      <h3>Payment Form</h3>
      <form id="robokassa-form" method="POST" action="${baseUrl}">`;
    
    for (const [name, value] of Object.entries(formFields)) {
      // For Receipt, use the raw encoded value (already URL-encoded)
      // For other fields, escape HTML
      const escapedValue = name === 'Receipt' ? value : escapeHtmlAttribute(value);
      formHtml += `\n        <input type="hidden" name="${name}" value="${escapedValue}">`;
    }
    
    formHtml += `
      </form>
      <button onclick="document.getElementById('robokassa-form').submit()">💳 Pay Now</button>
    </div>
    
    <div class="debug-section">
      <h3>Debug JSON <button class="copy-btn" onclick="copyToClipboard('debug-json')">Copy</button></h3>
      <pre id="debug-json">${escapeHtmlAttribute(debugJson)}</pre>
    </div>
    
    <div class="debug-section">
      <h3>Signature Base (without password) <button class="copy-btn" onclick="copyToClipboard('signature-base')">Copy</button></h3>
      <pre id="signature-base">${escapeHtmlAttribute(signatureBase)}</pre>
    </div>
    
    <script>
      function copyToClipboard(id) {
        const text = document.getElementById(id).textContent;
        navigator.clipboard.writeText(text).then(() => {
          alert('Copied to clipboard!');
        });
      }
    </script>
  </div>
</body>
</html>`;
  } else {
    // Production mode: auto-submit
    formHtml = `<form id="robokassa-form" method="POST" action="${baseUrl}">`;
    
    for (const [name, value] of Object.entries(formFields)) {
      // For Receipt, use the raw encoded value (already URL-encoded, don't HTML escape it)
      // For other fields, escape HTML attributes
      const escapedValue = name === 'Receipt' ? value : escapeHtmlAttribute(value);
      formHtml += `<input type="hidden" name="${name}" value="${escapedValue}">`;
    }
    
    formHtml += `</form>`;
    formHtml += `<script>document.getElementById('robokassa-form').submit();</script>`;
  }
  
  return {
    html: formHtml,
    debug: {
      mode,
      merchantLogin: config.merchantLogin,
      outSum,
      invId,
      description,
      isTest: config.isTest,
      isTestIncluded: config.isTest,
      receiptRaw: receiptJson,
      receiptRawLength: receiptJson?.length || 0,
      receiptEncoded: encodedReceipt,
      receiptEncodedLength: encodedReceipt?.length || 0,
      receiptEncodedPreview: encodedReceipt ? encodedReceipt.substring(0, 80) + '...' : undefined,
      signatureBaseWithoutPassword: signatureBase,
      signatureValue: signature,
      formFields: Object.fromEntries(
        Object.entries(formFields).map(([k, v]) => [
          k,
          k === 'Receipt' ? `[encoded, length: ${v.length}, preview: ${v.substring(0, 80)}...]` : v
        ])
      ),
    },
  };
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
