import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Используем preview URL для dev ветки
const BASE_URL = (process.env.MINIAPP_BASE_URL || "https://step-one-app-git-dev-emins-projects-4717eabc.vercel.app").trim().replace(/\/$/, "");
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

function getMainMenuKeyboard(userId: number | null = null) {
  const reportUrl = userId ? `${BASE_URL}/report?id=${userId}` : undefined;
  const profileUrl = userId ? `${BASE_URL}/profile?id=${userId}` : undefined;

  const subscriptionUrl = userId ? `${BASE_URL}/subscription?id=${userId}` : undefined;
  
  return {
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
}

async function sendTelegramMessage(chatId: number, text: string, replyMarkup?: any) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_markup: replyMarkup
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[/api/notify-bot] Ошибка Telegram API:", errorText);
    throw new Error(`Telegram API error: ${response.status}`);
  }
}

export async function POST(req: Request) {
  if (!TELEGRAM_BOT_TOKEN) {
    console.error("[/api/notify-bot] TELEGRAM_BOT_TOKEN отсутствует");
    return NextResponse.json({ ok: false, error: "TELEGRAM_BOT_TOKEN is missing" }, { status: 500 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("[/api/notify-bot] Supabase env отсутствуют");
    return NextResponse.json({ ok: false, error: "Supabase credentials are missing" }, { status: 500 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch (e) {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const userId = Number(body?.userId);
  if (!Number.isFinite(userId) || userId <= 0) {
    return NextResponse.json({ ok: false, error: "userId is required" }, { status: 400 });
  }

  // Используем единый источник правды с проверкой URL
  const { getServerSupabaseClient } = await import("@/lib/supabase/server");
  const supabase = getServerSupabaseClient();
  const { data: user, error } = await supabase
    .from("users")
    .select("id, telegram_id")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("[/api/notify-bot] Ошибка Supabase:", error);
    return NextResponse.json({ ok: false, error: "Supabase error" }, { status: 500 });
  }

  if (!user?.telegram_id) {
    console.error("[/api/notify-bot] У пользователя нет telegram_id");
    return NextResponse.json({ ok: false, error: "telegram_id is missing for user" }, { status: 400 });
  }

  // PART 4: Если передан message, отправляем его с меню
  const messageText = body?.message || "Спасибо! Мы сохранили твои данные. Теперь вы можете отправлять фото, текст или аудио своих блюд — я всё проанализирую.";
  const shouldSendMenu = body?.sendMenu === true || !body?.message; // PART 4: Отправлять меню если sendMenu=true или если нет кастомного сообщения

  try {
    // Отправляем сообщение с меню
    const menuKeyboard = shouldSendMenu ? getMainMenuKeyboard(user.id) : undefined;
    await sendTelegramMessage(user.telegram_id, messageText, menuKeyboard);
    
    // PART 4: Меню отправляется сразу (no restart required)
    console.log("[/api/notify-bot] ✅ Message sent with menu (4 buttons)");
  } catch (sendError: any) {
    console.error("[/api/notify-bot] Ошибка отправки сообщений:", sendError);
    return NextResponse.json({ ok: false, error: "Failed to send telegram messages" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
