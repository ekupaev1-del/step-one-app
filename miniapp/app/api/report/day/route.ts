import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getDailyWaterSummary } from "../../../../lib/waterService";

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

    // FIXED FOR SUPABASE: Получаем пользователя с id и telegram_id для универсального поиска
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id, telegram_id, calories, protein, fat, carbs, water_goal_ml")
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

    // FIXED FOR SUPABASE: Используем telegram_id если есть, иначе id (единая логика с iOS)
    const diaryUserId = user.telegram_id || user.id;

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

    // FIXED FOR SUPABASE: Ищем записи по ОБОИМ идентификаторам для совместимости
    let allMealsCombined: any[] = [];

    console.log("[/api/report/day] Запрос к БД:", {
      userId: user.id,
      telegramId: user.telegram_id,
      diaryUserId,
      date,
      startUTC: startUTCStr,
      endUTC: endUTCStr
    });

    // Сначала ищем по diaryUserId
    const { data: mealsByDiaryUserId, error: errorByDiaryUserId } = await supabase
      .from("diary")
      .select("*")
      .eq("user_id", diaryUserId)
      .gte("created_at", startUTCStr)
      .lte("created_at", endUTCStr)
      .order("created_at", { ascending: false });

    if (errorByDiaryUserId) {
      console.error("[/api/report/day] Ошибка поиска по diaryUserId:", errorByDiaryUserId);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/43e8883f-375d-4d43-af6f-fef79b5ebbe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'miniapp/api/report/day:133',message:'HYP-A: Error searching by diaryUserId',data:{diaryUserId,error:errorByDiaryUserId.message},timestamp:Date.now(),sessionId:'debug-sync',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
    } else if (mealsByDiaryUserId) {
      allMealsCombined.push(...mealsByDiaryUserId);
      console.log(`[/api/report/day] Найдено записей по diaryUserId=${diaryUserId}:`, mealsByDiaryUserId.length);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/43e8883f-375d-4d43-af6f-fef79b5ebbe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'miniapp/api/report/day:137',message:'HYP-A: Found meals by diaryUserId',data:{diaryUserId,count:mealsByDiaryUserId.length,mealIds:mealsByDiaryUserId.map(m=>m.id)},timestamp:Date.now(),sessionId:'debug-sync',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
    }

    // FIXED FOR SUPABASE: ВСЕГДА ищем по обоим ID для полной синхронизации
    // КРИТИЧНО: Если diaryUserId отличается от user.id, ищем также по user.id
    // Это гарантирует, что мы найдем все записи независимо от того, с каким user_id они были созданы
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/43e8883f-375d-4d43-af6f-fef79b5ebbe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'miniapp/api/report/day:141',message:'HYP-B: Checking fallback condition',data:{hasTelegramId:!!user.telegram_id,telegramId:user.telegram_id,userId:user.id,diaryUserId,willSearch:diaryUserId!==user.id},timestamp:Date.now(),sessionId:'debug-sync',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    if (diaryUserId !== user.id) {
      // Если diaryUserId отличается от user.id, ищем также по user.id (для записей iOS, созданных с user_id=id)
      console.log(`[/api/report/day] Дополнительный поиск по id=${user.id} (для записей iOS, созданных с user_id=id)`);
      const { data: mealsById, error: errorById } = await supabase
        .from("diary")
        .select("*")
        .eq("user_id", user.id)
        .gte("created_at", startUTCStr)
        .lte("created_at", endUTCStr)
        .order("created_at", { ascending: false });

      if (errorById) {
        console.error("[/api/report/day] Ошибка поиска по id:", errorById);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/43e8883f-375d-4d43-af6f-fef79b5ebbe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'miniapp/api/report/day:152',message:'HYP-B: Error in fallback search',data:{userId:user.id,error:errorById.message},timestamp:Date.now(),sessionId:'debug-sync',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
      } else if (mealsById) {
        allMealsCombined.push(...mealsById);
        console.log(`[/api/report/day] Найдено дополнительных записей по id=${user.id}:`, mealsById.length);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/43e8883f-375d-4d43-af6f-fef79b5ebbe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'miniapp/api/report/day:156',message:'HYP-B: Found meals in fallback search',data:{userId:user.id,count:mealsById.length,mealIds:mealsById.map(m=>m.id)},timestamp:Date.now(),sessionId:'debug-sync',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
      }
    }

    // Удаляем дубликаты по id записи
    const uniqueMealsMap = new Map();
    allMealsCombined.forEach(meal => {
      if (!uniqueMealsMap.has(meal.id)) {
        uniqueMealsMap.set(meal.id, meal);
      }
    });
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/43e8883f-375d-4d43-af6f-fef79b5ebbe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'miniapp/api/report/day:165',message:'HYP-D: After deduplication',data:{beforeDedup:allMealsCombined.length,afterDedup:uniqueMealsMap.size,date,startUTC:startUTCStr,endUTC:endUTCStr},timestamp:Date.now(),sessionId:'debug-sync',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion

    // КРИТИЧНО: Фильтруем записи по локальной дате после получения из БД
    // Это гарантирует, что мы покажем только записи за нужный день
    const meals = Array.from(uniqueMealsMap.values()).filter(meal => {
      const mealDate = new Date(meal.created_at);
      const mealDateStr = mealDate.toISOString().split("T")[0]; // YYYY-MM-DD
      return mealDateStr === date;
    }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()); // Новые сначала
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/43e8883f-375d-4d43-af6f-fef79b5ebbe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'miniapp/api/report/day:192',message:'HYP-C: Miniapp final result after date filter',data:{date,startUTC:startUTCStr,endUTC:endUTCStr,mealsCount:meals.length,mealCreatedAts:meals.map(m=>m.created_at)},timestamp:Date.now(),sessionId:'debug-sync',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion

    console.log("[/api/report/day] Итого получено уникальных записей (после объединения по обоим ID):", meals?.length || 0, {
      meals: meals?.map(m => ({ id: m.id, text: m.meal_text, created_at: m.created_at, user_id: m.user_id }))
    });

    // Вычисляем итоговые значения за день
    // Для новых пользователей meals может быть пустым массивом - это нормально
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

    // Получаем данные по воде за день
    const reportDate = new Date(date + "T12:00:00"); // Используем полдень для избежания проблем с таймзонами
    let waterData = { totalMl: 0, goalMl: null as number | null };
    try {
      waterData = await getDailyWaterSummary(numericId, reportDate);
    } catch (waterError: any) {
      console.error("[/api/report/day] Ошибка получения данных по воде:", waterError);
      // Продолжаем без воды, используем значения по умолчанию
    }

    // Подготавливаем данные для радиолокационной диаграммы
    // Всегда возвращаем валидные числа (0 если отсутствует)
    const radarData = {
      calories: totals.calories,
      caloriesGoal: user.calories || 0,
      protein: totals.protein,
      proteinGoal: user.protein || 0,
      fat: totals.fat,
      fatGoal: user.fat || 0,
      carbs: totals.carbs,
      carbsGoal: user.carbs || 0,
      water: waterData.totalMl,
      waterGoal: waterData.goalMl || 0
    };

    // Возвращаем готовый отчёт за день
    // Для новых пользователей возвращаем пустой отчёт, а не 404
    const report = {
      date,
      totals,
      dailyNorm,
      percentage: Math.round(percentage * 10) / 10,
      meals: meals || [],
      mealsCount: meals?.length || 0,
      // Новые поля для радиолокационной диаграммы
      radarData
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

