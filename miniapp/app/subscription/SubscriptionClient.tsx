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
    merchantLogin?: string;
    outSum?: string;
    invId?: string;
    receiptIncluded?: boolean;
    shpParams?: string[];
    actionUrl?: string;
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

      // Use new parent recurring payment endpoint
      const requestUrl = `/api/robokassa/create-parent?telegramUserId=${userData.telegram_id}`;

      // Create parent recurring payment (1 RUB with Recurring=true)
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

      // If ok=false → show error with debug modal
      if (!response.ok || !data.ok) {
        const errorMsg = data.message || 'Ошибка создания платежа';
        setError(errorMsg);
        console.error('[Payment] Error:', data);
        // Show debug modal with full error info
        setDebugInfo({
          error: errorMsg,
          stage: data.stage,
          fullResponse: data,
        });
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
      if (data.html) {
        // Use HTML directly (auto-submit form) - preferred method
        document.open();
        document.write(data.html);
        document.close();
      } else {
        const errorMsg = 'Payment creation failed: No HTML form returned';
        setError(errorMsg);
        setDebugInfo({
          error: errorMsg,
          response: data,
        });
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

        {/* Debug info block (shown on errors or when ?debug=1) */}
        {debugInfo && (
          <div className="mt-4 p-4 bg-gray-900 text-white rounded-lg font-mono text-xs">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-bold text-green-400">
                {debugInfo.error ? '❌ Ошибка' : '🔍 Debug (Error 29)'}
              </h3>
              <button
                onClick={() => {
                  const debugText = JSON.stringify(debugInfo, null, 2);
                  navigator.clipboard.writeText(debugText).then(() => {
                    alert('✅ Скопировано в буфер обмена!');
                  }).catch(() => {
                    // Fallback for older browsers
                    const textarea = document.createElement('textarea');
                    textarea.value = debugText;
                    textarea.style.position = 'fixed';
                    textarea.style.opacity = '0';
                    document.body.appendChild(textarea);
                    textarea.select();
                    try {
                      document.execCommand('copy');
                      alert('✅ Скопировано!');
                    } catch (e) {
                      alert('❌ Ошибка копирования');
                    }
                    document.body.removeChild(textarea);
                  });
                }}
                className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded font-semibold"
              >
                📋 Копировать всё
              </button>
            </div>
            <div className="space-y-2 overflow-auto max-h-96">
              {debugInfo.error && (
                <div>
                  <span className="text-red-400">Ошибка:</span>
                  <div className="text-red-300 mt-1">{debugInfo.error}</div>
                </div>
              )}
              {debugInfo.stage && (
                <div>
                  <span className="text-yellow-400">Stage:</span>
                  <div className="text-gray-300 mt-1">{debugInfo.stage}</div>
                </div>
              )}
              {debugInfo.signatureBaseMasked && (
                <div>
                  <span className="text-green-400">Signature (masked):</span>
                  <div className="text-gray-300 break-all mt-1">{debugInfo.signatureBaseMasked}</div>
                </div>
              )}
              {debugInfo.signatureValue && (
                <div>
                  <span className="text-green-400">Signature Value:</span>
                  <div className="text-gray-300 break-all mt-1">{debugInfo.signatureValue}</div>
                </div>
              )}
              {debugInfo.merchantLogin && (
                <div>
                  <span className="text-green-400">MerchantLogin:</span>
                  <div className="text-gray-300 mt-1">{debugInfo.merchantLogin}</div>
                </div>
              )}
              {debugInfo.outSum && (
                <div>
                  <span className="text-green-400">OutSum:</span>
                  <div className="text-gray-300 mt-1">{debugInfo.outSum}</div>
                </div>
              )}
              {debugInfo.invoiceId && (
                <div>
                  <span className="text-green-400">InvoiceID:</span>
                  <div className="text-gray-300 mt-1">{debugInfo.invoiceId}</div>
                </div>
              )}
              {debugInfo.formFields && (
                <div>
                  <span className="text-green-400">Form Fields:</span>
                  <div className="text-gray-300 mt-1">{debugInfo.formFields.join(', ')}</div>
                </div>
              )}
              {debugInfo.envCheck && (
                <div>
                  <span className="text-green-400">Env Check:</span>
                  <div className="text-gray-300 mt-1">
                    Pass1: {debugInfo.envCheck.pass1Prefix2}...{debugInfo.envCheck.pass1Suffix2} (len: {debugInfo.envCheck.pass1Len})<br/>
                    Pass2: {debugInfo.envCheck.pass2Prefix2}...{debugInfo.envCheck.pass2Suffix2} (len: {debugInfo.envCheck.pass2Len})<br/>
                    Env: {debugInfo.envCheck.vercelEnv} / {debugInfo.envCheck.nodeEnv}
                  </div>
                </div>
              )}
              {debugInfo.fullResponse && (
                <div>
                  <span className="text-yellow-400">Full Response:</span>
                  <pre className="text-gray-300 mt-1 text-xs overflow-auto">
                    {JSON.stringify(debugInfo.fullResponse, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
