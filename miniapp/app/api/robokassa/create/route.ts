import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabaseAdmin";
import crypto from "crypto";

// Первый платеж для привязки карты = 1 RUB
const FIRST_PAYMENT_AMOUNT = 1.00;

function md5(input: string): string {
  return crypto.createHash("md5").update(input).digest("hex");
}

/**
 * Строит Receipt для первого платежа (54-ФЗ)
 * Формат строго по документации Robokassa
 * ВАЖНО: Все поля обязательны и должны быть в правильном формате
 */
function buildFirstPaymentReceipt(amount: number): string {
  // ВАЖНО: Сумма должна быть числом, не строкой
  // Robokassa требует точное совпадение суммы в Receipt с OutSum
  // Формат строго по документации Robokassa для 54-ФЗ
  const receipt = {
    sno: "usn_income", // УСН доходы (self-employed, самозанятый)
    items: [
      {
        name: "Подписка Step One — пробный период 3 дня",
        quantity: 1.0, // Количество как число
        sum: Number(amount.toFixed(2)), // Сумма должна совпадать с OutSum (1.00), обязательно число
        payment_method: "full_payment", // Полная предоплата
        payment_object: "service", // Услуга
        tax: "none", // Без НДС (самозанятый)
      },
    ],
  };
  
  // JSON.stringify без пробелов (компактный формат)
  // ВАЖНО: Не использовать JSON.stringify с отступами
  const receiptJson = JSON.stringify(receipt);
  
  // Проверяем, что Receipt валидный JSON
  try {
    const parsed = JSON.parse(receiptJson);
    // Дополнительная проверка суммы
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
    
    // КРИТИЧНО: Shp_userId в подписи должен быть в формате "Shp_userId=322"
    const shpUserId = String(numericUserId);
    const shpUserIdInSignature = `Shp_userId=${shpUserId}`;
    
    // КРИТИЧНО: Порядок строки подписи для STEP 1 (БЕЗ Receipt):
    // MerchantLogin:OutSum:InvoiceID:Shp_userId=<value>:ROBOKASSA_PASSWORD1
    // Receipt НЕ включается, потому что не отправляется
    // Recurring НЕ включается в подпись
    // InvoiceID используется как строка в подписи
    const signatureBase = `${merchantLogin}:${amountStr}:${invoiceIdStr}:${shpUserIdInSignature}:${password1}`;
    const signatureValue = md5(signatureBase).toLowerCase();
    
    // Проверка подписи
    if (!signatureValue || signatureValue.length !== 32) {
      throw new Error(`Invalid signature generated: ${signatureValue}`);
    }

    // DEBUG: Логируем строку подписи БЕЗ пароля
    const signatureBaseForLog = `${merchantLogin}:${amountStr}:${invoiceIdStr}:${shpUserIdInSignature}:[PASSWORD_HIDDEN]`;
    
    console.log("[robokassa/create] ========== STEP 1: CARD BINDING PAYMENT ==========");
    console.log("[robokassa/create] Purpose: Bind card and get parent InvoiceID");
    console.log("[robokassa/create] OutSum:", amountStr, "(must be '1.00')");
    console.log("[robokassa/create] InvoiceID:", invoiceId, "(type:", typeof invoiceId, ")");
    console.log("[robokassa/create] InvoiceID as string:", invoiceIdStr);
    console.log("[robokassa/create] InvoiceID <= 2147483647:", invoiceId <= 2147483647);
    console.log("[robokassa/create] Receipt: NOT SENT (Robokassa limitation)");
    console.log("[robokassa/create] Recurring: true (NOT in signature)");
    console.log("[robokassa/create] Shp_userId в подписи:", shpUserIdInSignature);
    console.log("[robokassa/create] Signature base (БЕЗ пароля):", signatureBaseForLog);
    console.log("[robokassa/create] Signature value (md5):", signatureValue);
    console.log("[robokassa/create] =================================================");

    // ВАЖНО: Robokassa требует POST форму, а не GET URL!
    // Формируем данные для POST формы
    const description = "Подписка Step One — пробный период 3 дня";
    const robokassaDomain = process.env.ROBOKASSA_DOMAIN || "auth.robokassa.ru";
    const robokassaActionUrl = `https://${robokassaDomain}/Merchant/Index.aspx`;
    
    // Формируем объект с параметрами для POST формы
    // СТРОГО по примеру из документации Robokassa:
    // <form method = "POST" action = "https://auth.robokassa.ru/Merchant/Index.aspx">
    //   <input type = "hidden" name = "MerchantLogin" value = "demo">
    //   <input type = "hidden" name = "InvoiceID" value = "154">
    //   <input type = "hidden" name = "Description" value = "Оплата подписки">
    //   <input type = "hidden" name = "SignatureValue" value = "9ada9c4f842cdc1163e5e97d0461a1de">
    //   <input type = "hidden" name = "OutSum" value = "100">
    //   <input type = "hidden" name = "Recurring" value = "true">
    //   <input type = "submit" value = "Оплатить">
    // </form>
    // 
    // ВАЖНО: Порядок параметров должен быть ТОЧНО как в примере
    // ВАЖНО: Receipt НЕ используется в примере для первого платежа
    // Формируем данные для POST формы (STEP 1: только привязка карты)
    // КРИТИЧНО: Receipt НЕ отправляем на этом шаге (Robokassa limitation)
    // КРИТИЧНО: InvoiceID передаем как строку (но это число <= 2147483647)
    const formData: Record<string, string> = {
      MerchantLogin: merchantLogin,
      InvoiceID: invoiceIdStr, // КРИТИЧНО: строка, но число <= 2147483647
      Description: description,
      SignatureValue: signatureValue,
      OutSum: amountStr, // КРИТИЧНО: "1.00" (строка)
      Recurring: "true", // Recurring=true для привязки карты (НЕ участвует в подписи!)
    };
    
    // Добавляем Shp_ параметры (в конце, после основных параметров)
    formData.Shp_userId = shpUserId;
    
    // КРИТИЧНО: Receipt НЕ добавляем - это STEP 1 (только привязка карты)
    // Фискализация будет на STEP 2 (дочерний recurring-платеж 199 RUB)
    
    console.log("[robokassa/create] Recurring = 'true' (НЕ участвует в подписи)");
    console.log("[robokassa/create] Receipt: NOT SENT (will be sent in STEP 2)");
    console.log("[robokassa/create] Shp_userId added to formData:", formData.Shp_userId);
    
    console.log("[robokassa/create] Using Robokassa domain:", robokassaDomain);
    console.log("[robokassa/create] Robokassa action URL:", robokassaActionUrl);
    // DEBUG: Выводим детальную информацию о форме
    console.log("[robokassa/create] ========== FORM DATA DEBUG (STEP 1) ==========");
    console.log("[robokassa/create] POST URL:", robokassaActionUrl);
    console.log("[robokassa/create] Full POST fields:", {
      MerchantLogin: formData.MerchantLogin,
      InvoiceID: formData.InvoiceID,
      InvoiceID_type: typeof formData.InvoiceID,
      InvoiceID_numeric: Number(formData.InvoiceID),
      InvoiceID_isInt32: Number(formData.InvoiceID) <= 2147483647,
      OutSum: formData.OutSum,
      Description: formData.Description,
      Recurring: formData.Recurring,
      Receipt: "NOT SENT (STEP 1: card binding only)",
      Shp_userId: formData.Shp_userId,
      SignatureValue: formData.SignatureValue,
    });
    console.log("[robokassa/create] ==============================================");
    
    // Проверяем, что все обязательные поля присутствуют (STEP 1: БЕЗ Receipt)
    const requiredFields = ["MerchantLogin", "InvoiceID", "Description", "SignatureValue", "OutSum", "Recurring"];
    const missingFields = requiredFields.filter(field => !formData[field]);
    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(", ")}`);
    }
    
    console.log("[robokassa/create] ✅ All required fields present (STEP 1: without Receipt)");
    
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
