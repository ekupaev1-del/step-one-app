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
 * Вычисляет статус дня на основе соотношения калорий
 * @param actualCalories - фактически потребленные калории
 * @param targetCalories - целевые калории
 * @returns "green" | "yellow" | "red" | "none"
 * 
 * Логика:
 * - Зеленый: в пределах ±15% от нормы (85% - 115%)
 * - Красный: переедание более 15% (>115%)
 * - Желтый: недоедание более 15% (<85%)
 * - None: нет данных или нет целевой нормы
 */
function getDayStatus(actualCalories: number, targetCalories: number): "green" | "yellow" | "red" | "none" {
  if (!targetCalories || targetCalories <= 0) {
    return "none";
  }

  if (actualCalories <= 0) {
    return "none";
  }

  // Вычисляем процент от нормы
  const percentage = (actualCalories / targetCalories) * 100;

  // Зеленый: в пределах ±15% от нормы (85% - 115%)
  if (percentage >= 85 && percentage <= 115) {
    return "green";
  }

  // Красный: переедание более 15% (>115%)
  if (percentage > 115) {
    return "red";
  }

  // Желтый: недоедание более 15% (<85%)
  return "yellow";
}

/**
 * GET /api/report/calendar
 * 
 * Календарь: возвращает данные по дням с калориями и статусами
 * 
 * Параметры:
 * - userId: ID пользователя (из таблицы users)
 * - month: месяц в формате YYYY-MM (например, 2024-01)
 * 
 * Возвращает:
 * - days: массив объектов с данными по дням:
 *   - date: дата в формате YYYY-MM-DD
 *   - actualCalories: сумма калорий за день
 *   - targetCalories: целевые калории пользователя
 *   - status: "green" | "yellow" | "red" | "none"
 */
export async function GET(req: Request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const url = new URL(req.url);
    const userId = url.searchParams.get("userId");
    const month = url.searchParams.get("month");

    if (!userId || !month) {
      return NextResponse.json(
        { ok: false, error: "userId и month обязательны" },
        { status: 400 }
      );
    }

    const numericId = Number(userId);
    if (!Number.isFinite(numericId) || numericId <= 0) {
      return NextResponse.json(
        { ok: false, error: "userId должен быть положительным числом" },
        { status: 400, headers: corsHeaders }
      );
    }

    // Получаем пользователя и его целевую норму калорий
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("telegram_id, calories")
      .eq("id", numericId)
      .maybeSingle();

    if (userError) {
      console.error("[/api/report/calendar] Ошибка получения пользователя:", userError);
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

    const targetCalories = user.calories || 0;

    // Парсим месяц и вычисляем границы
    const monthStart = new Date(month + "-01T00:00:00");
    const monthEnd = new Date(monthStart);
    monthEnd.setMonth(monthEnd.getMonth() + 1);
    monthEnd.setDate(0); // Последний день месяца
    monthEnd.setHours(23, 59, 59, 999);

    if (isNaN(monthStart.getTime()) || isNaN(monthEnd.getTime())) {
      return NextResponse.json(
        { ok: false, error: "Некорректный формат месяца" },
        { status: 400, headers: corsHeaders }
      );
    }

    // Конвертируем в UTC для запроса к БД
    const startUTC = monthStart.toISOString();
    const endUTC = monthEnd.toISOString();

    // Получаем все записи за месяц из БД с калориями
    console.log("[/api/report/calendar] Запрос к БД:", {
      userId: user.telegram_id,
      month,
      startUTC,
      endUTC
    });

    const { data: meals, error: mealsError } = await supabase
      .from("diary")
      .select("created_at, calories")
      .eq("user_id", user.telegram_id)
      .gte("created_at", startUTC)
      .lte("created_at", endUTC);

    if (mealsError) {
      console.error("[/api/report/calendar] Ошибка получения записей:", mealsError);
      return NextResponse.json(
        { ok: false, error: "Ошибка получения данных" },
        { status: 500, headers: corsHeaders }
      );
    }

    console.log("[/api/report/calendar] Получено записей из БД:", meals?.length || 0);

    // Агрегируем калории по дням
    const caloriesByDate = new Map<string, number>();
    
    (meals || []).forEach(meal => {
      const mealDate = new Date(meal.created_at);
      const dayKey = mealDate.toISOString().split("T")[0]; // YYYY-MM-DD
      const mealCalories = Number(meal.calories || 0);
      
      if (mealCalories > 0) {
        const current = caloriesByDate.get(dayKey) || 0;
        caloriesByDate.set(dayKey, current + mealCalories);
      }
    });

    // Формируем массив дней с данными
    const days = Array.from(caloriesByDate.entries())
      .map(([date, actualCalories]) => ({
        date,
        actualCalories,
        targetCalories,
        status: getDayStatus(actualCalories, targetCalories) as "green" | "yellow" | "red" | "none"
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    console.log("[/api/report/calendar] Возвращаем дни:", { 
      daysCount: days.length, 
      sample: days.slice(0, 3) 
    });

    // Возвращаем массив дней с данными
    return NextResponse.json({
      ok: true,
      days
    }, { headers: corsHeaders });
  } catch (error: any) {
    console.error("[/api/report/calendar] Неожиданная ошибка:", error);
      return NextResponse.json(
        { ok: false, error: error.message || "Внутренняя ошибка сервера" },
        { status: 500, headers: corsHeaders }
      );
  }
}

