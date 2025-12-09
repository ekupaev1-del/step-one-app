// Импорты
import { Telegraf } from "telegraf";
import { Readable } from "stream";
import { env } from "./config/env.js";
import { supabase } from "./services/supabase.js";
import { openai } from "./services/openai.js";
import { isWaterRequest, logWaterIntake, getDailyWaterSummary } from "./services/water.js";
import { createReminder, getUserReminders, deleteReminder, validateTime, type ReminderType } from "./services/reminders.js";
import { startReminderScheduler } from "./services/reminderScheduler.js";

// Инициализация бота
const bot = new Telegraf(env.telegramBotToken);

// Миниап URL
// Для тестирования используем Preview версию из dev ветки
// Продакшен-домен мини-приложения (стабильный)
const MINIAPP_BASE_URL =
  process.env.MINIAPP_BASE_URL ||
  "https://step-one-pvkktazus-emins-projects-4717eabc.vercel.app";

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
  // Всегда используем актуальный MINIAPP_BASE_URL
  // ВАЖНО: Используем production URL, НЕ preview URL
  const baseUrl = (MINIAPP_BASE_URL || "https://step-one-app.vercel.app").trim().replace(/\/$/, ''); // Убираем trailing slash
  
  // ВАЖНО: URL должны быть правильными - /profile и /report (не /reports!)
  const reportUrl = userId ? `${baseUrl}/report?id=${userId}` : undefined;
  const profileUrl = userId ? `${baseUrl}/profile?id=${userId}` : undefined;

  // ЕДИНСТВЕННОЕ правильное меню - 4 кнопки с правильными URL
  // Кнопки с web_app открывают Mini App напрямую
  const keyboard = {
    keyboard: [
      [
        { text: "👤 Личный кабинет", web_app: profileUrl ? { url: profileUrl } : undefined }
      ],
      [
        { text: "📊 Получить отчёт", web_app: reportUrl ? { url: reportUrl } : undefined }
      ],
      [
        { text: "⏰ Напомнить о приёме пищи" }
      ],
      [
        { text: "💡 Рекомендации" }
      ]
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  };

  // Логируем для отладки
  console.log("[getMainMenuKeyboard] userId:", userId);
  console.log("[getMainMenuKeyboard] baseUrl:", baseUrl);
  console.log("[getMainMenuKeyboard] profileUrl:", profileUrl);
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
async function sendMainMenu(ctx: any, userId: number | null, message?: string): Promise<void> {
  try {
    const menu = getMainMenuKeyboard(userId);
    const menuText = message || "Выберите действие:";
    
    console.log("[sendMainMenu] Отправка меню для userId:", userId);
    console.log("[sendMainMenu] MINIAPP_BASE_URL:", MINIAPP_BASE_URL);
    console.log("[sendMainMenu] Chat ID:", ctx.chat?.id);
    
    await ctx.reply(menuText, {
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

// ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
//            /start
// ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░

bot.start(async (ctx) => {
  try {
    const telegram_id = ctx.from?.id;
    if (!telegram_id) {
      console.error("[bot] /start: нет telegram_id");
      return ctx.reply("Ошибка: не удалось определить ваш Telegram ID");
    }

    console.log(`[bot] /start вызван для telegram_id: ${telegram_id}`);

    // Проверяем, есть ли пользователь и заполнена ли анкета
    const { data: existingUser, error: selectError } = await supabase
      .from("users")
      .select("id, calories")
      .eq("telegram_id", telegram_id)
      .maybeSingle();

    if (selectError) {
      console.error("[bot] Ошибка проверки пользователя:", selectError);
      return ctx.reply("Ошибка базы данных. Попробуйте позже.");
    }

    let userId;
    const isQuestionnaireFilled = existingUser && existingUser.calories;

    if (existingUser) {
      userId = existingUser.id;
      console.log(`[bot] Пользователь найден, id: ${userId}, анкета заполнена: ${isQuestionnaireFilled}`);
    } else {
      // Создаём новую запись ТОЛЬКО с telegram_id
      // Форма потом обновит остальные поля через /api/save
      console.log(`[bot] Создание новой записи для telegram_id: ${telegram_id}`);
      const { data: upserted, error: upsertError } = await supabase
        .from("users")
        .upsert({ telegram_id }, { onConflict: "telegram_id", ignoreDuplicates: false })
        .select("id")
        .single();

      if (upsertError) {
        console.error("[bot] Ошибка upsert:", upsertError);
        return ctx.reply("Ошибка создания записи в базе. Попробуйте позже.");
      }

      if (!upserted?.id) {
        console.error("[bot] Upsert вернул пустой результат");
        return ctx.reply("Ошибка: не удалось получить ID пользователя");
      }

      userId = upserted.id;
      console.log(`[bot] Создана новая запись, id: ${userId}`);
    }

    // Если анкета не заполнена - показываем приветствие (только новая анкета)
    if (!isQuestionnaireFilled) {
      const url = `${MINIAPP_BASE_URL}/registration?id=${userId}`;
      console.log(`[bot] Показываю приветствие для нового пользователя`);

      // Отправляем приветственное сообщение с картинкой
      // Используем оптимизированную версию для быстрой отправки
      const welcomeImageUrl = `${MINIAPP_BASE_URL}/images/welcome-optimized.png`;
      
      // Текст с форматированием (HTML) - точно как на скрине 2
      const welcomeText = `💪 <b>Добро пожаловать в Step One.</b>
Самое тяжелое вы уже сделали - первый шаг

<u>Я помогу вам настроить питание под вашу цель:</u>
- похудеть,
- набрать вес
- или просто чувствовать себя лучше и легче.

Чтобы мне определить, как вам правильно питаться,
ответьте на пару вопросов↓`;
      
      // Пробуем отправить картинку через URL (быстрее для оптимизированных файлов)
      try {
        console.log("[bot] Отправка картинки через URL...");
        await ctx.replyWithPhoto(
          welcomeImageUrl,
          {
            caption: welcomeText,
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "📝 Заполнить анкету",
                    web_app: { url }
                  }
                ]
              ]
            }
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
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: "📝 Заполнить анкету",
                      web_app: { url }
                    }
                  ]
                ]
              }
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
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: "📝 Заполнить анкету",
                      web_app: { url }
                    }
                  ]
                ]
              }
            }
          );
        } catch (replyError: any) {
          console.error("[bot] Ошибка отправки сообщения без картинки:", replyError);
          // Последняя попытка - без форматирования
          await ctx.reply(
            "💪 Добро пожаловать в Step One.\n\nСамое тяжелое вы уже сделали - первый шаг\n\nЯ помогу вам настроить питание под вашу цель:\n- похудеть,\n- набрать вес\n- или просто чувствовать себя лучше и легче.\n\nЧтобы мне определить, как вам правильно питаться,\nответьте на пару вопросов↓",
            {
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: "📝 Заполнить анкету",
                      web_app: { url }
                    }
                  ]
                ]
              }
            }
          );
        }
      }
      return;
    }

    // Если анкета заполнена - показываем единое главное меню
    // Используем ЕДИНСТВЕННУЮ функцию sendMainMenu для гарантии правильного меню
    console.log("[bot] /start: отправка меню для пользователя с id:", userId);
    console.log("[bot] /start: MINIAPP_BASE_URL:", MINIAPP_BASE_URL);
    await sendMainMenu(ctx, userId, "Добро пожаловать! Выберите действие:");

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

// Обработка данных из WebApp (когда пользователь отправляет данные через sendData)
bot.on("message", async (ctx, next) => {
  // Проверяем, есть ли данные из WebApp
  if (ctx.message && "web_app_data" in ctx.message) {
    console.log("[bot] ========== ПОЛУЧЕНЫ ДАННЫЕ ИЗ WEBAPP ==========");
    console.log("[bot] Полное сообщение:", JSON.stringify(ctx.message, null, 2));
    
    const telegram_id = ctx.from?.id;
    const chat_id = ctx.chat?.id;
    console.log("[bot] telegram_id:", telegram_id);
    console.log("[bot] chat_id:", chat_id);
    
    if (!telegram_id) {
      console.log("[bot] ❌ Нет telegram_id, пропускаем");
      return next();
    }

    if (!chat_id) {
      console.error("[bot] ❌ КРИТИЧЕСКАЯ ОШИБКА: Нет chat_id!");
      // Пробуем отправить сообщение используя telegram_id как chat_id
      try {
        await ctx.telegram.sendMessage(telegram_id, "✅ Ваши данные сохранены. Добро пожаловать!");
        const menu = getMainMenuKeyboard(null);
        await ctx.telegram.sendMessage(telegram_id, "Выберите действие:", {
          reply_markup: { ...menu, replace_keyboard: true }
        });
      } catch (e: any) {
        console.error("[bot] ❌ Не удалось отправить сообщение без chat_id:", e);
      }
      return;
    }

    const data = (ctx.message as any).web_app_data?.data;
    console.log("[bot] Данные из WebApp (raw):", data);
    if (!data) {
      console.log("[bot] ❌ Нет данных в web_app_data, пропускаем");
      return next();
    }

    let parsedData;
    try {
      parsedData = JSON.parse(data);
      console.log("[bot] Распарсенные данные:", JSON.stringify(parsedData, null, 2));
    } catch (e) {
      console.error("[bot] ❌ Ошибка парсинга данных из WebApp:", e);
      return next();
    }

    // Если анкета сохранена - отправляем приветственное сообщение с меню
    if (parsedData.action === "questionnaire_saved") {
      console.log("[bot] ========== ОБРАБОТКА QUESTIONNAIRE_SAVED ==========");
      console.log("[bot] Обработка questionnaire_saved для telegram_id:", telegram_id);
      console.log("[bot] Chat ID для отправки:", chat_id);
      console.log("[bot] Parsed data:", JSON.stringify(parsedData, null, 2));
      
      // ВАЖНО: Получаем СВЕЖИЕ данные пользователя из БД после сохранения анкеты
      // Ждем небольшую задержку, чтобы БД точно обновилась
      await new Promise(resolve => setTimeout(resolve, 500));
      
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

      // ВАЖНО: Отправляем сообщения ВСЕГДА, даже если пользователь не найден
      // Это гарантирует, что пользователь получит ответ
      console.log("[bot] 📤 Отправка подтверждения и меню после регистрации");
      console.log("[bot] User found:", user ? `id=${user.id}` : "NOT FOUND");
      console.log("[bot] Chat ID:", chat_id);
      console.log("[bot] Telegram ID:", telegram_id);
      
      // ШАГ 1: Отправляем подтверждение с правильным текстом
      const confirmationMessage = "✅ Ваши данные успешно сохранены! Теперь можете отправлять фото/текст/аудио еды — я всё проанализирую.";
      try {
        await ctx.reply(confirmationMessage);
        console.log("[bot] ✅ Подтверждение отправлено успешно");
      } catch (confirmError: any) {
        console.error("[bot] ❌ Ошибка отправки подтверждения:", confirmError);
        console.error("[bot] Confirm error details:", {
          message: confirmError?.message,
          code: confirmError?.response?.error_code,
          description: confirmError?.response?.description
        });
        // Пробуем через прямой API вызов
        try {
          await ctx.telegram.sendMessage(chat_id, confirmationMessage);
          console.log("[bot] ✅ Подтверждение отправлено через прямой API");
        } catch (directError: any) {
          console.error("[bot] ❌ Критическая ошибка отправки подтверждения:", directError);
          // Последняя попытка - без форматирования
          try {
            await ctx.telegram.sendMessage(chat_id, "Ваши данные успешно сохранены! Теперь можете отправлять фото/текст/аудио еды — я всё проанализирую.");
            console.log("[bot] ✅ Подтверждение отправлено через последнюю попытку");
          } catch (finalConfirmError: any) {
            console.error("[bot] ❌ ФИНАЛЬНАЯ ошибка отправки подтверждения:", finalConfirmError);
          }
        }
      }
      
      // ШАГ 2: Отправляем главное меню
      const userIdToUse = user?.id || null;
      try {
        await sendMainMenu(ctx, userIdToUse, "Выберите действие:");
        console.log("[bot] ✅ Меню после регистрации отправлено успешно");
      } catch (menuError: any) {
        console.error("[bot] ❌ Ошибка отправки меню:", menuError);
        console.error("[bot] Menu error details:", {
          message: menuError?.message,
          code: menuError?.response?.error_code,
          description: menuError?.response?.description
        });
        
        // Пробуем отправить меню еще раз с задержкой
        try {
          await new Promise(resolve => setTimeout(resolve, 500));
          await sendMainMenu(ctx, userIdToUse);
          console.log("[bot] ✅ Меню отправлено после повторной попытки");
        } catch (retryError: any) {
          console.error("[bot] ❌ Критическая ошибка отправки меню после повтора:", retryError);
          // Последняя попытка - через прямой API вызов
          try {
            const menu = getMainMenuKeyboard(userIdToUse);
            await ctx.telegram.sendMessage(chat_id, "Выберите действие:", {
              reply_markup: { ...menu, replace_keyboard: true }
            });
            console.log("[bot] ✅ Меню отправлено через прямой API вызов");
          } catch (finalError: any) {
            console.error("[bot] ❌ ФИНАЛЬНАЯ ошибка отправки меню:", finalError);
          }
        }
      }
      
      // ВАЖНО: Всегда возвращаем, чтобы не передавать управление дальше
      return;
    } else {
      console.log("[bot] Неизвестное действие:", parsedData.action);
    }
    
    // Если это web_app_data, не передаем дальше
    return;
  }
  
  // Для всех остальных сообщений передаем управление дальше
  return next();
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

async function analyzeFoodWithOpenAI(userInput: string): Promise<MealAnalysis | NotFoodResponse | null> {
  try {
    console.log(`[OpenAI] Начинаю анализ: "${userInput}"`);
    
    const prompt = `Ты — эксперт по питанию. Проанализируй текст пользователя и определи:

1. Говорит ли пользователь про ЕДУ? (блюда, продукты питания, напитки)
2. Если НЕТ — о чем идет речь?

Верни ТОЛЬКО JSON в одном из двух форматов:

Если пользователь описал ЕДУ:
{
  "isFood": true,
  "description": "краткое название блюда на русском",
  "calories": число (ккал),
  "protein": число (граммы),
  "fat": число (граммы),
  "carbs": число (граммы)
}

Если пользователь НЕ описал еду:
{
  "isFood": false,
  "whatIsIt": "о чем говорит пользователь (например: котик, погода, работа)",
  "message": "дружелюбное сообщение на русском с эмодзи, объясняющее что это не про еду (например: 'это не про еду, это про котика 😺' или 'это не про еду, это про погоду 🌤️')"
}

Текст от пользователя: "${userInput}"

ВАЖНО: Если текст не про еду, верни isFood: false с описанием и дружелюбным сообщением. Если это еда — оцени количество и определи калорийность и макроэлементы.`;

    console.log("[OpenAI] Отправляю запрос к OpenAI (модель: gpt-4o)...");
    let response;
    try {
      response = await openai.chat.completions.create({
        model: "gpt-4o",
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
    const todayISO = today.toISOString();

    const { data, error } = await supabase
      .from("diary")
      .select("calories, protein, fat, carbs")
      .eq("user_id", telegram_id)
      .gte("created_at", todayISO);

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
    message = `Вы уже съели сегодня:\n🔥 ${eaten.calories} ккал\n🥚 ${eaten.protein.toFixed(1)} г белков\n🥥 ${eaten.fat.toFixed(1)} г жиров\n🍚 ${eaten.carbs.toFixed(1)} г углеводов\n\n⚠️ Пройдите анкету, чтобы увидеть дневную норму.`;
  } else {
    const remaining = {
      calories: Math.max(0, norm.calories - eaten.calories),
      protein: Math.max(0, norm.protein - eaten.protein),
      fat: Math.max(0, norm.fat - eaten.fat),
      carbs: Math.max(0, norm.carbs - eaten.carbs)
    };

    message = `Вы уже съели сегодня:\n🔥 ${eaten.calories} / ${norm.calories} ккал (осталось: ${remaining.calories})\n🥚 ${eaten.protein.toFixed(1)} / ${norm.protein.toFixed(1)} г белков (осталось: ${remaining.protein.toFixed(1)})\n🥥 ${eaten.fat.toFixed(1)} / ${norm.fat.toFixed(1)} г жиров (осталось: ${remaining.fat.toFixed(1)})\n🍚 ${eaten.carbs.toFixed(1)} / ${norm.carbs.toFixed(1)} г углеводов (осталось: ${remaining.carbs.toFixed(1)})`;
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
        const response = `✅ Добавлено:\nвода\n🔥 0 ккал | 🥚 0.0г | 🥥 0.0г | 🍚 0.0г\n\n${formatProgressMessage(todayMeals, dailyNorm, { totalMl, goalMl })}`;

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
        `✅ Удалено: ${lastMeal.meal_text} (${lastMeal.calories} ккал)\n\n${formatProgressMessage(todayMeals, dailyNorm)}`
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

    if (text === "💡 Рекомендации") {
      const processingMsg = await ctx.reply("🤔 Анализирую ваше питание и готовлю рекомендации...");

      // Получаем данные пользователя
      const { data: userData } = await supabase
        .from("users")
        .select("calories, protein, fat, carbs, goal")
        .eq("telegram_id", telegram_id)
        .maybeSingle();

      if (!userData || !userData.calories) {
        await ctx.telegram.editMessageText(
          ctx.chat!.id,
          processingMsg.message_id,
          undefined,
          "❌ Сначала пройдите анкету, чтобы получить рекомендации."
        );
        return;
      }

      // Получаем все данные о питании за последние 30 дней для полного анализа
      const monthAgo = new Date();
      monthAgo.setDate(monthAgo.getDate() - 30);
      const monthAgoISO = monthAgo.toISOString();

      const { data: allMeals } = await supabase
        .from("diary")
        .select("calories, protein, fat, carbs, created_at")
        .eq("user_id", telegram_id)
        .gte("created_at", monthAgoISO)
        .order("created_at", { ascending: false });

      // Подсчитываем статистику
      const totals = (allMeals || []).reduce(
        (acc, meal) => ({
          calories: acc.calories + Number(meal.calories || 0),
          protein: acc.protein + Number(meal.protein || 0),
          fat: acc.fat + Number(meal.fat || 0),
          carbs: acc.carbs + Number(meal.carbs || 0)
        }),
        { calories: 0, protein: 0, fat: 0, carbs: 0 }
      );

      const daysWithMeals = new Set((allMeals || []).map(m => new Date(m.created_at).toDateString())).size;
      const avgDaily = daysWithMeals > 0 ? {
        calories: totals.calories / daysWithMeals,
        protein: totals.protein / daysWithMeals,
        fat: totals.fat / daysWithMeals,
        carbs: totals.carbs / daysWithMeals
      } : { calories: 0, protein: 0, fat: 0, carbs: 0 };

      // Получаем данные пользователя из анкеты
      const { data: userProfile } = await supabase
        .from("users")
        .select("gender, age, weight, height, activity, goal")
        .eq("telegram_id", telegram_id)
        .maybeSingle();

      const goalText = userData.goal === "lose" ? "похудение" : userData.goal === "gain" ? "набор веса" : "поддержание веса";
      const genderText = userProfile?.gender === "male" ? "мужчина" : "женщина";
      const activityText = userProfile?.activity === "low" ? "низкая" : 
                          userProfile?.activity === "moderate" ? "умеренная" :
                          userProfile?.activity === "high" ? "высокая" : "очень высокая";
      
      const prompt = `Ты — персональный тренер по питанию. Проанализируй данные и дай КРАТКИЕ, структурированные рекомендации.

ДАННЫЕ:
- Цель: ${goalText}
- Норма: ${userData.calories} ккал, Б: ${userData.protein}г, Ж: ${userData.fat}г, У: ${userData.carbs}г
- Факт (среднее за ${daysWithMeals} дней): ${avgDaily.calories.toFixed(0)} ккал (${((avgDaily.calories / userData.calories) * 100).toFixed(0)}%), Б: ${avgDaily.protein.toFixed(1)}г, Ж: ${avgDaily.fat.toFixed(1)}г, У: ${avgDaily.carbs.toFixed(1)}г

ВАЖНО:
- Ответ должен быть КРАТКИМ (максимум 400 слов)
- Используй markdown форматирование для Telegram: **жирный**, *курсив*
- Добавь смайлики по теме (но умеренно, 5-8 штук на весь текст)
- Структура: 3-4 коротких раздела с заголовками
- Без воды, только конкретика

Формат ответа:
**1. Оценка** (2-3 предложения с смайликами)
**2. Рекомендации** (конкретные цифры и продукты)
**3. Что изменить** (краткий список)`;

      try {
        const response = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: "Ты — персональный тренер по питанию. Дай КРАТКИЕ, структурированные рекомендации с умеренным использованием смайликов. Используй markdown для форматирования."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 500
        });

        const recommendations = response.choices[0]?.message?.content || "Не удалось сгенерировать рекомендации.";

        // Форматируем ответ для Telegram
        const formattedText = `💡 *Рекомендации по питанию*\n\n${recommendations}`;

        try {
          await ctx.telegram.editMessageText(
            ctx.chat!.id,
            processingMsg.message_id,
            undefined,
            formattedText,
            { parse_mode: "Markdown" }
          );
        } catch (markdownError: any) {
          // Если markdown не работает (спецсимволы), отправляем без форматирования
          console.error("[bot] Ошибка markdown, отправляю без форматирования:", markdownError);
          await ctx.telegram.editMessageText(
            ctx.chat!.id,
            processingMsg.message_id,
            undefined,
            `💡 Рекомендации по питанию:\n\n${recommendations}`
          );
        }
      } catch (error) {
        console.error("[bot] Ошибка генерации рекомендаций:", error);
        await ctx.telegram.editMessageText(
          ctx.chat!.id,
          processingMsg.message_id,
          undefined,
          "❌ Не удалось сгенерировать рекомендации. Попробуйте позже."
        );
      }
      return;
    }

    console.log(`[bot] Текстовое сообщение от ${telegram_id}: ${text}`);

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
    const response = `✅ Добавлено:\n${mealAnalysis.description}\n🔥 ${mealAnalysis.calories} ккал | 🥚 ${mealAnalysis.protein.toFixed(1)}г | 🥥 ${mealAnalysis.fat.toFixed(1)}г | 🍚 ${mealAnalysis.carbs.toFixed(1)}г\n\n${formatProgressMessage(todayMeals, dailyNorm)}`;

    await ctx.telegram.editMessageText(
      ctx.chat!.id,
      processingMsg.message_id,
      undefined,
      response
    );
  } catch (error) {
    console.error("[bot] Ошибка обработки текста:", error);
    ctx.reply("Произошла ошибка при обработке сообщения.");
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

    const data = ctx.callbackQuery.data;
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
        const response = `✅ Добавлено:\nвода\n🔥 0 ккал | 🥚 0.0г | 🥥 0.0г | 🍚 0.0г\n\n${formatProgressMessage(todayMeals, dailyNorm, { totalMl, goalMl })}`;

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

    // Находим последнюю запись за сегодня
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

    ctx.reply(
      `✅ Удалено: ${lastMeal.meal_text} (${lastMeal.calories} ккал)\n\n${formatProgressMessage(todayMeals, dailyNorm)}`
    );
  } catch (error) {
    console.error("[bot] Ошибка /отменить:", error);
    ctx.reply("Произошла ошибка.");
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

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString();

    const { data: meals, error } = await supabase
      .from("diary")
      .select("meal_text, calories, protein, fat, carbs, created_at")
      .eq("user_id", telegram_id)
      .gte("created_at", todayISO)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[bot] Ошибка получения отчёта:", error);
      return ctx.reply("❌ Ошибка базы данных.");
    }

    if (!meals || meals.length === 0) {
      return ctx.reply("📋 Сегодня ещё не было приёмов пищи.");
    }

    const todayMeals = await getTodayMeals(telegram_id);
    const dailyNorm = await getUserDailyNorm(telegram_id);

    let report = "📋 Отчёт за сегодня:\n\n";
    meals.forEach((meal, index) => {
      const time = new Date(meal.created_at).toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit"
      });
      report += `${index + 1}. ${meal.meal_text} (${time})\n   🔥 ${meal.calories} ккал | 🥚 ${Number(meal.protein).toFixed(1)}г | 🥥 ${Number(meal.fat).toFixed(1)}г | 🍚 ${Number(meal.carbs || 0).toFixed(1)}г\n\n`;
    });

    report += `\n${formatProgressMessage(todayMeals, dailyNorm)}`;

    ctx.reply(report);
  } catch (error) {
    console.error("[bot] Ошибка /отчет:", error);
    ctx.reply("Произошла ошибка.");
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
          content: "Ты — помощник по анализу питания. Всегда возвращай валидный JSON без дополнительного текста."
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Ты — эксперт по питанию. Проанализируй фото и определи:

1. Есть ли на фото ЕДА? (блюда, продукты питания, напитки)
2. Если НЕТ еды — что именно изображено? (животное, предмет, человек, пейзаж и т.д.)

Верни ТОЛЬКО JSON в одном из двух форматов:

Если на фото ЕДА:
{
  "isFood": true,
  "description": "краткое название блюда на русском",
  "calories": число (ккал),
  "protein": число (граммы),
  "fat": число (граммы),
  "carbs": число (граммы)
}

Если на фото НЕТ еды:
{
  "isFood": false,
  "whatIsIt": "что изображено на фото (например: котик, собака, машина, пейзаж)",
  "message": "дружелюбное сообщение на русском с эмодзи, объясняющее что это не еда (например: 'это не еда, это котик 😺' или 'это не еда, это красивый пейзаж 🌄')"
}

ВАЖНО: Если на фото нет еды, верни isFood: false с описанием что это и дружелюбным сообщением.`
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

    // Получаем фото в лучшем качестве
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    const file = await ctx.telegram.getFile(photo.file_id);
    const photoUrl = `https://api.telegram.org/file/bot${env.telegramBotToken}/${file.file_path}`;

    console.log(`[bot] URL фото: ${photoUrl}`);

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
    const response = `✅ Добавлено:\n${mealAnalysis.description}\n🔥 ${mealAnalysis.calories} ккал | 🥚 ${mealAnalysis.protein.toFixed(1)}г | 🥥 ${mealAnalysis.fat.toFixed(1)}г | 🍚 ${mealAnalysis.carbs.toFixed(1)}г\n\n${formatProgressMessage(todayMeals, dailyNorm)}`;

    await ctx.telegram.editMessageText(
      ctx.chat!.id,
      processingMsg.message_id,
      undefined,
      response
    );
  } catch (error) {
    console.error("[bot] Ошибка обработки фото:", error);
    ctx.reply("Произошла ошибка при обработке фото.");
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
    const response = `✅ Добавлено:\n${mealAnalysis.description}\n🔥 ${mealAnalysis.calories} ккал | 🥚 ${mealAnalysis.protein.toFixed(1)}г | 🥥 ${mealAnalysis.fat.toFixed(1)}г | 🍚 ${mealAnalysis.carbs.toFixed(1)}г\n\n${formatProgressMessage(todayMeals, dailyNorm)}`;

    await ctx.telegram.editMessageText(
      ctx.chat!.id,
      processingMsg.message_id,
      undefined,
      response
    );
  } catch (error) {
    console.error("[bot] Ошибка обработки аудио:", error);
    ctx.reply("Произошла ошибка при обработке голосового сообщения.");
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