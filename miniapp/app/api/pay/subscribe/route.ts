import { NextResponse } from "next/server";

/**
 * Subscription payment endpoint - просто возвращает прямую ссылку на подписку Robokassa
 */
export async function POST(req: Request) {
  try {
    console.log("[pay/subscribe] ========== SUBSCRIPTION PAYMENT ==========");
    console.log("[pay/subscribe] Request received at:", new Date().toISOString());
    
    const body = await req.json();
    const { userId } = body;

    console.log("[pay/subscribe] Request body:", { userId });

    // Validate userId
    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "userId обязателен" },
        { status: 400 }
      );
    }

    // Прямая ссылка на подписку Robokassa
    // Можно задать через переменную окружения ROBOKASSA_SUBSCRIPTION_URL
    // Или использовать дефолтную ссылку
    const subscriptionUrl = 
      process.env.ROBOKASSA_SUBSCRIPTION_URL ||
      "https://auth.robokassa.ru/RecurringSubscriptionPage/Subscription/Subscribe?SubscriptionId=b718af89-10c1-4018-856d-558d592c0f40";

    console.log("[pay/subscribe] ✅ Returning subscription URL:", subscriptionUrl);
    
    // Возвращаем просто ссылку - фронтенд сделает редирект
    return NextResponse.json({
      ok: true,
      subscriptionUrl: subscriptionUrl,
      method: "GET", // Просто редирект на ссылку
    });
  } catch (error: any) {
    console.error("[pay/subscribe] error", error);
    console.error("[pay/subscribe] error stack", error.stack);
    
    return NextResponse.json(
      { 
        ok: false, 
        error: error.message || "Internal error",
      },
      { status: 500 }
    );
  }
}
