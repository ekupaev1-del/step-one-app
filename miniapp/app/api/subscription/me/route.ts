/**
 * Get User Subscription Status
 * GET /api/subscription/me?userId=123
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
        { ok: false, error: "userId is required" },
        { status: 400 }
      );
    }

    const numericId = Number(userId);
    if (!Number.isFinite(numericId) || numericId <= 0) {
      return NextResponse.json(
        { ok: false, error: "Invalid userId" },
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
      console.error("[subscription/me] Database error:", error);
      return NextResponse.json(
        { ok: false, error: "Database error" },
        { status: 500 }
      );
    }

    // Check if subscription is still active (not expired)
    let isActive = false;
    let activeUntil: string | null = null;

    if (subscription) {
      activeUntil = subscription.active_until;
      if (subscription.is_active && activeUntil) {
        const expiryDate = new Date(activeUntil);
        const now = new Date();
        isActive = expiryDate > now;

        // Auto-update if expired
        if (!isActive && subscription.is_active) {
          await supabase
            .from("subscriptions")
            .update({ is_active: false })
            .eq("user_id", numericId);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      subscription: {
        isActive,
        activeUntil,
        planCode: subscription?.plan_code || null,
      },
    });
  } catch (error: any) {
    console.error("[subscription/me] Unexpected error:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
