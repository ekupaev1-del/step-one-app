"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense, useRef, type ReactElement } from "react";
import "../globals.css";
import AppLayout from "../components/AppLayout";
import DayNutritionInfographic from "../components/DayNutritionInfographic";

interface Meal {
  id: number;
  user_id: number;
  meal_text: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  created_at: string;
}

interface DayReport {
  date: string;
  totals: {
    calories: number;
    protein: number;
    fat: number;
    carbs: number;
  };
  dailyNorm: number;
  percentage: number;
  meals: Meal[];
  mealsCount: number;
  radarData?: {
    calories: number;
    caloriesGoal: number;
    protein: number;
    proteinGoal: number;
    fat: number;
    fatGoal: number;
    carbs: number;
    carbsGoal: number;
    water: number;
    waterGoal: number;
  };
}

interface CalendarDay {
  date: string;
  actualCalories: number;
  targetCalories: number;
  status: "green" | "yellow" | "red" | "none";
}

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-textSecondary">Загрузка...</div>
    </div>
  );
}

function ReportPageContent(): ReactElement {
  const searchParams = useSearchParams();
  const userIdParam = searchParams.get("id");
  
  const [userId, setUserId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Календарь
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [loadingCalendar, setLoadingCalendar] = useState(false);

  // Отчёт за день
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dayReport, setDayReport] = useState<DayReport | null>(null);
  const [loadingDayReport, setLoadingDayReport] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0); // Ключ для принудительного re-render
  const [showCalendar, setShowCalendar] = useState(false); // Показывать ли календарь

  // Таймер для предотвращения слишком частых обновлений
  const lastUpdateRef = useRef<number>(0);
  const UPDATE_COOLDOWN = 10000; // 10 секунд между автоматическими обновлениями

  // Редактирование
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null);

  // Проверка согласия с политикой конфиденциальности
  const [checkingPrivacy, setCheckingPrivacy] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState<boolean | null>(null);

  // Инициализация userId
  // Инициализация userId - оптимизировано для быстрой загрузки
  useEffect(() => {
    // Сначала пробуем получить из URL напрямую для быстрой загрузки
    if (typeof window !== "undefined" && !userIdParam) {
      const urlParams = new URLSearchParams(window.location.search);
      const fallbackUserId = urlParams.get("id");
      if (fallbackUserId) {
        const n = Number(fallbackUserId);
        if (Number.isFinite(n) && n > 0) {
          setUserId(n);
          setError(null);
          return;
        }
      }
    }

    if (userIdParam) {
      const n = Number(userIdParam);
      if (Number.isFinite(n) && n > 0) {
        setUserId(n);
        setError(null);
      } else {
        setError("Некорректный id пользователя");
      }
    } else {
      setError("ID не передан");
    }
  }, [userIdParam]);

  // Unified onboarding check (consent + profile completion)
  useEffect(() => {
    if (!userId) return;

    const checkOnboarding = async () => {
      setCheckingPrivacy(true);
      try {
        const response = await fetch(`/api/onboarding/status?userId=${userId}`);
        const data = await response.json();

        if (response.ok && data.ok) {
          // Only redirect if consent is missing OR profile is incomplete
          if (!data.hasConsent) {
            // Consent missing -> redirect to consent page
            window.location.href = `/privacy/consent?id=${userId}`;
            return;
          }
          
          if (!data.profileComplete) {
            // Profile incomplete -> redirect to registration
            window.location.href = `/registration?id=${userId}`;
            return;
          }
          
          // Both consent and profile are complete - allow access
          setPrivacyAccepted(true);
        } else {
          // If error, log but allow continue (graceful degradation)
          console.warn("[ReportPage] Ошибка проверки онбординга:", data.error);
          setPrivacyAccepted(true);
        }
      } catch (err) {
        console.error("[ReportPage] Ошибка проверки онбординга:", err);
        // При ошибке разрешаем продолжить
        setPrivacyAccepted(true);
      } finally {
        setCheckingPrivacy(false);
      }
    };

    checkOnboarding();
  }, [userId]);

  // Загрузка календаря при изменении месяца
  useEffect(() => {
    if (userId) {
      loadCalendar();
    }
  }, [userId, currentMonth]);

  // Автоматически загружаем отчёт за сегодня при первом открытии
  useEffect(() => {
    if (userId && !selectedDate) {
      const today = new Date();
      const todayKey = today.toISOString().split("T")[0];
      setSelectedDate(todayKey);
      loadDayReport(todayKey, true);
    }
  }, [userId]);

  // УМНОЕ АВТОМАТИЧЕСКОЕ ОБНОВЛЕНИЕ: только при реальном переключении на окно
  useEffect(() => {
    if (!userId) return;

    // Функция для проверки, можно ли обновлять (cooldown)
    const canUpdate = () => {
      const now = Date.now();
      if (now - lastUpdateRef.current < UPDATE_COOLDOWN) {
        console.log("[auto-update] Слишком рано для обновления, пропускаем");
        return false;
      }
      lastUpdateRef.current = now;
      return true;
    };

    // Обновляем при фокусе (только если прошло достаточно времени)
    const handleFocus = () => {
      if (!canUpdate()) return;
      console.log("[auto-update] Окно получило фокус, обновляем календарь...");
      loadCalendar();
      if (selectedDate) {
        console.log("[auto-update] Обновляем отчёт за день:", selectedDate);
        loadDayReport(selectedDate, true);
      }
    };

    // Обновляем при изменении видимости (только если прошло достаточно времени)
    const handleVisibilityChange = () => {
      if (document.hidden) return; // Не обновляем при скрытии
      if (!canUpdate()) return;
      console.log("[auto-update] Страница стала видимой, обновляем календарь...");
      loadCalendar();
      if (selectedDate) {
        console.log("[auto-update] Обновляем отчёт за день:", selectedDate);
        loadDayReport(selectedDate, true);
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Обновляем только один раз при монтировании
    if (lastUpdateRef.current === 0) {
      handleFocus();
    }

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [userId, selectedDate]);

  /**
   * Загружает календарь (даты с данными)
   * ВСЕГДА делает свежий запрос к БД
   */
  const loadCalendar = async () => {
    if (!userId) return;

    setLoadingCalendar(true);
    try {
      const monthStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`;
      const timestamp = Date.now();
      
      console.log("[loadCalendar] Загружаем календарь:", { monthStr, userId });
      
      const response = await fetch(
        `/api/report/calendar?userId=${userId}&month=${monthStr}&_t=${timestamp}`,
        {
          method: 'GET',
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (!data.ok) {
        console.error("[loadCalendar] Ошибка:", data.error);
        setCalendarDays([]);
        return;
      }

      // ВСЕГДА создаём новый массив для принудительного re-render
      const newDays: CalendarDay[] = (data.days || []).map((day: CalendarDay) => ({
        date: day.date,
        actualCalories: day.actualCalories,
        targetCalories: day.targetCalories,
        status: day.status
      }));
      setCalendarDays(newDays);
      
      console.log("[loadCalendar] Календарь обновлён:", { daysCount: newDays.length, days: newDays });
    } catch (err: any) {
      console.error("[loadCalendar] Ошибка:", err);
      setCalendarDays([]);
    } finally {
      setLoadingCalendar(false);
    }
  };

  /**
   * Загружает отчёт за день
   * ВСЕГДА создаёт новый объект для принудительного re-render
   */
  const loadDayReport = async (date: string, forceRefresh: boolean = false) => {
    if (!userId) return;

    if (forceRefresh || date !== selectedDate) {
      setSelectedDate(date);
    }
    setLoadingDayReport(true);
    // КРИТИЧНО: Очищаем старые данные перед загрузкой
    setDayReport(null);
    setError(null);

    try {
      const timestamp = Date.now();
      const response = await fetch(
        `/api/report/day?userId=${userId}&date=${date}&_t=${timestamp}`,
        {
          method: 'GET',
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (!data.ok) {
        setError(data.error || "Ошибка загрузки отчёта");
        setDayReport(null);
        return;
      }

      // КРИТИЧНО: Создаём полностью новый объект для принудительного re-render
      // Глубокое копирование всех вложенных объектов
      const newReport: DayReport = {
        date: data.report.date,
        totals: {
          calories: data.report.totals.calories,
          protein: data.report.totals.protein,
          fat: data.report.totals.fat,
          carbs: data.report.totals.carbs
        },
        dailyNorm: data.report.dailyNorm,
        percentage: data.report.percentage,
        meals: data.report.meals.map((meal: Meal) => ({ ...meal })),
        mealsCount: data.report.mealsCount,
        // Добавляем radarData если оно есть в ответе
        radarData: data.report.radarData ? {
          calories: data.report.radarData.calories || 0,
          caloriesGoal: data.report.radarData.caloriesGoal || 0,
          protein: data.report.radarData.protein || 0,
          proteinGoal: data.report.radarData.proteinGoal || 0,
          fat: data.report.radarData.fat || 0,
          fatGoal: data.report.radarData.fatGoal || 0,
          carbs: data.report.radarData.carbs || 0,
          carbsGoal: data.report.radarData.carbsGoal || 0,
          water: data.report.radarData.water || 0,
          waterGoal: data.report.radarData.waterGoal || 0
        } : undefined
      };

      // КРИТИЧНО: Принудительно обновляем refreshKey для re-render списка
      setRefreshKey(prev => prev + 1);
      
      setDayReport(newReport);
      console.log("[loadDayReport] Отчёт загружен:", {
        date,
        mealsCount: newReport.mealsCount,
        totals: newReport.totals,
        meals: newReport.meals.map(m => ({ id: m.id, text: m.meal_text }))
      });
    } catch (err: any) {
      console.error("[loadDayReport] Ошибка:", err);
      setError(err.message || "Ошибка загрузки отчёта");
      setDayReport(null);
    } finally {
      setLoadingDayReport(false);
    }
  };

  /**
   * Обновляет приём пищи
   */
  const updateMeal = async (mealId: number, updates: Partial<Meal>) => {
    if (!userId || !selectedDate) {
      console.error("[updateMeal] Нет userId или selectedDate:", { userId, selectedDate });
      return;
    }

    // КРИТИЧНО: Сохраняем selectedDate в локальную переменную
    const dateToReload = selectedDate;

    setLoading(true);
    setError(null);

    try {
      console.log("[updateMeal] Начинаем обновление:", { mealId, updates, dateToReload });

      const response = await fetch('/api/meal/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: mealId,
          ...updates
        }),
        cache: 'no-store'
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText };
        }
        
        console.error("[updateMeal] HTTP ошибка:", response.status, errorData);
        
        // Если запись не найдена (404), просто обновляем отчёт
        if (response.status === 404 || errorData.error?.includes("не найден")) {
          console.log("[updateMeal] Запись не найдена, обновляем отчёт");
          setEditingMeal(null);
          setDayReport(null);
          await new Promise(resolve => setTimeout(resolve, 500));
          await loadDayReport(dateToReload);
          await loadCalendar();
          setLoading(false);
          return;
        }
        
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (!data.ok) {
        // Если запись не найдена, просто обновляем отчёт
        if (data.error?.includes("не найден")) {
          console.log("[updateMeal] Запись не найдена, обновляем отчёт");
          setEditingMeal(null);
          setDayReport(null);
          await new Promise(resolve => setTimeout(resolve, 500));
          await loadDayReport(dateToReload);
          await loadCalendar();
          setLoading(false);
          return;
        }
        
        console.error("[updateMeal] Ошибка в ответе API:", data.error);
        setError(data.error || "Ошибка обновления");
        return;
      }

      console.log("[updateMeal] ✅ Приём пищи обновлён в БД");

      // Закрываем форму
      setEditingMeal(null);

      // КРИТИЧНО: Полностью очищаем состояние
      setDayReport(null);
      setLoadingDayReport(true);

      // ВСЕГДА перезагружаем отчёт с сервера
      // Увеличена задержка для гарантии обновления БД
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      console.log("[updateMeal] Перезагружаем отчёт для даты:", dateToReload);
      
      // Принудительно обновляем через изменение key
      setRefreshKey(prev => prev + 1);
      
      // Загружаем свежие данные - ДВАЖДЫ для гарантии
      await loadDayReport(dateToReload);
      await loadCalendar(); // Обновляем календарь тоже
      
      // Ещё раз через небольшую задержку для гарантии
      await new Promise(resolve => setTimeout(resolve, 500));
      await loadDayReport(dateToReload);
      
      console.log("[updateMeal] ✅ Отчёт перезагружен, UI должен обновиться");
    } catch (err: any) {
      console.error("[updateMeal] Исключение:", err);
      setError(err.message || "Ошибка обновления");
    } finally {
      setLoading(false);
    }
  };

  /**
   * Удаляет приём пищи
   */
  const deleteMeal = async (mealId: number) => {
    if (!confirm("Удалить этот приём пищи?")) return;
    if (!userId || !selectedDate) {
      console.error("[deleteMeal] Нет userId или selectedDate:", { userId, selectedDate });
      return;
    }

    // КРИТИЧНО: Сохраняем selectedDate в локальную переменную
    const dateToReload = selectedDate;

    setLoading(true);
    setError(null);

    try {
      console.log("[deleteMeal] Начинаем удаление:", { mealId, dateToReload });

      const response = await fetch('/api/meal/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: mealId }),
        cache: 'no-store'
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText };
        }
        
        console.error("[deleteMeal] HTTP ошибка:", response.status, errorData);
        
        // Если запись уже удалена (404), просто обновляем отчёт
        if (response.status === 404 || errorData.error?.includes("не найден")) {
          console.log("[deleteMeal] Запись уже удалена, просто обновляем отчёт");
          setEditingMeal(null);
          setDayReport(null);
          await new Promise(resolve => setTimeout(resolve, 500));
          await loadDayReport(dateToReload);
          await loadCalendar();
          setLoading(false);
          return;
        }
        
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (!data.ok) {
        // Если запись уже удалена, просто обновляем отчёт
        if (data.error?.includes("не найден")) {
          console.log("[deleteMeal] Запись уже удалена, просто обновляем отчёт");
          setEditingMeal(null);
          setDayReport(null);
          await new Promise(resolve => setTimeout(resolve, 500));
          await loadDayReport(dateToReload);
          await loadCalendar();
          setLoading(false);
          return;
        }
        
        console.error("[deleteMeal] Ошибка в ответе API:", data.error);
        setError(data.error || "Ошибка удаления");
        return;
      }

      console.log("[deleteMeal] ✅ Приём пищи удалён из БД");

      // Закрываем форму
      setEditingMeal(null);

      // КРИТИЧНО: Полностью очищаем состояние
      setDayReport(null);
      setLoadingDayReport(true);

      // ВСЕГДА перезагружаем отчёт с сервера
      // Увеличена задержка для гарантии обновления БД
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      console.log("[deleteMeal] Перезагружаем отчёт для даты:", dateToReload);
      
      // Принудительно обновляем через изменение key
      setRefreshKey(prev => prev + 1);
      
      // Загружаем свежие данные - ДВАЖДЫ для гарантии
      await loadDayReport(dateToReload);
      await loadCalendar(); // Обновляем календарь тоже
      
      // Ещё раз через небольшую задержку для гарантии
      await new Promise(resolve => setTimeout(resolve, 500));
      await loadDayReport(dateToReload);
      
      console.log("[deleteMeal] ✅ Отчёт перезагружен, UI должен обновиться");
    } catch (err: any) {
      console.error("[deleteMeal] Исключение:", err);
      setError(err.message || "Ошибка удаления");
    } finally {
      setLoading(false);
    }
  };

  /**
   * Переключение месяца
   */
  const changeMonth = (delta: number) => {
    const newMonth = new Date(currentMonth);
    newMonth.setMonth(newMonth.getMonth() + delta);
    setCurrentMonth(newMonth);
  };

  /**
   * Переключение дня (для навигации в детальном отчёте)
   */
  const changeDay = (delta: number) => {
    if (!selectedDate) return;
    
    const currentDate = new Date(selectedDate);
    currentDate.setDate(currentDate.getDate() + delta);
    const newDateKey = currentDate.toISOString().split("T")[0];
    
    // Обновляем месяц календаря, если перешли в другой месяц
    const newMonth = new Date(currentDate);
    newMonth.setDate(1);
    setCurrentMonth(newMonth);
    
    // Загружаем отчёт за новый день
    setDayReport(null);
    setError(null);
    setEditingMeal(null);
    loadDayReport(newDateKey, true);
    loadCalendar();
  };


  /**
   * Генерация календаря
   */
  const getCalendarDays = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();

    // Первый день месяца
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    // День недели первого дня (0 = воскресенье, 1 = понедельник, ...)
    const startDay = firstDay.getDay();
    
    // Количество дней в месяце
    const daysInMonth = lastDay.getDate();

    const days: (number | null)[] = [];

    // Пустые ячейки до первого дня
    for (let i = 0; i < startDay; i++) {
      days.push(null);
    }

    // Дни месяца
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(day);
    }

    return days;
  };

  /**
   * Форматирование даты для проверки
   */
  const getDateKey = (day: number): string => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth() + 1;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  if (checkingPrivacy) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="text-textSecondary">Загрузка...</div>
      </div>
    );
  }

  if (error && !userId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-soft p-6 text-center">
          <h2 className="text-xl font-semibold mb-2 text-red-600">Ошибка</h2>
          <p className="text-textPrimary">{error}</p>
        </div>
      </div>
    );
  }

  // Модальное окно с отчётом за день
  if (selectedDate && (dayReport || loadingDayReport)) {
    return (
      <AppLayout>
        <div key={`report-${selectedDate}-${refreshKey}`} className="min-h-screen bg-background p-4 py-8">
        <div className="max-w-md mx-auto bg-white rounded-2xl shadow-soft p-8">
          {/* Навигация по дням с стрелками */}
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => changeDay(-1)}
              disabled={loadingDayReport || loading}
              className="px-4 py-2 bg-accent/20 text-accent font-medium rounded-lg hover:bg-accent/30 transition-colors disabled:opacity-50"
              title="Предыдущий день"
            >
              ←
            </button>
            
            <button
              onClick={() => setShowCalendar(true)}
              className="flex-1 mx-4 px-4 py-2 bg-accent/20 text-accent font-medium rounded-lg hover:bg-accent/30 transition-colors"
              title="Выбрать дату"
            >
              {new Date(selectedDate).toLocaleDateString("ru-RU", {
                day: "numeric",
                month: "long",
                year: "numeric"
              })}
            </button>
            
            <button
              onClick={() => changeDay(1)}
              disabled={loadingDayReport || loading}
              className="px-4 py-2 bg-accent/20 text-accent font-medium rounded-lg hover:bg-accent/30 transition-colors disabled:opacity-50"
              title="Следующий день"
            >
              →
            </button>
          </div>
          
          {dayReport && dayReport.radarData && (
            <DayNutritionInfographic
              stats={{
                caloriesEaten: dayReport.totals.calories,
                caloriesGoal: dayReport.radarData?.caloriesGoal || null,
                proteinEaten: dayReport.totals.protein,
                proteinGoal: dayReport.radarData?.proteinGoal || null,
                fatEaten: dayReport.totals.fat,
                fatGoal: dayReport.radarData?.fatGoal || null,
                carbsEaten: dayReport.totals.carbs,
                carbsGoal: dayReport.radarData?.carbsGoal || null
              }}
            />
          )}

          {dayReport && (
            <div className="mt-6">
              {/* Список приёмов пищи */}
              <div className="space-y-3">
                <h3 className="font-semibold text-textPrimary">Приемы пищи:</h3>
                {dayReport.meals.length === 0 ? (
                  <div className="text-center text-textSecondary py-8">
                    Нет записей за этот день
                  </div>
                ) : (
                  <div key={`meals-list-${refreshKey}-${dayReport.mealsCount}`}>
                    {dayReport.meals.map((meal, index) => {
                      const mealDate = new Date(meal.created_at);
                      return (
                        <div key={`meal-${meal.id}-${index}-${refreshKey}`} className="p-4 border border-gray-200 rounded-xl hover:border-accent transition-colors">
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex-1">
                              <div className="font-medium text-textPrimary">{meal.meal_text}</div>
                              <div className="text-xs text-textSecondary mt-1">
                                {mealDate.toLocaleTimeString("ru-RU", {
                                  hour: "2-digit",
                                  minute: "2-digit"
                                })}
                              </div>
                            </div>
                          </div>
                          <div className="text-sm text-textSecondary mb-3">
                            🔥 {meal.calories} ккал | 🥚 {Number(meal.protein).toFixed(1)}г | 🥑 {Number(meal.fat).toFixed(1)}г | 🍚 {Number(meal.carbs || 0).toFixed(1)}г
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setEditingMeal(meal)}
                              className="flex-1 py-2 px-4 bg-accent/20 text-accent font-medium rounded-lg hover:bg-accent/30 transition-colors text-sm"
                            >
                              ✏️ Редактировать
                            </button>
                            <button
                              onClick={() => deleteMeal(meal.id)}
                              className="flex-1 py-2 px-4 bg-red-100 text-red-700 font-medium rounded-lg hover:bg-red-200 transition-colors text-sm"
                            >
                              🗑️ Удалить
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Модальное окно редактирования приёма пищи */}
      {editingMeal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditingMeal(null)}>
          <div className="bg-white rounded-2xl shadow-soft p-6 max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <EditMealForm
              meal={editingMeal}
              onSave={async (updates) => {
                if (editingMeal) {
                  await updateMeal(editingMeal.id, updates);
                }
              }}
              onCancel={() => setEditingMeal(null)}
              onDelete={async () => {
                if (editingMeal) {
                  await deleteMeal(editingMeal.id);
                }
              }}
            />
          </div>
        </div>
      )}

      {/* Модальное окно календаря */}
      {showCalendar && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCalendar(false)}>
          <div className="bg-white rounded-2xl shadow-soft p-6 max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-textPrimary">📅 Выберите день</h2>
              <button
                onClick={() => setShowCalendar(false)}
                className="text-textSecondary hover:text-textPrimary text-2xl"
              >
                ✕
              </button>
            </div>

            {/* Переключение месяцев */}
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => changeMonth(-1)}
                disabled={loadingCalendar}
                className="px-4 py-2 bg-accent/20 text-accent font-medium rounded-lg hover:bg-accent/30 transition-colors disabled:opacity-50"
              >
                ←
              </button>
              <h3 className="text-lg font-semibold text-textPrimary">
                {currentMonth.toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}
              </h3>
              <button
                onClick={() => changeMonth(1)}
                disabled={loadingCalendar}
                className="px-4 py-2 bg-accent/20 text-accent font-medium rounded-lg hover:bg-accent/30 transition-colors disabled:opacity-50"
              >
                →
              </button>
            </div>

            {/* Календарь */}
            <div className="mb-4">
              <div className="grid grid-cols-7 gap-2 mb-2">
                {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((day) => (
                  <div key={day} className="text-center text-sm font-medium text-textSecondary py-2">
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-2">
                {getCalendarDays().map((day, index) => {
                  if (day === null) {
                    return <div key={`empty-${index}`} className="aspect-square" />;
                  }

                  const dateKey = getDateKey(day);
                  const dayData = calendarDays.find(d => d.date === dateKey);
                  const isToday = dateKey === new Date().toISOString().split("T")[0];
                  const isSelected = dateKey === selectedDate;

                  // Определяем классы в зависимости от статуса
                  let dayClasses = 'aspect-square rounded-lg font-medium text-sm transition-colors ';
                  
                  if (dayData && dayData.status !== 'none') {
                    switch (dayData.status) {
                      case 'green':
                        dayClasses += 'bg-green-500 text-white hover:bg-green-600 ';
                        break;
                      case 'yellow':
                        dayClasses += 'bg-yellow-500 text-white hover:bg-yellow-600 ';
                        break;
                      case 'red':
                        dayClasses += 'bg-red-500 text-white hover:bg-red-600 ';
                        break;
                      default:
                        dayClasses += 'bg-gray-100 text-textPrimary hover:bg-gray-200 ';
                    }
                  } else {
                    dayClasses += 'bg-gray-100 text-textPrimary hover:bg-gray-200 ';
                  }

                  if (isToday) {
                    dayClasses += 'ring-2 ring-accent ring-offset-2 ';
                  }
                  
                  if (isSelected) {
                    dayClasses += 'ring-2 ring-blue-500 ring-offset-2 ';
                  }

                  return (
                    <button
                      key={day}
                      onClick={async () => {
                        setShowCalendar(false);
                        setDayReport(null);
                        setError(null);
                        setEditingMeal(null);
                        await loadCalendar();
                        await loadDayReport(dateKey, true);
                      }}
                      className={dayClasses.trim()}
                      title={dayData ? `${dayData.actualCalories.toFixed(0)} / ${dayData.targetCalories.toFixed(0)} ккал` : undefined}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>

            {loadingCalendar && (
              <div className="text-center text-textSecondary text-sm py-2">
                Загрузка...
              </div>
            )}
          </div>
        </div>
      )}
      </AppLayout>
    );
  }

  // Календарь
  return (
    <AppLayout>
      <div className="min-h-screen bg-background p-4 py-8">
        <div className="max-w-md mx-auto bg-white rounded-2xl shadow-soft p-8">
        <h1 className="text-2xl font-bold mb-6 text-textPrimary text-center">
          📅 Календарь отчётов
        </h1>

        {/* Переключение месяцев */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => changeMonth(-1)}
            disabled={loadingCalendar}
            className="px-4 py-2 bg-accent/20 text-accent font-medium rounded-lg hover:bg-accent/30 transition-colors disabled:opacity-50"
          >
            ←
          </button>
          <h2 className="text-lg font-semibold text-textPrimary">
            {currentMonth.toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}
          </h2>
          <button
            onClick={() => changeMonth(1)}
            disabled={loadingCalendar}
            className="px-4 py-2 bg-accent/20 text-accent font-medium rounded-lg hover:bg-accent/30 transition-colors disabled:opacity-50"
          >
            →
          </button>
        </div>

        {/* Календарь */}
        <div className="mb-4">
          <div className="grid grid-cols-7 gap-2 mb-2">
            {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((day) => (
              <div key={day} className="text-center text-sm font-medium text-textSecondary py-2">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {getCalendarDays().map((day, index) => {
              if (day === null) {
                return <div key={`empty-${index}`} className="aspect-square" />;
              }

              const dateKey = getDateKey(day);
              const dayData = calendarDays.find(d => d.date === dateKey);
              const isToday = dateKey === new Date().toISOString().split("T")[0];

              // Определяем классы в зависимости от статуса
              let dayClasses = 'aspect-square rounded-lg font-medium text-sm transition-colors ';
              
              if (dayData && dayData.status !== 'none') {
                // День с данными и статусом
                switch (dayData.status) {
                  case 'green':
                    dayClasses += 'bg-green-500 text-white hover:bg-green-600 ';
                    break;
                  case 'yellow':
                    dayClasses += 'bg-yellow-500 text-white hover:bg-yellow-600 ';
                    break;
                  case 'red':
                    dayClasses += 'bg-red-500 text-white hover:bg-red-600 ';
                    break;
                  default:
                    dayClasses += 'bg-gray-100 text-textPrimary hover:bg-gray-200 ';
                }
              } else {
                // День без данных
                dayClasses += 'bg-gray-100 text-textPrimary hover:bg-gray-200 ';
              }

              if (isToday) {
                dayClasses += 'ring-2 ring-accent ring-offset-2 ';
              }

              return (
                <button
                  key={day}
                  onClick={async () => {
                    // КРИТИЧНО: Полностью очищаем состояние перед загрузкой
                    setDayReport(null);
                    setError(null);
                    setEditingMeal(null);
                    
                    // Обновляем календарь перед открытием отчёта
                    await loadCalendar();
                    
                    // Принудительно обновляем отчёт
                    await loadDayReport(dateKey, true);
                  }}
                  className={dayClasses.trim()}
                  title={dayData ? `${dayData.actualCalories.toFixed(0)} / ${dayData.targetCalories.toFixed(0)} ккал` : undefined}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>

        {loadingCalendar && (
          <div className="text-center text-textSecondary text-sm py-2">
            Загрузка...
          </div>
        )}

        <div className="mt-6 text-center text-sm text-textSecondary">
          Нажмите на день, чтобы посмотреть отчёт
        </div>
        </div>
      </div>
    </AppLayout>
  );
}
function EditMealForm({
  meal,
  onSave,
  onCancel,
  onDelete
}: {
  meal: Meal;
  onSave: (updates: Partial<Meal>) => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const [mealText, setMealText] = useState(meal.meal_text || "");
  const [calories, setCalories] = useState(meal.calories?.toString() || "0");
  const [protein, setProtein] = useState(meal.protein?.toString() || "0");
  const [fat, setFat] = useState(meal.fat?.toString() || "0");
  const [carbs, setCarbs] = useState(meal.carbs?.toString() || "0");

  const handleSave = () => {
    onSave({
      meal_text: mealText,
      calories: Number(calories),
      protein: Number(protein),
      fat: Number(fat),
      carbs: Number(carbs)
    });
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-textPrimary mb-4">Редактировать приём пищи</h3>
      
      <div>
        <label className="block text-sm font-medium text-textPrimary mb-2">Название блюда</label>
        <input
          type="text"
          value={mealText}
          onChange={(e) => setMealText(e.target.value)}
          className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-accent transition-colors bg-white text-textPrimary"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-textPrimary mb-2">🔥 Калории</label>
          <input
            type="number"
            value={calories}
            onChange={(e) => setCalories(e.target.value)}
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-accent transition-colors bg-white text-textPrimary"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-textPrimary mb-2">🥚 Белки (г)</label>
          <input
            type="number"
            step="0.1"
            value={protein}
            onChange={(e) => setProtein(e.target.value)}
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-accent transition-colors bg-white text-textPrimary"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-textPrimary mb-2">🥑 Жиры (г)</label>
          <input
            type="number"
            step="0.1"
            value={fat}
            onChange={(e) => setFat(e.target.value)}
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-accent transition-colors bg-white text-textPrimary"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-textPrimary mb-2">🍚 Углеводы (г)</label>
          <input
            type="number"
            step="0.1"
            value={carbs}
            onChange={(e) => setCarbs(e.target.value)}
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-accent transition-colors bg-white text-textPrimary"
          />
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleSave}
          className="flex-1 py-3 px-6 bg-accent text-white font-semibold rounded-xl shadow-soft hover:opacity-90 transition-opacity"
        >
          Сохранить
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-6 py-3 bg-gray-100 text-textPrimary font-medium rounded-xl hover:bg-gray-200 transition-colors"
        >
          Отмена
        </button>
        <button
          onClick={onDelete}
          className="px-6 py-3 bg-red-100 text-red-700 font-medium rounded-xl hover:bg-red-200 transition-colors"
        >
          Удалить
        </button>
      </div>
    </div>
  );
}

export default function ReportPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ReportPageContent />
    </Suspense>
  );
}

