'use client';

import { useState, useEffect, useRef } from 'react';

interface FormData {
  actionUrl: string;
  fields: Record<string, string>;
  fieldsOrder: string[];
  signatureStringMasked: string;
  debug: {
    merchantLogin: string;
    outSum: string;
    invId: string;
    hasReceipt: boolean;
    receiptEncodedLength: number;
    shpParams: string[];
  };
}

export default function SubscriptionPage() {
  const [userId, setUserId] = useState<number | null>(null);
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<FormData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Get Telegram user ID
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const getTelegramUserId = () => {
      try {
        const tg = (window as any).Telegram;
        if (tg?.WebApp?.initDataUnsafe?.user?.id) {
          const id = tg.WebApp.initDataUnsafe.user.id;
          if (Number.isFinite(id) && id > 0) {
            setUserId(id);
            return;
          }
        }
      } catch (e) {
        console.warn('[subscription] Failed to get Telegram user ID:', e);
      }

      // Fallback for local dev (show warning)
      console.warn('[subscription] ⚠️ Telegram user ID not available, using test ID 123');
      setUserId(123);
    };

    // Try immediately
    getTelegramUserId();

    // Also try after a delay (in case Telegram WebApp loads later)
    const timeout = setTimeout(getTelegramUserId, 500);
    return () => clearTimeout(timeout);
  }, []);

  const handleSubmit = async () => {
    if (!consent) {
      setError('Необходимо согласие с условиями');
      return;
    }

    if (!userId) {
      setError('Не удалось определить ID пользователя');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/robokassa/form?plan=month&userId=${userId}`
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Ошибка при создании формы оплаты');
      }

      const data = await response.json();
      setFormData(data);

      // Auto-submit form after a short delay
      setTimeout(() => {
        if (formRef.current) {
          formRef.current.submit();
        }
      }, 100);
    } catch (err: any) {
      console.error('[subscription] Error:', err);
      setError(err.message || 'Произошла ошибка');
      setLoading(false);
    }
  };

  const copyDebugInfo = () => {
    if (!formData) return;

    const debugText = JSON.stringify(
      {
        signatureStringMasked: formData.signatureStringMasked,
        fieldsOrder: formData.fieldsOrder,
        fields: formData.fields,
        debug: formData.debug,
      },
      null,
      2
    );

    navigator.clipboard.writeText(debugText).then(() => {
      alert('Debug информация скопирована!');
    });
  };

  if (formData) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-md mx-auto">
          <h1 className="text-2xl font-bold mb-4">Перенаправление на оплату...</h1>
          <p className="text-gray-600 mb-4">
            Вы будете перенаправлены на страницу оплаты Robokassa
          </p>

          {/* Hidden form */}
          <form
            ref={formRef}
            method="POST"
            action={formData.actionUrl}
            className="hidden"
          >
            {formData.fieldsOrder.map((fieldName) => {
              const value = formData.fields[fieldName];
              if (value === undefined) return null;
              return (
                <input
                  key={fieldName}
                  type="hidden"
                  name={fieldName}
                  value={value}
                />
              );
            })}
          </form>

          {/* Debug panel */}
          <div className="mt-6">
            <button
              onClick={() => setShowDebug(!showDebug)}
              className="text-sm text-blue-600 hover:underline"
            >
              {showDebug ? 'Скрыть' : 'Показать'} Debug
            </button>

            {showDebug && (
              <div className="mt-4 p-4 bg-white rounded-lg border border-gray-200">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-semibold">Debug информация</h3>
                  <button
                    onClick={copyDebugInfo}
                    className="text-sm bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600"
                  >
                    Copy all
                  </button>
                </div>

                <div className="space-y-2 text-sm">
                  <div>
                    <strong>signatureStringMasked:</strong>
                    <pre className="mt-1 p-2 bg-gray-100 rounded text-xs overflow-x-auto">
                      {formData.signatureStringMasked}
                    </pre>
                  </div>

                  <div>
                    <strong>fieldsOrder:</strong>
                    <pre className="mt-1 p-2 bg-gray-100 rounded text-xs">
                      {JSON.stringify(formData.fieldsOrder, null, 2)}
                    </pre>
                  </div>

                  <div>
                    <strong>fields:</strong>
                    <pre className="mt-1 p-2 bg-gray-100 rounded text-xs overflow-x-auto">
                      {JSON.stringify(formData.fields, null, 2)}
                    </pre>
                  </div>

                  <div>
                    <strong>debug:</strong>
                    <pre className="mt-1 p-2 bg-gray-100 rounded text-xs overflow-x-auto">
                      {JSON.stringify(formData.debug, null, 2)}
                    </pre>
                  </div>

                  <div className="pt-2 border-t border-gray-200">
                    <div>
                      <strong>merchantLogin:</strong> {formData.debug.merchantLogin}
                    </div>
                    <div>
                      <strong>outSum:</strong> {formData.debug.outSum}
                    </div>
                    <div>
                      <strong>invId:</strong> {formData.debug.invId}
                    </div>
                    <div>
                      <strong>hasReceipt:</strong> {formData.debug.hasReceipt ? 'YES' : 'NO'}
                    </div>
                    <div>
                      <strong>receiptEncodedLength:</strong> {formData.debug.receiptEncodedLength}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold mb-6">Подписка</h1>

        <div className="bg-white rounded-lg shadow-sm p-6 mb-4">
          <div className="text-center mb-6">
            <div className="text-3xl font-bold text-gray-900 mb-2">199 ₽</div>
            <div className="text-gray-600">/ месяц</div>
          </div>

          <div className="mb-6">
            <label className="flex items-start cursor-pointer">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-1 mr-3 w-5 h-5"
              />
              <span className="text-sm text-gray-700">
                Я согласен с условиями оплаты и политикой конфиденциальности
              </span>
            </label>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              {error}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading || !consent || !userId}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {loading ? 'Загрузка...' : 'Продолжить оплату'}
          </button>

          {!userId && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-yellow-700 text-sm">
              ⚠️ Предупреждение: ID пользователя не найден. Используется тестовый ID.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
