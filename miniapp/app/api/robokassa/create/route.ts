import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabaseAdmin";

const AMOUNT = 199;
// ID подписки из личного кабинета Robokassa
// Можно переопределить через переменную окружения ROBOKASSA_SUBSCRIPTION_ID
const SUBSCRIPTION_ID = process.env.ROBOKASSA_SUBSCRIPTION_ID || "b718af89-10c1-4018-856d-558d592c0f40";
const SUBSCRIPTION_BASE_URL = "https://auth.robokassa.ru/RecurringSubscriptionPage/Subscription/Subscribe";

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

    console.log("[robokassa/create] ========== SUBSCRIPTION CREATION ==========");
    console.log("[robokassa/create] UserId:", userId);
    console.log("[robokassa/create] SubscriptionId:", SUBSCRIPTION_ID);

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

    // Формируем URL подписки с userId для идентификации пользователя после подписки
    // Robokassa передаст userId обратно в Result URL
    const subscriptionUrl = `${SUBSCRIPTION_BASE_URL}?SubscriptionId=${SUBSCRIPTION_ID}&Shp_userId=${userId}`;
    
    console.log("[robokassa/create] Subscription URL:", subscriptionUrl);
    console.log("[robokassa/create] ==========================================");

    // Сохраняем информацию о начале подписки
    // Robokassa отправит уведомление на /api/robokassa/result после успешной подписки
    await supabase.from("payments").insert({
      user_id: userId,
      invoice_id: `sub_${userId}_${Date.now()}`,
      previous_invoice_id: null,
      amount: AMOUNT,
      status: "pending",
      is_recurring: true,
    });

    return NextResponse.json({ 
      ok: true, 
      paymentUrl: subscriptionUrl,
      subscriptionId: SUBSCRIPTION_ID,
      debug: {
        subscriptionId: SUBSCRIPTION_ID,
        userId: userId,
        urlPreview: subscriptionUrl.substring(0, 100) + "..."
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
