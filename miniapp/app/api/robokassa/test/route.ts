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
    
    // Тестовая подпись без Receipt
    const signatureBase = `${merchantLogin}:${testAmount}:${testInvoiceId}:${password1}`;
    const signatureValue = md5(signatureBase).toLowerCase();

    return NextResponse.json({
      ok: true,
      hasMerchantLogin: !!merchantLogin,
      hasPassword1: !!password1,
      hasPassword2: !!password2,
      merchantLogin: merchantLogin || "NOT SET",
      testSignature: {
        base: signatureBase,
        value: signatureValue
      },
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
