import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getDailyWaterSummary } from "../../../lib/waterService";

export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

interface Recommendation {
  type: "protein" | "fat" | "carbs" | "calories" | "water";
  message: string;
  suggestion: string;
  severity: "low" | "medium" | "high";
}

/**
 * Анализирует данные пользователя за последние дни и генерирует рекомендации
 */
export async function GET(req: Request) {
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

    // Получаем пользователя и его нормы
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("telegram_id, calories, protein, fat, carbs, water_goal_ml")
      .eq("id", numericId)
      .maybeSingle();

    if (userError || !user) {
      return NextResponse.json(
        { ok: false, error: "Пользователь не найден" },
        { status: 404, headers: corsHeaders }
      );
    }

    const goals = {
      calories: user.calories || 0,
      protein: user.protein || 0,
      fat: user.fat || 0,
      carbs: user.carbs || 0,
      water: user.water_goal_ml || 0,
    };

    // Получаем данные за последние 14 дней
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 14);

    const startUTCStr = startDate.toISOString();
    const endUTCStr = endDate.toISOString();

    // Получаем все приемы пищи за период
    const { data: meals, error: mealsError } = await supabase
      .from("diary")
      .select("*")
      .eq("user_id", user.telegram_id)
      .gte("created_at", startUTCStr)
      .lte("created_at", endUTCStr)
      .order("created_at", { ascending: false });

    if (mealsError) {
      console.error("[/api/recommendations] Ошибка получения данных:", mealsError);
      return NextResponse.json(
        { ok: false, error: "Ошибка получения данных" },
        { status: 500, headers: corsHeaders }
      );
    }

    // Группируем по дням и вычисляем средние значения
    const dailyTotals: Record<string, { calories: number; protein: number; fat: number; carbs: number; water: number }> = {};

    (meals || []).forEach(meal => {
      const mealDate = new Date(meal.created_at);
      const dateKey = mealDate.toISOString().split("T")[0];
      
      if (!dailyTotals[dateKey]) {
        dailyTotals[dateKey] = { calories: 0, protein: 0, fat: 0, carbs: 0, water: 0 };
      }
      
      dailyTotals[dateKey].calories += Number(meal.calories || 0);
      dailyTotals[dateKey].protein += Number(meal.protein || 0);
      dailyTotals[dateKey].fat += Number(meal.fat || 0);
      dailyTotals[dateKey].carbs += Number(meal.carbs || 0);
    });

    // Получаем данные по воде за каждый день
    const daysWithData = Object.keys(dailyTotals);
    for (const dateKey of daysWithData) {
      try {
        const waterSummary = await getDailyWaterSummary(user.telegram_id, new Date(dateKey));
        dailyTotals[dateKey].water = waterSummary.totalMl || 0;
      } catch (e) {
        // Игнорируем ошибки получения воды
      }
    }

    // Вычисляем средние значения за период
    const daysCount = Object.keys(dailyTotals).length;
    if (daysCount < 3) {
      return NextResponse.json({
        ok: true,
        recommendations: []
      }, { headers: corsHeaders });
    }

    const averages = Object.values(dailyTotals).reduce(
      (acc, day) => ({
        calories: acc.calories + day.calories,
        protein: acc.protein + day.protein,
        fat: acc.fat + day.fat,
        carbs: acc.carbs + day.carbs,
        water: acc.water + day.water,
      }),
      { calories: 0, protein: 0, fat: 0, carbs: 0, water: 0 }
    );

    averages.calories /= daysCount;
    averages.protein /= daysCount;
    averages.fat /= daysCount;
    averages.carbs /= daysCount;
    averages.water /= daysCount;

    // Генерируем рекомендации
    const recommendations: Recommendation[] = [];

    // Анализ белка
    if (goals.protein > 0) {
      const proteinPercent = (averages.protein / goals.protein) * 100;
      if (proteinPercent < 70) {
        const deficit = goals.protein - averages.protein;
        recommendations.push({
          type: "protein",
          message: `Ты часто недобираешь белок — в среднем ${Math.round(averages.protein)}г вместо ${Math.round(goals.protein)}г`,
          suggestion: `Добавь творог или омлет завтра. Нужно еще примерно ${Math.round(deficit)}г белка в день.`,
          severity: proteinPercent < 50 ? "high" : "medium"
        });
      }
    }

    // Анализ жиров
    if (goals.fat > 0) {
      const fatPercent = (averages.fat / goals.fat) * 100;
      if (fatPercent < 70) {
        const deficit = goals.fat - averages.fat;
        recommendations.push({
          type: "fat",
          message: `Не хватает полезных жиров — в среднем ${Math.round(averages.fat)}г вместо ${Math.round(goals.fat)}г`,
          suggestion: `Добавь авокадо, орехи или оливковое масло в рацион. Нужно еще примерно ${Math.round(deficit)}г жиров.`,
          severity: fatPercent < 50 ? "high" : "medium"
        });
      } else if (fatPercent > 130) {
        recommendations.push({
          type: "fat",
          message: `Слишком много жиров — в среднем ${Math.round(averages.fat)}г вместо ${Math.round(goals.fat)}г`,
          suggestion: `Попробуй уменьшить количество жирных продуктов и добавь больше овощей.`,
          severity: fatPercent > 150 ? "high" : "medium"
        });
      }
    }

    // Анализ углеводов
    if (goals.carbs > 0) {
      const carbsPercent = (averages.carbs / goals.carbs) * 100;
      if (carbsPercent < 70) {
        const deficit = goals.carbs - averages.carbs;
        recommendations.push({
          type: "carbs",
          message: `Мало углеводов — в среднем ${Math.round(averages.carbs)}г вместо ${Math.round(goals.carbs)}г`,
          suggestion: `Добавь крупы, фрукты или цельнозерновой хлеб. Нужно еще примерно ${Math.round(deficit)}г углеводов.`,
          severity: carbsPercent < 50 ? "high" : "medium"
        });
      } else if (carbsPercent > 130) {
        recommendations.push({
          type: "carbs",
          message: `Слишком много углеводов — в среднем ${Math.round(averages.carbs)}г вместо ${Math.round(goals.carbs)}г`,
          suggestion: `Попробуй заменить часть углеводов на белок и овощи.`,
          severity: carbsPercent > 150 ? "high" : "medium"
        });
      }
    }

    // Анализ калорий
    if (goals.calories > 0) {
      const caloriesPercent = (averages.calories / goals.calories) * 100;
      if (caloriesPercent < 80) {
        const deficit = goals.calories - averages.calories;
        recommendations.push({
          type: "calories",
          message: `Недостаточно калорий — в среднем ${Math.round(averages.calories)} ккал вместо ${Math.round(goals.calories)} ккал`,
          suggestion: `Добавь еще один прием пищи или увеличь порции. Нужно еще примерно ${Math.round(deficit)} ккал в день.`,
          severity: caloriesPercent < 60 ? "high" : "medium"
        });
      } else if (caloriesPercent > 120) {
        recommendations.push({
          type: "calories",
          message: `Превышение калорий — в среднем ${Math.round(averages.calories)} ккал вместо ${Math.round(goals.calories)} ккал`,
          suggestion: `Попробуй уменьшить порции или заменить калорийные продукты на более легкие.`,
          severity: caloriesPercent > 140 ? "high" : "medium"
        });
      }
    }

    // Анализ воды
    if (goals.water > 0) {
      const waterPercent = (averages.water / goals.water) * 100;
      if (waterPercent < 70) {
        const deficit = goals.water - averages.water;
        recommendations.push({
          type: "water",
          message: `Мало воды — в среднем ${Math.round(averages.water)} мл вместо ${Math.round(goals.water)} мл`,
          suggestion: `Пей больше воды в течение дня. Нужно еще примерно ${Math.round(deficit)} мл.`,
          severity: waterPercent < 50 ? "high" : "medium"
        });
      }
    }

    return NextResponse.json({
      ok: true,
      recommendations: recommendations.sort((a, b) => {
        const severityOrder = { high: 3, medium: 2, low: 1 };
        return severityOrder[b.severity] - severityOrder[a.severity];
      })
    }, { headers: corsHeaders });

  } catch (error: any) {
    console.error("[/api/recommendations] Ошибка:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Внутренняя ошибка сервера" },
      { status: 500, headers: corsHeaders }
    );
  }
}
