import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = 'force-dynamic';

// Функция для отправки сообщения через Telegram Bot API
async function sendTelegramMessage(telegramId: number, text: string, keyboard?: any) {
  console.log("[/api/save] sendTelegramMessage вызвана для telegram_id:", telegramId);
  
  // Пробуем получить токен из разных источников
  const botToken = process.env.TELEGRAM_BOT_TOKEN || process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.error("[/api/save] ❌ TELEGRAM_BOT_TOKEN не установлен");
    const availableVars = Object.keys(process.env).filter(k => k.includes("TELEGRAM") || k.includes("BOT"));
    console.error("[/api/save] Доступные переменные окружения с TELEGRAM/BOT:", availableVars.length > 0 ? availableVars : "НЕТ");
    return;
  }

  console.log("[/api/save] ✅ Токен найден, отправляем сообщение...");
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const payload: any = {
    chat_id: telegramId,
    text: text,
    parse_mode: "HTML"
  };

  if (keyboard) {
    payload.reply_markup = keyboard;
  }

  try {
    console.log("[/api/save] ========== НАЧАЛО ОТПРАВКИ В TELEGRAM ==========");
    console.log("[/api/save] Отправка запроса в Telegram API...");
    console.log("[/api/save] URL:", url.replace(botToken.substring(0, 10), "***"));
    console.log("[/api/save] Payload:", JSON.stringify({ ...payload, text: payload.text.substring(0, 50) + "..." }));
    console.log("[/api/save] Telegram ID:", telegramId);
    
    // Добавляем таймаут для запроса
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.error("[/api/save] ❌❌❌ ТАЙМАУТ! Запрос не завершился за 10 секунд");
      controller.abort();
    }, 10000); // 10 секунд таймаут
    
    try {
      console.log("[/api/save] Выполняем fetch...");
      const fetchStartTime = Date.now();
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      
      const fetchDuration = Date.now() - fetchStartTime;
      clearTimeout(timeoutId);
      console.log("[/api/save] ✅ Fetch завершен за", fetchDuration, "мс");
      console.log("[/api/save] Ответ получен, статус:", response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("[/api/save] ❌ HTTP ошибка от Telegram API:", response.status);
        console.error("[/api/save] Текст ошибки:", errorText);
        try {
          const errorJson = JSON.parse(errorText);
          console.error("[/api/save] JSON ошибки:", JSON.stringify(errorJson, null, 2));
        } catch (e) {
          // Не JSON, просто текст
        }
        return;
      }
      
      console.log("[/api/save] Парсим JSON ответ...");
      const result = await response.json();
      console.log("[/api/save] ========== РЕЗУЛЬТАТ ОТ TELEGRAM API ==========");
      console.log("[/api/save] Результат:", JSON.stringify(result, null, 2));
      console.log("[/api/save] result.ok:", result.ok);
      
      if (!result.ok) {
        console.error("[/api/save] ❌ Ошибка отправки сообщения в Telegram:");
        console.error("[/api/save] Код ошибки:", result.error_code);
        console.error("[/api/save] Описание ошибки:", result.description);
        console.error("[/api/save] Полный ответ:", JSON.stringify(result, null, 2));
        console.log("[/api/save] ========== КОНЕЦ (ОШИБКА) ==========");
      } else {
        console.log("[/api/save] ✅ Сообщение успешно отправлено в Telegram");
        console.log("[/api/save] Message ID:", result.result?.message_id);
        console.log("[/api/save] Chat ID:", result.result?.chat?.id);
        console.log("[/api/save] ========== КОНЕЦ (УСПЕХ) ==========");
      }
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      console.error("[/api/save] ========== ОШИБКА В FETCH ==========");
      if (fetchError.name === 'AbortError') {
        console.error("[/api/save] ❌ Таймаут запроса к Telegram API (10 секунд)");
      } else {
        console.error("[/api/save] ❌ Ошибка fetch:", fetchError);
        console.error("[/api/save] Имя ошибки:", fetchError.name);
        console.error("[/api/save] Сообщение:", fetchError.message);
        throw fetchError; // Пробрасываем дальше
      }
      console.log("[/api/save] ========== КОНЕЦ (FETCH ERROR) ==========");
    }
  } catch (error: any) {
    console.error("[/api/save] ========== КРИТИЧЕСКАЯ ОШИБКА ==========");
    console.error("[/api/save] ❌ Ошибка при отправке сообщения:", error);
    console.error("[/api/save] Тип ошибки:", error?.constructor?.name);
    console.error("[/api/save] Сообщение ошибки:", error?.message);
    if (error?.stack) {
      console.error("[/api/save] Stack:", error.stack.substring(0, 500));
    }
    console.log("[/api/save] ========== КОНЕЦ (CRITICAL ERROR) ==========");
  }
}

export async function POST(req: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const url = new URL(req.url);
  const userId = url.searchParams.get("id");

  if (!userId) {
    console.error("[/api/save] Нет id в URL");
    return NextResponse.json(
      { ok: false, error: "ID отсутствует в URL" },
      { status: 400 }
    );
  }

  const numericId = Number(userId);
  if (!Number.isFinite(numericId)) {
    console.error("[/api/save] Некорректный id (не число):", userId);
    return NextResponse.json(
      { ok: false, error: "ID должен быть числом" },
      { status: 400 }
    );
  }

  const body = await req.json();
  const {
    phone,
    email,
    gender,
    age,
    weight,
    height,
    activity,
    goal,
    calories,
    protein,
    fat,
    carbs,
    water_goal_ml
  } = body;

  console.log("[/api/save] UPDATE users by id:", numericId, {
    phone,
    email,
    gender,
    age,
    weight,
    height,
    activity,
    goal,
    calories,
    protein,
    fat,
    carbs,
    water_goal_ml
  });

  // Сначала проверяем, была ли анкета уже заполнена (чтобы различать первое сохранение и обновление)
  const { data: existingUser } = await supabase
    .from("users")
    .select("calories")
    .eq("id", numericId)
    .maybeSingle();

  const isFirstTime = !existingUser || !existingUser.calories;
  console.log("[/api/save] Это первое сохранение?", isFirstTime);

  // ВАЖНО: Только UPDATE, никаких INSERT/UPSERT!
  // Форма НИКОГДА не должна создавать новые строки в users.
  // Бот создаёт строку при /start, форма только обновляет существующую.
  // Подготавливаем объект для обновления (только переданные поля)
  const updateData: any = {};
  
  if (phone !== undefined) updateData.phone = phone || null;
  if (email !== undefined) updateData.email = email || null;
  if (gender !== undefined) updateData.gender = gender || null;
  if (age !== undefined) updateData.age = age || null;
  if (weight !== undefined) updateData.weight = weight || null;
  if (height !== undefined) updateData.height = height || null;
  if (activity !== undefined) updateData.activity = activity || null;
  if (goal !== undefined) updateData.goal = goal || null;
  if (calories !== undefined) updateData.calories = calories || null;
  if (protein !== undefined) updateData.protein = protein || null;
  if (fat !== undefined) updateData.fat = fat || null;
  if (carbs !== undefined) updateData.carbs = carbs || null;
  if (water_goal_ml !== undefined) updateData.water_goal_ml = water_goal_ml || null;

  const { data, error } = await supabase
    .from("users")
    .update(updateData)
    .eq("id", numericId)
    .select("id, telegram_id");

  if (error) {
    console.error("[/api/save] supabase error:", error);
    // Если ошибка связана с telegram_id - это значит кто-то пытается создать строку
    // Этого не должно происходить, так как мы делаем только UPDATE
    if (error.message?.includes("telegram_id")) {
      console.error("[/api/save] КРИТИЧЕСКАЯ ОШИБКА: Попытка создать строку без telegram_id!");
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!data || data.length === 0) {
    console.error("[/api/save] Не найден пользователь с id:", numericId);
    // НИ В КОЕМ СЛУЧАЕ не создаём новую строку!
    return NextResponse.json(
      { ok: false, error: "Пользователь с таким id не найден. Запустите /start в боте" },
      { status: 404 }
    );
  }

  const user = data[0];
  console.log("[/api/save] OK updated id:", numericId);
  console.log("[/api/save] Данные пользователя:", { id: user.id, telegram_id: user.telegram_id });

  // Отправляем сообщение с меню ТОЛЬКО при сохранении полной анкеты (когда есть calories)
  // НЕ отправляем при сохранении только phone/email
  const isFullQuestionnaireSaved = user.telegram_id && isFirstTime && calories !== undefined && calories !== null;
  
  if (isFullQuestionnaireSaved) {
    console.log("[/api/save] Полная анкета сохранена - отправляем меню в Telegram");
    // Используем Preview URL из dev ветки для тестирования
    const miniappBaseUrl =
      process.env.NEXT_PUBLIC_MINIAPP_URL ||
      "https://step-one-app.vercel.app";
    const reportUrl = `${miniappBaseUrl}/report?id=${user.id}`;
    const profileUrl = `${miniappBaseUrl}/profile?id=${user.id}`;
    
    // Сообщение после сохранения анкеты
    const messageText = `✅ Отлично! Анкета сохранена.\n\n📸 Теперь вы можете отправлять фото, текст и аудио того, что кушаете, и бот проанализирует всё!`;
    
    // ЕДИНОЕ главное меню с 4 кнопками (как в боте)
    const keyboard = {
      keyboard: [
        [
          { text: "👤 Личный кабинет", web_app: { url: profileUrl } }
        ],
        [
          { text: "📊 Получить отчёт", web_app: { url: reportUrl } }
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

    // Пробуем отправить сообщение синхронно (await)
    try {
      console.log("[/api/save] Вызываем sendTelegramMessage (синхронно)...");
      await sendTelegramMessage(user.telegram_id, messageText, keyboard);
      console.log("[/api/save] ✅ sendTelegramMessage завершена успешно");
    } catch (err) {
      console.error("[/api/save] ❌ Ошибка отправки сообщения:", err);
      // Не прерываем выполнение - данные уже сохранены
    }
  } else if (user.telegram_id && !isFirstTime) {
    console.log("[/api/save] Обновление анкеты - сообщение не отправляем");
  } else if (user.telegram_id && (calories === undefined || calories === null)) {
    console.log("[/api/save] Сохранение phone/email - сообщение не отправляем (будет отправлено после полной анкеты)");
  } else {
    console.warn("[/api/save] ⚠️ У пользователя нет telegram_id, сообщение не отправлено");
  }

  return NextResponse.json({ ok: true, id: user.id });
}
