import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabaseAdmin";
import { signAppToken } from "@/lib/appToken";
import { TelegramInitDataError, validateTelegramInitData } from "@/lib/telegramInitData";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const initData = body?.initData;

    if (!initData || typeof initData !== "string") {
      return NextResponse.json({ ok: false, error: "initData is required" }, { status: 400 });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN || "";
    const parsed = validateTelegramInitData(initData, botToken, { maxAgeSeconds: 24 * 60 * 60 });

    const telegramId = parsed.telegramId; // BIGINT in DB (we keep number in JS)
    const supabase = createServerSupabaseClient();

    // Find or create UUID profile bound to this telegram_id
    const { data: existing, error: selectErr } = await supabase
      .from("profiles")
      .select("id, telegram_id")
      .eq("telegram_id", telegramId)
      .maybeSingle();

    if (selectErr) {
      return NextResponse.json({ ok: false, error: selectErr.message }, { status: 500 });
    }

    let userId: string;
    if (existing?.id) {
      userId = String(existing.id);
    } else {
      const { data: created, error: insertErr } = await supabase
        .from("profiles")
        .upsert({ telegram_id: telegramId }, { onConflict: "telegram_id" })
        .select("id, telegram_id")
        .single();

      if (insertErr || !created?.id) {
        return NextResponse.json(
          { ok: false, error: insertErr?.message || "Failed to create user" },
          { status: 500 }
        );
      }
      userId = String(created.id);
    }

    const jwtSecret = process.env.APP_JWT_SECRET || "";
    const token = signAppToken({ sub: userId, telegram_id: telegramId }, jwtSecret, {
      expiresInSeconds: 30 * 24 * 60 * 60,
    });

    // IMPORTANT:
    // - subject = userId (UUID)
    // - telegramId is NEVER treated as UUID
    return NextResponse.json({
      ok: true,
      token,
      user: {
        id: userId,
        telegram_id: telegramId,
      },
    });
  } catch (e: any) {
    if (e instanceof TelegramInitDataError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: e?.message || "Internal error" }, { status: 500 });
  }
}

