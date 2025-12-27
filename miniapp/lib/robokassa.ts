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
 * Generate auto-submitting HTML form for Robokassa payment
 * 
 * @param config - Robokassa configuration
 * @param outSum - Payment amount as string (e.g., "1.00")
 * @param invId - Unique InvId (integer, <= 2_000_000_000)
 * @param description - Payment description (ASCII, no emojis)
 * @param mode - Payment mode: 'minimal' or 'recurring'
 * @param receipt - Receipt object (only used in recurring mode)
 * @param telegramUserId - Telegram user ID (for Shp_userId)
 * @returns HTML form and debug info
 */
export function generatePaymentForm(
  config: RobokassaConfig,
  outSum: string,
  invId: number,
  description: string,
  mode: PaymentMode,
  receipt?: Receipt,
  telegramUserId?: number
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
  
  // Build form HTML with proper HTML escaping
  let formHtml = `<form id="robokassa-form" method="POST" action="${baseUrl}">`;
  
  for (const [name, value] of Object.entries(formFields)) {
    // HTML escape the value for attribute
    const escapedValue = value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
    
    formHtml += `<input type="hidden" name="${name}" value="${escapedValue}">`;
  }
  
  formHtml += `</form>`;
  formHtml += `<script>document.getElementById('robokassa-form').submit();</script>`;
  
  return {
    html: formHtml,
    debug: {
      mode,
      merchantLogin: config.merchantLogin,
      outSum,
      invId,
      description,
      isTest: config.isTest,
      receiptRaw: receiptJson,
      receiptEncoded: encodedReceipt,
      receiptEncodedLength: encodedReceipt?.length || 0,
      signatureBaseWithoutPassword: signatureBase,
      signatureValue: signature,
      formFields: Object.fromEntries(
        Object.entries(formFields).map(([k, v]) => [
          k,
          k === 'Receipt' ? `[encoded, length: ${v.length}]` : v
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
