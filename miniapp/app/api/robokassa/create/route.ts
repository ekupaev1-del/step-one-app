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

    if (!merchantLogin || !password1) {
      return NextResponse.json(
        { ok: false, error: "ROBOKASSA_MERCHANT_LOGIN или PASSWORD1 не заданы" },
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

    // Пробуем вариант БЕЗ Receipt сначала (если фискализация не настроена)
    // Если фискализация требуется, можно включить обратно
    const useReceipt = process.env.ROBOKASSA_USE_RECEIPT === "true";
    
    let signatureBase: string;
    let receiptEncoded: string | undefined;
    
    if (useReceipt) {
      // Формируем чек для фискализации
      const receipt = {
        sno: "usn_income",
        items: [
          {
            name: DESCRIPTION,
            quantity: 1,
            sum: AMOUNT,
            payment_method: "full_payment",
            payment_object: "service",
            tax: "none",
          },
        ],
      };
      const receiptJson = JSON.stringify(receipt);
      receiptEncoded = encodeURIComponent(receiptJson);
      // Подпись с Receipt: MerchantLogin:OutSum:InvId:Receipt:Password1
      signatureBase = `${merchantLogin}:${AMOUNT}:${invoiceId}:${receiptJson}:${password1}`;
    } else {
      // Подпись без Receipt: MerchantLogin:OutSum:InvId:Password1
      signatureBase = `${merchantLogin}:${AMOUNT}:${invoiceId}:${password1}`;
    }
    
    const signatureValue = md5(signatureBase).toLowerCase();

    console.log("[robokassa/create] MerchantLogin:", merchantLogin);
    console.log("[robokassa/create] Amount:", AMOUNT);
    console.log("[robokassa/create] InvoiceId:", invoiceId);
    console.log("[robokassa/create] Use Receipt:", useReceipt);
    console.log("[robokassa/create] Signature base:", signatureBase);
    console.log("[robokassa/create] Signature value:", signatureValue);

    // Формируем параметры запроса
    // ВАЖНО: Description должен быть URL-encoded для корректной передачи кириллицы
    const descriptionEncoded = encodeURIComponent(DESCRIPTION);
    
    const params = new URLSearchParams();
    params.append("MerchantLogin", merchantLogin);
    params.append("OutSum", AMOUNT.toString());
    params.append("InvId", invoiceId);
    params.append("Description", descriptionEncoded);
    params.append("Recurring", "true");
    if (receiptEncoded) {
      params.append("Receipt", receiptEncoded);
    }
    params.append("SignatureValue", signatureValue);
    params.append("Culture", "ru");
    params.append("Encoding", "utf-8");
    
    const paramsString = params.toString();
    console.log("[robokassa/create] Final params:", paramsString);
    console.log("[robokassa/create] Description encoded:", descriptionEncoded);

    // URL для оплаты
    const robokassaUrl = "https://auth.robokassa.ru/Merchant/Index.aspx";
    const paymentUrl = `${robokassaUrl}?${paramsString}`;
    
    console.log("[robokassa/create] Payment URL (first 200 chars):", paymentUrl.substring(0, 200));

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
      debug: {
        merchantLogin: merchantLogin ? "SET" : "NOT SET",
        hasPassword1: !!password1,
        useReceipt,
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
