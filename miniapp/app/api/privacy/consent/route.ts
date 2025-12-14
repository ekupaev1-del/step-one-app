import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const url = new URL(req.url);
  const userId = url.searchParams.get("id");

  if (!userId) {
    return NextResponse.json(
      { ok: false, error: "ID отсутствует в URL" },
      { status: 400 }
    );
  }

  const numericId = Number(userId);
  if (!Number.isFinite(numericId)) {
    return NextResponse.json(
      { ok: false, error: "ID должен быть числом" },
      { status: 400 }
    );
  }

  try {
    const timestamp = new Date().toISOString();
    
    // Обновляем согласие пользователя (и политику конфиденциальности, и пользовательское соглашение)
    const { data, error } = await supabase
      .from("users")
      .update({
        privacy_accepted: true,
        privacy_accepted_at: timestamp,
        terms_accepted: true,
        terms_accepted_at: timestamp
      })
      .eq("id", numericId)
      .select("id");

    if (error) {
      console.error("[/api/privacy/consent] Ошибка Supabase:", error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    if (!data || data.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Пользователь не найден" },
        { status: 404 }
      );
    }

    console.log("[/api/privacy/consent] ✅ Согласие (privacy + terms) сохранено для пользователя:", numericId);

    return NextResponse.json({ ok: true, id: data[0].id });
  } catch (err: any) {
    console.error("[/api/privacy/consent] Исключение:", err);
    return NextResponse.json(
      { ok: false, error: err.message || "Ошибка сохранения согласия" },
      { status: 500 }
    );
  }
}
