"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense, type ReactElement } from "react";
import "../globals.css";
import AppLayout from "../components/AppLayout";

interface Recommendation {
  type: "protein" | "fat" | "carbs" | "calories" | "water";
  title?: string; // Заголовок рекомендации
  message: string; // Основной текст
  suggestion: string; // Рекомендация
  severity: "low" | "medium" | "high";
  current?: number; // Текущее среднее значение
  goal?: number; // Целевое значение
}

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-textSecondary">Загрузка...</div>
    </div>
  );
}

function RecommendationsPageContent(): ReactElement {
  const searchParams = useSearchParams();
  const userIdParam = searchParams.get("id");
  
  const [userId, setUserId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [days, setDays] = useState<number>(1);
  const [checkingPrivacy, setCheckingPrivacy] = useState(false);

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
        } else {
          // If error, log but allow continue (graceful degradation)
          console.warn("[RecommendationsPage] Ошибка проверки онбординга:", data.error);
        }
      } catch (err) {
        console.error("[RecommendationsPage] Ошибка проверки онбординга:", err);
        // При ошибке разрешаем продолжить
      } finally {
        setCheckingPrivacy(false);
      }
    };

    checkOnboarding();
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    const loadRecommendations = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/recommendations?userId=${userId}&days=${days}`);
        const data = await response.json();

        if (!response.ok || !data.ok) {
          throw new Error(data.error || "Ошибка загрузки рекомендаций");
        }

        setRecommendations(data.recommendations || []);
      } catch (err: any) {
        console.error("[recommendations] Ошибка:", err);
        setError(err.message || "Ошибка загрузки рекомендаций");
      } finally {
        setLoading(false);
      }
    };

    loadRecommendations();
  }, [userId, days]);

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

  const getTypeColor = (type: string) => {
    // Цветные карточки в стиле Apple с мягкими оттенками
    switch (type) {
      case "protein":
        return {
          bg: "bg-amber-50",
          border: "border-amber-100",
          text: "text-amber-900",
          accent: "text-amber-700",
          badge: "bg-amber-100 text-amber-800 border-amber-200"
        };
      case "calories":
        return {
          bg: "bg-orange-50",
          border: "border-orange-100",
          text: "text-orange-900",
          accent: "text-orange-700",
          badge: "bg-orange-100 text-orange-800 border-orange-200"
        };
      case "water":
        return {
          bg: "bg-cyan-50",
          border: "border-cyan-100",
          text: "text-cyan-900",
          accent: "text-cyan-700",
          badge: "bg-cyan-100 text-cyan-800 border-cyan-200"
        };
      case "fat":
        return {
          bg: "bg-green-50",
          border: "border-green-100",
          text: "text-green-900",
          accent: "text-green-700",
          badge: "bg-green-100 text-green-800 border-green-200"
        };
      case "carbs":
        return {
          bg: "bg-purple-50",
          border: "border-purple-100",
          text: "text-purple-900",
          accent: "text-purple-700",
          badge: "bg-purple-100 text-purple-800 border-purple-200"
        };
      default:
        return {
          bg: "bg-gray-50",
          border: "border-gray-100",
          text: "text-gray-900",
          accent: "text-gray-700",
          badge: "bg-gray-100 text-gray-800 border-gray-200"
        };
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "protein":
        return "🥚";
      case "fat":
        return "🥑";
      case "carbs":
        return "🍚";
      case "calories":
        return "🔥";
      case "water":
        return "💧";
      default:
        return "💡";
    }
  };

  return (
    <AppLayout>
      <div className="min-h-screen bg-background p-4 py-8 pb-24">
        <div className="max-w-md mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-textPrimary mb-4 text-center">Рекомендации</h1>
            <div className="flex justify-center">
              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="px-4 py-2.5 bg-white rounded-xl border border-gray-200 text-sm text-textPrimary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent shadow-soft"
              >
                <option value={1}>Средние за 1 день</option>
                <option value={7}>Средние за 7 дней</option>
                <option value={30}>Средние за 30 дней</option>
                <option value={365}>Средние за 365 дней</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="text-center text-textSecondary py-8">Загрузка рекомендаций...</div>
          ) : error ? (
            <div className="p-4 bg-white rounded-2xl shadow-soft border border-red-200 text-red-700 text-sm">
              {error}
            </div>
          ) : recommendations.length === 0 ? (
            <div className="text-center text-textSecondary py-8 bg-white rounded-2xl shadow-soft p-6">
              <p className="mb-2">Пока недостаточно данных для рекомендаций.</p>
              <p className="text-sm">Ведите дневник питания несколько дней, и мы дадим вам персональные советы!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {recommendations.map((rec, index) => {
                const getUnit = (type: string) => {
                  switch (type) {
                    case "protein":
                    case "fat":
                    case "carbs":
                      return "г";
                    case "calories":
                      return "ккал";
                    case "water":
                      return "мл";
                    default:
                      return "";
                  }
                };

                const formatNumber = (num: number, type: string) => {
                  return num.toLocaleString("ru-RU");
                };

                const colors = getTypeColor(rec.type);
                const deficit = rec.current !== undefined && rec.goal !== undefined 
                  ? rec.goal - rec.current 
                  : 0;

                return (
                  <div
                    key={index}
                    className={`${colors.bg} rounded-2xl shadow-soft border ${colors.border} overflow-hidden`}
                  >
                    <div className="p-5">
                      <div className="flex items-start gap-3 mb-3">
                        <span className="text-2xl flex-shrink-0">{getTypeIcon(rec.type)}</span>
                        <div className="flex-1 min-w-0">
                          {rec.title && (
                            <h3 className={`font-bold text-base mb-2 leading-tight ${colors.text}`}>
                              {rec.title}
                            </h3>
                          )}
                        </div>
                      </div>

                      {rec.current !== undefined && rec.goal !== undefined && (
                        <div className={`mb-3 px-3 py-2.5 bg-white/60 rounded-xl border ${colors.border}`}>
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-gray-600 font-medium">Сейчас потребляешь:</span>
                              <span className={`text-sm font-bold ${colors.text}`}>
                                {formatNumber(rec.current, rec.type)} {getUnit(rec.type)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-gray-600 font-medium">Нужно:</span>
                              <span className={`text-sm font-bold ${colors.text}`}>
                                {formatNumber(rec.goal, rec.type)} {getUnit(rec.type)}
                              </span>
                            </div>
                            <div className="pt-1.5 border-t border-gray-200">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-gray-700">
                                  {deficit > 0 ? "Не хватает:" : deficit < 0 ? "Превышение:" : "В норме"}
                                </span>
                                <span className={`text-sm font-bold px-2 py-1 rounded border ${colors.badge}`}>
                                  {deficit > 0 ? "−" : deficit < 0 ? "+" : ""}
                                  {formatNumber(Math.abs(deficit), rec.type)} {getUnit(rec.type)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="space-y-2">
                        <p className={`text-sm leading-relaxed ${colors.text}`}>{rec.message}</p>
                        <p className={`text-sm opacity-90 leading-relaxed ${colors.text}`}>{rec.suggestion}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

export default function RecommendationsPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <RecommendationsPageContent />
    </Suspense>
  );
}
