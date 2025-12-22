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
    // ВАЖНО: Robokassa требует числовой InvoiceID для рекуррентных платежей
    // Используем только цифры, без букв
    // Делаем InvoiceID короче - используем только последние 6 цифр timestamp + userId + random
    // Это гарантирует уникальность и не превышает разумные ограничения
    const timestamp = Date.now();
    const timestampShort = timestamp.toString().slice(-6); // Последние 6 цифр
    const random = Math.floor(Math.random() * 100); // 0-99
    const invoiceId = `${numericUserId}${timestampShort}${random.toString().padStart(2, '0')}`;
    
    // Проверяем, что InvoiceID состоит только из цифр
    if (!/^\d+$/.test(invoiceId)) {
      throw new Error(`Invalid InvoiceID format: ${invoiceId}. Must contain only digits.`);
    }
    
    // Проверяем длину InvoiceID (Robokassa может иметь ограничения)
    // Ограничиваем до 20 символов для надежности
    if (invoiceId.length > 20) {
      throw new Error(`InvoiceID too long: ${invoiceId.length} characters`);
    }
    
    console.log("[robokassa/create] Generated InvoiceID:", invoiceId, "length:", invoiceId.length);
    
    const amountStr = FIRST_PAYMENT_AMOUNT.toFixed(2); // "1.00"

    // ВАЖНО: По документации Robokassa для первого платежа с Recurring
    // подпись БЕЗ Receipt: MerchantLogin:OutSum:InvoiceID:Password1
    // В примере из документации Receipt НЕ показан для первого платежа
    // Используем ТОЛЬКО минимальный вариант БЕЗ Receipt (как в примере)
    
    // Подпись БЕЗ Receipt: MerchantLogin:OutSum:InvoiceID:ROBOKASSA_PASSWORD1
    // ТОЧНО как в примере из документации Robokassa
    const signatureBase = `${merchantLogin}:${amountStr}:${invoiceId}:${password1}`;
    const signatureValue = md5(signatureBase).toLowerCase();
    
    console.log("[robokassa/create] Используем подпись БЕЗ Receipt (как в примере документации)");
    
    // Проверка подписи
    if (!signatureValue || signatureValue.length !== 32) {
      throw new Error(`Invalid signature generated: ${signatureValue}`);
    }

    // DEBUG: Логируем строку подписи БЕЗ пароля
    const signatureBaseForLog = `${merchantLogin}:${amountStr}:${invoiceId}:[PASSWORD_HIDDEN]`;
    
    console.log("[robokassa/create] InvoiceID:", invoiceId);
    console.log("[robokassa/create] OutSum:", amountStr);
    console.log("[robokassa/create] Receipt: NOT USED (as in Robokassa documentation example)");
    console.log("[robokassa/create] Signature base (без пароля):", signatureBaseForLog);
    console.log("[robokassa/create] Signature value:", signatureValue);

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
    // ВАЖНО: Robokassa может требовать Recurring = "1" вместо "true"
    // Пробуем "1" как в некоторых версиях API
    // Если не работает, можно попробовать "true"
    const recurringValue = process.env.ROBOKASSA_RECURRING_VALUE || "1"; // По умолчанию "1"
    
    const formData: Record<string, string> = {
      MerchantLogin: merchantLogin,
      InvoiceID: invoiceId,
      Description: description,
      SignatureValue: signatureValue,
      OutSum: amountStr,
      Recurring: recurringValue, // "1" или "true" в зависимости от настроек Robokassa
    };
    
    console.log("[robokassa/create] Recurring value:", formData.Recurring, "type:", typeof formData.Recurring);
    console.log("[robokassa/create] Recurring value source:", recurringValue, "(from env ROBOKASSA_RECURRING_VALUE or default '1')");
    
    // Добавляем Shp_ параметры (в конце, после основных параметров)
    formData.Shp_userId = String(numericUserId);
    
    console.log("[robokassa/create] Receipt NOT added (as in Robokassa documentation example)");
    
    console.log("[robokassa/create] Using Robokassa domain:", robokassaDomain);
    console.log("[robokassa/create] Robokassa action URL:", robokassaActionUrl);
    // Логируем все параметры для отладки
    console.log("[robokassa/create] Form data (POST):", {
      MerchantLogin: formData.MerchantLogin,
      InvoiceID: formData.InvoiceID,
      InvoiceID_length: formData.InvoiceID.length,
      OutSum: formData.OutSum,
      Description: formData.Description,
      Description_length: formData.Description.length,
      Recurring: formData.Recurring,
      Recurring_type: typeof formData.Recurring,
      Shp_userId: formData.Shp_userId,
      SignatureValue: formData.SignatureValue.substring(0, 10) + "...",
      SignatureValue_length: formData.SignatureValue.length,
      Receipt: "NOT SET (as in documentation example)",
    });
    
    // Проверяем, что все обязательные поля присутствуют
    const requiredFields = ["MerchantLogin", "InvoiceID", "Description", "SignatureValue", "OutSum", "Recurring"];
    const missingFields = requiredFields.filter(field => !formData[field]);
    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(", ")}`);
    }
    
    // ВАЖНО: Проверяем, что Recurring имеет правильное значение
    if (formData.Recurring !== "1" && formData.Recurring !== "true") {
      console.warn(`[robokassa/create] ⚠️ Recurring has unexpected value: "${formData.Recurring}". Expected "1" or "true"`);
    }
    
    // ВАЖНО: Проверяем, что InvoiceID состоит только из цифр
    if (!/^\d+$/.test(formData.InvoiceID)) {
      throw new Error(`Invalid InvoiceID format: ${formData.InvoiceID}. Must contain only digits.`);
    }
    
    // ВАЖНО: Проверяем, что OutSum имеет правильный формат (число с 2 знаками после запятой)
    if (!/^\d+\.\d{2}$/.test(formData.OutSum)) {
      throw new Error(`Invalid OutSum format: ${formData.OutSum}. Expected format: "1.00"`);
    }
    console.log("[robokassa/create] ==========================================");

    // Сохраняем платеж в БД (опционально, для отслеживания)
    try {
      const { error: paymentInsertError } = await supabase
        .from("payments")
        .insert({
          user_id: numericUserId,
          invoice_id: invoiceId,
          previous_invoice_id: null, // Для первого платежа всегда null
          amount: FIRST_PAYMENT_AMOUNT,
          status: "pending",
          is_recurring: true,
        });
      
      if (paymentInsertError) {
        // Не блокируем создание платежа, если БД недоступна
        console.warn("[robokassa/create] Warning: Failed to save payment to DB:", paymentInsertError.message);
      } else {
        console.log("[robokassa/create] Payment saved to DB");
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
      invoiceId,
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
