/**
 * Helper функции для расчета калорий и макроэлементов
 */

import { calculateDailyWaterGoal, type ActivityLevel } from "./waterHelpers";

export interface MacroCalculationResult {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  waterGoalMl: number;
}

/**
 * Вычисляет дневные нормы калорий и макроэлементов
 * 
 * @param gender - пол: "male" или "female"
 * @param age - возраст в годах
 * @param weightKg - вес в килограммах
 * @param heightCm - рост в сантиметрах
 * @param activity - уровень активности
 * @param goal - цель: "lose", "maintain", "gain"
 * @returns объект с рассчитанными нормами
 */
export function calculateMacros(
  gender: string,
  age: number,
  weightKg: number,
  heightCm: number,
  activity: string,
  goal: string
): MacroCalculationResult {
  // Валидация входных данных
  if (!Number.isFinite(age) || !Number.isFinite(weightKg) || !Number.isFinite(heightCm)) {
    throw new Error("Некорректные данные: возраст, вес и рост должны быть числами");
  }

  if (age <= 0 || weightKg <= 0 || heightCm <= 0) {
    throw new Error("Некорректные данные: возраст, вес и рост должны быть положительными числами");
  }

  // Формула Миффлина-Сан Жеора для расчета базового метаболизма (BMR)
  let bmr = 0;
  if (gender === "male") {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  } else {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
  }

  // Коэффициент активности
  const activityMultipliers: Record<string, number> = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    very_active: 1.9
  };

  const multiplier = activityMultipliers[activity] || 1.55;
  let totalCalories = bmr * multiplier;

  // Корректировка по цели
  const goalMultipliers: Record<string, number> = {
    lose: 0.85,
    maintain: 1.0,
    gain: 1.15
  };

  const goalMultiplier = goalMultipliers[goal] || 1.0;
  totalCalories = Math.round(totalCalories * goalMultiplier);

  // Вычисляем норму воды
  const waterGoalMl = calculateDailyWaterGoal(weightKg, activity as ActivityLevel);

  // Макроэлементы
  // Белки: 2.2 г на 1 кг веса
  const proteinGrams = Math.round(weightKg * 2.2);
  const proteinCalories = proteinGrams * 4;

  // Жиры: 25% от общей калорийности
  const fatCalories = Math.round(totalCalories * 0.25);
  const fatGrams = Math.round(fatCalories / 9);

  // Углеводы: остаток калорий
  const carbsCalories = totalCalories - proteinCalories - fatCalories;
  const carbsGrams = Math.round(carbsCalories / 4);

  return {
    calories: totalCalories,
    protein: proteinGrams,
    fat: fatGrams,
    carbs: carbsGrams,
    waterGoalMl
  };
}












