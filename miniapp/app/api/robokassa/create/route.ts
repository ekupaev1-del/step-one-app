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
  const receipt = {
    sno: "usn_income", // УСН доходы (self-employed, самозанятый)
    items: [
      {
        name: "Подписка Step One — пробный период 3 дня",
        quantity: 1.0, // Количество как число
        sum: amount, // Сумма должна совпадать с OutSum (1.00)
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
    JSON.parse(receiptJson);
  } catch (e) {
    throw new Error(`Invalid Receipt JSON: ${e}`);
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
    const timestamp = Date.now();
    const invoiceId = `${numericUserId}${timestamp}`;
    
    // Проверяем, что InvoiceID состоит только из цифр
    if (!/^\d+$/.test(invoiceId)) {
      throw new Error(`Invalid InvoiceID format: ${invoiceId}. Must contain only digits.`);
    }
    
    const amountStr = FIRST_PAYMENT_AMOUNT.toFixed(2); // "1.00"

    // ВАЖНО: Для теста можно отключить Receipt через переменную окружения
    // Установите ROBOKASSA_SKIP_RECEIPT=true для теста без Receipt
    const skipReceipt = process.env.ROBOKASSA_SKIP_RECEIPT === "true";
    
    let receiptJson: string | null = null;
    let receiptEncoded: string | null = null;
    let signatureBase: string;
    let signatureValue: string;

    if (skipReceipt) {
      // Подпись БЕЗ Receipt: MerchantLogin:OutSum:InvoiceID:ROBOKASSA_PASSWORD1
      signatureBase = `${merchantLogin}:${amountStr}:${invoiceId}:${password1}`;
      signatureValue = md5(signatureBase).toLowerCase();
      console.log("[robokassa/create] ⚠️ Receipt отключен для теста (ROBOKASSA_SKIP_RECEIPT=true)");
    } else {
      // Формируем Receipt для первого платежа
      receiptJson = buildFirstPaymentReceipt(FIRST_PAYMENT_AMOUNT);
      receiptEncoded = encodeURIComponent(receiptJson);

      // Подпись строго по документации:
      // MerchantLogin:OutSum:InvoiceID:Receipt:ROBOKASSA_PASSWORD1
      // ВАЖНО: Receipt в подписи - это JSON строка (НЕ encoded)
      signatureBase = `${merchantLogin}:${amountStr}:${invoiceId}:${receiptJson}:${password1}`;
      signatureValue = md5(signatureBase).toLowerCase();
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
    const formData: Record<string, string> = {
      MerchantLogin: merchantLogin,
      InvoiceID: invoiceId, // ВАЖНО: в POST форме используется InvoiceID, а не InvId!
      OutSum: amountStr,
      Description: description,
      SignatureValue: signatureValue,
      Recurring: "true", // ВАЖНО: "true", а не "1"!
      Culture: "ru",
      Shp_userId: String(numericUserId),
    };
    
    // Добавляем Receipt только если он включен
    if (!skipReceipt && receiptEncoded) {
      formData.Receipt = receiptEncoded;
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
