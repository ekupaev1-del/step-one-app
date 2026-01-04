import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { logWaterIntake } from "../../../../lib/waterService";

export const dynamic = 'force-dynamic';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * POST /api/water/add
 * 
 * Добавляет запись о потреблении воды
 * 
 * Параметры:
 * - userId: ID пользователя (из query string)
 * 
 * Body:
 * - amount: количество воды в миллилитрах
 */
export async function POST(req: Request) {
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

    const body = await req.json();
    const { amount } = body;

    if (!amount || typeof amount !== 'number') {
      return NextResponse.json(
        { ok: false, error: "amount обязателен и должен быть числом" },
        { status: 400, headers: corsHeaders }
      );
    }

    // Валидация количества
    if (amount <= 0 || amount >= 5000) {
      return NextResponse.json(
        { ok: false, error: "Количество воды должно быть от 1 до 4999 мл" },
        { status: 400, headers: corsHeaders }
      );
    }

    // Логируем воду
    await logWaterIntake(numericId, amount, 'miniapp');

    console.log("[/api/water/add] Вода добавлена:", { userId: numericId, amount });

    return NextResponse.json({
      ok: true,
      message: "Вода добавлена"
    }, { headers: corsHeaders });
  } catch (error: any) {
    console.error("[/api/water/add] Ошибка:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Внутренняя ошибка сервера" },
      { status: 500, headers: corsHeaders }
    );
  }
}





























