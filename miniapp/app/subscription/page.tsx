"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";
import "../globals.css";
import AppLayout from "../components/AppLayout";
import { DebugDetailsPanel, DebugErrorDetails } from "../components/DebugDetailsPanel";
import { collectClientDebugContext } from "@/lib/debugContext";
import { resolveUserIdWithTrace } from "@/lib/resolveUserId";

function SubscriptionPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const userIdParam = searchParams.get("id");
  
  const [userId, setUserId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<any>(null);
  const [debugError, setDebugError] = useState<DebugErrorDetails | null>(null);
  const [lastApiRequestId, setLastApiRequestId] = useState<string | null>(null);
  const [lastApiResponse, setLastApiResponse] = useState<any>(null);
  
  // Payment method selection state
  const [showPaymentMethod, setShowPaymentMethod] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<"card" | "sbp" | null>(null);
  const [processingPayment, setProcessingPayment] = useState(false);

  // Initialize userId with tracing
  useEffect(() => {
    const trace = resolveUserIdWithTrace(searchParams);
    
    if (trace.userId) {
      setUserId(trace.userId);
      setError(null);
      setDebugError(null);
    } else {
      // Build debug error for missing userId
      const clientContext = collectClientDebugContext();
      const debugDetails: DebugErrorDetails = {
        errorType: "USER_ID_MISSING",
        message: "ID не передан",
        timestamp: new Date().toISOString(),
        clientContext,
        userId: {
          value: null,
          source: trace.source,
          derivation: JSON.stringify(trace, null, 2),
        },
        userIdResolution: trace,
      };
      
      setError("ID не передан");
      setDebugError(debugDetails);
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

        setLastApiRequestId(data.requestId || null);
        setLastApiResponse({ status: response.status, body: data });

        if (!response.ok || !data.ok) {
          // Build debug error
          const clientContext = collectClientDebugContext();
          const trace = resolveUserIdWithTrace(searchParams);
          const debugDetails: DebugErrorDetails = {
            errorType: "API_ERROR",
            message: data.error || "Ошибка загрузки подписки",
            requestId: data.requestId,
            timestamp: new Date().toISOString(),
            clientContext,
            apiRequest: {
              endpoint: `/api/subscription/status?userId=${userId}`,
              method: "GET",
            },
            apiResponse: {
              status: response.status,
              statusText: response.statusText,
              body: data,
            },
            serverError: data.errorDetails,
            userId: {
              value: userId,
              source: trace.source,
              derivation: JSON.stringify(trace, null, 2),
            },
            userIdResolution: trace,
          };
          
          setError(data.error || "Ошибка загрузки подписки");
          setDebugError(debugDetails);
          throw new Error(data.error || "Ошибка загрузки подписки");
        }

        setSubscription(data);
        setError(null);
        setDebugError(null);
      } catch (err: any) {
        console.error("[SubscriptionPage] Ошибка загрузки подписки:", err);
        if (!debugError) {
          // Only set if not already set above
          setError(err.message || "Ошибка загрузки подписки");
        }
      } finally {
        setLoading(false);
      }
    };

    loadSubscription();
  }, [userId]);

  const handleSelectPaymentMethod = () => {
    setShowPaymentMethod(true);
  };

  const handlePay = async () => {
    if (!selectedMethod) return;

    const startTime = Date.now();
    setProcessingPayment(true);
    setError(null);
    setDebugError(null);

    // Collect client debug context
    const clientContext = collectClientDebugContext();

    // CRITICAL: Resolve userId DIRECTLY from searchParams (not from state)
    // This ensures we get the value even if state hasn't updated yet
    const trace = resolveUserIdWithTrace(searchParams);
    const resolvedUserId = trace.userId;

    // Also try to get from window.location as fallback
    let finalUserId = resolvedUserId;
    if (!finalUserId && typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const urlUserId = urlParams.get("userId") || urlParams.get("id");
      if (urlUserId) {
        const n = Number(urlUserId);
        if (Number.isFinite(n) && n > 0) {
          finalUserId = n;
          trace.notes.push(`Fallback: Found userId=${n} from window.location.search`);
        }
      }
    }

    if (!finalUserId) {
      const debugDetails: DebugErrorDetails = {
        errorType: "USER_ID_MISSING",
        message: "userId обязателен",
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        clientContext,
        userId: {
          value: null,
          source: trace.source,
          derivation: JSON.stringify(trace, null, 2),
        },
        userIdResolution: trace,
        paymentState: {
          selectedMethod,
          processingPayment,
          showPaymentMethod,
        },
      };
      setError("userId обязателен");
      setDebugError(debugDetails);
      setProcessingPayment(false);
      return;
    }

    // Build payload with userId in BOTH places
    const payload = {
      userId: finalUserId,  // Include in body
      id: finalUserId,       // Also include as 'id' for compatibility
      method: selectedMethod,
      planCode: "trial_3d_then_199",
      returnPath: `/subscription?id=${finalUserId}`,
    };

    // Build URL with userId in query string
    const apiUrl = `/api/subscription/create-payment?userId=${finalUserId}`;

    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      const duration = Date.now() - startTime;

      if (!response.ok || !data.ok) {
        // Build debug error details with full request/response info
        const debugDetails: DebugErrorDetails = {
          errorType: "API_ERROR",
          message: data.error || "Ошибка создания платежа",
          requestId: data.requestId,
          timestamp: new Date().toISOString(),
          duration,
          clientContext,
          apiRequest: {
            endpoint: apiUrl,  // Full URL with query params
            method: "POST",
            payloadKeys: Object.keys(payload),
            payloadHasUserId: payload.userId !== undefined,
            payloadUserIdValue: payload.userId,
            headers: {
              "Content-Type": "application/json",
            },
          },
          apiResponse: {
            status: response.status,
            statusText: response.statusText,
            body: data,
          },
          serverError: data.code ? {
            code: data.code,
            message: data.error,
            details: data.debug || data.details,
          } : undefined,
          serverDebug: data.debug,  // Include server debug if available
          userId: {
            value: finalUserId,
            source: trace.source,
            derivation: JSON.stringify(trace, null, 2),
          },
          userIdResolution: trace,
          paymentState: {
            selectedMethod,
            processingPayment,
            showPaymentMethod,
          },
          lastApiRequestId,
          lastApiResponse,
        };
        
        setLastApiRequestId(data.requestId || null);
        setLastApiResponse({ status: response.status, body: data });

        setError(data.error || "Ошибка создания платежа");
        setDebugError(debugDetails);
        setProcessingPayment(false);
        return;
      }

      // Open payment URL
      const paymentUrl = data.paymentUrl;
      
      // Use Telegram.WebApp.openLink if available, otherwise window.location
      if (typeof window !== "undefined" && (window as any).Telegram?.WebApp?.openLink) {
        (window as any).Telegram.WebApp.openLink(paymentUrl);
      } else {
        window.location.href = paymentUrl;
      }

      // Note: After payment, user will be redirected back to /subscription
      // The status will be reloaded automatically
    } catch (err: any) {
      const duration = Date.now() - startTime;
      console.error("[SubscriptionPage] Ошибка создания платежа:", err);

      // Build debug error details for network/client errors
      const debugDetails: DebugErrorDetails = {
        errorType: "CLIENT_ERROR",
        message: err.message || "Ошибка создания платежа",
        timestamp: new Date().toISOString(),
        duration,
        clientContext,
        apiRequest: {
          endpoint: apiUrl,  // Full URL with query params
          method: "POST",
          payloadKeys: Object.keys(payload),
          payloadHasUserId: payload.userId !== undefined,
          payloadUserIdValue: payload.userId,
          headers: {
            "Content-Type": "application/json",
          },
        },
        userId: {
          value: finalUserId,
          source: trace.source,
          derivation: JSON.stringify(trace, null, 2),
        },
        userIdResolution: trace,
        paymentState: {
          selectedMethod,
          processingPayment,
          showPaymentMethod,
        },
        lastApiRequestId,
        lastApiResponse,
      };

      setError(err.message || "Ошибка создания платежа");
      setDebugError(debugDetails);
      setProcessingPayment(false);
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
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm mb-4">
              {error}
            </div>
            <DebugDetailsPanel error={debugError} />
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
          ) : showPaymentMethod ? (
            // Payment method selection view
            <div className="space-y-6">
              <div className="bg-white rounded-lg p-6 shadow-sm">
                <div className="text-center mb-6">
                  <div className="text-lg font-semibold text-textPrimary mb-2">
                    Выберите способ оплаты
                  </div>
                  <div className="text-sm text-textSecondary">
                    Первые 3 дня за 1 ₽, далее автоматическое списание каждый месяц 199 ₽
                  </div>
                </div>

                <div className="space-y-3 mb-6">
                  <button
                    onClick={() => setSelectedMethod("card")}
                    className={`w-full p-4 rounded-lg border-2 text-left transition-colors ${
                      selectedMethod === "card"
                        ? "border-blue-600 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="text-2xl">💳</div>
                        <div>
                          <div className="font-semibold text-textPrimary">Карта</div>
                          <div className="text-sm text-textSecondary">Visa, Mastercard, МИР</div>
                        </div>
                      </div>
                      {selectedMethod === "card" && (
                        <div className="text-blue-600">✓</div>
                      )}
                    </div>
                  </button>

                  <button
                    onClick={() => setSelectedMethod("sbp")}
                    className={`w-full p-4 rounded-lg border-2 text-left transition-colors ${
                      selectedMethod === "sbp"
                        ? "border-blue-600 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="text-2xl">📱</div>
                        <div>
                          <div className="font-semibold text-textPrimary">СБП</div>
                          <div className="text-sm text-textSecondary">Система быстрых платежей</div>
                        </div>
                      </div>
                      {selectedMethod === "sbp" && (
                        <div className="text-blue-600">✓</div>
                      )}
                    </div>
                  </button>
                </div>

                {error && (
                  <div className="mb-4">
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                      {error}
                    </div>
                    <DebugDetailsPanel error={debugError} />
                  </div>
                )}

                <button
                  onClick={handlePay}
                  disabled={!selectedMethod || processingPayment}
                  className={`w-full py-3 px-4 rounded-lg font-semibold text-white transition-colors ${
                    !selectedMethod || processingPayment
                      ? "bg-gray-400 cursor-not-allowed"
                      : "bg-blue-600 hover:bg-blue-700"
                  }`}
                >
                  {processingPayment ? "Обработка..." : "Оплатить"}
                </button>

                <button
                  onClick={() => {
                    setShowPaymentMethod(false);
                    setSelectedMethod(null);
                    setError(null);
                    setDebugError(null);
                  }}
                  className="w-full mt-3 py-2 text-textSecondary hover:text-textPrimary transition-colors"
                >
                  Назад
                </button>
              </div>
            </div>
          ) : (
            // Empty state view
            <div className="bg-white rounded-lg p-6 shadow-sm text-center">
              <div className="text-4xl mb-4">💎</div>
              <div className="text-lg font-semibold text-textPrimary mb-2">
                Активной подписки нет
              </div>
              <div className="text-sm text-textSecondary mb-6">
                Подпишитесь, чтобы получить доступ ко всем функциям
              </div>
              <button
                onClick={handleSelectPaymentMethod}
                className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
              >
                Выбрать способ оплаты
              </button>
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
