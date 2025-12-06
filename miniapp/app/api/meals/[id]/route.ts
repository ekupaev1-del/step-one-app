import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/meals/[id] - Обновление приёма пищи
 * 
 * Тело запроса:
 * {
 *   meal_text: string,
 *   calories: number,
 *   protein: number,
 *   fat: number,
 *   carbs: number
 * }
 * 
 * Возвращает обновлённую запись
 */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const mealId = Number(params.id);
    if (!Number.isFinite(mealId) || mealId <= 0) {
      return NextResponse.json(
        { ok: false, error: "ID должен быть положительным числом" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { meal_text, calories, protein, fat, carbs } = body;

    // Валидация данных
    if (meal_text === undefined || calories === undefined) {
      return NextResponse.json(
        { ok: false, error: "meal_text и calories обязательны" },
        { status: 400 }
      );
    }

    // Обновляем запись и получаем обновлённые данные
    const { data, error } = await supabase
      .from("diary")
      .update({
        meal_text: String(meal_text),
        calories: Number(calories) || 0,
        protein: Number(protein) || 0,
        fat: Number(fat) || 0,
        carbs: Number(carbs) || 0
      })
      .eq("id", mealId)
      .select("*")
      .single();

    if (error) {
      console.error("[/api/meals/:id PATCH] Ошибка обновления:", error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { ok: false, error: "Приём пищи не найден" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, meal: data });
  } catch (error: any) {
    console.error("[/api/meals/:id PATCH] Неожиданная ошибка:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Ошибка обновления" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/meals/[id] - Удаление приёма пищи
 * 
 * Возвращает подтверждение удаления
 */
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const mealId = Number(params.id);
    if (!Number.isFinite(mealId) || mealId <= 0) {
      return NextResponse.json(
        { ok: false, error: "ID должен быть положительным числом" },
        { status: 400 }
      );
    }

    // Проверяем, существует ли запись
    const { data: existingMeal, error: selectError } = await supabase
      .from("diary")
      .select("id")
      .eq("id", mealId)
      .maybeSingle();

    if (selectError) {
      console.error("[/api/meals/:id DELETE] Ошибка проверки записи:", selectError);
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
      console.error("[/api/meals/:id DELETE] Ошибка удаления:", deleteError);
      return NextResponse.json(
        { ok: false, error: deleteError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, deleted: true, id: mealId });
  } catch (error: any) {
    console.error("[/api/meals/:id DELETE] Неожиданная ошибка:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Ошибка удаления" },
      { status: 500 }
    );
  }
}
