import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../lib/supabaseAdmin";
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

    const receipt = {
      sno: "none",
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
    const receiptEncoded = encodeURIComponent(receiptJson);

    // Подпись для первого платежа: MerchantLogin:OutSum:InvId:Receipt:Password1
    const signatureBase = `${merchantLogin}:${AMOUNT}:${invoiceId}:${receiptJson}:${password1}`;
    const signatureValue = md5(signatureBase);

    const params = new URLSearchParams({
      MerchantLogin: merchantLogin,
      OutSum: AMOUNT.toString(),
      InvId: invoiceId,
      Description: DESCRIPTION,
      Recurring: "true",
      Receipt: receiptEncoded,
      SignatureValue: signatureValue,
      Culture: "ru",
      Encoding: "utf-8",
    });

    const paymentUrl = `https://auth.robokassa.ru/Merchant/Index.aspx?${params.toString()}`;

    // Сохраняем pending платеж
    await supabase.from("payments").insert({
      user_id: userId,
      invoice_id: invoiceId,
      previous_invoice_id: null,
      amount: AMOUNT,
      status: "pending",
      is_recurring: false,
    });

    return NextResponse.json({ ok: true, paymentUrl, invoiceId });
  } catch (error: any) {
    console.error("[robokassa/create] error", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Internal error" },
      { status: 500 }
    );
  }
}
