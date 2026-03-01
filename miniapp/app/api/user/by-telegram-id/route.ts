import { NextResponse } from "next/server";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import type { UserRow } from "@/lib/types";

export const dynamic = 'force-dynamic';

/**
 * GET /api/user/by-telegram-id?telegramId=<id>
 * 
 * Checks if user exists in database by telegram_id
 * Returns user.id if found, null otherwise
 */
export async function GET(req: Request) {
  try {
    const supabase = getServerSupabaseClient();
    const url = new URL(req.url);
    const telegramIdParam = url.searchParams.get("telegramId");

    if (!telegramIdParam) {
      return NextResponse.json(
        { ok: false, error: "telegramId is required" },
        { status: 400 }
      );
    }

    const telegramId = Number(telegramIdParam);
    if (!Number.isFinite(telegramId) || telegramId <= 0) {
      return NextResponse.json(
        { ok: false, error: "telegramId must be a positive number" },
        { status: 400 }
      );
    }

    // Query user by telegram_id with proper typing
    const { data: user, error } = await supabase
      .from("users")
      .select("id")
      .eq("telegram_id", telegramId)
      .maybeSingle() as { data: Pick<UserRow, "id"> | null; error: any };

    if (error) {
      console.error("[/api/user/by-telegram-id] Supabase error:", error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    if (!user || !user.id) {
      return NextResponse.json({
        ok: true,
        found: false,
        userId: null,
      });
    }

    return NextResponse.json({
      ok: true,
      found: true,
      userId: user.id,
    });
  } catch (err: any) {
    console.error("[/api/user/by-telegram-id] Error:", err);
    return NextResponse.json(
      { ok: false, error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
