import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabaseAdmin";
import crypto from "crypto";

const SUBSCRIPTION_AMOUNT = 199.00;

function md5(input: string): string {
  return crypto.createHash("md5").update(input).digest("hex").toLowerCase();
}

/**
 * Строит Receipt для подписки (54-ФЗ)
 * Формат строго по документации Robokassa
 */
function buildSubscriptionReceipt(amount: number): string {
  const receipt = {
    sno: "usn_income", // УСН доходы (self-employed, самозанятый)
    items: [
      {
        name: "Подписка Step One — 30 дней",
        quantity: 1.0,
        sum: Number(amount.toFixed(2)), // Сумма должна совпадать с OutSum (199.00)
        payment_method: "full_payment",
        payment_object: "service",
        tax: "none",
      },
    ],
  };
  
  const receiptJson = JSON.stringify(receipt);
  
  // Проверяем, что Receipt валидный JSON
  try {
    const parsed = JSON.parse(receiptJson);
    if (parsed.items && parsed.items[0]) {
      const itemSum = parsed.items[0].sum;
      if (Math.abs(itemSum - amount) > 0.01) {
        throw new Error(`Receipt sum mismatch: ${itemSum} != ${amount}`);
      }
    }
  } catch (e: any) {
    throw new Error(`Invalid Receipt JSON: ${e.message || e}`);
  }
  
  return receiptJson;
}

/**
 * STEP 2: MONTHLY CHARGE (CHILD RECURRING PAYMENT)
 * 
 * Создает дочерний recurring-платеж 199 RUB с фискализацией
 * Использует parent_invoice_id из STEP 1
 */
export async function POST(req: Request) {
  try {
    console.log("[robokassa/charge-subscription] ========== STEP 2: MONTHLY CHARGE ==========");
    console.log("[robokassa/charge-subscription] Request received at:", new Date().toISOString());
    
    const supabase = createServerSupabaseClient();
    const body = await req.json();
    const { userId } = body;

    console.log("[robokassa/charge-subscription] Request body:", { userId });

    // Валидация userId
    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "userId обязателен" },
        { status: 400 }
      );
    }

    const numericUserId = typeof userId === "string" ? Number(userId) : userId;
    
    if (!Number.isFinite(numericUserId) || numericUserId <= 0) {
      return NextResponse.json(
        { ok: false, error: "userId должен быть положительным числом" },
        { status: 400 }
      );
    }

    // Проверка переменных окружения
    const merchantLogin = process.env.ROBOKASSA_MERCHANT_LOGIN;
    const password1 = process.env.ROBOKASSA_PASSWORD1;

    if (!merchantLogin || !password1) {
      return NextResponse.json(
        { 
          ok: false, 
          error: "ROBOKASSA_MERCHANT_LOGIN или ROBOKASSA_PASSWORD1 не заданы" 
        },
        { status: 500 }
      );
    }

    // Получаем пользователя и parent_invoice_id
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id, robokassa_initial_invoice_id")
      .eq("id", numericUserId)
      .maybeSingle();

    if (userError || !user) {
      return NextResponse.json(
        { ok: false, error: "Пользователь не найден" },
        { status: 404 }
      );
    }

    if (!user.robokassa_initial_invoice_id) {
      return NextResponse.json(
        { ok: false, error: "Parent invoice ID не найден. Сначала выполните STEP 1 (привязка карты)" },
        { status: 400 }
      );
    }

    const parentInvoiceId = user.robokassa_initial_invoice_id;
    console.log("[robokassa/charge-subscription] Parent invoice ID:", parentInvoiceId);

    // Генерируем новый уникальный InvoiceID для дочернего платежа
    let invoiceId: string;
    let attempts = 0;
    const maxAttempts = 10;
    const maxInvoiceId = BigInt('9223372036854775807');
    
    do {
      const timestamp = Date.now();
      const random = Math.floor(Math.random() * 10000);
      invoiceId = `${numericUserId}${timestamp}${random.toString().padStart(4, '0')}`;
      
      if (!/^\d+$/.test(invoiceId)) {
        throw new Error(`Invalid InvoiceID format: ${invoiceId}`);
      }
      
      const invoiceIdNum = BigInt(invoiceId);
      if (invoiceIdNum > maxInvoiceId) {
        invoiceId = `${timestamp}${numericUserId}`;
        console.warn(`[robokassa/charge-subscription] InvoiceID too large, using shorter version: ${invoiceId}`);
      }
      
      // Проверяем уникальность
      const { data: existingPayment } = await supabase
        .from("payments")
        .select("id")
        .eq("invoice_id", invoiceId)
        .maybeSingle();
      
      if (!existingPayment) {
        break;
      }
      
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 10));
    } while (attempts < maxAttempts);
    
    if (attempts >= maxAttempts) {
      throw new Error(`Failed to generate unique InvoiceID after ${maxAttempts} attempts`);
    }
    
    console.log("[robokassa/charge-subscription] Generated child InvoiceID:", invoiceId);

    const amountStr = SUBSCRIPTION_AMOUNT.toFixed(2); // "199.00"
    
    // Проверяем, что OutSum = "199.00"
    if (amountStr !== "199.00") {
      throw new Error(`Invalid OutSum: expected "199.00", got "${amountStr}"`);
    }

    // Строим Receipt для фискализации (STEP 2: обязателен)
    const receiptJson = buildSubscriptionReceipt(SUBSCRIPTION_AMOUNT);
    const receiptEncoded = encodeURIComponent(receiptJson);
    
    // КРИТИЧНО: Порядок строки подписи для STEP 2 (с Receipt и PreviousInvoiceID):
    // MerchantLogin:OutSum:InvoiceID:PreviousInvoiceID:Receipt:ROBOKASSA_PASSWORD1
    // Receipt - это JSON строка (НЕ encoded) в подписи
    const signatureBase = `${merchantLogin}:${amountStr}:${invoiceId}:${parentInvoiceId}:${receiptJson}:${password1}`;
    const signatureValue = md5(signatureBase).toLowerCase();
    
    // Проверка подписи
    if (!signatureValue || signatureValue.length !== 32) {
      throw new Error(`Invalid signature generated: ${signatureValue}`);
    }

    // DEBUG: Логируем строку подписи БЕЗ пароля
    const signatureBaseForLog = `${merchantLogin}:${amountStr}:${invoiceId}:${parentInvoiceId}:${receiptJson}:[PASSWORD_HIDDEN]`;
    
    console.log("[robokassa/charge-subscription] ========== SIGNATURE DEBUG (STEP 2) ==========");
    console.log("[robokassa/charge-subscription] OutSum:", amountStr, "(must be '199.00')");
    console.log("[robokassa/charge-subscription] InvoiceID (child):", invoiceId);
    console.log("[robokassa/charge-subscription] PreviousInvoiceID (parent):", parentInvoiceId);
    console.log("[robokassa/charge-subscription] Receipt JSON (до encode):", receiptJson);
    console.log("[robokassa/charge-subscription] Receipt encoded (после encode):", receiptEncoded);
    console.log("[robokassa/charge-subscription] Signature base (БЕЗ пароля):", signatureBaseForLog);
    console.log("[robokassa/charge-subscription] Signature value (md5):", signatureValue);
    console.log("[robokassa/charge-subscription] ==============================================");

    const description = "Подписка Step One — 30 дней";
    const recurringUrl = "https://auth.robokassa.ru/Merchant/Recurring";
    
    // Формируем данные для POST запроса (STEP 2: дочерний recurring-платеж)
    const formData: Record<string, string> = {
      MerchantLogin: merchantLogin,
      InvoiceID: invoiceId,
      PreviousInvoiceID: parentInvoiceId, // КРИТИЧНО: parent invoice ID из STEP 1
      OutSum: amountStr, // "199.00"
      Description: description,
      SignatureValue: signatureValue,
      Receipt: receiptEncoded, // КРИТИЧНО: Receipt обязателен для STEP 2
    };
    
    console.log("[robokassa/charge-subscription] ========== FORM DATA DEBUG (STEP 2) ==========");
    console.log("[robokassa/charge-subscription] POST URL:", recurringUrl);
    console.log("[robokassa/charge-subscription] Form data (POST):", {
      MerchantLogin: formData.MerchantLogin,
      InvoiceID: formData.InvoiceID,
      PreviousInvoiceID: formData.PreviousInvoiceID,
      OutSum: formData.OutSum,
      Description: formData.Description,
      Receipt: formData.Receipt.substring(0, 50) + "...",
      SignatureValue: formData.SignatureValue,
    });
    console.log("[robokassa/charge-subscription] ==============================================");

    // Сохраняем платеж в БД перед отправкой
    try {
      const { error: paymentInsertError } = await supabase
        .from("payments")
        .insert({
          user_id: numericUserId,
          invoice_id: invoiceId,
          previous_invoice_id: parentInvoiceId, // КРИТИЧНО: parent invoice ID
          amount: SUBSCRIPTION_AMOUNT,
          status: "pending",
          is_recurring: true,
        });
      
      if (paymentInsertError) {
        console.warn("[robokassa/charge-subscription] Warning: Failed to save payment to DB:", paymentInsertError.message);
      } else {
        console.log("[robokassa/charge-subscription] ✅ Child payment saved to DB, invoice_id:", invoiceId);
      }
    } catch (paymentErr: any) {
      console.warn("[robokassa/charge-subscription] Warning: DB error (ignored):", paymentErr.message);
    }

    // Отправляем POST запрос на Robokassa Merchant/Recurring
    const formBody = new URLSearchParams(formData).toString();
    
    console.log("[robokassa/charge-subscription] Sending POST request to Robokassa...");
    
    const response = await fetch(recurringUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formBody,
    });

    const responseText = await response.text();
    
    console.log("[robokassa/charge-subscription] Robokassa response status:", response.status);
    console.log("[robokassa/charge-subscription] Robokassa response text:", responseText);

    // Robokassa возвращает "OK" при успехе
    if (responseText.trim().toLowerCase() === "ok") {
      console.log("[robokassa/charge-subscription] ✅ Payment successful!");
      
      // Обновляем статус платежа в БД
      try {
        await supabase
          .from("payments")
          .update({ status: "success" })
          .eq("invoice_id", invoiceId);
      } catch (e) {
        console.warn("[robokassa/charge-subscription] Warning: Failed to update payment status:", e);
      }
      
      return NextResponse.json({
        ok: true,
        invoiceId,
        parentInvoiceId,
        amount: SUBSCRIPTION_AMOUNT,
        message: "Payment successful",
      });
    } else {
      console.error("[robokassa/charge-subscription] ❌ Payment failed:", responseText);
      
      // Обновляем статус платежа в БД
      try {
        await supabase
          .from("payments")
          .update({ status: "failed" })
          .eq("invoice_id", invoiceId);
      } catch (e) {
        console.warn("[robokassa/charge-subscription] Warning: Failed to update payment status:", e);
      }
      
      return NextResponse.json(
        { 
          ok: false, 
          error: "Payment failed",
          robokassaResponse: responseText,
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("[robokassa/charge-subscription] error", error);
    console.error("[robokassa/charge-subscription] error stack", error.stack);
    
    return NextResponse.json(
      { 
        ok: false, 
        error: error.message || "Internal error",
        details: process.env.NODE_ENV === "development" ? {
          message: error?.message,
          stack: error?.stack,
        } : undefined,
      },
      { status: 500 }
    );
  }
}
