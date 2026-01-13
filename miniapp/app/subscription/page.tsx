"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense, useRef } from "react";
import Link from "next/link";
import "../globals.css";
import AppLayout from "../components/AppLayout";

interface SubscriptionStatus {
  isActive: boolean;
  status: string;
  activeUntil: string | null;
  nextChargeAt: string | null;
  planCode: string | null;
}

function SubscriptionPageContent() {
  const searchParams = useSearchParams();
  const userIdParam = searchParams.get("id");

  const [userId, setUserId] = useState<number | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Payment form state
  const [paymentMethod, setPaymentMethod] = useState<"sbp" | "card">("sbp");
  const [agreeRecurring, setAgreeRecurring] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Debug drawer state
  const [showDebug, setShowDebug] = useState(false);
  const [debugData, setDebugData] = useState<any>(null);
  const debugLogRef = useRef<string[]>([]);
  const lastErrorRef = useRef<{ message: string; stack?: string; timestamp: string } | null>(null);

  // Initialize userId
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
          throw new Error(data.error || "Ошибка загрузки подписки");
        }

        setSubscription(data.subscription);
      } catch (err: any) {
        console.error("[subscription] Ошибка загрузки:", err);
        setError(err.message || "Ошибка загрузки подписки");
      } finally {
        setLoading(false);
      }
    };

    loadSubscription();
  }, [userId]);

  // Check for payment success/error in URL
  useEffect(() => {
    if (typeof window === "undefined" || !userId) return;

    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get("payment");
    const errorParam = urlParams.get("error");

    if (paymentStatus === "success") {
      // Reload subscription status
      setTimeout(() => {
        window.location.href = `/subscription?id=${userId}`;
      }, 1000);
    } else if (errorParam) {
      setPaymentError(`Ошибка оплаты: ${errorParam}`);
    }
  }, [userId]);

  // Add to debug log
  const addDebugLog = (message: string) => {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}`;
    debugLogRef.current.push(logEntry);
    if (debugLogRef.current.length > 50) {
      debugLogRef.current.shift();
    }
    console.log(`[subscription] ${logEntry}`);
  };

  // Handle payment
  const handlePay = async () => {
    if (!userId) {
      setPaymentError("ID пользователя не найден");
      return;
    }

    if (!agreeRecurring || !agreePrivacy) {
      setPaymentError("Необходимо согласиться со всеми условиями");
      return;
    }

    setProcessing(true);
    setPaymentError(null);
    addDebugLog("Начало процесса оплаты");

    // Get Telegram user ID from WebApp if available
    let telegramUserId: string | undefined;
    if (typeof window !== "undefined") {
      const tg = (window as any).Telegram?.WebApp;
      if (tg?.initDataUnsafe?.user?.id) {
        telegramUserId = tg.initDataUnsafe.user.id.toString();
        addDebugLog(`Telegram user ID получен: ${telegramUserId}`);
      } else {
        addDebugLog("Telegram WebApp не доступен, будет использован fallback");
        telegramUserId = `web:${userId}`;
      }
    }

    try {
      const requestPayload = {
        userId,
        telegramUserId: telegramUserId || `web:${userId}`,
        method: paymentMethod,
        planCode: "trial_3d_then_199",
        returnPath: "/subscription",
      };

      addDebugLog(`Отправка запроса: ${JSON.stringify({ ...requestPayload, telegramUserId: "***" })}`);

      const response = await fetch("/api/payments/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestPayload),
      });

      const responseText = await response.text();
      addDebugLog(`Получен ответ: status=${response.status}, length=${responseText.length}`);

      let data: any;
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        throw new Error(`Неверный формат ответа: ${responseText.substring(0, 200)}`);
      }

      // Fetch provider health status for debug info
      let providerHealth: any = null;
      try {
        const healthResponse = await fetch("/api/payments/health");
        if (healthResponse.ok) {
          const healthData = await healthResponse.json();
          providerHealth = healthData.providers?.robokassa || null;
        }
      } catch (e) {
        // Ignore health check errors
      }

      // Store debug data with enhanced information
      const debugInfo = {
        request: { ...requestPayload, telegramUserId: "***" },
        response: {
          ...data,
          // Include debug info from server if available
          debug: data.debug || null,
        },
        timestamp: new Date().toISOString(),
        telegramWebApp: typeof window !== "undefined" ? {
          available: !!(window as any).Telegram?.WebApp,
          version: (window as any).Telegram?.WebApp?.version,
          platform: (window as any).Telegram?.WebApp?.platform,
        } : null,
        providerConfig: providerHealth ? {
          configured: providerHealth.configured,
          source: providerHealth.source,
          envVarStatus: providerHealth.envVarStatus,
          missingEnvVars: providerHealth.missingEnvVars,
        } : null,
        // Enhanced debug info from server response
        dbInsertPayloadKeys: data.debug?.dbInsertPayloadKeys || null,
        paymentRecordId: data.debug?.paymentRecordId || null,
        dbError: data.dbError || null,
        lastError: lastErrorRef.current,
        logs: debugLogRef.current.slice(-30), // Last 30 log entries
      };
      setDebugData(debugInfo);

      // Store in sessionStorage
      try {
        if (typeof window !== "undefined" && window.sessionStorage) {
          sessionStorage.setItem("subscription_debug", JSON.stringify(debugInfo));
        }
      } catch (e) {
        // Ignore
      }

      if (!response.ok || !data.ok) {
        const errorMsg = data.error || "Не удалось начать оплату";
        addDebugLog(`Ошибка: ${errorMsg}`);
        setPaymentError(errorMsg);
        return;
      }

      if (!data.paymentUrl || typeof data.paymentUrl !== "string") {
        throw new Error("Ссылка на оплату не получена");
      }

      addDebugLog(`Получена ссылка на оплату: ${data.paymentUrl.substring(0, 80)}...`);

      // Open payment URL
      const paymentUrl = data.paymentUrl;
      if (typeof window !== "undefined") {
        // Try Telegram WebApp first
        if ((window as any).Telegram?.WebApp?.openLink) {
          try {
            addDebugLog("Открытие через Telegram.WebApp.openLink");
            (window as any).Telegram.WebApp.openLink(paymentUrl, { try_instant_view: false });
            return;
          } catch (e: any) {
            addDebugLog(`Ошибка openLink: ${e.message}, используем fallback`);
          }
        }

        // Fallback: window.location
        addDebugLog("Открытие через window.location.href");
        window.location.href = paymentUrl;
      }
    } catch (err: any) {
      const errorMsg = err.message || "Ошибка оформления подписки";
      const errorStack = err.stack || undefined;
      addDebugLog(`Ошибка: ${errorMsg}`);
      if (errorStack) {
        addDebugLog(`Stack: ${errorStack.substring(0, 500)}`);
      }
      
      // Store last error for debug panel
      lastErrorRef.current = {
        message: errorMsg,
        stack: errorStack,
        timestamp: new Date().toISOString(),
      };
      
      setPaymentError(errorMsg);
      
      // Update debug data with error
      setDebugData((prev: any) => ({
        ...prev,
        lastError: lastErrorRef.current,
        logs: debugLogRef.current.slice(-30),
      }));
    } finally {
      setProcessing(false);
    }
  };

  // Format date
  const formatDate = (iso: string | null): string => {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
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

  if (error && !subscription) {
    return (
      <AppLayout>
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-soft p-6 text-center">
            <h2 className="text-xl font-semibold mb-2 text-red-600">Ошибка</h2>
            <p className="text-textPrimary">{error}</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  const isPayButtonDisabled = !agreeRecurring || !agreePrivacy || processing;

  return (
    <AppLayout>
      <div className="min-h-screen bg-background p-4 py-8">
        <div className="max-w-md mx-auto">
          {/* Header */}
          <div className="mb-6 text-center">
            <h1 className="text-3xl font-bold text-textPrimary">Подписка</h1>
          </div>

          {/* Subscription Status Card */}
          <div className="bg-white rounded-2xl shadow-soft p-6 mb-6">
            <h2 className="text-lg font-semibold text-textPrimary mb-4">Статус</h2>
            <div className="space-y-3">
              {subscription?.isActive && subscription.activeUntil ? (
                <>
                  <div>
                    <div className="text-sm text-textSecondary mb-1">Активна до:</div>
                    <div className="text-xl font-semibold text-textPrimary">
                      {formatDate(subscription.activeUntil)}
                    </div>
                  </div>
                  {subscription.nextChargeAt && (
                    <div>
                      <div className="text-sm text-textSecondary mb-1">Следующее списание:</div>
                      <div className="text-lg font-medium text-textPrimary">
                        {formatDate(subscription.nextChargeAt)} (199 ₽)
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div>
                  <div className="text-lg font-medium text-textPrimary">
                    Активной подписки нет
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Payment Method Selection */}
          <div className="bg-white rounded-2xl shadow-soft p-6 mb-6">
            <h2 className="text-lg font-semibold text-textPrimary mb-4">
              Выберите способ оплаты
            </h2>

            <div className="space-y-3 mb-6">
              {/* SBP Option */}
              <label className="flex items-center p-4 border-2 rounded-xl cursor-pointer transition-colors hover:bg-gray-50"
                style={{
                  borderColor: paymentMethod === "sbp" ? "#8FBC8F" : "#E5E7EB",
                  backgroundColor: paymentMethod === "sbp" ? "#F0F9F0" : "transparent",
                }}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  value="sbp"
                  checked={paymentMethod === "sbp"}
                  onChange={(e) => setPaymentMethod(e.target.value as "sbp" | "card")}
                  className="mr-3 w-5 h-5"
                />
                <span className="text-textPrimary font-medium">СБП</span>
              </label>

              {/* Card Option */}
              <label className="flex items-center p-4 border-2 rounded-xl cursor-pointer transition-colors hover:bg-gray-50"
                style={{
                  borderColor: paymentMethod === "card" ? "#8FBC8F" : "#E5E7EB",
                  backgroundColor: paymentMethod === "card" ? "#F0F9F0" : "transparent",
                }}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  value="card"
                  checked={paymentMethod === "card"}
                  onChange={(e) => setPaymentMethod(e.target.value as "sbp" | "card")}
                  className="mr-3 w-5 h-5"
                />
                <span className="text-textPrimary font-medium">Карта</span>
              </label>
            </div>

            {/* Consent Checkboxes */}
            <div className="space-y-3 mb-6">
              <label className="flex items-start p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={agreeRecurring}
                  onChange={(e) => setAgreeRecurring(e.target.checked)}
                  className="mt-1 mr-3 w-5 h-5"
                />
                <span className="text-sm text-textPrimary">
                  Согласен на ежемесячное списание
                </span>
              </label>

              <label className="flex items-start p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={agreePrivacy}
                  onChange={(e) => setAgreePrivacy(e.target.checked)}
                  className="mt-1 mr-3 w-5 h-5"
                />
                <span className="text-sm text-textPrimary">
                  Согласен с{" "}
                  <Link
                    href={`/privacy?id=${userId || ""}`}
                    target="_blank"
                    className="text-accent underline"
                  >
                    Политикой конфиденциальности
                  </Link>
                </span>
              </label>
            </div>

            {/* Error Message */}
            {paymentError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-700 text-sm">{paymentError}</p>
              </div>
            )}

            {/* Pay Button */}
            <button
              onClick={handlePay}
              disabled={isPayButtonDisabled}
              className="w-full px-6 py-4 bg-accent text-white font-semibold rounded-xl hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {processing ? (
                <>
                  <span className="inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  <span>Обработка...</span>
                </>
              ) : (
                "Оплатить"
              )}
            </button>

            {/* Debug Toggle */}
            <button
              onClick={() => setShowDebug(!showDebug)}
              className="mt-4 w-full text-xs text-textSecondary hover:text-textPrimary text-center"
            >
              {showDebug ? "Скрыть отладку" : "Показать отладку"}
            </button>

            {/* Debug Drawer */}
            {showDebug && (
              <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h3 className="text-sm font-semibold text-blue-900 mb-3">Отладочная информация</h3>
                
                {debugData && (
                  <div className="mb-4">
                    {/* Provider Config Status */}
                    {debugData.providerConfig && (
                      <div className="mb-3 p-3 bg-white rounded border border-blue-200">
                        <div className="text-xs font-semibold text-blue-900 mb-2">Конфигурация провайдера</div>
                        <div className="space-y-1 text-xs">
                          <div>
                            <span className="font-medium">Настроен:</span>{" "}
                            <span className={debugData.providerConfig.configured ? "text-green-600" : "text-red-600"}>
                              {debugData.providerConfig.configured ? "✅ Да" : "❌ Нет"}
                            </span>
                          </div>
                          {debugData.providerConfig.source && (
                            <div>
                              <span className="font-medium">Источник:</span>{" "}
                              <span className="text-gray-700">{debugData.providerConfig.source}</span>
                            </div>
                          )}
                          <div>
                            <span className="font-medium">Env переменные:</span>
                            <div className="ml-2 mt-1 space-y-0.5">
                              <div>ROBOKASSA_MERCHANT_LOGIN: {debugData.providerConfig.envVarStatus?.robokassaMerchantLogin ? "✅" : "❌"}</div>
                              <div>ROBOKASSA_PASSWORD1: {debugData.providerConfig.envVarStatus?.robokassaPassword1 ? "✅" : "❌"}</div>
                              <div>ROBOKASSA_PASSWORD2: {debugData.providerConfig.envVarStatus?.robokassaPassword2 ? "✅" : "❌"}</div>
                              <div className="text-gray-500 text-[10px] mt-1">Алиасы (fallback):</div>
                              <div className="ml-2">ROBO_MERCHANT_LOGIN: {debugData.providerConfig.envVarStatus?.roboMerchantLogin ? "✅" : "❌"}</div>
                              <div className="ml-2">ROBO_PASSWORD1: {debugData.providerConfig.envVarStatus?.roboPassword1 ? "✅" : "❌"}</div>
                              <div className="ml-2">ROBO_PASSWORD2: {debugData.providerConfig.envVarStatus?.roboPassword2 ? "✅" : "❌"}</div>
                            </div>
                          </div>
                          {debugData.providerConfig.missingEnvVars && debugData.providerConfig.missingEnvVars.length > 0 && (
                            <div className="mt-2 p-2 bg-red-50 rounded text-red-700">
                              <div className="font-medium">Отсутствуют:</div>
                              <ul className="list-disc list-inside ml-2">
                                {debugData.providerConfig.missingEnvVars.map((varName: string, idx: number) => (
                                  <li key={idx} className="text-[10px]">{varName}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* DB Insert Payload Info */}
                    {debugData.dbInsertPayloadKeys && (
                      <div className="mb-3 p-3 bg-white rounded border border-green-200">
                        <div className="text-xs font-semibold text-green-900 mb-2">DB Insert Payload</div>
                        <div className="text-xs text-gray-700">
                          <div className="font-medium">Ключи:</div>
                          <div className="ml-2 mt-1 font-mono text-[10px]">
                            {debugData.dbInsertPayloadKeys.join(", ")}
                          </div>
                          {debugData.paymentRecordId && (
                            <div className="mt-2">
                              <span className="font-medium">Payment Record ID:</span>{" "}
                              <span className="font-mono">{debugData.paymentRecordId}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* DB Error Info */}
                    {debugData.dbError && (
                      <div className="mb-3 p-3 bg-red-50 rounded border border-red-200">
                        <div className="text-xs font-semibold text-red-900 mb-2">Ошибка БД</div>
                        <div className="text-xs space-y-1">
                          <div>
                            <span className="font-medium">Сообщение:</span>{" "}
                            <span className="text-red-700">{debugData.dbError.message || "Unknown"}</span>
                          </div>
                          {debugData.dbError.code && (
                            <div>
                              <span className="font-medium">Код:</span>{" "}
                              <span className="text-red-700">{debugData.dbError.code}</span>
                            </div>
                          )}
                          {debugData.dbError.details && (
                            <div>
                              <span className="font-medium">Детали:</span>{" "}
                              <span className="text-red-700 text-[10px]">{debugData.dbError.details}</span>
                            </div>
                          )}
                          {debugData.dbError.hint && (
                            <div>
                              <span className="font-medium">Подсказка:</span>{" "}
                              <span className="text-red-700 text-[10px]">{debugData.dbError.hint}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* DB Insert Payload Info */}
                    {debugData.dbInsertPayloadKeys && (
                      <div className="mb-3 p-3 bg-white rounded border border-green-200">
                        <div className="text-xs font-semibold text-green-900 mb-2">DB Insert Payload</div>
                        <div className="text-xs text-gray-700">
                          <div className="font-medium">Ключи:</div>
                          <div className="ml-2 mt-1 font-mono text-[10px]">
                            {debugData.dbInsertPayloadKeys.join(", ")}
                          </div>
                          {debugData.paymentRecordId && (
                            <div className="mt-2">
                              <span className="font-medium">Payment Record ID:</span>{" "}
                              <span className="font-mono">{debugData.paymentRecordId}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* DB Error Info */}
                    {debugData.dbError && (
                      <div className="mb-3 p-3 bg-red-50 rounded border border-red-200">
                        <div className="text-xs font-semibold text-red-900 mb-2">Ошибка БД</div>
                        <div className="text-xs space-y-1">
                          <div>
                            <span className="font-medium">Сообщение:</span>{" "}
                            <span className="text-red-700">{debugData.dbError.message || "Unknown"}</span>
                          </div>
                          {debugData.dbError.code && (
                            <div>
                              <span className="font-medium">Код:</span>{" "}
                              <span className="text-red-700">{debugData.dbError.code}</span>
                            </div>
                          )}
                          {debugData.dbError.details && (
                            <div>
                              <span className="font-medium">Детали:</span>{" "}
                              <span className="text-red-700 text-[10px]">{debugData.dbError.details}</span>
                            </div>
                          )}
                          {debugData.dbError.hint && (
                            <div>
                              <span className="font-medium">Подсказка:</span>{" "}
                              <span className="text-red-700 text-[10px]">{debugData.dbError.hint}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="text-xs font-semibold text-blue-900 mb-2">Запрос/Ответ</div>
                    <pre className="text-xs font-mono text-gray-700 whitespace-pre-wrap break-all max-h-40 overflow-y-auto bg-white p-2 rounded border">
                      {JSON.stringify(debugData, null, 2)}
                    </pre>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(JSON.stringify(debugData, null, 2));
                        addDebugLog("JSON скопирован в буфер обмена");
                      }}
                      className="mt-2 px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                    >
                      Копировать JSON
                    </button>
                  </div>
                )}

                {/* Last Error */}
                {debugData?.lastError && (
                  <div className="mb-4 p-3 bg-red-50 rounded border border-red-200">
                    <div className="text-xs font-semibold text-red-900 mb-2">Последняя ошибка</div>
                    <div className="text-xs space-y-1">
                      <div>
                        <span className="font-medium">Сообщение:</span>{" "}
                        <span className="text-red-700">{debugData.lastError.message}</span>
                      </div>
                      {debugData.lastError.stack && (
                        <div>
                          <span className="font-medium">Stack:</span>
                          <pre className="text-[10px] font-mono text-red-600 mt-1 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                            {debugData.lastError.stack}
                          </pre>
                        </div>
                      )}
                      <div className="text-gray-500 text-[10px]">
                        Время: {new Date(debugData.lastError.timestamp).toLocaleString("ru-RU")}
                      </div>
                    </div>
                  </div>
                )}

                {/* Debug Logs */}
                <div>
                  <div className="text-xs font-semibold text-blue-900 mb-2">
                    Лог отладки ({debugData?.logs?.length || debugLogRef.current.length} записей, последние 30)
                  </div>
                  <div className="text-xs font-mono text-gray-700 max-h-40 overflow-y-auto bg-white p-2 rounded border space-y-1">
                    {(!debugData?.logs || debugData.logs.length === 0) && debugLogRef.current.length === 0 ? (
                      <div className="text-gray-500">Нет записей в логе</div>
                    ) : (
                      (debugData?.logs || debugLogRef.current).map((entry: string, idx: number) => (
                        <div key={idx} className="break-all">{entry}</div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-textSecondary">Загрузка...</div>
    </div>
  );
}

function SubscriptionPageWrapper() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <SubscriptionPageContent />
    </Suspense>
  );
}

export default function SubscriptionPage() {
  return <SubscriptionPageWrapper />;
}
