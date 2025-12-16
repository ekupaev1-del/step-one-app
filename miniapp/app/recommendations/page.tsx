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

  // Проверка согласия с политикой конфиденциальности
  useEffect(() => {
    if (!userId) return;

    const checkPrivacy = async () => {
      setCheckingPrivacy(true);
      try {
        const response = await fetch(`/api/privacy/check?userId=${userId}`);
        const data = await response.json();

        if (response.ok && data.ok) {
          if (!data.all_accepted) {
            // Пользователь не дал согласие (хотя бы одно из двух) - редирект на экран согласия
            window.location.href = `/privacy/consent?id=${userId}`;
            return;
          }
        } else {
          // Если ошибка, разрешаем продолжить (на случай проблем с API)
          console.warn("[RecommendationsPage] Ошибка проверки согласия:", data.error);
        }
      } catch (err) {
        console.error("[RecommendationsPage] Ошибка проверки согласия:", err);
        // При ошибке разрешаем продолжить
      } finally {
        setCheckingPrivacy(false);
      }
    };

    checkPrivacy();
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
    // Apple-style: мягкие акцентные цвета на белом фоне
    switch (type) {
      case "protein":
        return {
          accent: "text-amber-600",
          badge: "bg-amber-50 text-amber-700 border-amber-100"
        };
      case "calories":
        return {
          accent: "text-orange-600",
          badge: "bg-orange-50 text-orange-700 border-orange-100"
        };
      case "water":
        return {
          accent: "text-blue-600",
          badge: "bg-blue-50 text-blue-700 border-blue-100"
        };
      case "fat":
        return {
          accent: "text-green-600",
          badge: "bg-green-50 text-green-700 border-green-100"
        };
      case "carbs":
        return {
          accent: "text-purple-600",
          badge: "bg-purple-50 text-purple-700 border-purple-100"
        };
      default:
        return {
          accent: "text-gray-600",
          badge: "bg-gray-50 text-gray-700 border-gray-100"
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
      <div className="min-h-screen bg-gray-50 p-4 py-6 pb-24">
        <div className="max-w-md mx-auto">
          <div className="mb-6">
            <h1 className="text-3xl font-semibold text-gray-900 mb-1">Рекомендации</h1>
            <p className="text-sm text-gray-500 mb-4">
              Средние за {days === 1 ? "1 день" : days === 7 ? "7 дней" : days === 30 ? "30 дней" : days === 365 ? "365 дней" : `${days} дней`}
            </p>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="w-full px-4 py-2.5 bg-white rounded-xl border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            >
              <option value={1}>За 1 день</option>
              <option value={7}>За 7 дней</option>
              <option value={30}>За 30 дней</option>
              <option value={365}>За 365 дней</option>
            </select>
          </div>

          {loading ? (
            <div className="text-center text-gray-500 py-12">Загрузка рекомендаций...</div>
          ) : error ? (
            <div className="p-4 bg-white rounded-2xl shadow-sm border border-red-100 text-red-600 text-sm">
              {error}
            </div>
          ) : recommendations.length === 0 ? (
            <div className="text-center text-gray-500 py-12 bg-white rounded-2xl shadow-sm">
              <p className="mb-2 text-gray-900">Пока недостаточно данных</p>
              <p className="text-sm">Ведите дневник питания несколько дней, и мы дадим вам персональные советы!</p>
            </div>
          ) : (
            <div className="space-y-3">
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
                    className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
                  >
                    <div className="p-5">
                      <div className="flex items-start gap-4 mb-4">
                        <span className="text-3xl flex-shrink-0">{getTypeIcon(rec.type)}</span>
                        <div className="flex-1 min-w-0">
                          {rec.title && (
                            <h3 className="font-semibold text-lg text-gray-900 mb-1 leading-tight">
                              {rec.title}
                            </h3>
                          )}
                        </div>
                      </div>

                      {rec.current !== undefined && rec.goal !== undefined && (
                        <div className="mb-4 pt-4 border-t border-gray-100">
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-gray-600 font-medium">Сейчас</span>
                              <span className="text-base font-semibold text-gray-900">
                                {formatNumber(rec.current, rec.type)} {getUnit(rec.type)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-gray-600 font-medium">Нужно</span>
                              <span className="text-base font-semibold text-gray-900">
                                {formatNumber(rec.goal, rec.type)} {getUnit(rec.type)}
                              </span>
                            </div>
                            <div className="pt-3 border-t border-gray-100">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-gray-700">
                                  {deficit > 0 ? "Не хватает" : deficit < 0 ? "Превышение" : "В норме"}
                                </span>
                                <span className={`text-sm font-semibold px-3 py-1.5 rounded-full border ${colors.badge}`}>
                                  {deficit > 0 ? "−" : deficit < 0 ? "+" : ""}
                                  {formatNumber(Math.abs(deficit), rec.type)} {getUnit(rec.type)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="space-y-2">
                        <p className="text-sm text-gray-700 leading-relaxed">{rec.message}</p>
                        <p className="text-sm text-gray-600 leading-relaxed">{rec.suggestion}</p>
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
