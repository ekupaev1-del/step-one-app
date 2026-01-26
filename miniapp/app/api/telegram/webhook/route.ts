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
import { normalizeDiaryEntry, logPayloadDetails, type MealAnalysis } from "@/lib/diaryNormalize";
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

    // Log received update with diagnostic info
    console.log(`[TELEGRAM_WEBHOOK:${requestId}] Received update:`, {
      update_id: updatePayload?.update_id,
      telegram_user_id: telegramUserId,
      chat_id: chatId,
      message_id: messageId,
      has_text: !!text,
      text_length: text?.length || 0,
    });

    await logEvent("info", "telegram_webhook_received", {
      requestId,
      telegramUserId: telegramUserId,
      chatId: chatId,
      payload: {
        update_id: updatePayload?.update_id,
        has_message: !!message,
        has_text: !!text,
        message_id: messageId,
        text_length: text?.length || 0,
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
      console.log(`[TELEGRAM_WEBHOOK:${requestId}] User created/resolved:`, {
        telegram_user_id: telegramUserId,
        internal_user_id: userId,
        user_id_type: typeof userId,
      });
      await logEvent("info", "user_create_success", {
        requestId,
        userId: userId,
        telegramUserId: telegramUserId,
        payload: { userId, telegramUserId },
      });
    } else {
      userId = userData.id;
      console.log(`[TELEGRAM_WEBHOOK:${requestId}] User resolved:`, {
        telegram_user_id: telegramUserId,
        internal_user_id: userId,
        user_id_type: typeof userId,
      });
      await logEvent("info", "user_resolve_success", {
        requestId,
        userId: userId,
        telegramUserId: telegramUserId,
        payload: { userId, telegramUserId },
      });
    }

    // STEP 5: Insert into diary table
    // CRITICAL: Log diagnostic info before insert
    console.log(`[DB_INSERT_START:${requestId}] Preparing diary insert:`, {
      telegram_user_id: telegramUserId,
      internal_user_id: userId,
      user_id_type: typeof userId,
      user_id_value: userId,
      meal_text_length: mealAnalysis.description?.length || 0,
      calories_type: typeof mealAnalysis.calories,
      calories_value: mealAnalysis.calories,
    });

    await logEvent("info", "db_insert_start", {
      requestId,
      userId: userId,
      telegramUserId: telegramUserId,
      payload: { 
        userId, 
        telegramUserId,
        meal_text_length: mealAnalysis.description?.length || 0,
      },
    });

    // Prepare raw payload (before normalization)
    const rawDiaryEntry = {
      user_id: userId, // Should be BIGINT number
      telegram_user_id: telegramUserId, // Should be BIGINT number
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

    // Log raw payload with types (diagnostic)
    console.log(`[DB_INSERT:${requestId}] Raw payload types:`, {
      user_id: { value: rawDiaryEntry.user_id, type: typeof rawDiaryEntry.user_id },
      telegram_user_id: { value: rawDiaryEntry.telegram_user_id, type: typeof rawDiaryEntry.telegram_user_id },
      meal_text: { value: rawDiaryEntry.meal_text?.substring(0, 50), type: typeof rawDiaryEntry.meal_text },
      calories: { value: rawDiaryEntry.calories, type: typeof rawDiaryEntry.calories },
      protein: { value: rawDiaryEntry.protein, type: typeof rawDiaryEntry.protein },
      fat: { value: rawDiaryEntry.fat, type: typeof rawDiaryEntry.fat },
      carbs: { value: rawDiaryEntry.carbs, type: typeof rawDiaryEntry.carbs },
    });

    // Normalize payload to ensure correct types
    let diaryEntry;
    try {
      diaryEntry = normalizeDiaryEntry(rawDiaryEntry);
      logPayloadDetails(`DB_INSERT:${requestId}`, rawDiaryEntry, diaryEntry);
    } catch (normalizeError: any) {
      await logError("diary_normalize", normalizeError, {
        requestId,
        telegramUserId: String(telegramUserId),
        payload: { rawDiaryEntry },
      });
      const errorMsg = `❌ Ошибка обработки данных. Код: ${requestId}\n\nНапишите в поддержку: @STEP0NE11`;
      if (processingMessageId) {
        await sendTelegramEditMessage(chatId, processingMessageId, errorMsg, requestId);
      } else {
        await sendTelegramMessage(chatId, errorMsg, requestId);
      }
      return NextResponse.json({ ok: true });
    }

    // Log normalized payload (diagnostic)
    console.log(`[DB_INSERT:${requestId}] Normalized payload types:`, {
      user_id: { value: diaryEntry.user_id, type: typeof diaryEntry.user_id },
      telegram_user_id: { value: diaryEntry.telegram_user_id, type: typeof diaryEntry.telegram_user_id },
      calories: { value: diaryEntry.calories, type: typeof diaryEntry.calories },
      protein: { value: diaryEntry.protein, type: typeof diaryEntry.protein },
      fat: { value: diaryEntry.fat, type: typeof diaryEntry.fat },
      carbs: { value: diaryEntry.carbs, type: typeof diaryEntry.carbs },
    });

    await logEvent("info", "db_insert_normalized", {
      requestId,
      userId: userId,
      telegramUserId: telegramUserId,
      payload: {
        user_id: diaryEntry.user_id,
        calories: diaryEntry.calories,
        protein: diaryEntry.protein,
        fat: diaryEntry.fat,
        carbs: diaryEntry.carbs,
        allTypes: {
          user_id: typeof diaryEntry.user_id,
          telegram_user_id: typeof diaryEntry.telegram_user_id,
          calories: typeof diaryEntry.calories,
          protein: typeof diaryEntry.protein,
          fat: typeof diaryEntry.fat,
          carbs: typeof diaryEntry.carbs,
        },
      },
    });

    // Perform insert
    console.log(`[DB_INSERT:${requestId}] Executing Supabase insert...`);
    const { data: insertData, error: insertError } = await supabase
      .from("diary")
      .insert(diaryEntry)
      .select("id")
      .single();

    if (insertError) {
      // CRITICAL: Log DB insert error with FULL Postgres error details
      const errorDetails = {
        code: insertError.code || 'UNKNOWN',
        message: insertError.message || 'Unknown error',
        details: insertError.details || null,
        hint: insertError.hint || null,
        // Supabase/PostgREST specific fields
        statusCode: (insertError as any).status || null,
        statusText: (insertError as any).statusText || null,
        // Try to extract Postgres error details
        where: (insertError as any).where || null,
        schema: (insertError as any).schema || null,
        table: (insertError as any).table || null,
        column: (insertError as any).column || null,
        constraint: (insertError as any).constraint || null,
        // Full error object
        fullError: JSON.stringify(insertError, Object.getOwnPropertyNames(insertError)),
      };

      await logError("db_insert", insertError, {
        requestId,
        userId: userId,
        telegramUserId: telegramUserId,
        chatId: chatId,
        payload: {
          userId,
          normalizedDiaryEntry: {
            user_id: diaryEntry.user_id,
            telegram_user_id: diaryEntry.telegram_user_id,
            meal_text: diaryEntry.meal_text?.substring(0, 50),
            calories: diaryEntry.calories,
            protein: diaryEntry.protein,
            fat: diaryEntry.fat,
            carbs: diaryEntry.carbs,
            message_id: diaryEntry.message_id,
            chat_id: diaryEntry.chat_id,
            allTypes: {
              user_id: typeof diaryEntry.user_id,
              telegram_user_id: typeof diaryEntry.telegram_user_id,
              calories: typeof diaryEntry.calories,
              protein: typeof diaryEntry.protein,
              fat: typeof diaryEntry.fat,
              carbs: typeof diaryEntry.carbs,
              message_id: typeof diaryEntry.message_id,
              chat_id: typeof diaryEntry.chat_id,
            },
          },
          postgresError: errorDetails,
        },
      });

      // Also log to console for Vercel logs with full details
      console.error(`[DB_INSERT_ERROR:${requestId}] Postgres error:`, {
        code: errorDetails.code,
        message: errorDetails.message,
        details: errorDetails.details,
        hint: errorDetails.hint,
        table: errorDetails.table,
        column: errorDetails.column,
      });
      console.error(`[DB_INSERT_ERROR:${requestId}] Payload that failed:`, {
        normalizedPayload: diaryEntry,
        rawPayload: rawDiaryEntry,
      });

      // User-friendly error message with Postgres error code
      const pgCode = errorDetails.code || 'UNKNOWN';
      const errorMsg = `❌ Не сохранилось. Код: ${pgCode}. Напиши в поддержку: @STEP0NE11`;
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
    console.log(`[DB_INSERT_SUCCESS:${requestId}] Diary entry saved:`, {
      inserted_id: insertData?.id,
      user_id: userId,
      telegram_user_id: telegramUserId,
    });

    await logEvent("info", "db_insert_success", {
      requestId,
      userId: userId,
      telegramUserId: telegramUserId,
      payload: { insertedId: insertData?.id, userId, telegramUserId },
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
