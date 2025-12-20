import { NextResponse } from "next/server";

/**
 * Тестовый endpoint для проверки создания платежа
 * Проверяет переменные окружения и возвращает тестовые данные
 */
export async function GET() {
  try {
    const merchantLogin = process.env.ROBOKASSA_MERCHANT_LOGIN;
    const password1 = process.env.ROBOKASSA_PASSWORD1;
    const robokassaDomain = process.env.ROBOKASSA_DOMAIN || "auth.robokassa.ru";
    
    // Тестовые данные
    const testUserId = 1;
    const testAmount = "1.00";
    const testInvoiceId = `${testUserId}${Date.now()}`;
    const testDescription = "Подписка Step One — пробный период 3 дня";
    
    const testFormData = {
      MerchantLogin: merchantLogin || "NOT_SET",
      InvoiceID: testInvoiceId,
      OutSum: testAmount,
      Description: testDescription,
      Recurring: "true",
      SignatureValue: "test_signature",
      Culture: "ru",
      Shp_userId: String(testUserId),
    };
    
    return NextResponse.json({
      ok: true,
      env: {
        hasMerchantLogin: !!merchantLogin,
        hasPassword1: !!password1,
        merchantLoginLength: merchantLogin?.length || 0,
        password1Length: password1?.length || 0,
        robokassaDomain,
      },
      testData: {
        actionUrl: `https://${robokassaDomain}/Merchant/Index.aspx`,
        formData: testFormData,
        invoiceId: testInvoiceId,
        amount: 1.00,
        method: "POST",
      },
      message: "Тестовый endpoint работает. Проверьте переменные окружения.",
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error.message || "Internal error",
      },
      { status: 500 }
    );
  }
}
