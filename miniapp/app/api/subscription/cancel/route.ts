import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabaseAdmin";

export async function POST(req: Request) {
  try {
    const supabase = createServerSupabaseClient();
    const url = new URL(req.url);
    const userId = url.searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "userId обязателен" },
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

    // Проверяем пользователя
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id, subscription_status, robokassa_parent_invoice_id")
      .eq("id", numericId)
      .maybeSingle();

    if (userError || !user) {
      return NextResponse.json(
        { ok: false, error: "Пользователь не найден" },
        { status: 404 }
      );
    }

    // Отменяем подписку - устанавливаем статус expired
    // Также очищаем robokassa_parent_invoice_id чтобы отключить автопродление
    const { error: updateError } = await supabase
      .from("users")
      .update({
        subscription_status: "expired",
        robokassa_parent_invoice_id: null
      })
      .eq("id", numericId);

    if (updateError) {
      console.error("[subscription/cancel] Ошибка обновления:", updateError);
      return NextResponse.json(
        { ok: false, error: "Ошибка отмены подписки" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("[subscription/cancel] Ошибка:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Internal error" },
      { status: 500 }
    );
  }
}
