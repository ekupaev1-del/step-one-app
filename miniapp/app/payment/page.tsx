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
  const [paymentData, setPaymentData] = useState<{ actionUrl: string; formData: Record<string, string> } | null>(null);

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
    setPaymentData(null);
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
      console.log("[payment] ========== SUBSCRIPTION REQUEST ==========");
      console.log("[payment] Timestamp:", new Date().toISOString());
      console.log("[payment] UserId:", userId, `(type: ${typeof userId})`);
      console.log("[payment] Request URL: /api/pay/subscribe");
      console.log("[payment] Request method: POST");
      
      const requestBody = { userId };
      console.log("[payment] Request body:", JSON.stringify(requestBody, null, 2));
      
      // Use clean subscription endpoint
      const res = await fetch("/api/pay/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      
      console.log("[payment] ========== RESPONSE RECEIVED ==========");
      console.log("[payment] Response status:", res.status, res.statusText);
      console.log("[payment] Response headers:", Object.fromEntries(res.headers.entries()));
      console.log("[payment] Response ok:", res.ok);
      
      const data = await res.json();
      console.log("[payment] Response data (raw):", data);
      console.log("[payment] Response data (stringified):", JSON.stringify(data, null, 2));
      
      // Проверяем статус ответа
      if (!res.ok) {
        const errorMsg = data?.error || `HTTP ${res.status}: Ошибка сервера`;
        console.error("[payment] ========== HTTP ERROR ==========");
        console.error("[payment] HTTP status:", res.status);
        console.error("[payment] HTTP statusText:", res.statusText);
        console.error("[payment] Error message:", errorMsg);
        console.error("[payment] Full error response:", data);
        console.error("[payment] ==================================");
        throw new Error(errorMsg);
      }
      
      // Проверяем, что API вернул успешный ответ
      if (!data || !data.ok) {
        const errorMsg = data?.error || "Ошибка создания платежа";
        console.error("[payment] ========== API ERROR ==========");
        console.error("[payment] API returned ok: false");
        console.error("[payment] Error message:", errorMsg);
        console.error("[payment] Full response:", data);
        console.error("[payment] Error details:", data?.details);
        console.error("[payment] ===============================");
        throw new Error(errorMsg);
      }
      
      // Проверяем наличие ссылки на оплату
      if (!data.actionUrl) {
        console.error("[payment] ========== MISSING DATA ERROR ==========");
        console.error("[payment] Missing actionUrl in response");
        console.error("[payment] Full response:", data);
        console.error("[payment] Response keys:", Object.keys(data || {}));
        console.error("[payment] =======================================");
        throw new Error("Данные для оплаты не получены от сервера.");
      }
      
      console.log("[payment] ========== SUCCESS ==========");
      console.log("[payment] ✅ Payment data получены");
      console.log("[payment] Action URL:", data.actionUrl);
      console.log("[payment] Action URL type:", typeof data.actionUrl);
      console.log("[payment] Action URL length:", data.actionUrl?.length);
      console.log("[payment] Form data:", data.formData);
      console.log("[payment] Form data keys:", Object.keys(data.formData || {}));
      console.log("[payment] InvId:", data.InvId);
      console.log("[payment] Amount:", data.amount);
      console.log("[payment] Method:", data.method);
      console.log("[payment] =============================");
      
      // Сохраняем данные платежа - НЕ отправляем форму автоматически!
      setPaymentData({
        actionUrl: data.actionUrl,
        formData: data.formData,
      });
      setLoading(false);
      setError(null);
    } catch (e: any) {
      console.error("[payment] ========== EXCEPTION CAUGHT ==========");
      console.error("[payment] Error timestamp:", new Date().toISOString());
      console.error("[payment] Error name:", e?.name);
      console.error("[payment] Error message:", e?.message);
      console.error("[payment] Error stack:", e?.stack);
      console.error("[payment] Full error object:", e);
      console.error("[payment] Error stringified:", JSON.stringify(e, Object.getOwnPropertyNames(e), 2));
      console.error("[payment] UserId at error time:", userId);
      console.error("[payment] ======================================");
      
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

  // Функция для редиректа на страницу оплаты
  const submitPaymentForm = () => {
    console.log("[payment] ========== REDIRECT TO PAYMENT ==========");
    console.log("[payment] Timestamp:", new Date().toISOString());
    console.log("[payment] UserId:", userId);
    
    if (!paymentData) {
      console.error("[payment] ❌ No payment data to submit");
      console.error("[payment] Payment data:", paymentData);
      return;
    }
    
    console.log("[payment] Payment data exists:", !!paymentData);
    console.log("[payment] Action URL:", paymentData.actionUrl);
    console.log("[payment] Action URL type:", typeof paymentData.actionUrl);
    console.log("[payment] Action URL length:", paymentData.actionUrl?.length);
    console.log("[payment] Form data:", paymentData.formData);
    console.log("[payment] Form data keys:", Object.keys(paymentData.formData || {}));
    
    setLoading("redirecting");
    
    console.log("[payment] Redirecting to:", paymentData.actionUrl);
    console.log("[payment] =======================================");
    
    // Просто редиректим на ссылку подписки Robokassa
    window.location.href = paymentData.actionUrl;
  };

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

            {!paymentData ? (
              <>
                <button
                  onClick={startTrial}
                  disabled={!userId || !!loading || !agreedToTerms}
                  className="w-full py-3 rounded-xl bg-accent text-white font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                >
                  {loading === "creating" 
                    ? "Создаём оплату..." 
                    : "Оформить подписку"}
                </button>
                
                {loading === "creating" && (
                  <p className="text-sm text-textSecondary text-center mt-2">
                    Подготовка платежа... Пожалуйста, подождите
                  </p>
                )}
              </>
            ) : (
              <>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-2">
                  <p className="text-sm font-semibold text-blue-800 mb-1">
                    Готово к оплате!
                  </p>
                  <p className="text-xs text-blue-700">
                    Нажмите кнопку ниже для перехода на страницу оплаты
                  </p>
                </div>

                <button
                  onClick={submitPaymentForm}
                  disabled={!!loading}
                  type="button"
                  className="w-full py-3 rounded-xl bg-accent text-white font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                >
                  {loading === "redirecting" 
                    ? "Переход на страницу оплаты..." 
                    : "Перейти к оплате"}
                </button>

                <button
                  onClick={() => {
                    setPaymentData(null);
                    setLoading(false);
                  }}
                  className="w-full py-2 rounded-xl border border-gray-300 text-textPrimary font-medium hover:bg-gray-50 transition-colors text-sm"
                >
                  Отмена
                </button>
              </>
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
