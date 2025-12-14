/**
 * Helper функции для расчета калорий и макроэлементов
 * 
 * Формулы реализованы строго согласно спецификации:
 * - BMR: Mifflin-St Jeor
 * - Activity Factor: консервативные значения
 * - Макроэлементы: с безопасными ограничениями
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
 * @param activity - уровень активности: "sedentary", "light", "moderate", "active", "very_active"
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

  // ====================================================
  // 1) BMR — Mifflin-St Jeor (MANDATORY)
  // ====================================================
  let bmr = 0;
  if (gender === "male") {
    // Male: BMR = 10 * weight_kg + 6.25 * height_cm - 5 * age + 5
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  } else {
    // Female: BMR = 10 * weight_kg + 6.25 * height_cm - 5 * age - 161
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
  }

  // ====================================================
  // 2) ACTIVITY FACTOR (AF) - консервативные значения
  // ====================================================
  const activityFactors: Record<string, number> = {
    sedentary: 1.2,        // sedentary / no sport
    light: 1.35,            // 1–2 workouts/week OR lots of walking
    moderate: 1.55,         // 3–5 workouts/week
    active: 1.75,           // 6–7 workouts/week
    very_active: 1.9       // hard physical labor + sport (rare)
  };

  const af = activityFactors[activity] || 1.55; // default to moderate if unknown

  // TDEE = BMR * AF
  const tdee = bmr * af;

  // ====================================================
  // 3) CALORIES BY GOAL
  // ====================================================
  let totalCalories = 0;
  const isTeenager = age < 18;

  if (goal === "lose") {
    // Lose weight: kcal = TDEE * (1 - deficit)
    // Default deficit = 0.18, range = 0.15–0.20
    // For teenagers: max deficit = 0.05–0.10
    const deficit = isTeenager ? 0.075 : 0.18; // conservative for teens
    totalCalories = tdee * (1 - deficit);
  } else if (goal === "maintain") {
    // Maintain: kcal = TDEE
    totalCalories = tdee;
  } else if (goal === "gain") {
    // Gain weight: kcal = TDEE * (1 + surplus)
    // Default surplus = 0.10, range = 0.08–0.12
    const surplus = 0.10;
    totalCalories = tdee * (1 + surplus);
  } else {
    // Default to maintain if goal unknown
    totalCalories = tdee;
  }

  // ====================================================
  // 4) PROTEIN (CRITICAL FIX) - с жестким лимитом 1.8 г/кг
  // ====================================================
  let proteinGrams = 0;
  let pFactor = 1.5; // default

  if (goal === "lose") {
    if (isTeenager) {
      // Teenagers: protein range = 1.2–1.6 g/kg
      pFactor = activity === "sedentary" ? 1.4 : 1.6;
    } else {
      // Lose weight:
      // - sedentary → 1.6
      // - strength training 2–4x/week (moderate/active) → 1.8
      if (activity === "sedentary") {
        pFactor = 1.6;
      } else if (activity === "moderate" || activity === "active") {
        pFactor = 1.8; // assuming strength training for moderate/active
      } else {
        pFactor = 1.6; // light or very_active default to 1.6
      }
    }
  } else if (goal === "maintain") {
    // Maintain: 1.4–1.6 (default 1.5)
    if (isTeenager) {
      pFactor = 1.4; // conservative for teens
    } else {
      pFactor = 1.5;
    }
  } else if (goal === "gain") {
    // Gain weight: 1.6, max 1.8 ONLY if real gym training
    if (isTeenager) {
      pFactor = 1.4; // conservative for teens
    } else {
      if (activity === "moderate" || activity === "active" || activity === "very_active") {
        pFactor = 1.8; // assuming gym training
      } else {
        pFactor = 1.6;
      }
    }
  }

  // ABSOLUTE SAFETY: P = min(P, weight_kg * 1.8)
  // The bot must NEVER output protein above 1.8 g/kg
  proteinGrams = weightKg * pFactor;
  proteinGrams = Math.min(proteinGrams, weightKg * 1.8);

  // ====================================================
  // 5) FAT (SECOND ANCHOR)
  // ====================================================
  let fFactor = 0.85; // default

  if (goal === "lose") {
    // Lose weight → 0.75 (range 0.7–0.9)
    fFactor = 0.75;
  } else if (goal === "maintain") {
    // Maintain → 0.85 (range 0.8–1.0)
    fFactor = 0.85;
  } else if (goal === "gain") {
    // Gain → 0.9 (range 0.9–1.1)
    fFactor = 0.9;
  }

  let fatGrams = weightKg * fFactor;

  // MINIMUM FAT:
  // - men → at least 50 g
  // - women → at least 45 g
  const minFat = gender === "male" ? 50 : 45;
  fatGrams = Math.max(fatGrams, minFat);

  // ====================================================
  // 6) CARBS = REMAINDER
  // ====================================================
  const proteinCalories = proteinGrams * 4;
  const fatCalories = fatGrams * 9;
  const caloriesFromMacros = proteinCalories + fatCalories;
  const caloriesLeft = totalCalories - caloriesFromMacros;

  let carbsGrams = caloriesLeft / 4;

  // SAFETY RULE: carbs must be at least 80–100 g
  // If C < 80 g:
  // - reduce fat down to minimum allowed
  // - if still < 80, slightly reduce protein
  if (carbsGrams < 80) {
    // First, try reducing fat to minimum
    fatGrams = minFat;
    const newFatCalories = fatGrams * 9;
    const newCaloriesFromMacros = proteinCalories + newFatCalories;
    const newCaloriesLeft = totalCalories - newCaloriesFromMacros;
    carbsGrams = newCaloriesLeft / 4;

    // If still < 80, slightly reduce protein (but keep it reasonable)
    if (carbsGrams < 80) {
      // Reduce protein by 5% to free up calories
      const reducedProtein = proteinGrams * 0.95;
      const reducedProteinCalories = reducedProtein * 4;
      const finalCaloriesFromMacros = reducedProteinCalories + newFatCalories;
      const finalCaloriesLeft = totalCalories - finalCaloriesFromMacros;
      carbsGrams = finalCaloriesLeft / 4;
      
      // Update protein if we reduced it
      if (carbsGrams >= 80) {
        proteinGrams = reducedProtein;
      } else {
        // Last resort: set carbs to 80 and adjust
        carbsGrams = 80;
        const carbsCalories = carbsGrams * 4;
        const remainingForProteinAndFat = totalCalories - carbsCalories;
        // Distribute remaining: prioritize protein, then fat
        const maxProteinCalories = Math.min(proteinCalories, remainingForProteinAndFat * 0.6);
        proteinGrams = maxProteinCalories / 4;
        const remainingForFat = remainingForProteinAndFat - maxProteinCalories;
        fatGrams = Math.max(minFat, remainingForFat / 9);
      }
    }
  }

  // ====================================================
  // 7) ROUNDING (HUMAN-FRIENDLY)
  // ====================================================
  // Calories → round to nearest 50 kcal
  totalCalories = Math.round(totalCalories / 50) * 50;
  
  // Protein / Fat / Carbs → round to nearest 5 g
  proteinGrams = Math.round(proteinGrams / 5) * 5;
  fatGrams = Math.round(fatGrams / 5) * 5;
  carbsGrams = Math.round(carbsGrams / 5) * 5;

  // Final safety check: ensure protein never exceeds 1.8 g/kg after rounding
  const maxProtein = weightKg * 1.8;
  if (proteinGrams > maxProtein) {
    proteinGrams = Math.round(maxProtein / 5) * 5;
  }

  // Ensure carbs are at least 80g after rounding
  if (carbsGrams < 80) {
    carbsGrams = 80;
  }

  // Ensure fat meets minimum after rounding
  if (fatGrams < minFat) {
    fatGrams = Math.round(minFat / 5) * 5;
  }

  // ====================================================
  // 8) WATER GOAL
  // ====================================================
  const waterGoalMl = calculateDailyWaterGoal(weightKg, activity as ActivityLevel);

  return {
    calories: totalCalories,
    protein: proteinGrams,
    fat: fatGrams,
    carbs: carbsGrams,
    waterGoalMl
  };
}
