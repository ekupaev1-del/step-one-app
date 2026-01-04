/**
 * Сервис для работы с водой в базе данных
 */

import { createClient } from "@supabase/supabase-js";

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is required. Please configure it in Vercel environment variables.");
  }

  if (!supabaseKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required. Please configure it in Vercel environment variables.");
  }

  return createClient(supabaseUrl, supabaseKey);
}

/**
 * Логирует потребление воды
 * 
 * @param userId - ID пользователя (из таблицы users)
 * @param amountMl - количество воды в миллилитрах
 * @param source - источник записи: 'telegram' или 'miniapp'
 */
export async function logWaterIntake(
  userId: number,
  amountMl: number,
  source: 'telegram' | 'miniapp'
): Promise<void> {
  // Валидация
  if (amountMl <= 0 || amountMl >= 5000) {
    throw new Error(`Некорректное количество воды: ${amountMl} мл. Должно быть от 1 до 4999 мл.`);
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("water_logs")
    .insert({
      user_id: userId,
      amount_ml: amountMl,
      logged_at: new Date().toISOString(),
      source
    });

  if (error) {
    console.error("[waterService] Ошибка логирования воды:", error);
    throw new Error(`Ошибка сохранения: ${error.message}`);
  }
}

/**
 * Получает сводку по воде за день
 * 
 * @param userId - ID пользователя
 * @param date - дата для получения сводки (по умолчанию сегодня)
 * @returns объект с totalMl (сумма за день) и goalMl (норма пользователя)
 */
export async function getDailyWaterSummary(
  userId: number,
  date: Date = new Date()
): Promise<{ totalMl: number; goalMl: number | null }> {
  // Начало и конец дня в UTC
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const startISO = startOfDay.toISOString();
  const endISO = endOfDay.toISOString();

  // Получаем сумму воды за день
  const supabase = getSupabaseClient();
  const { data: logs, error: logsError } = await supabase
    .from("water_logs")
    .select("amount_ml")
    .eq("user_id", userId)
    .gte("logged_at", startISO)
    .lte("logged_at", endISO);

  if (logsError) {
    console.error("[waterService] Ошибка получения логов воды:", logsError);
    throw new Error(`Ошибка получения данных: ${logsError.message}`);
  }

  const totalMl = (logs || []).reduce((sum, log) => sum + (log.amount_ml || 0), 0);

  // Получаем норму пользователя
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("water_goal_ml")
    .eq("id", userId)
    .maybeSingle();

  if (userError) {
    console.error("[waterService] Ошибка получения пользователя:", userError);
    // Не бросаем ошибку, просто возвращаем null для goalMl
  }

  return {
    totalMl,
    goalMl: user?.water_goal_ml || null
  };
}

