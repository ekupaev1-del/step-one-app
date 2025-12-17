"use client";

import { useState } from "react";
import AppLayout from "../../components/AppLayout";

export default function PaymentDebugPage() {
  const [testResult, setTestResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const testPayment = async () => {
    setLoading(true);
    setError(null);
    setTestResult(null);

    try {
      // Тест 1: Проверка тестового endpoint
      console.log("[debug] Testing /api/robokassa/test...");
      const testRes = await fetch("/api/robokassa/test");
      const testData = await testRes.json();
      console.log("[debug] Test endpoint result:", testData);

      // Тест 2: Создание реального платежа (с тестовым userId)
      console.log("[debug] Testing /api/robokassa/create with userId=1...");
      const createRes = await fetch("/api/robokassa/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: 1 }),
      });
      const createData = await createRes.json();
      console.log("[debug] Create endpoint result:", createData);

      setTestResult({
        testEndpoint: testData,
        createEndpoint: createData,
        timestamp: new Date().toISOString(),
      });

      // Если есть paymentUrl, пробуем открыть
      if (createData.ok && createData.paymentUrl) {
        const shouldOpen = confirm(
          `Платеж создан успешно!\n\nURL: ${createData.paymentUrl.substring(0, 100)}...\n\nОткрыть в новой вкладке?`
        );
        if (shouldOpen) {
          window.open(createData.paymentUrl, "_blank");
        }
      }
    } catch (e: any) {
      console.error("[debug] Error:", e);
      setError(e.message || "Ошибка тестирования");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout>
      <div className="min-h-screen bg-background p-4 py-8 pb-24">
        <div className="max-w-md mx-auto bg-white rounded-2xl shadow-soft p-6 space-y-4">
          <div className="text-center space-y-1">
            <h1 className="text-2xl font-bold text-textPrimary">Диагностика оплаты</h1>
            <p className="text-sm text-textSecondary">Проверка работы Robokassa</p>
          </div>

          <button
            onClick={testPayment}
            disabled={loading}
            className="w-full py-3 rounded-xl bg-accent text-white font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Тестирую..." : "Запустить тесты"}
          </button>

          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              {error}
            </div>
          )}

          {testResult && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-green-50 border border-green-200">
                <p className="text-sm font-semibold text-green-800 mb-2">Результаты тестов:</p>
                <pre className="text-xs overflow-auto max-h-96 bg-white p-2 rounded border">
                  {JSON.stringify(testResult, null, 2)}
                </pre>
              </div>
            </div>
          )}

          <div className="text-xs text-textSecondary space-y-1">
            <p>• Проверяет переменные окружения</p>
            <p>• Тестирует создание подписи</p>
            <p>• Проверяет создание платежа</p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
