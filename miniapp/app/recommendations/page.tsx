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

  const getSeverityColor = (severity: string) => {
    // Изменяем цветовую схему: убираем красный, делаем более мягкие цвета
    switch (severity) {
      case "high":
        return "bg-blue-50 border-blue-200 text-blue-900";
      case "medium":
        return "bg-blue-50 border-blue-200 text-blue-900";
      case "low":
        return "bg-blue-50 border-blue-200 text-blue-900";
      default:
        return "bg-gray-50 border-gray-200 text-gray-800";
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
        <div className="max-w-md mx-auto bg-white rounded-2xl shadow-soft p-8">
          <div className="flex flex-col gap-2 mb-6">
            <h1 className="text-2xl font-bold text-textPrimary text-center">Рекомендации</h1>
            <p className="text-sm text-textSecondary text-center">
              Средние за {days === 1 ? "1 день" : days === 7 ? "7 дней" : days === 30 ? "30 дней" : days === 365 ? "365 дней" : `${days} дней`}
            </p>
            <div className="flex justify-center">
              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white shadow-sm focus:outline-none focus:border-accent"
              >
                <option value={1}>За 1 день</option>
                <option value={7}>За 7 дней</option>
                <option value={30}>За 30 дней</option>
                <option value={365}>За 365 дней</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="text-center text-textSecondary py-8">Загрузка рекомендаций...</div>
          ) : error ? (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          ) : recommendations.length === 0 ? (
            <div className="text-center text-textSecondary py-8">
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
                  if (type === "water") {
                    return num.toLocaleString("ru-RU");
                  }
                  return num.toLocaleString("ru-RU");
                };

                return (
                  <div
                    key={index}
                    className={`p-4 rounded-xl border-2 ${getSeverityColor(rec.severity)}`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-2xl flex-shrink-0">{getTypeIcon(rec.type)}</span>
                      <div className="flex-1 min-w-0">
                        {rec.title && (
                          <h3 className="font-bold text-base mb-1.5 leading-tight">{rec.title}</h3>
                        )}
                        {rec.current !== undefined && rec.goal !== undefined && (
                          <div className="mb-2.5 px-3 py-2 bg-white/70 rounded-lg border border-blue-200/50">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-baseline gap-1.5">
                                <span className="text-sm font-bold text-blue-900">
                                  {formatNumber(rec.current, rec.type)}
                                </span>
                                <span className="text-xs text-blue-700">{getUnit(rec.type)}</span>
                                <span className="text-xs text-blue-600 mx-1">→</span>
                                <span className="text-sm font-bold text-blue-900">
                                  {formatNumber(rec.goal, rec.type)}
                                </span>
                                <span className="text-xs text-blue-700">{getUnit(rec.type)}</span>
                              </div>
                              {rec.current < rec.goal && (
                                <span className="text-xs font-medium text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
                                  −{formatNumber(rec.goal - rec.current, rec.type)} {getUnit(rec.type)}
                                </span>
                              )}
                              {rec.current > rec.goal && (
                                <span className="text-xs font-medium text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
                                  +{formatNumber(rec.current - rec.goal, rec.type)} {getUnit(rec.type)}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                        <p className="text-sm mb-2 leading-relaxed">{rec.message}</p>
                        <p className="text-sm opacity-90 leading-relaxed">{rec.suggestion}</p>
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
