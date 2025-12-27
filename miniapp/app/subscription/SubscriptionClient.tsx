'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

interface CreateTrialResponse {
  ok: boolean;
  html?: string;
  stage?: string;
  message?: string;
  debug?: any;
}

export default function SubscriptionClient() {
  const searchParams = useSearchParams();
  const userId = searchParams.get('id');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugData, setDebugData] = useState<any>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [debugMode, setDebugMode] = useState<'recurring' | 'minimal'>('recurring');

  const handleStartTrial = async (mode: 'recurring' | 'minimal' = 'recurring') => {
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
      const requestUrl = `/api/robokassa/create-trial?telegramUserId=${userData.telegram_id}&mode=${mode}`;
      const requestPayload = {
        telegramUserId: userData.telegram_id,
        mode,
      };

      // Create trial payment
      const response = await fetch(requestUrl, {
        method: 'POST',
      });
      
      const data: CreateTrialResponse = await response.json();
      
      // Save full response to Debug JSON panel with request details
      setDebugData({
        request: {
          url: requestUrl,
          method: 'POST',
          payload: requestPayload,
        },
        response: {
          status: response.status,
          body: data,
        },
        error: !response.ok || !data.ok ? {
          message: data.message || 'Payment creation failed',
          stage: data.stage,
        } : null,
        timestamp: new Date().toISOString(),
      });
      setShowDebug(true);

      // If ok=false → show error + debug JSON
      if (!response.ok || !data.ok) {
        const errorMsg = data.message || 'Payment creation failed';
        setError(errorMsg);
        return;
      }

      // If ok=true → replace document with formHtml
      if (data.html) {
        // Replace entire document with form HTML
        document.open();
        document.write(data.html);
        document.close();
      } else {
        const errorMsg = 'Payment creation failed: No HTML form returned';
        setError(errorMsg);
      }
    } catch (error: any) {
      console.error('Error starting trial:', error);
      const errorMsg = 'Payment creation failed';
      setError(errorMsg);
      setDebugData({
        request: {
          url: `/api/robokassa/create-trial?telegramUserId=${userId}&mode=${mode}`,
          method: 'POST',
          payload: { telegramUserId: userId, mode },
        },
        response: null,
        error: {
          message: error.message,
          stack: error.stack,
        },
        timestamp: new Date().toISOString(),
      });
      setShowDebug(true);
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

        {/* Debug Mode Toggle (temporary) */}
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <label className="block text-sm font-semibold text-yellow-800 mb-2">
            Debug Mode (temporary):
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setDebugMode('recurring')}
              className={`flex-1 px-3 py-2 rounded text-sm font-medium ${
                debugMode === 'recurring'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700'
              }`}
            >
              Recurring (with Receipt)
            </button>
            <button
              onClick={() => setDebugMode('minimal')}
              className={`flex-1 px-3 py-2 rounded text-sm font-medium ${
                debugMode === 'minimal'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700'
              }`}
            >
              Minimal (no Receipt)
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800 font-semibold">{error}</p>
          </div>
        )}

        <button
          onClick={() => handleStartTrial(debugMode)}
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed mb-4"
        >
          {loading ? 'Обработка...' : `Start trial for 1 ₽ (${debugMode})`}
        </button>

        {showDebug && debugData && (
          <div className="mt-4 bg-gray-900 rounded-lg p-4">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-white font-semibold">Debug JSON</h3>
              <button
                onClick={() => setShowDebug(false)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <pre className="text-xs text-green-400 overflow-auto max-h-96">
              {JSON.stringify(debugData, null, 2)}
            </pre>
          </div>
        )}

        {!showDebug && debugData && (
          <button
            onClick={() => setShowDebug(true)}
            className="w-full text-sm text-gray-600 hover:text-gray-800"
          >
            Show Debug JSON
          </button>
        )}
      </div>
    </div>
  );
}
