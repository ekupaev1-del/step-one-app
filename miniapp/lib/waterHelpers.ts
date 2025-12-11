/**
 * Helper функции для работы с водой
 */

export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';

/**
 * Вычисляет дневную норму воды на основе веса и уровня активности
 * 
 * Формула:
 * - Базовая норма: вес_кг * 30 мл
 * - Корректировка по активности:
 *   - sedentary/light: +0
 *   - moderate: +200
 *   - active/very_active: +400
 * - Ограничения: минимум 1500 мл, максимум 3500 мл
 * 
 * @param weightKg - вес в килограммах
 * @param activityLevel - уровень активности
 * @returns дневная норма воды в миллилитрах
 * 
 * Пример изменения формулы:
 * - Чтобы изменить базовую норму, измените множитель 30 на другое значение
 * - Чтобы изменить корректировки по активности, измените значения +200 и +400
 * - Чтобы изменить ограничения, измените 1500 и 3500
 */
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











