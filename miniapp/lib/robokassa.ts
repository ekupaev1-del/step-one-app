/**
 * Robokassa payment utilities
 * Full implementation with Receipt support for fiscalization
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
 * @param amount - Payment amount
 * @returns Receipt object
 */
export function generateReceipt(amount: number): Receipt {
  return {
    sno: 'usn_income', // УСН доходы (self-employed)
    items: [
      {
        name: 'Trial subscription (3 days)',
        quantity: 1,
        sum: amount,
        payment_method: 'full_payment',
        payment_object: 'service',
        tax: 'none',
      },
    ],
  };
}

/**
 * Generate payment signature WITH Receipt (for first payment only)
 * 
 * CRITICAL: SignatureValue = MD5(MerchantLogin:OutSum:InvoiceID:Receipt:ROBOKASSA_PASSWORD1)
 * 
 * @param config - Robokassa configuration
 * @param outSum - Payment amount as string (e.g., "1.000000")
 * @param invoiceId - Unique InvoiceID
 * @param receipt - Receipt object (will be JSON.stringify + encodeURIComponent)
 * @returns Signature and encoded receipt
 */
export function generatePaymentSignatureWithReceipt(
  config: RobokassaConfig,
  outSum: string,
  invoiceId: string,
  receipt: Receipt
): { signature: string; encodedReceipt: string; signatureBase: string } {
  // Step 1: JSON.stringify receipt
  const receiptJson = JSON.stringify(receipt);
  
  // Step 2: encodeURIComponent
  const encodedReceipt = encodeURIComponent(receiptJson);
  
  // Step 3: Calculate signature base (WITHOUT password for logging)
  const signatureBase = `${config.merchantLogin}:${outSum}:${invoiceId}:${encodedReceipt}`;
  
  // Step 4: Calculate signature WITH password
  const signature = calculateSignature(
    config.merchantLogin,
    outSum,
    invoiceId,
    encodedReceipt,
    config.password1
  );
  
  return { signature, encodedReceipt, signatureBase };
}

/**
 * Generate payment signature WITHOUT Receipt (for recurring payments)
 * 
 * @param config - Robokassa configuration
 * @param outSum - Payment amount as string
 * @param invoiceId - Unique InvoiceID
 * @returns Signature
 */
export function generatePaymentSignatureWithoutReceipt(
  config: RobokassaConfig,
  outSum: string,
  invoiceId: string
): { signature: string; signatureBase: string } {
  const signatureBase = `${config.merchantLogin}:${outSum}:${invoiceId}`;
  const signature = calculateSignature(
    config.merchantLogin,
    outSum,
    invoiceId,
    config.password1
  );
  
  return { signature, signatureBase };
}

/**
 * Generate auto-submitting HTML form for Robokassa payment
 * 
 * This is preferred over URL redirect due to long Receipt parameter
 * 
 * @param config - Robokassa configuration
 * @param outSum - Payment amount as string (e.g., "1.000000")
 * @param invoiceId - Unique InvoiceID
 * @param description - Payment description
 * @param receipt - Receipt object (optional, only for first payment)
 * @param telegramUserId - Telegram user ID (for Shp_userId)
 * @returns HTML form string
 */
export function generatePaymentForm(
  config: RobokassaConfig,
  outSum: string,
  invoiceId: string,
  description: string,
  receipt?: Receipt,
  telegramUserId?: number
): { html: string; signature: string; signatureBase: string } {
  const baseUrl = 'https://auth.robokassa.ru/Merchant/Index.aspx';
  
  let signature: string;
  let signatureBase: string;
  let encodedReceipt: string | undefined;
  
  if (receipt) {
    // First payment WITH Receipt
    const receiptResult = generatePaymentSignatureWithReceipt(
      config,
      outSum,
      invoiceId,
      receipt
    );
    signature = receiptResult.signature;
    signatureBase = receiptResult.signatureBase;
    encodedReceipt = receiptResult.encodedReceipt;
  } else {
    // Recurring payment WITHOUT Receipt
    const sigResult = generatePaymentSignatureWithoutReceipt(
      config,
      outSum,
      invoiceId
    );
    signature = sigResult.signature;
    signatureBase = sigResult.signatureBase;
  }
  
  // Build form HTML
  let formHtml = `<form id="robokassa-form" method="POST" action="${baseUrl}">`;
  formHtml += `<input type="hidden" name="MerchantLogin" value="${config.merchantLogin}">`;
  formHtml += `<input type="hidden" name="OutSum" value="${outSum}">`;
  formHtml += `<input type="hidden" name="InvoiceID" value="${invoiceId}">`;
  formHtml += `<input type="hidden" name="Description" value="${description}">`;
  formHtml += `<input type="hidden" name="SignatureValue" value="${signature}">`;
  
  if (receipt && encodedReceipt) {
    formHtml += `<input type="hidden" name="Receipt" value="${encodedReceipt.replace(/"/g, '&quot;')}">`;
  }
  
  formHtml += `<input type="hidden" name="Recurring" value="true">`;
  
  if (config.isTest) {
    formHtml += `<input type="hidden" name="IsTest" value="1">`;
  }
  
  if (telegramUserId) {
    formHtml += `<input type="hidden" name="Shp_userId" value="${telegramUserId}">`;
  }
  
  formHtml += `</form>`;
  formHtml += `<script>document.getElementById('robokassa-form').submit();</script>`;
  
  return { html: formHtml, signature, signatureBase: signatureBase || '' };
}

/**
 * Verify Robokassa result signature
 * 
 * @param config - Robokassa configuration
 * @param outSum - Amount from Robokassa
 * @param invId - Invoice ID from Robokassa
 * @param signature - Signature from Robokassa
 * @returns true if signature is valid
 */
export function verifyResultSignature(
  config: RobokassaConfig,
  outSum: string,
  invId: string,
  signature: string
): boolean {
  // Formula: OutSum:InvId:Password2
  const calculatedSignature = calculateSignature(
    outSum,
    invId,
    config.password2
  );

  return calculatedSignature.toLowerCase() === signature.toLowerCase();
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
