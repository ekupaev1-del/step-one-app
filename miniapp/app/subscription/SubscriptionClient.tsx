'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

interface CreateTrialResponse {
  ok: boolean;
  html?: string;
  paymentUrl?: string;
  fields?: Record<string, string>;
  stage?: string;
  message?: string;
  debug?: any;
}

/**
 * Mask signature value for safe display
 * Shows first 6 and last 6 characters
 */
function maskSignature(signature: string): string {
  if (!signature || signature.length <= 12) {
    return signature;
  }
  return `${signature.substring(0, 6)}...${signature.substring(signature.length - 6)}`;
}

export default function SubscriptionClient() {
  const searchParams = useSearchParams();
  const userId = searchParams.get('id');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugData, setDebugData] = useState<any>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [showDebugModal, setShowDebugModal] = useState(false);
  const [paymentData, setPaymentData] = useState<{ url: string; fields: Record<string, string> } | null>(null);

  const handleStartTrial = async () => {
    if (!userId || loading) return;

    try {
      setLoading(true);
      setError(null);
      setDebugData(null);
      setShowDebug(false);
      
      // Get telegram_user_id
      const userResponse = await fetch(`/api/user?id=${userId}`);
      const userData = await userResponse.json();
      
      if (!userData.ok || !userData.telegram_id) {
        const errorMsg = 'Ошибка: не удалось получить данные пользователя';
        setError(errorMsg);
        setDebugData({
          request: {
            url: `/api/user?id=${userId}`,
            method: 'GET',
            payload: null,
          },
          response: {
            status: userResponse.status,
            body: userData,
          },
          error: {
            message: 'Failed to get user telegram_id',
          },
        });
        setShowDebug(true);
        return;
      }

      // Prepare request details
      // Parent payment always uses 'recurring' mode for card binding
      const requestUrl = `/api/robokassa/create-trial?telegramUserId=${userData.telegram_id}`;
      const requestPayload = {
        telegramUserId: userData.telegram_id,
      };

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
        const errorMsg = `Expected JSON response, got: ${contentType}. Response: ${text.substring(0, 200)}`;
        setError(errorMsg);
        setDebugData({
          request: { url: requestUrl, method: 'POST', payload: requestPayload },
          response: { status: response.status, body: text.substring(0, 500) },
          error: { message: errorMsg },
        });
        setShowDebug(true);
        alert(`Ошибка: ${errorMsg}`);
        return;
      }
      
      const data: CreateTrialResponse = await response.json();
      
      // Prepare debug data with masked signature
      const safeDebug = data.debug ? {
        ...data.debug,
        signatureValue: data.debug.signatureValue ? maskSignature(data.debug.signatureValue) : undefined,
      } : undefined;
      
      // Save full response to Debug JSON panel with request details
      setDebugData({
        request: {
          url: requestUrl,
          method: 'POST',
          payload: requestPayload,
        },
        response: {
          status: response.status,
          body: {
            ...data,
            debug: safeDebug, // Use masked debug
          },
        },
        error: !response.ok || !data.ok ? {
          message: data.message || 'Payment creation failed',
          stage: data.stage,
        } : null,
        debug: safeDebug, // Include API debug info (masked)
        timestamp: new Date().toISOString(),
      });
      setShowDebug(true);

      // If ok=false → show error + debug JSON
      if (!response.ok || !data.ok) {
        const errorMsg = data.message || 'Payment creation failed';
        setError(errorMsg);
        // Show alert for errors
        alert(`Ошибка: ${errorMsg}\n\nПроверьте Debug JSON панель для деталей.`);
        return;
      }

      // If ok=true → show debug modal first, then submit form
      if (data.paymentUrl && data.fields) {
        // Save payment data for later submission
        setPaymentData({
          url: data.paymentUrl,
          fields: data.fields,
        });
        // Show debug modal
        setShowDebugModal(true);
      } else if (data.html) {
        // Fallback: if HTML is provided (for backward compatibility)
        document.open();
        document.write(data.html);
        document.close();
      } else {
        const errorMsg = 'Payment creation failed: No payment URL or fields returned';
        setError(errorMsg);
        alert(`Ошибка: ${errorMsg}`);
      }
    } catch (error: any) {
      console.error('Error starting trial:', error);
      const errorMsg = 'Payment creation failed';
      setError(errorMsg);
      setDebugData({
        request: {
          url: `/api/robokassa/create-trial?telegramUserId=${userId}`,
          method: 'POST',
          payload: { telegramUserId: userId },
        },
        response: null,
        error: {
          message: error.message,
          stack: error.stack,
        },
        timestamp: new Date().toISOString(),
      });
      setShowDebug(true);
      // Show alert for errors
      alert(`Ошибка: ${errorMsg}\n\nПроверьте Debug JSON панель для деталей.`);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyDebug = () => {
    if (!debugData) return;
    
    // Формируем минималистичную debug-информацию для Error 29
    const keyInfo = {
      timestamp: debugData.timestamp || new Date().toISOString(),
      merchantLogin: debugData.debug?.merchantLogin || 'N/A',
      outSum: debugData.debug?.outSum || 'N/A',
      invId: debugData.debug?.invId || 'N/A',
      signatureValue: debugData.debug?.signatureValue || 'N/A',
      signatureBaseStringMasked: debugData.debug?.signatureBaseStringMasked || 'N/A',
      shpParams: debugData.debug?.shpParams || [],
      receiptEncodedLen: debugData.debug?.receiptEncodedLen || 0,
      isTest: debugData.debug?.isTest || false,
      formFields: paymentData?.fields || {},
    };

    const text = JSON.stringify(keyInfo, null, 2);
    
    navigator.clipboard.writeText(text).then(() => {
      alert('✅ Debug-информация скопирована в буфер обмена!');
    }).catch(() => {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        alert('✅ Debug-информация скопирована!');
      } catch (e) {
        alert('❌ Не удалось скопировать. Выделите текст вручную.');
      }
      document.body.removeChild(textarea);
    });
  };

  const handleContinuePayment = () => {
    if (!paymentData) return;
    
    setShowDebugModal(false);
    
    // Create hidden HTML form and auto-submit
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = paymentData.url;
    form.style.display = 'none';
    
    // Add all fields as hidden inputs
    for (const [key, value] of Object.entries(paymentData.fields)) {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = key;
      input.value = String(value);
      form.appendChild(input);
    }
    
    // Append form to body and submit
    document.body.appendChild(form);
    form.submit();
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto mt-8">
        <h1 className="text-2xl font-bold text-center mb-6">Get full access</h1>
        
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="text-center mb-4">
            <div className="text-3xl font-bold text-gray-900 mb-2">
              Trial 3 days for 1 ₽
            </div>
            <div className="text-gray-600">
              After trial — 199 ₽ per month
            </div>
            <div className="text-sm text-gray-500 mt-2">
              Auto-renewal
            </div>
          </div>
        </div>


        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800 font-semibold">{error}</p>
          </div>
        )}

        <button
          onClick={() => handleStartTrial()}
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed mb-4"
        >
          {loading ? 'Обработка...' : 'Start trial for 1 ₽'}
        </button>

        {/* Debug Modal */}
        {showDebugModal && debugData && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
              {/* Header */}
              <div className="bg-gray-900 text-white p-4 flex justify-between items-center">
                <h2 className="text-lg font-semibold">🔍 Debug информация</h2>
                <button
                  onClick={() => setShowDebugModal(false)}
                  className="text-gray-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              {/* Content */}
              <div className="p-4 overflow-y-auto flex-1">
                <div className="space-y-3 text-sm">
                  <div>
                    <span className="text-gray-600 font-medium">MerchantLogin:</span>
                    <span className="ml-2 text-gray-900">{debugData.debug?.merchantLogin || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 font-medium">OutSum:</span>
                    <span className="ml-2 text-gray-900">{debugData.debug?.outSum || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 font-medium">InvId:</span>
                    <span className="ml-2 text-gray-900">{debugData.debug?.invId || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 font-medium">SignatureValue:</span>
                    <span className="ml-2 text-gray-900 font-mono text-xs break-all">
                      {debugData.debug?.signatureValue || 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600 font-medium">Signature String:</span>
                    <div className="mt-1 text-gray-700 font-mono text-xs break-all bg-gray-50 p-2 rounded">
                      {debugData.debug?.signatureBaseStringMasked || 'N/A'}
                    </div>
                  </div>
                  {debugData.debug?.shpParams && debugData.debug.shpParams.length > 0 && (
                    <div>
                      <span className="text-gray-600 font-medium">Shp_* параметры:</span>
                      <div className="mt-1 text-gray-700 text-xs">
                        {debugData.debug.shpParams.join(', ')}
                      </div>
                    </div>
                  )}
                  {debugData.debug?.receiptEncodedLen > 0 && (
                    <div>
                      <span className="text-gray-600 font-medium">Receipt (encoded):</span>
                      <span className="ml-2 text-gray-900">Длина: {debugData.debug.receiptEncodedLen}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-gray-600 font-medium">Test Mode:</span>
                    <span className="ml-2 text-gray-900">{debugData.debug?.isTest ? 'Да' : 'Нет'}</span>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="border-t p-4 flex gap-3">
                <button
                  onClick={handleCopyDebug}
                  className="flex-1 bg-gray-900 hover:bg-gray-800 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                >
                  📋 Скопировать всё
                </button>
                <button
                  onClick={handleContinuePayment}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                >
                  Продолжить оплату
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
