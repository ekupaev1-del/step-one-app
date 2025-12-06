import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = 'force-dynamic';

/**
 * POST /api/meal/delete
 * 
 * Удаление приёма пищи
 * 
 * Тело запроса:
 * {
 *   id: number
 * }
 * 
 * Возвращает подтверждение удаления
 */
export async function POST(req: Request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const body = await req.json();
    const { id } = body;

    if (!id || !Number.isFinite(Number(id)) || Number(id) <= 0) {
      return NextResponse.json(
        { ok: false, error: "id должен быть положительным числом" },
        { status: 400 }
      );
    }

    const mealId = Number(id);

    // Проверяем, существует ли запись
    const { data: existingMeal, error: selectError } = await supabase
      .from("diary")
      .select("id")
      .eq("id", mealId)
      .maybeSingle();

    if (selectError) {
      console.error("[/api/meal/delete] Ошибка проверки записи:", selectError);
      return NextResponse.json(
        { ok: false, error: selectError.message },
        { status: 500 }
      );
    }

    if (!existingMeal) {
      return NextResponse.json(
        { ok: false, error: "Приём пищи не найден" },
        { status: 404 }
      );
    }

    // Удаляем запись
    const { error: deleteError } = await supabase
      .from("diary")
      .delete()
      .eq("id", mealId);

    if (deleteError) {
      console.error("[/api/meal/delete] Ошибка удаления:", deleteError);
      return NextResponse.json(
        { ok: false, error: deleteError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, deleted: true, id: mealId });
  } catch (error: any) {
    console.error("[/api/meal/delete] Неожиданная ошибка:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Ошибка удаления" },
      { status: 500 }
    );
  }
}

