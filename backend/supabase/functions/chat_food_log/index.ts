// Supabase Edge Function: chat_food_log
// Analyzes food text using OpenAI and saves to diary

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
const OPENAI_MODEL = Deno.env.get('OPENAI_MODEL') || 'gpt-4o'
// Поддерживаем новые названия без префикса SUPABASE_ (CLI не принимает такие secrets)
const SUPABASE_URL =
  Deno.env.get('SUPABASE_URL') ?? Deno.env.get('STEPONE_SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  Deno.env.get('STEPONE_SUPABASE_SERVICE_ROLE_KEY')

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !OPENAI_API_KEY) {
  console.error('[chat_food_log] Missing required env vars')
  throw new Error(
    'Missing env vars: SUPABASE_URL/STEPONE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/STEPONE_SUPABASE_SERVICE_ROLE_KEY or OPENAI_API_KEY'
  )
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
estimate a realistic average portion. Use rounded realistic values.`

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    // Parse request body
    let body
    try {
      body = await req.json()
    } catch (e) {
      console.error('[chat_food_log] Ошибка парсинга JSON:', e)
      return new Response(
        JSON.stringify({ error: 'Invalid JSON in request body' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const { text, userId: rawUserId, timezone, date, imageBase64, audioBase64 } = body

    // Конвертируем userId в number (может быть Int64 из Swift, который приходит как строка или число)
    const userId = typeof rawUserId === 'string' ? parseInt(rawUserId, 10) : Number(rawUserId)

    console.log('[chat_food_log] Получен запрос:', {
      rawUserId,
      userId,
      userIdType: typeof rawUserId,
      hasUserId: !!userId && !isNaN(userId),
      hasText: !!text && typeof text === 'string' && text.trim().length > 0,
      hasImage: !!imageBase64 && typeof imageBase64 === 'string' && imageBase64.trim().length > 0,
      hasAudio: !!audioBase64 && typeof audioBase64 === 'string' && audioBase64.trim().length > 0,
      imageBase64Length: imageBase64 ? (typeof imageBase64 === 'string' ? imageBase64.length : 'not a string') : 0
    })

    if (!userId || isNaN(userId) || userId === 0 || userId < 1) {
      return new Response(
        JSON.stringify({ error: `Missing or invalid userId. Received: ${rawUserId} (type: ${typeof rawUserId}), parsed: ${userId}` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Проверяем, что хотя бы один источник данных есть
    const hasText = text && typeof text === 'string' && text.trim().length > 0
    const hasImage = imageBase64 && typeof imageBase64 === 'string' && imageBase64.trim().length > 0
    const hasAudio = audioBase64 && typeof audioBase64 === 'string' && audioBase64.trim().length > 0

    if (!hasText && !hasImage && !hasAudio) {
      return new Response(
        JSON.stringify({ error: 'Missing text, imageBase64, or audioBase64' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client with service role key (no JWT needed)
    // We validate userId directly from the database instead of JWT
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Get user profile for daily norms and telegram_id
    const { data: userProfile, error: userError } = await supabase
      .from('users')
      .select('telegram_id, calories, protein, fat, carbs')
      .eq('id', userId)
      .single()

    if (userError || !userProfile) {
      return new Response(
        JSON.stringify({ error: 'User not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // КРИТИЧНО: Получаем telegram_id для использования в diary (бот использует telegram_id как user_id)
    // Если telegram_id нет, используем id (для iOS пользователей без Telegram)
    // Это гарантирует, что записи будут видны и в боте, и в iOS/miniapp
    const diaryUserId = userProfile.telegram_id || userId

    console.log('[chat_food_log] Пользователь:', {
      id: userId,
      telegram_id: userProfile.telegram_id,
      diaryUserId,
      'Используется для БД': diaryUserId === userProfile.telegram_id ? 'telegram_id' : 'id'
    })
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/43e8883f-375d-4d43-af6f-fef79b5ebbe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'backend/supabase/functions/chat_food_log/index.ts:136',message:'HYP-A: Edge Function user data',data:{userId,userProfileId:userProfile.id,telegramId:userProfile.telegram_id,diaryUserId},timestamp:Date.now(),sessionId:'debug-sync',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    let analyzedText = text
    let parsed: any = null

    // Если есть аудио - транскрибируем его
    if (audioBase64) {
      try {
        const audioBuffer = Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0))

        const formData = new FormData()
        const blob = new Blob([audioBuffer], { type: 'audio/m4a' })
        formData.append('file', blob, 'audio.m4a')
        formData.append('model', 'whisper-1')
        formData.append('language', 'ru')

        const transcriptionResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
          },
          body: formData
        })

        if (!transcriptionResponse.ok) {
          const error = await transcriptionResponse.text()
          console.error('[chat_food_log] Whisper error:', error)
          return new Response(
            JSON.stringify({ error: 'Ошибка транскрипции аудио' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          )
        }

        const transcriptionData = await transcriptionResponse.json()
        analyzedText = transcriptionData.text || ''
        console.log('[chat_food_log] Транскрибировано:', analyzedText)
      } catch (error) {
        console.error('[chat_food_log] Ошибка обработки аудио:', error)
        return new Response(
          JSON.stringify({ error: 'Ошибка обработки аудио' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
      }
    }

    // Если есть фото - анализируем его
    if (imageBase64) {
      try {
        const imageUrl = `data:image/jpeg;base64,${imageBase64}`
        
        const visionPrompt = `Проанализируй фото и определи:

1. Есть ли на фото ЕДА? (блюда, продукты питания, напитки)
2. Если НЕТ еды — что именно изображено?

ВАЖНО ДЛЯ ОЦЕНКИ ПОРЦИЙ ПО ФОТО:
- Оценивай порции на основе визуального объема и размера тарелки/блюда
- НЕ занижай порции! Если не уверен, выбирай среднее реалистичное значение
- Стандартная тарелка = ~300-400 г еды
- Глубокая тарелка/миска = ~250-350 г
- Маленькая тарелка = ~150-200 г

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
  "whatIsIt": "что изображено на фото",
  "message": "дружелюбное сообщение на русском с эмодзи, объясняющее что это не еда"
}

ВАЖНО: Если это еда — оцени РЕАЛИСТИЧНО на основе визуального объема, не занижай порции!`

        const visionResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o',
            messages: [
              {
                role: 'system',
                content: FOOD_ANALYSIS_SYSTEM_PROMPT + '\n\nAlways return valid JSON without additional text.'
              },
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: visionPrompt
                  },
                  {
                    type: 'image_url',
                    image_url: {
                      url: imageUrl
                    }
                  }
                ]
              }
            ],
            response_format: { type: 'json_object' },
            temperature: 0.3,
            max_tokens: 500
          })
        })

        if (!visionResponse.ok) {
          const error = await visionResponse.text()
          console.error('[chat_food_log] Vision error:', error)
          return new Response(
            JSON.stringify({ error: 'Ошибка анализа фото' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          )
        }

        const visionData = await visionResponse.json()
        const content = visionData.choices[0]?.message?.content
        if (content) {
          parsed = JSON.parse(content)
          
          // Если на фото не еда, возвращаем сообщение
          if (parsed.isFood === false) {
            return new Response(
              JSON.stringify({
                assistantText: parsed.message || `Это не про еду, это про ${parsed.whatIsIt || 'что-то другое'} 😊`,
                entry: null,
                totalsToday: null,
                remainingToday: null
              }),
              {
                status: 200,
                headers: {
                  'Content-Type': 'application/json',
                  'Access-Control-Allow-Origin': '*',
                },
              }
            )
          }
        }
      } catch (error) {
        console.error('[chat_food_log] Ошибка обработки фото:', error)
        return new Response(
          JSON.stringify({ error: 'Ошибка обработки фото' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
      }
    }

    // Если фото не было обработано и есть текст - анализируем текст
    if (!parsed && analyzedText) {
      // Call OpenAI (same prompt as in bot)
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

Текст от пользователя: "${analyzedText}"

ВАЖНО: 
- Если текст не про еду, верни isFood: false с описанием и дружелюбным сообщением.
- Если это еда — оцени РЕАЛИСТИЧНОЕ количество на основе типичных порций и определи калорийность и макроэлементы.
- Не занижай порции! Используй средние реалистичные значения.`

      const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          messages: [
            {
              role: 'system',
              content: FOOD_ANALYSIS_SYSTEM_PROMPT + '\n\nAlways return valid JSON without additional text.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.3
        })
      })

      if (!openaiResponse.ok) {
        const error = await openaiResponse.text()
        console.error('[chat_food_log] OpenAI error:', error)
        return new Response(
          JSON.stringify({ error: 'OpenAI API error', details: error }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
      }

      const openaiData = await openaiResponse.json()
      const content = openaiData.choices[0]?.message?.content
      if (!content) {
        return new Response(
          JSON.stringify({ error: 'Empty response from OpenAI' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
      }

      parsed = JSON.parse(content)

      // If not food, return early
      if (parsed.isFood === false) {
        return new Response(
          JSON.stringify({
            assistantText: parsed.message || `Это не про еду, это про ${parsed.whatIsIt || 'что-то другое'} 😊`,
            entry: null,
            totalsToday: null,
            remainingToday: null
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          }
        )
      }
    }

    // Если нет данных для анализа - возвращаем ошибку
    if (!parsed) {
      return new Response(
        JSON.stringify({ error: 'Missing text, image, or audio data' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Parse date
    // Если date не передан, используем текущую дату
    // Важно: date должен быть в формате ISO8601 (с timezone или UTC)
    const mealDate = date ? new Date(date) : new Date()
    // Для корректного сохранения используем UTC дату
    const createdAtIndexDB = mealDate.toISOString()
    // dateStr для ответа - это дата в локальном timezone пользователя (берем из переданного date или текущего)
    // Если date был передан как строка "2025-01-15", то new Date(date) создаст локальную дату,
    // и нам нужно извлечь только YYYY-MM-DD часть
    const dateStr = date && date.includes('T') 
      ? mealDate.toISOString().split('T')[0] 
      : (date || mealDate.toISOString().split('T')[0])
    const timeStr = mealDate.toTimeString().split(' ')[0].substring(0, 5)

    // Save to diary (используем telegram_id если есть, иначе id)
    const mealText = parsed.description || analyzedText || text || 'Еда'

    console.log('[chat_food_log] ========== СОХРАНЕНИЕ ЗАПИСИ ==========')
    console.log('[chat_food_log] userId (из запроса):', userId)
    console.log('[chat_food_log] =========================================')
    console.log('[chat_food_log] СОЗДАНИЕ ЗАПИСИ В БД:')
    console.log('[chat_food_log]   user_id (для БД):', diaryUserId, `(${diaryUserId === userProfile.telegram_id ? 'telegram_id' : 'id из users'})`)
    console.log('[chat_food_log]   meal_text:', mealText)
    console.log('[chat_food_log]   calories:', parsed.calories || 0)
    console.log('[chat_food_log]   protein:', parsed.protein || 0)
    console.log('[chat_food_log]   fat:', parsed.fat || 0)
    console.log('[chat_food_log]   carbs:', parsed.carbs || 0)
    console.log('[chat_food_log]   created_at (UTC):', createdAtIndexDB)
    console.log('[chat_food_log]   date (для ответа):', dateStr)
    console.log('[chat_food_log] =========================================')
    
    // КРИТИЧНО: Используем diaryUserId (telegram_id если есть, иначе id)
    // Это гарантирует единый формат записи, который будет виден и в боте, и в miniapp
    const { data: meal, error: mealError } = await supabase
      .from('diary')
      .insert({
        user_id: diaryUserId,  // КРИТИЧНО: telegram_id || id - единый формат для всех клиентов
        meal_text: mealText,
        calories: parsed.calories || 0,
        protein: parsed.protein || 0,
        fat: parsed.fat || 0,
        carbs: parsed.carbs || 0,
        created_at: createdAtIndexDB
      })
      .select()
      .single()

    if (mealError) {
      console.error('[chat_food_log] ❌ ОШИБКА сохранения записи:', mealError)
      return new Response(
        JSON.stringify({ error: 'Failed to save meal', details: mealError.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    console.log('[chat_food_log] ✅ Запись успешно сохранена в БД:')
    console.log('[chat_food_log]   meal.id:', meal.id)
    console.log('[chat_food_log]   meal.user_id:', meal.user_id)
    console.log('[chat_food_log]   meal.created_at (из БД):', meal.created_at)

    // Get today's totals
    const startOfDay = new Date(mealDate)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(mealDate)
    endOfDay.setHours(23, 59, 59, 999)

    // Получаем сегодняшние записи используя diaryUserId
    const { data: todayMeals, error: mealsError } = await supabase
      .from('diary')
      .select('calories, protein, fat, carbs')
      .eq('user_id', diaryUserId)
      .gte('created_at', startOfDay.toISOString())
      .lte('created_at', endOfDay.toISOString())

    if (mealsError) {
      console.error('[chat_food_log] Error getting today meals:', mealsError)
    }

    const totalsToday = todayMeals?.reduce((acc, m) => ({
      calories: acc.calories + (m.calories || 0),
      protein: acc.protein + (m.protein || 0),
      fat: acc.fat + (m.fat || 0),
      carbs: acc.carbs + (m.carbs || 0)
    }), { calories: 0, protein: 0, fat: 0, carbs: 0 }) || { calories: 0, protein: 0, fat: 0, carbs: 0 }

    const dailyNorm = {
      calories: userProfile.calories || 0,
      protein: userProfile.protein || 0,
      fat: userProfile.fat || 0,
      carbs: userProfile.carbs || 0
    }

    const remainingToday = {
      calories: Math.max(0, dailyNorm.calories - totalsToday.calories),
      protein: Math.max(0, dailyNorm.protein - totalsToday.protein),
      fat: Math.max(0, dailyNorm.fat - totalsToday.fat),
      carbs: Math.max(0, dailyNorm.carbs - totalsToday.carbs)
    }

    // Generate compact assistant text with all info in one message
    const remaining = {
      calories: remainingToday.calories,
      protein: remainingToday.protein,
      fat: remainingToday.fat,
      carbs: remainingToday.carbs
    }
    
    // Компактный формат: добавлено + макро + итоги за сегодня в одном сообщении
    let assistantText = ''
    
    if (dailyNorm.calories > 0) {
      assistantText = `✅ ${parsed.description}\n🔥 ${parsed.calories} ккал · 🥚 ${parsed.protein.toFixed(1)}г · 🥑 ${parsed.fat.toFixed(1)}г · 🍚 ${parsed.carbs.toFixed(1)}г\n\n📊 Итоги за сегодня:\n🔥 ${totalsToday.calories}/${dailyNorm.calories} ккал (осталось: ${remaining.calories})\n🥚 ${totalsToday.protein.toFixed(1)}/${dailyNorm.protein.toFixed(1)}г белков (осталось: ${remaining.protein.toFixed(1)}г)\n🥑 ${totalsToday.fat.toFixed(1)}/${dailyNorm.fat.toFixed(1)}г жиров (осталось: ${remaining.fat.toFixed(1)}г)\n🍚 ${totalsToday.carbs.toFixed(1)}/${dailyNorm.carbs.toFixed(1)}г углеводов (осталось: ${remaining.carbs.toFixed(1)}г)`
    } else {
      assistantText = `✅ ${parsed.description}\n🔥 ${parsed.calories} ккал · 🥚 ${parsed.protein.toFixed(1)}г · 🥑 ${parsed.fat.toFixed(1)}г · 🍚 ${parsed.carbs.toFixed(1)}г\n\n📊 Итоги за сегодня:\n🔥 ${totalsToday.calories} ккал · 🥚 ${totalsToday.protein.toFixed(1)}г · 🥑 ${totalsToday.fat.toFixed(1)}г · 🍚 ${totalsToday.carbs.toFixed(1)}г\n\n⚠️ Пройдите анкету, чтобы увидеть дневную норму`
    }

    return new Response(
      JSON.stringify({
        assistantText,
        entry: {
          title: parsed.description || analyzedText || text || 'Еда',
          calories: parsed.calories || 0,
          protein: parsed.protein || 0,
          fat: parsed.fat || 0,
          carbs: parsed.carbs || 0,
          date: dateStr,
          time: timeStr
        },
        totalsToday,
        remainingToday
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    )
  } catch (error) {
    console.error('[chat_food_log] Error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})


