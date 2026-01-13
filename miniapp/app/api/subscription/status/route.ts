/**
 * Get Subscription Status
 * GET /api/subscription/status?userId=123
 */

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("userId") || url.searchParams.get("id");

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "Не указан ID пользователя" },
        { status: 400 }
      );
    }

    const numericId = Number(userId);
    if (!Number.isFinite(numericId) || numericId <= 0) {
      return NextResponse.json(
        { ok: false, error: "Неверный ID пользователя" },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // Get subscription
    const { data: subscription, error } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", numericId)
      .maybeSingle();

    if (error) {
      console.error("[subscription/status] Database error:", error);
      return NextResponse.json(
        { ok: false, error: "Ошибка базы данных" },
        { status: 500 }
      );
    }

    // Check if subscription is still active (not expired)
    let isActive = false;
    let activeUntil: string | null = null;
    let nextChargeAt: string | null = null;
    let status: string = "inactive";

    if (subscription) {
      activeUntil = subscription.active_until;
      nextChargeAt = subscription.next_charge_at;
      status = subscription.status || "inactive";

      if (status === "active" && activeUntil) {
        const expiryDate = new Date(activeUntil);
        const now = new Date();
        isActive = expiryDate > now;

        // Auto-update if expired
        if (!isActive && status === "active") {
          await supabase
            .from("subscriptions")
            .update({ status: "past_due" })
            .eq("user_id", numericId);
          status = "past_due";
        }
      } else {
        isActive = false;
      }
    }

    return NextResponse.json({
      ok: true,
      subscription: {
        isActive,
        status,
        activeUntil,
        nextChargeAt,
        planCode: subscription?.plan_code || null,
      },
    });
  } catch (error: any) {
    console.error("[subscription/status] Unexpected error:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}
