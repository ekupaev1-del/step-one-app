# Промпт для добавления кнопок выбора воды в Telegram боте

## Задача

Изменить логику обработки воды в Telegram боте так, чтобы когда пользователь пишет просто "вода" (без указания количества), бот спрашивал сколько выпил и показывал кнопки с вариантами ответов.

## Требования

1. **Когда пользователь пишет "вода"** (без числа):
   - Бот должен спросить: "💧 Сколько воды вы выпили?"
   - Показать inline кнопки:
     - "0.3 л (300 мл)"
     - "0.5 л (500 мл)"
     - "Свой вариант"

2. **При нажатии на кнопки 0.3 л или 0.5 л:**
   - Сразу логировать воду (300 мл или 500 мл)
   - Показать прогресс за день

3. **При нажатии на "Свой вариант":**
   - Бот должен попросить ввести количество в миллилитрах
   - Пользователь пишет число (например: 250, 300, 500)
   - Бот логирует это количество и показывает прогресс

## Файлы для изменения

1. `bot/src/services/water.ts` - добавить функцию `isWaterRequest()` для проверки простого запроса "вода"
2. `bot/src/index.ts` - изменить обработку текста и добавить обработчик callback_query

## Логика реализации

### 1. Функция проверки простого запроса

```typescript
export function isWaterRequest(text: string): boolean {
  const normalizedText = text.toLowerCase().trim();
  const simpleWaterRequests = ['вода', 'воды', 'водой', 'water', '💧'];
  return simpleWaterRequests.includes(normalizedText);
}
```

### 2. Обработка текста "вода"

В обработчике `bot.on("text")` ПЕРЕД вызовом `parseWaterAmount()`:

```typescript
if (isWaterRequest(text)) {
  return ctx.reply(
    "💧 Сколько воды вы выпили?",
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "0.3 л (300 мл)", callback_data: "water_300" },
            { text: "0.5 л (500 мл)", callback_data: "water_500" }
          ],
          [
            { text: "Свой вариант", callback_data: "water_custom" }
          ]
        ]
      }
    }
  );
}
```

### 3. Обработчик callback_query

Добавить новый обработчик:

```typescript
bot.on("callback_query", async (ctx) => {
  const data = ctx.callbackQuery.data;
  
  if (data.startsWith("water_")) {
    await ctx.answerCbQuery();
    
    if (data === "water_custom") {
      // Сохранить пользователя в Set ожидающих ввода
      waitingForWaterInput.add(telegram_id);
      return ctx.editMessageText("💧 Напишите количество воды в миллилитрах (например: 250, 300, 500)");
    }
    
    // Извлечь количество из callback_data (water_300, water_500)
    const amount = parseInt(data.replace("water_", ""), 10);
    
    // Логировать воду и показать прогресс
    await logWaterIntake(user.id, amount, 'telegram');
    const { totalMl, goalMl } = await getDailyWaterSummary(user.id);
    // Показать результат
  }
});
```

### 4. Обработка ввода после "Свой вариант"

В обработчике `bot.on("text")` ПЕРЕД проверкой `parseWaterAmount()`:

```typescript
// Проверяем, ожидает ли пользователь ввода воды
if (waitingForWaterInput.has(telegram_id)) {
  waitingForWaterInput.delete(telegram_id);
  
  // Извлечь число из текста
  const numbers = text.match(/\d+/g);
  if (!numbers) {
    return ctx.reply("❌ Не понял количество. Напишите число в миллилитрах");
  }
  
  const amount = parseInt(numbers[0], 10);
  // Валидация и логирование
}
```

### 5. Хранилище состояния

В начале файла `bot/src/index.ts`:

```typescript
// Хранилище для отслеживания пользователей, ожидающих ввода воды
const waitingForWaterInput = new Set<number>();
```

## Важные моменты

1. **Порядок проверок в обработчике текста:**
   - Сначала проверка `isWaterRequest()` - если просто "вода", показать кнопки
   - Затем проверка `waitingForWaterInput` - если ожидает ввода, обработать число
   - Затем проверка `parseWaterAmount()` - если есть количество в тексте

2. **Callback data формат:**
   - `water_300` - для 300 мл
   - `water_500` - для 500 мл
   - `water_custom` - для своего варианта

3. **Валидация:**
   - Количество должно быть от 1 до 4999 мл
   - При неверном вводе показать понятное сообщение об ошибке

4. **Ответы:**
   - После логирования показать прогресс за день
   - Формат: "💧 Добавлено: X мл\n\nСегодня: Y / Z мл (N%)"

## Статус

✅ **Реализовано** - изменения внесены в код
































