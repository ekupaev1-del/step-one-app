import { NextResponse } from "next/server";
import { calculateMacros } from "../../../lib/macroCalculator";
import { getServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = 'force-dynamic';

// Simple in-memory throttle to prevent spamming bot notifications
// Key: telegram_id, Value: timestamp of last notification
const notificationThrottle = new Map<number, number>();
const THROTTLE_MS = 60000; // 1 minute

// УДАЛЕНО: sendTelegramMessage больше не используется
// Меню теперь отправляется только через бота после получения questionnaire_saved
// Это гарантирует единую логику через sendMainMenu()

export async function POST(req: Request) {
  // Используем единый источник правды с проверкой URL
  const supabase = getServerSupabaseClient();

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
    name,
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
    name,
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

  // Валидация: если передаются все поля анкеты (не только phone/email), то проверяем все
  const isFullQuestionnaire = gender !== undefined && age !== undefined && weight !== undefined && 
                               height !== undefined && activity !== undefined && goal !== undefined;
  
  // Жёсткая валидация только при полном сохранении анкеты (когда передаются все поля)
  if (isFullQuestionnaire && isFirstTime) {
    if (!phone || !email || !gender || !age || !weight || !height || !activity || !goal) {
      return NextResponse.json(
        { ok: false, error: "Телефон, email, пол, возраст, вес, рост, активность и цель обязательны" },
        { status: 400 }
      );
    }
    // Серверный расчёт норм
    try {
      const calc = calculateMacros(
        gender,
        Number(age),
        Number(weight),
        Number(height),
        activity,
        goal
      );
      updateData.calories = calc.calories;
      updateData.protein = calc.protein;
      updateData.fat = calc.fat;
      updateData.carbs = calc.carbs;
      updateData.water_goal_ml = calc.waterGoalMl;
    } catch (calcErr: any) {
      return NextResponse.json(
        { ok: false, error: calcErr.message || "Ошибка расчёта норм" },
        { status: 400 }
      );
    }
  }

  if (name !== undefined) updateData.name = name || null;
  if (phone !== undefined) updateData.phone = phone || null;
  if (email !== undefined) updateData.email = email || null;
  if (gender !== undefined) updateData.gender = gender || null;
  if (age !== undefined) updateData.age = age || null;
  if (weight !== undefined) updateData.weight = weight || null;
  if (height !== undefined) updateData.height = height || null;
  if (activity !== undefined) updateData.activity = activity || null;
  if (goal !== undefined) updateData.goal = goal || null;
  if (calories !== undefined) updateData.calories = calories || updateData.calories || null;
  if (protein !== undefined) updateData.protein = protein || updateData.protein || null;
  if (fat !== undefined) updateData.fat = fat || updateData.fat || null;
  if (carbs !== undefined) updateData.carbs = carbs || updateData.carbs || null;
  if (water_goal_ml !== undefined) updateData.water_goal_ml = water_goal_ml || updateData.water_goal_ml || null;

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
    // Возвращаем 400, чтобы фронт видел корректный ответ, а не 404.
    return NextResponse.json(
      { ok: false, error: "Пользователь с таким id не найден. Запустите /start в боте" },
      { status: 400 }
    );
  }

  const user = data[0];
  console.log("[/api/save] OK updated id:", numericId);
  console.log("[/api/save] Данные пользователя:", { id: user.id, telegram_id: user.telegram_id });

  // Trigger bot follow-up message after onboarding save
  const isFullQuestionnaireSaved = user.telegram_id && isFirstTime && calories !== undefined && calories !== null;
  
  if (isFullQuestionnaireSaved) {
    // Throttle: only send notification once per minute per telegram_id
    const now = Date.now();
    const lastNotification = notificationThrottle.get(user.telegram_id);
    const shouldThrottle = lastNotification && (now - lastNotification) < THROTTLE_MS;
    
    if (shouldThrottle) {
      console.log("[/api/save] Пропускаем уведомление (throttle):", {
        telegramId: user.telegram_id,
        lastNotification: new Date(lastNotification!).toISOString(),
      });
    } else {
      console.log("[/api/save] Полная анкета сохранена - отправляем сообщение боту");
      
      // Update throttle
      notificationThrottle.set(user.telegram_id, now);
      
      // Call notify-bot API to send main menu
      // Use fire-and-forget to avoid blocking the response
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
                      process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` :
                      req.url.split('/api')[0];
      
      fetch(`${baseUrl}/api/notify-bot`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: user.id,
          message: "Выберите, что делать дальше:",
          sendMenu: true,
        }),
      }).catch((err) => {
        // Log error but don't fail the save request
        console.error("[/api/save] Ошибка отправки сообщения боту:", err);
      });
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
