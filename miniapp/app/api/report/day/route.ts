import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = 'force-dynamic';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/**
 * OPTIONS handler for CORS
 */
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * GET /api/report/day
 * 
 * Отчёт за конкретный день
 * 
 * Параметры:
 * - userId: ID пользователя (из таблицы users)
 * - date: дата в формате YYYY-MM-DD (локальное время пользователя)
 * 
 * Возвращает:
 * - totals: итоговые значения калорий, БЖУ за день
 * - dailyNorm: дневная норма калорий пользователя
 * - percentage: процент выполнения нормы
 * - meals: список приёмов пищи за день, отсортированный по времени (новые сверху)
 */
export async function GET(req: Request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const url = new URL(req.url);
    const userId = url.searchParams.get("userId");
    const date = url.searchParams.get("date");

    if (!userId || !date) {
      return NextResponse.json(
        { ok: false, error: "userId и date обязательны" },
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

    // Получаем пользователя и его дневную норму
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("telegram_id, calories, protein, fat, carbs")
      .eq("id", numericId)
      .maybeSingle();

    if (userError) {
      console.error("[/api/report/day] Ошибка получения пользователя:", userError);
      return NextResponse.json(
        { ok: false, error: "Ошибка базы данных" },
        { status: 500, headers: corsHeaders }
      );
    }

    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Пользователь не найден" },
        { status: 404, headers: corsHeaders }
      );
    }

    // Парсим дату (локальное время пользователя)
    // КРИТИЧНО: Создаём даты в локальном времени, но без указания таймзоны
    // Это гарантирует, что мы получим все записи за этот день независимо от таймзоны
    const dayStart = new Date(date + "T00:00:00");
    const dayEnd = new Date(date + "T23:59:59.999");

    if (isNaN(dayStart.getTime()) || isNaN(dayEnd.getTime())) {
      return NextResponse.json(
        { ok: false, error: "Некорректный формат даты" },
        { status: 400, headers: corsHeaders }
      );
    }

    // КРИТИЧНО: Расширяем диапазон на ±12 часов для гарантии получения всех записей
    // Это решает проблему с таймзонами
    const startUTC = new Date(dayStart);
    startUTC.setHours(startUTC.getHours() - 12); // Минус 12 часов
    
    const endUTC = new Date(dayEnd);
    endUTC.setHours(endUTC.getHours() + 12); // Плюс 12 часов
    
    const startUTCStr = startUTC.toISOString();
    const endUTCStr = endUTC.toISOString();

    // Получаем все записи за день из БД
    console.log("[/api/report/day] Запрос к БД:", {
      userId: user.telegram_id,
      date,
      startUTC: startUTCStr,
      endUTC: endUTCStr
    });

    const { data: allMeals, error: mealsError } = await supabase
      .from("diary")
      .select("*")
      .eq("user_id", user.telegram_id)
      .gte("created_at", startUTCStr)
      .lte("created_at", endUTCStr)
      .order("created_at", { ascending: false }); // Новые сначала

    // КРИТИЧНО: Фильтруем записи по локальной дате после получения из БД
    // Это гарантирует, что мы покажем только записи за нужный день
    const meals = (allMeals || []).filter(meal => {
      const mealDate = new Date(meal.created_at);
      const mealDateStr = mealDate.toISOString().split("T")[0]; // YYYY-MM-DD
      return mealDateStr === date;
    });

    if (mealsError) {
      console.error("[/api/report/day] Ошибка получения записей:", mealsError);
      return NextResponse.json(
        { ok: false, error: "Ошибка получения данных" },
        { status: 500, headers: corsHeaders }
      );
    }

    console.log("[/api/report/day] Получено записей из БД:", meals?.length || 0, {
      meals: meals?.map(m => ({ id: m.id, text: m.meal_text, created_at: m.created_at }))
    });

    // Вычисляем итоговые значения за день
    const totals = (meals || []).reduce(
      (acc, meal) => ({
        calories: acc.calories + Number(meal.calories || 0),
        protein: acc.protein + Number(meal.protein || 0),
        fat: acc.fat + Number(meal.fat || 0),
        carbs: acc.carbs + Number(meal.carbs || 0)
      }),
      { calories: 0, protein: 0, fat: 0, carbs: 0 }
    );

    // Вычисляем процент от нормы
    const dailyNorm = user.calories || 0;
    const percentage = dailyNorm > 0 ? (totals.calories / dailyNorm) * 100 : 0;

    // Возвращаем готовый отчёт за день
    const report = {
      date,
      totals,
      dailyNorm,
      percentage: Math.round(percentage * 10) / 10,
      meals: meals || [],
      mealsCount: meals?.length || 0
    };

    console.log("[/api/report/day] Возвращаем отчёт:", {
      date: report.date,
      mealsCount: report.mealsCount,
      totals: report.totals
    });

    return NextResponse.json({
      ok: true,
      report
    }, { headers: corsHeaders });
  } catch (error: any) {
    console.error("[/api/report/day] Неожиданная ошибка:", error);
      return NextResponse.json(
        { ok: false, error: error.message || "Внутренняя ошибка сервера" },
        { status: 500, headers: corsHeaders }
      );
  }
}

