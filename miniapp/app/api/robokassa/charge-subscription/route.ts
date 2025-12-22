import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabaseAdmin";
import crypto from "crypto";

const SUBSCRIPTION_AMOUNT = 199.00;

function md5(input: string): string {
  return crypto.createHash("md5").update(input).digest("hex").toLowerCase();
}

/**
 * Строит Receipt для подписки (54-ФЗ)
 * Формат строго по документации Robokassa для самозанятого
 */
function buildSubscriptionReceipt(amount: number): string {
  const receipt = {
    sno: "usn_income", // УСН доходы (self-employed, самозанятый)
    items: [
      {
        name: "Подписка Step One — 1 месяц", // КРИТИЧНО: название как в требованиях
        quantity: 1, // Количество
        sum: 199, // Сумма должна совпадать с OutSum (199.00)
        payment_object: "service", // Услуга
        payment_method: "full_payment", // Полная предоплата
        tax: "none", // Без НДС (самозанятый)
      },
    ],
  };
  
  // JSON.stringify без пробелов (компактный формат)
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
    const password2 = process.env.ROBOKASSA_PASSWORD2; // PART 2: Используем Password2 для recurring

    if (!merchantLogin || !password2) {
      return NextResponse.json(
        { 
          ok: false, 
          error: "ROBOKASSA_MERCHANT_LOGIN или ROBOKASSA_PASSWORD2 не заданы" 
        },
        { status: 500 }
      );
    }

    // КРИТИЧНО: Проверка правильности MerchantLogin
    console.log("[robokassa/charge-subscription] ========== MERCHANT LOGIN CHECK ==========");
    console.log("[robokassa/charge-subscription] MerchantLogin from env:", merchantLogin);
    console.log("[robokassa/charge-subscription] MerchantLogin length:", merchantLogin.length);
    console.log("[robokassa/charge-subscription] ⚠️ Убедитесь, что MerchantLogin совпадает с 'Идентификатором магазина' из ЛК Robokassa");
    console.log("[robokassa/charge-subscription] =================================================");

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
    // КРИТИЧНО: Robokassa требует InvoiceID как int32 (<= 2147483647)
    // НЕ используем timestamp - он слишком большой!
    let invoiceId: number;
    let attempts = 0;
    const maxAttempts = 10;
    const MAX_INT32 = 2147483647;
    
    do {
      // Генерируем InvoiceID: userId * 1000000 + random(0-999999)
      // Это гарантирует уникальность и не превышает int32
      const base = numericUserId * 1000000; // userId * 1M
      const random = Math.floor(Math.random() * 1000000); // 0-999999
      invoiceId = base + random;
      
      // КРИТИЧНО: Проверяем, что InvoiceID <= 2147483647 (int32 максимум)
      if (invoiceId > MAX_INT32) {
        // Если превышает, используем только random (без userId)
        invoiceId = Math.floor(Math.random() * MAX_INT32) + 1; // 1-2147483647
        console.warn(`[robokassa/charge-subscription] InvoiceID would exceed int32, using random: ${invoiceId}`);
      }
      
      // Проверяем уникальность
      const { data: existingPayment } = await supabase
        .from("payments")
        .select("id")
        .eq("invoice_id", String(invoiceId))
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
    
    // КРИТИЧНО: Преобразуем в строку для использования в форме
    const invoiceIdStr = String(invoiceId);
    
    console.log("[robokassa/charge-subscription] Generated child InvoiceID:", invoiceId);
    console.log("[robokassa/charge-subscription] InvoiceID type:", typeof invoiceId);
    console.log("[robokassa/charge-subscription] InvoiceID as string:", invoiceIdStr);
    console.log("[robokassa/charge-subscription] InvoiceID <= 2147483647:", invoiceId <= MAX_INT32);

    const amountStr = SUBSCRIPTION_AMOUNT.toFixed(2); // "199.00"
    
    // Проверяем, что OutSum = "199.00"
    if (amountStr !== "199.00") {
      throw new Error(`Invalid OutSum: expected "199.00", got "${amountStr}"`);
    }

    // PART 2: RECURRING PAYMENT (AFTER 3 DAYS)
    // КРИТИЧНО: Подпись для recurring-платежа:
    // md5(MerchantLogin:OutSum:InvoiceID:Password2)
    //
    // ВАЖНО:
    // - PreviousInvoiceID НЕ включается в подпись
    // - Recurring НЕ отправляется
    // - Receipt НЕ отправляется
    // - Description НЕ участвует в подписи (но отправляется в POST)
    // - OutSum = строка "199.00"
    
    // Формируем подпись СТРОГО по требованиям: MerchantLogin:OutSum:InvoiceID:Password2
    const signatureBase = `${merchantLogin}:${amountStr}:${invoiceIdStr}:${password2}`;
    const signatureValue = md5(signatureBase).toLowerCase();
    
    // Проверка подписи
    if (!signatureValue || signatureValue.length !== 32) {
      throw new Error(`Invalid signature generated: ${signatureValue}`);
    }

    // DEBUG: Логируем строку подписи БЕЗ пароля
    const signatureBaseForLog = `${merchantLogin}:${amountStr}:${invoiceIdStr}:[PASSWORD_HIDDEN]`;
    
    console.log("[robokassa/charge-subscription] ========== STEP 2: MONTHLY CHARGE ==========");
    console.log("[robokassa/charge-subscription] Purpose: Recurring payment 199 RUB with fiscalization");
    console.log("[robokassa/charge-subscription] ========== SIGNATURE DEBUG ==========");
    console.log("[robokassa/charge-subscription] Signature base (БЕЗ пароля):", signatureBaseForLog);
    console.log("[robokassa/charge-subscription] Signature base (ПОЛНАЯ):", `${merchantLogin}:${amountStr}:${invoiceIdStr}:${password2.substring(0, 4)}...`);
    console.log("[robokassa/charge-subscription] Signature value (md5):", signatureValue);
    console.log("[robokassa/charge-subscription] ========== PARAMETERS ==========");
    console.log("[robokassa/charge-subscription] MerchantLogin:", merchantLogin);
    console.log("[robokassa/charge-subscription] OutSum:", amountStr, "(must be '199.00', type:", typeof amountStr, ")");
    console.log("[robokassa/charge-subscription] InvoiceID (child):", invoiceId, "(type:", typeof invoiceId, ")");
    console.log("[robokassa/charge-subscription] InvoiceID as string:", invoiceIdStr);
    console.log("[robokassa/charge-subscription] InvoiceID <= 2147483647:", invoiceId <= 2147483647);
    console.log("[robokassa/charge-subscription] PreviousInvoiceID (parent):", parentInvoiceId);
    console.log("[robokassa/charge-subscription] ========== EXCLUDED FROM SIGNATURE ==========");
    console.log("[robokassa/charge-subscription] PreviousInvoiceID: (NOT in signature, but in POST)");
    console.log("[robokassa/charge-subscription] Recurring: NOT sent (NOT in signature, NOT in POST)");
    console.log("[robokassa/charge-subscription] Description: (NOT in signature, but in POST)");
    console.log("[robokassa/charge-subscription] Receipt: NOT SENT (Robokassa requirement)");
    console.log("[robokassa/charge-subscription] ========== EXCLUDED FROM SIGNATURE ==========");
    console.log("[robokassa/charge-subscription] Recurring: NOT in signature");
    console.log("[robokassa/charge-subscription] Description: NOT in signature");
    console.log("[robokassa/charge-subscription] ==============================================");

    // PART 2: POST fields для recurring-платежа
    // POST fields:
    // - MerchantLogin
    // - OutSum = "199.00"
    // - InvoiceID (new unique integer)
    // - PreviousInvoiceID = parent_invoice_id
    // - Description = "Подписка Step One — 1 месяц"
    // - SignatureValue
    //
    // ❌ НЕ отправляем:
    // - Recurring (для recurring-платежа не нужен)
    // - Receipt (не отправляется для recurring)
    
    const description = "Подписка Step One — 1 месяц";
    const recurringUrl = "https://auth.robokassa.ru/Merchant/Recurring";
    
    const formData: Record<string, string> = {
      MerchantLogin: merchantLogin,
      OutSum: amountStr, // "199.00"
      InvoiceID: invoiceIdStr,
      PreviousInvoiceID: parentInvoiceId, // ВАЖНО: parent invoice ID из PART 1
      Description: description, // ВАЖНО: Description отправляется в POST
      SignatureValue: signatureValue,
    };
    
    // PART 3: ERROR 26 PROTECTION - Full POST payload logging
    console.log("[robokassa/charge-subscription] ========== POST FORM DATA (PART 2) ==========");
    console.log("[robokassa/charge-subscription] POST URL:", recurringUrl);
    console.log("[robokassa/charge-subscription] POST Method: POST");
    console.log("[robokassa/charge-subscription] ========== FULL POST PAYLOAD (without passwords) ==========");
    Object.entries(formData).forEach(([key, value]) => {
      console.log(`[robokassa/charge-subscription] ${key}:`, value, `(type: ${typeof value}, length: ${String(value).length})`);
    });
    console.log("[robokassa/charge-subscription] Total POST fields:", Object.keys(formData).length);
    console.log("[robokassa/charge-subscription] ========== ERROR 26 PROTECTION ==========");
    console.log("[robokassa/charge-subscription] Exact signature string BEFORE md5:", signatureBaseForLog);
    console.log("[robokassa/charge-subscription] Full signature string (with password):", signatureBase);
    console.log("[robokassa/charge-subscription] Final SignatureValue (md5):", signatureValue);
    console.log("[robokassa/charge-subscription] If Robokassa returns error 26:");
    console.log("[robokassa/charge-subscription]   - Check signature formula: MerchantLogin:OutSum:InvoiceID:Password2");
    console.log("[robokassa/charge-subscription]   - Verify Password2 is correct");
    console.log("[robokassa/charge-subscription] ==============================================");

    // Сохраняем платеж в БД перед отправкой
    try {
      const { error: paymentInsertError } = await supabase
        .from("payments")
        .insert({
          user_id: numericUserId,
          invoice_id: invoiceIdStr, // Сохраняем как строку в БД
          previous_invoice_id: parentInvoiceId, // КРИТИЧНО: parent invoice ID
          amount: SUBSCRIPTION_AMOUNT,
          status: "pending",
          is_recurring: true,
        });
      
      if (paymentInsertError) {
        console.warn("[robokassa/charge-subscription] Warning: Failed to save payment to DB:", paymentInsertError.message);
      } else {
        console.log("[robokassa/charge-subscription] ✅ Child payment saved to DB, invoice_id:", invoiceIdStr);
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

    // PART 2: Robokassa возвращает "OK" при успехе
    if (responseText.trim().toLowerCase() === "ok") {
      console.log("[robokassa/charge-subscription] ✅ Payment successful!");
      
      // Обновляем статус платежа в БД
      try {
        await supabase
          .from("payments")
          .update({ status: "success" })
          .eq("invoice_id", invoiceIdStr);
      } catch (e) {
        console.warn("[robokassa/charge-subscription] Warning: Failed to update payment status:", e);
      }
      
      // PART 2: Обновляем статус подписки
      const now = new Date();
      const paidUntil = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 дней
      
      try {
        await supabase
          .from("users")
          .update({
            subscription_status: "active",
            paid_until: paidUntil.toISOString(),
            last_payment_status: "success",
          })
          .eq("id", numericUserId);
        
        console.log("[robokassa/charge-subscription] ✅ Subscription activated, paid until:", paidUntil.toISOString());
      } catch (e) {
        console.warn("[robokassa/charge-subscription] Warning: Failed to update subscription status:", e);
      }
      
      return NextResponse.json({
        ok: true,
        invoiceId: invoiceIdStr,
        parentInvoiceId,
        amount: SUBSCRIPTION_AMOUNT,
        message: "Payment successful",
      });
    } else {
      console.error("[robokassa/charge-subscription] ❌ Payment failed:", responseText);
      console.error("[robokassa/charge-subscription] Invalid signature or recurring not accepted");
      
      // Обновляем статус платежа в БД
      try {
        await supabase
          .from("payments")
          .update({ status: "failed" })
          .eq("invoice_id", invoiceIdStr);
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
