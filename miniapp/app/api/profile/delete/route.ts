import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function DELETE(req: Request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const url = new URL(req.url);
    const userId = url.searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "userId обязателен" },
        { status: 400, headers: corsHeaders }
      );
    }

    const numericId = Number(userId);
    if (!Number.isFinite(numericId) || numericId <= 0) {
      return NextResponse.json(
        { ok: false, error: "userId должен быть положительным числом" },
        { status: 400, headers: corsHeaders }
      );
    }

    // Получаем данные пользователя для удаления связанных сущностей
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id, telegram_id, avatar_url")
      .eq("id", numericId)
      .maybeSingle();

    if (userError) {
      console.error("[/api/profile/delete] Ошибка получения пользователя:", userError);
      return NextResponse.json(
        { ok: false, error: "Не удалось получить пользователя" },
        { status: 500, headers: corsHeaders }
      );
    }

    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Пользователь не найден" },
        { status: 404, headers: corsHeaders }
      );
    }

    const telegramId = user.telegram_id;

    // Удаляем напоминания
    const { error: remindersError } = await supabase
      .from("reminders")
      .delete()
      .eq("user_id", numericId);

    if (remindersError) {
      console.error("[/api/profile/delete] Ошибка удаления reminders:", remindersError);
      return NextResponse.json(
        { ok: false, error: "Не удалось удалить напоминания" },
        { status: 500, headers: corsHeaders }
      );
    }

    // Удаляем воду
    const { error: waterError } = await supabase
      .from("water_logs")
      .delete()
      .eq("user_id", numericId);

    if (waterError) {
      console.error("[/api/profile/delete] Ошибка удаления water_logs:", waterError);
      return NextResponse.json(
        { ok: false, error: "Не удалось удалить логи воды" },
        { status: 500, headers: corsHeaders }
      );
    }

    // Удаляем дневник (использует telegram_id)
    const { error: diaryError } = await supabase
      .from("diary")
      .delete()
      .eq("user_id", telegramId);

    if (diaryError) {
      console.error("[/api/profile/delete] Ошибка удаления дневника:", diaryError);
      return NextResponse.json(
        { ok: false, error: "Не удалось удалить дневник" },
        { status: 500, headers: corsHeaders }
      );
    }

    // Удаляем пользователя
    const { error: userDeleteError } = await supabase
      .from("users")
      .delete()
      .eq("id", numericId);

    if (userDeleteError) {
      console.error("[/api/profile/delete] Ошибка удаления пользователя:", userDeleteError);
      return NextResponse.json(
        { ok: false, error: "Не удалось удалить пользователя" },
        { status: 500, headers: corsHeaders }
      );
    }

    return NextResponse.json({ ok: true }, { headers: corsHeaders });
  } catch (error: any) {
    console.error("[/api/profile/delete] Неожиданная ошибка:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Внутренняя ошибка сервера" },
      { status: 500, headers: corsHeaders }
    );
  }
}

