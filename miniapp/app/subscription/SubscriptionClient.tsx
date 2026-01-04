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

      // If ok=true → create and submit form
      if (data.paymentUrl && data.fields) {
        // Create hidden HTML form and auto-submit
        // This works inside Telegram WebView (miniapp)
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = data.paymentUrl;
        form.style.display = 'none';
        
        // Add all fields as hidden inputs
        for (const [key, value] of Object.entries(data.fields)) {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = key;
          input.value = String(value);
          form.appendChild(input);
        }
        
        // Append form to body and submit
        document.body.appendChild(form);
        form.submit();
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

        {/* TEMP DEBUG: Collapsible Debug JSON panel */}
        {debugData && (
          <div className="mt-4">
            <button
              onClick={() => setShowDebug(!showDebug)}
              className="w-full bg-gray-800 hover:bg-gray-700 text-white font-semibold py-2 px-4 rounded-lg mb-2 flex items-center justify-between"
            >
              <span>🔍 Debug JSON {showDebug ? '(скрыть)' : '(показать)'}</span>
              <span>{showDebug ? '▲' : '▼'}</span>
            </button>
            
            {showDebug && (
              <div className="bg-gray-900 rounded-lg p-4">
                <div className="mb-2">
                  <p className="text-xs text-gray-400 mb-1">
                    {debugData.error 
                      ? '❌ Error Response (ok=false)' 
                      : debugData.response?.body?.ok 
                        ? '✅ Success Response (ok=true)' 
                        : '⚠️ Response Data'}
                  </p>
                </div>
                <pre className="text-xs text-green-400 overflow-auto max-h-96 bg-black p-3 rounded">
                  {JSON.stringify(debugData, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
