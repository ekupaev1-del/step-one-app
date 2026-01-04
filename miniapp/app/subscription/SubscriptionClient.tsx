'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

interface PaymentResponse {
  ok: boolean;
  actionUrl?: string; // For form action
  fields?: Record<string, string>; // Form fields
  html?: string; // HTML form (backward compatibility)
  paymentUrl?: string; // Backward compatibility
  stage?: string;
  message?: string;
  debug?: {
    exactSignatureStringMasked?: string;
    signatureValue?: string;
    fieldsKeys?: string[];
    actionUrl?: string;
    receiptIncluded?: boolean;
    note?: string;
  };
}

export default function SubscriptionClient() {
  const searchParams = useSearchParams();
  const userId = searchParams.get('id');
  const debugMode = searchParams.get('debug') === '1';
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [debugInfo, setDebugInfo] = useState<any>(null);

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

      // Use trial payment endpoint (1 RUB with Recurring=true for card binding)
      const debugParam = debugMode ? '&debug=1' : '';
      const requestUrl = `/api/robokassa/create-trial-payment?telegramUserId=${userData.telegram_id}${debugParam}`;

      // Create trial payment (parent recurring payment)
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
      
      const data: PaymentResponse = await response.json();

      // If ok=false → show error
      if (!response.ok || !data.ok) {
        const errorMsg = data.message || 'Ошибка создания платежа';
        setError(errorMsg);
        console.error('[Payment] Error:', data);
        return;
      }

      // Store debug info if debug mode is enabled
      if (debugMode && data.debug) {
        setDebugInfo(data.debug);
        // Don't submit form in debug mode - show debug info instead
        return;
      }

      // Log debug info to console for troubleshooting
      if (data.debug) {
        console.log('[Payment Debug]', data.debug);
      }

      // Submit form immediately (if not in debug mode)
      // Use actionUrl and fields to create form
      const actionUrl = data.actionUrl || data.paymentUrl;
      if (actionUrl && data.fields) {
        // Create form from actionUrl and fields
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = actionUrl;
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
      } else if (data.html) {
        // Fallback: use HTML directly (auto-submit form)
        document.open();
        document.write(data.html);
        document.close();
      } else {
        const errorMsg = 'Payment creation failed: No actionUrl or fields returned';
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

        {/* Debug info block (only shown when ?debug=1) */}
        {debugMode && debugInfo && (
          <div className="mt-4 p-4 bg-gray-900 text-white rounded-lg font-mono text-xs overflow-auto max-h-96">
            <h3 className="text-sm font-bold mb-2 text-green-400">🔍 Debug информация</h3>
            <div className="space-y-2">
              <div>
                <span className="text-green-400">Signature (masked):</span>
                <div className="text-gray-300 break-all">{debugInfo.exactSignatureStringMasked || 'N/A'}</div>
              </div>
              <div>
                <span className="text-green-400">Signature Value:</span>
                <div className="text-gray-300 break-all">{debugInfo.signatureValue || 'N/A'}</div>
              </div>
              <div>
                <span className="text-green-400">Fields:</span>
                <div className="text-gray-300">
                  {debugInfo.fieldsKeys ? debugInfo.fieldsKeys.join(', ') : 'N/A'}
                </div>
              </div>
              <div>
                <span className="text-green-400">Action URL:</span>
                <div className="text-gray-300 break-all">{debugInfo.actionUrl || 'N/A'}</div>
              </div>
              <div>
                <span className="text-green-400">Receipt included:</span>
                <div className="text-gray-300">{debugInfo.receiptIncluded ? 'Yes' : 'No'}</div>
              </div>
              {debugInfo.note && (
                <div>
                  <span className="text-green-400">Note:</span>
                  <div className="text-gray-300">{debugInfo.note}</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
