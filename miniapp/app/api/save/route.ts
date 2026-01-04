import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { calculateMacros } from "../../../lib/macroCalculator";

export const dynamic = 'force-dynamic';

// УДАЛЕНО: sendTelegramMessage больше не используется
// Меню теперь отправляется только через бота после получения questionnaire_saved
// Это гарантирует единую логику через sendMainMenu()

export async function POST(req: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    console.error("[/api/save] NEXT_PUBLIC_SUPABASE_URL не установлен");
    return NextResponse.json(
      { ok: false, error: "supabaseUrl is required. Please configure NEXT_PUBLIC_SUPABASE_URL in Vercel environment variables." },
      { status: 500 }
    );
  }

  if (!supabaseKey) {
    console.error("[/api/save] SUPABASE_SERVICE_ROLE_KEY не установлен");
    return NextResponse.json(
      { ok: false, error: "Supabase service key is required. Please configure SUPABASE_SERVICE_ROLE_KEY in Vercel environment variables." },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

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

  // ВАЖНО: НЕ отправляем меню из API - пусть бот сам отправляет меню после получения questionnaire_saved
  // Это гарантирует единую логику отправки меню через sendMainMenu()
  const isFullQuestionnaireSaved = user.telegram_id && isFirstTime && calories !== undefined && calories !== null;
  
  if (isFullQuestionnaireSaved) {
    console.log("[/api/save] Полная анкета сохранена - бот отправит меню после получения questionnaire_saved");
  } else if (user.telegram_id && !isFirstTime) {
    console.log("[/api/save] Обновление анкеты - сообщение не отправляем");
  } else if (user.telegram_id && (calories === undefined || calories === null)) {
    console.log("[/api/save] Сохранение phone/email - сообщение не отправляем (будет отправлено после полной анкеты)");
  } else {
    console.warn("[/api/save] ⚠️ У пользователя нет telegram_id, сообщение не отправлено");
  }

  return NextResponse.json({ ok: true, id: user.id });
}
