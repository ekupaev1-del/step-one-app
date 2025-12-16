"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense } from "react";
import AppLayout from "../components/AppLayout";

function PaymentContent() {
  const searchParams = useSearchParams();
  const [userId, setUserId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const startPayment = async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    
    try {
      const res = await fetch("/api/robokassa/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
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
        throw new Error("URL оплаты не получен от сервера");
      }
      
      console.log("[payment] Redirecting to:", data.paymentUrl);
      // Редирект на страницу оплаты Robokassa
      window.location.href = data.paymentUrl;
    } catch (e: any) {
      console.error("[payment] Error:", e);
      setError(e.message || "Ошибка создания платежа. Проверьте логи сервера.");
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
            onClick={startPayment}
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
