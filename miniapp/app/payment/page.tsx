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
      
      // Проверяем наличие данных для POST формы
      if (!data.actionUrl || !data.formData) {
        console.error("[payment] Missing required data:", {
          hasActionUrl: !!data.actionUrl,
          hasFormData: !!data.formData,
          fullResponse: data,
        });
        throw new Error("Данные для оплаты не получены от сервера.");
      }
      
      console.log("[payment] ✅ Payment data получены");
      console.log("[payment] Action URL:", data.actionUrl);
      console.log("[payment] Form data:", data.formData);
      
      // Сохраняем данные платежа - НЕ отправляем форму автоматически!
      setPaymentData({
        actionUrl: data.actionUrl,
        formData: data.formData,
      });
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

  // Функция для отправки формы оплаты
  const submitPaymentForm = () => {
    console.log("[payment] ========== SUBMIT FORM ==========");
    console.log("[payment] Timestamp:", new Date().toISOString());
    
    if (!paymentData) {
      console.error("[payment] ❌ No payment data to submit");
      return;
    }
    
    console.log("[payment] Action URL:", paymentData.actionUrl);
    console.log("[payment] Form data:", paymentData.formData);
    
    // Логируем все поля формы перед отправкой
    console.log("[payment] 📋 Form fields to submit:");
    Object.entries(paymentData.formData).forEach(([key, value]) => {
      if (key === "SignatureValue") {
        console.log(`[payment]   ${key}: ${String(value).substring(0, 8)}... (${String(value).length} chars)`);
      } else {
        console.log(`[payment]   ${key}: ${value}`);
      }
    });
    
    setLoading("redirecting");
    
    // Создаем POST форму
    const form = document.createElement("form");
    form.method = "POST";
    form.action = paymentData.actionUrl;
    form.style.display = "none";
    form.target = "_self"; // Открываем в том же окне
    
    console.log("[payment] Form element created");
    console.log("[payment] Form method:", form.method);
    console.log("[payment] Form action:", form.action);
    console.log("[payment] Form target:", form.target);
    
    // Добавляем все поля формы
    const formFields: Array<{ name: string; value: string }> = [];
    Object.entries(paymentData.formData).forEach(([key, value]) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = key;
      input.value = String(value);
      form.appendChild(input);
      formFields.push({ name: key, value: String(value) });
    });
    
    console.log("[payment] ✅ Form fields added:", formFields.length, "fields");
    
    // Добавляем форму в DOM
    document.body.appendChild(form);
    console.log("[payment] ✅ Form appended to DOM");
    
    // Проверяем форму перед отправкой
    console.log("[payment] Form check before submit:");
    console.log("[payment]   Form in DOM:", document.body.contains(form));
    console.log("[payment]   Form action:", form.action);
    console.log("[payment]   Form method:", form.method);
    console.log("[payment]   Form inputs count:", form.querySelectorAll("input").length);
    
    // Логируем финальные значения всех input'ов
    const inputs = form.querySelectorAll("input");
    console.log("[payment] Final input values:");
    inputs.forEach((input) => {
      const inputElement = input as HTMLInputElement;
      if (inputElement.name === "SignatureValue") {
        console.log(`[payment]   ${inputElement.name}: ${inputElement.value.substring(0, 8)}...`);
      } else {
        console.log(`[payment]   ${inputElement.name}: ${inputElement.value}`);
      }
    });
    
    console.log("[payment] 🚀 Submitting form to Robokassa...");
    console.log("[payment] ======================================");
    
    // Отправляем форму
    try {
      form.submit();
      console.log("[payment] ✅ Form.submit() called successfully");
    } catch (submitError: any) {
      console.error("[payment] ❌ Form submit error:", submitError);
      console.error("[payment] Error message:", submitError.message);
      console.error("[payment] Error stack:", submitError.stack);
      setError(`Ошибка отправки формы: ${submitError.message}`);
      setLoading(false);
    }
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

          {/* Debug Panel (только в dev режиме) */}
          {(process.env.NODE_ENV === "development" || showDebug) && debugInfo && (
            <div className="mt-4 p-4 bg-gray-100 rounded-xl border border-gray-300">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-800">🐛 Debug Info</h3>
                <button
                  onClick={() => setShowDebug(!showDebug)}
                  className="text-xs text-gray-600 hover:text-gray-800"
                >
                  {showDebug ? "Скрыть" : "Показать"}
                </button>
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
                  {paymentData && (
                    <div>
                      <strong>Form Data:</strong>
                      <pre className="mt-1 p-2 bg-white rounded text-xs overflow-auto max-h-32">
                        {JSON.stringify(
                          {
                            actionUrl: paymentData.actionUrl,
                            formData: Object.fromEntries(
                              Object.entries(paymentData.formData).map(([k, v]) => [
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
                </div>
              )}
            </div>
          )}

          {/* Кнопка для показа debug в production (скрытая) */}
          {process.env.NODE_ENV === "production" && debugInfo && (
            <button
              onClick={() => setShowDebug(!showDebug)}
              className="mt-2 text-xs text-gray-400 hover:text-gray-600"
            >
              {showDebug ? "Скрыть debug" : "Показать debug"}
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
