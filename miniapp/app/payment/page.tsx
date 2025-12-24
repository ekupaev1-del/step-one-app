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
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [showDebug, setShowDebug] = useState(false);

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
    setDebugInfo(null);
    setLoading(false);
    setAgreedToTerms(false);
    setShowDebug(false);
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
    setDebugInfo(null); // Очищаем предыдущий debug при новом запросе
    setShowDebug(false);
    
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
      
      // Сохраняем debug info
      setDebugInfo({
        request: {
          url: "/api/pay/subscribe",
          method: "POST",
          body: requestBody,
          timestamp: new Date().toISOString(),
        },
        response: {
          status: res.status,
          statusText: res.statusText,
          data: data,
          timestamp: new Date().toISOString(),
        },
      });
      
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
      
      // Проверяем наличие данных для POST формы
      if (!data.actionUrl || !data.formData) {
        console.error("[payment] ========== MISSING DATA ERROR ==========");
        console.error("[payment] Missing actionUrl or formData in response");
        console.error("[payment] Full response:", data);
        console.error("[payment] Response keys:", Object.keys(data || {}));
        console.error("[payment] =======================================");
        throw new Error("Данные для оплаты не получены от сервера.");
      }
      
      console.log("[payment] ========== SUCCESS ==========");
      console.log("[payment] ✅ Payment data получены");
      console.log("[payment] Action URL:", data.actionUrl);
      console.log("[payment] Form data:", data.formData);
      console.log("[payment] =============================");
      
      // Создаем и отправляем POST форму
      setLoading("redirecting");
      
      const form = document.createElement("form");
      form.method = "POST";
      form.action = data.actionUrl;
      form.style.display = "none";
      form.target = "_self";
      
      Object.entries(data.formData).forEach(([key, value]) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        input.value = String(value);
        form.appendChild(input);
      });
      
      document.body.appendChild(form);
      form.submit();
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
      
      // Сохраняем debug info даже при ошибке
      setDebugInfo((prev: any) => ({
        ...prev,
        error: {
          message: errorMessage,
          timestamp: new Date().toISOString(),
        },
      }));
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
                : loading === "redirecting"
                ? "Переход на страницу оплаты..."
                : "Оформить подписку"}
            </button>
            
            {loading && (
              <p className="text-sm text-textSecondary text-center mt-2">
                {loading === "creating" 
                  ? "Подготовка платежа... Пожалуйста, подождите"
                  : "Переход на страницу оплаты Robokassa..."}
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

          {/* Debug Panel - всегда показываем кнопку если есть debugInfo */}
          {debugInfo && (
            <div className="mt-4 p-4 bg-gray-100 rounded-xl border border-gray-300">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-800">🐛 Debug Info</h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      const allData = {
                        request: debugInfo.request,
                        response: debugInfo.response,
                        formData: debugInfo?.response?.data?.formData || null,
                        actionUrl: debugInfo?.response?.data?.actionUrl || null,
                        error: debugInfo.error || null,
                      };
                      const text = JSON.stringify(allData, null, 2);
                      try {
                        await navigator.clipboard.writeText(text);
                        alert("✅ Скопировано в буфер обмена!");
                      } catch (err) {
                        // Fallback для старых браузеров
                        const textarea = document.createElement("textarea");
                        textarea.value = text;
                        textarea.style.position = "fixed";
                        textarea.style.opacity = "0";
                        document.body.appendChild(textarea);
                        textarea.select();
                        document.execCommand("copy");
                        document.body.removeChild(textarea);
                        alert("✅ Скопировано в буфер обмена!");
                      }
                    }}
                    className="text-xs text-green-600 hover:text-green-800 underline font-medium"
                  >
                    📋 Копировать всё
                  </button>
                  <button
                    onClick={() => setShowDebug(!showDebug)}
                    className="text-xs text-blue-600 hover:text-blue-800 underline"
                  >
                    {showDebug ? "Скрыть" : "Показать"}
                  </button>
                  <button
                    onClick={() => {
                      setDebugInfo(null);
                      setShowDebug(false);
                    }}
                    className="text-xs text-red-600 hover:text-red-800 underline"
                  >
                    ✕ Очистить
                  </button>
                </div>
              </div>
              {showDebug && (
                <div className="space-y-2 text-xs font-mono">
                  <div>
                    <strong>Request:</strong>
                    <pre className="mt-1 p-2 bg-white rounded text-xs overflow-auto max-h-32">
                      {JSON.stringify(debugInfo.request, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <strong>Response:</strong>
                    <pre className="mt-1 p-2 bg-white rounded text-xs overflow-auto max-h-48">
                      {JSON.stringify(debugInfo.response, null, 2)}
                    </pre>
                  </div>
                  {debugInfo?.response?.data?.formData && (
                    <div>
                      <strong>Form Data:</strong>
                      <pre className="mt-1 p-2 bg-white rounded text-xs overflow-auto max-h-32">
                        {JSON.stringify(
                          {
                            actionUrl: debugInfo.response.data.actionUrl,
                            formData: Object.fromEntries(
                              Object.entries(debugInfo.response.data.formData).map(([k, v]) => [
                                k,
                                k === "SignatureValue" ? `${String(v).substring(0, 8)}...` : v,
                              ])
                            ),
                          },
                          null,
                          2
                        )}
                      </pre>
                    </div>
                  )}
                  {debugInfo.error && (
                    <div>
                      <strong>Error:</strong>
                      <pre className="mt-1 p-2 bg-red-50 rounded text-xs overflow-auto max-h-32">
                        {JSON.stringify(debugInfo.error, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Кнопка для включения debug заранее (если еще нет debugInfo) */}
          {!debugInfo && (
            <button
              onClick={() => {
                console.log("[payment] Debug panel enabled manually");
                setShowDebug(true);
              }}
              className="mt-2 text-xs text-gray-400 hover:text-gray-600 underline"
            >
              🔍 Включить debug (показывать логи в консоли)
            </button>
          )}
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
