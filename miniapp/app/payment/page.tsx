"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import AppLayout from "../components/AppLayout";

function PaymentContent() {
  const searchParams = useSearchParams();
  const [userId, setUserId] = useState<number | null>(null);
  const [loading, setLoading] = useState<string | boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  const [trialEndAt, setTrialEndAt] = useState<string | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  useEffect(() => {
    const id = searchParams.get("id");
    if (id) {
      const n = Number(id);
      if (Number.isFinite(n) && n > 0) {
        setUserId(n);
        loadSubscriptionStatus(n);
      } else {
        setError("Некорректный id пользователя");
      }
    } else {
      setError("ID не передан");
    }
    
    // Сбрасываем состояние при загрузке
    setLoading(false);
    setAgreedToTerms(false);
  }, [searchParams]);

  const loadSubscriptionStatus = async (id: number) => {
    try {
      const res = await fetch(`/api/user?id=${id}`);
      const data = await res.json();
      if (data.ok) {
        // API возвращает данные напрямую, не в объекте user
        setSubscriptionStatus(data.subscriptionStatus);
        setTrialEndAt(data.trialEndAt);
      } else {
        console.error("[payment] Error loading subscription status:", data.error);
      }
    } catch (e) {
      console.error("[payment] Error loading subscription status:", e);
    }
  };

  const startTrial = async () => {
    if (!userId) return;
    if (!agreedToTerms) {
      setError("Необходимо согласиться с условиями оферты");
      return;
    }
    setLoading("creating");
    setError(null);
    
    try {
      // Use clean subscription endpoint
      const res = await fetch("/api/pay/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      
      console.log("[payment] Response status:", res.status);
      console.log("[payment] Response data:", JSON.stringify(data, null, 2));
      
      // Проверяем статус ответа
      if (!res.ok) {
        const errorMsg = data?.error || `HTTP ${res.status}: Ошибка сервера`;
        console.error("[payment] HTTP error:", res.status, errorMsg);
        throw new Error(errorMsg);
      }
      
      // Проверяем, что API вернул успешный ответ
      if (!data || !data.ok) {
        const errorMsg = data?.error || "Ошибка создания платежа";
        console.error("[payment] API error:", errorMsg, data);
        throw new Error(errorMsg);
      }
      
      // Проверяем наличие subscription URL
      if (!data.subscriptionUrl) {
        console.error("[payment] Missing subscription URL:", data);
        throw new Error("URL подписки не получен от сервера.");
      }
      
      console.log("[payment] ✅ Subscription URL получен:", data.subscriptionUrl);
      
      // Открываем ссылку на подписку Robokassa
      // В Telegram Mini App это откроется в WebView
      window.location.href = data.subscriptionUrl;
      
      setLoading(false);
      setError(null);
    } catch (e: any) {
      console.error("[payment] Error:", e);
      const errorMessage = e.message || "Ошибка создания платежа";
      setError(errorMessage);
      setLoading(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const isTrialActive = subscriptionStatus === "trial" && trialEndAt;
  const isActive = subscriptionStatus === "active";
  const canStartTrial = !subscriptionStatus || subscriptionStatus === "none" || subscriptionStatus === "expired";

  return (
    <AppLayout>
      <div className="min-h-screen bg-background p-4 py-8 pb-24">
        <div className="max-w-md mx-auto bg-white rounded-2xl shadow-soft p-6 space-y-4">
          <div className="text-center space-y-1">
            <h1 className="text-2xl font-bold text-textPrimary">Подписка Step One</h1>
            <p className="text-sm text-textSecondary">199 ₽ в месяц</p>
            <p className="text-xs text-textSecondary mt-1">Автоматическое продление каждый месяц</p>
          </div>

          {isTrialActive && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
              <p className="font-semibold text-green-800">Триал активен</p>
              <p className="text-sm text-green-700">
                Триал заканчивается: {formatDate(trialEndAt)}
              </p>
              <p className="text-xs text-green-600">
                После окончания триала произойдёт автоматическое списание 199 ₽ за месяц.
              </p>
            </div>
          )}

          {isActive && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="font-semibold text-blue-800">Подписка активна</p>
              <p className="text-sm text-blue-700">
                Подписка продлевается автоматически каждый месяц.
              </p>
            </div>
          )}

          {canStartTrial && (
            <>
          <div className="bg-accent/5 border border-accent/20 rounded-xl p-4 text-sm text-textPrimary">
            <p className="font-semibold mb-1">Оформить подписку</p>
                <p className="text-textSecondary mb-2">
                  При оплате карта будет сохранена для автоматического продления подписки каждый месяц.
                </p>
            <p className="text-textSecondary">
              Подписка продлевается автоматически. Вы можете отменить её в любой момент в личном кабинете.
            </p>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              <p className="font-semibold mb-1">❌ Ошибка:</p>
              <p>{error}</p>
            </div>
          )}

          <div className="space-y-3">
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className="mt-0.5 w-5 h-5 rounded border-gray-300 text-accent focus:ring-2 focus:ring-accent cursor-pointer flex-shrink-0"
                />
                <span className="text-sm text-textPrimary flex-1 leading-relaxed">
                  Я согласен на автоматические списания согласно{" "}
                  <Link
                    href={userId ? `/oferta?id=${userId}` : "/oferta"}
                    className="text-accent underline hover:text-accent/80 font-medium"
                    target="_blank"
                  >
                    условиям оферты
                  </Link>
                </span>
              </label>
            </div>

            <button
              onClick={startTrial}
              disabled={!userId || !!loading || !agreedToTerms}
              className="w-full py-3 rounded-xl bg-accent text-white font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              {loading === "creating" 
                ? "Переход на страницу оплаты..." 
                : "Оформить подписку"}
            </button>
            
            {loading === "creating" && (
              <p className="text-sm text-textSecondary text-center mt-2">
                Переход на страницу оплаты Robokassa...
              </p>
            )}
          </div>
            </>
          )}

          {(isTrialActive || isActive) && (
            <Link
              href={`/profile?id=${userId}`}
              className="block w-full py-3 rounded-xl border border-gray-200 text-textPrimary font-semibold hover:bg-gray-50 text-center"
            >
              Отменить подписку
            </Link>
          )}

          <p className="text-xs text-textSecondary text-center">
            Оплата проходит через Robokassa. Вы можете отменить автосписание в любой момент до даты списания.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}

export default function PaymentPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="text-lg font-semibold text-textPrimary mb-2">Загрузка...</div>
          <div className="text-sm text-textSecondary">Подготовка страницы оплаты</div>
        </div>
      </div>
    }>
      <PaymentContent />
    </Suspense>
  );
}
