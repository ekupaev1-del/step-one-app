import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabaseAdmin";

// Robokassa subscription URL (created in Robokassa dashboard)
const ROBOKASSA_SUBSCRIPTION_URL = "https://auth.robokassa.ru/RecurringSubscriptionPage/Subscription/Subscribe?SubscriptionId=b718af89-10c1-4018-856d-558d592c0f40";

/**
 * Subscription payment endpoint using Robokassa subscription page
 * 
 * Uses pre-configured subscription link from Robokassa dashboard
 */
export async function POST(req: Request) {
  try {
    console.log("[pay/subscribe] ========== SUBSCRIPTION PAYMENT ==========");
    console.log("[pay/subscribe] Request received at:", new Date().toISOString());
    
    const supabase = createServerSupabaseClient();
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

    const numericUserId = typeof userId === "string" ? Number(userId) : userId;
    
    if (!Number.isFinite(numericUserId) || numericUserId <= 0) {
      return NextResponse.json(
        { ok: false, error: "userId должен быть положительным числом" },
        { status: 400 }
      );
    }

    console.log("[pay/subscribe] UserId:", numericUserId);

    // Verify user exists
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id")
      .eq("id", numericUserId)
      .maybeSingle();

    if (userError || !user) {
      return NextResponse.json(
        { ok: false, error: "Пользователь не найден" },
        { status: 404 }
      );
    }

    console.log("[pay/subscribe] ✅ User verified");

    // Return Robokassa subscription URL
    const response = {
      ok: true, 
      subscriptionUrl: ROBOKASSA_SUBSCRIPTION_URL,
      method: "GET", // Simple redirect to subscription page
    };
    
    console.log("[pay/subscribe] ✅ Returning subscription URL:", ROBOKASSA_SUBSCRIPTION_URL);
    
    return NextResponse.json(response);
  } catch (error: any) {
    console.error("[pay/subscribe] error", error);
    console.error("[pay/subscribe] error stack", error.stack);
    console.error("[pay/subscribe] error details:", {
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
    });
    
    return NextResponse.json(
      { 
        ok: false, 
        error: error.message || "Internal error",
        details: process.env.NODE_ENV === "development" ? {
          message: error?.message,
          code: error?.code,
          details: error?.details,
          hint: error?.hint,
        } : undefined,
      },
      { status: 500 }
    );
  }
}
