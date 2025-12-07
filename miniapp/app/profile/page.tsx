"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import "../globals.css";

interface ProfileData {
  name: string | null;
  weightKg: number | null;
  heightCm: number | null;
  goal: string | null;
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
          caloriesGoal: data.caloriesGoal,
          proteinGoal: data.proteinGoal,
          fatGoal: data.fatGoal,
          carbsGoal: data.carbsGoal,
          waterGoalMl: data.waterGoalMl
        });
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-textSecondary">Загрузка...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-soft p-6 text-center">
          <h2 className="text-xl font-semibold mb-2 text-red-600">Ошибка</h2>
          <p className="text-textPrimary">{error}</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-textSecondary">Профиль не найден</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 py-8">
      <div className="max-w-md mx-auto">
        {/* Заголовок */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-textPrimary">👤 Личный кабинет</h1>
        </div>

        {/* Основная информация */}
        <div className="bg-white rounded-2xl shadow-soft p-6 mb-4">
          <h2 className="text-lg font-semibold text-textPrimary mb-4">Основная информация</h2>
          
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
            
            <div className="flex justify-between items-center py-2">
              <span className="text-textSecondary">🎯 Цель</span>
              <span className="font-medium text-textPrimary">{formatGoal(profile.goal)}</span>
            </div>
          </div>
        </div>

        {/* Нормы */}
        <div className="bg-white rounded-2xl shadow-soft p-6">
          <h2 className="text-lg font-semibold text-textPrimary mb-4">Ваши нормы</h2>
          
          <div className="space-y-3">
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
        </div>

        {/* Место для будущих секций (подписки, документы и т.д.) */}
        {/* Можно добавить здесь позже */}
      </div>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <ProfilePageContent />
  );
}

