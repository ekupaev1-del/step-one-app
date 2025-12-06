"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import "./globals.css";

// Клиентский компонент с пошаговой формой
export function QuestionnaireFormContent() {
  const searchParams = useSearchParams();
  const userIdParam = searchParams.get("id");

  const [userId, setUserId] = useState<number | null>(null);
  const webAppRef = useRef<any>(null);
  const [step, setStep] = useState(0); // 0 = приветствие, 1-6 = шаги
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Форма данные
  const [gender, setGender] = useState<string>("");
  const [age, setAge] = useState<string>("");
  const [weight, setWeight] = useState<string>("");
  const [height, setHeight] = useState<string>("");
  const [activity, setActivity] = useState<string>("");
  const [goal, setGoal] = useState<string>("");
  const [calories, setCalories] = useState<number | null>(null);
  const [protein, setProtein] = useState<number | null>(null);
  const [fat, setFat] = useState<number | null>(null);
  const [carbs, setCarbs] = useState<number | null>(null);

  // Сохраняем ссылку на WebApp при монтировании и инициализируем его
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    // Функция для получения WebApp
    const getWebApp = () => {
      // Пробуем разные способы доступа
      const tg = (window as any).Telegram;
      if (tg?.WebApp) {
        return tg.WebApp;
      }
      
      // Пробуем через глобальный объект
      if ((window as any).Telegram?.WebApp) {
        return (window as any).Telegram.WebApp;
      }
      
      return null;
    };
    
    // Ждем, пока Telegram WebApp будет доступен
    const initWebApp = (attempt = 0) => {
      const webApp = getWebApp();
      
      if (webApp) {
        webAppRef.current = webApp;
        // Инициализируем WebApp
        try {
          if (typeof webApp.ready === 'function') {
            webApp.ready();
          }
          if (typeof webApp.expand === 'function') {
            webApp.expand();
          }
        } catch (e) {
          console.warn("[questionnaire] Ошибка инициализации WebApp:", e);
        }
        
        console.log("[questionnaire] ✅ WebApp сохранен и инициализирован:", {
          version: webApp.version,
          platform: webApp.platform,
          hasClose: typeof webApp.close === 'function',
          attempt: attempt
        });
      } else {
        if (attempt < 10) { // Пробуем до 10 раз
          console.log(`[questionnaire] ⚠️ Telegram WebApp недоступен, попытка ${attempt + 1}/10...`);
          setTimeout(() => initWebApp(attempt + 1), 200);
        } else {
          console.error("[questionnaire] ❌ Telegram WebApp не загрузился после 10 попыток");
        }
      }
    };
    
    // Пробуем сразу
    initWebApp(0);
    
    // Также слушаем событие загрузки
    window.addEventListener('load', () => {
      setTimeout(() => initWebApp(0), 100);
    });
  }, []);

  // Проверяем id при монтировании
  useEffect(() => {
    if (userIdParam) {
      const n = Number(userIdParam);
      if (Number.isFinite(n) && n > 0) {
        setUserId(n);
        setError(null);
      } else {
        setError("Некорректный id пользователя");
      }
    } else {
      setError("ID не передан. Запустите анкету через Telegram бота");
    }
  }, [userIdParam]);

  const calculateMacros = useCallback(() => {
    if (!gender || !age || !weight || !height || !activity || !goal) return;

    const ageNum = Number(age);
    const weightNum = Number(weight);
    const heightNum = Number(height);

    if (!Number.isFinite(ageNum) || !Number.isFinite(weightNum) || !Number.isFinite(heightNum)) {
      return;
    }

    // Формула Миффлина-Сан Жеора
    let bmr = 0;
    if (gender === "male") {
      bmr = 10 * weightNum + 6.25 * heightNum - 5 * ageNum + 5;
    } else {
      bmr = 10 * weightNum + 6.25 * heightNum - 5 * ageNum - 161;
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

    // Макроэлементы
    const proteinGrams = Math.round(weightNum * 2.2);
    const proteinCalories = proteinGrams * 4;

    const fatCalories = Math.round(totalCalories * 0.25);
    const fatGrams = Math.round(fatCalories / 9);

    const carbsCalories = totalCalories - proteinCalories - fatCalories;
    const carbsGrams = Math.round(carbsCalories / 4);

    setCalories(totalCalories);
    setProtein(proteinGrams);
    setFat(fatGrams);
    setCarbs(carbsGrams);
  }, [gender, age, weight, height, activity, goal]);

  const handleNext = () => {
    if (step === 0) {
      setStep(1);
    } else if (step === 1 && gender) {
      setStep(2);
    } else if (step === 2 && age) {
      setStep(3);
    } else if (step === 3 && weight) {
      setStep(4);
    } else if (step === 4 && height) {
      setStep(5);
    } else if (step === 5 && activity) {
      setStep(6);
    } else if (step === 6 && goal) {
      calculateMacros();
      setStep(7);
    }
  };

  const handleBack = () => {
    if (step > 0) {
      setStep(step - 1);
    }
  };

  const handleSubmit = async () => {
    if (!userId || !calories || !protein || !fat || !carbs || saved || loading) {
      console.log("[handleSubmit] Пропуск сохранения:", { userId, calories, protein, fat, carbs, saved, loading });
      return;
    }

    console.log("[handleSubmit] Начало сохранения:", { userId, calories, protein, fat, carbs, activity, goal });

    setLoading(true);
    setError(null);

    try {
      const payload = {
        gender,
        age: Number(age),
        weight: Number(weight),
        height: Number(height),
        activity: activity || "moderate",
        goal,
        calories,
        protein,
        fat,
        carbs
      };

      console.log("[handleSubmit] Отправка данных:", payload);

      const response = await fetch(`/api/save?id=${userId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      console.log("[handleSubmit] Статус ответа:", response.status);

      const data = await response.json();
      console.log("[handleSubmit] Ответ сервера:", data);

      if (!response.ok) {
        setError(data.error || "Ошибка сохранения данных");
        setLoading(false);
        return;
      }

      setSaved(true);
      setLoading(false);
      console.log("[handleSubmit] Данные успешно сохранены");

      // Закрываем Mini App - используем все возможные способы
      const closeMiniApp = (attempt = 0) => {
        try {
          // Функция для получения WebApp
          const getWebApp = () => {
            // Способ 1: через ref
            if (webAppRef.current) {
              return webAppRef.current;
            }
            
            // Способ 2: через window.Telegram.WebApp
            if (typeof window !== "undefined") {
              const tg = (window as any).Telegram;
              if (tg?.WebApp) {
                webAppRef.current = tg.WebApp; // Сохраняем в ref
                return tg.WebApp;
              }
            }
            
            return null;
          };
          
          const webApp = getWebApp();
          
          if (webApp && typeof webApp.close === 'function') {
            try {
              webApp.close();
              console.log("[questionnaire] ✅ Mini App закрыт (попытка " + (attempt + 1) + ")");
              return true;
            } catch (closeError) {
              console.error("[questionnaire] Ошибка при вызове close():", closeError);
            }
          }
          
          // Если не получилось и попыток меньше 5, пробуем еще раз
          if (attempt < 4) {
            console.log(`[questionnaire] Попытка ${attempt + 1} не удалась, пробуем еще раз...`);
            console.log("[questionnaire] webAppRef.current:", webAppRef.current);
            console.log("[questionnaire] window.Telegram:", typeof window !== "undefined" ? (window as any).Telegram : "window недоступен");
            return false; // Вернем false, чтобы вызвать через setTimeout
          } else {
            console.error("[questionnaire] ❌ Не удалось закрыть Mini App после 5 попыток");
            return false;
          }
        } catch (e) {
          console.error("[questionnaire] ❌ Ошибка при закрытии:", e);
          return false;
        }
      };
      
      // Вызываем сразу и через задержки для гарантии
      if (!closeMiniApp(0)) {
        setTimeout(() => closeMiniApp(1), 500);
        setTimeout(() => closeMiniApp(2), 1000);
        setTimeout(() => closeMiniApp(3), 2000);
        setTimeout(() => closeMiniApp(4), 3000);
      }
    } catch (err) {
      console.error("[handleSubmit] Ошибка отправки формы:", err);
      setError("Не удалось отправить данные. Попробуйте позже.");
      setLoading(false);
    }
  };

  const handleBackToBot = () => {
    // Закрываем Telegram WebApp
    if (typeof window !== "undefined" && (window as any).Telegram?.WebApp) {
      (window as any).Telegram.WebApp.close();
    } else {
      window.close();
    }
  };

  const handleRestart = () => {
    // Сбрасываем все данные, но не сохраняем флаг saved
    // Пользователь должен сохранить данные перед повторным прохождением
    if (saved) {
      setStep(0);
      setGender("");
      setAge("");
      setWeight("");
      setHeight("");
      setActivity("");
      setGoal("");
      setCalories(null);
      setProtein(null);
      setFat(null);
      setCarbs(null);
      setSaved(false);
      setError(null);
      setLoading(false);
    } else {
      // Если данные не сохранены, просто возвращаемся к началу
      setStep(0);
      setGender("");
      setAge("");
      setWeight("");
      setHeight("");
      setActivity("");
      setGoal("");
      setCalories(null);
      setProtein(null);
      setFat(null);
      setCarbs(null);
      setError(null);
      setLoading(false);
    }
  };

  if (error && !userId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-soft p-6 text-center">
          <h2 className="text-xl font-semibold mb-2 text-red-600">Ошибка</h2>
          <p className="text-textPrimary">{error}</p>
          <p className="text-sm text-textSecondary mt-4">Запустите анкету через Telegram бота</p>
        </div>
      </div>
    );
  }

  const totalSteps = 6;
  const progress = step === 0 ? 0 : ((step - 1) / totalSteps) * 100;

  // Экран 0: Приветствие
  if (step === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: '#F6F3EF' }}>
        <div className="max-w-md w-full bg-white rounded-[44px] shadow-lg p-8" style={{ paddingTop: '56px' }}>
          <p className="text-xs uppercase text-gray-400 mb-6 tracking-[0.15em] font-light text-center">
            ТВОЙ ДНЕВНИК ПИТАНИЯ
          </p>
          <h1 className="text-3xl md:text-4xl font-bold mb-4 text-gray-800 leading-tight text-center">
            Считаем, сколько<br />
            калорий нужно в<br />
            день
          </h1>
          <p className="text-base text-gray-600 mb-10 text-center" style={{ fontSize: '16px' }}>
            Просто ответьте на пару вопросов.
          </p>
          <button
            onClick={handleNext}
            className="w-full py-4 px-6 text-white font-medium rounded-[50px] shadow-md hover:opacity-90 transition-opacity text-lg"
            style={{ backgroundColor: '#A4C49A' }}
          >
            Начать!
          </button>
        </div>
      </div>
    );
  }

  // Экран 7: Результаты
  if (step === 7) {
    return (
      <div className="min-h-screen bg-background p-4 py-8">
        <div className="max-w-md mx-auto bg-white rounded-2xl shadow-soft p-8">
          <h2 className="text-xl font-semibold mb-6 text-textPrimary text-center">
            Ваша норма на день
          </h2>
          {calories && protein && fat && carbs && (
            <div className="grid grid-cols-2 gap-4 mb-8">
              {/* Калории */}
              <div className="p-5 bg-white rounded-xl border border-gray-100 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">🔥</span>
                  <span className="text-xs text-textSecondary">Калории</span>
                </div>
                <div className="text-2xl font-bold text-textPrimary">{calories} <span className="text-sm font-normal text-textSecondary">ккал</span></div>
              </div>

              {/* Белки */}
              <div className="p-5 bg-white rounded-xl border border-gray-100 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">🥚</span>
                  <span className="text-xs text-textSecondary">Белки</span>
                </div>
                <div className="text-2xl font-bold text-textPrimary">{protein} <span className="text-sm font-normal text-textSecondary">г</span></div>
              </div>

              {/* Жиры */}
              <div className="p-5 bg-white rounded-xl border border-gray-100 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">🥥</span>
                  <span className="text-xs text-textSecondary">Жиры</span>
                </div>
                <div className="text-2xl font-bold text-textPrimary">{fat} <span className="text-sm font-normal text-textSecondary">г</span></div>
              </div>

              {/* Углеводы */}
              <div className="p-5 bg-white rounded-xl border border-gray-100 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">🍚</span>
                  <span className="text-xs text-textSecondary">Углеводы</span>
                </div>
                <div className="text-2xl font-bold text-textPrimary">{carbs} <span className="text-sm font-normal text-textSecondary">г</span></div>
              </div>
            </div>
          )}

          {loading && (
            <div className="text-center text-textSecondary text-sm py-2 mb-4">
              Сохранение...
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">
              {error}
            </div>
          )}

          {saved && (
            <div className="p-4 bg-accent/10 border border-accent/20 rounded-lg text-accent text-sm mb-4 text-center">
              ✅ Данные сохранены
            </div>
          )}

          {!saved && (
            <div className="space-y-3">
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="w-full py-4 px-6 bg-accent text-white font-semibold rounded-xl shadow-soft hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Сохранение..." : "Сохранить данные"}
              </button>
              <button
                onClick={handleRestart}
                className="w-full py-4 px-6 bg-gray-100 text-textPrimary font-medium rounded-xl hover:bg-gray-200 transition-colors"
              >
                Пройти тест заново
              </button>
            </div>
          )}

          {saved && (
            <div className="space-y-3">
              <button
                onClick={handleRestart}
                className="w-full py-4 px-6 bg-gray-100 text-textPrimary font-semibold rounded-xl hover:bg-gray-200 transition-colors"
              >
                Пройти тест заново
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Шаги вопросов
  const steps = [
    {
      step: 1,
      title: "Выберите свой пол",
      icon: "👥",
      content: (
        <div className="space-y-3">
          <button
            onClick={() => setGender("male")}
            className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
              gender === "male"
                ? "border-accent bg-accent/10"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <span className="text-xl mr-3">👨</span>
            <span className="text-base font-medium text-textPrimary">Мужчина</span>
          </button>
          <button
            onClick={() => setGender("female")}
            className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
              gender === "female"
                ? "border-accent bg-accent/10"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <span className="text-xl mr-3">👩</span>
            <span className="text-base font-medium text-textPrimary">Женщина</span>
          </button>
        </div>
      ),
      canProceed: !!gender
    },
    {
      step: 2,
      title: "Сколько тебе лет?",
      icon: "🎂",
      content: (
        <input
          type="number"
          value={age}
          onChange={(e) => setAge(e.target.value)}
          placeholder="Например, 28"
          min="1"
          max="120"
          className="w-full px-4 py-3 text-lg border-2 border-gray-200 rounded-xl focus:outline-none focus:border-accent transition-colors bg-white text-textPrimary placeholder:text-textSecondary"
        />
      ),
      canProceed: !!age && Number(age) > 0
    },
    {
      step: 3,
      title: "Сколько ты весишь?",
      icon: "⚖️",
      content: (
        <div className="relative">
          <input
            type="number"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="Например, 82"
            min="1"
            step="0.1"
            className="w-full px-4 py-3 pr-12 text-lg border-2 border-gray-200 rounded-xl focus:outline-none focus:border-accent transition-colors bg-white text-textPrimary placeholder:text-textSecondary"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-textSecondary text-sm">КГ</span>
        </div>
      ),
      canProceed: !!weight && Number(weight) > 0
    },
    {
      step: 4,
      title: "Какой у тебя рост?",
      icon: "📏",
      content: (
        <div className="relative">
          <input
            type="number"
            value={height}
            onChange={(e) => setHeight(e.target.value)}
            placeholder="Например, 180"
            min="1"
            className="w-full px-4 py-3 pr-12 text-lg border-2 border-gray-200 rounded-xl focus:outline-none focus:border-accent transition-colors bg-white text-textPrimary placeholder:text-textSecondary"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-textSecondary text-sm">см</span>
        </div>
      ),
      canProceed: !!height && Number(height) > 0
    },
    {
      step: 5,
      title: "Какой у тебя уровень активности?",
      icon: "🏃",
      content: (
        <div>
          <p className="text-sm text-textSecondary mb-4">Это помогает учесть тренировочные нагрузки.</p>
          <div className="space-y-3">
            <button
              onClick={() => setActivity("sedentary")}
              className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                activity === "sedentary"
                  ? "border-accent bg-accent/10"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <span className="text-xl mr-3">🪑</span>
              <span className="text-base font-medium text-textPrimary">Сидячая работа</span>
            </button>
            <button
              onClick={() => setActivity("light")}
              className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                activity === "light"
                  ? "border-accent bg-accent/10"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <span className="text-xl mr-3">🚶</span>
              <span className="text-base font-medium text-textPrimary">1-2 тренировки в неделю</span>
            </button>
            <button
              onClick={() => setActivity("moderate")}
              className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                activity === "moderate"
                  ? "border-accent bg-accent/10"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <span className="text-xl mr-3">🏃</span>
              <span className="text-base font-medium text-textPrimary">3-4 тренировки</span>
            </button>
            <button
              onClick={() => setActivity("active")}
              className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                activity === "active"
                  ? "border-accent bg-accent/10"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <span className="text-xl mr-3">💪</span>
              <span className="text-base font-medium text-textPrimary">5+ тренировок</span>
            </button>
            <button
              onClick={() => setActivity("very_active")}
              className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                activity === "very_active"
                  ? "border-accent bg-accent/10"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <span className="text-xl mr-3">🔥</span>
              <span className="text-base font-medium text-textPrimary">Спорт ежедневно</span>
            </button>
          </div>
        </div>
      ),
      canProceed: !!activity
    },
    {
      step: 6,
      title: "Какая цель по весу?",
      icon: "🎯",
      content: (
        <div className="space-y-3">
          <button
            onClick={() => setGoal("lose")}
            className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
              goal === "lose"
                ? "border-accent bg-accent/10"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <span className="text-xl mr-3">📉</span>
            <span className="text-base font-medium text-textPrimary">Похудеть</span>
          </button>
          <button
            onClick={() => setGoal("maintain")}
            className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
              goal === "maintain"
                ? "border-accent bg-accent/10"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <span className="text-xl mr-3">⚖️</span>
            <span className="text-base font-medium text-textPrimary">Поддерживать</span>
          </button>
          <button
            onClick={() => setGoal("gain")}
            className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
              goal === "gain"
                ? "border-accent bg-accent/10"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <span className="text-xl mr-3">📈</span>
            <span className="text-base font-medium text-textPrimary">Набрать</span>
          </button>
        </div>
      ),
      canProceed: !!goal
    }
  ];

  const currentStepData = steps[step - 1];

  return (
    <div className="min-h-screen bg-background p-4 py-8">
      <div className="max-w-md mx-auto bg-white rounded-2xl shadow-soft p-8">
        <p className="text-xs uppercase text-textSecondary mb-4 tracking-wider font-light">
          ТВОЙ ДНЕВНИК ПИТАНИЯ
        </p>
        <h2 className="text-2xl font-bold mb-4 text-textPrimary">
          Считаем, сколько калорий нужно в день
        </h2>

        {/* Прогресс-бар */}
        <div className="mb-6">
          <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Вопрос */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-2xl">{currentStepData.icon}</span>
            <h3 className="text-lg font-medium text-textPrimary">{currentStepData.title}</h3>
          </div>
          {currentStepData.content}
        </div>

        {/* Кнопка Далее */}
        <button
          onClick={handleNext}
          disabled={!currentStepData.canProceed}
          className="w-full py-4 px-6 bg-accent text-white font-semibold rounded-xl shadow-soft hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed mb-4 flex items-center justify-center gap-2"
        >
          Далее
          <span>→</span>
        </button>

        {/* Ссылка назад */}
        {step > 1 && (
          <button
            onClick={handleBack}
            className="w-full text-center text-textSecondary text-sm hover:text-textPrimary transition-colors"
          >
            ← Вернуться на шаг назад
          </button>
        )}
      </div>
    </div>
  );
}
