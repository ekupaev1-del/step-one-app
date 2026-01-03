/**
 * Сервис для отправки автоматических уведомлений о неактивности
 * Отправляет персонализированные сообщения пользователям, которые не записывали еду 48+ часов
 */

import { Telegraf } from "telegraf";
import { supabase } from "./supabase.js";

// Хранилище для отслеживания последней отправки уведомления каждому пользователю
// Формат: userId -> timestamp последней отправки
const lastNotificationSent = new Map<number, number>();

/**
 * Получает сообщение на основе цели пользователя
 */
function getInactivityMessage(goal: string | null): string {
  switch (goal) {
    case "lose":
      return "Ты на этапе снижения веса.\nУже 2 дня нет записей — без них сложно понять, все ли идет по плану.\nЖду еду от тебя сегодня.";
    
    case "maintain":
      return "Ты не записывал питание пару дней.\nДля поддержания формы важно держать ритм.\nОтправь прием пищи — продолжим.";
    
    case "gain":
      return "Чтобы набирать вес, важна регулярность.\nУже 2 дня не вижу твоей еды :(";
    
    default:
      // Fallback для пользователей без цели
      return "Уже 2 дня нет записей о питании.\nОтправь прием пищи, чтобы продолжить отслеживание.";
  }
}

/**
 * Проверяет, можно ли отправлять уведомление в текущее время
 * Не отправляем с 23:00 до 08:00 по UTC
 * Это примерно соответствует 02:00-11:00 МСК (UTC+3)
 */
function canSendNotificationNow(): boolean {
  const now = new Date();
  const hour = now.getUTCHours();
  
  // Не отправляем с 23:00 до 08:00 UTC (02:00-11:00 МСК)
  if (hour >= 23 || hour < 8) {
    return false;
  }
  
  return true;
}

/**
 * Проверяет пользователей на неактивность и отправляет уведомления
 */
export async function checkAndSendInactivityNotifications(bot: Telegraf): Promise<void> {
  try {
    console.log("[inactivityNotifications] Начинаю проверку неактивных пользователей...");
    
    // Проверяем время - не отправляем ночью
    if (!canSendNotificationNow()) {
      console.log("[inactivityNotifications] Пропускаем проверку: ночное время");
      return;
    }
    
    // Получаем всех активных пользователей с заполненной анкетой
    // (у которых есть goal, значит они прошли онбординг)
    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("id, telegram_id, goal")
      .not("goal", "is", null)
      .not("telegram_id", "is", null);
    
    if (usersError) {
      console.error("[inactivityNotifications] Ошибка получения пользователей:", usersError);
      return;
    }
    
    if (!users || users.length === 0) {
      console.log("[inactivityNotifications] Нет пользователей для проверки");
      return;
    }
    
    console.log(`[inactivityNotifications] Проверяю ${users.length} пользователей...`);
    
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000); // 48 часов назад
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 часа назад
    const todayStart = new Date(now);
    todayStart.setUTCHours(0, 0, 0, 0);
    
    let notificationsSent = 0;
    let notificationsSkipped = 0;
    
    for (const user of users) {
      try {
        const userId = user.id;
        const telegramId = user.telegram_id;
        const goal = user.goal;
        
        if (!telegramId) {
          continue;
        }
        
        // Проверяем, не отправляли ли мы уведомление в последние 24 часа
        const lastSent = lastNotificationSent.get(userId);
        if (lastSent && (now.getTime() - lastSent) < 24 * 60 * 60 * 1000) {
          console.log(`[inactivityNotifications] Пропускаем пользователя ${userId}: уведомление уже отправлялось в последние 24 часа`);
          notificationsSkipped++;
          continue;
        }
        
        // В таблице diary поле user_id хранит telegram_id, а не внутренний id из users
        // Проверяем, есть ли записи за последние 48 часов
        const { data: recentMeals, error: mealsError } = await supabase
          .from("diary")
          .select("id, created_at")
          .eq("user_id", telegramId)
          .gte("created_at", twoDaysAgo.toISOString())
          .order("created_at", { ascending: false })
          .limit(1);
        
        if (mealsError) {
          console.error(`[inactivityNotifications] Ошибка проверки записей для пользователя ${userId}:`, mealsError);
          continue;
        }
        
        // Если есть записи за последние 48 часов - пропускаем
        if (recentMeals && recentMeals.length > 0) {
          console.log(`[inactivityNotifications] Пропускаем пользователя ${userId}: есть записи за последние 48 часов`);
          notificationsSkipped++;
          continue;
        }
        
        // Проверяем, есть ли записи за сегодня (дополнительная проверка)
        const { data: todayMeals, error: todayError } = await supabase
          .from("diary")
          .select("id")
          .eq("user_id", telegramId)
          .gte("created_at", todayStart.toISOString())
          .limit(1);
        
        if (todayError) {
          console.error(`[inactivityNotifications] Ошибка проверки записей за сегодня для пользователя ${userId}:`, todayError);
          continue;
        }
        
        // Если есть записи за сегодня - пропускаем
        if (todayMeals && todayMeals.length > 0) {
          console.log(`[inactivityNotifications] Пропускаем пользователя ${userId}: есть записи за сегодня`);
          notificationsSkipped++;
          continue;
        }
        
        // Все проверки пройдены - отправляем уведомление
        const message = getInactivityMessage(goal);
        
        try {
          await bot.telegram.sendMessage(telegramId, message);
          console.log(`[inactivityNotifications] ✅ Отправлено уведомление пользователю ${userId} (telegram_id: ${telegramId}, goal: ${goal})`);
          
          // Сохраняем время отправки
          lastNotificationSent.set(userId, now.getTime());
          notificationsSent++;
        } catch (sendError: any) {
          // Игнорируем ошибки отправки (пользователь мог заблокировать бота или удалить чат)
          const errorCode = sendError?.response?.error_code;
          const errorDescription = sendError?.response?.description || '';
          
          if (errorCode === 403 || errorCode === 400) {
            // 403 = пользователь заблокировал бота
            // 400 с "chat not found" = чат не найден (пользователь удалил бота или чат)
            if (errorCode === 400 && errorDescription.includes('chat not found')) {
              console.warn(`[inactivityNotifications] Чат не найден для пользователя ${telegramId} (${userId}), пропускаем`);
            } else if (errorCode === 403) {
              console.warn(`[inactivityNotifications] Пользователь ${telegramId} (${userId}) заблокировал бота, пропускаем`);
            } else {
              console.warn(`[inactivityNotifications] Ошибка ${errorCode} при отправке пользователю ${telegramId} (${userId}): ${errorDescription}`);
            }
          } else {
            console.error(`[inactivityNotifications] Ошибка отправки уведомления пользователю ${telegramId} (${userId}):`, sendError);
          }
        }
      } catch (userError: any) {
        console.error(`[inactivityNotifications] Ошибка обработки пользователя ${user.id}:`, userError);
        continue;
      }
    }
    
    // Очищаем старые записи из кэша (старше 7 дней)
    const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
    for (const [userId, timestamp] of lastNotificationSent.entries()) {
      if (timestamp < sevenDaysAgo) {
        lastNotificationSent.delete(userId);
      }
    }
    
    console.log(`[inactivityNotifications] ✅ Проверка завершена: отправлено ${notificationsSent}, пропущено ${notificationsSkipped}`);
  } catch (error: any) {
    console.error("[inactivityNotifications] Критическая ошибка:", error);
  }
}

/**
 * Запускает scheduler для проверки неактивности
 * Проверяет пользователей раз в день (каждые 24 часа)
 */
export function startInactivityNotificationScheduler(bot: Telegraf): void {
  console.log("[inactivityNotifications] Запуск scheduler для уведомлений о неактивности...");
  
  // Запускаем первую проверку через 1 минуту после старта
  setTimeout(() => {
    checkAndSendInactivityNotifications(bot).catch(error => {
      console.error(`[inactivityNotifications] Ошибка в первой проверке:`, error);
    });
  }, 60000); // 1 минута
  
  // Затем проверяем каждые 24 часа (86400000 мс)
  setInterval(() => {
    checkAndSendInactivityNotifications(bot).catch(error => {
      console.error(`[inactivityNotifications] Критическая ошибка в scheduler:`, error);
    });
  }, 24 * 60 * 60 * 1000); // 24 часа
  
  console.log("[inactivityNotifications] ✅ Scheduler запущен, проверка каждые 24 часа");
}
