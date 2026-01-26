/**
 * Telegram Webhook Handler
 * 
 * This endpoint receives Telegram updates and processes food messages.
 * All operations are wrapped in comprehensive error handling and logging.
 * 
 * POST /api/telegram/webhook
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabaseAdmin";
import { logEvent, logError, generateRequestId } from "@/lib/logging";
import OpenAI from "openai";

// Lazy initialization of OpenAI client to avoid build-time errors
function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  return new OpenAI({ apiKey });
}

function getTelegramApiUrl(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is not set");
  }
  return `https://api.telegram.org/bot${token}`;
}

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

Always estimate:
- total weight in grams
- calories (kcal)
- proteins (g)
- fats (g)
- carbohydrates (g)

Always return valid JSON without additional text.`;

async function analyzeFoodWithOpenAI(
  userInput: string,
  requestId: string
): Promise<MealAnalysis | NotFoodResponse | null> {
  try {
    await logEvent("info", "openai_analysis_start", {
      requestId,
      payload: { inputLength: userInput.length },
    });

    const openai = getOpenAIClient();

    const prompt = `Проанализируй текст пользователя и определи:

1. Говорит ли пользователь про ЕДУ? (блюда, продукты питания, напитки)
2. Если НЕТ — о чем идет речь?

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
  "whatIsIt": "о чем говорит пользователь",
  "message": "дружелюбное сообщение на русском с эмодзи"
}

Текст от пользователя: "${userInput}"`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: FOOD_ANALYSIS_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      await logError("openai_analysis", new Error("Empty response from OpenAI"), {
        requestId,
      });
      return null;
    }

    const parsed = JSON.parse(content);

    if (parsed.isFood === false) {
      await logEvent("info", "openai_analysis_not_food", {
        requestId,
        payload: { whatIsIt: parsed.whatIsIt },
      });
      return {
        isNotFood: true,
        message: parsed.message || `Это не про еду 😊`,
      };
    }

    const result: MealAnalysis = {
      description: parsed.description || userInput,
      calories: Number(parsed.calories) || 0,
      protein: Number(parsed.protein) || 0,
      fat: Number(parsed.fat) || 0,
      carbs: Number(parsed.carbs) || 0,
    };

    await logEvent("info", "openai_analysis_success", {
      requestId,
      payload: result,
    });

    return result;
  } catch (error: any) {
    await logError("openai_analysis", error, { requestId });
    return null;
  }
}

async function sendTelegramMessage(
  chatId: number,
  text: string,
  requestId: string
): Promise<boolean> {
  try {
    const telegramApiUrl = getTelegramApiUrl();
    const response = await fetch(`${telegramApiUrl}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      await logError(
        "telegram_send_message",
        new Error(`Telegram API error: ${response.status} - ${errorText}`),
        { requestId, chatId: String(chatId) }
      );
      return false;
    }

    await logEvent("info", "telegram_send_message_success", {
      requestId,
      chatId: String(chatId),
    });

    return true;
  } catch (error: any) {
    await logError("telegram_send_message", error, {
      requestId,
      chatId: String(chatId),
    });
    return false;
  }
}

async function sendTelegramEditMessage(
  chatId: number,
  messageId: number,
  text: string,
  requestId: string
): Promise<boolean> {
  try {
    const telegramApiUrl = getTelegramApiUrl();
    const response = await fetch(`${telegramApiUrl}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: "HTML",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      await logError(
        "telegram_edit_message",
        new Error(`Telegram API error: ${response.status} - ${errorText}`),
        { requestId, chatId: String(chatId), payload: { messageId } }
      );
      return false;
    }

    return true;
  } catch (error: any) {
    await logError("telegram_edit_message", error, {
      requestId,
      chatId: String(chatId),
    });
    return false;
  }
}

export async function POST(req: NextRequest) {
  const requestId = generateRequestId();
  let updatePayload: any = null;

  try {
    // STEP 1: Parse incoming update
    updatePayload = await req.json();

    const message = updatePayload?.message;
    const telegramUserId = message?.from?.id;
    const chatId = message?.chat?.id;
    const messageId = message?.message_id;
    const text = message?.text?.trim();

    // Log received update
    await logEvent("info", "telegram_webhook_received", {
      requestId,
      telegramUserId: telegramUserId ? String(telegramUserId) : undefined,
      chatId: chatId ? String(chatId) : undefined,
      payload: {
        update_id: updatePayload?.update_id,
        has_message: !!message,
        has_text: !!text,
        message_id: messageId,
      },
    });

    // Store incoming message in database
    const supabase = createServerSupabaseClient();
    if (telegramUserId && chatId) {
      try {
        await supabase.from("incoming_messages").insert({
          telegram_user_id: String(telegramUserId),
          chat_id: String(chatId),
          text: text || null,
          status: "received",
          request_id: requestId,
          message_id: messageId || null,
          update_payload: updatePayload,
        });
      } catch (insertError: any) {
        // Log but don't fail - this is just for tracking
        await logError("incoming_messages_insert", insertError, { requestId });
      }
    }

    // Validate required fields
    if (!telegramUserId || !chatId) {
      await logEvent("warn", "telegram_webhook_invalid", {
        requestId,
        payload: { reason: "missing_telegram_user_id_or_chat_id" },
      });
      return NextResponse.json({ ok: true }); // Return 200 to avoid Telegram retries
    }

    if (!text) {
      // Not a text message, ignore
      return NextResponse.json({ ok: true });
    }

    // Ignore commands
    if (text.startsWith("/")) {
      return NextResponse.json({ ok: true });
    }

    // Log parsed message text
    await logEvent("info", "telegram_message_parsed", {
      requestId,
      telegramUserId: String(telegramUserId),
      chatId: String(chatId),
      payload: { text: text.substring(0, 200) },
    });

    // STEP 2: Send "Analyzing..." message
    const telegramApiUrl = getTelegramApiUrl();
    const processingMessage = await fetch(`${telegramApiUrl}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: "🔍 Анализирую еду...",
      }),
    });

    let processingMessageId: number | null = null;
    if (processingMessage.ok) {
      const processingData = await processingMessage.json();
      processingMessageId = processingData?.result?.message_id || null;
    }

    // STEP 3: Analyze food with OpenAI
    await logEvent("info", "food_analysis_start", {
      requestId,
      telegramUserId: String(telegramUserId),
      chatId: String(chatId),
    });

    const analysis = await analyzeFoodWithOpenAI(text, requestId);

    if (!analysis) {
      const errorMsg = `❌ Не удалось проанализировать еду. Попробуйте описать подробнее.\n\nКод запроса: ${requestId}`;
      if (processingMessageId) {
        await sendTelegramEditMessage(chatId, processingMessageId, errorMsg, requestId);
      } else {
        await sendTelegramMessage(chatId, errorMsg, requestId);
      }

      // Update incoming message status
      if (telegramUserId && chatId) {
        await supabase
          .from("incoming_messages")
          .update({ status: "failed", error: "OpenAI analysis failed" })
          .eq("request_id", requestId);
      }

      return NextResponse.json({ ok: true });
    }

    // Check if not food
    if ("isNotFood" in analysis && analysis.isNotFood) {
      const notFoodMsg = analysis.message;
      if (processingMessageId) {
        await sendTelegramEditMessage(chatId, processingMessageId, notFoodMsg, requestId);
      } else {
        await sendTelegramMessage(chatId, notFoodMsg, requestId);
      }

      // Update incoming message status
      if (telegramUserId && chatId) {
        await supabase
          .from("incoming_messages")
          .update({ status: "processed" })
          .eq("request_id", requestId);
      }

      return NextResponse.json({ ok: true });
    }

    const mealAnalysis = analysis as MealAnalysis;

    // STEP 4: Resolve user from database
    await logEvent("info", "user_resolve_start", {
      requestId,
      telegramUserId: String(telegramUserId),
    });

    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("id")
      .eq("telegram_id", telegramUserId)
      .maybeSingle();

    if (userError) {
      await logError("user_resolve", userError, {
        requestId,
        telegramUserId: String(telegramUserId),
      });
    }

    let userId: number;
    if (!userData) {
      // Create user if doesn't exist
      const { data: newUser, error: createError } = await supabase
        .from("users")
        .upsert({ telegram_id: telegramUserId }, { onConflict: "telegram_id" })
        .select("id")
        .single();

      if (createError || !newUser) {
        await logError("user_create", createError || new Error("Failed to create user"), {
          requestId,
          telegramUserId: String(telegramUserId),
        });

        const errorMsg = `❌ Ошибка: не удалось создать пользователя. Используйте /start для регистрации.\n\nКод запроса: ${requestId}`;
        if (processingMessageId) {
          await sendTelegramEditMessage(chatId, processingMessageId, errorMsg, requestId);
        } else {
          await sendTelegramMessage(chatId, errorMsg, requestId);
        }

        // Update incoming message status
        if (telegramUserId && chatId) {
          await supabase
            .from("incoming_messages")
            .update({ status: "failed", error: "User creation failed" })
            .eq("request_id", requestId);
        }

        return NextResponse.json({ ok: true });
      }

      userId = newUser.id;
      await logEvent("info", "user_create_success", {
        requestId,
        telegramUserId: String(telegramUserId),
        payload: { userId },
      });
    } else {
      userId = userData.id;
      await logEvent("info", "user_resolve_success", {
        requestId,
        telegramUserId: String(telegramUserId),
        payload: { userId },
      });
    }

    // STEP 5: Insert into diary table
    await logEvent("info", "db_insert_start", {
      requestId,
      telegramUserId: String(telegramUserId),
      payload: { userId },
    });

    const diaryEntry = {
      user_id: userId,
      telegram_user_id: telegramUserId,
      meal_text: mealAnalysis.description,
      calories: mealAnalysis.calories,
      protein: mealAnalysis.protein,
      fat: mealAnalysis.fat,
      carbs: mealAnalysis.carbs,
      source: "telegram",
      message_id: messageId || null,
      chat_id: chatId || null,
      parsed_json: mealAnalysis,
    };

    const { data: insertData, error: insertError } = await supabase
      .from("diary")
      .insert(diaryEntry)
      .select("id")
      .single();

    if (insertError) {
      // CRITICAL: Log DB insert error with full context
      await logError("db_insert", insertError, {
        requestId,
        telegramUserId: String(telegramUserId),
        chatId: String(chatId),
        payload: {
          userId,
          diaryEntry: {
            user_id: diaryEntry.user_id,
            meal_text_length: diaryEntry.meal_text?.length || 0,
            has_calories: diaryEntry.calories !== undefined,
          },
          supabaseError: {
            code: insertError.code,
            message: insertError.message,
            details: insertError.details,
            hint: insertError.hint,
          },
        },
      });

      // Also log to console for Vercel logs
      console.error(`[DB_INSERT_ERROR:${requestId}]`, {
        error: insertError,
        diaryEntry,
      });

      const errorMsg = `❌ Не сохранилось в базу данных. Код: ${requestId}\n\nНапишите в поддержку: @STEP0NE11`;
      if (processingMessageId) {
        await sendTelegramEditMessage(chatId, processingMessageId, errorMsg, requestId);
      } else {
        await sendTelegramMessage(chatId, errorMsg, requestId);
      }

      // Update incoming message status
      if (telegramUserId && chatId) {
        await supabase
          .from("incoming_messages")
          .update({
            status: "failed",
            error: `DB insert failed: ${insertError.message}`,
          })
          .eq("request_id", requestId);
      }

      return NextResponse.json({ ok: true });
    }

    // STEP 6: Success - send confirmation
    await logEvent("info", "db_insert_success", {
      requestId,
      telegramUserId: String(telegramUserId),
      payload: { insertedId: insertData?.id, userId },
    });

    const successMsg = `✅ Добавлено:\n${mealAnalysis.description}\n🔥 ${mealAnalysis.calories} ккал | 🥚 ${mealAnalysis.protein.toFixed(1)}г | 🥑 ${mealAnalysis.fat.toFixed(1)}г | 🍚 ${mealAnalysis.carbs.toFixed(1)}г`;
    
    if (processingMessageId) {
      await sendTelegramEditMessage(chatId, processingMessageId, successMsg, requestId);
    } else {
      await sendTelegramMessage(chatId, successMsg, requestId);
    }

    // Update incoming message status
    if (telegramUserId && chatId) {
      await supabase
        .from("incoming_messages")
        .update({ status: "processed" })
        .eq("request_id", requestId);
    }

    await logEvent("info", "telegram_webhook_success", {
      requestId,
      telegramUserId: String(telegramUserId),
      chatId: String(chatId),
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    // CRITICAL: Catch-all error handler
    await logError("telegram_webhook", error, {
      requestId,
      payload: { updatePayload },
    });

    // Also log to console for Vercel logs
    console.error(`[TELEGRAM_WEBHOOK_ERROR:${requestId}]`, {
      error: error?.message,
      stack: error?.stack,
      updatePayload,
    });

    // Try to send error message to user if we have chat info
    try {
      const message = updatePayload?.message;
      const chatId = message?.chat?.id;
      if (chatId && process.env.TELEGRAM_BOT_TOKEN) {
        await sendTelegramMessage(
          chatId,
          `❌ Произошла ошибка при обработке сообщения. Код: ${requestId}\n\nНапишите в поддержку: @STEP0NE11`,
          requestId
        );
      }
    } catch (replyError: any) {
      // Ignore - we already logged the main error
      console.error(`[TELEGRAM_WEBHOOK_ERROR:${requestId}] Failed to send error message:`, replyError);
    }

    // Always return 200 to prevent Telegram retries
    return NextResponse.json({ ok: true });
  }
}
