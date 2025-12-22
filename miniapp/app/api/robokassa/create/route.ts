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
    // Добавляем случайное число для гарантии уникальности
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    const invoiceId = `${numericUserId}${timestamp}${random}`;
    
    // Проверяем, что InvoiceID состоит только из цифр
    if (!/^\d+$/.test(invoiceId)) {
      throw new Error(`Invalid InvoiceID format: ${invoiceId}. Must contain only digits.`);
    }
    
    // Проверяем длину InvoiceID (Robokassa может иметь ограничения)
    if (invoiceId.length > 50) {
      throw new Error(`InvoiceID too long: ${invoiceId.length} characters`);
    }
    
    const amountStr = FIRST_PAYMENT_AMOUNT.toFixed(2); // "1.00"

    // ВАЖНО: Для теста можно отключить Receipt через переменную окружения
    // Установите ROBOKASSA_SKIP_RECEIPT=true для теста без Receipt
    const skipReceipt = process.env.ROBOKASSA_SKIP_RECEIPT === "true";
    
    let receiptJson: string | null = null;
    let receiptEncoded: string | null = null;
    let signatureBase: string;
    let signatureValue: string;

    // ВАЖНО: По документации Robokassa, для первого платежа с Recurring
    // подпись может быть БЕЗ Receipt: MerchantLogin:OutSum:InvoiceID:Password1
    // Receipt добавляется отдельно для фискализации, но НЕ всегда обязателен
    
    // Проверяем, нужен ли Receipt (по умолчанию включаем для фискализации)
    const useReceipt = !skipReceipt;
    
    if (!useReceipt) {
      // Подпись БЕЗ Receipt: MerchantLogin:OutSum:InvoiceID:ROBOKASSA_PASSWORD1
      signatureBase = `${merchantLogin}:${amountStr}:${invoiceId}:${password1}`;
      signatureValue = md5(signatureBase).toLowerCase();
      console.log("[robokassa/create] ⚠️ Receipt отключен - подпись БЕЗ Receipt");
    } else {
      // Формируем Receipt для фискализации
      try {
        receiptJson = buildFirstPaymentReceipt(FIRST_PAYMENT_AMOUNT);
        receiptEncoded = encodeURIComponent(receiptJson);
        console.log("[robokassa/create] Receipt created successfully, length:", receiptJson.length);
      } catch (receiptError: any) {
        console.error("[robokassa/create] ❌ Error building Receipt:", receiptError);
        // Если Receipt не удалось создать, пробуем без него
        console.log("[robokassa/create] ⚠️ Falling back to payment WITHOUT Receipt");
        receiptJson = null;
        receiptEncoded = null;
        signatureBase = `${merchantLogin}:${amountStr}:${invoiceId}:${password1}`;
        signatureValue = md5(signatureBase).toLowerCase();
      }
      
      // Если Receipt создан успешно, используем его в подписи
      if (receiptJson) {
        // Подпись С Receipt: MerchantLogin:OutSum:InvoiceID:Receipt:ROBOKASSA_PASSWORD1
        // ВАЖНО: Receipt в подписи - это JSON строка (НЕ encoded)
        signatureBase = `${merchantLogin}:${amountStr}:${invoiceId}:${receiptJson}:${password1}`;
        signatureValue = md5(signatureBase).toLowerCase();
      }
      
      // Дополнительная проверка подписи
      if (!signatureValue || signatureValue.length !== 32) {
        throw new Error(`Invalid signature generated: ${signatureValue}`);
      }
    }

    // DEBUG: Логируем строку подписи БЕЗ пароля
    const signatureBaseForLog = skipReceipt
      ? `${merchantLogin}:${amountStr}:${invoiceId}:[PASSWORD_HIDDEN]`
      : `${merchantLogin}:${amountStr}:${invoiceId}:${receiptJson}:[PASSWORD_HIDDEN]`;
    
    console.log("[robokassa/create] InvoiceID:", invoiceId);
    console.log("[robokassa/create] OutSum:", amountStr);
    console.log("[robokassa/create] Receipt enabled:", !skipReceipt);
    if (receiptJson) {
      console.log("[robokassa/create] Receipt JSON:", receiptJson);
      console.log("[robokassa/create] Receipt JSON length:", receiptJson.length);
    }
    console.log("[robokassa/create] Signature base (без пароля):", signatureBaseForLog);
    console.log("[robokassa/create] Signature value:", signatureValue);

    // ВАЖНО: Robokassa требует POST форму, а не GET URL!
    // Формируем данные для POST формы
    const description = "Подписка Step One — пробный период 3 дня";
    const robokassaDomain = process.env.ROBOKASSA_DOMAIN || "auth.robokassa.ru";
    const robokassaActionUrl = `https://${robokassaDomain}/Merchant/Index.aspx`;
    
    // Формируем объект с параметрами для POST формы
    // СТРОГО по примеру из документации Robokassa:
    // 1. MerchantLogin
    // 2. InvoiceID
    // 3. Description
    // 4. SignatureValue
    // 5. OutSum
    // 6. Recurring
    // 7. Shp_ параметры (если есть)
    // 8. Receipt (если нужен для фискализации)
    const formData: Record<string, string> = {
      MerchantLogin: merchantLogin,
      InvoiceID: invoiceId,
      Description: description,
      SignatureValue: signatureValue,
      OutSum: amountStr,
      Recurring: "true", // ВАЖНО: "true", а не "1"!
    };
    
    // Добавляем Shp_ параметры
    formData.Shp_userId = String(numericUserId);
    
    // ВАЖНО: Receipt добавляем только если он нужен для фискализации
    // В примере из документации Receipt НЕ показан для первого платежа
    // Но если нужна фискализация - добавляем в конце
    if (!skipReceipt && receiptEncoded) {
      formData.Receipt = receiptEncoded;
      console.log("[robokassa/create] Receipt added to formData for fiscalization");
    } else {
      console.log("[robokassa/create] Receipt NOT added (skipReceipt:", skipReceipt, ")");
    }
    
    console.log("[robokassa/create] Using Robokassa domain:", robokassaDomain);
    console.log("[robokassa/create] Robokassa action URL:", robokassaActionUrl);
    console.log("[robokassa/create] Form data (POST):", {
      MerchantLogin: formData.MerchantLogin,
      InvoiceID: formData.InvoiceID,
      OutSum: formData.OutSum,
      Description: formData.Description,
      Receipt: formData.Receipt ? formData.Receipt.substring(0, 50) + "..." : "NOT SET",
      Recurring: formData.Recurring,
      SignatureValue: formData.SignatureValue.substring(0, 10) + "...",
    });
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
