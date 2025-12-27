/**
 * Robokassa payment utilities
 * Minimal implementation for trial payment creation
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

/**
 * Calculate MD5 signature for Robokassa
 */
function calculateSignature(...args: (string | number)[]): string {
  const signatureString = args.map(arg => String(arg)).join(':');
  return createHash('md5').update(signatureString).digest('hex').toLowerCase();
}

/**
 * Generate Receipt for fiscalization (54-FZ)
 * 
 * @param amount - Payment amount (must match OutSum exactly)
 * @returns Receipt object
 */
export function generateReceipt(amount: number): Receipt {
  return {
    sno: 'usn_income', // УСН доходы (self-employed)
    items: [
      {
        name: 'Trial subscription (3 days)',
        quantity: 1,
        sum: amount, // MUST equal OutSum exactly
        payment_method: 'full_payment',
        payment_object: 'service',
        tax: 'none',
      },
    ],
  };
}

/**
 * Generate payment signature WITH Receipt
 * 
 * CRITICAL: SignatureValue = MD5(MerchantLogin:OutSum:InvoiceID:Receipt:ROBOKASSA_PASSWORD1)
 * 
 * @param config - Robokassa configuration
 * @param outSum - Payment amount as string (e.g., "1.000000")
 * @param invoiceId - Unique InvoiceID
 * @param receipt - Receipt object (will be JSON.stringify + encodeURIComponent ONCE)
 * @returns Signature, encoded receipt, and debug info
 */
export function generatePaymentSignatureWithReceipt(
  config: RobokassaConfig,
  outSum: string,
  invoiceId: string,
  receipt: Receipt
): { signature: string; encodedReceipt: string; signatureBase: string; debug: any } {
  // Step 1: JSON.stringify receipt
  const receiptJson = JSON.stringify(receipt);
  
  // Step 2: encodeURIComponent ONCE (no double encoding)
  const encodedReceipt = encodeURIComponent(receiptJson);
  
  // Step 3: Calculate signature base (WITHOUT password for logging)
  const signatureBase = `${config.merchantLogin}:${outSum}:${invoiceId}:${encodedReceipt}`;
  
  // Step 4: Calculate signature WITH password
  const signature = calculateSignature(
    config.merchantLogin,
    outSum,
    invoiceId,
    encodedReceipt, // Use the SAME encodedReceipt string
    config.password1 // ONLY Password1, NOT Password2
  );
  
  return {
    signature,
    encodedReceipt,
    signatureBase,
    debug: {
      receiptJson,
      receiptJsonLength: receiptJson.length,
      encodedReceipt,
      encodedReceiptLength: encodedReceipt.length,
      signatureBase,
      signature,
    },
  };
}

/**
 * Generate auto-submitting HTML form for Robokassa payment
 * 
 * @param config - Robokassa configuration
 * @param outSum - Payment amount as string (e.g., "1.000000")
 * @param invoiceId - Unique InvoiceID
 * @param description - Payment description
 * @param receipt - Receipt object
 * @param telegramUserId - Telegram user ID (for Shp_userId)
 * @returns HTML form and debug info
 */
export function generatePaymentForm(
  config: RobokassaConfig,
  outSum: string,
  invoiceId: string,
  description: string,
  receipt: Receipt,
  telegramUserId?: number
): { html: string; debug: any } {
  const baseUrl = 'https://auth.robokassa.ru/Merchant/Index.aspx';
  
  // Generate signature with Receipt
  const { signature, encodedReceipt, signatureBase, debug } = generatePaymentSignatureWithReceipt(
    config,
    outSum,
    invoiceId,
    receipt
  );
  
  // Build form HTML
  let formHtml = `<form id="robokassa-form" method="POST" action="${baseUrl}">`;
  formHtml += `<input type="hidden" name="MerchantLogin" value="${config.merchantLogin}">`;
  formHtml += `<input type="hidden" name="OutSum" value="${outSum}">`;
  formHtml += `<input type="hidden" name="InvoiceID" value="${invoiceId}">`;
  formHtml += `<input type="hidden" name="Description" value="${description}">`;
  formHtml += `<input type="hidden" name="SignatureValue" value="${signature}">`;
  formHtml += `<input type="hidden" name="Receipt" value="${encodedReceipt.replace(/"/g, '&quot;')}">`;
  formHtml += `<input type="hidden" name="Recurring" value="true">`; // Recurring = true
  
  if (config.isTest) {
    formHtml += `<input type="hidden" name="IsTest" value="1">`;
  }
  
  if (telegramUserId) {
    formHtml += `<input type="hidden" name="Shp_userId" value="${telegramUserId}">`;
  }
  
  formHtml += `</form>`;
  formHtml += `<script>document.getElementById('robokassa-form').submit();</script>`;
  
  return {
    html: formHtml,
    debug: {
      ...debug,
      formParams: {
        MerchantLogin: config.merchantLogin,
        OutSum: outSum,
        InvoiceID: invoiceId,
        Description: description,
        SignatureValue: signature,
        Receipt: '[encoded, length: ' + encodedReceipt.length + ']',
        Recurring: 'true',
        Shp_userId: telegramUserId || 'not set',
      },
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

