'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import PaymentDebugModal from './PaymentDebugModal';

interface PaymentResponse {
  ok: boolean;
  actionUrl?: string; // For form action
  fields?: Record<string, string>; // Form fields
  html?: string; // HTML form (backward compatibility)
  paymentUrl?: string; // Backward compatibility
  stage?: string;
  message?: string;
  debug?: any; // Structured debug object
}

export default function SubscriptionClient() {
  const searchParams = useSearchParams();
  const userId = searchParams.get('id');
  const debugMode = searchParams.get('debug') === '1';
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [showDebugModal, setShowDebugModal] = useState(false);
  const [paymentHtml, setPaymentHtml] = useState<string | null>(null);

  const handlePayMonthly = async () => {
    if (!userId || loading) return;

    try {
      setLoading(true);
      setError(null);
      
      // Get telegram_user_id
      const userResponse = await fetch(`/api/user?id=${userId}`);
      const userData = await userResponse.json();
      
      if (!userData.ok || !userData.telegram_id) {
        const errorMsg = 'Ошибка: не удалось получить данные пользователя';
        setError(errorMsg);
        return;
      }

      // Use new parent recurring payment endpoint
      const requestUrl = `/api/robokassa/create-parent?telegramUserId=${userData.telegram_id}`;

      // Create parent payment (1 RUB, normal payment, NO Recurring field)
      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      // Check if response is JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        const errorMsg = `Ошибка: неверный формат ответа от сервера`;
        setError(errorMsg);
        // Show debug modal with error
        setDebugInfo({
          error: errorMsg,
          contentType,
          responseText: text.substring(0, 500),
        });
        return;
      }
      
      const data: PaymentResponse = await response.json();

      // Store debug info (always show modal if debug exists, even on error)
      if (data.debug) {
        setDebugInfo(data.debug);
        console.log('[Payment Debug]', data.debug);
        setShowDebugModal(true);
      }

      // If ok=false → show error with debug modal
      if (!response.ok || !data.ok) {
        const errorMsg = data.message || 'Ошибка создания платежа';
        setError(errorMsg);
        console.error('[Payment] Error:', data);
        // Debug modal will show with error message
        return;
      }

      if (data.html) {
        // Store HTML for later submission
        setPaymentHtml(data.html);
        
        // If debug exists, show modal first (user can submit after reviewing)
        // Otherwise submit immediately
        if (!data.debug) {
          document.open();
          document.write(data.html);
          document.close();
        }
      } else {
        const errorMsg = 'Payment creation failed: No HTML form returned';
        setError(errorMsg);
        if (!data.debug) {
          setDebugInfo({
            error: errorMsg,
            response: data,
          });
          setShowDebugModal(true);
        }
      }
    } catch (error: any) {
      console.error('[Payment] Error:', error);
      const errorMsg = 'Ошибка создания платежа';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto mt-8">
        <h1 className="text-2xl font-bold text-center mb-6">Подписка</h1>
        
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="text-center mb-4">
            <div className="text-3xl font-bold text-gray-900 mb-2">
              199 ₽ в месяц
            </div>
            <div className="text-gray-600">
              Полный доступ ко всем функциям
            </div>
            <div className="text-sm text-gray-500 mt-2">
              Пробный период 3 дня (1 ₽), затем 199 ₽/месяц
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800 font-semibold">{error}</p>
          </div>
        )}

        {/* Consent checkbox */}
        <div className="mb-4 p-4 bg-gray-50 rounded-lg">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={consentAccepted}
              onChange={(e) => setConsentAccepted(e.target.checked)}
              className="mt-1 w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">
              Я согласен с условиями оплаты и обработкой персональных данных
            </span>
          </label>
        </div>

        <button
          onClick={() => handlePayMonthly()}
          disabled={loading || !consentAccepted}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed mb-4"
        >
          {loading ? 'Обработка...' : 'Начать пробный период (1 ₽)'}
        </button>

        {/* Continue payment button (shown when payment HTML is ready) */}
        {paymentHtml && (
          <div className="space-y-2 mb-4">
            <button
              onClick={() => {
                if (paymentHtml) {
                  document.open();
                  document.write(paymentHtml);
                  document.close();
                }
              }}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-lg"
            >
              Продолжить оплату
            </button>
            <button
              onClick={() => {
                setPaymentHtml(null);
                setShowDebugModal(false);
              }}
              className="w-full bg-gray-500 hover:bg-gray-600 text-white font-semibold py-2 px-6 rounded-lg"
            >
              Отмена
            </button>
          </div>
        )}

        {/* Debug Modal */}
        {showDebugModal && (
          <PaymentDebugModal
            debugInfo={debugInfo}
            onClose={() => {
              setShowDebugModal(false);
              // If payment HTML is ready, don't clear it - user can still submit
            }}
            errorMessage={error || undefined}
          />
        )}
      </div>
    </div>
  );
}
