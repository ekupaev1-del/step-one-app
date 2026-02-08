import { NextResponse } from "next/server";
import { getServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = 'force-dynamic';

/**
 * POST /api/meal/update
 * 
 * Обновление приёма пищи
 * 
 * Тело запроса:
 * {
 *   id: number,
 *   meal_text: string,
 *   calories: number,
 *   protein: number,
 *   fat: number,
 *   carbs: number
 * }
 * 
 * Возвращает подтверждение обновления
 */

export async function POST(req: Request) {
  try {
    // Используем единый источник правды с проверкой URL
    const supabase = getServerSupabaseClient();

    const body = await req.json();
    const { id, meal_text, calories, protein, fat, carbs } = body;

    if (!id || !Number.isFinite(Number(id)) || Number(id) <= 0) {
      return NextResponse.json(
        { ok: false, error: "id должен быть положительным числом" },
        { status: 400 }
      );
    }

    if (meal_text === undefined || calories === undefined) {
      return NextResponse.json(
        { ok: false, error: "meal_text и calories обязательны" },
        { status: 400 }
      );
    }

    const mealId = Number(id);

    // Обновляем запись
    // Type-safe update data matching Supabase diary table schema
    // Using explicit type to match Database['public']['Tables']['diary']['Update']
    type DiaryUpdate = {
      meal_text?: string;
      calories?: number;
      protein?: number;
      fat?: number;
      carbs?: number;
    };
    
    const updateData: DiaryUpdate = {
      meal_text: String(meal_text),
      calories: Number(calories) || 0,
      protein: Number(protein) || 0,
      fat: Number(fat) || 0,
      carbs: Number(carbs) || 0
    };

    const { data, error } = await supabase
      .from("diary")
      .update(updateData as any)
      .eq("id", mealId)
      .select("id")
      .single();

    if (error) {
      console.error("[/api/meal/update] Ошибка обновления:", error);
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

    return NextResponse.json({ ok: true, id: mealId });
  } catch (error: any) {
    console.error("[/api/meal/update] Неожиданная ошибка:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Ошибка обновления" },
      { status: 500 }
    );
  }
}

