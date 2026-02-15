/**
 * GET /api/user/profile?telegram_id=<id>
 * 
 * Checks if user exists in Supabase by telegram_id
 * Returns: { exists: boolean, user?: {...}, subscription?: {...} }
 */

import { NextResponse } from "next/server";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import type { UserRow } from "@/lib/types";

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const telegramIdParam = url.searchParams.get("telegram_id");

    if (!telegramIdParam) {
      return NextResponse.json(
        { exists: false, error: "telegram_id is required" },
        { status: 400 }
      );
    }

    const telegramId = Number(telegramIdParam);
    if (!Number.isFinite(telegramId) || telegramId <= 0) {
      return NextResponse.json(
        { exists: false, error: "Invalid telegram_id" },
        { status: 400 }
      );
    }

    const supabase = getServerSupabaseClient();

    // Query user by telegram_id
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("*")
      .eq("telegram_id", telegramId)
      .maybeSingle();

    if (userError) {
      console.error("[api/user/profile] Supabase error:", userError);
      return NextResponse.json(
        { exists: false, error: "Database error" },
        { status: 500 }
      );
    }

    const user = userData as UserRow | null;

    if (!user || !user.telegram_id) {
      return NextResponse.json({ exists: false });
    }

    // Get subscription if user exists
    let subscription = null;
    try {
      const { data: subData, error: subError } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!subError && subData) {
        subscription = subData;
      }
    } catch (subErr) {
      console.warn("[api/user/profile] Error fetching subscription:", subErr);
      // Subscription is optional, continue without it
    }

    return NextResponse.json({
      exists: true,
      user: {
        id: user.id,
        telegram_id: user.telegram_id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        gender: user.gender,
        age: user.age,
        weight: user.weight,
        height: user.height,
        activity: user.activity,
        goal: user.goal,
        calories: user.calories,
        protein: user.protein,
        fat: user.fat,
        carbs: user.carbs,
        water_goal_ml: user.water_goal_ml,
        avatar_url: user.avatar_url,
        privacy_accepted: user.privacy_accepted ?? false,
        terms_accepted: user.terms_accepted ?? false,
      },
      subscription: subscription ? {
        id: subscription.id,
        status: subscription.status,
        active: subscription.status === 'active',
        activeUntil: subscription.current_period_end,
        nextChargeAt: subscription.next_charge_at,
      } : null,
    });
  } catch (error: any) {
    console.error("[api/user/profile] Unexpected error:", error);
    return NextResponse.json(
      { exists: false, error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
