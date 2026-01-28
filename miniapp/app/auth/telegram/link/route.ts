import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabaseAdmin";
import { TelegramInitDataError, validateTelegramInitData } from "@/lib/telegramInitData";

export const dynamic = "force-dynamic";

function isExpired(expiresAt: string): boolean {
  const exp = new Date(expiresAt).getTime();
  return !Number.isFinite(exp) || exp <= Date.now();
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const initData = body?.initData;
    const linkToken = body?.token;

    if (!initData || typeof initData !== "string") {
      return NextResponse.json({ ok: false, error: "initData is required" }, { status: 400 });
    }
    if (!linkToken || typeof linkToken !== "string") {
      return NextResponse.json({ ok: false, error: "token is required" }, { status: 400 });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN || "";
    const parsed = validateTelegramInitData(initData, botToken, { maxAgeSeconds: 24 * 60 * 60 });
    const telegramId = parsed.telegramId;

    const supabase = createServerSupabaseClient();

    // Load link token and validate (not expired, not consumed)
    const { data: tokenRow, error: tokenErr } = await supabase
      .from("telegram_link_tokens")
      .select("token, user_id, expires_at, consumed_at")
      .eq("token", linkToken)
      .maybeSingle();

    if (tokenErr) {
      return NextResponse.json({ ok: false, error: tokenErr.message }, { status: 500 });
    }
    if (!tokenRow) {
      return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 400 });
    }
    if (tokenRow.consumed_at) {
      return NextResponse.json({ ok: false, error: "Token already used" }, { status: 400 });
    }
    if (isExpired(tokenRow.expires_at)) {
      return NextResponse.json({ ok: false, error: "Token expired" }, { status: 400 });
    }

    const targetUserId = String(tokenRow.user_id);

    // If telegram_id already linked to another user -> 409
    const { data: existingLink, error: existingErr } = await supabase
      .from("profiles")
      .select("id")
      .eq("telegram_id", telegramId)
      .maybeSingle();

    if (existingErr) {
      return NextResponse.json({ ok: false, error: existingErr.message }, { status: 500 });
    }
    if (existingLink?.id && String(existingLink.id) !== targetUserId) {
      return NextResponse.json(
        { ok: false, error: "telegram_id is already linked to another account" },
        { status: 409 }
      );
    }

    // Link telegram_id to the requested UUID user
    const { error: linkErr } = await supabase
      .from("profiles")
      .update({ telegram_id: telegramId })
      .eq("id", targetUserId);

    if (linkErr) {
      // Unique constraint race / conflict
      if (linkErr.code === "23505") {
        return NextResponse.json(
          { ok: false, error: "telegram_id is already linked to another account" },
          { status: 409 }
        );
      }
      return NextResponse.json({ ok: false, error: linkErr.message }, { status: 500 });
    }

    // Mark token as consumed
    const { error: consumeErr } = await supabase
      .from("telegram_link_tokens")
      .update({ consumed_at: new Date().toISOString() })
      .eq("token", linkToken)
      .is("consumed_at", null);

    if (consumeErr) {
      return NextResponse.json({ ok: false, error: consumeErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      linked: true,
      user: { id: targetUserId, telegram_id: telegramId },
    });
  } catch (e: any) {
    if (e instanceof TelegramInitDataError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: e?.message || "Internal error" }, { status: 500 });
  }
}

