/**
 * Scheduler для отправки напоминаний
 */

import { Telegraf } from "telegraf";
import { getRemindersForTime } from "./reminders.js";
import { getDailyWaterSummary } from "./water.js";
import { getDailyCaloriesSummary } from "./calories.js";

// Хранилище для отслеживания отправленных напоминаний (чтобы избежать дубликатов)
// Формат: `${userId}_${reminderId}_${HH:MM}` -> timestamp последней отправки
const sentReminders = new Map<string, number>();

/**
 * Отправляет напоминания для указанного времени
 */
export async function sendRemindersForTime(bot: Telegraf, time: string): Promise<void> {
  try {
    const reminders = await getRemindersForTime(time);
    
    if (reminders.length === 0) {
      return;
    }

    console.log(`[scheduler] Найдено ${reminders.length} напоминаний на ${time}`);

    for (const reminder of reminders) {
      const reminderKey = `${reminder.user_id}_${reminder.id}_${time}`;
      const now = Date.now();
      
      // Проверяем, не отправляли ли мы это напоминание в последнюю минуту
      const lastSent = sentReminders.get(reminderKey);
      if (lastSent && (now - lastSent) < 60000) {
        console.log(`[scheduler] Пропускаем дубликат для reminder ${reminder.id}`);
        continue;
      }

      // Получаем telegram_id пользователя
      const telegramId = (reminder as any).telegram_id;
      if (!telegramId) {
        console.error(`[scheduler] Не найден telegram_id для user_id ${reminder.user_id}`);
        continue;
      }

      try {
        if (reminder.type === 'food') {
          // Напоминание о еде - получаем статистику за сегодня
          try {
            const { totalCalories, caloriesGoal } = await getDailyCaloriesSummary(reminder.user_id);
            
            let message: string;
            if (caloriesGoal) {
              message = `Напоминаю: внесите приём пищи 🍽\n\nСегодня вы уже съели ${totalCalories} из ${caloriesGoal} ккал`;
            } else {
              message = `Напоминаю: внесите приём пищи 🍽\n\nСегодня вы уже съели ${totalCalories} ккал`;
            }
            
            await bot.telegram.sendMessage(telegramId, message);
            console.log(`[scheduler] ✅ Отправлено напоминание о еде пользователю ${telegramId}`);
          } catch (caloriesError: any) {
            // Если не удалось получить статистику по калориям, отправляем простое сообщение
            console.error(`[scheduler] Ошибка получения статистики по калориям для user ${reminder.user_id}:`, caloriesError);
            await bot.telegram.sendMessage(
              telegramId,
              "Напоминаю: внесите приём пищи в дневник 🍽"
            );
            console.log(`[scheduler] ✅ Отправлено простое напоминание о еде пользователю ${telegramId}`);
          }
        } else if (reminder.type === 'water') {
          // Напоминание о воде - получаем статистику за сегодня
          try {
            const { totalMl, goalMl } = await getDailyWaterSummary(reminder.user_id);
            
            let message: string;
            if (goalMl) {
              message = `Не забудьте попить воды 💧 Сегодня вы выпили ${totalMl} / ${goalMl} мл`;
            } else {
              message = `Не забудьте попить воды 💧 Сегодня вы уже выпили ${totalMl} мл`;
            }
            
            await bot.telegram.sendMessage(telegramId, message);
            console.log(`[scheduler] ✅ Отправлено напоминание о воде пользователю ${telegramId}`);
          } catch (waterError: any) {
            // Если не удалось получить статистику по воде, отправляем простое сообщение
            console.error(`[scheduler] Ошибка получения статистики по воде для user ${reminder.user_id}:`, waterError);
            await bot.telegram.sendMessage(
              telegramId,
              "Не забудьте попить воды 💧"
            );
            console.log(`[scheduler] ✅ Отправлено простое напоминание о воде пользователю ${telegramId}`);
          }
        }

        // Сохраняем время отправки
        sentReminders.set(reminderKey, now);
        
        // Очищаем старые записи (старше 1 часа)
        for (const [key, timestamp] of sentReminders.entries()) {
          if (now - timestamp > 3600000) {
            sentReminders.delete(key);
          }
        }
      } catch (sendError: any) {
        // Игнорируем ошибки отправки (пользователь мог заблокировать бота)
        if (sendError?.response?.error_code === 403) {
          console.warn(`[scheduler] Пользователь ${telegramId} заблокировал бота, пропускаем`);
        } else {
          console.error(`[scheduler] Ошибка отправки напоминания пользователю ${telegramId}:`, sendError);
        }
      }
    }
  } catch (error: any) {
    console.error(`[scheduler] Ошибка обработки напоминаний для времени ${time}:`, error);
  }
}

/**
 * Запускает scheduler для проверки напоминаний каждую минуту
 */
export function startReminderScheduler(bot: Telegraf): void {
  console.log("[scheduler] Запуск scheduler для напоминаний...");
  
  // Проверяем напоминания каждую минуту
  setInterval(() => {
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    sendRemindersForTime(bot, time).catch(error => {
      console.error(`[scheduler] Критическая ошибка в scheduler:`, error);
    });
  }, 60000); // Каждую минуту (60000 мс)
  
  console.log("[scheduler] ✅ Scheduler запущен, проверка каждую минуту");
}

