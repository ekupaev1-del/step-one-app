import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabaseAdmin";
import crypto from "crypto";

const AMOUNT = 199;
const DESCRIPTION = "Подписка на сервис питания Step One";

function md5(input: string) {
  return crypto.createHash("md5").update(input).digest("hex");
}

export async function POST(req: Request) {
  try {
    const supabase = createServerSupabaseClient();
    const { userId } = await req.json();

    if (!userId || typeof userId !== "number") {
      return NextResponse.json(
        { ok: false, error: "userId обязателен и должен быть числом" },
        { status: 400 }
      );
    }

    const merchantLogin = process.env.ROBOKASSA_MERCHANT_LOGIN;
    const password1 = process.env.ROBOKASSA_PASSWORD1;

    console.log("[robokassa/create] ========== ENV CHECK ==========");
    console.log("[robokassa/create] ROBOKASSA_MERCHANT_LOGIN:", merchantLogin ? "SET" : "NOT SET");
    console.log("[robokassa/create] ROBOKASSA_PASSWORD1:", password1 ? "SET (length: " + password1.length + ")" : "NOT SET");
    console.log("[robokassa/create] NODE_ENV:", process.env.NODE_ENV);
    console.log("[robokassa/create] VERCEL_ENV:", process.env.VERCEL_ENV);
    console.log("[robokassa/create] ================================");

    if (!merchantLogin || !password1) {
      const missing = [];
      if (!merchantLogin) missing.push("ROBOKASSA_MERCHANT_LOGIN");
      if (!password1) missing.push("ROBOKASSA_PASSWORD1");
      
      console.error("[robokassa/create] ❌ Missing env variables:", missing);
      
      return NextResponse.json(
        { 
          ok: false, 
          error: `Отсутствуют переменные окружения: ${missing.join(", ")}. Проверьте настройки в Vercel.`,
          missing
        },
        { status: 500 }
      );
    }

    // Проверяем пользователя
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (userError || !user) {
      return NextResponse.json(
        { ok: false, error: "Пользователь не найден" },
        { status: 404 }
      );
    }

    // InvId должен быть уникальным числом (Robokassa рекомендует числовой формат)
    const invoiceId = `${userId}${Date.now()}`;

    // Формат суммы: используем с точкой "199.00" (как в документации)
    const amountStr = AMOUNT.toFixed(2);

    // Подпись: MerchantLogin:OutSum:InvId:Password1
    // ВАЖНО: Все значения должны быть строками, как они передаются в URL
    const signatureBase = `${merchantLogin}:${amountStr}:${invoiceId}:${password1}`;
    const signatureValue = md5(signatureBase).toLowerCase();

    console.log("[robokassa/create] ========== PAYMENT CREATION ==========");
    console.log("[robokassa/create] MerchantLogin:", merchantLogin);
    console.log("[robokassa/create] Amount (string):", amountStr);
    console.log("[robokassa/create] InvoiceId:", invoiceId);
    console.log("[robokassa/create] Signature base:", signatureBase);
    console.log("[robokassa/create] Signature value:", signatureValue);
    console.log("[robokassa/create] Password1 length:", password1.length);
    console.log("[robokassa/create] Password1 first 3 chars:", password1.substring(0, 3) + "...");
    console.log("[robokassa/create] Description (original):", DESCRIPTION);
    console.log("[robokassa/create] Description (encoded):", descriptionEncoded);

    // Формируем прямой URL для оплаты (редирект)
    // ВАЖНО: Description должен быть URL-encoded вручную для кириллицы
    const descriptionEncoded = encodeURIComponent(DESCRIPTION);
    
    // Собираем параметры вручную для полного контроля
    // URLSearchParams может неправильно кодировать кириллицу
    const paramPairs: string[] = [];
    paramPairs.push(`MerchantLogin=${encodeURIComponent(merchantLogin)}`);
    paramPairs.push(`OutSum=${amountStr}`);
    paramPairs.push(`InvId=${invoiceId}`);
    paramPairs.push(`Description=${descriptionEncoded}`);
    paramPairs.push(`SignatureValue=${signatureValue}`);
    paramPairs.push(`Culture=ru`);
    
    // Тестовый режим (если нужно для проверки)
    // В тестовом режиме можно использовать тестовые карты
    const isTestMode = process.env.ROBOKASSA_TEST_MODE === "true";
    if (isTestMode) {
      paramPairs.push(`IsTest=1`);
      console.log("[robokassa/create] ⚠️ TEST MODE ENABLED");
    }
    
    // Recurring добавляем только если явно нужно (требует настройки в ЛК)
    // Пока оставляем без него для базовой проверки
    // paramPairs.push(`Recurring=true`);
    
    const paramsString = paramPairs.join("&");
    const robokassaUrl = "https://auth.robokassa.ru/Merchant/Index.aspx";
    const paymentUrl = `${robokassaUrl}?${paramsString}`;
    
    console.log("[robokassa/create] Payment URL:", paymentUrl);
    console.log("[robokassa/create] ======================================");

    // Сохраняем pending платеж
    await supabase.from("payments").insert({
      user_id: userId,
      invoice_id: invoiceId,
      previous_invoice_id: null,
      amount: AMOUNT,
      status: "pending",
      is_recurring: false,
    });

    return NextResponse.json({ 
      ok: true, 
      paymentUrl,
      invoiceId,
      // Возвращаем также параметры для отладки (без пароля!)
      debug: {
        merchantLogin: merchantLogin ? "SET" : "NOT SET",
        hasPassword1: !!password1,
        signatureLength: signatureValue.length,
        amount: amountStr,
        invoiceId: invoiceId,
        // Показываем первые 50 символов URL для проверки
        paymentUrlPreview: paymentUrl.substring(0, 100) + "..."
      }
    });
  } catch (error: any) {
    console.error("[robokassa/create] error", error);
    console.error("[robokassa/create] error stack", error.stack);
    
    // Более детальная информация об ошибке
    const errorDetails = {
      message: error.message,
      name: error.name,
      hasMerchantLogin: !!process.env.ROBOKASSA_MERCHANT_LOGIN,
      hasPassword1: !!process.env.ROBOKASSA_PASSWORD1,
    };
    
    console.error("[robokassa/create] error details", errorDetails);
    
    return NextResponse.json(
      { 
        ok: false, 
        error: error.message || "Internal error",
        details: process.env.NODE_ENV === "development" ? errorDetails : undefined
      },
      { status: 500 }
    );
  }
}
