import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");

  if (!userId) {
    return NextResponse.json(
      { ok: false, error: "userId обязателен" },
      { status: 400 }
    );
  }

  const numericId = Number(userId);
  if (!Number.isFinite(numericId)) {
    return NextResponse.json({ ok: false, error: "userId должен быть числом" }, { status: 400 });
  }

  // Получаем данные пользователя (полный профиль)
  const { data: user, error } = await supabase
    .from("users")
    .select("weight, height, goal, calories, protein, fat, carbs, water_goal_ml")
    .eq("id", numericId)
    .maybeSingle();

  if (error) {
    console.error("[/api/user] Ошибка:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!user) {
    return NextResponse.json({ ok: false, error: "Пользователь не найден" }, { status: 404 });
  }

  // Формируем ответ в нужном формате
  return NextResponse.json({
    ok: true,
    name: null, // Имя/ник пока не хранится в БД
    weightKg: user.weight ? Number(user.weight) : null,
    heightCm: user.height ? Number(user.height) : null,
    goal: user.goal || null,
    caloriesGoal: user.calories ? Number(user.calories) : null,
    proteinGoal: user.protein ? Number(user.protein) : null,
    fatGoal: user.fat ? Number(user.fat) : null,
    carbsGoal: user.carbs ? Number(user.carbs) : null,
    waterGoalMl: user.water_goal_ml ? Number(user.water_goal_ml) : null
  });
}

