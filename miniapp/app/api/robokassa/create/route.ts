import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabaseAdmin";
import crypto from "crypto";

// Первый платеж для привязки карты = 1 RUB
const FIRST_PAYMENT_AMOUNT = 1.00;

function md5(input: string): string {
  return crypto.createHash("md5").update(input).digest("hex");
}

// STEP 1: Receipt НЕ используется (Robokassa limitation)
// Фискализация будет на STEP 2 (дочерний recurring-платеж 199 RUB)

export async function POST(req: Request) {
  try {
    console.log("[robokassa/create] ========== FIRST RECURRING PAYMENT ==========");
    console.log("[robokassa/create] Request received at:", new Date().toISOString());
    
    const supabase = createServerSupabaseClient();
    const body = await req.json();
    const { userId } = body;

    console.log("[robokassa/create] Request body:", { userId });

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

    console.log("[robokassa/create] UserId:", numericUserId);
    console.log("[robokassa/create] Amount:", FIRST_PAYMENT_AMOUNT, "RUB");

    // Проверяем пользователя (минимальная проверка)
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id")
      .eq("id", numericUserId)
      .maybeSingle();

    if (userError || !user) {
      return NextResponse.json(
        { ok: false, error: "Пользователь не найден" },
        { status: 404 }
      );
    }

    // Генерируем уникальный InvoiceID
    // КРИТИЧНО: Robokassa требует InvoiceID как int32 (<= 2147483647)
    // НЕ используем timestamp - он слишком большой!
    // Используем безопасный генератор: userId * 1000000 + random(0-999999)
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
        console.warn(`[robokassa/create] InvoiceID would exceed int32, using random: ${invoiceId}`);
      }
      
      // Проверяем, не использовался ли уже этот InvoiceID в БД
      const { data: existingPayment } = await supabase
        .from("payments")
        .select("id")
        .eq("invoice_id", String(invoiceId))
        .maybeSingle();
      
      if (!existingPayment) {
        // InvoiceID уникален, можно использовать
        break;
      }
      
      attempts++;
      console.warn(`[robokassa/create] InvoiceID ${invoiceId} already exists, generating new one (attempt ${attempts}/${maxAttempts})`);
      
      // Небольшая задержка перед следующей попыткой
      await new Promise(resolve => setTimeout(resolve, 10));
    } while (attempts < maxAttempts);
    
    if (attempts >= maxAttempts) {
      throw new Error(`Failed to generate unique InvoiceID after ${maxAttempts} attempts`);
    }
    
    // КРИТИЧНО: Преобразуем в строку для использования в форме
    const invoiceIdStr = String(invoiceId);
    
    console.log("[robokassa/create] Generated unique InvoiceID:", invoiceId);
    console.log("[robokassa/create] InvoiceID type:", typeof invoiceId);
    console.log("[robokassa/create] InvoiceID as string:", invoiceIdStr);
    console.log("[robokassa/create] InvoiceID <= 2147483647:", invoiceId <= MAX_INT32);
    
    const amountStr = FIRST_PAYMENT_AMOUNT.toFixed(2); // "1.00"
    
    // КРИТИЧНО: Проверяем, что OutSum = "1.00" (строка, не число)
    if (amountStr !== "1.00") {
      throw new Error(`Invalid OutSum: expected "1.00", got "${amountStr}"`);
    }

    // PART 1: FIRST (PARENT) PAYMENT (TRIAL 1 RUB)
    // КРИТИЧНО: Подпись для первого платежа:
    // md5(MerchantLogin:OutSum:InvoiceID:Password1)
    // 
    // ВАЖНО:
    // - Shp_* параметры НЕ включаются в подпись
    // - Recurring НЕ участвует в подписи (но отправляется в POST)
    // - Description НЕ участвует в подписи (но отправляется в POST)
    // - Receipt НЕ отправляется для recurring parent payment
    // - OutSum = строка "1.00"
    
    const shpUserId = String(numericUserId);
    
    // Формируем подпись СТРОГО по требованиям: MerchantLogin:OutSum:InvoiceID:Password1
    const signatureBase = `${merchantLogin}:${amountStr}:${invoiceIdStr}:${password1}`;
    const signatureValue = md5(signatureBase).toLowerCase();
    
    // Проверка подписи
    if (!signatureValue || signatureValue.length !== 32) {
      throw new Error(`Invalid signature generated: ${signatureValue}`);
    }

    // DEBUG: Логируем строку подписи БЕЗ пароля
    const signatureBaseForLog = `${merchantLogin}:${amountStr}:${invoiceIdStr}:[PASSWORD_HIDDEN]`;
    
    console.log("[robokassa/create] ========== STEP 1: CARD BINDING PAYMENT ==========");
    console.log("[robokassa/create] Purpose: Bind card and get parent InvoiceID");
    console.log("[robokassa/create] ========== SIGNATURE DEBUG ==========");
    console.log("[robokassa/create] Signature base (БЕЗ пароля):", signatureBaseForLog);
    console.log("[robokassa/create] Signature base (ПОЛНАЯ):", `${merchantLogin}:${amountStr}:${invoiceIdStr}:${password1.substring(0, 4)}...`);
    console.log("[robokassa/create] Signature value (md5):", signatureValue);
    console.log("[robokassa/create] ========== PARAMETERS ==========");
    console.log("[robokassa/create] MerchantLogin:", merchantLogin);
    console.log("[robokassa/create] OutSum:", amountStr, "(must be '1.00', type:", typeof amountStr, ")");
    console.log("[robokassa/create] InvoiceID:", invoiceId, "(type:", typeof invoiceId, ")");
    console.log("[robokassa/create] InvoiceID as string:", invoiceIdStr);
    console.log("[robokassa/create] InvoiceID <= 2147483647:", invoiceId <= 2147483647);
    console.log("[robokassa/create] Shp_userId:", shpUserId, "(NOT in signature, but in POST)");
    console.log("[robokassa/create] ========== EXCLUDED FROM SIGNATURE ==========");
    console.log("[robokassa/create] Recurring: true (NOT in signature)");
    console.log("[robokassa/create] Description: (NOT in signature, but in POST)");
    console.log("[robokassa/create] Receipt: NOT SENT (Robokassa limitation)");
    console.log("[robokassa/create] =================================================");

    // ВАЖНО: Robokassa требует POST форму, а не GET URL!
    const robokassaDomain = process.env.ROBOKASSA_DOMAIN || "auth.robokassa.ru";
    const robokassaActionUrl = `https://${robokassaDomain}/Merchant/Index.aspx`;
    
    // PART 1: POST fields для первого платежа
    // POST fields:
    // - MerchantLogin
    // - OutSum = "1.00"
    // - InvoiceID (unique integer)
    // - Description = "Подписка Step One — пробный период 3 дня"
    // - Recurring = true
    // - Shp_userId (telegram user id)
    // - SignatureValue
    //
    // ❌ НЕ отправляем:
    // - Receipt (для recurring parent payment)
    
    const description = "Подписка Step One — пробный период 3 дня";
    
    const formData: Record<string, string> = {
      MerchantLogin: merchantLogin,
      OutSum: amountStr, // "1.00"
      InvoiceID: invoiceIdStr,
      Description: description, // ВАЖНО: Description отправляется в POST
      Recurring: "true", // Recurring=true для привязки карты
      Shp_userId: shpUserId,
      SignatureValue: signatureValue,
    };
    // PART 3: ERROR 26 PROTECTION - Full POST payload logging
    console.log("[robokassa/create] ========== POST FORM DATA (PART 1) ==========");
    console.log("[robokassa/create] POST URL:", robokassaActionUrl);
    console.log("[robokassa/create] POST Method: POST");
    console.log("[robokassa/create] ========== FULL POST PAYLOAD (without passwords) ==========");
    Object.entries(formData).forEach(([key, value]) => {
      if (key === "SignatureValue") {
        console.log(`[robokassa/create] ${key}:`, value, `(type: ${typeof value}, length: ${String(value).length})`);
      } else {
        console.log(`[robokassa/create] ${key}:`, value, `(type: ${typeof value}, length: ${String(value).length})`);
      }
    });
    console.log("[robokassa/create] Total POST fields:", Object.keys(formData).length);
    console.log("[robokassa/create] ==============================================");
    
    // Проверяем, что все обязательные поля присутствуют
    const requiredFields = ["MerchantLogin", "OutSum", "InvoiceID", "Description", "Recurring", "Shp_userId", "SignatureValue"];
    const missingFields = requiredFields.filter(field => !formData[field]);
    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(", ")}`);
    }
    
    console.log("[robokassa/create] ✅ All required fields present");
    
    // ВАЖНО: Проверяем, что InvoiceID состоит только из цифр
    if (!/^\d+$/.test(formData.InvoiceID)) {
      throw new Error(`Invalid InvoiceID format: ${formData.InvoiceID}. Must contain only digits.`);
    }
    
    // ВАЖНО: Проверяем, что OutSum имеет правильный формат (число с 2 знаками после запятой)
    if (!/^\d+\.\d{2}$/.test(formData.OutSum)) {
      throw new Error(`Invalid OutSum format: ${formData.OutSum}. Expected format: "1.00"`);
    }
    
    // PART 3: ERROR 26 PROTECTION - Log exact signature string BEFORE md5
    console.log("[robokassa/create] ========== ERROR 26 PROTECTION ==========");
    console.log("[robokassa/create] Exact signature string BEFORE md5:", signatureBaseForLog);
    console.log("[robokassa/create] Full signature string (with password):", signatureBase);
    console.log("[robokassa/create] Final SignatureValue (md5):", signatureValue);
    console.log("[robokassa/create] If Robokassa returns error 26:");
    console.log("[robokassa/create]   - Check signature formula: MerchantLogin:OutSum:InvoiceID:Password1");
    console.log("[robokassa/create]   - Verify Password1 is correct");
    console.log("[robokassa/create]   - Verify Recurring is approved on merchant side");
    console.log("[robokassa/create] ==========================================");

    // Сохраняем платеж в БД для отслеживания (STEP 1: parent payment)
    // ВАЖНО: Этот InvoiceID будет сохранен как parent_invoice_id после успешной оплаты
    // и использован в STEP 2 для дочернего recurring-платежа
    try {
      const { error: paymentInsertError } = await supabase
        .from("payments")
        .insert({
          user_id: numericUserId,
          invoice_id: invoiceIdStr, // Сохраняем как строку в БД
          previous_invoice_id: null, // Для первого платежа (parent) всегда null
          amount: FIRST_PAYMENT_AMOUNT,
          status: "pending",
          is_recurring: true,
        });
      
      if (paymentInsertError) {
        // Не блокируем создание платежа, если БД недоступна
        console.warn("[robokassa/create] Warning: Failed to save payment to DB:", paymentInsertError.message);
      } else {
        console.log("[robokassa/create] ✅ Parent payment saved to DB, invoice_id:", invoiceIdStr);
        console.log("[robokassa/create] Этот InvoiceID будет сохранен как parent_invoice_id после успешной оплаты");
        console.log("[robokassa/create] STEP 2 будет использовать этот parent_invoice_id для дочернего платежа 199 RUB");
      }
    } catch (paymentErr: any) {
      // Игнорируем ошибки БД - платеж уже создан
      console.warn("[robokassa/create] Warning: DB error (ignored):", paymentErr.message);
    }

    // ВАЖНО: Возвращаем данные для POST формы, а не URL
    const response = {
      ok: true, 
      actionUrl: robokassaActionUrl, // URL для action формы
      formData: formData, // Данные для POST запроса
      invoiceId: invoiceIdStr, // InvoiceID как строка (но число <= 2147483647)
      amount: FIRST_PAYMENT_AMOUNT,
      method: "POST", // Метод запроса
    };
    
    console.log("[robokassa/create] ✅ Returning response:", {
      ok: response.ok,
      hasActionUrl: !!response.actionUrl,
      hasFormData: !!response.formData,
      formDataKeys: Object.keys(response.formData),
      invoiceId: response.invoiceId,
    });
    
    return NextResponse.json(response);
  } catch (error: any) {
    console.error("[robokassa/create] error", error);
    console.error("[robokassa/create] error stack", error.stack);
    console.error("[robokassa/create] error details:", {
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
    });
    
    return NextResponse.json(
      { 
        ok: false, 
        error: error.message || "Internal error",
        details: process.env.NODE_ENV === "development" ? {
          message: error?.message,
          code: error?.code,
          details: error?.details,
          hint: error?.hint,
        } : undefined,
      },
      { status: 500 }
    );
  }
}
