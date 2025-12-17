import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabaseAdmin";
import crypto from "crypto";

// Первый платеж для привязки карты = 1 RUB
const TRIAL_PAYMENT_AMOUNT = 1;
// Цена подписки после триала
const SUBSCRIPTION_AMOUNT = 199;
const DESCRIPTION = "Step One subscription (1 month)";

function md5(input: string) {
  return crypto.createHash("md5").update(input).digest("hex");
}

function buildReceipt(amount: number) {
  const receipt = {
    sno: "usn_income", // УСН доходы (self-employed)
    items: [
      {
        name: DESCRIPTION,
        quantity: 1,
        sum: amount,
        payment_method: "full_payment",
        payment_object: "service",
        tax: "none",
      },
    ],
  };
  return JSON.stringify(receipt);
}

export async function POST(req: Request) {
  try {
    const supabase = createServerSupabaseClient();
    const { userId, email } = await req.json();

    if (!userId || typeof userId !== "number") {
      return NextResponse.json(
        { ok: false, error: "userId обязателен и должен быть числом" },
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
    console.log("[robokassa/create] UserId:", userId);
    console.log("[robokassa/create] Amount:", TRIAL_PAYMENT_AMOUNT, "RUB");

    // Проверяем пользователя
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id, subscription_status, robokassa_parent_invoice_id")
      .eq("id", userId)
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

    // Генерируем уникальный InvoiceID
    const invoiceId = `trial_${userId}_${Date.now()}`;
    const amountStr = TRIAL_PAYMENT_AMOUNT.toFixed(2);

    // Формируем Receipt для фискализации
    const receiptJson = buildReceipt(TRIAL_PAYMENT_AMOUNT);
    const receiptEncoded = encodeURIComponent(receiptJson);

    // Подпись: MerchantLogin:OutSum:InvId:Receipt:Password1
    const signatureBase = `${merchantLogin}:${amountStr}:${invoiceId}:${receiptJson}:${password1}`;
    const signatureValue = md5(signatureBase).toLowerCase();

    console.log("[robokassa/create] InvoiceId:", invoiceId);
    console.log("[robokassa/create] Signature base:", signatureBase);
    console.log("[robokassa/create] Signature value:", signatureValue);

    // Формируем URL для оплаты с Recurring=true
    const descriptionEncoded = encodeURIComponent(DESCRIPTION);
    const params: string[] = [];
    params.push(`MerchantLogin=${encodeURIComponent(merchantLogin)}`);
    params.push(`OutSum=${amountStr}`);
    params.push(`InvId=${invoiceId}`);
    params.push(`Description=${descriptionEncoded}`);
    params.push(`Receipt=${receiptEncoded}`);
    params.push(`Recurring=true`); // ВАЖНО: включаем рекуррентные платежи
    params.push(`SignatureValue=${signatureValue}`);
    params.push(`Culture=ru`);
    
    // Передаем userId для идентификации после оплаты
    params.push(`Shp_userId=${userId}`);

    const paramsString = params.join("&");
    const robokassaUrl = "https://auth.robokassa.ru/Merchant/Index.aspx";
    const paymentUrl = `${robokassaUrl}?${paramsString}`;

    console.log("[robokassa/create] Payment URL:", paymentUrl);
    console.log("[robokassa/create] ==========================================");

    // Сохраняем pending платеж
    await supabase.from("payments").insert({
      user_id: userId,
      invoice_id: invoiceId,
      previous_invoice_id: null,
      amount: TRIAL_PAYMENT_AMOUNT,
      status: "pending",
      is_recurring: true, // Это родительский платеж для рекуррентных списаний
    });

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
    
    return NextResponse.json(
      { 
        ok: false, 
        error: error.message || "Internal error",
      },
      { status: 500 }
    );
  }
}
