import { NextResponse } from "next/server";
import crypto from "crypto";

function md5(input: string): string {
  return crypto.createHash("md5").update(input).digest("hex").toLowerCase();
}

export async function GET(req: Request) {
  try {
    const merchantLogin = process.env.ROBOKASSA_MERCHANT_LOGIN || "stepone";
    const password1 = process.env.ROBOKASSA_PASSWORD1 || "B2Bnpr5rF948tbTZXsg";
    
    const url = new URL(req.url);
    const invoiceId = url.searchParams.get("invoiceId") || "1766418673593322";
    const outSum = url.searchParams.get("outSum") || "1.00";
    
    // Формула подписи: MerchantLogin:OutSum:InvoiceID:Password1
    const signatureBase = `${merchantLogin}:${outSum}:${invoiceId}:${password1}`;
    const signatureValue = md5(signatureBase);
    
    // Сравниваем с подписью из debug информации
    const expectedSignature = "e250f8f87a59ace77bea029fe2c0a82c";
    
    return NextResponse.json({
      ok: true,
      signature: {
        base: signatureBase.replace(password1, "[PASSWORD_HIDDEN]"),
        value: signatureValue,
        expected: expectedSignature,
        match: signatureValue === expectedSignature,
      },
      parameters: {
        merchantLogin,
        outSum,
        invoiceId,
        password1Length: password1.length,
      },
      test: {
        pythonScript: "robokassa_payment.py",
        canTest: true,
      }
    });
  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      error: error.message || "Internal error",
    }, { status: 500 });
  }
}
