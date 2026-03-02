// Импорты
import { Telegraf } from "telegraf";
import { env } from "./config/env.js";
import { supabase } from "./services/supabase.js";
import { openai } from "./services/openai.js";
import { isWaterRequest, logWaterIntake, getDailyWaterSummary } from "./services/water.js";
import { createReminder, getUserReminders, deleteReminder, validateTime, type ReminderType } from "./services/reminders.js";
import { startReminderScheduler } from "./services/reminderScheduler.js";
import { startInactivityNotificationScheduler } from "./services/inactivityNotifications.js";
import { logEvent, logError, generateRequestId } from "./services/logging.js";
import { normalizeDiaryEntry, logPayloadDetails } from "./services/diaryNormalize.js";
import { logDBError, createUserFriendlyError } from "./lib/dbLogger.js";
import {
  analyzeSupabaseConnection,
  logConnectionDiagnostics,
  performSchemaHealthCheck,
  logSchemaHealthCheck,
  createHealthCheckErrorMessage,
} from "./lib/dbDiagnostics.js";
import { getSupabaseContext, logSupabaseContext } from "./lib/debugSupabaseContext.js";

// Инициализация бота
const bot = new Telegraf(env.telegramBotToken);

// Миниап URL
// ВАЖНО: Используем ТОЛЬКО production домен для стабильности
// Preview деплои создают разные домены каждый раз - это ломает web_app URLs
const MINIAPP_BASE_URL =
  process.env.MINIAPP_BASE_URL ||
  "https://step-one-app-emins-projects-4717eabc.vercel.app";

// ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
//      ЕДИНАЯ ФУНКЦИЯ ГЛАВНОГО МЕНЮ
// ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░

/**
 * ЕДИНСТВЕННАЯ функция для создания главного меню бота.
 * ВСЕГДА используйте эту функцию - никаких других способов создания меню!
 * 
 * @param userId - ID пользователя из таблицы users (обязателен для создания ссылок на Mini App)
 * @param telegramId - Telegram user ID (обязателен для fallback в Mini App)
 * @returns Объект reply_markup с клавиатурой
 */
function getMainMenuKeyboard(userId: number | null = null, telegramId: number | null = null): any {
  // CRITICAL: Always use stable production domain from MINIAPP_BASE_URL env var
  // Never use preview domains - they break Telegram web_app URLs
  const productionDomain = "https://step-one-app-emins-projects-4717eabc.vercel.app";
  const baseUrl = (MINIAPP_BASE_URL || productionDomain).trim().replace(/\/$/, '');
  
  // CRITICAL: Force production domain - ignore preview domains
  let finalBaseUrl = baseUrl;
  if (!baseUrl.includes("step-one-app-emins-projects-4717eabc.vercel.app")) {
    console.warn("[getMainMenuKeyboard] ⚠️ Non-production domain detected, using production:", baseUrl);
    finalBaseUrl = productionDomain;
  }
  
  // CRITICAL: Always include telegram_id in URLs for fallback in Mini App
  // Format: ?id=<userId>&telegram_id=<telegramId>
  const buildUrl = (path: string) => {
    if (!userId) return undefined;
    const params = new URLSearchParams({ id: String(userId) });
    if (telegramId) {
      params.set('telegram_id', String(telegramId));
    }
    return `${finalBaseUrl}${path}?${params.toString()}`;
  };
  
  const reportUrl = buildUrl('/report');
  const profileUrl = buildUrl('/profile');
  const subscriptionUrl = buildUrl('/subscription');
  
  const keyboard = {
    keyboard: [
      [
        { text: "👤 Личный кабинет", web_app: profileUrl ? { url: profileUrl } : undefined }
      ],
      [
        { text: "📊 Получить отчёт", web_app: reportUrl ? { url: reportUrl } : undefined }
      ],
      [
        { text: "💎 Подписка", web_app: subscriptionUrl ? { url: subscriptionUrl } : undefined }
      ],
      [
        { text: "⏰ Напомнить о приёме пищи" }
      ]
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  };

  // Log for debugging
  console.log("[getMainMenuKeyboard] userId:", userId);
  console.log("[getMainMenuKeyboard] finalBaseUrl (production):", finalBaseUrl);
  console.log("[getMainMenuKeyboard] reportUrl:", reportUrl);

  return keyboard;
}

/**
 * ЕДИНСТВЕННАЯ функция для отправки главного меню пользователю.
 * Используйте эту функцию везде, где нужно отправить главное меню.
 * 
 * @param ctx - Контекст Telegraf
 * @param userId - ID пользователя из таблицы users
 * @param message - Текст сообщения (опционально)
 * @param chatIdOverride - Переопределение chat_id (опционально)
 * @returns Promise<void>
 */
async function sendMainMenu(
  ctx: any,
  userId: number | null,
  message: string = "Выберите действие:",
  chatIdOverride?: number
): Promise<void> {
  try {
    const telegram_id = ctx.from?.id;
    const targetChatId = chatIdOverride ?? ctx.chat?.id ?? ctx.from?.id;
    
    if (!targetChatId) {
      console.error("[sendMainMenu] ❌ Нет chatId для отправки меню", {
        chatFromCtx: ctx.chat?.id,
        fromId: ctx.from?.id,
        chatIdOverride
      });
      throw new Error("chatId is missing for sendMainMenu");
    }
    
    const menu = getMainMenuKeyboard(userId, telegram_id);
    console.log("[sendMainMenu] Отправка меню для userId:", userId);
    console.log("[sendMainMenu] MINIAPP_BASE_URL:", MINIAPP_BASE_URL);
    console.log("[sendMainMenu] Chat ID:", targetChatId);
    
    await ctx.telegram.sendMessage(targetChatId, message, {
      reply_markup: {
        ...menu,
        replace_keyboard: true // Принудительно заменяем старое меню
      }
    });
    
    console.log("[sendMainMenu] ✅ Меню отправлено успешно");
  } catch (error: any) {
    console.error("[sendMainMenu] ❌ Ошибка отправки меню:", error);
    console.error("[sendMainMenu] Error details:", {
      message: error?.message,
      code: error?.response?.error_code,
      description: error?.response?.description
    });
    throw error; // Пробрасываем ошибку дальше
  }
}

// ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
//            /start
// ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░

bot.start(async (ctx) => {
  // Generate unique request ID for tracking this operation
  const requestId = `start-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const operationName = "createUserOnStart";
  
  // Log environment status (boolean only, no secrets)
  const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
  
  console.log(`[bot:${requestId}] Operation: ${operationName}`);
  console.log(`[bot:${requestId}] Environment: isProduction=${isProduction}`);
  
  // Run connection diagnostics with compact logging (using validated env)
  const supabaseContext = getSupabaseContext(
    env.supabaseUrl,
    env.supabaseServiceRoleKey,
    ['users', 'diary', 'water_logs', 'app_logs', 'reminders']
  );
  logSupabaseContext(supabaseContext);
  
  // Also run detailed diagnostics
  const connectionInfo = analyzeSupabaseConnection(
    env.supabaseUrl,
    env.supabaseServiceRoleKey
  );
  logConnectionDiagnostics(connectionInfo);
  
  // Run schema healthcheck before processing /start
  console.log(`[bot:${requestId}] Running schema healthcheck...`);
  const healthCheck = await performSchemaHealthCheck(supabase);
  logSchemaHealthCheck(healthCheck);
  
  if (!healthCheck.healthy) {
    const errorMessage = createHealthCheckErrorMessage(healthCheck);
    console.error(`[bot:${requestId}] Schema healthcheck failed:\n${errorMessage}`);
    // Log to app_logs if possible, but don't fail the request
    await logEvent('error', 'schema_healthcheck_failed', {
      requestId,
      telegramUserId: ctx.from?.id,
      errorMessage,
      payload: { healthCheck },
    }).catch(() => {
      // Ignore logging errors
    });
  }
  
  try {
    const telegram_id = ctx.from?.id;
    if (!telegram_id) {
      console.error(`[bot:${requestId}] /start: нет telegram_id`);
      return ctx.reply("Ошибка: не удалось определить ваш Telegram ID");
    }

    console.log(`[bot:${requestId}] /start вызван для telegram_id: ${telegram_id}`);

    // Проверяем, есть ли пользователь и заполнена ли анкета
    const { data: existingUser, error: selectError } = await supabase
      .from("users")
      .select("id, calories")
      .eq("telegram_id", telegram_id)
      .maybeSingle();

    if (selectError) {
      // Extract all possible Postgres error fields
      const dbErrorDetails = {
        message: selectError.message,
        code: selectError.code,
        details: selectError.details,
        hint: selectError.hint,
        constraint: (selectError as any).constraint,
        table: (selectError as any).table,
        column: (selectError as any).column,
        schema: (selectError as any).schema,
        internal: (selectError as any).internal,
        internalQuery: (selectError as any).internalQuery,
        internalPosition: (selectError as any).internalPosition,
        where: (selectError as any).where,
        file: (selectError as any).file,
        line: (selectError as any).line,
        routine: (selectError as any).routine,
        stack: selectError.stack,
      };

      // Extract project ref for diagnostics
      const projectRef = connectionInfo.projectRef;
      
      // Log with requestId for correlation
      console.error(`[bot:${requestId}] DB_ERROR [${dbErrorDetails.code}]:`, JSON.stringify({
        requestId,
        operation: 'users.select',
        telegramUserId: telegram_id,
        projectRef: projectRef || 'unknown',
        errorCode: dbErrorDetails.code,
        errorMessage: dbErrorDetails.message,
        errorDetails: dbErrorDetails.details,
        errorHint: dbErrorDetails.hint,
        constraint: dbErrorDetails.constraint,
        table: dbErrorDetails.table,
        column: dbErrorDetails.column,
      }));
      
      await logDBError({
        requestId,
        operation: 'select',
        table: 'users',
        telegramUserId: telegram_id,
      }, selectError);
      
      return ctx.reply(createUserFriendlyError(requestId, selectError?.code));
    }

    let userId: number;
    const isQuestionnaireFilled = existingUser && existingUser.calories;

    if (existingUser) {
      userId = existingUser.id;
      console.log(`[bot:${requestId}] Пользователь найден, id: ${userId}, анкета заполнена: ${isQuestionnaireFilled}`);
    } else {
      // Создаём новую запись ТОЛЬКО с telegram_id
      // Форма потом обновит остальные поля через /api/save
      console.log(`[bot:${requestId}] Создание новой записи для telegram_id: ${telegram_id}`);
      const { data: upserted, error: upsertError } = await supabase
        .from("users")
        .upsert({ telegram_id }, { onConflict: "telegram_id", ignoreDuplicates: false })
        .select("id")
        .single();

      if (upsertError) {
        console.error(`[bot:${requestId}] Ошибка upsert:`, upsertError);
        await logDBError({
          requestId,
          operation: 'upsert',
          table: 'users',
          telegramUserId: telegram_id,
        }, upsertError);
        return ctx.reply(createUserFriendlyError(requestId, upsertError?.code));
      }

      if (!upserted?.id) {
        console.error(`[bot:${requestId}] Upsert вернул пустой результат`);
        return ctx.reply("Ошибка: не удалось получить ID пользователя");
      }

      userId = upserted.id;
      console.log(`[bot:${requestId}] Создана новая запись, id: ${userId}`);
    }

    // Если анкета не заполнена - показываем приветствие (только новая анкета)
    if (!isQuestionnaireFilled) {
      const urlParams = new URLSearchParams();
      urlParams.set('id', String(userId));
      urlParams.set('telegram_id', String(telegram_id));
      const url = `${MINIAPP_BASE_URL}/registration?${urlParams.toString()}`;
      console.log(`[bot:${requestId}] Показываю приветствие для нового пользователя`);
      // Используем оптимизированную версию для быстрой отправки
      const welcomeImageUrl = `${MINIAPP_BASE_URL}/images/welcome-optimized.png`;
      
      // Текст с форматированием (HTML) - точно как на скрине 2
      const welcomeText = `💪 <b>Добро пожаловать в Step One.</b>
Самое тяжелое вы уже сделали - первый шаг

<u>Я помогу вам настроить питание, чтобы чувствовать себя лучше и легче.</u>

Чтобы мне определить, как вам правильно питаться,
ответьте на пару вопросов↓`;

      
      // Кнопка под постом (inline) как в требуемом макете
      const registrationInlineKeyboard = {
        inline_keyboard: [
          [
            {
              text: "📝 Заполнить анкету",
              web_app: { url }
            }
          ]
        ]
      };

      // Пробуем отправить картинку через URL (быстрее для оптимизированных файлов)
      try {
        console.log(`[bot:${requestId}] Отправка картинки через URL...`);
        await ctx.replyWithPhoto(welcomeImageUrl, {
          caption: welcomeText,
          parse_mode: "HTML",
          reply_markup: registrationInlineKeyboard
        });
        console.log(`[bot:${requestId}] ✅ Картинка отправлена через URL`);
        return;
      } catch (urlError) {
        // Если URL не работает, загружаем и отправляем как файл
        console.log(`[bot:${requestId}] URL не сработал, загружаем как файл...`);
        try {
          const imageResponse = await fetch(welcomeImageUrl);
          if (!imageResponse.ok) {
            throw new Error(`HTTP ${imageResponse.status}: ${imageResponse.statusText}`);
          }
          const imageBuffer = await imageResponse.arrayBuffer();
          await ctx.replyWithPhoto({ source: Buffer.from(imageBuffer) }, {
            caption: welcomeText,
            parse_mode: "HTML",
            reply_markup: registrationInlineKeyboard
          });
          console.log(`[bot:${requestId}] ✅ Картинка отправлена как файл`);
          return;
        } catch (fileError) {
          console.error(`[bot:${requestId}] Ошибка отправки картинки:`, fileError);
          // Fallback: отправляем только текст с кнопкой
          await ctx.reply(welcomeText, {
            parse_mode: "HTML",
            reply_markup: registrationInlineKeyboard
          });
          return;
        }
      }
    }

    // Если анкета заполнена - показываем меню
    console.log(`[bot:${requestId}] /start: пользователь существует, анкета заполнена, отправка меню`);
    console.log(`[bot:${requestId}] User ID: ${userId}, Telegram ID: ${telegram_id}`);
    
    // Используем sendMainMenu для единообразной отправки меню
    await sendMainMenu(ctx, userId, "Выберите действие:");
  } catch (error: any) {
    console.error(`[bot] Ошибка в /start:`, error);
    await ctx.reply("Произошла ошибка. Попробуйте позже.");
  }
});

// ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
//      Обработка данных из WebApp
// ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░

async function handleQuestionnaireSaved(
  ctx: any,
  rawData: string,
  source: "message" | "callback_query"
) {
  const requestId = `webapp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  console.log(`[bot:${requestId}] ========== ПОЛУЧЕНЫ ДАННЫЕ ИЗ WEBAPP (source=${source}) ==========`);
  console.log(`[bot:${requestId}] Raw payload:`, rawData);

  const telegram_id = ctx.from?.id || (ctx.callbackQuery as any)?.from?.id;
  const chat_id =
    ctx.chat?.id ||
    (ctx.callbackQuery as any)?.message?.chat?.id ||
    telegram_id;
  
  console.log(`[bot:${requestId}] Resolved telegram_id:`, telegram_id);
  console.log(`[bot:${requestId}] Resolved chat_id:`, chat_id);
  
  if (!telegram_id) {
    console.log(`[bot:${requestId}] ❌ Нет telegram_id, пропускаем обработку questionnaire_saved`);
    return;
  }
  if (!rawData) {
    console.log(`[bot:${requestId}] ❌ Нет данных в web_app_data, пропускаем`);
    return;
  }
  
  // Parse payload robustly: handle both JSON and plain string "onboarding_saved"
  let parsedData: any;
  if (rawData === "onboarding_saved" || rawData.trim() === "onboarding_saved") {
    // Plain string case
    parsedData = { type: "onboarding_saved" };
    console.log(`[bot:${requestId}] Received plain string "onboarding_saved"`);
  } else {
    try {
      parsedData = JSON.parse(rawData);
      console.log(`[bot:${requestId}] Parsed payload:`, JSON.stringify(parsedData, null, 2));
    } catch (e) {
      console.error(`[bot:${requestId}] ❌ Ошибка парсинга данных из WebApp:`, e);
      // Log error but don't crash
      try {
        await logEvent('error', 'web_app_data_parse_error', {
          requestId,
          telegramUserId: telegram_id,
          rawDataLength: rawData.length,
          error: (e as Error).message,
        });
      } catch (logErr) {
        // Ignore logging errors
      }
      return;
    }
  }

  // Support both "type" and "action" fields for compatibility
  // Required: type: "onboarding_saved" OR legacy types for backward compatibility
  const eventType = parsedData.type || parsedData.action;
  if (eventType !== "onboarding_saved" && eventType !== "onboarding_complete" && eventType !== "questionnaire_saved" && eventType !== "profile_saved") {
    console.log(`[bot:${requestId}] Неизвестное действие/тип:`, eventType);
    return;
  }

  console.log(`[bot:${requestId}] ========== ОБРАБОТКА ONBOARDING_SAVED ==========`);
  console.log(`[bot:${requestId}] Event type:`, eventType);
  console.log(`[bot:${requestId}] Telegram ID:`, telegram_id);
  console.log(`[bot:${requestId}] Chat ID:`, chat_id);

  // Extract telegram_id from payload (supports both telegram_id and telegram_user_id for compatibility)
  const telegramUserIdFromPayload = parsedData.telegram_id || parsedData.telegram_user_id;
  const telegramUserIdToUse = telegramUserIdFromPayload && Number.isFinite(Number(telegramUserIdFromPayload)) && Number(telegramUserIdFromPayload) > 0
    ? Number(telegramUserIdFromPayload)
    : telegram_id;

  if (telegramUserIdToUse && Number.isFinite(telegramUserIdToUse) && telegramUserIdToUse > 0) {
    try {
      const { data: upserted, error: upsertError } = await supabase
        .from("users")
        .upsert({ telegram_id: telegramUserIdToUse }, { onConflict: "telegram_id", ignoreDuplicates: false })
        .select("id")
        .single();

      if (upsertError) {
        console.error(`[bot:${requestId}] Ошибка upsert пользователя:`, upsertError);
      } else if (upserted) {
        console.log(`[bot:${requestId}] ✅ Пользователь upserted: id=${upserted.id}, telegram_id=${telegramUserIdToUse}`);
      }
    } catch (upsertErr: any) {
      console.error(`[bot:${requestId}] Исключение при upsert пользователя:`, upsertErr);
    }
  }

  // ВАЖНО: Получаем СВЕЖИЕ данные пользователя из БД после сохранения анкеты
  // Получаем пользователя с повторными попытками для гарантии актуальных данных
  let user = null;
  const retryDelays = [300, 800, 1500]; // Delays in ms for retries
  const maxAttempts = retryDelays.length + 1; // 4 total attempts

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("id, calories")
      .eq("telegram_id", telegramUserIdToUse)
      .maybeSingle();

    if (userError) {
      console.error(`[bot:${requestId}] Ошибка получения пользователя (попытка ${attempt + 1}):`, userError);
    }

    if (userData && userData.id) {
      user = userData;
      console.log(`[bot:${requestId}] ✅ User exists in DB: id=${user.id}, telegram_id=${telegramUserIdToUse}`);
      break;
    }
    
    if (attempt < maxAttempts - 1) {
      const delay = retryDelays[attempt] || 300;
      console.log(`[bot:${requestId}] User not found, retry ${attempt + 1}/${maxAttempts} in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  const userIdFromPayload = parsedData.user_id || parsedData.userId;
  const userIdToUse = user?.id || (Number.isFinite(Number(userIdFromPayload)) ? Number(userIdFromPayload) : null);

  console.log(`[bot:${requestId}] 📤 Sending confirmation and menu`);
  console.log(`[bot:${requestId}] User found:`, user ? `id=${user.id}` : "NOT FOUND");
  console.log(`[bot:${requestId}] User ID to use:`, userIdToUse);
  console.log(`[bot:${requestId}] Chat ID:`, chat_id);
  console.log(`[bot:${requestId}] Telegram ID:`, telegram_id);

  // ШАГ 1: Отправляем главное меню
  const targetChatId = chat_id || telegram_id;
  
  // If user doesn't exist, send friendly fallback message but keep bot alive
  if (!user) {
    console.warn(`[bot:${requestId}] ⚠️ User not found in DB after onboarding_saved (after ${maxAttempts} attempts), sending fallback message`);
    try {
      await ctx.telegram.sendMessage(targetChatId, "Данные ещё сохраняются, нажмите /start");
      // Log to app_logs
      try {
        await logEvent('error', 'onboarding_saved_user_not_found', {
          requestId,
          telegramUserId: telegramUserIdToUse,
          chatId: targetChatId,
        });
      } catch (logErr) {
        // Ignore logging errors
      }
    } catch (err: any) {
      console.error(`[bot:${requestId}] ❌ Ошибка отправки сообщения об ошибке:`, err);
    }
    return;
  }
  
  try {
    // ШАГ 1: Отправляем главное меню (без отдельного подтверждения, как было раньше)
    await sendMainMenu(ctx, userIdToUse, "Выберите действие:", targetChatId);
    console.log(`[bot:${requestId}] MAIN_MENU_SENT`, { userId: userIdToUse, telegram_id: telegramUserIdToUse, chat_id: targetChatId, timestamp: new Date().toISOString() });
    console.log(`[bot:${requestId}] ✅ Меню отправлено через sendMainMenu`);
    
    // Log to app_logs
    try {
      await logEvent('info', 'onboarding_saved_menu_sent', {
        requestId,
        telegramUserId: telegramUserIdToUse,
        userId: userIdToUse,
        chatId: targetChatId,
        message: "onboarding_saved -> sent main menu",
      });
    } catch (logErr) {
      // Ignore logging errors
    }
  } catch (menuError: any) {
    // Если пользователь заблокировал бота - просто логируем
    if (menuError?.response?.error_code === 403 && menuError?.response?.description?.includes("blocked")) {
      console.warn(`[bot:${requestId}] Пользователь ${telegram_id} заблокировал бота, пропускаем отправку меню`);
      return;
    }
    
    console.error(`[bot:${requestId}] ❌ Ошибка отправки меню:`, menuError);
    console.error(`[bot:${requestId}] Error details:`, {
      message: menuError?.message,
      code: menuError?.response?.error_code,
      description: menuError?.response?.description
    });
    
    // Fallback: пытаемся отправить простое сообщение
    try {
      await ctx.telegram.sendMessage(targetChatId, "Выберите действие:");
      console.log(`[bot:${requestId}] ✅ Fallback: сообщение отправлено без меню`);
    } catch (fallbackError: any) {
      console.error(`[bot:${requestId}] ❌ Ошибка отправки fallback сообщения:`, fallbackError);
    }
  }
}

// Обработка данных из WebApp (когда пользователь отправляет данные через sendData)
bot.on("message", async (ctx, next) => {
  // Проверяем, есть ли данные из WebApp
  const data = (ctx.message as any)?.web_app_data?.data;

  if (!data) {
    // Для всех остальных сообщений передаем управление дальше
    return next();
  }

  await handleQuestionnaireSaved(ctx, data, "message");
  // Если это web_app_data, не передаем дальше
  return;
});

// Дополнительный обработчик для случая, когда Telegram присылает web_app_data в callback_query
bot.on("callback_query", async (ctx, next) => {
  const callbackWebAppData = (ctx.callbackQuery as any)?.web_app_data?.data;
  if (!callbackWebAppData) {
    return next();
  }

  await handleQuestionnaireSaved(ctx, callbackWebAppData, "callback_query");
  return;
});

// Глобальная обработка ошибок (включая "bot was blocked by the user")
bot.catch((err, ctx) => {
  const error = err as any;
  if (error?.response?.error_code === 403 && error?.response?.description?.includes("blocked")) {
    console.warn(`[bot] Пользователь ${ctx.from?.id} заблокировал бота, пропускаем обработку`);
    return;
  }
  console.error("[bot] Необработанная ошибка:", err);
});

// Корректное завершение
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

// Запуск бота
console.log("🚀 Запуск бота...");
bot.launch().then(() => {
  console.log("✅ Бот запущен успешно");
}).catch((error) => {
  console.error("❌ Ошибка запуска бота:", error);
  process.exit(1);
});
