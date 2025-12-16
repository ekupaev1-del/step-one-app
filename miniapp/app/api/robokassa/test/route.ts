import { NextResponse } from "next/server";
import crypto from "crypto";

function md5(input: string) {
  return crypto.createHash("md5").update(input).digest("hex");
}

export async function GET(req: Request) {
  try {
    const merchantLogin = process.env.ROBOKASSA_MERCHANT_LOGIN;
    const password1 = process.env.ROBOKASSA_PASSWORD1;
    const password2 = process.env.ROBOKASSA_PASSWORD2;

    const testAmount = 199;
    const testInvoiceId = "test_inv_123";
    const testDescription = "Подписка на сервис питания Step One";
    
    // Тестовая подпись - используем просто число без .00
    const amountStr = testAmount.toString();
    const signatureBase = `${merchantLogin}:${amountStr}:${testInvoiceId}:${password1}`;
    const signatureValue = md5(signatureBase).toLowerCase();
    
    // Формируем тестовый URL
    const descriptionEncoded = encodeURIComponent(testDescription);
    const params: string[] = [];
    params.push(`MerchantLogin=${encodeURIComponent(merchantLogin || "")}`);
    params.push(`OutSum=${amountStr}`);
    params.push(`InvId=${testInvoiceId}`);
    params.push(`Description=${descriptionEncoded}`);
    params.push(`SignatureValue=${signatureValue}`);
    params.push(`Culture=ru`);
    
    const paramsString = params.join("&");
    const testUrl = `https://auth.robokassa.ru/Merchant/Index.aspx?${paramsString}`;

    return NextResponse.json({
      ok: true,
      hasMerchantLogin: !!merchantLogin,
      hasPassword1: !!password1,
      hasPassword2: !!password2,
      merchantLogin: merchantLogin || "NOT SET",
      password1Length: password1 ? password1.length : 0,
      testSignature: {
        base: signatureBase,
        value: signatureValue,
        length: signatureValue.length
      },
      testUrl: testUrl,
      env: {
        nodeEnv: process.env.NODE_ENV,
        vercelEnv: process.env.VERCEL_ENV
      }
    });
  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      error: error.message || "Internal error"
    }, { status: 500 });
  }
}
