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
 * GET /api/report/monthly
 * 
 * Возвращает ежедневные данные по питанию за месяц для графика
 * 
 * Параметры:
 * - userId: ID пользователя (из таблицы users)
 * - month: месяц в формате YYYY-MM (например, 2024-01)
 * 
 * Возвращает:
 * - days: массив объектов с данными по дням:
 *   - date: дата в формате YYYY-MM-DD
 *   - calories: сумма калорий за день
 *   - protein: сумма белков за день (г)
 *   - fat: сумма жиров за день (г)
 *   - carbs: сумма углеводов за день (г)
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

    // Получаем пользователя
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("telegram_id")
      .eq("id", numericId)
      .maybeSingle();

    if (userError) {
      console.error("[/api/report/monthly] Ошибка получения пользователя:", userError);
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

    // Получаем все записи за месяц из БД
    const { data: meals, error: mealsError } = await supabase
      .from("diary")
      .select("created_at, calories, protein, fat, carbs")
      .eq("user_id", user.telegram_id)
      .gte("created_at", startUTC)
      .lte("created_at", endUTC);

    if (mealsError) {
      console.error("[/api/report/monthly] Ошибка получения записей:", mealsError);
      return NextResponse.json(
        { ok: false, error: "Ошибка получения данных" },
        { status: 500, headers: corsHeaders }
      );
    }

    // Агрегируем данные по дням
    // ВАЖНО: Используем локальное время для правильной группировки по дням
    // toISOString() возвращает UTC, что создает несоответствие с датами, сконструированными из локального месяца
    const dataByDate = new Map<string, { calories: number; protein: number; fat: number; carbs: number }>();
    
    (meals || []).forEach(meal => {
      const mealDate = new Date(meal.created_at);
      // Используем локальное время для получения правильной даты
      const year = mealDate.getFullYear();
      const monthNum = String(mealDate.getMonth() + 1).padStart(2, '0');
      const day = String(mealDate.getDate()).padStart(2, '0');
      const dayKey = `${year}-${monthNum}-${day}`; // YYYY-MM-DD в локальном времени
      
      const current = dataByDate.get(dayKey) || { calories: 0, protein: 0, fat: 0, carbs: 0 };
      dataByDate.set(dayKey, {
        calories: current.calories + Number(meal.calories || 0),
        protein: current.protein + Number(meal.protein || 0),
        fat: current.fat + Number(meal.fat || 0),
        carbs: current.carbs + Number(meal.carbs || 0)
      });
    });

    // Формируем массив всех дней месяца (даже без данных)
    const daysInMonth = monthEnd.getDate();
    const days: Array<{ date: string; calories: number; protein: number; fat: number; carbs: number }> = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${month}-${String(day).padStart(2, '0')}`;
      const dayData = dataByDate.get(date) || { calories: 0, protein: 0, fat: 0, carbs: 0 };
      days.push({
        date,
        ...dayData
      });
    }

    return NextResponse.json({
      ok: true,
      days
    }, { headers: corsHeaders });
  } catch (error: any) {
    console.error("[/api/report/monthly] Неожиданная ошибка:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Внутренняя ошибка сервера" },
      { status: 500, headers: corsHeaders }
    );
  }
}











