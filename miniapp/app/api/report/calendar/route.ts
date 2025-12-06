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
 * GET /api/report/calendar
 * 
 * Календарь: возвращает массив дат, в которых есть записи
 * 
 * Параметры:
 * - userId: ID пользователя (из таблицы users)
 * - month: месяц в формате YYYY-MM (например, 2024-01)
 * 
 * Возвращает:
 * - dates: массив дат в формате YYYY-MM-DD, в которых есть записи
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

    // Получаем пользователя
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("telegram_id")
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
    console.log("[/api/report/calendar] Запрос к БД:", {
      userId: user.telegram_id,
      month,
      startUTC,
      endUTC
    });

    const { data: meals, error: mealsError } = await supabase
      .from("diary")
      .select("created_at")
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

    // Извлекаем уникальные даты (в локальном времени)
    const datesSet = new Set<string>();
    
    (meals || []).forEach(meal => {
      const mealDate = new Date(meal.created_at);
      const dayKey = mealDate.toISOString().split("T")[0]; // YYYY-MM-DD
      datesSet.add(dayKey);
    });

    const dates = Array.from(datesSet).sort();
    
    console.log("[/api/report/calendar] Возвращаем даты:", { datesCount: dates.length, dates });

    // Возвращаем массив дат
    return NextResponse.json({
      ok: true,
      dates
    }, { headers: corsHeaders });
  } catch (error: any) {
    console.error("[/api/report/calendar] Неожиданная ошибка:", error);
      return NextResponse.json(
        { ok: false, error: error.message || "Внутренняя ошибка сервера" },
        { status: 500, headers: corsHeaders }
      );
  }
}

