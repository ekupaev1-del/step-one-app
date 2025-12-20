import { NextResponse } from "next/server";
import crypto from "crypto";

/**
 * Тестовый endpoint для проверки формирования URL платежа
 * Показывает все параметры без реального создания платежа
 */
export async function GET() {
  try {
    const merchantLogin = process.env.ROBOKASSA_MERCHANT_LOGIN;
    const password1 = process.env.ROBOKASSA_PASSWORD1;

    if (!merchantLogin || !password1) {
      return NextResponse.json({
        ok: false,
        error: "ROBOKASSA_MERCHANT_LOGIN или ROBOKASSA_PASSWORD1 не заданы",
      }, { status: 500 });
    }

    // Тестовые данные
    const testUserId = 318;
    const testAmount = 1.00;
    const testInvoiceId = `${testUserId}${Date.now()}`;
    const amountStr = testAmount.toFixed(2);

    // Тестовый Receipt
    const receiptJson = JSON.stringify({
      sno: "usn_income",
      items: [{
        name: "Подписка Step One — пробный период 3 дня",
        quantity: 1,
        sum: testAmount,
        payment_method: "full_payment",
        payment_object: "service",
        tax: "none",
      }],
    });
    const receiptEncoded = encodeURIComponent(receiptJson);

    // Подпись
    const signatureBase = `${merchantLogin}:${amountStr}:${testInvoiceId}:${receiptJson}:${password1}`;
    const signatureValue = crypto.createHash("md5").update(signatureBase).digest("hex").toLowerCase();

    // Формируем параметры
    const params: string[] = [];
    params.push(`MerchantLogin=${encodeURIComponent(merchantLogin)}`);
    params.push(`OutSum=${amountStr}`);
    params.push(`InvId=${testInvoiceId}`);
    params.push(`Description=${encodeURIComponent("Подписка Step One — пробный период 3 дня")}`);
    params.push(`Receipt=${receiptEncoded}`);
    params.push(`Recurring=1`);
    params.push(`SignatureValue=${signatureValue}`);
    params.push(`Culture=ru`);
    params.push(`Shp_userId=${testUserId}`);

    const paramsString = params.join("&");
    const robokassaUrl = "https://auth.robokassa.ru/Merchant/Index.aspx";
    const paymentUrl = `${robokassaUrl}?${paramsString}`;

    return NextResponse.json({
      ok: true,
      paymentUrl,
      parameters: {
        MerchantLogin: merchantLogin,
        OutSum: amountStr,
        InvId: testInvoiceId,
        Description: "Подписка Step One — пробный период 3 дня",
        Receipt: receiptJson,
        ReceiptEncoded: receiptEncoded.substring(0, 100) + "...",
        Recurring: "1",
        SignatureValue: signatureValue,
        Culture: "ru",
        Shp_userId: testUserId,
      },
      signature: {
        base: `${merchantLogin}:${amountStr}:${testInvoiceId}:${receiptJson}:[PASSWORD_HIDDEN]`,
        value: signatureValue,
      },
      urlLength: paymentUrl.length,
    });
  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      error: error.message || "Internal error",
    }, { status: 500 });
  }
}
