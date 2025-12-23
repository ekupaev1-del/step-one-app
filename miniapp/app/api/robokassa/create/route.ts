import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabaseAdmin";
import crypto from "crypto";

// Первый платеж (trial) = 1 RUB (без Recurring, с Receipt)
const TRIAL_PAYMENT_AMOUNT = 1.0;

function md5(input: string): string {
  return crypto.createHash("md5").update(input).digest("hex");
}

/**
 * Строит Receipt для подписки (54-ФЗ)
 * Формат строго по документации Robokassa для самозанятого
 */
function buildSubscriptionReceipt(amount: number, title: string): string {
  const receipt = {
    sno: "usn_income", // УСН доходы (self-employed, самозанятый)
    items: [
      {
        name: title,
        quantity: 1,
        sum: amount, // Сумма должна совпадать с OutSum
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

    // КРИТИЧНО: Проверка правильности MerchantLogin
    // Robokassa указала, что правильный идентификатор магазина должен быть из ЛК
    // Если используется неправильный MerchantLogin, Robokassa вернет ошибку
    console.log("[robokassa/create] ========== MERCHANT LOGIN CHECK ==========");
    console.log("[robokassa/create] MerchantLogin from env:", merchantLogin);
    console.log("[robokassa/create] MerchantLogin length:", merchantLogin.length);
    console.log("[robokassa/create] ⚠️ Убедитесь, что MerchantLogin совпадает с 'Идентификатором магазина' из ЛК Robokassa");
    console.log("[robokassa/create] ⚠️ Идентификатор магазина находится в: ЛК → Мои магазины → [магазин] → Технические настройки");
    console.log("[robokassa/create] =================================================");

    console.log("[robokassa/create] UserId:", numericUserId);
    console.log("[robokassa/create] Amount:", TRIAL_PAYMENT_AMOUNT, "RUB");

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

    // STEP 1: Генерируем уникальный InvoiceID
    // КРИТИЧНО: InvoiceID = простое число (НЕ bigint, НЕ timestamp в миллисекундах)
    // Используем: Math.floor(Date.now() / 1000) - секунды с эпохи
    let invoiceId: number;
    let attempts = 0;
    const maxAttempts = 10;
    const MAX_INT32 = 2147483647;
    
    do {
      // Генерируем InvoiceID как секунды с эпохи (не миллисекунды!)
      invoiceId = Math.floor(Date.now() / 1000);
      
      // Добавляем случайное число для уникальности (если несколько запросов в одну секунду)
      const random = Math.floor(Math.random() * 1000); // 0-999
      invoiceId = invoiceId * 1000 + random;
      
      // КРИТИЧНО: Проверяем, что InvoiceID <= 2147483647 (int32 максимум)
      if (invoiceId > MAX_INT32) {
        // Если превышает, используем только timestamp в секундах
        invoiceId = Math.floor(Date.now() / 1000);
        console.warn(`[robokassa/create] InvoiceID would exceed int32, using seconds only: ${invoiceId}`);
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
    
    // Преобразуем в строку для использования в форме
    const invoiceIdStr = String(invoiceId);
    
    console.log("[robokassa/create] Generated unique InvoiceID:", invoiceId);
    console.log("[robokassa/create] InvoiceID type:", typeof invoiceId);
    console.log("[robokassa/create] InvoiceID as string:", invoiceIdStr);
    console.log("[robokassa/create] InvoiceID <= 2147483647:", invoiceId <= MAX_INT32);
    
    const amountStr = TRIAL_PAYMENT_AMOUNT.toFixed(2); // "1.00"

    // Проверяем, что OutSum = "1.00"
    if (amountStr !== "1.00") {
      throw new Error(`Invalid OutSum: expected "1.00", got "${amountStr}"`);
    }

    // STEP 1: PARENT PAYMENT (1 RUB, БЕЗ Recurring, с Receipt)
    // КРИТИЧНО: Подпись для первого платежа С Receipt и Shp_*:
    // md5(MerchantLogin:OutSum:InvId:Receipt:Password1:Shp_userId=XXX)
    // 
    // ВАЖНО:
    // - Receipt ОБЯЗАТЕЛЕН для самозанятого (фискализация ФЗ-54)
    // - Shp_* НЕ включаем в подпись
    // - Recurring НЕ участвует и НЕ отправляется (первый платёж без recurring)
    // - Description НЕ участвует в подписи (но отправляется в POST)
    // - OutSum = строка "1.00"
    // - Receipt в подписи = urlencoded JSON (строго то, что уходит в POST)
    
    // STEP 2: Строим Receipt для фискализации
    const receiptJson = buildSubscriptionReceipt(TRIAL_PAYMENT_AMOUNT, "Подписка Step One — пробный период 3 дня");
    const receiptEncoded = encodeURIComponent(receiptJson);
    
    // КРИТИЧНО: Формируем подпись в точном порядке Robokassa
    // Order: MerchantLogin:OutSum:InvId:Receipt:Password1:Shp_userId=XXX
    // В подписи Receipt = URL-encoded строка, Shp_* включаем в конце
    let signatureBase = `${merchantLogin}:${amountStr}:${invoiceIdStr}:${receiptEncoded}:${password1}`;
    if (numericUserId) {
      signatureBase += `:Shp_userId=${numericUserId}`;
    }
    
    const signatureValue = md5(signatureBase).toLowerCase();
    
    // Проверка подписи
    if (!signatureValue || signatureValue.length !== 32) {
      throw new Error(`Invalid signature generated: ${signatureValue}`);
    }

    // DEBUG: Логируем строку подписи БЕЗ пароля
    let signatureBaseForLog = `${merchantLogin}:${amountStr}:${invoiceIdStr}:${receiptEncoded}:[PASSWORD_HIDDEN]`;
    if (numericUserId) {
      signatureBaseForLog += `:Shp_userId=${numericUserId}`;
    }
    
    console.log("[robokassa/create] ========== STEP 1: FIRST (PARENT) PAYMENT ==========");
    console.log("[robokassa/create] Purpose: Trial payment 1 RUB (NO recurring, with Receipt)");
    console.log("[robokassa/create] ========== SIGNATURE DEBUG ==========");
    console.log("[robokassa/create] Signature base (BEFORE md5, WITHOUT password):", signatureBaseForLog);
    console.log("[robokassa/create] Signature base (ПОЛНАЯ):", signatureBase);
    console.log("[robokassa/create] Signature value (md5):", signatureValue);
    console.log("[robokassa/create] ========== PARAMETERS ==========");
    console.log("[robokassa/create] MerchantLogin:", merchantLogin);
    console.log("[robokassa/create] OutSum:", amountStr, "(must be '1.00', type:", typeof amountStr, ")");
    console.log("[robokassa/create] InvId:", invoiceId, "(type:", typeof invoiceId, ")");
    console.log("[robokassa/create] InvId as string:", invoiceIdStr);
    console.log("[robokassa/create] InvId <= 2147483647:", invoiceId <= 2147483647);
    console.log("[robokassa/create] ========== EXCLUDED FROM SIGNATURE ==========");
    console.log("[robokassa/create] Recurring: NOT SENT on first payment");
    console.log("[robokassa/create] Description: (NOT in signature, but in POST)");
    console.log("[robokassa/create] Receipt: SENT (required for self-employed fiscalization)");
    console.log("[robokassa/create] =================================================");

    // ВАЖНО: Robokassa требует POST форму, а не GET URL!
    const robokassaDomain = process.env.ROBOKASSA_DOMAIN || "auth.robokassa.ru";
    const robokassaActionUrl = `https://${robokassaDomain}/Merchant/Index.aspx`;
    
    // STEP 1: POST fields для первого платежа
    // POST fields:
    // - MerchantLogin
    // - OutSum = "1.00"
    // - InvId (unique integer, NOT bigint, NOT timestamp in ms) - КРИТИЧНО: InvId, не InvoiceID
    // - Description = "Подписка Step One — пробный период 3 дня"
    // - Receipt (urlencoded JSON для фискализации ФЗ-54)
    // - Shp_userId (опционально, если userId есть)
    // - SignatureValue
    
    const description = "Подписка Step One — пробный период 3 дня";
    
    const formData: Record<string, string> = {
      MerchantLogin: merchantLogin,
      OutSum: amountStr, // "1.00"
      InvId: invoiceIdStr, // КРИТИЧНО: Robokassa использует InvId, не InvoiceID
      Description: description,
      Receipt: receiptEncoded, // Receipt обязателен для самозанятого
      SignatureValue: signatureValue,
    };
    
    // Shp_userId опционален - НЕ включаем в подпись. Добавляем только в форму, если есть
    if (numericUserId) {
      formData.Shp_userId = String(numericUserId);
      if (numericUserId) {
      console.log("[robokassa/create] Added optional Shp_userId (IN signature as Shp_userId=XXX):", numericUserId);
    }
    } else {
      console.log("[robokassa/create] Shp_userId not provided - skipping (optional field)");
    }
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
    const requiredFields = ["MerchantLogin", "OutSum", "InvId", "Description", "Receipt", "SignatureValue"];
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
      throw new Error(`Invalid OutSum format: ${formData.OutSum}. Expected format: "199.00"`);
    }
    
    // STEP 5: ERROR HANDLING - Log exact signature string BEFORE md5
    console.log("[robokassa/create] ========== ERROR 26 PROTECTION ==========");
    console.log("[robokassa/create] Exact signature string BEFORE md5:", signatureBaseForLog);
    console.log("[robokassa/create] Full signature string (with password):", signatureBase);
    console.log("[robokassa/create] Final SignatureValue (md5):", signatureValue);
    console.log("[robokassa/create] Signature formula:", numericUserId 
      ? `MerchantLogin:OutSum:InvoiceID:Receipt:Shp_userId=${numericUserId}:Password1`
      : `MerchantLogin:OutSum:InvoiceID:Receipt:Password1`);
    console.log("[robokassa/create] If Robokassa returns error 26:");
    console.log("[robokassa/create]   - Check signature formula includes Receipt (JSON, not encoded)");
    console.log("[robokassa/create]   - Check signature formula includes Shp_userId=XXX if userId provided");
    console.log("[robokassa/create]   - Verify Password1 is correct");
    console.log("[robokassa/create]   - Verify Recurring is approved on merchant side");
    console.log("[robokassa/create]   - Verify Receipt JSON is valid");
    console.log("[robokassa/create] ==========================================");

    // Сохраняем платеж в БД для отслеживания (STEP 1: parent payment)
    // ВАЖНО: Этот InvoiceID будет сохранен как recurring_parent_invoice_id после успешной оплаты
    try {
      const { error: paymentInsertError } = await supabase
        .from("payments")
        .insert({
          user_id: numericUserId,
          invoice_id: invoiceIdStr,
          previous_invoice_id: null, // Для первого платежа (parent) всегда null
          amount: TRIAL_PAYMENT_AMOUNT,
          status: "pending",
          is_recurring: false, // Первый платёж 1 ₽ - не recurring
        });
      
      if (paymentInsertError) {
        // Не блокируем создание платежа, если БД недоступна
        console.warn("[robokassa/create] Warning: Failed to save payment to DB:", paymentInsertError.message);
      } else {
        console.log("[robokassa/create] ✅ Parent payment saved to DB, invoice_id:", invoiceIdStr);
        console.log("[robokassa/create] Этот InvoiceID будет сохранен как recurring_parent_invoice_id после успешной оплаты");
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
      invoiceId: invoiceIdStr,
      amount: TRIAL_PAYMENT_AMOUNT,
      method: "POST",
      // DEBUG: Добавляем информацию о подписи для dev режима
      debugSignature: process.env.NODE_ENV !== "production" || process.env.DEBUG_ROBOKASSA === "true" ? {
        base: signatureBaseForLog,
        md5: signatureValue,
        fullBase: signatureBase,
      } : undefined,
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
