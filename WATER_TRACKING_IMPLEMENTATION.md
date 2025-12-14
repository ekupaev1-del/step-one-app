# Реализация отслеживания воды

## Список измененных файлов

### Новые файлы:
1. `migrations/add_water_tracking.sql` - SQL миграция для таблицы water_logs и поля water_goal_ml
2. `miniapp/lib/waterHelpers.ts` - функция calculateDailyWaterGoal
3. `miniapp/lib/waterService.ts` - функции logWaterIntake и getDailyWaterSummary
4. `bot/src/services/water.ts` - функции для бота (parseWaterAmount, logWaterIntake, getDailyWaterSummary)
5. `miniapp/app/api/water/add/route.ts` - API endpoint для добавления воды
6. `miniapp/app/api/water/summary/route.ts` - API endpoint для получения сводки по воде

### Измененные файлы:
1. `miniapp/app/questionnaire.tsx` - добавлен расчет и сохранение нормы воды
2. `miniapp/app/api/save/route.ts` - добавлено сохранение water_goal_ml
3. `miniapp/app/report/page.tsx` - добавлен UI для отображения и добавления воды
4. `bot/src/index.ts` - добавлена обработка текста о воде

---

## Часть 1: Миграция базы данных

### SQL миграция (`migrations/add_water_tracking.sql`)

```sql
-- Добавляем поле water_goal_ml в таблицу users
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS water_goal_ml INTEGER;

-- Создаем таблицу water_logs
CREATE TABLE IF NOT EXISTS water_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_ml INTEGER NOT NULL CHECK (amount_ml > 0 AND amount_ml < 5000),
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NOT NULL CHECK (source IN ('telegram', 'miniapp')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_water_logs_user_id ON water_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_water_logs_logged_at ON water_logs(logged_at);
CREATE INDEX IF NOT EXISTS idx_water_logs_user_date ON water_logs(user_id, DATE(logged_at));
```

**Выполнение:** Запустите этот SQL в Supabase SQL Editor.

---

## Часть 2: Расчет нормы воды

### Функция `calculateDailyWaterGoal` (`miniapp/lib/waterHelpers.ts`)

```typescript
export function calculateDailyWaterGoal(weightKg: number, activityLevel: ActivityLevel): number {
  // Базовая норма: вес * 30 мл
  let baseWater = weightKg * 30;

  // Корректировка по активности
  const activityAdjustments: Record<ActivityLevel, number> = {
    sedentary: 0,
    light: 0,
    moderate: 200,
    active: 400,
    very_active: 400
  };

  const adjustment = activityAdjustments[activityLevel] || 0;
  let totalWater = baseWater + adjustment;

  // Ограничения: минимум 1500 мл, максимум 3500 мл
  totalWater = Math.max(1500, Math.min(3500, totalWater));

  return Math.round(totalWater);
}
```

**Как изменить формулу:**
- Базовая норма: измените множитель `30` на другое значение (например, `35` для более высокой нормы)
- Корректировки по активности: измените значения `0`, `200`, `400` в объекте `activityAdjustments`
- Ограничения: измените `1500` (минимум) и `3500` (максимум)

---

## Часть 3: Логирование воды

### Функция `logWaterIntake` (`miniapp/lib/waterService.ts` и `bot/src/services/water.ts`)

```typescript
export async function logWaterIntake(
  userId: number,
  amountMl: number,
  source: 'telegram' | 'miniapp'
): Promise<void> {
  // Валидация: от 1 до 4999 мл
  if (amountMl <= 0 || amountMl >= 5000) {
    throw new Error(`Некорректное количество воды: ${amountMl} мл`);
  }

  const { error } = await supabase
    .from("water_logs")
    .insert({
      user_id: userId,
      amount_ml: amountMl,
      logged_at: new Date().toISOString(),
      source
    });

  if (error) {
    throw new Error(`Ошибка сохранения: ${error.message}`);
  }
}
```

### Функция `getDailyWaterSummary`

```typescript
export async function getDailyWaterSummary(
  userId: number,
  date: Date = new Date()
): Promise<{ totalMl: number; goalMl: number | null }> {
  // Получаем сумму воды за день
  // Получаем норму пользователя из users.water_goal_ml
  // Возвращаем { totalMl, goalMl }
}
```

---

## Часть 4: Обновление анкеты

### Изменения в `miniapp/app/questionnaire.tsx`:

1. Добавлен импорт:
```typescript
import { calculateDailyWaterGoal, type ActivityLevel } from "../lib/waterHelpers";
```

2. Добавлен state:
```typescript
const [waterGoal, setWaterGoal] = useState<number | null>(null);
```

3. В функции `calculateMacros` добавлен расчет воды:
```typescript
const waterGoalMl = calculateDailyWaterGoal(weightNum, activity as ActivityLevel);
setWaterGoal(waterGoalMl);
```

4. В `handleSubmit` добавлено в payload:
```typescript
water_goal_ml: waterGoal
```

### Изменения в `miniapp/app/api/save/route.ts`:

Добавлено сохранение `water_goal_ml` в UPDATE запрос:
```typescript
.update({
  // ... другие поля
  water_goal_ml: water_goal_ml || null
})
```

---

## Часть 5: Telegram бот - обработка текста

### Функция `parseWaterAmount` (`bot/src/services/water.ts`)

Распознает паттерны:
- "вода 250"
- "выпил 300"
- "плюс 150 воды"
- "+200"
- "water 300"
- "выпил воды 400"

```typescript
export function parseWaterAmount(text: string): number | null {
  const normalizedText = text.toLowerCase().trim();
  const waterKeywords = ['вода', 'воды', 'водой', 'выпил', 'выпила', 'выпито', 'water', 'плюс', '+'];
  
  const hasWaterKeyword = waterKeywords.some(keyword => normalizedText.includes(keyword));
  if (!hasWaterKeyword) return null;

  const numbers = normalizedText.match(/\d+/g);
  if (!numbers || numbers.length === 0) return null;

  const amount = parseInt(numbers[0], 10);
  if (amount > 0 && amount < 5000) return amount;
  
  return null;
}
```

### Обработка в `bot/src/index.ts`:

Добавлено ПЕРЕД анализом еды через OpenAI:
```typescript
const waterAmount = parseWaterAmount(text);
if (waterAmount !== null) {
  // Логируем воду
  await logWaterIntake(user.id, waterAmount, 'telegram');
  
  // Получаем сводку и отправляем ответ
  const { totalMl, goalMl } = await getDailyWaterSummary(user.id);
  // Формируем ответ с прогрессом
  return ctx.reply(response);
}
```

**Важно:** Обработка воды происходит БЕЗ кнопок, только через естественный текст.

---

## Часть 6: Mini App API endpoints

### POST `/api/water/add` (`miniapp/app/api/water/add/route.ts`)

```typescript
// Параметры: userId (query), amount (body)
// Валидация: amount от 1 до 4999 мл
// Вызывает logWaterIntake(userId, amount, 'miniapp')
```

### GET `/api/water/summary` (`miniapp/app/api/water/summary/route.ts`)

```typescript
// Параметры: userId (query), date (опционально)
// Возвращает { totalMl, goalMl }
```

---

## Часть 7: Mini App UI

### Изменения в `miniapp/app/report/page.tsx`:

1. Добавлены states:
```typescript
const [waterSummary, setWaterSummary] = useState<{ totalMl: number; goalMl: number | null } | null>(null);
const [loadingWater, setLoadingWater] = useState(false);
```

2. Добавлены функции:
- `loadWaterSummary()` - загружает сводку по воде
- `addWater(amount)` - добавляет воду через API

3. Добавлен UI блок с:
- Отображением прогресса (X / Y мл, процент)
- Прогресс-баром
- Кнопками быстрого добавления: +200, +250, +300, +500

---

## Как изменить формулу воды

### В файле `miniapp/lib/waterHelpers.ts`:

1. **Базовая норма:**
   - Измените `weightKg * 30` на другое значение (например, `weightKg * 35`)

2. **Корректировки по активности:**
   - Измените значения в объекте `activityAdjustments`:
   ```typescript
   const activityAdjustments: Record<ActivityLevel, number> = {
     sedentary: 0,    // измените на нужное
     light: 0,        // измените на нужное
     moderate: 200,   // измените на нужное
     active: 400,     // измените на нужное
     very_active: 400 // измените на нужное
   };
   ```

3. **Ограничения:**
   - Измените `Math.max(1500, ...)` для минимума
   - Измените `Math.min(3500, ...)` для максимума

---

## Тестирование

1. **Выполните миграцию** в Supabase SQL Editor
2. **Заполните анкету** - норма воды должна рассчитаться автоматически
3. **В Telegram боте** отправьте: "вода 250" или "выпил 300"
4. **В Mini App** откройте отчет и используйте кнопки для добавления воды

---

## Статус

✅ Все части реализованы и готовы к использованию.
















