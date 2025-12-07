"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense } from "react";
import "../globals.css";
import AppLayout from "../components/AppLayout";

interface ProfileData {
  name: string | null;
  weightKg: number | null;
  heightCm: number | null;
  goal: string | null;
  activityLevel: string | null;
  gender: string | null;
  age: number | null;
  caloriesGoal: number | null;
  proteinGoal: number | null;
  fatGoal: number | null;
  carbsGoal: number | null;
  waterGoalMl: number | null;
}

function ProfilePageContent() {
  const searchParams = useSearchParams();
  const userIdParam = searchParams.get("id");
  
  const [userId, setUserId] = useState<number | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [normsExpanded, setNormsExpanded] = useState(false);

  // Редактируемые поля
  const [editWeight, setEditWeight] = useState<string>("");
  const [editHeight, setEditHeight] = useState<string>("");
  const [editGoal, setEditGoal] = useState<string>("");
  const [editActivity, setEditActivity] = useState<string>("");
  const [editGender, setEditGender] = useState<string>("");
  const [editAge, setEditAge] = useState<string>("");

  // Инициализация userId
  useEffect(() => {
    if (userIdParam) {
      const n = Number(userIdParam);
      if (Number.isFinite(n) && n > 0) {
        setUserId(n);
        setError(null);
      } else {
        setError("Некорректный id пользователя");
        setLoading(false);
      }
    } else {
      setError("ID не передан");
      setLoading(false);
    }
  }, [userIdParam]);

  // Загрузка данных профиля
  useEffect(() => {
    if (!userId) return;

    const loadProfile = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/user?userId=${userId}`);
        const data = await response.json();

        if (!response.ok || !data.ok) {
          throw new Error(data.error || "Ошибка загрузки профиля");
        }

        setProfile({
          name: data.name,
          weightKg: data.weightKg,
          heightCm: data.heightCm,
          goal: data.goal,
          activityLevel: data.activityLevel,
          gender: data.gender,
          age: data.age,
          caloriesGoal: data.caloriesGoal,
          proteinGoal: data.proteinGoal,
          fatGoal: data.fatGoal,
          carbsGoal: data.carbsGoal,
          waterGoalMl: data.waterGoalMl
        });

        // Инициализируем поля редактирования
        setEditWeight(data.weightKg?.toString() || "");
        setEditHeight(data.heightCm?.toString() || "");
        setEditGoal(data.goal || "");
        setEditActivity(data.activityLevel || "");
        setEditGender(data.gender || "");
        setEditAge(data.age?.toString() || "");
      } catch (err: any) {
        console.error("[profile] Ошибка загрузки:", err);
        setError(err.message || "Ошибка загрузки профиля");
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [userId]);

  // Функция для форматирования цели
  const formatGoal = (goal: string | null): string => {
    if (!goal) return "Не указана";
    switch (goal) {
      case "lose":
        return "Похудение";
      case "gain":
        return "Набор веса";
      case "maintain":
        return "Поддержание веса";
      default:
        return goal;
    }
  };

  // Функция для форматирования активности
  const formatActivity = (activity: string | null): string => {
    if (!activity) return "Не указана";
    const activityMap: Record<string, string> = {
      sedentary: "Сидячая работа",
      light: "1–2 тренировки в неделю",
      moderate: "3–4 тренировки в неделю",
      active: "5+ тренировок в неделю",
      very_active: "Спорт ежедневно"
    };
    return activityMap[activity] || activity;
  };

  // Функция для форматирования пола
  const formatGender = (gender: string | null): string => {
    if (!gender) return "Не указан";
    return gender === "male" ? "Мужской" : "Женский";
  };

  // Обработчик сохранения
  const handleSave = async () => {
    if (!userId) return;

    // Валидация
    if (!editWeight || !editHeight || !editGoal || !editActivity || !editGender || !editAge) {
      setError("Все поля обязательны для заполнения");
      return;
    }

    const weightNum = Number(editWeight);
    const heightNum = Number(editHeight);
    const ageNum = Number(editAge);

    if (!Number.isFinite(weightNum) || weightNum <= 0) {
      setError("Вес должен быть положительным числом");
      return;
    }

    if (!Number.isFinite(heightNum) || heightNum <= 0) {
      setError("Рост должен быть положительным числом");
      return;
    }

    if (!Number.isFinite(ageNum) || ageNum <= 0 || ageNum > 150) {
      setError("Возраст должен быть числом от 1 до 150");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/profile/update?userId=${userId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          weightKg: weightNum,
          heightCm: heightNum,
          goal: editGoal,
          activityLevel: editActivity,
          gender: editGender,
          age: ageNum
        })
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Ошибка сохранения профиля");
      }

      // Обновляем профиль из ответа
      setProfile(data.profile);
      setIsEditing(false);
    } catch (err: any) {
      console.error("[profile] Ошибка сохранения:", err);
      setError(err.message || "Ошибка сохранения профиля");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="text-textSecondary">Загрузка...</div>
        </div>
      </AppLayout>
    );
  }

  if (error && !profile) {
    return (
      <AppLayout>
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-soft p-6 text-center">
            <h2 className="text-xl font-semibold mb-2 text-red-600">Ошибка</h2>
            <p className="text-textPrimary">{error}</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!profile) {
    return (
      <AppLayout>
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="text-textSecondary">Профиль не найден</div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-background p-4 py-8">
      <div className="max-w-md mx-auto">
        {/* Заголовок */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-textPrimary">👤 Личный кабинет</h1>
        </div>

        {/* Сообщение об ошибке (если есть) */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Основная информация */}
        <div className="bg-white rounded-2xl shadow-soft p-6 mb-4">
          <h2 className="text-lg font-semibold text-textPrimary mb-4">Основная информация</h2>
          
          {isEditing ? (
            <div className="space-y-4">
              {/* Вес */}
              <div>
                <label className="block text-sm font-medium text-textSecondary mb-2">
                  ⚖️ Вес (кг)
                </label>
                <input
                  type="number"
                  value={editWeight}
                  onChange={(e) => setEditWeight(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                  placeholder="Введите вес"
                  min="1"
                  max="500"
                />
              </div>

              {/* Рост */}
              <div>
                <label className="block text-sm font-medium text-textSecondary mb-2">
                  📏 Рост (см)
                </label>
                <input
                  type="number"
                  value={editHeight}
                  onChange={(e) => setEditHeight(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                  placeholder="Введите рост"
                  min="50"
                  max="300"
                />
              </div>

              {/* Пол */}
              <div>
                <label className="block text-sm font-medium text-textSecondary mb-2">
                  👤 Пол
                </label>
                <select
                  value={editGender}
                  onChange={(e) => setEditGender(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="">Выберите пол</option>
                  <option value="male">Мужской</option>
                  <option value="female">Женский</option>
                </select>
              </div>

              {/* Возраст */}
              <div>
                <label className="block text-sm font-medium text-textSecondary mb-2">
                  🎂 Возраст (лет)
                </label>
                <input
                  type="number"
                  value={editAge}
                  onChange={(e) => setEditAge(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                  placeholder="Введите возраст"
                  min="1"
                  max="150"
                />
              </div>

              {/* Уровень активности */}
              <div>
                <label className="block text-sm font-medium text-textSecondary mb-2">
                  🏃 Активность
                </label>
                <select
                  value={editActivity}
                  onChange={(e) => setEditActivity(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="">Выберите уровень активности</option>
                  <option value="sedentary">Сидячая работа</option>
                  <option value="light">1–2 тренировки в неделю</option>
                  <option value="moderate">3–4 тренировки в неделю</option>
                  <option value="active">5+ тренировок в неделю</option>
                  <option value="very_active">Спорт ежедневно</option>
                </select>
              </div>

              {/* Цель */}
              <div>
                <label className="block text-sm font-medium text-textSecondary mb-2">
                  🎯 Цель
                </label>
                <select
                  value={editGoal}
                  onChange={(e) => setEditGoal(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="">Выберите цель</option>
                  <option value="lose">Похудение</option>
                  <option value="maintain">Поддержание веса</option>
                  <option value="gain">Набор веса</option>
                </select>
              </div>

              {/* Кнопки действий */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setError(null);
                    // Восстанавливаем значения из профиля
                    setEditWeight(profile.weightKg?.toString() || "");
                    setEditHeight(profile.heightCm?.toString() || "");
                    setEditGoal(profile.goal || "");
                    setEditActivity(profile.activityLevel || "");
                    setEditGender(profile.gender || "");
                    setEditAge(profile.age?.toString() || "");
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-textPrimary font-medium rounded-lg hover:bg-gray-50 transition-colors"
                  disabled={saving}
                >
                  Отмена
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-accent text-white font-medium rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50"
                >
                  {saving ? "Сохранение..." : "Сохранить"}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {profile.weightKg && (
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-textSecondary">⚖️ Вес</span>
                  <span className="font-medium text-textPrimary">{profile.weightKg} кг</span>
                </div>
              )}
              
              {profile.heightCm && (
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-textSecondary">📏 Рост</span>
                  <span className="font-medium text-textPrimary">{profile.heightCm} см</span>
                </div>
              )}

              {profile.gender && (
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-textSecondary">👤 Пол</span>
                  <span className="font-medium text-textPrimary">{formatGender(profile.gender)}</span>
                </div>
              )}

              {profile.age && (
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-textSecondary">🎂 Возраст</span>
                  <span className="font-medium text-textPrimary">{profile.age} лет</span>
                </div>
              )}

              {profile.activityLevel && (
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-textSecondary">🏃 Активность</span>
                  <span className="font-medium text-textPrimary">{formatActivity(profile.activityLevel)}</span>
                </div>
              )}
              
              <div className="flex justify-between items-center py-2">
                <span className="text-textSecondary">🎯 Цель</span>
                <span className="font-medium text-textPrimary">{formatGoal(profile.goal)}</span>
              </div>

              {/* Кнопка редактирования внизу блока */}
              <div className="pt-4 mt-4 border-t border-gray-100">
                <button
                  onClick={() => setIsEditing(true)}
                  className="w-full px-4 py-2 bg-accent/20 text-accent font-medium rounded-lg hover:bg-accent/30 transition-colors"
                >
                  Редактировать данные
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Нормы (сворачиваемая секция) */}
        <div className="bg-white rounded-2xl shadow-soft p-6">
          <button
            onClick={() => setNormsExpanded(!normsExpanded)}
            className="w-full flex justify-between items-center"
          >
            <h2 className="text-lg font-semibold text-textPrimary">Ваши нормы</h2>
            <span className={`transform transition-transform duration-200 ${normsExpanded ? 'rotate-180' : ''}`}>
              ▼
            </span>
          </button>
          
          {normsExpanded && (
            <div className="mt-4 space-y-3 animate-fadeIn">
              {profile.caloriesGoal && (
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-textSecondary">🔥 Калории</span>
                  <span className="font-medium text-textPrimary">{profile.caloriesGoal} ккал</span>
                </div>
              )}
              
              {profile.proteinGoal && (
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-textSecondary">🥚 Белки</span>
                  <span className="font-medium text-textPrimary">{profile.proteinGoal} г</span>
                </div>
              )}
              
              {profile.fatGoal && (
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-textSecondary">🥥 Жиры</span>
                  <span className="font-medium text-textPrimary">{profile.fatGoal} г</span>
                </div>
              )}
              
              {profile.carbsGoal && (
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-textSecondary">🍚 Углеводы</span>
                  <span className="font-medium text-textPrimary">{profile.carbsGoal} г</span>
                </div>
              )}
              
              {profile.waterGoalMl && (
                <div className="flex justify-between items-center py-2">
                  <span className="text-textSecondary">💧 Вода</span>
                  <span className="font-medium text-textPrimary">{profile.waterGoalMl} мл</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Место для будущих секций (подписки, документы и т.д.) */}
        {/* Можно добавить здесь позже */}
      </div>
    </div>
    </AppLayout>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-textSecondary">Загрузка...</div>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ProfilePageContent />
    </Suspense>
  );
}
