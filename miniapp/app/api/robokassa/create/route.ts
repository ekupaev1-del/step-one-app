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

    const invoiceId = `inv_${userId}_${Date.now()}`;

    // Формат суммы для Robokassa: должна быть строка с точкой (например "199.00")
    const amountStr = AMOUNT.toFixed(2);

    // МАКСИМАЛЬНО ПРОСТОЙ ВАРИАНТ - только обязательные параметры
    // Подпись: MerchantLogin:OutSum:InvId:Password1
    // ВАЖНО: В подписи используется строка суммы как есть
    const signatureBase = `${merchantLogin}:${amountStr}:${invoiceId}:${password1}`;
    const signatureValue = md5(signatureBase).toLowerCase();

    console.log("[robokassa/create] ========== PAYMENT CREATION ==========");
    console.log("[robokassa/create] MerchantLogin:", merchantLogin);
    console.log("[robokassa/create] Amount:", AMOUNT);
    console.log("[robokassa/create] InvoiceId:", invoiceId);
    console.log("[robokassa/create] Signature base:", signatureBase);
    console.log("[robokassa/create] Signature value:", signatureValue);

    // Используем FormSS.js метод - более надежный способ
    // ВАЖНО: Description должен быть URL-encoded
    const descriptionEncoded = encodeURIComponent(DESCRIPTION);
    
    // Формируем URL для FormSS.js скрипта
    // ВАЖНО: Используем InvId (не InvoiceID) - это стандартный параметр Robokassa
    const formssParams: string[] = [];
    formssParams.push(`MerchantLogin=${encodeURIComponent(merchantLogin)}`);
    formssParams.push(`OutSum=${amountStr}`);
    formssParams.push(`InvId=${invoiceId}`);
    formssParams.push(`Description=${descriptionEncoded}`);
    formssParams.push(`SignatureValue=${signatureValue}`);
    formssParams.push(`Culture=ru`);
    
    // Добавляем Recurring для автопродления
    formssParams.push(`Recurring=true`);
    
    const formssParamsString = formssParams.join("&");
    const formssScriptUrl = `https://auth.robokassa.ru/Merchant/PaymentForm/FormSS.js?${formssParamsString}`;
    
    console.log("[robokassa/create] FormSS.js Script URL:", formssScriptUrl);
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
      formssScriptUrl, 
      invoiceId,
      paymentParams: {
        merchantLogin,
        outSum: amountStr,
        invId: invoiceId,
        description: DESCRIPTION,
        signatureValue,
        culture: "ru",
        recurring: true
      },
      debug: {
        merchantLogin: merchantLogin ? "SET" : "NOT SET",
        hasPassword1: !!password1,
        signatureLength: signatureValue.length
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
