import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { calculateMacros } from "../../../../lib/macroCalculator";

export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function PATCH(req: Request) {
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
    const { name, weightKg, heightCm, goal, activityLevel, gender, age } = body;

    // Валидация обязательных полей
    if (!weightKg || !heightCm || !goal || !activityLevel || !gender || !age) {
      return NextResponse.json(
        { ok: false, error: "Все поля обязательны: weightKg, heightCm, goal, activityLevel, gender, age" },
        { status: 400, headers: corsHeaders }
      );
    }

    // Валидация числовых значений
    const weightNum = Number(weightKg);
    const heightNum = Number(heightCm);
    const ageNum = Number(age);

    if (!Number.isFinite(weightNum) || weightNum <= 0) {
      return NextResponse.json(
        { ok: false, error: "weightKg должен быть положительным числом" },
        { status: 400, headers: corsHeaders }
      );
    }

    if (!Number.isFinite(heightNum) || heightNum <= 0) {
      return NextResponse.json(
        { ok: false, error: "heightCm должен быть положительным числом" },
        { status: 400, headers: corsHeaders }
      );
    }

    if (!Number.isFinite(ageNum) || ageNum <= 0 || ageNum > 150) {
      return NextResponse.json(
        { ok: false, error: "age должен быть положительным числом от 1 до 150" },
        { status: 400, headers: corsHeaders }
      );
    }

    // Валидация enum значений
    const validGoals = ['lose', 'maintain', 'gain'];
    if (!validGoals.includes(goal)) {
      return NextResponse.json(
        { ok: false, error: `goal должен быть одним из: ${validGoals.join(', ')}` },
        { status: 400, headers: corsHeaders }
      );
    }

    const validActivities = ['sedentary', 'light', 'moderate', 'active', 'very_active'];
    if (!validActivities.includes(activityLevel)) {
      return NextResponse.json(
        { ok: false, error: `activityLevel должен быть одним из: ${validActivities.join(', ')}` },
        { status: 400, headers: corsHeaders }
      );
    }

    const validGenders = ['male', 'female'];
    if (!validGenders.includes(gender)) {
      return NextResponse.json(
        { ok: false, error: `gender должен быть одним из: ${validGenders.join(', ')}` },
        { status: 400, headers: corsHeaders }
      );
    }

    // Пересчитываем нормы
    let macros;
    try {
      macros = calculateMacros(gender, ageNum, weightNum, heightNum, activityLevel, goal);
    } catch (calcError: any) {
      console.error("[/api/profile/update] Ошибка расчета норм:", calcError);
      return NextResponse.json(
        { ok: false, error: `Ошибка расчета норм: ${calcError.message}` },
        { status: 400, headers: corsHeaders }
      );
    }

    // Обновляем профиль пользователя
    const { data: updatedUser, error: updateError } = await supabase
      .from("users")
      .update({
        name: name || null,
        gender,
        age: ageNum,
        weight: weightNum,
        height: heightNum,
        activity: activityLevel,
        goal,
        calories: macros.calories,
        protein: macros.protein,
        fat: macros.fat,
        carbs: macros.carbs,
        water_goal_ml: macros.waterGoalMl
      })
      .eq("id", numericId)
      .select("name, avatar_url, weight, height, goal, activity, gender, age, calories, protein, fat, carbs, water_goal_ml")
      .single();

    if (updateError) {
      console.error("[/api/profile/update] Ошибка обновления профиля:", updateError);
      return NextResponse.json(
        { ok: false, error: `Ошибка обновления профиля: ${updateError.message}` },
        { status: 500, headers: corsHeaders }
      );
    }

    if (!updatedUser) {
      return NextResponse.json(
        { ok: false, error: "Пользователь не найден" },
        { status: 404, headers: corsHeaders }
      );
    }

    // Возвращаем обновленный профиль
    return NextResponse.json({
      ok: true,
      profile: {
        name: updatedUser.name || null,
        avatarUrl: updatedUser.avatar_url || null,
        weightKg: updatedUser.weight ? Number(updatedUser.weight) : null,
        heightCm: updatedUser.height ? Number(updatedUser.height) : null,
        goal: updatedUser.goal || null,
        activityLevel: updatedUser.activity || null,
        gender: updatedUser.gender || null,
        age: updatedUser.age ? Number(updatedUser.age) : null,
        caloriesGoal: updatedUser.calories ? Number(updatedUser.calories) : null,
        proteinGoal: updatedUser.protein ? Number(updatedUser.protein) : null,
        fatGoal: updatedUser.fat ? Number(updatedUser.fat) : null,
        carbsGoal: updatedUser.carbs ? Number(updatedUser.carbs) : null,
        waterGoalMl: updatedUser.water_goal_ml ? Number(updatedUser.water_goal_ml) : null
      }
    }, { headers: corsHeaders });
  } catch (error: any) {
    console.error("[/api/profile/update] Неожиданная ошибка:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Внутренняя ошибка сервера" },
      { status: 500, headers: corsHeaders }
    );
  }
}


