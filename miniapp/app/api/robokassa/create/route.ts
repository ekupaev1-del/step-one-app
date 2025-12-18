import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabaseAdmin";
import crypto from "crypto";

// Первый платеж для привязки карты = 1 RUB
const TRIAL_PAYMENT_AMOUNT = 1;
// Цена подписки после триала
const SUBSCRIPTION_AMOUNT = 199;

function md5(input: string) {
  return crypto.createHash("md5").update(input).digest("hex");
}

function buildTrialReceipt() {
  // Robokassa требует строгий формат Receipt для 54-ФЗ
  const receipt = {
    sno: "usn_income", // УСН доходы (self-employed)
    items: [
      {
        name: "Подписка Step One — пробный период 3 дня",
        quantity: 1,
        sum: TRIAL_PAYMENT_AMOUNT,
        payment_method: "full_payment",
        payment_object: "service",
        tax: "none",
      },
    ],
  };
  // Важно: JSON должен быть компактным, без пробелов
  return JSON.stringify(receipt);
}

export async function POST(req: Request) {
  try {
    const supabase = createServerSupabaseClient();
    const body = await req.json();
    const { userId, email } = body;

    console.log("[robokassa/create] Request body:", { userId, email: email ? "provided" : "not provided" });

    if (!userId) {
      console.error("[robokassa/create] userId отсутствует в body");
      return NextResponse.json(
        { ok: false, error: "userId обязателен в теле запроса" },
        { status: 400 }
      );
    }

    const numericUserId = typeof userId === "string" ? Number(userId) : userId;
    
    if (!Number.isFinite(numericUserId) || numericUserId <= 0) {
      console.error("[robokassa/create] Некорректный userId:", userId, "тип:", typeof userId);
      return NextResponse.json(
        { ok: false, error: `userId должен быть положительным числом, получено: ${userId} (тип: ${typeof userId})` },
        { status: 400 }
      );
    }

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

    console.log("[robokassa/create] ========== TRIAL PAYMENT CREATION ==========");
    console.log("[robokassa/create] UserId:", numericUserId);
    console.log("[robokassa/create] Amount:", TRIAL_PAYMENT_AMOUNT, "RUB");

    // Проверяем пользователя
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id, subscription_status, robokassa_initial_invoice_id")
      .eq("id", numericUserId)
      .maybeSingle();

    if (userError || !user) {
      return NextResponse.json(
        { ok: false, error: "Пользователь не найден" },
        { status: 404 }
      );
    }

    // Проверяем, не имеет ли пользователь уже активную подписку или триал
    if (user.subscription_status === "trial" || user.subscription_status === "active") {
      return NextResponse.json(
        { ok: false, error: "У вас уже есть активная подписка или триал" },
        { status: 400 }
      );
    }

    // Генерируем уникальный InvoiceID (числовой формат для Robokassa)
    // Robokassa требует числовой InvoiceID для рекуррентных платежей
    const invoiceId = `${numericUserId}${Date.now()}`;
    const amountStr = TRIAL_PAYMENT_AMOUNT.toFixed(2);

    // ВРЕМЕННО: Отключаем Receipt по умолчанию для теста
    // Включите через ROBOKASSA_USE_RECEIPT=true когда Receipt будет настроен в Robokassa
    const useReceipt = process.env.ROBOKASSA_USE_RECEIPT === "true";
    
    let receiptJson: string | null = null;
    let receiptEncoded: string | null = null;
    let signatureBase: string;
    let signatureValue: string;

    if (useReceipt) {
      // Формируем Receipt для фискализации (54-ФЗ)
      receiptJson = buildTrialReceipt();
      // Важно: Receipt должен быть URL-encoded для передачи в URL
      receiptEncoded = encodeURIComponent(receiptJson);

      // Подпись для платежа с Receipt:
      // MerchantLogin:OutSum:InvId:Receipt:Password1
      // ВАЖНО: Receipt включается в подпись как JSON строка (НЕ encoded, компактный JSON)
      signatureBase = `${merchantLogin}:${amountStr}:${invoiceId}:${receiptJson}:${password1}`;
      signatureValue = md5(signatureBase).toLowerCase();
      console.log("[robokassa/create] ✅ Receipt включен");
    } else {
      // Подпись БЕЗ Receipt: MerchantLogin:OutSum:InvId:Password1
      signatureBase = `${merchantLogin}:${amountStr}:${invoiceId}:${password1}`;
      signatureValue = md5(signatureBase).toLowerCase();
      console.log("[robokassa/create] ⚠️ Receipt отключен (по умолчанию). Установите ROBOKASSA_USE_RECEIPT=true для включения");
    }

    console.log("[robokassa/create] InvoiceId:", invoiceId);
    console.log("[robokassa/create] Amount (string):", amountStr);
    console.log("[robokassa/create] Receipt enabled:", useReceipt);
    if (receiptJson) {
      console.log("[robokassa/create] Receipt JSON (raw):", receiptJson);
      console.log("[robokassa/create] Receipt JSON (length):", receiptJson.length);
    }
    console.log("[robokassa/create] Signature base:", signatureBase);
    console.log("[robokassa/create] Signature value:", signatureValue);

    // Формируем URL для оплаты с Recurring=true
    const description = "Подписка Step One — пробный период 3 дня";
    const descriptionEncoded = encodeURIComponent(description);
    
    // ВАЖНО: Порядок параметров может влиять на подпись
    // Сначала базовые параметры
    const params: string[] = [];
    params.push(`MerchantLogin=${encodeURIComponent(merchantLogin)}`);
    params.push(`OutSum=${amountStr}`);
    params.push(`InvId=${invoiceId}`);
    params.push(`Description=${descriptionEncoded}`);
    
    // Receipt добавляем только если он включен
    if (useReceipt && receiptEncoded) {
      params.push(`Receipt=${receiptEncoded}`);
    }
    
    // Recurring должен быть перед SignatureValue
    params.push(`Recurring=true`); // ВАЖНО: включаем рекуррентные платежи
    
    // SignatureValue должен быть последним перед дополнительными параметрами
    params.push(`SignatureValue=${signatureValue}`);
    
    // Дополнительные параметры
    params.push(`Culture=ru`);
    
    // Передаем userId для идентификации после оплаты (Shp_ параметры)
    params.push(`Shp_userId=${numericUserId}`);
    
    // Передаем email для Robokassa (если предоставлен)
    if (email && typeof email === "string" && email.trim()) {
      params.push(`Email=${encodeURIComponent(email.trim())}`);
    }
    
    // Логируем финальный URL для отладки (без паролей)
    console.log("[robokassa/create] URL parameters count:", params.length);
    if (receiptEncoded) {
      console.log("[robokassa/create] Receipt encoded length:", receiptEncoded.length);
    }

    const paramsString = params.join("&");
    const robokassaUrl = "https://auth.robokassa.ru/Merchant/Index.aspx";
    const paymentUrl = `${robokassaUrl}?${paramsString}`;

    console.log("[robokassa/create] Payment URL:", paymentUrl);
    console.log("[robokassa/create] ==========================================");

    // Сохраняем pending платеж (проверяем, что таблица существует)
    try {
      const { error: paymentInsertError, data: paymentData } = await supabase
        .from("payments")
        .insert({
          user_id: numericUserId,
          invoice_id: invoiceId,
          previous_invoice_id: null,
          amount: TRIAL_PAYMENT_AMOUNT,
          status: "pending",
          is_recurring: true, // Это родительский платеж для рекуррентных списаний
        })
        .select();
      
      if (paymentInsertError) {
        console.error("[robokassa/create] Error inserting payment:", paymentInsertError);
        console.error("[robokassa/create] Payment error details:", {
          message: paymentInsertError.message,
          code: paymentInsertError.code,
          details: paymentInsertError.details,
          hint: paymentInsertError.hint,
        });
        throw new Error(`Failed to save payment: ${paymentInsertError.message}. Hint: ${paymentInsertError.hint || "Check if payments table exists"}`);
      }
      
      console.log("[robokassa/create] Payment saved:", paymentData);
    } catch (paymentErr: any) {
      // Если ошибка связана с отсутствием таблицы, даем понятное сообщение
      if (paymentErr.message?.includes("relation") || paymentErr.message?.includes("does not exist")) {
        throw new Error("Payments table does not exist. Please run migrations/add_subscriptions.sql");
      }
      throw paymentErr;
    }

    return NextResponse.json({ 
      ok: true, 
      paymentUrl,
      invoiceId,
      amount: TRIAL_PAYMENT_AMOUNT,
      debug: {
        merchantLogin: merchantLogin ? "SET" : "NOT SET",
        hasPassword1: !!password1,
        invoiceId: invoiceId,
        amount: amountStr,
      }
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
