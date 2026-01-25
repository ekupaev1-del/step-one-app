"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense } from "react";
import "../globals.css";
import AppLayout from "../components/AppLayout";
import { resolveUserIdWithTrace } from "@/lib/resolveUserId";

// Hardcoded Robokassa recurring subscription URL
const ROBOKASSA_RECURRING_SUBSCRIPTION_URL = "https://auth.robokassa.ru/RecurringSubscriptionPage/Subscription/Subscribe?SubscriptionId=b718af89-10c1-4018-856d-558d592c0f40";

function SubscriptionPageContent() {
  const searchParams = useSearchParams();
  const userIdParam = searchParams.get("id");
  
  const [userId, setUserId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<any>(null);

  // Initialize userId with tracing
  useEffect(() => {
    const trace = resolveUserIdWithTrace(searchParams);
    
    if (trace.userId) {
      setUserId(trace.userId);
      setError(null);
    } else {
      setError("ID не передан");
      setLoading(false);
    }
  }, [userIdParam, searchParams]);

  // Load subscription status
  useEffect(() => {
    if (!userId) return;

    const loadSubscription = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/subscription/status?userId=${userId}`);
        const data = await response.json();

        if (!response.ok || !data.ok) {
          setError(data.error || "Ошибка загрузки подписки");
          throw new Error(data.error || "Ошибка загрузки подписки");
        }

        setSubscription(data);
        setError(null);
      } catch (err: any) {
        console.error("[SubscriptionPage] Ошибка загрузки подписки:", err);
        if (!error) {
          setError(err.message || "Ошибка загрузки подписки");
        }
      } finally {
        setLoading(false);
      }
    };

    loadSubscription();
  }, [userId]);

  // Handle opening Robokassa recurring subscription page
  const handleSubscribe = () => {
    try {
      // Check if we're in Telegram WebApp
      if (typeof window !== "undefined" && (window as any).Telegram?.WebApp?.openLink) {
        // Use Telegram WebApp.openLink (preferred for Telegram Mini App)
        (window as any).Telegram.WebApp.openLink(ROBOKASSA_RECURRING_SUBSCRIPTION_URL);
      } else {
        // Fallback: use window.open for normal browser
        window.open(ROBOKASSA_RECURRING_SUBSCRIPTION_URL, "_blank", "noopener,noreferrer");
      }
    } catch (err: any) {
      console.error("[SubscriptionPage] Failed to open subscription URL:", err);
      setError("Ошибка открытия страницы оплаты");
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      return dateString;
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

  if (error && !userId) {
    return (
      <AppLayout>
        <div className="min-h-screen flex items-center justify-center bg-background px-4">
          <div className="w-full max-w-md">
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
              {error}
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  const hasActiveSubscription = subscription?.active;

  return (
    <AppLayout>
      <div className="min-h-screen bg-background pb-24">
        <div className="max-w-md mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold text-textPrimary mb-6">Подписка</h1>

          {hasActiveSubscription ? (
            // Active subscription view
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <div className="space-y-4">
                <div>
                  <div className="text-sm text-textSecondary mb-1">Подписка активна до:</div>
                  <div className="text-lg font-semibold text-textPrimary">
                    {formatDate(subscription.activeUntil)}
                  </div>
                </div>

                {subscription.nextChargeAt && (
                  <div>
                    <div className="text-sm text-textSecondary mb-1">Следующее списание:</div>
                    <div className="text-lg font-semibold text-textPrimary">
                      {formatDate(subscription.nextChargeAt)} (199 ₽)
                    </div>
                  </div>
                )}

                <div className="pt-4 border-t border-gray-200">
                  <div className="text-sm text-textSecondary">
                    Для отмены свяжитесь со службой заботы:{" "}
                    <a href="https://t.me/stepone_support" className="text-blue-600 underline">
                      @stepone_support
                    </a>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            // Empty state view with subscribe button
            <div className="bg-white rounded-lg p-6 shadow-sm text-center">
              <div className="text-4xl mb-4">💎</div>
              <div className="text-lg font-semibold text-textPrimary mb-2">
                Активной подписки нет
              </div>
              <div className="text-sm text-textSecondary mb-6">
                Подпишитесь, чтобы получить доступ ко всем функциям
              </div>
              <button
                onClick={handleSubscribe}
                className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors mb-2"
              >
                Оплатить подписку
              </button>
              <div className="text-xs text-textSecondary mt-2">
                Откроется страница оплаты Robokassa
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

export default function SubscriptionPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="text-textSecondary">Загрузка...</div>
        </div>
      }
    >
      <SubscriptionPageContent />
    </Suspense>
  );
}
