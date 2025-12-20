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
 */
function buildFirstPaymentReceipt(amount: number): string {
  const receipt = {
    sno: "usn_income", // УСН доходы (self-employed)
    items: [
      {
        name: "Подписка Step One — пробный период 3 дня",
        quantity: 1,
        sum: amount, // Сумма должна совпадать с OutSum
        payment_method: "full_payment",
        payment_object: "service",
        tax: "none",
      },
    ],
  };
  // JSON.stringify без пробелов (компактный формат)
  return JSON.stringify(receipt);
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

    // Генерируем уникальный InvoiceID (числовой формат)
    // Формат: userId + timestamp для гарантии уникальности
    const invoiceId = `${numericUserId}${Date.now()}`;
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
    // Порядок параметров важен для Robokassa
    const description = "Подписка Step One — пробный период 3 дня";
    const params: string[] = [];
    
    // Обязательные параметры
    params.push(`MerchantLogin=${encodeURIComponent(merchantLogin)}`);
    params.push(`OutSum=${amountStr}`);
    params.push(`InvId=${invoiceId}`);
    params.push(`Description=${encodeURIComponent(description)}`);
    params.push(`Receipt=${receiptEncoded}`); // Receipt всегда для первого платежа
    params.push(`Recurring=true`); // Включаем рекуррентные платежи
    params.push(`SignatureValue=${signatureValue}`);
    params.push(`Culture=ru`);
    
    // Дополнительные параметры (Shp_ параметры для идентификации)
    params.push(`Shp_userId=${numericUserId}`);

    const paramsString = params.join("&");
    const robokassaUrl = "https://auth.robokassa.ru/Merchant/Index.aspx";
    const paymentUrl = `${robokassaUrl}?${paramsString}`;

    // DEBUG: Логируем итоговый URL (без паролей)
    console.log("[robokassa/create] Payment URL:", paymentUrl);
    console.log("[robokassa/create] URL length:", paymentUrl.length);
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
