'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

interface CreateMonthlyResponse {
  ok: boolean;
  html?: string;
  paymentUrl?: string;
  fields?: Record<string, string>;
  stage?: string;
  message?: string;
  debug?: any;
}

export default function SubscriptionClient() {
  const searchParams = useSearchParams();
  const userId = searchParams.get('id');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consentAccepted, setConsentAccepted] = useState(false);

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

      // Prepare request details for monthly payment (199 RUB)
      const requestUrl = `/api/robokassa/create-monthly?telegramUserId=${userData.telegram_id}`;
      const requestPayload = {
        telegramUserId: userData.telegram_id,
      };

      // Create monthly payment (simple one-time payment)
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
        console.error('[Payment] Invalid response:', { contentType, text: text.substring(0, 200) });
        return;
      }
      
      const data: CreateMonthlyResponse = await response.json();

      // If ok=false → show error
      if (!response.ok || !data.ok) {
        const errorMsg = data.message || 'Ошибка создания платежа';
        setError(errorMsg);
        console.error('[Payment] Error:', data);
        return;
      }

      // If ok=true → submit form immediately (no debug modal blocking)
      // Log debug info to console for troubleshooting
      if (data.debug) {
        console.log('[Payment Debug]', {
          exactSignatureString: data.debug.exactSignatureStringMasked,
          signatureValue: data.debug.signatureValue?.substring(0, 8) + '...',
          merchantLogin: data.debug.merchantLogin,
          outSum: data.debug.outSum,
          invId: data.debug.invId,
          shpParams: data.debug.shpParams,
          formFields: Object.keys(data.debug.formFields || {}),
        });
      }

      // Submit form immediately
      if (data.html) {
        // Use HTML directly (auto-submit form) - preferred method
        document.open();
        document.write(data.html);
        document.close();
      } else if (data.paymentUrl && data.fields) {
        // Fallback: create form from fields
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = data.paymentUrl;
        form.style.display = 'none';
        
        for (const [key, value] of Object.entries(data.fields)) {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = key;
          input.value = String(value);
          form.appendChild(input);
        }
        
        document.body.appendChild(form);
        form.submit();
      } else {
        const errorMsg = 'Payment creation failed: No payment URL or fields returned';
        setError(errorMsg);
        alert(`Ошибка: ${errorMsg}`);
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
              Оплата разовая, без автопродления
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
          {loading ? 'Обработка...' : 'Оплатить 199 ₽'}
        </button>
      </div>
    </div>
  );
}
