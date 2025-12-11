import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getDailyWaterSummary } from "../../../../lib/waterService";

export const dynamic = 'force-dynamic';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * GET /api/water/summary
 * 
 * Получает сводку по воде за день
 * 
 * Параметры:
 * - userId: ID пользователя (из query string)
 * - date: дата в формате YYYY-MM-DD (опционально, по умолчанию сегодня)
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("userId");
    const dateParam = url.searchParams.get("date");

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

    // Парсим дату
    let date = new Date();
    if (dateParam) {
      const parsedDate = new Date(dateParam);
      if (!isNaN(parsedDate.getTime())) {
        date = parsedDate;
      }
    }

    // Получаем сводку
    const summary = await getDailyWaterSummary(numericId, date);

    return NextResponse.json({
      ok: true,
      summary
    }, { headers: corsHeaders });
  } catch (error: any) {
    console.error("[/api/water/summary] Ошибка:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Внутренняя ошибка сервера" },
      { status: 500, headers: corsHeaders }
    );
  }
}







