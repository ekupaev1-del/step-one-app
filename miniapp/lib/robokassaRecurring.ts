/**
 * Robokassa Recurring Payment API
 * 
 * For recurring charges (after trial or monthly):
 * - Use RecurringPayment API
 * - Use RecurringID (saved from first payment)
 * - NO Receipt
 * - NO Recurring flag
 */

import { getRobokassaConfig, generatePaymentSignatureWithoutReceipt } from './robokassa';

export interface RecurringPaymentRequest {
  RecurringID: string;
  InvoiceID: string;
  OutSum: string;
  Description: string;
}

export interface RecurringPaymentResponse {
  success: boolean;
  error?: string;
  invoiceId?: string;
}

/**
 * Create recurring payment via Robokassa RecurringPayment API
 * 
 * @param recurringId - RecurringID from first payment
 * @param invoiceId - New unique InvoiceID
 * @param amount - Payment amount (e.g., 199.0)
 * @param description - Payment description
 * @returns Response with success status
 */
export async function createRecurringPayment(
  recurringId: string,
  invoiceId: string,
  amount: number,
  description: string
): Promise<RecurringPaymentResponse> {
  try {
    console.log('[robokassa/recurring] ========== CREATE RECURRING PAYMENT ==========');
    console.log('[robokassa/recurring] RecurringID:', recurringId);
    console.log('[robokassa/recurring] InvoiceID:', invoiceId);
    console.log('[robokassa/recurring] Amount:', amount);

    const config = getRobokassaConfig();
    
    // Format amount: "199.000000" (6 decimals)
    const outSum = amount.toFixed(6);
    
    // Generate signature WITHOUT Receipt
    const { signature, signatureBase } = generatePaymentSignatureWithoutReceipt(
      config,
      outSum,
      invoiceId
    );

    console.log('[robokassa/recurring] Signature base (WITHOUT password):', signatureBase);
    console.log('[robokassa/recurring] Signature:', signature);

    // Build request payload
    const payload = new URLSearchParams({
      MerchantLogin: config.merchantLogin,
      RecurringID: recurringId,
      InvoiceID: invoiceId,
      OutSum: outSum,
      Description: description,
      SignatureValue: signature,
    });

    // Log request payload (without password)
    console.log('[robokassa/recurring] ========== REQUEST PAYLOAD ==========');
    console.log('[robokassa/recurring] MerchantLogin:', config.merchantLogin);
    console.log('[robokassa/recurring] RecurringID:', recurringId);
    console.log('[robokassa/recurring] InvoiceID:', invoiceId);
    console.log('[robokassa/recurring] OutSum:', outSum);
    console.log('[robokassa/recurring] Description:', description);
    console.log('[robokassa/recurring] SignatureValue:', signature);
    console.log('[robokassa/recurring] NO Receipt (for recurring payments)');
    console.log('[robokassa/recurring] NO Recurring flag (for recurring payments)');

    // Send request to Robokassa RecurringPayment API
    const apiUrl = 'https://auth.robokassa.ru/Merchant/Recurring';
    
    console.log('[robokassa/recurring] Sending POST to:', apiUrl);
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: payload.toString(),
    });

    const responseText = await response.text();
    
    console.log('[robokassa/recurring] Response status:', response.status);
    console.log('[robokassa/recurring] Response text:', responseText);

    if (!response.ok) {
      console.error('[robokassa/recurring] ❌ HTTP error:', response.status);
      return {
        success: false,
        error: `HTTP ${response.status}: ${responseText}`,
      };
    }

    // Robokassa returns "OK" on success
    if (responseText.trim().toUpperCase() === 'OK') {
      console.log('[robokassa/recurring] ✅ Payment sent successfully');
      return {
        success: true,
        invoiceId,
      };
    }

    // Check for error response
    if (responseText.trim().toUpperCase().startsWith('ERROR')) {
      console.error('[robokassa/recurring] ❌ Robokassa error:', responseText);
      return {
        success: false,
        error: responseText,
      };
    }

    // Unknown response
    console.error('[robokassa/recurring] ❌ Unknown response:', responseText);
    return {
      success: false,
      error: `Unknown response: ${responseText}`,
    };
  } catch (error: any) {
    console.error('[robokassa/recurring] ❌ CRITICAL ERROR:', error);
    console.error('[robokassa/recurring] Error stack:', error.stack);
    return {
      success: false,
      error: error.message || 'Internal error',
    };
  }
}

