// Импорты
import { Telegraf } from "telegraf";
import { Readable } from "stream";
import { env } from "./config/env.js";
import { supabase } from "./services/supabase.js";
import { openai } from "./services/openai.js";
import { isWaterRequest, logWaterIntake, getDailyWaterSummary } from "./services/water.js";
import { createReminder, getUserReminders, deleteReminder, validateTime, type ReminderType } from "./services/reminders.js";
import { startReminderScheduler } from "./services/reminderScheduler.js";
import { startInactivityNotificationScheduler } from "./services/inactivityNotifications.js";

// Инициализация бота
const bot = new Telegraf(env.telegramBotToken);

// Миниап URL
// ВАЖНО: Используем ТОЛЬКО production домен для стабильности
// Preview деплои создают разные домены каждый раз - это ломает web_app URLs
const MINIAPP_BASE_URL =
  process.env.MINIAPP_BASE_URL ||
  "https://step-one-gr745cr7n-emins-projects-4717eabc.vercel.app";

// ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
//      ЕДИНАЯ ФУНКЦИЯ ГЛАВНОГО МЕНЮ
// ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░

/**
 * Возвращает единое главное меню бота с 4 кнопками.
 * Это ЕДИНСТВЕННЫЙ источник истины для главного меню.
 * ВСЕГДА используйте эту функцию для создания главного меню.
 * 
 * @param userId - ID пользователя из таблицы users (для создания ссылок на Mini App)
 * @returns Объект reply_markup с клавиатурой
 */
/**
 * ЕДИНСТВЕННАЯ функция для создания главного меню бота.
 * ВСЕГДА используйте эту функцию - никаких других способов создания меню!
 * 
 * @param userId - ID пользователя из таблицы users (обязателен для создания ссылок на Mini App)
 * @returns Объект reply_markup с клавиатурой
 */
function getMainMenuKeyboard(userId: number | null = null): any {
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
  
  // CRITICAL: Use finalBaseUrl (always production domain)
  // URLs must be correct: /profile, /report (not /reports!)
  const reportUrl = userId ? `${finalBaseUrl}/report?id=${userId}` : undefined;
  const profileUrl = userId ? `${finalBaseUrl}/profile?id=${userId}` : undefined;

  // ЕДИНСТВЕННОЕ правильное меню - 5 кнопок с правильными URL
  // Кнопки с web_app открывают Mini App напрямую
  const subscriptionUrl = userId ? `${finalBaseUrl}/subscription?id=${userId}` : undefined;
  
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
      ],
      [
        { text: "💬 Служба заботы" }
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
 * @returns Promise<void>
 */
async function sendMainMenu(
  ctx: any,
  userId: number | null,
  message?: string,
  chatIdOverride?: number
): Promise<void> {
  try {
    const targetChatId = chatIdOverride ?? ctx.chat?.id ?? ctx.from?.id;
    if (!targetChatId) {
      console.error("[sendMainMenu] ❌ Нет chatId для отправки меню", {
        chatFromCtx: ctx.chat?.id,
        fromId: ctx.from?.id,
        chatIdOverride
      });
      throw new Error("chatId is missing for sendMainMenu");
    }

    const menu = getMainMenuKeyboard(userId);
    const menuText = message || "Выберите действие:";
    
    const baseUrl = (MINIAPP_BASE_URL || "https://step-one-app-emins-projects-4717eabc.vercel.app").trim().replace(/\/$/, '');
    const profileUrl = userId ? `${baseUrl}/profile?id=${userId}` : undefined;
    const reportUrl = userId ? `${baseUrl}/report?id=${userId}` : undefined;
    
    console.log("[sendMainMenu] ========== MINI APP URL DEBUG ==========");
    console.log("[sendMainMenu] MINIAPP_BASE_URL from env:", MINIAPP_BASE_URL);
    console.log("[sendMainMenu] Final baseUrl:", baseUrl);
    console.log("[sendMainMenu] Profile URL:", profileUrl);
    console.log("[sendMainMenu] Report URL:", reportUrl);
    console.log("[sendMainMenu] Expected production domain: step-one-app-emins-projects-4717eabc.vercel.app");
    console.log("[sendMainMenu] URL matches production:", baseUrl.includes("step-one-app-emins-projects-4717eabc.vercel.app"));
    console.log("[sendMainMenu] ========================================");
    
    console.log("[sendMainMenu] Отправка меню для userId:", userId);
    console.log("[sendMainMenu] Chat ID:", targetChatId);
    
    await ctx.telegram.sendMessage(
      targetChatId,
      menuText,
      {
        reply_markup: {
          ...menu,
          replace_keyboard: true // Принудительно заменяем старое меню
        }
      }
    );
    
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

// ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
//            /start
// ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░

bot.start(async (ctx) => {
  // Generate unique request ID for tracking this operation
  const requestId = `start-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const operationName = "createUserOnStart";
  
  // Log environment status (boolean only, no secrets)
  const hasSupabaseUrl = !!process.env.SUPABASE_URL;
  const hasSupabaseKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
  
  console.log(`[bot:${requestId}] Operation: ${operationName}`);
  console.log(`[bot:${requestId}] Environment: isProduction=${isProduction}, hasSupabaseUrl=${hasSupabaseUrl}, hasSupabaseKey=${hasSupabaseKey}`);
  
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
      
      // DB failure snapshot for debugging (no secrets)
      const dbFailureSnapshot = {
        requestId,
        operation: operationName,
        telegramUserId: telegram_id,
        userId: undefined,
        env: process.env.NODE_ENV || "unknown",
        vercelEnv: process.env.VERCEL_ENV || "unknown",
        hasDbUrl: hasSupabaseUrl,
        hasDbKey: hasSupabaseKey,
        isProduction,
        payloadKeys: ["telegram_id"],
      };
      
      console.error(`[bot:${requestId}] Ошибка проверки пользователя (select):`, {
        operation: operationName,
        telegram_id,
        dbError: dbErrorDetails,
        payloadKeys: ["telegram_id"], // Sanitized payload keys
      });
      
      // Separate log entry for DB failure snapshot
      console.error(`[bot:${requestId}] DB_FAILURE_SNAPSHOT:`, JSON.stringify(dbFailureSnapshot, null, 2));
      
      return ctx.reply(`Ошибка базы данных. Попробуйте позже. Код: ${requestId}`);
    }

    let userId;
    const isQuestionnaireFilled = existingUser && existingUser.calories;

    if (existingUser) {
      userId = existingUser.id;
      console.log(`[bot:${requestId}] Пользователь найден, id: ${userId}, анкета заполнена: ${isQuestionnaireFilled}`);
    } else {
      // Создаём новую запись ТОЛЬКО с telegram_id
      // Форма потом обновит остальные поля через /api/save
      console.log(`[bot:${requestId}] Создание новой записи для telegram_id: ${telegram_id}`);
      console.log(`[bot:${requestId}] Insert payload keys: ["telegram_id"]`); // Sanitized payload keys
      
      // Ensure telegram_id is a number (telegram IDs are always numeric)
      const upsertPayload: { telegram_id: number } = { telegram_id: Number(telegram_id) };
      
      // Validate telegram_id is a valid number
      if (!Number.isFinite(upsertPayload.telegram_id) || upsertPayload.telegram_id <= 0) {
        console.error(`[bot:${requestId}] Invalid telegram_id: ${telegram_id}`);
        return ctx.reply(`Ошибка: некорректный Telegram ID. Код: ${requestId}`);
      }
      
      try {
        // Idempotent upsert: ON CONFLICT DO UPDATE (or nothing if ignoreDuplicates: false)
        // This ensures user is created or updated if exists
        const { data: upserted, error: upsertError } = await supabase
          .from("users")
          .upsert(upsertPayload, { onConflict: "telegram_id", ignoreDuplicates: false })
          .select("id")
          .single();

        if (upsertError) {
          // Extract all possible Postgres error fields
          const dbErrorDetails = {
            message: upsertError.message,
            code: upsertError.code,
            detail: upsertError.details,
            hint: upsertError.hint,
            constraint: (upsertError as any).constraint,
            table: (upsertError as any).table,
            column: (upsertError as any).column,
          };
          
          // Create structured error log entry
          const errorLogEntry = {
            code: requestId,
            route: "/start",
            requestId,
            telegram: {
              chatId: ctx.chat?.id,
              userId: telegram_id,
            },
            db: dbErrorDetails,
            payloadKeys: Object.keys(upsertPayload),
            payloadPreview: Object.keys(upsertPayload).reduce((acc, key) => {
              const value = (upsertPayload as any)[key];
              // Only log non-sensitive preview values
              if (typeof value === "number") {
                acc[key] = value;
              } else if (typeof value === "string") {
                acc[key] = `string(${value.length})`;
              }
              return acc;
            }, {} as Record<string, any>),
            timestamp: new Date().toISOString(),
            operation: operationName,
          };
          
          // Log as single structured JSON line for easy parsing
          console.error(`[bot:${requestId}] ERROR:`, JSON.stringify(errorLogEntry));
          
          return ctx.reply(`Ошибка создания записи в базе. Попробуйте позже. Код: ${requestId}`);
        }

        if (!upserted?.id) {
          console.error(`[bot:${requestId}] Upsert вернул пустой результат`);
          return ctx.reply(`Ошибка: не удалось получить ID пользователя. Код: ${requestId}`);
        }

        userId = upserted.id;
        console.log(`[bot:${requestId}] Создана новая запись, id: ${userId}`);
      } catch (error: any) {
        // Catch any unexpected errors during DB insert
        const errorDetails = {
          message: error?.message || "Unknown error",
          code: error?.code,
          stack: error?.stack,
        };
        console.error(`[bot:${requestId}] Неожиданная ошибка при upsert (createUserOnStart):`, {
          operation: operationName,
          telegram_id,
          payloadKeys: Object.keys(upsertPayload),
          error: errorDetails,
        });
        return ctx.reply(`Ошибка создания записи в базе. Попробуйте позже. Код: ${requestId}`);
      }
    }

    // Если анкета не заполнена - показываем приветствие (только новая анкета)
    if (!isQuestionnaireFilled) {
      const url = `${MINIAPP_BASE_URL}/registration?id=${userId}`;
      console.log(`[bot] Показываю приветствие для нового пользователя`);
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
        console.log("[bot] Отправка картинки через URL...");
        await ctx.replyWithPhoto(
          welcomeImageUrl,
          {
            caption: welcomeText,
            parse_mode: "HTML",
            reply_markup: registrationInlineKeyboard
          }
        );
        console.log("[bot] ✅ Картинка отправлена через URL");
        return;
      } catch (urlError: any) {
        // Если URL не работает, загружаем и отправляем как файл
        console.log("[bot] URL не сработал, загружаем как файл...");
        try {
          const imageResponse = await fetch(welcomeImageUrl);
          if (!imageResponse.ok) {
            throw new Error(`HTTP ${imageResponse.status}: ${imageResponse.statusText}`);
          }
          const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
          
          const sizeKB = (imageBuffer.length / 1024).toFixed(0);
          console.log("[bot] Картинка загружена, размер:", sizeKB, "КБ");
          
          await ctx.telegram.sendPhoto(
            ctx.chat!.id,
            { source: imageBuffer, filename: "welcome.png" },
            {
              caption: welcomeText,
              parse_mode: "HTML",
              reply_markup: registrationInlineKeyboard
            }
          );
          console.log("[bot] ✅ Картинка отправлена как файл");
          return;
        } catch (fileError: any) {
          console.error("[bot] ❌ Ошибка отправки картинки:", fileError?.message || fileError);
        }
        
        // Если картинка не загружена, отправляем сообщение без картинки
        try {
          await ctx.reply(
            welcomeText,
            {
              parse_mode: "HTML",
              reply_markup: registrationInlineKeyboard
            }
          );
        } catch (replyError: any) {
          console.error("[bot] Ошибка отправки сообщения без картинки:", replyError);
          // Последняя попытка - без форматирования
          const fallbackText = "💪 Добро пожаловать в Step One.\n\nСамое тяжелое вы уже сделали - первый шаг\n\nЯ помогу вам настроить питание, чтобы чувствовать себя лучше и легче.\n\nЧтобы мне определить, как вам правильно питаться,\nответьте на пару вопросов↓";
          
          
          await ctx.reply(
            fallbackText,
            {
              reply_markup: registrationInlineKeyboard
            }
          );
        }
      }
      return;
    }

    // Если анкета заполнена - показываем меню
    console.log("[bot] /start: отправка меню для пользователя с id:", userId);
    
    // Используем getMainMenuKeyboard для получения меню
    const menu = getMainMenuKeyboard(userId);
    const welcomeMessage = "Выберите действие:";
    
    // Отправляем меню
    await ctx.reply(welcomeMessage, {
      reply_markup: {
        ...menu,
        replace_keyboard: true
      }
    });

    console.log(`[bot] /start успешно завершён для id: ${userId}`);
  } catch (err: any) {
    console.error("[bot] Критическая ошибка /start:", err);
    
    // Если пользователь заблокировал бота - просто логируем, не пытаемся отправить сообщение
    if (err?.response?.error_code === 403 && err?.response?.description?.includes("blocked")) {
      console.warn(`[bot] Пользователь ${ctx.from?.id} заблокировал бота, пропускаем отправку сообщения`);
      return;
    }
    
    // Для других ошибок пытаемся отправить сообщение
    try {
      await ctx.reply("Произошла ошибка, попробуйте позже.");
    } catch (replyErr: any) {
      // Если и это не получилось (например, пользователь заблокирован) - просто логируем
      if (replyErr?.response?.error_code === 403) {
        console.warn(`[bot] Не удалось отправить сообщение об ошибке - пользователь заблокирован`);
      } else {
        console.error("[bot] Ошибка отправки сообщения об ошибке:", replyErr);
      }
    }
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
  console.log(`[bot] ========== ПОЛУЧЕНЫ ДАННЫЕ ИЗ WEBAPP (source=${source}) ==========`);

  const telegram_id = ctx.from?.id || (ctx.callbackQuery as any)?.from?.id;
  const chat_id =
    ctx.chat?.id ||
    (ctx.callbackQuery as any)?.message?.chat?.id ||
    telegram_id;
  if (!telegram_id) {
    console.log("[bot] ❌ Нет telegram_id, пропускаем обработку questionnaire_saved");
    return;
  }
  if (!rawData) {
    console.log("[bot] ❌ Нет данных в web_app_data, пропускаем");
    return;
  }
  
  let parsedData: any;
  try {
    parsedData = JSON.parse(rawData);
    console.log("[bot] Распарсенные данные:", JSON.stringify(parsedData, null, 2));
  } catch (e) {
    console.error("[bot] ❌ Ошибка парсинга данных из WebApp:", e);
    return;
  }

  if (parsedData.action !== "questionnaire_saved") {
    console.log("[bot] Неизвестное действие:", parsedData.action);
    return;
  }

  console.log("[bot] ========== ОБРАБОТКА QUESTIONNAIRE_SAVED ==========");
  console.log("[bot] Обработка questionnaire_saved для telegram_id:", telegram_id);
  console.log("[bot] Chat ID для отправки:", chat_id);

  // ВАЖНО: Получаем СВЕЖИЕ данные пользователя из БД после сохранения анкеты
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Получаем пользователя с повторными попытками для гарантии актуальных данных
  let user = null;
  let attempts = 0;
  const maxAttempts = 3;

  while (!user && attempts < maxAttempts) {
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("id, calories")
      .eq("telegram_id", telegram_id)
      .maybeSingle();

    if (userError) {
      console.error(`[bot] Ошибка получения пользователя (попытка ${attempts + 1}):`, userError);
    }

    if (userData && userData.id) {
      user = userData;
      console.log(`[bot] ✅ Пользователь найден: id=${user.id}`);
      break;
    }
    
    attempts++;
    if (attempts < maxAttempts) {
      console.log(`[bot] Пользователь не найден, повторная попытка ${attempts + 1}/${maxAttempts}...`);
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  const userIdFromPayload = parsedData.userId ? Number(parsedData.userId) : null;
  const userIdToUse = user?.id || (Number.isFinite(userIdFromPayload) ? userIdFromPayload : null);

  console.log("[bot] 📤 Отправка подтверждения и меню после регистрации");
  console.log("[bot] User found:", user ? `id=${user.id}` : "NOT FOUND");
  console.log("[bot] Chat ID:", chat_id);
  console.log("[bot] Telegram ID:", telegram_id);

  const confirmationMessage = "Спасибо! Мы сохранили твои данные.";
  const targetChatId = chat_id || telegram_id;

  // ШАГ 1: Отправляем подтверждение
  let confirmationSent = false;
  try {
    await ctx.telegram.sendMessage(targetChatId, confirmationMessage);
    confirmationSent = true;
    console.log("[bot] ✅ Подтверждение отправлено через sendMessage");
  } catch (confirmError: any) {
    // Если пользователь заблокировал бота - просто логируем
    if (confirmError?.response?.error_code === 403 && confirmError?.response?.description?.includes("blocked")) {
      console.warn(`[bot] Пользователь ${telegram_id} заблокировал бота, пропускаем отправку подтверждения`);
      return; // Выходим из функции, не пытаемся отправлять меню
    }
    
    console.error("[bot] ❌ Ошибка отправки подтверждения:", confirmError);
    console.error("[bot] Error details:", {
      message: confirmError?.message,
      code: confirmError?.response?.error_code,
      description: confirmError?.response?.description
    });
  }
  
  // Небольшая задержка между сообщениями
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Финальная проверка
  if (!confirmationSent) {
    console.error("[bot] ❌ КРИТИЧЕСКАЯ ОШИБКА: Не удалось отправить подтверждение!");
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

  try {
    await ctx.answerCbQuery();
  } catch (err) {
    console.error("[bot] Ошибка answerCbQuery для web_app_data:", err);
  }
});

// ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
//            /help
// ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░

bot.command("help", async (ctx) => {
  const helpText = `📋 Доступные команды:

/start - Начать работу с ботом и пройти анкету

📝 Добавление еды:
• Отправьте текстовое сообщение с описанием еды
• Отправьте фото еды
• Отправьте голосовое сообщение с описанием еды

📊 Управление:
/отменить - Удалить последнее блюдо за сегодня
/отчет - Показать полный отчёт за сегодня

Примеры:
• "куриная грудка 200г с рисом"
• "яблоко и банан"
• "салат цезарь"

Бот автоматически определит калории и Б/Ж/У! 🎯`;

  await ctx.reply(helpText);
});

bot.command("помощь", async (ctx) => {
  const helpText = `📋 Доступные команды:

/start - Начать работу с ботом и пройти анкету

📝 Добавление еды:
• Отправьте текстовое сообщение с описанием еды
• Отправьте фото еды
• Отправьте голосовое сообщение с описанием еды

📊 Управление:
/отменить - Удалить последнее блюдо за сегодня
/отчет - Показать полный отчёт за сегодня

Примеры:
• "куриная грудка 200г с рисом"
• "яблоко и банан"
• "салат цезарь"

Бот автоматически определит калории и Б/Ж/У! 🎯`;

  await ctx.reply(helpText);
});

// ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
//      Вспомогательные функции
// ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░

interface MealAnalysis {
  description: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

interface NotFoodResponse {
  isNotFood: true;
  message: string;
}

// Общий системный промпт для всех типов анализа еды
const FOOD_ANALYSIS_SYSTEM_PROMPT = `You are a professional nutritionist with real-world experience.
Your task is to estimate calories and macros as realistically as possible,
based on typical household portions and common eating habits.

Rules:
- Never assume minimal or ideal portions.
- If weight is not provided, use realistic average portions.
- Think like a human nutritionist, not a calculator.
- Use plates, bowls, pieces, spoons as portion references.
- Do not hallucinate exact precision.
- If information is incomplete, make reasonable assumptions and say so.

Portion Reference Guide:
- Plate (main dish): 300–400 g
- Bowl (porridge/soup): 250–350 g
- Tablespoon: ~15 g
- Teaspoon: ~5 g
- Piece of meat/fish: 100–150 g cooked
- Handful (nuts): 25–30 g

Always estimate:
- total weight in grams
- calories (kcal)
- proteins (g)
- fats (g)
- carbohydrates (g)

If the dish is vague (e.g. 'plate of buckwheat with meat'),
estimate a realistic average portion. Use rounded realistic values.
Always state that estimates are approximate if exact weight is unknown.`;

async function analyzeFoodWithOpenAI(userInput: string): Promise<MealAnalysis | NotFoodResponse | null> {
  try {
    console.log(`[OpenAI] Начинаю анализ: "${userInput}"`);
    
    const prompt = `Проанализируй текст пользователя и определи:

1. Говорит ли пользователь про ЕДУ? (блюда, продукты питания, напитки)
2. Если НЕТ — о чем идет речь?

ВАЖНО ДЛЯ ОЦЕНКИ ПОРЦИЙ:
- "тарелка" = стандартная тарелка ~300-400 г еды
- "обычная порция" = средняя порция взрослого человека
- "немного", "чуть-чуть" = все равно используй реалистичные средние порции
- Если вес не указан, оценивай на основе типичных домашних порций
- Гречка (вареная): ~180-220 г на тарелку
- Мясо: ~100-150 г приготовленного
- Если тип мяса не указан, используй среднюю жирность

Примеры реалистичных оценок:
- "тарелка гречки с мясом" = гречка 200г (220 ккал, 7г белка, 1г жира, 44г углеводов) + мясо 120г (250 ккал, 25г белка, 15г жира, 0г углеводов) = ИТОГО: 470 ккал, 32г белка, 16г жира, 44г углеводов
- "омлет из 2 яиц" = 2 яйца (140 ккал, 12г белка, 10г жира, 1г углеводов) + масло для жарки 5г (45 ккал, 0г белка, 5г жира, 0г углеводов) = ИТОГО: 185 ккал, 12г белка, 15г жира, 1г углеводов

Верни ТОЛЬКО JSON в одном из двух форматов:

Если пользователь описал ЕДУ:
{
  "isFood": true,
  "description": "краткое название блюда на русском",
  "calories": число (ккал, округленное),
  "protein": число (граммы, округленное до 0.1),
  "fat": число (граммы, округленное до 0.1),
  "carbs": число (граммы, округленное до 0.1)
}

Если пользователь НЕ описал еду:
{
  "isFood": false,
  "whatIsIt": "о чем говорит пользователь (например: котик, погода, работа)",
  "message": "дружелюбное сообщение на русском с эмодзи, объясняющее что это не про еду (например: 'это не про еду, это про котика 😺' или 'это не про еду, это про погоду 🌤️')"
}

Текст от пользователя: "${userInput}"

ВАЖНО: 
- Если текст не про еду, верни isFood: false с описанием и дружелюбным сообщением.
- Если это еда — оцени РЕАЛИСТИЧНОЕ количество на основе типичных порций и определи калорийность и макроэлементы.
- Не занижай порции! Используй средние реалистичные значения.`;

    console.log("[OpenAI] Отправляю запрос к OpenAI (модель: gpt-4o)...");
    let response;
    try {
      response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: FOOD_ANALYSIS_SYSTEM_PROMPT + "\n\nAlways return valid JSON without additional text."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.3
      });
    } catch (modelError: any) {
      // Если gpt-4o недоступна, пробуем gpt-4o-mini
      if (modelError?.code === "model_not_found" || modelError?.message?.includes("gpt-4o")) {
        console.log("[OpenAI] gpt-4o недоступна, пробую gpt-4o-mini...");
        response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "Ты — помощник по анализу питания. Всегда возвращай валидный JSON без дополнительного текста."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          response_format: { type: "json_object" },
          temperature: 0.3
        });
      } else {
        throw modelError;
      }
    }

    console.log("[OpenAI] Получен ответ от OpenAI");
    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.error("[OpenAI] Пустой ответ от OpenAI");
      return null;
    }

    console.log(`[OpenAI] Содержимое ответа: ${content.substring(0, 200)}...`);
    
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (parseError) {
      console.error("[OpenAI] Ошибка парсинга JSON:", parseError);
      console.error("[OpenAI] Сырой ответ:", content);
      return null;
    }

    // Проверяем, про еду ли идет речь
    if (parsed.isFood === false) {
      console.log(`[OpenAI] Текст не про еду: ${parsed.whatIsIt}`);
      return {
        isNotFood: true,
        message: parsed.message || `Это не про еду, это про ${parsed.whatIsIt || "что-то другое"} 😊`
      };
    }

    const result = {
      description: parsed.description || userInput,
      calories: Number(parsed.calories) || 0,
      protein: Number(parsed.protein) || 0,
      fat: Number(parsed.fat) || 0,
      carbs: Number(parsed.carbs) || 0
    };

    console.log(`[OpenAI] Успешно проанализировано:`, result);
    return result;
  } catch (error: any) {
    console.error("[OpenAI] Ошибка анализа:", error);
    if (error?.message) {
      console.error("[OpenAI] Детали ошибки:", error.message);
    }
    if (error?.response) {
      console.error("[OpenAI] Ответ API:", error.response);
    }
    return null;
  }
}

async function getUserDailyNorm(telegram_id: number): Promise<{
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
} | null> {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("calories, protein, fat, carbs")
      .eq("telegram_id", telegram_id)
      .maybeSingle();

    if (error) {
      console.error("[getUserDailyNorm] Ошибка:", error);
      return null;
    }

    if (!data || !data.calories) {
      return null;
    }

    return {
      calories: Number(data.calories) || 0,
      protein: Number(data.protein) || 0,
      fat: Number(data.fat) || 0,
      carbs: Number(data.carbs) || 0
    };
  } catch (error) {
    console.error("[getUserDailyNorm] Исключение:", error);
    return null;
  }
}

async function getTodayMeals(telegram_id: number): Promise<{
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);
    const todayISO = today.toISOString();
    const endOfDayISO = endOfDay.toISOString();

    // FIXED FOR SUPABASE: Получаем пользователя с id и telegram_id для универсального поиска
    const { data: user } = await supabase
      .from("users")
      .select("id, telegram_id")
      .eq("telegram_id", telegram_id)
      .maybeSingle();

    // FIXED FOR SUPABASE: Ищем записи по ОБОИМ идентификаторам для полной синхронизации
    // Используем telegram_id (он всегда есть, так как ищем по нему), но также ищем по id для совместимости
    const diaryUserId = telegram_id; // В боте всегда используем telegram_id
    
    let allMeals: any[] = [];
    let error: any = null;

    // Сначала ищем по diaryUserId (telegram_id если есть, иначе id)
    const { data: dataByDiaryUserId, error: errorByDiaryUserId } = await supabase
      .from("diary")
      .select("calories, protein, fat, carbs")
      .eq("user_id", diaryUserId)
      .gte("created_at", todayISO)
      .lte("created_at", endOfDayISO);

    if (errorByDiaryUserId) {
      console.error(`[getTodayMeals] Ошибка поиска по diaryUserId=${diaryUserId}:`, errorByDiaryUserId);
      error = errorByDiaryUserId;
    } else if (dataByDiaryUserId) {
      allMeals.push(...dataByDiaryUserId);
      console.log(`[getTodayMeals] Найдено ${dataByDiaryUserId.length} записей по diaryUserId=${diaryUserId}`);
    }

    // FIXED FOR SUPABASE: ВСЕГДА ищем по обоим ID для полной синхронизации
    // Если у пользователя есть telegram_id, ищем также по id (для записей, созданных iOS до регистрации в боте)
    // ВАЖНО: Проверяем наличие user.id, так как user может быть null
    if (user?.id && user.telegram_id && user.telegram_id !== user.id) {
      console.log(`[getTodayMeals] Дополнительный поиск по id=${user.id} (для записей iOS)`);
      const { data: dataById, error: errorById } = await supabase
        .from("diary")
        .select("calories, protein, fat, carbs")
        .eq("user_id", user.id)
        .gte("created_at", todayISO)
        .lte("created_at", endOfDayISO);
      
      if (errorById) {
        console.error(`[getTodayMeals] Ошибка поиска по id=${user.id}:`, errorById);
      } else if (dataById) {
        allMeals.push(...dataById);
        console.log(`[getTodayMeals] Найдено дополнительных ${dataById.length} записей по id=${user.id}`);
      }
    }

    // Объединяем результаты (дубликаты не критичны для суммирования, но можно убрать)
    const data = allMeals;

    if (error) {
      console.error("[getTodayMeals] Ошибка:", error);
      return { calories: 0, protein: 0, fat: 0, carbs: 0 };
    }

    const totals: { calories: number; protein: number; fat: number; carbs: number } = (data || []).reduce<{ calories: number; protein: number; fat: number; carbs: number }>(
      (acc, meal) => ({
        calories: acc.calories + Number(meal.calories || 0),
        protein: acc.protein + Number(meal.protein || 0),
        fat: acc.fat + Number(meal.fat || 0),
        carbs: acc.carbs + Number(meal.carbs || 0)
      }),
      { calories: 0, protein: 0, fat: 0, carbs: 0 }
    );

    return totals;
  } catch (error) {
    console.error("[getTodayMeals] Исключение:", error);
    return { calories: 0, protein: 0, fat: 0, carbs: 0 };
  }
}

function formatProgressMessage(
  eaten: { calories: number; protein: number; fat: number; carbs: number },
  norm: { calories: number; protein: number; fat: number; carbs: number } | null,
  waterInfo?: { totalMl: number; goalMl: number | null }
): string {
  let message = "";
  
  if (!norm) {
    message = `Вы уже съели сегодня:\n🔥 ${eaten.calories} ккал\n🥚 ${eaten.protein.toFixed(1)} г белков\n🥑 ${eaten.fat.toFixed(1)} г жиров\n🍚 ${eaten.carbs.toFixed(1)} г углеводов\n\n⚠️ Пройдите анкету, чтобы увидеть дневную норму.`;
  } else {
    const remaining = {
      calories: Math.max(0, norm.calories - eaten.calories),
      protein: Math.max(0, norm.protein - eaten.protein),
      fat: Math.max(0, norm.fat - eaten.fat),
      carbs: Math.max(0, norm.carbs - eaten.carbs)
    };

    message = `Вы уже съели сегодня:\n🔥 ${eaten.calories} / ${norm.calories} ккал (осталось: ${remaining.calories})\n🥚 ${eaten.protein.toFixed(1)} / ${norm.protein.toFixed(1)} г белков (осталось: ${remaining.protein.toFixed(1)})\n🥑 ${eaten.fat.toFixed(1)} / ${norm.fat.toFixed(1)} г жиров (осталось: ${remaining.fat.toFixed(1)})\n🍚 ${eaten.carbs.toFixed(1)} / ${norm.carbs.toFixed(1)} г углеводов (осталось: ${remaining.carbs.toFixed(1)})`;
  }

  // Добавляем информацию о воде, если она передана
  if (waterInfo) {
    if (waterInfo.goalMl) {
      const percentage = Math.round((waterInfo.totalMl / waterInfo.goalMl) * 100);
      message += `\n💧 ${waterInfo.totalMl} / ${waterInfo.goalMl} мл (${percentage}%)`;
    } else {
      message += `\n💧 ${waterInfo.totalMl} мл`;
    }
  }

  return message;
}


async function getWaterProgressByTelegram(telegramId: number): Promise<{ totalMl: number; goalMl: number | null } | null> {
  try {
    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("telegram_id", telegramId)
      .maybeSingle();

    if (!user?.id) return null;

    const { totalMl, goalMl } = await getDailyWaterSummary(user.id);
    return { totalMl, goalMl };
  } catch (e) {
    console.error("[getWaterProgressByTelegram] error", e);
    return null;
  }
}

// ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
//      Обработка текстовых сообщений
// ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░

// Хранилище для отслеживания пользователей, ожидающих ввода воды
const waitingForWaterInput = new Set<number>();

// Хранилище для отслеживания пользователей, ожидающих ввода времени для напоминаний
const waitingForReminderTime = new Map<number, { type: ReminderType }>();

bot.on("text", async (ctx) => {
  try {
    const telegram_id = ctx.from?.id;
    if (!telegram_id) {
      return ctx.reply("Ошибка: не удалось определить ваш Telegram ID");
    }

    const text = ctx.message.text.trim();

    // Игнорируем команды
    if (text.startsWith("/")) {
      return;
    }

    // Обработка воды (ПЕРЕД анализом еды через OpenAI)
    // ВАЖНО: При любом упоминании воды показываем кнопки, НЕ создаем запись еды
    
    if (isWaterRequest(text)) {
      console.log(`[bot] Обнаружено упоминание воды в тексте: "${text}" от ${telegram_id}`);
      
      // Показываем кнопки с вариантами
      return ctx.reply(
        "💧 Сколько вы выпили воды?",
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: "250 мл", callback_data: "water_250" },
                { text: "300 мл", callback_data: "water_300" }
              ],
              [
                { text: "500 мл", callback_data: "water_500" }
              ],
              [
                { text: "Ввести своё количество", callback_data: "water_custom" }
              ]
            ]
          }
        }
      );
    }

    // Проверяем, ожидает ли пользователь ввода воды (выбрал "свой вариант")
    if (waitingForWaterInput.has(telegram_id)) {
      waitingForWaterInput.delete(telegram_id);
      
      // Пытаемся извлечь число из текста
      const numbers = text.match(/\d+/g);
      if (!numbers || numbers.length === 0) {
        return ctx.reply("❌ Не понял количество. Напишите число в миллилитрах (например: 250, 300, 500)");
      }

      const amount = parseInt(numbers[0], 10);
      if (isNaN(amount) || amount <= 0 || amount >= 5000) {
        return ctx.reply("❌ Количество должно быть от 1 до 4999 мл");
      }

      // Получаем userId
      const { data: user, error: userError } = await supabase
        .from("users")
        .select("id")
        .eq("telegram_id", telegram_id)
        .maybeSingle();

      if (userError || !user) {
        console.error("[bot] Ошибка получения пользователя для воды:", userError);
        return ctx.reply("❌ Ошибка: пользователь не найден. Используйте /start для регистрации.");
      }

      try {
        // Логируем воду
        await logWaterIntake(user.id, amount, 'telegram');

        // Получаем сводку по воде за день
        const { totalMl, goalMl } = await getDailyWaterSummary(user.id);

        // Получаем статистику по еде за сегодня
        const todayMeals = await getTodayMeals(telegram_id);
        const dailyNorm = await getUserDailyNorm(telegram_id);

        // Формируем ответ с общим отчетом
        const waterInfo = await getWaterProgressByTelegram(telegram_id);
    const response = `✅ Добавлено:\nвода\n🔥 0 ккал | 🥚 0.0г | 🥑 0.0г | 🍚 0.0г\n\n${formatProgressMessage(todayMeals, dailyNorm, { totalMl, goalMl })}`;

        return ctx.reply(response);
      } catch (error: any) {
        console.error("[bot] Ошибка логирования воды:", error);
        return ctx.reply(`❌ ${error.message || "Ошибка сохранения"}`);
      }
    }

    // УДАЛЕНО: Старая логика parseWaterAmount больше не используется
    // Теперь при любом упоминании воды показываются кнопки

    // Кнопки "📋 Получить отчет" и "👤 Личный кабинет" теперь напрямую открывают Mini App через web_app в keyboard button
    // Обработчики текста не нужны, так как кнопки не отправляют текст при нажатии - они напрямую открывают Mini App


    if (text === "❌ Удалить последний прием пищи") {
      // Используем существующую логику команды /отменить
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayISO = today.toISOString();

      const { data: lastMeal, error: selectError } = await supabase
        .from("diary")
        .select("id, meal_text, calories")
        .eq("user_id", telegram_id)
        .gte("created_at", todayISO)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (selectError) {
        console.error("[bot] Ошибка поиска:", selectError);
        return ctx.reply("❌ Ошибка базы данных.");
      }

      if (!lastMeal) {
        return ctx.reply("❌ Сегодня ещё не было добавлено ни одного приёма пищи.");
      }

      const { error: deleteError } = await supabase
        .from("diary")
        .delete()
        .eq("id", lastMeal.id);

      if (deleteError) {
        console.error("[bot] Ошибка удаления:", deleteError);
        return ctx.reply("❌ Ошибка удаления.");
      }

      const todayMeals = await getTodayMeals(telegram_id);
      const dailyNorm = await getUserDailyNorm(telegram_id);
      const waterInfo = await getWaterProgressByTelegram(telegram_id);

      // Получаем userId для создания ссылок на Mini App
      const { data: user } = await supabase
        .from("users")
        .select("id")
        .eq("telegram_id", telegram_id)
        .maybeSingle();

      // Возвращаем в главное меню используя единую функцию
      await sendMainMenu(
        ctx,
        user?.id || null,
        `✅ Удалено: ${lastMeal.meal_text} (${lastMeal.calories} ккал)\n\n${formatProgressMessage(todayMeals, dailyNorm, waterInfo || undefined)}`
      );
      return;
    }


    if (text === "🔙 Назад в меню") {
      // Получаем userId для создания ссылок на Mini App
      const { data: user } = await supabase
        .from("users")
        .select("id")
        .eq("telegram_id", telegram_id)
        .maybeSingle();

      // Используем единую функцию для отправки главного меню
      return sendMainMenu(ctx, user?.id || null, "•");
    }

    // Обработка ввода времени для напоминаний
    if (waitingForReminderTime.has(telegram_id)) {
      const reminderContext = waitingForReminderTime.get(telegram_id);
      if (!reminderContext) {
        waitingForReminderTime.delete(telegram_id);
        return;
      }

      waitingForReminderTime.delete(telegram_id);

      // Валидация времени
      if (!validateTime(text)) {
        return ctx.reply("❌ Не получилось распознать время, введите в формате ЧЧ:ММ, например 08:30");
      }

      // Получаем userId
      const { data: user, error: userError } = await supabase
        .from("users")
        .select("id")
        .eq("telegram_id", telegram_id)
        .maybeSingle();

      if (userError || !user) {
        console.error("[bot] Ошибка получения пользователя для напоминания:", userError);
        return ctx.reply("❌ Ошибка: пользователь не найден. Используйте /start для регистрации.");
      }

      try {
        await createReminder(user.id, reminderContext.type, text);
        
        const typeText = reminderContext.type === 'food' ? 'о приёме пищи' : 'про воду';
        const emoji = reminderContext.type === 'food' ? '🍽' : '💧';
        
        // Получаем обновленный список напоминаний для показа
        const reminders = await getUserReminders(user.id);
        const foodReminders = reminders.filter(r => r.type === 'food').map(r => r.time);
        const waterReminders = reminders.filter(r => r.type === 'water').map(r => r.time);

        let message = `✅ Готово! Я буду напоминать ${typeText} в ${text} ${emoji}\n\n`;
        message += "🔔 <b>Уведомления</b>\n\n";
        
        message += "🍽 <b>Напоминания о еде:</b>\n";
        if (foodReminders.length === 0) {
          message += "Нет напоминаний\n";
        } else {
          foodReminders.forEach(time => {
            message += `• ${time}\n`;
          });
        }
        
        message += "\n💧 <b>Напоминания о воде:</b>\n";
        if (waterReminders.length === 0) {
          message += "Нет напоминаний\n";
        } else {
          waterReminders.forEach(time => {
            message += `• ${time}\n`;
          });
        }

        // Создаем inline keyboard для управления
        const keyboard: any[] = [];
        keyboard.push([
          { text: "➕ Добавить напоминание по еде", callback_data: "add_reminder_food" }
        ]);
        keyboard.push([
          { text: "➕ Добавить напоминание по воде", callback_data: "add_reminder_water" }
        ]);
        reminders.forEach(reminder => {
          const typeEmoji = reminder.type === 'food' ? '🍽' : '💧';
          keyboard.push([
            { 
              text: `❌ Удалить ${typeEmoji} ${reminder.time}`, 
              callback_data: `delete_reminder_${reminder.id}` 
            }
          ]);
        });

        await ctx.reply(message, {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: keyboard
          }
        });
      } catch (error: any) {
        console.error("[bot] Ошибка создания напоминания:", error);
        return ctx.reply(`❌ Не получилось сохранить напоминание, попробуйте ещё раз позже`);
      }
      return;
    }

    // Обработчик "👤 Личный кабинет" удален - теперь это WebApp кнопка в меню
    // Telegram автоматически откроет Mini App при нажатии на кнопку

    if (text === "💬 Служба заботы") {
      console.log("[bot] Обработка кнопки Служба заботы для telegram_id:", telegram_id);
      try {
        const supportKeyboard = {
          inline_keyboard: [
            [
              {
                text: "💬 Написать в телеграм",
                url: "https://t.me/step0ne11"
              }
            ]
          ]
        };

        console.log("[bot] Отправка сообщения Служба заботы...");
        await ctx.reply(
          "💬 <b>Служба заботы</b>\n\nВыберите способ связи:\n\n📧 Email: steponehub@yandex.com\n💬 Telegram: @step0ne11",
          {
            parse_mode: "HTML",
            reply_markup: supportKeyboard
          }
        );
        console.log("[bot] ✅ Сообщение Служба заботы отправлено успешно");
        return;
      } catch (error: any) {
        console.error("[bot] ❌ Ошибка обработки Служба заботы:", error);
        console.error("[bot] Ошибка детали:", {
          message: error?.message,
          stack: error?.stack,
          response: error?.response
        });
        try {
          await ctx.reply("❌ Ошибка при открытии службы заботы. Попробуйте позже.");
        } catch (replyError: any) {
          console.error("[bot] ❌ Не удалось отправить сообщение об ошибке:", replyError);
        }
        return;
      }
    }

    if (text === "⏰ Напомнить о приёме пищи") {
      // Получаем userId для показа экрана уведомлений
      const { data: user, error: userError } = await supabase
        .from("users")
        .select("id")
        .eq("telegram_id", telegram_id)
        .maybeSingle();

      if (userError || !user) {
        console.error("[bot] Ошибка получения пользователя:", userError);
        return ctx.reply("❌ Ошибка: пользователь не найден. Используйте /start для регистрации.");
      }

      // Показываем экран уведомлений
      try {
        const reminders = await getUserReminders(user.id);
        
        const foodReminders = reminders.filter(r => r.type === 'food').map(r => r.time);
        const waterReminders = reminders.filter(r => r.type === 'water').map(r => r.time);

        let message = "🔔 <b>Уведомления</b>\n\n";
        
        message += "🍽 <b>Напоминания о еде:</b>\n";
        if (foodReminders.length === 0) {
          message += "Нет напоминаний\n";
        } else {
          foodReminders.forEach(time => {
            message += `• ${time}\n`;
          });
        }
        
        message += "\n💧 <b>Напоминания о воде:</b>\n";
        if (waterReminders.length === 0) {
          message += "Нет напоминаний\n";
        } else {
          waterReminders.forEach(time => {
            message += `• ${time}\n`;
          });
        }

        // Создаем inline keyboard
        const keyboard: any[] = [];
        
        // Кнопки добавления напоминаний
        keyboard.push([
          { text: "➕ Добавить напоминание по еде", callback_data: "add_reminder_food" }
        ]);
        keyboard.push([
          { text: "➕ Добавить напоминание по воде", callback_data: "add_reminder_water" }
        ]);

        // Кнопки удаления для каждого напоминания
        reminders.forEach(reminder => {
          const typeEmoji = reminder.type === 'food' ? '🍽' : '💧';
          keyboard.push([
            { 
              text: `❌ Удалить ${typeEmoji} ${reminder.time}`, 
              callback_data: `delete_reminder_${reminder.id}` 
            }
          ]);
        });

        await ctx.reply(message, {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: keyboard
          }
        });
      } catch (error: any) {
        console.error("[bot] Ошибка показа уведомлений:", error);
        return ctx.reply("❌ Ошибка загрузки уведомлений");
      }
      return;
    }

    // блок рекомендаций скрыт в боте


    // Generate requestId for tracing
    const requestId = `food-save-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`[bot:${requestId}] Текстовое сообщение от ${telegram_id}: ${text}`);

    // Показываем, что обрабатываем
    const processingMsg = await ctx.reply("🔍 Анализирую еду...");

    // Анализируем через OpenAI
    const analysis = await analyzeFoodWithOpenAI(text);
    if (!analysis) {
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        processingMsg.message_id,
        undefined,
        "❌ Не удалось проанализировать еду. Попробуйте описать подробнее."
      );
      return;
    }

    // Проверяем, про еду ли идет речь
    if ('isNotFood' in analysis && analysis.isNotFood) {
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        processingMsg.message_id,
        undefined,
        (analysis as NotFoodResponse).message
      );
      return;
    }

    // Type guard: после проверки analysis гарантированно MealAnalysis
    const mealAnalysis = analysis as MealAnalysis;

    // Убеждаемся, что пользователь существует в таблице users
    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("telegram_id", telegram_id)
      .maybeSingle();

    if (!existingUser) {
      // Создаём пользователя, если его нет
      const { data: newUser, error: createError } = await supabase
        .from("users")
        .upsert({ telegram_id }, { onConflict: "telegram_id", ignoreDuplicates: false })
        .select("id")
        .single();

      if (createError || !newUser) {
        console.error("[bot] Ошибка создания пользователя:", createError);
        await ctx.telegram.editMessageText(
          ctx.chat!.id,
          processingMsg.message_id,
          undefined,
          "❌ Ошибка: пользователь не найден. Используйте /start для регистрации."
        );
        return;
      }
    }

    // Get user ID from users table (not telegram_id directly)
    // CRITICAL: diary table expects user_id to be the id from users table, not telegram_id
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("id")
      .eq("telegram_id", telegram_id)
      .maybeSingle();

    if (userError || !userData) {
      console.error("[bot] Ошибка получения user_id для сохранения еды:", {
        error: userError,
        telegram_id,
      });
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        processingMsg.message_id,
        undefined,
        "❌ Ошибка: пользователь не найден. Используйте /start для регистрации."
      );
      return;
    }

    // Сохраняем в базу используя user.id (не telegram_id)
    // Store additional metadata for debugging
    const diaryEntry = {
      user_id: userData.id, // Use user.id from users table, not telegram_id
      telegram_user_id: telegram_id, // Also store telegram_id for direct lookup
      meal_text: mealAnalysis.description,
      calories: mealAnalysis.calories,
      protein: mealAnalysis.protein,
      fat: mealAnalysis.fat,
      carbs: mealAnalysis.carbs,
      source: 'telegram',
      message_id: ctx.message?.message_id || null,
      chat_id: ctx.chat?.id || null,
      parsed_json: mealAnalysis as any, // Store full analysis result for debugging
    };

    const { error: insertError } = await supabase.from("diary").insert(diaryEntry);

    if (insertError) {
      // Log full error details
      const errorContext = {
        requestId,
        telegram_user_id: telegram_id,
        user_id: userData.id,
        input_text: text.substring(0, 100), // First 100 chars only
        table_name: 'diary',
        operation: 'insert',
        supabase_error: {
          code: insertError.code || 'UNKNOWN',
          message: insertError.message || 'Unknown error',
          details: insertError.details || null,
          hint: insertError.hint || null,
        },
        payload_preview: {
          user_id: diaryEntry.user_id,
          telegram_user_id: diaryEntry.telegram_user_id,
          meal_text_length: diaryEntry.meal_text.length,
          has_calories: diaryEntry.calories !== undefined,
        },
        timestamp: new Date().toISOString(),
      };

      // Log to console (structured)
      console.error(`[bot:${requestId}] Ошибка сохранения в diary:`, JSON.stringify(errorContext, null, 2));

      // Log to app_errors table (async, don't wait)
      supabase.from("app_errors").insert({
        request_id: requestId,
        context: errorContext,
      }).catch((logError) => {
        console.error(`[bot:${requestId}] Failed to log error to app_errors:`, logError);
      });

      // Generate user-friendly error message with error code
      const errorCode = insertError.code || 'DB_ERROR';
      const userMessage = `❌ Не сохранилось. Код: ${errorCode}. Напиши в поддержку: @STEP0NE11`;
      
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        processingMsg.message_id,
        undefined,
        userMessage
      );
      return;
    }

    // Log successful save
    console.log(`[bot:${requestId}] ✅ Успешно сохранено в diary:`, {
      user_id: userData.id,
      telegram_user_id: telegram_id,
      meal_text: mealAnalysis.description.substring(0, 50),
    });

    // Получаем статистику за сегодня
    const todayMeals = await getTodayMeals(telegram_id);
    const dailyNorm = await getUserDailyNorm(telegram_id);

    // Формируем ответ
    const waterInfo = await getWaterProgressByTelegram(telegram_id);
    const response = `✅ Добавлено:\n${mealAnalysis.description}\n🔥 ${mealAnalysis.calories} ккал | 🥚 ${mealAnalysis.protein.toFixed(1)}г | 🥑 ${mealAnalysis.fat.toFixed(1)}г | 🍚 ${mealAnalysis.carbs.toFixed(1)}г\n\n${formatProgressMessage(todayMeals, dailyNorm, waterInfo || undefined)}`;

    await ctx.telegram.editMessageText(
      ctx.chat!.id,
      processingMsg.message_id,
      undefined,
      response
    );
  } catch (error: any) {
    console.error("[bot] Ошибка обработки текста:", error);
    
    // Если пользователь заблокировал бота - просто логируем, не пытаемся отправить сообщение
    if (error?.response?.error_code === 403 && error?.response?.description?.includes("blocked")) {
      console.warn(`[bot] Пользователь ${ctx.from?.id} заблокировал бота, пропускаем отправку сообщения`);
      return;
    }
    
    // Для других ошибок пытаемся отправить сообщение
    try {
      await ctx.reply("Произошла ошибка при обработке сообщения.");
    } catch (replyErr: any) {
      // Если и это не получилось (например, пользователь заблокирован) - просто логируем
      if (replyErr?.response?.error_code === 403) {
        console.warn(`[bot] Не удалось отправить сообщение об ошибке - пользователь заблокирован`);
      } else {
        console.error("[bot] Ошибка отправки сообщения об ошибке:", replyErr);
      }
    }
  }
});

// ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
//      Вспомогательные функции
// ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░

/**
 * Показывает экран уведомлений
 */
async function showNotificationsScreen(ctx: any, userId: number) {
  try {
    const reminders = await getUserReminders(userId);
    
    const foodReminders = reminders.filter(r => r.type === 'food').map(r => r.time);
    const waterReminders = reminders.filter(r => r.type === 'water').map(r => r.time);

    let message = "🔔 <b>Уведомления</b>\n\n";
    
    message += "🍽 <b>Напоминания о еде:</b>\n";
    if (foodReminders.length === 0) {
      message += "Нет напоминаний\n";
    } else {
      foodReminders.forEach(time => {
        message += `• ${time}\n`;
      });
    }
    
    message += "\n💧 <b>Напоминания о воде:</b>\n";
    if (waterReminders.length === 0) {
      message += "Нет напоминаний\n";
    } else {
      waterReminders.forEach(time => {
        message += `• ${time}\n`;
      });
    }

    // Создаем inline keyboard
    const keyboard: any[] = [];
    
    // Кнопки добавления напоминаний
    keyboard.push([
      { text: "➕ Добавить напоминание по еде", callback_data: "add_reminder_food" }
    ]);
    keyboard.push([
      { text: "➕ Добавить напоминание по воде", callback_data: "add_reminder_water" }
    ]);

    // Кнопки удаления для каждого напоминания
    reminders.forEach(reminder => {
      const typeEmoji = reminder.type === 'food' ? '🍽' : '💧';
      keyboard.push([
        { 
          text: `❌ Удалить ${typeEmoji} ${reminder.time}`, 
          callback_data: `delete_reminder_${reminder.id}` 
        }
      ]);
    });

    // Кнопка "Назад"
    keyboard.push([
      { text: "🔙 Назад", callback_data: "back_to_profile" }
    ]);

    await ctx.editMessageText(message, {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: keyboard
      }
    });
  } catch (error: any) {
    console.error("[bot] Ошибка показа экрана уведомлений:", error);
    await ctx.editMessageText(`❌ Ошибка: ${error.message || "Не удалось загрузить уведомления"}`);
  }
}

// ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
//      Обработка callback queries (кнопки)
// ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░

bot.on("callback_query", async (ctx) => {
  try {
    const telegram_id = ctx.from?.id;
    if (!telegram_id) {
      return ctx.answerCbQuery("Ошибка: не удалось определить ваш ID");
    }

    const data = (ctx.callbackQuery as any).data;
    if (!data) {
      return ctx.answerCbQuery();
    }


    // Обработка кнопок уведомлений
    if (data === "notifications") {
      await ctx.answerCbQuery();
      
      const { data: user, error: userError } = await supabase
        .from("users")
        .select("id")
        .eq("telegram_id", telegram_id)
        .maybeSingle();

      if (userError || !user) {
        return ctx.editMessageText("❌ Ошибка: пользователь не найден.");
      }

      await showNotificationsScreen(ctx, user.id);
      return;
    }

    if (data === "back_to_profile") {
      await ctx.answerCbQuery();
      
      const { data: user, error: userError } = await supabase
        .from("users")
        .select("id")
        .eq("telegram_id", telegram_id)
        .maybeSingle();

      if (userError || !user) {
        return ctx.editMessageText("❌ Ошибка: пользователь не найден.");
      }

      // Открываем Mini App на экране профиля через WebApp кнопку
      const profileUrl = `${MINIAPP_BASE_URL}/profile?id=${user.id}`;
      
      await ctx.editMessageText("Нажмите на кнопку ниже, чтобы открыть личный кабинет:", {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "👤 Открыть личный кабинет",
                web_app: { url: profileUrl }
              }
            ]
          ]
        }
      });
      return;
    }

    if (data === "add_reminder_food" || data === "add_reminder_water") {
      await ctx.answerCbQuery();
      
      const type: ReminderType = data === "add_reminder_food" ? 'food' : 'water';
      const typeText = type === 'food' ? 'о приёме пищи' : 'про воду';
      
      waitingForReminderTime.set(telegram_id, { type });
      
      await ctx.editMessageText(
        `Во сколько напомнить ${typeText}? Введите время в формате ЧЧ:ММ, например 08:30`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: "🔙 Назад", callback_data: "notifications" }
              ]
            ]
          }
        }
      );
      return;
    }

    if (data.startsWith("delete_reminder_")) {
      await ctx.answerCbQuery();
      
      const reminderId = parseInt(data.replace("delete_reminder_", ""), 10);
      if (isNaN(reminderId)) {
        return ctx.answerCbQuery("Ошибка: некорректный ID напоминания");
      }

      const { data: user, error: userError } = await supabase
        .from("users")
        .select("id")
        .eq("telegram_id", telegram_id)
        .maybeSingle();

      if (userError || !user) {
        return ctx.answerCbQuery("Ошибка: пользователь не найден");
      }

      try {
        await deleteReminder(reminderId, user.id);
        await showNotificationsScreen(ctx, user.id);
      } catch (error: any) {
        console.error("[bot] Ошибка удаления напоминания:", error);
        await ctx.answerCbQuery(`Ошибка: ${error.message}`);
      }
      return;
    }

    // Обработка кнопок воды
    if (data.startsWith("water_")) {
      await ctx.answerCbQuery();

      // Получаем userId
      const { data: user, error: userError } = await supabase
        .from("users")
        .select("id")
        .eq("telegram_id", telegram_id)
        .maybeSingle();

      if (userError || !user) {
        console.error("[bot] Ошибка получения пользователя для воды:", userError);
        return ctx.editMessageText("❌ Ошибка: пользователь не найден. Используйте /start для регистрации.");
      }

      if (data === "water_custom") {
        // Пользователь выбрал "свой вариант"
        waitingForWaterInput.add(telegram_id);
        return ctx.editMessageText("💧 Напишите количество воды в миллилитрах (например: 250, 300, 500)");
      }

      // Извлекаем количество из callback_data (water_250, water_300, water_500)
      const amountStr = data.replace("water_", "");
      const amount = parseInt(amountStr, 10);

      if (isNaN(amount) || amount <= 0 || amount >= 5000) {
        return ctx.editMessageText("❌ Некорректное количество воды");
      }

      try {
        // Логируем воду
        await logWaterIntake(user.id, amount, 'telegram');

        // Получаем сводку по воде за день
        const { totalMl, goalMl } = await getDailyWaterSummary(user.id);

        // Получаем статистику по еде за сегодня
        const todayMeals = await getTodayMeals(telegram_id);
        const dailyNorm = await getUserDailyNorm(telegram_id);

        // Формируем ответ с общим отчетом
    const response = `✅ Добавлено:\nвода\n🔥 0 ккал | 🥚 0.0г | 🥑 0.0г | 🍚 0.0г\n\n${formatProgressMessage(todayMeals, dailyNorm, { totalMl, goalMl })}`;

        return ctx.editMessageText(response);
      } catch (error: any) {
        console.error("[bot] Ошибка логирования воды:", error);
        return ctx.editMessageText(`❌ ${error.message || "Ошибка сохранения"}`);
      }
    }
  } catch (error: any) {
    console.error("[bot] Ошибка обработки callback:", error);
    try {
      await ctx.answerCbQuery("Произошла ошибка");
    } catch (e) {
      // Игнорируем ошибки ответа
    }
  }
});

// ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
//      Команда /отменить
// ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░

bot.command("отменить", async (ctx) => {
  try {
    const telegram_id = ctx.from?.id;
    if (!telegram_id) {
      return ctx.reply("Ошибка: не удалось определить ваш Telegram ID");
    }

    // FIXED FOR SUPABASE: Получаем пользователя для универсального поиска
    const { data: user } = await supabase
      .from("users")
      .select("id, telegram_id")
      .eq("telegram_id", telegram_id)
      .maybeSingle();

    const diaryUserId = user?.telegram_id || user?.id || telegram_id;

    // FIXED FOR SUPABASE: Ищем последнюю запись по ОБОИМ идентификаторам
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString();
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);
    const endOfDayISO = endOfDay.toISOString();

    let allMeals: any[] = [];

    // Сначала ищем по diaryUserId
    const { data: mealsByDiaryUserId, error: errorByDiaryUserId } = await supabase
      .from("diary")
      .select("id, meal_text, calories, created_at")
      .eq("user_id", diaryUserId)
      .gte("created_at", todayISO)
      .lte("created_at", endOfDayISO)
      .order("created_at", { ascending: false });

    if (!errorByDiaryUserId && mealsByDiaryUserId) {
      allMeals.push(...mealsByDiaryUserId);
    }

    // Если diaryUserId отличается от id, также ищем по id
    if (user?.id && diaryUserId !== user.id) {
      const { data: mealsById, error: errorById } = await supabase
        .from("diary")
        .select("id, meal_text, calories, created_at")
        .eq("user_id", user.id)
        .gte("created_at", todayISO)
        .lte("created_at", endOfDayISO)
        .order("created_at", { ascending: false });

      if (!errorById && mealsById) {
        allMeals.push(...mealsById);
      }
    }

    // Находим самую последнюю запись из всех (по дате)
    const lastMeal = allMeals
      .filter(m => !isNaN(new Date(m.created_at).getTime()))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

    if (!lastMeal) {
      return ctx.reply("❌ Сегодня ещё не было добавлено ни одного приёма пищи.");
    }

    // Удаляем
    const { error: deleteError } = await supabase
      .from("diary")
      .delete()
      .eq("id", lastMeal.id);

    if (deleteError) {
      console.error("[bot] Ошибка удаления:", deleteError);
      return ctx.reply("❌ Ошибка удаления.");
    }

    // Получаем обновлённую статистику
    const todayMeals = await getTodayMeals(telegram_id);
    const dailyNorm = await getUserDailyNorm(telegram_id);
    const waterInfo = await getWaterProgressByTelegram(telegram_id);

    ctx.reply(
      `✅ Удалено: ${lastMeal.meal_text} (${lastMeal.calories} ккал)\n\n${formatProgressMessage(todayMeals, dailyNorm, waterInfo || undefined)}`
    );
  } catch (error: any) {
    console.error("[bot] Ошибка /отменить:", error);
    
    // Если пользователь заблокировал бота - просто логируем
    if (error?.response?.error_code === 403 && error?.response?.description?.includes("blocked")) {
      console.warn(`[bot] Пользователь ${ctx.from?.id} заблокировал бота, пропускаем отправку сообщения`);
      return;
    }
    
    try {
      await ctx.reply("Произошла ошибка.");
    } catch (replyErr: any) {
      if (replyErr?.response?.error_code === 403) {
        console.warn(`[bot] Не удалось отправить сообщение об ошибке - пользователь заблокирован`);
      } else {
        console.error("[bot] Ошибка отправки сообщения об ошибке:", replyErr);
      }
    }
  }
});

// ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
//      Команда /отчет
// ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░

bot.command("отчет", async (ctx) => {
  try {
    const telegram_id = ctx.from?.id;
    if (!telegram_id) {
      return ctx.reply("Ошибка: не удалось определить ваш Telegram ID");
    }

    // Получаем пользователя - сначала по telegram_id, если не найден, то по id
    // Это нужно для iOS пользователей, которые могут не иметь telegram_id в таблице users
    let user: any = null;
    let userError: any = null;

    // Сначала пытаемся найти по telegram_id (обычный случай - пользователь зарегистрирован через бот)
    const { data: userByTelegramId, error: errorByTelegramId } = await supabase
      .from("users")
      .select("id, telegram_id")
      .eq("telegram_id", telegram_id)
      .maybeSingle();

    if (userByTelegramId) {
      user = userByTelegramId;
      console.log(`[bot] /отчет: Пользователь найден по telegram_id=${telegram_id}:`, user);
    } else {
      // Если не найден по telegram_id, ищем по id (для iOS пользователей)
      // iOS может создавать записи с user_id = id, если telegram_id отсутствует
      // Пробуем найти пользователя, у которого id совпадает с telegram_id (для совместимости)
      const { data: userById, error: errorById } = await supabase
        .from("users")
        .select("id, telegram_id")
        .eq("id", telegram_id)
        .maybeSingle();
      
      if (userById) {
        user = userById;
        console.log(`[bot] /отчет: Пользователь найден по id=${telegram_id}:`, user);
      } else {
        userError = errorById || errorByTelegramId;
        console.error(`[bot] /отчет: Пользователь не найден ни по telegram_id=${telegram_id}, ни по id=${telegram_id}`);
      }
    }

    if (userError && !user) {
      console.error("[bot] Ошибка получения пользователя:", userError);
      return ctx.reply("❌ Ошибка базы данных.");
    }

    // Используем telegram_id если есть, иначе id (единая логика с iOS и Edge Functions)
    // ВАЖНО: Если у пользователя нет telegram_id, значит он зарегистрирован только через iOS
    // В этом случае записи могут быть сохранены с id вместо telegram_id
    const diaryUserId = user?.telegram_id || user?.id;

    if (!diaryUserId) {
      return ctx.reply("❌ Пользователь не найден. Используйте /start для регистрации.");
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);
    const todayISO = today.toISOString();
    const endOfDayISO = endOfDay.toISOString();

    console.log(`[bot] /отчет: telegram_id=${telegram_id}, diaryUserId=${diaryUserId}, диапазон: ${todayISO} - ${endOfDayISO}`);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/43e8883f-375d-4d43-af6f-fef79b5ebbe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'bot/src/index.ts:1807',message:'HYP-A: Bot user data',data:{userId:user?.id,telegramId:user?.telegram_id,diaryUserId,todayISO,endOfDayISO},timestamp:Date.now(),sessionId:'debug-sync',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    // FIXED FOR SUPABASE: Ищем записи по ОБОИМ идентификаторам для полной синхронизации
    let allMeals: any[] = [];
    let error: any = null;

    // Сначала ищем по diaryUserId (telegram_id если есть, иначе id)
    const { data: mealsByDiaryUserId, error: errorByDiaryUserId } = await supabase
      .from("diary")
      .select("meal_text, calories, protein, fat, carbs, created_at, user_id")
      .eq("user_id", diaryUserId)
      .gte("created_at", todayISO)
      .lte("created_at", endOfDayISO)
      .order("created_at", { ascending: true });

    if (errorByDiaryUserId) {
      console.error(`[bot] /отчет: Ошибка поиска по diaryUserId=${diaryUserId}:`, errorByDiaryUserId);
      error = errorByDiaryUserId;
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/43e8883f-375d-4d43-af6f-fef79b5ebbe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'bot/src/index.ts:1823',message:'HYP-A: Bot error searching by diaryUserId',data:{diaryUserId,error:errorByDiaryUserId.message},timestamp:Date.now(),sessionId:'debug-sync',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
    } else if (mealsByDiaryUserId) {
      allMeals.push(...mealsByDiaryUserId);
      console.log(`[bot] /отчет: Найдено ${mealsByDiaryUserId.length} записей по diaryUserId=${diaryUserId}`);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/43e8883f-375d-4d43-af6f-fef79b5ebbe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'bot/src/index.ts:1827',message:'HYP-A: Bot found meals by diaryUserId',data:{diaryUserId,count:mealsByDiaryUserId.length,mealIds:mealsByDiaryUserId.map(m=>m.id)},timestamp:Date.now(),sessionId:'debug-sync',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
    }

    // FIXED FOR SUPABASE: ВСЕГДА ищем по обоим ID для полной синхронизации
    // КРИТИЧНО: Если diaryUserId отличается от user.id, ищем также по user.id
    // Это гарантирует, что мы найдём все записи, независимо от того, с каким user_id они были созданы
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/43e8883f-375d-4d43-af6f-fef79b5ebbe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'bot/src/index.ts:1830',message:'HYP-B: Bot checking fallback condition',data:{hasUserId:!!user?.id,hasTelegramId:!!user?.telegram_id,userId:user?.id,telegramId:user?.telegram_id,diaryUserId,willSearch:user?.id&&diaryUserId!==user.id},timestamp:Date.now(),sessionId:'debug-sync',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    if (user?.id && diaryUserId !== user.id) {
      console.log(`[bot] /отчет: Дополнительный поиск по id=${user.id} (для записей iOS, созданных с user_id=id)`);
      const { data: mealsById, error: errorById } = await supabase
        .from("diary")
        .select("meal_text, calories, protein, fat, carbs, created_at, user_id")
        .eq("user_id", user.id)
        .gte("created_at", todayISO)
        .lte("created_at", endOfDayISO)
        .order("created_at", { ascending: true });
      
      if (errorById) {
        console.error(`[bot] /отчет: Ошибка поиска по id=${user.id}:`, errorById);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/43e8883f-375d-4d43-af6f-fef79b5ebbe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'bot/src/index.ts:1837',message:'HYP-B: Bot error in fallback search',data:{userId:user.id,error:errorById.message},timestamp:Date.now(),sessionId:'debug-sync',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
      } else if (mealsById) {
        allMeals.push(...mealsById);
        console.log(`[bot] /отчет: Найдено дополнительных ${mealsById.length} записей по id=${user.id}`);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/43e8883f-375d-4d43-af6f-fef79b5ebbe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'bot/src/index.ts:1842',message:'HYP-B: Bot found meals in fallback search',data:{userId:user.id,count:mealsById.length,mealIds:mealsById.map(m=>m.id)},timestamp:Date.now(),sessionId:'debug-sync',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
      }
    }

    // Удаляем дубликаты по id записи
    const uniqueMealsMap = new Map();
    allMeals.forEach(meal => {
      if (!uniqueMealsMap.has(meal.id)) {
        uniqueMealsMap.set(meal.id, meal);
      }
    });
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/43e8883f-375d-4d43-af6f-fef79b5ebbe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'bot/src/index.ts:1853',message:'HYP-D: Bot after deduplication',data:{beforeDedup:allMeals.length,afterDedup:uniqueMealsMap.size,todayISO,endOfDayISO},timestamp:Date.now(),sessionId:'debug-sync',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion

    const meals = Array.from(uniqueMealsMap.values())
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/43e8883f-375d-4d43-af6f-fef79b5ebbe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'bot/src/index.ts:1859',message:'HYP-C: Bot final result',data:{todayISO,endOfDayISO,mealsCount:meals.length,mealCreatedAts:meals.map(m=>m.created_at)},timestamp:Date.now(),sessionId:'debug-sync',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion

    if (error && allMeals.length === 0) {
      console.error("[bot] Ошибка получения отчёта:", error);
      return ctx.reply("❌ Ошибка базы данных.");
    }

    if (!meals || meals.length === 0) {
      return ctx.reply("📋 Сегодня ещё не было приёмов пищи.");
    }

    console.log(`[bot] /отчет: Итого найдено ${meals.length} уникальных записей (после объединения по обоим ID)`);

    const todayMeals = await getTodayMeals(telegram_id);
    const dailyNorm = await getUserDailyNorm(telegram_id);
    const waterInfo = await getWaterProgressByTelegram(telegram_id);

    let report = "📋 Отчёт за сегодня:\n\n";
    meals.forEach((meal, index) => {
      const time = new Date(meal.created_at).toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit"
      });
      report += `${index + 1}. ${meal.meal_text} (${time})\n   🔥 ${meal.calories} ккал | 🥚 ${Number(meal.protein).toFixed(1)}г | 🥑 ${Number(meal.fat).toFixed(1)}г | 🍚 ${Number(meal.carbs || 0).toFixed(1)}г\n\n`;
    });

    report += `\n${formatProgressMessage(todayMeals, dailyNorm, waterInfo || undefined)}`;

    ctx.reply(report);
  } catch (error: any) {
    console.error("[bot] Ошибка /отчет:", error);
    
    // Если пользователь заблокировал бота - просто логируем
    if (error?.response?.error_code === 403 && error?.response?.description?.includes("blocked")) {
      console.warn(`[bot] Пользователь ${ctx.from?.id} заблокировал бота, пропускаем отправку сообщения`);
      return;
    }
    
    try {
      await ctx.reply("Произошла ошибка.");
    } catch (replyErr: any) {
      if (replyErr?.response?.error_code === 403) {
        console.warn(`[bot] Не удалось отправить сообщение об ошибке - пользователь заблокирован`);
      } else {
        console.error("[bot] Ошибка отправки сообщения об ошибке:", replyErr);
      }
    }
  }
});

// ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
//      Обработка фото
// ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░

/**
 * Анализирует фото еды через OpenAI GPT-4o Vision
 */
async function analyzePhotoWithOpenAI(photoUrl: string): Promise<MealAnalysis | { isNotFood: true; message: string } | null> {
  try {
    console.log(`[OpenAI] Начинаю анализ фото: ${photoUrl.substring(0, 50)}...`);
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: FOOD_ANALYSIS_SYSTEM_PROMPT + "\n\nAlways return valid JSON without additional text."
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Проанализируй фото и определи:

1. Есть ли на фото ЕДА? (блюда, продукты питания, напитки)
2. Если НЕТ еды — что именно изображено? (животное, предмет, человек, пейзаж и т.д.)

ВАЖНО ДЛЯ ОЦЕНКИ ПОРЦИЙ ПО ФОТО:
- Оценивай порции на основе визуального объема и размера тарелки/блюда
- НЕ занижай порции! Если не уверен, выбирай среднее реалистичное значение
- Предполагай домашнюю еду, если не видно явно ресторанную порцию
- Стандартная тарелка = ~300-400 г еды
- Глубокая тарелка/миска = ~250-350 г
- Маленькая тарелка = ~150-200 г

Включи в ответ:
- примерный вес каждого ингредиента
- общие ккал / белки / жиры / углеводы
- краткое объяснение визуальной оценки

Верни ТОЛЬКО JSON в одном из двух форматов:

Если на фото ЕДА:
{
  "isFood": true,
  "description": "краткое название блюда на русском",
  "calories": число (ккал, округленное),
  "protein": число (граммы, округленное до 0.1),
  "fat": число (граммы, округленное до 0.1),
  "carbs": число (граммы, округленное до 0.1)
}

Если на фото НЕТ еды:
{
  "isFood": false,
  "whatIsIt": "что изображено на фото (например: котик, собака, машина, пейзаж)",
  "message": "дружелюбное сообщение на русском с эмодзи, объясняющее что это не еда (например: 'это не еда, это котик 😺' или 'это не еда, это красивый пейзаж 🌄')"
}

ВАЖНО: 
- Если на фото нет еды, верни isFood: false с описанием что это и дружелюбным сообщением.
- Если это еда — оцени РЕАЛИСТИЧНО на основе визуального объема, не занижай порции!`
            },
            {
              type: "image_url",
              image_url: {
                url: photoUrl
              }
            }
          ]
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 500
    });

    console.log("[OpenAI] Получен ответ от OpenAI Vision");
    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.error("[OpenAI] Пустой ответ от OpenAI Vision");
      return null;
    }

    console.log(`[OpenAI] Содержимое ответа: ${content.substring(0, 200)}...`);
    
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (parseError) {
      console.error("[OpenAI] Ошибка парсинга JSON:", parseError);
      console.error("[OpenAI] Сырой ответ:", content);
      return null;
    }

    // Проверяем, есть ли еда на фото
    if (parsed.isFood === false) {
      console.log(`[OpenAI] На фото нет еды: ${parsed.whatIsIt}`);
      return {
        isNotFood: true,
        message: parsed.message || `Это не еда, это ${parsed.whatIsIt || "что-то другое"} 😊`
      };
    }

    const result = {
      description: parsed.description || "Еда на фото",
      calories: Number(parsed.calories) || 0,
      protein: Number(parsed.protein) || 0,
      fat: Number(parsed.fat) || 0,
      carbs: Number(parsed.carbs) || 0
    };

    console.log(`[OpenAI] Успешно проанализировано фото:`, result);
    return result;
  } catch (error: any) {
    console.error("[OpenAI] Ошибка анализа фото:", error);
    if (error?.message) {
      console.error("[OpenAI] Детали ошибки:", error.message);
    }
    return null;
  }
}

bot.on("photo", async (ctx) => {
  try {
    const telegram_id = ctx.from?.id;
    if (!telegram_id) {
      return ctx.reply("Ошибка: не удалось определить ваш Telegram ID");
    }

    console.log(`[bot] Получено фото от ${telegram_id}`);

    // Показываем, что обрабатываем
    const processingMsg = await ctx.reply("📸 Анализирую фото еды...");

    // Generate requestId for tracing
    const requestId = `photo-save-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Получаем фото в лучшем качестве
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    const file = await ctx.telegram.getFile(photo.file_id);
    const photoUrl = `https://api.telegram.org/file/bot${env.telegramBotToken}/${file.file_path}`;

    console.log(`[bot:${requestId}] URL фото: ${photoUrl}`);

    // Анализируем через OpenAI Vision
    const analysis = await analyzePhotoWithOpenAI(photoUrl);
    if (!analysis) {
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        processingMsg.message_id,
        undefined,
        "❌ Не удалось проанализировать фото. Попробуйте отправить более чёткое фото еды."
      );
      return;
    }

    // Проверяем, есть ли еда на фото
    if ('isNotFood' in analysis && analysis.isNotFood) {
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        processingMsg.message_id,
        undefined,
        (analysis as NotFoodResponse).message
      );
      return;
    }

    // Type guard: после проверки analysis гарантированно MealAnalysis
    const mealAnalysis = analysis as MealAnalysis;

    // Убеждаемся, что пользователь существует
    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("telegram_id", telegram_id)
      .maybeSingle();

    if (!existingUser) {
      const { data: newUser, error: createError } = await supabase
        .from("users")
        .upsert({ telegram_id }, { onConflict: "telegram_id", ignoreDuplicates: false })
        .select("id")
        .single();

      if (createError || !newUser) {
        console.error(`[bot:${requestId}] Ошибка создания пользователя:`, createError);
        await ctx.telegram.editMessageText(
          ctx.chat!.id,
          processingMsg.message_id,
          undefined,
          "❌ Ошибка: пользователь не найден. Используйте /start для регистрации."
        );
        return;
      }
    }

    // Get user ID from users table (not telegram_id directly)
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("id")
      .eq("telegram_id", telegram_id)
      .maybeSingle();

    if (userError || !userData) {
      console.error(`[bot:${requestId}] Ошибка получения user_id для сохранения фото:`, {
        error: userError,
        telegram_id,
      });
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        processingMsg.message_id,
        undefined,
        "❌ Ошибка: пользователь не найден. Используйте /start для регистрации."
      );
      return;
    }

    // Сохраняем в базу используя user.id (не telegram_id)
    const diaryEntry = {
      user_id: userData.id, // Use user.id from users table, not telegram_id
      telegram_user_id: telegram_id, // Also store telegram_id for direct lookup
      meal_text: mealAnalysis.description,
      calories: mealAnalysis.calories,
      protein: mealAnalysis.protein,
      fat: mealAnalysis.fat,
      carbs: mealAnalysis.carbs,
      source: 'telegram',
      message_id: ctx.message?.message_id || null,
      chat_id: ctx.chat?.id || null,
      parsed_json: mealAnalysis as any, // Store full analysis result for debugging
    };

    const { error: insertError } = await supabase.from("diary").insert(diaryEntry);

    if (insertError) {
      // Log full error details
      const errorContext = {
        requestId,
        telegram_user_id: telegram_id,
        user_id: userData.id,
        input_text: 'photo_analysis',
        table_name: 'diary',
        operation: 'insert',
        supabase_error: {
          code: insertError.code || 'UNKNOWN',
          message: insertError.message || 'Unknown error',
          details: insertError.details || null,
          hint: insertError.hint || null,
        },
        payload_preview: {
          user_id: diaryEntry.user_id,
          telegram_user_id: diaryEntry.telegram_user_id,
          meal_text_length: diaryEntry.meal_text.length,
          has_calories: diaryEntry.calories !== undefined,
        },
        timestamp: new Date().toISOString(),
      };

      // Log to console (structured)
      console.error(`[bot:${requestId}] Ошибка сохранения фото в diary:`, JSON.stringify(errorContext, null, 2));

      // Log to app_errors table (async, don't wait)
      supabase.from("app_errors").insert({
        request_id: requestId,
        context: errorContext,
      }).catch((logError) => {
        console.error(`[bot:${requestId}] Failed to log error to app_errors:`, logError);
      });

      // Generate user-friendly error message with error code
      const errorCode = insertError.code || 'DB_ERROR';
      const userMessage = `❌ Не сохранилось. Код: ${errorCode}. Напиши в поддержку: @STEP0NE11`;
      
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        processingMsg.message_id,
        undefined,
        userMessage
      );
      return;
    }

    // Log successful save
    console.log(`[bot:${requestId}] ✅ Успешно сохранено фото в diary:`, {
      user_id: userData.id,
      telegram_user_id: telegram_id,
      meal_text: mealAnalysis.description.substring(0, 50),
    });

    // Получаем статистику за сегодня
    const todayMeals = await getTodayMeals(telegram_id);
    const dailyNorm = await getUserDailyNorm(telegram_id);

    // Формируем ответ
    const waterInfo = await getWaterProgressByTelegram(telegram_id);
    const response = `✅ Добавлено:\n${mealAnalysis.description}\n🔥 ${mealAnalysis.calories} ккал | 🥚 ${mealAnalysis.protein.toFixed(1)}г | 🥑 ${mealAnalysis.fat.toFixed(1)}г | 🍚 ${mealAnalysis.carbs.toFixed(1)}г\n\n${formatProgressMessage(todayMeals, dailyNorm, waterInfo || undefined)}`;

    await ctx.telegram.editMessageText(
      ctx.chat!.id,
      processingMsg.message_id,
      undefined,
      response
    );
  } catch (error: any) {
    console.error("[bot] Ошибка обработки фото:", error);
    
    // Если пользователь заблокировал бота - просто логируем
    if (error?.response?.error_code === 403 && error?.response?.description?.includes("blocked")) {
      console.warn(`[bot] Пользователь ${ctx.from?.id} заблокировал бота, пропускаем отправку сообщения`);
      return;
    }
    
    try {
      await ctx.reply("Произошла ошибка при обработке фото.");
    } catch (replyErr: any) {
      if (replyErr?.response?.error_code === 403) {
        console.warn(`[bot] Не удалось отправить сообщение об ошибке - пользователь заблокирован`);
      } else {
        console.error("[bot] Ошибка отправки сообщения об ошибке:", replyErr);
      }
    }
  }
});

// ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
//      Обработка аудио
// ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░

/**
 * Транскрибирует аудио через OpenAI Whisper
 */
async function transcribeAudio(audioUrl: string): Promise<string | null> {
  try {
    console.log(`[OpenAI] Начинаю транскрипцию аудио: ${audioUrl.substring(0, 50)}...`);
    
    // Скачиваем аудио файл
    const response = await fetch(audioUrl);
    if (!response.ok) {
      console.error("[OpenAI] Ошибка загрузки аудио:", response.statusText);
      return null;
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    
    // OpenAI SDK принимает File, Blob или Buffer
    // Создаём File-like объект из Buffer
    const audioFile = new File([audioBuffer], "audio.ogg", { type: "audio/ogg" });

    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
      language: "ru"
    });

    const text = transcription.text.trim();
    console.log(`[OpenAI] Транскрибировано: "${text}"`);
    return text;
  } catch (error: any) {
    console.error("[OpenAI] Ошибка транскрипции:", error);
    if (error?.message) {
      console.error("[OpenAI] Детали ошибки:", error.message);
    }
    return null;
  }
}

bot.on("voice", async (ctx) => {
  try {
    const telegram_id = ctx.from?.id;
    if (!telegram_id) {
      return ctx.reply("Ошибка: не удалось определить ваш Telegram ID");
    }

    console.log(`[bot] Получено голосовое сообщение от ${telegram_id}`);


    // Показываем, что обрабатываем
    const processingMsg = await ctx.reply("🎤 Расшифровываю голосовое сообщение...");

    // Получаем аудио файл
    const voice = ctx.message.voice;
    const file = await ctx.telegram.getFile(voice.file_id);
    const audioUrl = `https://api.telegram.org/file/bot${env.telegramBotToken}/${file.file_path}`;

    console.log(`[bot] URL аудио: ${audioUrl}`);

    // Транскрибируем через Whisper
    const transcribedText = await transcribeAudio(audioUrl);
    if (!transcribedText) {
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        processingMsg.message_id,
        undefined,
        "❌ Не удалось расшифровать голосовое сообщение. Попробуйте ещё раз."
      );
      return;
    }

    // Обновляем сообщение
    await ctx.telegram.editMessageText(
      ctx.chat!.id,
      processingMsg.message_id,
      undefined,
      `🔍 Расшифровано: "${transcribedText}"\n\nАнализирую еду...`
    );

    // Анализируем текст через OpenAI
    const analysis = await analyzeFoodWithOpenAI(transcribedText);
    if (!analysis) {
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        processingMsg.message_id,
        undefined,
        "❌ Не удалось проанализировать описание еды. Попробуйте описать подробнее."
      );
      return;
    }

    // Проверяем, про еду ли идет речь
    if ('isNotFood' in analysis && analysis.isNotFood) {
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        processingMsg.message_id,
        undefined,
        (analysis as NotFoodResponse).message
      );
      return;
    }

    // Type guard: после проверки analysis гарантированно MealAnalysis
    const mealAnalysis = analysis as MealAnalysis;

    // Убеждаемся, что пользователь существует
    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("telegram_id", telegram_id)
      .maybeSingle();

    if (!existingUser) {
      const { data: newUser, error: createError } = await supabase
        .from("users")
        .upsert({ telegram_id }, { onConflict: "telegram_id", ignoreDuplicates: false })
        .select("id")
        .single();

      if (createError || !newUser) {
        console.error("[bot] Ошибка создания пользователя:", createError);
        await ctx.telegram.editMessageText(
          ctx.chat!.id,
          processingMsg.message_id,
          undefined,
          "❌ Ошибка: пользователь не найден. Используйте /start для регистрации."
        );
        return;
      }
    }

    // Сохраняем в базу
    const { error: insertError } = await supabase.from("diary").insert({
      user_id: telegram_id,
      meal_text: mealAnalysis.description,
      calories: mealAnalysis.calories,
      protein: mealAnalysis.protein,
      fat: mealAnalysis.fat,
      carbs: mealAnalysis.carbs
    });

    if (insertError) {
      console.error("[bot] Ошибка сохранения:", insertError);
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        processingMsg.message_id,
        undefined,
        "❌ Ошибка сохранения в базу данных."
      );
      return;
    }

    // Получаем статистику за сегодня
    const todayMeals = await getTodayMeals(telegram_id);
    const dailyNorm = await getUserDailyNorm(telegram_id);

    // Формируем ответ
    const waterInfo = await getWaterProgressByTelegram(telegram_id);
    const response = `✅ Добавлено:\n${mealAnalysis.description}\n🔥 ${mealAnalysis.calories} ккал | 🥚 ${mealAnalysis.protein.toFixed(1)}г | 🥑 ${mealAnalysis.fat.toFixed(1)}г | 🍚 ${mealAnalysis.carbs.toFixed(1)}г\n\n${formatProgressMessage(todayMeals, dailyNorm, waterInfo || undefined)}`;

    await ctx.telegram.editMessageText(
      ctx.chat!.id,
      processingMsg.message_id,
      undefined,
      response
    );
  } catch (error: any) {
    console.error("[bot] Ошибка обработки аудио:", error);
    
    // Если пользователь заблокировал бота - просто логируем
    if (error?.response?.error_code === 403 && error?.response?.description?.includes("blocked")) {
      console.warn(`[bot] Пользователь ${ctx.from?.id} заблокировал бота, пропускаем отправку сообщения`);
      return;
    }
    
    try {
      await ctx.reply("Произошла ошибка при обработке голосового сообщения.");
    } catch (replyErr: any) {
      if (replyErr?.response?.error_code === 403) {
        console.warn(`[bot] Не удалось отправить сообщение об ошибке - пользователь заблокирован`);
      } else {
        console.error("[bot] Ошибка отправки сообщения об ошибке:", replyErr);
      }
    }
  }
});
// TODO: Добавить напоминания
// TODO: Добавить графики веса
// TODO: Добавить CSV-экспорт
// TODO: Добавить советы по питанию

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

// Стартуем
bot.launch();
console.log("🤖 Бот запущен");

// Запускаем scheduler для напоминаний
startReminderScheduler(bot);
console.log("⏰ Scheduler напоминаний запущен");

// Запускаем scheduler для уведомлений о неактивности
startInactivityNotificationScheduler(bot);
console.log("📢 Scheduler уведомлений о неактивности запущен");
