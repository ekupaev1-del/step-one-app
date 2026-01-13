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
    return NextResponse.json({ ok: false, error: "userId отсутствует" }, { status: 400 });
  }

  const numericId = Number(userId);
  if (!Number.isFinite(numericId)) {
    return NextResponse.json({ ok: false, error: "userId должен быть числом" }, { status: 400 });
  }

  // FIXED FOR SUPABASE: Получаем telegram_id и id из users для универсального поиска
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id, telegram_id")
    .eq("id", numericId)
    .maybeSingle();

  if (userError || !user) {
    return NextResponse.json({ ok: false, error: "Пользователь не найден" }, { status: 404 });
  }

  // FIXED FOR SUPABASE: Используем telegram_id если есть, иначе id (единая логика с iOS)
  const diaryUserId = user.telegram_id || user.id;

  // FIXED FOR SUPABASE: Ищем записи по ОБОИМ идентификаторам для совместимости
  let allMeals: any[] = [];

  // Сначала ищем по diaryUserId (telegram_id если есть, иначе id)
  const { data: mealsByDiaryUserId, error: errorByDiaryUserId } = await supabase
    .from("diary")
    .select("*")
    .eq("user_id", diaryUserId)
    .order("created_at", { ascending: false });

  if (errorByDiaryUserId) {
    console.error("[/api/meals] Ошибка поиска по diaryUserId:", errorByDiaryUserId);
  } else if (mealsByDiaryUserId) {
    allMeals.push(...mealsByDiaryUserId);
  }

  // FIXED FOR SUPABASE: ВСЕГДА ищем по обоим ID для полной синхронизации
  // КРИТИЧНО: Если diaryUserId отличается от user.id, ищем также по user.id
  // Это гарантирует, что мы найдем все записи независимо от того, с каким user_id они были созданы
  if (diaryUserId !== user.id) {
    console.log(`[/api/meals] Дополнительный поиск по id=${user.id} (для записей iOS, созданных с user_id=id)`);
    const { data: mealsById, error: errorById } = await supabase
      .from("diary")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (errorById) {
      console.error("[/api/meals] Ошибка поиска по id:", errorById);
    } else if (mealsById) {
      allMeals.push(...mealsById);
      console.log(`[/api/meals] Найдено дополнительных записей по id=${user.id}:`, mealsById.length);
    }
  }

  // Удаляем дубликаты по id записи
  const uniqueMealsMap = new Map();
  allMeals.forEach(meal => {
    if (!uniqueMealsMap.has(meal.id)) {
      uniqueMealsMap.set(meal.id, meal);
    }
  });

  const meals = Array.from(uniqueMealsMap.values())
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  console.log("[/api/meals] Итого получено уникальных записей:", meals.length, {
    diaryUserId,
    userId: user.id,
    telegramId: user.telegram_id
  });

  return NextResponse.json({ ok: true, meals: meals || [] });
}
