"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense, useRef } from "react";
import Link from "next/link";
import "../globals.css";
import AppLayout from "../components/AppLayout";

interface SubscriptionStatus {
  isActive: boolean;
  activeUntil: string | null;
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
        const response = await fetch(`/api/subscription/me?userId=${userId}`);
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
      }
    }

    try {
      const requestPayload = {
        method: paymentMethod,
        planCode: "monthly_199",
        amount: 199,
        currency: "RUB",
        userId,
        ...(telegramUserId && { telegramUserId }),
      };

      addDebugLog(`Отправка запроса: ${JSON.stringify(requestPayload)}`);

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

      // Store debug data
      setDebugData({
        request: requestPayload,
        response: data,
        timestamp: new Date().toISOString(),
      });

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
      addDebugLog(`Ошибка: ${errorMsg}`);
      setPaymentError(errorMsg);
    } finally {
      setProcessing(false);
    }
  };

  // Format date
  const formatDate = (iso: string | null): string => {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
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
            <h1 className="text-3xl font-bold text-textPrimary">Subscription</h1>
          </div>

          {/* Subscription Status Card */}
          <div className="bg-white rounded-2xl shadow-soft p-6 mb-6">
            <div className="text-center">
              {subscription?.isActive && subscription.activeUntil ? (
                <>
                  <div className="text-sm text-textSecondary mb-2">Active until</div>
                  <div className="text-2xl font-semibold text-textPrimary">
                    {formatDate(subscription.activeUntil)}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-sm text-textSecondary mb-2">Status</div>
                  <div className="text-2xl font-semibold text-textPrimary">
                    No active subscription
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Payment Method Selection */}
          <div className="bg-white rounded-2xl shadow-soft p-6 mb-6">
            <h2 className="text-lg font-semibold text-textPrimary mb-4">
              Choose payment method
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
                <span className="text-textPrimary font-medium">SBP</span>
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
                <span className="text-textPrimary font-medium">Card</span>
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
                  I agree to monthly recurring charges
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
                  I agree with the{" "}
                  <Link
                    href={`/privacy?id=${userId || ""}`}
                    target="_blank"
                    className="text-accent underline"
                  >
                    Privacy Policy
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
                  <span>Processing...</span>
                </>
              ) : (
                "Pay"
              )}
            </button>

            {/* Debug Toggle */}
            <button
              onClick={() => setShowDebug(!showDebug)}
              className="mt-4 w-full text-xs text-textSecondary hover:text-textPrimary"
            >
              {showDebug ? "Hide" : "Show"} Debug Info
            </button>

            {/* Debug Drawer */}
            {showDebug && (
              <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h3 className="text-sm font-semibold text-blue-900 mb-3">Debug Information</h3>
                
                {debugData && (
                  <div className="mb-4">
                    <div className="text-xs font-semibold text-blue-900 mb-2">Request/Response</div>
                    <pre className="text-xs font-mono text-gray-700 whitespace-pre-wrap break-all max-h-40 overflow-y-auto bg-white p-2 rounded border">
                      {JSON.stringify(debugData, null, 2)}
                    </pre>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(JSON.stringify(debugData, null, 2));
                        addDebugLog("JSON copied to clipboard");
                      }}
                      className="mt-2 px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                    >
                      Copy JSON
                    </button>
                  </div>
                )}

                <div>
                  <div className="text-xs font-semibold text-blue-900 mb-2">
                    Debug Log ({debugLogRef.current.length} entries)
                  </div>
                  <div className="text-xs font-mono text-gray-700 max-h-40 overflow-y-auto bg-white p-2 rounded border space-y-1">
                    {debugLogRef.current.length === 0 ? (
                      <div className="text-gray-500">No log entries yet</div>
                    ) : (
                      debugLogRef.current.map((entry, idx) => (
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
