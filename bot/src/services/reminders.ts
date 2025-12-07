/**
 * Сервис для работы с напоминаниями
 */

import { supabase } from "./supabase.js";

export type ReminderType = 'food' | 'water';

export interface Reminder {
  id: number;
  user_id: number;
  type: ReminderType;
  time: string; // HH:MM format
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Создает новое напоминание
 */
export async function createReminder(
  userId: number,
  type: ReminderType,
  time: string
): Promise<Reminder> {
  // Валидация формата времени
  const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
  if (!timeRegex.test(time)) {
    throw new Error(`Некорректный формат времени: ${time}. Используйте формат ЧЧ:ММ (например, 08:30)`);
  }

  const { data, error } = await supabase
    .from("reminders")
    .insert({
      user_id: userId,
      type,
      time,
      is_active: true
    })
    .select()
    .single();

  if (error) {
    console.error("[reminders] Ошибка создания напоминания:", error);
    throw new Error(`Ошибка создания напоминания: ${error.message}`);
  }

  return data;
}

/**
 * Получает все напоминания пользователя
 */
export async function getUserReminders(userId: number): Promise<Reminder[]> {
  const { data, error } = await supabase
    .from("reminders")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("time", { ascending: true });

  if (error) {
    console.error("[reminders] Ошибка получения напоминаний:", error);
    throw new Error(`Ошибка получения напоминаний: ${error.message}`);
  }

  return data || [];
}

/**
 * Удаляет напоминание (помечает как неактивное)
 */
export async function deleteReminder(reminderId: number, userId: number): Promise<void> {
  const { error } = await supabase
    .from("reminders")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", reminderId)
    .eq("user_id", userId);

  if (error) {
    console.error("[reminders] Ошибка удаления напоминания:", error);
    throw new Error(`Ошибка удаления напоминания: ${error.message}`);
  }
}

/**
 * Получает все активные напоминания для указанного времени
 * Возвращает напоминания с информацией о пользователе
 */
export async function getRemindersForTime(time: string): Promise<(Reminder & { telegram_id: number })[]> {
  // Сначала получаем все активные напоминания на это время
  const { data: reminders, error: remindersError } = await supabase
    .from("reminders")
    .select("*")
    .eq("time", time)
    .eq("is_active", true);

  if (remindersError) {
    console.error("[reminders] Ошибка получения напоминаний по времени:", remindersError);
    throw new Error(`Ошибка получения напоминаний: ${remindersError.message}`);
  }

  if (!reminders || reminders.length === 0) {
    return [];
  }

  // Получаем telegram_id для каждого пользователя
  const userIds = [...new Set(reminders.map(r => r.user_id))];
  const { data: users, error: usersError } = await supabase
    .from("users")
    .select("id, telegram_id")
    .in("id", userIds);

  if (usersError) {
    console.error("[reminders] Ошибка получения пользователей:", usersError);
    throw new Error(`Ошибка получения пользователей: ${usersError.message}`);
  }

  // Создаем мапу user_id -> telegram_id
  const userMap = new Map((users || []).map(u => [u.id, u.telegram_id]));

  // Объединяем напоминания с telegram_id
  return reminders
    .map(reminder => {
      const telegramId = userMap.get(reminder.user_id);
      if (!telegramId) {
        return null;
      }
      return {
        ...reminder,
        telegram_id: telegramId
      };
    })
    .filter((r): r is Reminder & { telegram_id: number } => r !== null);
}

/**
 * Валидирует формат времени HH:MM
 */
export function validateTime(time: string): boolean {
  const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
  return timeRegex.test(time);
}

