// Импорты
import { Telegraf } from "telegraf";
import { Readable } from "stream";
import { env } from "./config/env.js";
import { supabase } from "./services/supabase.js";
import { openai } from "./services/openai.js";

// Инициализация бота
const bot = new Telegraf(env.telegramBotToken);

// Миниап URL (будет обновлен после деплоя)
const MINIAPP_BASE_URL = process.env.MINIAPP_BASE_URL || "https://nutrition-app4.vercel.app";

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

    // Если анкета не заполнена - показываем приветствие
    if (!isQuestionnaireFilled) {
      const url = `${MINIAPP_BASE_URL}/?id=${userId}`;
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

    // Если анкета заполнена - показываем обычное меню
    const reportUrl = `${MINIAPP_BASE_URL}/report?id=${userId}`;
    const updateUrl = `${MINIAPP_BASE_URL}/?id=${userId}`;
    
    await ctx.reply("Добро пожаловать! Выберите действие:", {
      reply_markup: {
        keyboard: [
          [
            { text: "✏️ Обновить анкету", web_app: { url: updateUrl } }
          ],
          [
            { text: "📋 Получить отчет", web_app: { url: reportUrl } }
          ],
          [
            { text: "💡 Рекомендации" }
          ]
        ],
        resize_keyboard: true,
        one_time_keyboard: false
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

// Обработка данных из WebApp (когда пользователь отправляет данные через sendData)
bot.on("message", async (ctx, next) => {
  // Проверяем, есть ли данные из WebApp
  if (ctx.message && "web_app_data" in ctx.message) {
    console.log("[bot] Получены данные из WebApp");
    try {
      const telegram_id = ctx.from?.id;
      if (!telegram_id) {
        console.log("[bot] Нет telegram_id, пропускаем");
        return next();
      }

      const data = (ctx.message as any).web_app_data?.data;
      console.log("[bot] Данные из WebApp:", data);
      if (!data) {
        console.log("[bot] Нет данных в web_app_data, пропускаем");
        return next();
      }

      let parsedData;
      try {
        parsedData = JSON.parse(data);
        console.log("[bot] Распарсенные данные:", parsedData);
      } catch (e) {
        console.error("[bot] Ошибка парсинга данных из WebApp:", e);
        return next();
      }

      // Если анкета сохранена - отправляем приветственное сообщение с меню
      if (parsedData.action === "questionnaire_saved") {
        console.log("[bot] Обработка questionnaire_saved для telegram_id:", telegram_id);
        
        // Получаем userId для создания ссылок на Mini App
        const { data: user, error: userError } = await supabase
          .from("users")
          .select("id")
          .eq("telegram_id", telegram_id)
          .maybeSingle();

        if (userError) {
          console.error("[bot] Ошибка получения пользователя:", userError);
        }

        if (user) {
          const updateUrl = `${MINIAPP_BASE_URL}/?id=${user.id}`;
          const reportUrl = `${MINIAPP_BASE_URL}/report?id=${user.id}`;
          
          console.log("[bot] 📤 Отправка сообщения с меню для пользователя:", user.id);
          
          try {
            await ctx.reply(
              "✅ Отлично! Анкета сохранена.\n\n📸 Теперь вы можете отправлять фото, текст и аудио того, что кушаете, и бот проанализирует всё!",
              {
                reply_markup: {
                  keyboard: [
                    [
                      { text: "✏️ Обновить анкету", web_app: { url: updateUrl } }
                    ],
                    [
                      { text: "📋 Получить отчет", web_app: { url: reportUrl } }
                    ],
                    [
                      { text: "💡 Рекомендации" }
                    ]
                  ],
                  resize_keyboard: true,
                  one_time_keyboard: false
                }
              }
            );
            console.log("[bot] ✅ Сообщение с меню отправлено успешно");
          } catch (replyError: any) {
            console.error("[bot] ❌ Ошибка отправки сообщения:", replyError);
            // Пробуем отправить без меню
            try {
              await ctx.reply(
                "✅ Отлично! Анкета сохранена.\n\n📸 Теперь вы можете отправлять фото, текст и аудио того, что кушаете, и бот проанализирует всё!"
              );
            } catch (e) {
              console.error("[bot] ❌ Критическая ошибка отправки сообщения:", e);
            }
          }
        } else {
          console.log("[bot] ⚠️ Пользователь не найден, отправляем сообщение без меню");
          try {
            await ctx.reply(
              "✅ Отлично! Анкета сохранена.\n\n📸 Теперь вы можете отправлять фото, текст и аудио того, что кушаете, и бот проанализирует всё!"
            );
          } catch (e) {
            console.error("[bot] ❌ Ошибка отправки сообщения:", e);
          }
        }
        return; // Не передаем управление дальше
      } else {
        console.log("[bot] Неизвестное действие:", parsedData.action);
      }
    } catch (error) {
      console.error("[bot] Ошибка обработки web_app_data:", error);
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
  norm: { calories: number; protein: number; fat: number; carbs: number } | null
): string {
  if (!norm) {
    return `Вы уже съели сегодня:\n🔥 ${eaten.calories} ккал\n🥚 ${eaten.protein.toFixed(1)} г белков\n🥥 ${eaten.fat.toFixed(1)} г жиров\n🍚 ${eaten.carbs.toFixed(1)} г углеводов\n\n⚠️ Пройдите анкету, чтобы увидеть дневную норму.`;
  }

  const remaining = {
    calories: Math.max(0, norm.calories - eaten.calories),
    protein: Math.max(0, norm.protein - eaten.protein),
    fat: Math.max(0, norm.fat - eaten.fat),
    carbs: Math.max(0, norm.carbs - eaten.carbs)
  };

  return `Вы уже съели сегодня:\n🔥 ${eaten.calories} / ${norm.calories} ккал (осталось: ${remaining.calories})\n🥚 ${eaten.protein.toFixed(1)} / ${norm.protein.toFixed(1)} г белков (осталось: ${remaining.protein.toFixed(1)})\n🥥 ${eaten.fat.toFixed(1)} / ${norm.fat.toFixed(1)} г жиров (осталось: ${remaining.fat.toFixed(1)})\n🍚 ${eaten.carbs.toFixed(1)} / ${norm.carbs.toFixed(1)} г углеводов (осталось: ${remaining.carbs.toFixed(1)})`;
}

// ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
//      Обработка текстовых сообщений
// ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░

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

    // Кнопки "✏️ Обновить анкету" и "📋 Получить отчет" теперь напрямую открывают Mini App через web_app в keyboard button
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

      const updateUrl = user ? `${MINIAPP_BASE_URL}/?id=${user.id}` : "";
      const reportUrl = user ? `${MINIAPP_BASE_URL}/report?id=${user.id}` : "";

      // Возвращаем в главное меню
      const keyboardButtons: any[] = [
        [
          { text: "✏️ Обновить анкету", web_app: user ? { url: updateUrl } : undefined }
        ],
        [
          { text: "📋 Получить отчет", web_app: user ? { url: reportUrl } : undefined }
        ],
        [
          { text: "💡 Рекомендации" }
        ]
      ];

      await ctx.reply(
        `✅ Удалено: ${lastMeal.meal_text} (${lastMeal.calories} ккал)\n\n${formatProgressMessage(todayMeals, dailyNorm)}`,
        {
          reply_markup: {
            keyboard: keyboardButtons,
            resize_keyboard: true,
            one_time_keyboard: false
          }
        }
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

      const updateUrl = user ? `${MINIAPP_BASE_URL}/?id=${user.id}` : "";
      const reportUrl = user ? `${MINIAPP_BASE_URL}/report?id=${user.id}` : "";

      const keyboardButtons: any[] = [
        [
          { text: "✏️ Обновить анкету", web_app: user ? { url: updateUrl } : undefined }
        ],
        [
          { text: "📋 Получить отчет", web_app: user ? { url: reportUrl } : undefined }
        ],
        [
          { text: "💡 Рекомендации" }
        ]
      ];

      // Обновляем меню с минимальным сообщением
      return ctx.reply("•", {
        reply_markup: {
          keyboard: keyboardButtons,
          resize_keyboard: true,
          one_time_keyboard: false
        }
      });
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