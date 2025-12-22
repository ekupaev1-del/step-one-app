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

    // STEP 1: CARD BINDING PAYMENT (PARENT PAYMENT)
    // КРИТИЧНО: Robokassa не принимает Recurring=true + Receipt + amount=1.00 одновременно
    // Решение: НЕ отправляем Receipt на этом шаге, только привязка карты
    // Фискализация будет на STEP 2 (дочерний recurring-платеж 199 RUB)
    
    // КРИТИЧНО: Robokassa требует включать ВСЕ параметры Shp_* в подпись
    // - в алфавитном порядке
    // - в формате key=value
    // - разделять двоеточием
    const shpUserId = String(numericUserId);
    
    // Собираем все Shp_* параметры в объект
    const shpParams: Record<string, string> = {
      Shp_userId: shpUserId,
    };
    
    // Сортируем Shp_* параметры по имени (алфавитно)
    const shpKeys = Object.keys(shpParams).sort();
    
    // Формируем строку Shp_* параметров для подписи
    // Каждый параметр в формате key=value, разделены двоеточием
    const shpParamsString = shpKeys.map(key => `${key}=${shpParams[key]}`).join(':');
    
    // КРИТИЧНО: Порядок строки подписи для STEP 1:
    // MerchantLogin:OutSum:InvoiceID:{Shp_* params}:ROBOKASSA_PASSWORD1
    // 
    // Пример: stepone:1.00:322360500:Shp_userId=322:B2Bnpr5rF948tbTZXsg
    //
    // ВАЖНО:
    // - Recurring НЕ участвует в подписи
    // - Description НЕ участвует в подписи
    // - Receipt НЕ участвует в подписи (не отправляется)
    // - Shp_* параметры участвуют ОБЯЗАТЕЛЬНО
    // - Shp_* идут после InvoiceID
    // - Shp_* сортируются алфавитно
    // - Формат строго key=value для каждого Shp_*
    // - OutSum = строка "1.00"
    //
    // Формируем подпись ВРУЧНУЮ строкой (НЕ через Object.values/entries)
    const signatureBase = `${merchantLogin}:${amountStr}:${invoiceIdStr}:${shpParamsString}:${password1}`;
    const signatureValue = md5(signatureBase).toLowerCase();
    
    // Проверка подписи
    if (!signatureValue || signatureValue.length !== 32) {
      throw new Error(`Invalid signature generated: ${signatureValue}`);
    }

    // DEBUG: Логируем строку подписи БЕЗ пароля
    const signatureBaseForLog = `${merchantLogin}:${amountStr}:${invoiceIdStr}:${shpParamsString}:[PASSWORD_HIDDEN]`;
    
    console.log("[robokassa/create] ========== STEP 1: CARD BINDING PAYMENT ==========");
    console.log("[robokassa/create] Purpose: Bind card and get parent InvoiceID");
    console.log("[robokassa/create] ========== SIGNATURE DEBUG ==========");
    console.log("[robokassa/create] Signature base (БЕЗ пароля):", signatureBaseForLog);
    console.log("[robokassa/create] Signature base (ПОЛНАЯ):", `${merchantLogin}:${amountStr}:${invoiceIdStr}:${shpParamsString}:${password1.substring(0, 4)}...`);
    console.log("[robokassa/create] Signature value (md5):", signatureValue);
    console.log("[robokassa/create] ========== PARAMETERS ==========");
    console.log("[robokassa/create] MerchantLogin:", merchantLogin);
    console.log("[robokassa/create] OutSum:", amountStr, "(must be '1.00', type:", typeof amountStr, ")");
    console.log("[robokassa/create] InvoiceID:", invoiceId, "(type:", typeof invoiceId, ")");
    console.log("[robokassa/create] InvoiceID as string:", invoiceIdStr);
    console.log("[robokassa/create] InvoiceID <= 2147483647:", invoiceId <= 2147483647);
    console.log("[robokassa/create] ========== Shp_* PARAMETERS ==========");
    console.log("[robokassa/create] Shp_* params (sorted):", shpKeys);
    console.log("[robokassa/create] Shp_* params string:", shpParamsString);
    console.log("[robokassa/create] Shp_userId:", shpUserId);
    console.log("[robokassa/create] ========== EXCLUDED FROM SIGNATURE ==========");
    console.log("[robokassa/create] Recurring: true (NOT in signature)");
    console.log("[robokassa/create] Description: NOT in signature (and NOT in POST)");
    console.log("[robokassa/create] Receipt: NOT SENT (Robokassa limitation)");
    console.log("[robokassa/create] =================================================");

    // ВАЖНО: Robokassa требует POST форму, а не GET URL!
    const robokassaDomain = process.env.ROBOKASSA_DOMAIN || "auth.robokassa.ru";
    const robokassaActionUrl = `https://${robokassaDomain}/Merchant/Index.aspx`;
    
    // ========== POST FORM DATA DEBUG ==========
    console.log("[robokassa/create] ========== POST FORM DATA (STEP 1) ==========");
    console.log("[robokassa/create] POST URL:", robokassaActionUrl);
    console.log("[robokassa/create] POST Method: POST");
    console.log("[robokassa/create] ========== EXACT POST FIELDS ==========");
    Object.entries(formData).forEach(([key, value]) => {
      console.log(`[robokassa/create] ${key}:`, value, `(type: ${typeof value}, length: ${String(value).length})`);
    });
    console.log("[robokassa/create] Total POST fields:", Object.keys(formData).length);
    console.log("[robokassa/create] ==============================================");
    
    // Проверяем, что все обязательные поля присутствуют
    const requiredFields = ["MerchantLogin", "OutSum", "InvoiceID", "SignatureValue", "Recurring", "Shp_userId"];
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
