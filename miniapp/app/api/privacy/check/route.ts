import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");

  if (!userId) {
    return NextResponse.json(
      { ok: false, error: "userId отсутствует в URL" },
      { status: 400 }
    );
  }

  const numericId = Number(userId);
  if (!Number.isFinite(numericId)) {
    return NextResponse.json(
      { ok: false, error: "userId должен быть числом" },
      { status: 400 }
    );
  }

  try {
    const { data, error } = await supabase
      .from("users")
      .select("privacy_accepted, privacy_accepted_at, terms_accepted, terms_accepted_at")
      .eq("id", numericId)
      .maybeSingle();

    if (error) {
      console.error("[/api/privacy/check] Ошибка Supabase:", error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { ok: false, error: "Пользователь не найден" },
        { status: 404 }
      );
    }

    // Проверяем оба согласия - если хотя бы одно не дано, считаем что согласие не дано
    const privacyAccepted = data.privacy_accepted || false;
    const termsAccepted = data.terms_accepted || false;
    const allAccepted = privacyAccepted && termsAccepted;

    return NextResponse.json({
      ok: true,
      privacy_accepted: privacyAccepted,
      privacy_accepted_at: data.privacy_accepted_at,
      terms_accepted: termsAccepted,
      terms_accepted_at: data.terms_accepted_at,
      all_accepted: allAccepted
    });
  } catch (err: any) {
    console.error("[/api/privacy/check] Исключение:", err);
    return NextResponse.json(
      { ok: false, error: err.message || "Ошибка проверки согласия" },
      { status: 500 }
    );
  }
}
