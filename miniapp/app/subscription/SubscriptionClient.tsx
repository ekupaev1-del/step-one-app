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
  const [consentAccepted, setConsentAccepted] = useState(false);

  const handlePayMonthly = async () => {
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
          html: data.html, // Store HTML if available
        } as any);
        // Show debug modal
        setShowDebugModal(true);
      } else if (data.html) {
        // Fallback: if only HTML is provided
        setPaymentData({
          url: data.paymentUrl || 'https://auth.robokassa.ru/Merchant/Index.aspx',
          fields: {},
          html: data.html,
        } as any);
        setShowDebugModal(true);
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
    if (!debugData?.debug) return;
    
    const dbg = debugData.debug;
    
    // Формируем критичную информацию для Error 29
    const criticalInfo = {
      // Самое важное - точная строка подписи
      exactSignatureString: dbg.exactSignatureStringMasked || 'N/A',
      signatureValue: dbg.signatureValue || 'N/A',
      signatureLength: dbg.signatureLength || 0,
      signatureIsValid: dbg.signatureIsValid || false,
      
      // Параметры подписи
      merchantLogin: dbg.merchantLogin || 'N/A',
      merchantLoginIsSteopone: dbg.merchantLoginIsSteopone || false,
      outSum: dbg.outSum || 'N/A',
      outSumFormat: dbg.outSumFormat || false,
      invId: dbg.invId || 'N/A',
      invIdString: dbg.invIdString || 'N/A',
      
      // Shp_* параметры
      shpParams: dbg.shpParams || [],
      shpParamsSorted: dbg.shpParamsSorted || false,
      
      // Receipt
      hasReceipt: dbg.hasReceipt || false,
      receiptEncodedLength: dbg.receiptEncodedLength || 0,
      receiptInSignature: dbg.receiptInSignature || false,
      
      // Test mode
      isTest: dbg.isTest || false,
      hasIsTestInForm: dbg.hasIsTestInForm || false,
      
      // Все поля формы
      formFields: dbg.formFields || {},
      
      // Проверки валидности
      validation: dbg.validation || {},
      
      // Части подписи по порядку
      signatureParts: dbg.signatureParts || [],
      
      timestamp: debugData.timestamp || new Date().toISOString(),
    };

    const text = JSON.stringify(criticalInfo, null, 2);
    
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
    
    // Check if we have HTML (from create-monthly)
    const html = (paymentData as any).html;
    if (html) {
      // Use HTML directly (auto-submit form)
      document.open();
      document.write(html);
      document.close();
      return;
    }
    
    // Otherwise create form from fields
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
                {debugData?.debug && (
                  <div className="space-y-4 text-sm">
                    {/* 1. Точная строка подписи - САМОЕ ВАЖНОЕ */}
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <div className="font-semibold text-red-900 mb-2">🔴 Точная строка подписи (для Error 29):</div>
                      <div className="text-gray-800 font-mono text-xs break-all bg-white p-2 rounded border">
                        {debugData.debug.exactSignatureStringMasked || 'N/A'}
                      </div>
                      <div className="mt-1 text-xs text-gray-600">
                        Длина: {debugData.debug.exactSignatureStringLength || 0} символов
                      </div>
                    </div>

                    {/* 2. Значение подписи */}
                    <div>
                      <div className="font-semibold text-gray-900 mb-1">SignatureValue (MD5):</div>
                      <div className="text-gray-800 font-mono text-xs break-all bg-gray-50 p-2 rounded">
                        {debugData.debug.signatureValue || 'N/A'}
                      </div>
                      <div className="mt-1 text-xs">
                        Длина: {debugData.debug.signatureLength || 0} | 
                        Валидна: {debugData.debug.signatureIsValid ? '✅' : '❌'}
                      </div>
                    </div>

                    {/* 3. Части подписи по порядку */}
                    {debugData.debug.signatureParts && debugData.debug.signatureParts.length > 0 && (
                      <div>
                        <div className="font-semibold text-gray-900 mb-1">Части подписи (по порядку):</div>
                        <div className="bg-gray-50 p-2 rounded text-xs space-y-1">
                          {debugData.debug.signatureParts.map((part: any, idx: number) => (
                            <div key={idx} className="flex items-start gap-2">
                              <span className="text-gray-500 w-6">{part.index}.</span>
                              <span className="text-gray-800 font-mono break-all flex-1">
                                {part.isShp ? '🔵 ' : part.isReceipt ? '🟡 Receipt (encoded)' : ''}
                                {part.part}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 4. Ключевые параметры */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-gray-600">MerchantLogin:</span>
                        <div className="font-mono text-xs">
                          {debugData.debug.merchantLogin || 'N/A'}
                          {debugData.debug.merchantLoginIsSteopone ? ' ✅' : ' ❌'}
                        </div>
                      </div>
                      <div>
                        <span className="text-gray-600">OutSum:</span>
                        <div className="font-mono text-xs">
                          {debugData.debug.outSum || 'N/A'}
                          {debugData.debug.outSumFormat ? ' ✅' : ' ❌'}
                        </div>
                      </div>
                      <div>
                        <span className="text-gray-600">InvId:</span>
                        <div className="font-mono text-xs">{debugData.debug.invIdString || 'N/A'}</div>
                      </div>
                      <div>
                        <span className="text-gray-600">Test Mode:</span>
                        <div className="text-xs">{debugData.debug.isTest ? 'Да' : 'Нет'}</div>
                      </div>
                    </div>

                    {/* 5. Shp_* параметры */}
                    {debugData.debug.shpParams && debugData.debug.shpParams.length > 0 && (
                      <div>
                        <div className="font-semibold text-gray-900 mb-1">
                          Shp_* параметры:
                          {debugData.debug.shpParamsSorted ? ' ✅ Отсортированы' : ' ❌ НЕ отсортированы!'}
                        </div>
                        <div className="text-xs text-gray-700 bg-gray-50 p-2 rounded">
                          {debugData.debug.shpParams.join(', ')}
                        </div>
                      </div>
                    )}

                    {/* 6. Receipt */}
                    {debugData.debug.hasReceipt && (
                      <div>
                        <div className="font-semibold text-gray-900 mb-1">Receipt:</div>
                        <div className="text-xs text-gray-700">
                          Длина: {debugData.debug.receiptEncodedLength} | 
                          В подписи: {debugData.debug.receiptInSignature ? '✅ Да' : '❌ Нет'}
                        </div>
                      </div>
                    )}

                    {/* 7. Проверки валидности */}
                    {debugData.debug.validation && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <div className="font-semibold text-blue-900 mb-2">Проверки валидности:</div>
                        <div className="text-xs space-y-1">
                          <div>MerchantLogin = "steopone": {debugData.debug.validation.merchantLoginCorrect ? '✅' : '❌'}</div>
                          <div>OutSum = "1.00": {debugData.debug.validation.outSumFormat ? '✅' : '❌'}</div>
                          <div>InvId валиден: {debugData.debug.validation.invIdValid ? '✅' : '❌'}</div>
                          <div>Signature формат: {debugData.debug.validation.signatureFormat ? '✅' : '❌'}</div>
                          <div>Shp_* отсортированы: {debugData.debug.validation.shpParamsSorted ? '✅' : '❌'}</div>
                          {debugData.debug.hasReceipt && (
                            <div>Receipt консистентен: {debugData.debug.validation.receiptConsistent ? '✅' : '❌'}</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
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
