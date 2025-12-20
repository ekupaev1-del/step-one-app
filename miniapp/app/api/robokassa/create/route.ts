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
    const supabase = createServerSupabaseClient();
    const body = await req.json();
    const { userId } = body;

    console.log("[robokassa/create] ========== FIRST RECURRING PAYMENT ==========");
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

    // Формируем Receipt для первого платежа
    const receiptJson = buildFirstPaymentReceipt(FIRST_PAYMENT_AMOUNT);
    const receiptEncoded = encodeURIComponent(receiptJson);

    // Подпись строго по документации:
    // MerchantLogin:OutSum:InvoiceID:Receipt:ROBOKASSA_PASSWORD1
    // ВАЖНО: Receipt в подписи - это JSON строка (НЕ encoded)
    const signatureBase = `${merchantLogin}:${amountStr}:${invoiceId}:${receiptJson}:${password1}`;
    const signatureValue = md5(signatureBase).toLowerCase();

    // DEBUG: Логируем строку подписи БЕЗ пароля
    const signatureBaseForLog = `${merchantLogin}:${amountStr}:${invoiceId}:${receiptJson}:[PASSWORD_HIDDEN]`;
    console.log("[robokassa/create] InvoiceID:", invoiceId);
    console.log("[robokassa/create] OutSum:", amountStr);
    console.log("[robokassa/create] Receipt JSON:", receiptJson);
    console.log("[robokassa/create] Signature base (без пароля):", signatureBaseForLog);
    console.log("[robokassa/create] Signature value:", signatureValue);

    // Формируем URL для оплаты
    // ВАЖНО: Порядок параметров критичен для Robokassa
    // Согласно документации, порядок должен быть:
    // 1. MerchantLogin
    // 2. OutSum
    // 3. InvId
    // 4. Description
    // 5. Receipt (если используется)
    // 6. Recurring (если используется)
    // 7. SignatureValue
    // 8. Дополнительные параметры (Culture, Shp_*)
    
    const description = "Подписка Step One — пробный период 3 дня";
    const params: string[] = [];
    
    // 1. Базовые обязательные параметры (строгий порядок)
    params.push(`MerchantLogin=${encodeURIComponent(merchantLogin)}`);
    params.push(`OutSum=${amountStr}`);
    params.push(`InvId=${invoiceId}`); // ВАЖНО: InvoiceID как строка, но только цифры
    params.push(`Description=${encodeURIComponent(description)}`);
    
    // 2. Receipt (для фискализации 54-ФЗ)
    params.push(`Receipt=${receiptEncoded}`);
    
    // 3. Recurring - ВАЖНО: значение "1" для включения рекуррентных платежей
    params.push(`Recurring=1`);
    
    // 4. SignatureValue - должен быть после всех параметров, влияющих на подпись
    params.push(`SignatureValue=${signatureValue}`);
    
    // 5. Дополнительные параметры
    params.push(`Culture=ru`);
    
    // 6. Shp_ параметры (для идентификации после оплаты)
    // ВАЖНО: Shp_ параметры НЕ включаются в подпись для первого платежа
    params.push(`Shp_userId=${numericUserId}`);
    
    // Логируем все параметры для отладки
    console.log("[robokassa/create] URL Parameters (in order):");
    params.forEach((param, index) => {
      const [key, value] = param.split('=');
      const displayValue = key === 'Receipt' || key === 'SignatureValue' 
        ? value.substring(0, 30) + '...' 
        : value;
      console.log(`  ${index + 1}. ${key}=${displayValue}`);
    });

    const paramsString = params.join("&");
    
    // ВАЖНО: Проверяем, какой домен использовать
    // Если аккаунт в .kz, используем .kz, иначе .ru
    // По умолчанию используем .ru, но можно переопределить через переменную окружения
    const robokassaDomain = process.env.ROBOKASSA_DOMAIN || "auth.robokassa.ru";
    const robokassaUrl = `https://${robokassaDomain}/Merchant/Index.aspx`;
    const paymentUrl = `${robokassaUrl}?${paramsString}`;
    
    console.log("[robokassa/create] Using Robokassa domain:", robokassaDomain);

    // DEBUG: Логируем итоговый URL и параметры
    console.log("[robokassa/create] Payment URL:", paymentUrl);
    console.log("[robokassa/create] URL length:", paymentUrl.length);
    console.log("[robokassa/create] Parameters:", {
      MerchantLogin: merchantLogin,
      OutSum: amountStr,
      InvId: invoiceId,
      Recurring: "1",
      Receipt: receiptEncoded.substring(0, 50) + "...",
      SignatureValue: signatureValue.substring(0, 10) + "...",
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

    return NextResponse.json({ 
      ok: true, 
      paymentUrl,
      invoiceId,
      amount: FIRST_PAYMENT_AMOUNT,
    });
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
