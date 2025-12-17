"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense } from "react";
import AppLayout from "../components/AppLayout";

function PaymentContent() {
  const searchParams = useSearchParams();
  const [userId, setUserId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);

  useEffect(() => {
    const id = searchParams.get("id");
    if (id) {
      const n = Number(id);
      if (Number.isFinite(n) && n > 0) setUserId(n);
      else setError("Некорректный id пользователя");
    } else {
      setError("ID не передан");
    }
  }, [searchParams]);

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleContinueClick = () => {
    if (!email.trim()) {
      setEmailError("Введите email");
      return;
    }
    
    if (!validateEmail(email)) {
      setEmailError("Введите корректный email");
      return;
    }

    setEmailError(null);
    startPayment();
  };

  const startPayment = async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    
    try {
      const res = await fetch("/api/robokassa/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, email: email.trim() }),
      });
      const data = await res.json();
      
      console.log("[payment] Response status:", res.status);
      console.log("[payment] Response data:", data);
      
      if (!res.ok || !data.ok) {
        const errorMsg = data.error || "Ошибка создания платежа";
        const details = data.details ? `\n\nДетали: ${JSON.stringify(data.details, null, 2)}` : "";
        const missing = data.missing ? `\n\nОтсутствуют переменные: ${data.missing.join(", ")}` : "";
        throw new Error(errorMsg + details + missing);
      }
      
      if (!data.paymentUrl) {
        console.error("[payment] ❌ paymentUrl отсутствует в ответе:", data);
        throw new Error("URL оплаты не получен от сервера. Проверьте логи.");
      }
      
      console.log("[payment] ✅ Payment URL получен");
      console.log("[payment] Debug info:", data.debug);
      console.log("[payment] Redirecting to:", data.paymentUrl);
      
      // Небольшая задержка перед редиректом для логирования
      setTimeout(() => {
        // Редирект на страницу оплаты Robokassa
        window.location.href = data.paymentUrl;
      }, 100);
    } catch (e: any) {
      console.error("[payment] Error:", e);
      setError(e.message || "Ошибка создания платежа. Проверьте логи сервера.");
      setLoading(false);
    }
  };

  if (showEmailForm) {
    return (
      <AppLayout>
        <div className="min-h-screen bg-background p-4 py-8 pb-24 flex items-center">
          <div className="max-w-md mx-auto w-full bg-white rounded-2xl shadow-soft p-6 space-y-6">
            <div className="text-center space-y-2">
              <h1 className="text-2xl font-bold text-textPrimary">Вы оформляете подписку</h1>
              <p className="text-sm text-textSecondary">
                Это значит, что раз в месяц будут списываться средства с вашей карты для продления подписки. Вы можете отменить подписку, пройдя по ссылке из письма.
              </p>
            </div>
            
            <div className="space-y-2">
              <label htmlFor="email" className="block text-sm font-semibold text-textPrimary">
                Email для подписки
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setEmailError(null);
                }}
                placeholder="example@mail.com"
                className={`w-full px-4 py-3 rounded-xl border ${
                  emailError 
                    ? "border-red-300 bg-red-50" 
                    : "border-gray-200 bg-white focus:border-accent focus:ring-2 focus:ring-accent/20"
                } text-textPrimary placeholder-textSecondary focus:outline-none transition-colors`}
                disabled={loading}
              />
              {emailError && (
                <p className="text-sm text-red-600">{emailError}</p>
              )}
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                {error}
              </div>
            )}

            <button
              onClick={handleContinueClick}
              disabled={!userId || loading || !email.trim()}
              className="w-full py-3 rounded-xl bg-accent text-white font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {loading ? "Подписываемся..." : "Подписаться"}
            </button>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-background p-4 py-8 pb-24">
        <div className="max-w-md mx-auto bg-white rounded-2xl shadow-soft p-6 space-y-4">
          <div className="text-center space-y-1">
            <h1 className="text-2xl font-bold text-textPrimary">Подписка Step One</h1>
            <p className="text-sm text-textSecondary">199 ₽ в месяц</p>
          </div>
          <div className="bg-accent/5 border border-accent/20 rounded-xl p-4 text-sm text-textPrimary">
            <p className="font-semibold mb-1">3 дня бесплатно</p>
            <p className="text-textSecondary">
              После 3 дней бесплатного периода произойдёт автоматическое списание 199 ₽ за месяц. Подписка продлевается автоматически.
            </p>
          </div>
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              {error}
            </div>
          )}
          <button
            onClick={() => setShowEmailForm(true)}
            disabled={!userId || loading}
            className="w-full py-3 rounded-xl bg-accent text-white font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Создаём оплату..." : "Продолжить и оплатить"}
          </button>
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
