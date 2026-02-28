"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect, Suspense, useRef } from "react";
import Link from "next/link";
import "../globals.css";
import AppLayout from "../components/AppLayout";
import { useUserSession } from "../providers/UserSessionProvider";
import { withUserId } from "@/lib/user/withUserId";
import { getTelegramUserId, getTelegramDiagnostics } from "@/lib/telegram";
import { fetchUserByTelegramId } from "@/lib/userProfile";

// Force dynamic rendering to avoid static generation issues with useSearchParams in AppNavigation/UserSessionProvider
export const dynamic = 'force-dynamic';

interface ProfileData {
  name: string | null;
  avatarUrl: string | null;
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
  const { userId, isLoading, error, userExists } = useUserSession();
  const router = useRouter();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [normsExpanded, setNormsExpanded] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [basicInfoExpanded, setBasicInfoExpanded] = useState(false);

  // Редактируемые поля
  const [editName, setEditName] = useState<string>("");
  const [editWeight, setEditWeight] = useState<string>("");
  const [editHeight, setEditHeight] = useState<string>("");
  const [editGoal, setEditGoal] = useState<string>("");
  const [editActivity, setEditActivity] = useState<string>("");
  const [editGender, setEditGender] = useState<string>("");
  const [editAge, setEditAge] = useState<string>("");
  const [deleting, setDeleting] = useState(false);
  const [subscription, setSubscription] = useState<any>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);

  // Cabinet gating logic: check by telegram_id on every load
  // This ensures we always verify user exists in DB, not just rely on cached state
  useEffect(() => {
    // If still loading, wait
    if (isLoading) {
      return;
    }

    // Always check by telegram_id to ensure fresh state from DB
    const checkUserExists = async () => {
      const telegramId = getTelegramUserId();
      
      if (!telegramId) {
        // No telegram ID available - show diagnostics in development
        if (process.env.NODE_ENV === "development") {
          const diagnostics = getTelegramDiagnostics();
          console.warn("[profile] No telegram ID available:", diagnostics);
        }
        // Redirect to onboarding
        router.push("/registration");
        return;
      }

      // Check if user exists by telegram_id (fresh DB query)
      try {
        const user = await fetchUserByTelegramId(telegramId);
        
        if (user && user.id) {
          // User exists - redirect to profile with correct userId if needed
          if (!userId || userId !== user.id) {
            router.push(`/profile?id=${user.id}`);
          }
          // If userId matches, stay on page
        } else {
          // User doesn't exist - redirect to onboarding
          router.push("/registration");
        }
      } catch (err: any) {
        console.error("[profile] Error checking user by telegram_id:", err);
        // On error, redirect to onboarding
        router.push("/registration");
      }
    };

    checkUserExists();
  }, [isLoading, router]); // Remove userId and userExists from deps to always check fresh

  // Load profile data if user exists
  useEffect(() => {
    if (!userId || !userExists) return;

    const loadProfile = async () => {
      setLoading(true);
      setProfileError(null);

      try {
        const response = await fetch(`/api/user?userId=${userId}`);
        const data = await response.json();

        if (!response.ok || !data.ok) {
          throw new Error(data.error || "Ошибка загрузки профиля");
        }

        setProfile({
          name: data.name,
          avatarUrl: data.avatarUrl,
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
          waterGoalMl: data.waterGoalMl,
        });

        setAvatarUrl(data.avatarUrl || null);

        // Initialize edit fields
        setEditName(data.name || "");
        setEditWeight(data.weightKg?.toString() || "");
        setEditHeight(data.heightCm?.toString() || "");
        setEditGoal(data.goal || "");
        setEditActivity(data.activityLevel || "");
        setEditGender(data.gender || "");
        setEditAge(data.age?.toString() || "");
      } catch (err: any) {
        console.error("[profile] Ошибка загрузки:", err);
        setProfileError(err.message || "Ошибка загрузки профиля");
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [userId, userExists]);

  // Load subscription status (if not already loaded from /api/user/profile)
  useEffect(() => {
    if (!userId || subscription) return;

    const loadSubscription = async () => {
      setSubscriptionLoading(true);
      try {
        const response = await fetch(`/api/subscription/status?userId=${userId}`);
        const data = await response.json();
        if (response.ok && data.ok) {
          setSubscription(data);
        }
      } catch (err: any) {
        console.error("[profile] Ошибка загрузки подписки:", err);
      } finally {
        setSubscriptionLoading(false);
      }
    };

    loadSubscription();
  }, [userId, subscription]);

  // REMOVED: Profile completeness check that redirected to onboarding
  // If user exists in DB (by telegram_id), they should ALWAYS see the cabinet
  // Profile can be incomplete - user can edit it from the cabinet
  // This prevents the "re-onboarding" issue when switching tabs

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

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!userId) return;
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("userId", String(userId));
    formData.append("file", file);

    try {
      setUploadingAvatar(true);
      const response = await fetch("/api/profile/avatar", {
        method: "POST",
        body: formData
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Не удалось загрузить фото");
      }
      // Обновляем аватар с cache busting для немедленного отображения
      const avatarUrlWithCache = data.avatarUrl ? `${data.avatarUrl.split('?')[0]}?t=${Date.now()}` : null;
      setAvatarUrl(avatarUrlWithCache);
      setProfile(prev => prev ? { ...prev, avatarUrl: avatarUrlWithCache } : prev);
    } catch (err: any) {
      console.error("[avatar] Ошибка загрузки:", err);
      setProfileError(err.message || "Не удалось загрузить фото");
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Обработчик сохранения
  const handleSave = async () => {
    if (!userId) return;

    // Валидация
    if (!editWeight || !editHeight || !editGoal || !editActivity || !editGender || !editAge) {
      setProfileError("Все поля обязательны для заполнения");
      return;
    }

    const weightNum = Number(editWeight);
    const heightNum = Number(editHeight);
    const ageNum = Number(editAge);

    if (!Number.isFinite(weightNum) || weightNum <= 0) {
      setProfileError("Вес должен быть положительным числом");
      return;
    }

    if (!Number.isFinite(heightNum) || heightNum <= 0) {
      setProfileError("Рост должен быть положительным числом");
      return;
    }

    if (!Number.isFinite(ageNum) || ageNum <= 0 || ageNum > 150) {
      setProfileError("Возраст должен быть числом от 1 до 150");
      return;
    }

    setSaving(true);
    setProfileError(null);

    const normalizedName = editName.trim() || null;

    try {
      const response = await fetch(`/api/profile/update?userId=${userId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: normalizedName,
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
      setAvatarUrl(data.profile.avatarUrl || null);
      setIsEditing(false);
      } catch (err: any) {
        console.error("[profile] Ошибка сохранения:", err);
        setProfileError(err.message || "Ошибка сохранения профиля");
      } finally {
      setSaving(false);
    }
  };

  // Show loading while resolving user identity
  if (isLoading) {
    return (
      <AppLayout>
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="text-textSecondary">Загрузка...</div>
        </div>
      </AppLayout>
    );
  }

  // Show error if user identity resolution failed
  if (error) {
    return (
      <AppLayout>
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-soft p-6 text-center">
            <h2 className="text-xl font-semibold mb-2 text-red-600">Ошибка</h2>
            <p className="text-textPrimary mb-4 whitespace-pre-line">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-accent text-white font-medium rounded-lg hover:bg-accent/90 transition-colors"
            >
              Попробовать снова
            </button>
          </div>
        </div>
      </AppLayout>
    );
  }

  // Show loading while fetching profile data
  if (loading) {
    return (
      <AppLayout>
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="text-textSecondary">Загрузка...</div>
        </div>
      </AppLayout>
    );
  }

  // Show error if profile fetch failed
  if (profileError && !profile) {
    return (
      <AppLayout>
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-soft p-6 text-center">
            <h2 className="text-xl font-semibold mb-2 text-red-600">Ошибка</h2>
            <p className="text-textPrimary mb-4">{profileError}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-accent text-white font-medium rounded-lg hover:bg-accent/90 transition-colors"
            >
              Обновить страницу
            </button>
          </div>
        </div>
      </AppLayout>
    );
  }

  // Show loading if profile not loaded yet
  if (!profile) {
    return (
      <AppLayout>
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="text-textSecondary">Загрузка профиля...</div>
        </div>
      </AppLayout>
    );
  }

  const displayName = profile.name || "Пользователь";

  const handleDeleteProfile = async () => {
    if (!userId) return;
    const confirmDelete = window.confirm("Вы действительно хотите удалить профиль?");
    if (!confirmDelete) return;

    try {
      setDeleting(true);
      const response = await fetch(`/api/profile/delete?userId=${userId}`, {
        method: "DELETE"
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Не удалось удалить профиль");
      }
      // После удаления отправляем на онбординг/старт
      window.location.href = "/";
    } catch (err: any) {
      console.error("[profile] Ошибка удаления профиля:", err);
      setProfileError(err.message || "Ошибка удаления профиля");
    } finally {
      setDeleting(false);
    }
  };


  const formatDate = (iso?: string | null) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  return (
    <AppLayout>
      <div className="min-h-screen bg-background p-4 py-8">
      <div className="max-w-md mx-auto">
        {/* Debug Panel - Development Only */}
        {process.env.NODE_ENV === "development" && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-xs">
            <div className="font-semibold mb-1">🔍 Debug Info:</div>
            <div>userId: {userId || "null"}</div>
            <div>userExists: {userExists ? "✅" : "❌"}</div>
            <div>hasProfile: {profile ? "✅" : "❌"}</div>
          </div>
        )}

        {/* Заголовок */}
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-textPrimary">Личный кабинет</h1>
        </div>

        {/* Сообщение об ошибке (если есть) */}
        {profileError && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            {profileError}
          </div>
        )}

        {/* Профильный хедер */}
        <div className="bg-white rounded-2xl shadow-soft p-6 mb-4 flex flex-col items-center text-center">
          <div
            className="w-28 h-28 rounded-full border border-gray-200 bg-gray-100 overflow-hidden mb-3"
            style={{
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundImage: avatarUrl ? `url(${avatarUrl})` : "none"
            }}
          >
            {!avatarUrl && (
              <div className="w-full h-full flex items-center justify-center text-textSecondary text-xs">
                Фото
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarChange}
          />
          <div className="text-xl font-semibold text-textPrimary">{displayName}</div>
          <div className="text-sm text-textSecondary mb-3">Личный кабинет</div>
          <button
            onClick={handleAvatarClick}
            disabled={uploadingAvatar}
            className="px-4 py-2 rounded-full border border-gray-200 text-textPrimary text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {uploadingAvatar ? "Загрузка..." : "Изменить фото"}
          </button>
        </div>

        {/* Основная информация (сворачиваемая секция) */}
        <div className="bg-white rounded-2xl shadow-soft p-6 mb-4">
          <button
            onClick={() => setBasicInfoExpanded(!basicInfoExpanded)}
            className="w-full flex justify-between items-center"
          >
            <h2 className="text-lg font-semibold text-textPrimary">Основная информация</h2>
            <span className={`transform transition-transform duration-200 ${basicInfoExpanded ? 'rotate-180' : ''}`}>
              ▼
            </span>
          </button>
          
          {basicInfoExpanded && (
            <div className="mt-4">
              {isEditing ? (
                <div className="space-y-4">
                  {/* Имя */}
                  <div>
                    <label className="block text-sm font-medium text-textSecondary mb-2">
                      Имя
                    </label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                      placeholder="Введите имя"
                      maxLength={100}
                    />
                  </div>

                  {/* Вес */}
                  <div>
                    <label className="block text-sm font-medium text-textSecondary mb-2">
                      Вес (кг)
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
                      Рост (см)
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
                      Пол
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
                      Возраст (лет)
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
                      Активность
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
                      Цель
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
                        setProfileError(null);
                        // Восстанавливаем значения из профиля
                        setEditName(profile.name || "");
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
                      <span className="text-textSecondary">Вес</span>
                      <span className="font-medium text-textPrimary">{profile.weightKg} кг</span>
                    </div>
                  )}
                  
                  {profile.heightCm && (
                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-textSecondary">Рост</span>
                      <span className="font-medium text-textPrimary">{profile.heightCm} см</span>
                    </div>
                  )}

                  {profile.gender && (
                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-textSecondary">Пол</span>
                      <span className="font-medium text-textPrimary">{formatGender(profile.gender)}</span>
                    </div>
                  )}

                  {profile.age && (
                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-textSecondary">Возраст</span>
                      <span className="font-medium text-textPrimary">{profile.age} лет</span>
                    </div>
                  )}

                  {profile.activityLevel && (
                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-textSecondary">Активность</span>
                      <span className="font-medium text-textPrimary">{formatActivity(profile.activityLevel)}</span>
                    </div>
                  )}
                  
                  <div className="flex justify-between items-center py-2">
                    <span className="text-textSecondary">Цель</span>
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
          )}
        </div>


        {/* Нормы (сворачиваемая секция) */}
        <div className="bg-white rounded-2xl shadow-soft p-6 mb-4">
          <button
            onClick={() => setNormsExpanded(!normsExpanded)}
            className="w-full flex justify-between items-center bg-pink-400 hover:bg-pink-500 rounded-lg px-4 py-3 transition-colors duration-200"
          >
            <h2 className="text-lg font-semibold text-white">Ваши нормы</h2>
            <span className={`transform transition-transform duration-200 text-white ${normsExpanded ? 'rotate-180' : ''}`}>
              ▼
            </span>
          </button>
          
          {normsExpanded && (
            <div className="mt-4 space-y-3 animate-fadeIn">
              {profile.caloriesGoal && (
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-textSecondary">Калории</span>
                  <span className="font-medium text-textPrimary">{profile.caloriesGoal} ккал</span>
                </div>
              )}
              
              {profile.proteinGoal && (
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-textSecondary">Белки</span>
                  <span className="font-medium text-textPrimary">{profile.proteinGoal} г</span>
                </div>
              )}
              
              {profile.fatGoal && (
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-textSecondary">Жиры</span>
                  <span className="font-medium text-textPrimary">{profile.fatGoal} г</span>
                </div>
              )}
              
              {profile.carbsGoal && (
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-textSecondary">Углеводы</span>
                  <span className="font-medium text-textPrimary">{profile.carbsGoal} г</span>
                </div>
              )}
              
              {profile.waterGoalMl && (
                <div className="flex justify-between items-center py-2">
                  <span className="text-textSecondary">Вода</span>
                  <span className="font-medium text-textPrimary">{profile.waterGoalMl} мл</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Подписка */}
        <div className="bg-white rounded-2xl shadow-soft p-6 mb-4">
          <h2 className="text-lg font-semibold text-textPrimary mb-4">Подписка</h2>
          {subscriptionLoading ? (
            <div className="text-textSecondary text-sm">Загрузка...</div>
          ) : subscription && subscription.hasSubscription ? (
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-textSecondary">Статус</span>
                <span className={`font-medium ${subscription.active ? 'text-green-600' : 'text-gray-600'}`}>
                  {subscription.active ? 'Активна' : 'Не активна'}
                </span>
              </div>
              {subscription.activeUntil && (
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-textSecondary">Оплачено до</span>
                  <span className="font-medium text-textPrimary">{formatDate(subscription.activeUntil)}</span>
                </div>
              )}
              {subscription.nextChargeAt && (
                <div className="flex justify-between items-center py-2">
                  <span className="text-textSecondary">Следующее списание</span>
                  <span className="font-medium text-textPrimary">{formatDate(subscription.nextChargeAt)}</span>
                </div>
              )}
              <div className="pt-3 mt-3 border-t border-gray-100">
                <p className="text-sm text-textSecondary">
                  Для отмены напишите — <a href="https://t.me/STEP0NE11" className="text-blue-600 underline">@STEP0NE11</a>
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-textSecondary text-sm">
                Статус подписки: не подтвержден
              </div>
              <div className="text-textSecondary text-xs">
                Если вы оплатили, обновите страницу через 1–2 минуты
              </div>
            </div>
          )}
        </div>

        {/* Дисклеймер про здоровье */}
        <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-2xl">
          <p className="text-sm text-yellow-800 text-center leading-relaxed">
            <strong>⚠️ Важно:</strong> Сервис не является медицинским. Рекомендации носят информационный характер и не заменяют консультацию специалиста.
          </p>
        </div>

        {/* Политика конфиденциальности и Пользовательское соглашение */}
        <div className="mb-4 space-y-3">
          <Link
            href={withUserId("/privacy", userId ? String(userId) : null) as any}
            className="block w-full px-4 py-3 bg-white border border-gray-200 text-textPrimary font-medium rounded-2xl shadow-soft hover:bg-gray-50 transition-colors text-center"
          >
            Политика конфиденциальности
          </Link>
          <Link
            href={withUserId("/terms", userId ? String(userId) : null) as any}
            className="block w-full px-4 py-3 bg-white border border-gray-200 text-textPrimary font-medium rounded-2xl shadow-soft hover:bg-gray-50 transition-colors text-center"
          >
            Пользовательское соглашение
          </Link>
        </div>

        {/* Удаление профиля */}
        <div className="mb-4">
          <button
            onClick={handleDeleteProfile}
            disabled={deleting}
            className="w-full px-4 py-3 bg-white border border-red-200 text-red-600 font-medium rounded-2xl shadow-soft hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            {deleting ? "Удаление..." : "Удалить профиль"}
          </button>
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

// Wrapper component to handle Suspense boundary properly
function ProfilePageWrapper() {
  // This component ensures hooks are called before Suspense boundary
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ProfilePageContent />
    </Suspense>
  );
}

export default function ProfilePage() {
  // Export wrapper to maintain stable component structure
  return <ProfilePageWrapper />;
}
