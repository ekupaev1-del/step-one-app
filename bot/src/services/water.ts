/**
 * Сервис для работы с водой в боте
 */

import { supabase } from "./supabase.js";

/**
 * Проверяет, содержит ли текст упоминание воды
 * 
 * Триггерные фразы:
 * - "вода", "воды", "водой"
 * - "выпил", "выпила"
 * - "стакан", "бутылка"
 * - "water", "drink"
 * 
 * @param text - текст сообщения
 * @returns true если текст содержит упоминание воды
 */
export function isWaterRequest(text: string): boolean {
  const normalizedText = text.toLowerCase().trim();
  
  // Ключевые слова, указывающие на воду
  const waterKeywords = [
    'вода', 'воды', 'водой', 'воде',
    'выпил', 'выпила', 'выпито',
    'стакан', 'бутылка', 'бутылку',
    'water', 'drink', 'drank',
    '💧'
  ];
  
  // Проверяем, содержит ли текст любое из ключевых слов
  return waterKeywords.some(keyword => normalizedText.includes(keyword));
}

/**
 * Распознает текст о воде и извлекает количество
 * 
 * Паттерны:
 * - "вода 250"
 * - "выпил 300"
 * - "плюс 150 воды"
 * - "+200"
 * - "water 300"
 * - "выпил воды 400"
 * 
 * @param text - текст сообщения
 * @returns количество в мл или null если не распознано
 */
export function parseWaterAmount(text: string): number | null {
  const normalizedText = text.toLowerCase().trim();

  // Если это просто "вода" без числа - возвращаем null (будет обработано отдельно)
  if (isWaterRequest(normalizedText)) {
    return null;
  }

  // Ключевые слова для воды
  const waterKeywords = ['вода', 'воды', 'водой', 'выпил', 'выпила', 'выпито', 'water', 'плюс', '+'];

  // Проверяем наличие ключевых слов
  const hasWaterKeyword = waterKeywords.some(keyword => normalizedText.includes(keyword));

  if (!hasWaterKeyword) {
    // Проверяем, может быть это просто число (для случая "свой вариант")
    const numbers = normalizedText.match(/\d+/g);
    if (numbers && numbers.length > 0) {
      const amount = parseInt(numbers[0], 10);
      if (amount > 0 && amount < 5000) {
        return amount;
      }
    }
    return null;
  }

  // Извлекаем числа из текста
  // Ищем все числа в тексте
  const numbers = normalizedText.match(/\d+/g);

  if (!numbers || numbers.length === 0) {
    return null;
  }

  // Берем первое число
  const amount = parseInt(numbers[0], 10);

  // Валидация: от 1 до 4999 мл
  if (amount > 0 && amount < 5000) {
    return amount;
  }

  return null;
}

/**
 * Логирует потребление воды
 */
export async function logWaterIntake(
  userId: number,
  amountMl: number,
  source: 'telegram' | 'miniapp'
): Promise<void> {
  if (amountMl <= 0 || amountMl >= 5000) {
    throw new Error(`Некорректное количество воды: ${amountMl} мл`);
  }

  const { error } = await supabase
    .from("water_logs")
    .insert({
      user_id: userId,
      amount_ml: amountMl,
      logged_at: new Date().toISOString(),
      source
    });

  if (error) {
    console.error("[water] Ошибка логирования воды:", error);
    throw new Error(`Ошибка сохранения: ${error.message}`);
  }
}

/**
 * Получает сводку по воде за день
 */
export async function getDailyWaterSummary(
  userId: number,
  date: Date = new Date()
): Promise<{ totalMl: number; goalMl: number | null }> {
  // Начало и конец дня
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const startISO = startOfDay.toISOString();
  const endISO = endOfDay.toISOString();

  // Получаем сумму воды за день
  const { data: logs, error: logsError } = await supabase
    .from("water_logs")
    .select("amount_ml")
    .eq("user_id", userId)
    .gte("logged_at", startISO)
    .lte("logged_at", endISO);

  if (logsError) {
    console.error("[water] Ошибка получения логов воды:", logsError);
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
    console.error("[water] Ошибка получения пользователя:", userError);
  }

  return {
    totalMl,
    goalMl: user?.water_goal_ml || null
  };
}

