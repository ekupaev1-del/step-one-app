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
    .select("weight, height, goal, activity, gender, age, calories, protein, fat, carbs, water_goal_ml, avatar_url, name, subscription_status, trial_end_at, subscription_end_at, paid_until, robokassa_parent_invoice_id")
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
    name: user.name || null,
    weightKg: user.weight ? Number(user.weight) : null,
    heightCm: user.height ? Number(user.height) : null,
    goal: user.goal || null,
    activityLevel: user.activity || null,
    gender: user.gender || null,
    age: user.age ? Number(user.age) : null,
    caloriesGoal: user.calories ? Number(user.calories) : null,
    proteinGoal: user.protein ? Number(user.protein) : null,
    fatGoal: user.fat ? Number(user.fat) : null,
    carbsGoal: user.carbs ? Number(user.carbs) : null,
    waterGoalMl: user.water_goal_ml ? Number(user.water_goal_ml) : null,
    avatarUrl: user.avatar_url || null,
    subscriptionStatus: user.subscription_status || null,
    trialEndAt: user.trial_end_at || null,
    subscriptionEndAt: user.subscription_end_at || null,
    paidUntil: user.paid_until || null,
    robokassaParentInvoiceId: user.robokassa_parent_invoice_id || null
  });
}

