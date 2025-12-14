/**
 * Сервис для работы с калориями
 */

import { supabase } from "./supabase.js";

/**
 * Получает сводку по калориям за день
 * 
 * @param userId - ID пользователя (из таблицы users)
 * @param date - дата для получения сводки (по умолчанию сегодня)
 * @returns объект с totalCalories (сумма за день) и caloriesGoal (норма пользователя)
 */
export async function getDailyCaloriesSummary(
  userId: number,
  date: Date = new Date()
): Promise<{ totalCalories: number; caloriesGoal: number | null }> {
  // Начало и конец дня
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const startISO = startOfDay.toISOString();
  const endISO = endOfDay.toISOString();

  // Получаем telegram_id пользователя для поиска в таблице diary
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("telegram_id, calories")
    .eq("id", userId)
    .maybeSingle();

  if (userError) {
    console.error("[calories] Ошибка получения пользователя:", userError);
    // Не бросаем ошибку, просто возвращаем 0 и null
  }

  const telegramId = user?.telegram_id;
  if (!telegramId) {
    // Если нет telegram_id, возвращаем нули
    return {
      totalCalories: 0,
      caloriesGoal: user?.calories ? Number(user.calories) : null
    };
  }

  // Получаем сумму калорий за день из таблицы diary
  const { data: meals, error: mealsError } = await supabase
    .from("diary")
    .select("calories")
    .eq("user_id", telegramId)
    .gte("created_at", startISO)
    .lte("created_at", endISO);

  if (mealsError) {
    console.error("[calories] Ошибка получения приёмов пищи:", mealsError);
    // Не бросаем ошибку, просто возвращаем 0 для калорий
  }

  const totalCalories = (meals || []).reduce((sum, meal) => sum + Number(meal.calories || 0), 0);

  return {
    totalCalories,
    caloriesGoal: user?.calories ? Number(user.calories) : null
  };
}


















