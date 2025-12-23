"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import AppLayout from "../components/AppLayout";

function PaymentContent() {
  const searchParams = useSearchParams();
  const [userId, setUserId] = useState<number | null>(null);
  const [loading, setLoading] = useState<string | boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  const [trialEndAt, setTrialEndAt] = useState<string | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [paymentData, setPaymentData] = useState<{ actionUrl: string; formData: Record<string, string> } | null>(null);
  const [debugInfo, setDebugInfo] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);

  useEffect(() => {
    const id = searchParams.get("id");
    if (id) {
      const n = Number(id);
      if (Number.isFinite(n) && n > 0) {
        setUserId(n);
        loadSubscriptionStatus(n);
      } else {
        setError("Некорректный id пользователя");
      }
    } else {
      setError("ID не передан");
    }
    
    // ВАЖНО: При загрузке страницы ОБЯЗАТЕЛЬНО сбрасываем paymentData
    // чтобы не было автоматических редиректов
    setPaymentData(null);
    setLoading(false);
    setAgreedToTerms(false);
    
    // Проверяем, есть ли сохраненная debug информация в localStorage
    // (на случай, если пользователь вернулся после ошибки)
    try {
      const savedDebug = localStorage.getItem('robokassa_debug_info');
      const savedTime = localStorage.getItem('robokassa_debug_time');
      if (savedDebug) {
        console.log("[payment] Found saved debug info from:", savedTime);
        setDebugInfo(savedDebug);
        setShowDebug(true);
      }
    } catch (e) {
      console.warn("[payment] Failed to read debug info from localStorage:", e);
    }
  }, [searchParams]);

  const loadSubscriptionStatus = async (id: number) => {
    try {
      const res = await fetch(`/api/user?id=${id}`);
      const data = await res.json();
      if (data.ok) {
        // API возвращает данные напрямую, не в объекте user
        setSubscriptionStatus(data.subscriptionStatus);
        setTrialEndAt(data.trialEndAt);
      } else {
        console.error("[payment] Error loading subscription status:", data.error);
      }
    } catch (e) {
      console.error("[payment] Error loading subscription status:", e);
    }
  };

  const startTrial = async () => {
    if (!userId) return;
    if (!agreedToTerms) {
      setError("Необходимо согласиться с условиями оферты");
      return;
    }
    setLoading("creating");
    setError(null);
    
    try {
      const res = await fetch("/api/robokassa/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      
      console.log("[payment] Response status:", res.status);
      console.log("[payment] Response data:", JSON.stringify(data, null, 2));
      
      // Проверяем статус ответа
      if (!res.ok) {
        const errorMsg = data?.error || `HTTP ${res.status}: Ошибка сервера`;
        console.error("[payment] HTTP error:", res.status, errorMsg);
        throw new Error(errorMsg);
      }
      
      // Проверяем, что API вернул успешный ответ
      if (!data || !data.ok) {
        const errorMsg = data?.error || "Ошибка создания платежа";
        console.error("[payment] API error:", errorMsg, data);
        throw new Error(errorMsg);
      }
      
      // Проверяем наличие данных для POST формы
      console.log("[payment] Checking response data:", {
        hasOk: !!data.ok,
        hasActionUrl: !!data.actionUrl,
        hasFormData: !!data.formData,
        actionUrl: data.actionUrl,
        formDataType: typeof data.formData,
        formDataKeys: data.formData ? Object.keys(data.formData) : null,
        fullResponseKeys: Object.keys(data),
      });
      
      if (!data.actionUrl || !data.formData) {
        console.error("[payment] Missing required data:", {
          hasActionUrl: !!data.actionUrl,
          hasFormData: !!data.formData,
          actionUrl: data.actionUrl,
          formDataKeys: data.formData ? Object.keys(data.formData) : null,
          fullResponse: data,
        });
        throw new Error("Данные для оплаты не получены от сервера. Проверьте логи консоли.");
      }
      
      console.log("[payment] ✅ Payment data получены");
      console.log("[payment] Action URL:", data.actionUrl);
      console.log("[payment] Form data:", data.formData);
      
      // Сохраняем данные платежа - НЕ отправляем форму автоматически!
      // Пользователь останется на странице и сам решит, когда переходить к оплате
      console.log("[payment] ✅ Payment data saved, NOT submitting form automatically");
      console.log("[payment] User must click 'Перейти к оплате' button to proceed");
      
      setPaymentData({
        actionUrl: data.actionUrl,
        formData: data.formData,
      });
      setLoading(false);
      setError(null);
      
      // ВАЖНО: НЕ вызываем submitPaymentForm() здесь!
      // Форма должна отправляться ТОЛЬКО при нажатии кнопки пользователем
    } catch (e: any) {
      console.error("[payment] Error:", e);
      const errorMessage = e.message || "Ошибка создания платежа";
      setError(errorMessage);
      setLoading(false);
      
      // Сохраняем debug информацию об ошибке
      const errorDebug = `=== ERROR DEBUG ===
Error: ${errorMessage}
Time: ${new Date().toISOString()}
User ID: ${userId}
Stack: ${e.stack || "N/A"}
==================`;
      setDebugInfo(errorDebug);
      setShowDebug(true);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const isTrialActive = subscriptionStatus === "trial" && trialEndAt;
  const isActive = subscriptionStatus === "active";
  const canStartTrial = !subscriptionStatus || subscriptionStatus === "none" || subscriptionStatus === "expired";

  // Функция для отправки формы оплаты - вызывается ТОЛЬКО при нажатии кнопки
  const submitPaymentForm = (e?: React.MouseEvent) => {
    // Предотвращаем любые автоматические вызовы
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    if (!paymentData) {
      console.error("[payment] No payment data to submit");
      return;
    }
    
    console.log("[payment] ========== USER CLICKED 'Перейти к оплате' ==========");
    console.log("[payment] This is the ONLY way form should be submitted!");
    console.log("[payment] Payment data:", {
      actionUrl: paymentData.actionUrl,
      formData: paymentData.formData,
    });
    setLoading("redirecting");
    
    // ВАЖНО: Robokassa требует POST форму, а не GET редирект!
    // Создаем скрытую форму и отправляем её
    const form = document.createElement("form");
    form.method = "POST";
    form.action = paymentData.actionUrl;
    form.style.display = "none";
    form.target = "_self";
    
    // ВАЖНО: Порядок полей должен быть ТОЧНО как в документации Robokassa:
    // 1. MerchantLogin
    // 2. OutSum
    // 3. InvoiceID
    // 4. SignatureValue
    // 5. Recurring
    // 6. Shp_ параметры (если есть) - ОПЦИОНАЛЬНО
    // КРИТИЧНО: Description НЕ включаем в форму!
    const fieldOrder = [
      "MerchantLogin",
      "OutSum",
      "InvoiceID",
      "SignatureValue",
      // Recurring не отправляем на первом платеже
      // Shp_userId - ОПЦИОНАЛЬНО, включается только если есть в formData
    ];
    
    // КРИТИЧНО: Сначала строим объект с уникальными ключами, чтобы избежать дублирования
    // Это гарантирует, что каждый ключ появляется только один раз
    const uniqueFormData: Record<string, string> = {};
    
    // Добавляем поля в правильном порядке (fieldOrder)
    fieldOrder.forEach((key) => {
      if (paymentData.formData[key]) {
        uniqueFormData[key] = String(paymentData.formData[key]);
      }
    });
    
    // Добавляем остальные поля (включая Shp_userId, если есть)
    // КРИТИЧНО: Проверяем, что поле еще не добавлено (избегаем дублирования)
    Object.entries(paymentData.formData).forEach(([key, value]) => {
      if (!uniqueFormData.hasOwnProperty(key)) {
        uniqueFormData[key] = String(value);
      } else {
        console.warn(`[payment] ⚠️ Duplicate field detected: ${key} - skipping to avoid duplication`);
      }
    });
    
    // Теперь создаем форму из уникальных полей
    const formFields: Array<{ name: string; value: string }> = [];
    
    // Сначала добавляем поля в порядке fieldOrder
    fieldOrder.forEach((key) => {
      if (uniqueFormData[key]) {
        const value = uniqueFormData[key];
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        input.value = value;
        form.appendChild(input);
        formFields.push({ name: key, value: value });
        console.log(`[payment] Added form field: ${key} = ${value} (length: ${value.length})`);
      } else {
        if (key !== "Shp_userId") {
          console.warn(`[payment] Missing form field: ${key}`);
        }
      }
    });
    
    // Затем добавляем остальные поля (включая Shp_userId, если он не в fieldOrder)
    Object.entries(uniqueFormData).forEach(([key, value]) => {
      if (!fieldOrder.includes(key)) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        input.value = value;
        form.appendChild(input);
        formFields.push({ name: key, value: value });
        console.log(`[payment] Added additional form field: ${key} = ${value}`);
      }
    });
    
    // КРИТИЧНО: Проверяем на дублирование полей перед отправкой
    const fieldNames = formFields.map(f => f.name);
    const duplicates = fieldNames.filter((name, index) => fieldNames.indexOf(name) !== index);
    if (duplicates.length > 0) {
      console.error("[payment] ❌ DUPLICATE FIELDS DETECTED:", duplicates);
      console.error("[payment] This will cause SignatureValue mismatch and error 26!");
      setError(`Критическая ошибка: дублирование полей: ${[...new Set(duplicates)].join(", ")}`);
      setLoading(false);
      return;
    }
    
    // ВАЖНО: Проверяем, что все обязательные поля добавлены
    // КРИТИЧНО: Description НЕ обязателен - убран по требованиям Robokassa
    // Recurring НЕ отправляем на первом платеже
    // Shp_userId ОПЦИОНАЛЕН - НЕ включаем в requiredFields
    const requiredFields = ["MerchantLogin", "OutSum", "InvoiceID", "SignatureValue"];
    const missingFields = requiredFields.filter(field => !formFields.find(f => f.name === field));
    if (missingFields.length > 0) {
      console.error("[payment] ❌ MISSING REQUIRED FIELDS:", missingFields);
      console.error("[payment] Available fields:", formFields.map(f => f.name));
      setError(`Ошибка: отсутствуют обязательные поля: ${missingFields.join(", ")}`);
      setLoading(false);
      return;
    }
    
    // КРИТИЧНО: Логируем финальный список полей для отладки
    console.log("[payment] ✅ Final form fields (unique):", formFields.map(f => f.name));
    const shpCount = formFields.filter(f => f.name === "Shp_userId").length;
    if (shpCount > 1) {
      console.error("[payment] ❌ CRITICAL: Shp_userId appears", shpCount, "times!");
    } else if (shpCount === 1) {
      console.log("[payment] ✅ Shp_userId appears exactly once");
    } else {
      console.log("[payment] ℹ️ Shp_userId not included (optional)");
    }
    
    console.log("[payment] ✅ All required fields present:", requiredFields);
    if (formFields.find(f => f.name === "Recurring")) {
      console.log("[payment] ✅ Recurring field is present (recurring payment mode)");
    } else {
      console.log("[payment] ⚠️ Recurring field is NOT present (test mode - regular payment)");
    }
    
    console.log("[payment] Form created with fields:", formFields);
    console.log("[payment] Form action URL:", form.action);
    console.log("[payment] Form method:", form.method);
    
    // Сохраняем debug информацию для отображения
    // ВАЖНО: Показываем ВСЕ поля, включая те, что не в fieldOrder
    const allFormFields: Array<{ name: string; value: string }> = [];
    const formInputs = form.querySelectorAll('input[type="hidden"]');
    formInputs.forEach((input) => {
      const name = (input as HTMLInputElement).name;
      const value = (input as HTMLInputElement).value;
      allFormFields.push({ name, value });
    });
    
    const debugText = `=== DEBUG INFO ===
Time: ${new Date().toISOString()}
Action URL: ${form.action}
Method: ${form.method}
Total fields: ${allFormFields.length}
Fields:
${allFormFields.map(f => `  ${f.name} = ${f.value}`).join('\n')}
==================`;
    
    // ВАЖНО: Сохраняем debug информацию в localStorage ПЕРЕД отправкой формы
    // Это позволит посмотреть её даже после редиректа на страницу ошибки
    try {
      localStorage.setItem('robokassa_debug_info', debugText);
      localStorage.setItem('robokassa_debug_time', new Date().toISOString());
      console.log("[payment] Debug info saved to localStorage");
    } catch (e) {
      console.warn("[payment] Failed to save debug info to localStorage:", e);
    }
    
    setDebugInfo(debugText);
    console.log("[payment] Debug info:", debugText);
    console.log("[payment] All form fields count:", allFormFields.length);
    console.log("[payment] All form fields:", allFormFields);
    
    // Добавляем форму в DOM
    document.body.appendChild(form);
    
    // ВАЖНО: Даем пользователю время скопировать debug информацию
    // Увеличиваем задержку до 3 секунд, чтобы пользователь успел скопировать
    console.log("[payment] Form created, will submit in 3 seconds...");
    console.log("[payment] You can copy debug info now!");
    
    // Показываем обратный отсчет
    let countdown = 3;
    const countdownInterval = setInterval(() => {
      countdown--;
      if (countdown > 0) {
        console.log(`[payment] Submitting in ${countdown} seconds...`);
      } else {
        clearInterval(countdownInterval);
      }
    }, 1000);
    
    // Задержка перед отправкой - 3 секунды
    setTimeout(() => {
      clearInterval(countdownInterval);
      console.log("[payment] Submitting form NOW!");
      form.submit();
    }, 3000);
  };

  return (
    <AppLayout>
      <div className="min-h-screen bg-background p-4 py-8 pb-24">
        <div className="max-w-md mx-auto bg-white rounded-2xl shadow-soft p-6 space-y-4">
          <div className="text-center space-y-1">
            <h1 className="text-2xl font-bold text-textPrimary">Подписка Step One</h1>
            <p className="text-sm text-textSecondary">199 ₽ в месяц</p>
          </div>

          {isTrialActive && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
              <p className="font-semibold text-green-800">Триал активен</p>
              <p className="text-sm text-green-700">
                Триал заканчивается: {formatDate(trialEndAt)}
              </p>
              <p className="text-xs text-green-600">
                После окончания триала произойдёт автоматическое списание 199 ₽ за месяц.
              </p>
            </div>
          )}

          {isActive && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="font-semibold text-blue-800">Подписка активна</p>
              <p className="text-sm text-blue-700">
                Подписка продлевается автоматически каждый месяц.
              </p>
            </div>
          )}

          {canStartTrial && (
            <>
          <div className="bg-accent/5 border border-accent/20 rounded-xl p-4 text-sm text-textPrimary">
            <p className="font-semibold mb-1">3 дня бесплатно</p>
                <p className="text-textSecondary mb-2">
                  Для активации триала необходимо привязать карту. С карты будет списано 1 ₽ для привязки.
                </p>
            <p className="text-textSecondary">
              После 3 дней бесплатного периода произойдёт автоматическое списание 199 ₽ за месяц. Подписка продлевается автоматически.
            </p>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              <p className="font-semibold mb-1">❌ Ошибка:</p>
              <p>{error}</p>
              {debugInfo && (
                <button
                  onClick={() => setShowDebug(!showDebug)}
                  className="mt-2 text-xs underline"
                >
                  {showDebug ? "Скрыть" : "Показать"} debug информацию
                </button>
              )}
            </div>
          )}
          
          {(paymentData || debugInfo) && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-yellow-800">
                  🔍 Debug информация
                  {!paymentData && <span className="text-xs text-yellow-600 ml-2">(сохранено)</span>}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (debugInfo) {
                        navigator.clipboard.writeText(debugInfo);
                        alert("Скопировано в буфер обмена!");
                      }
                    }}
                    className="text-xs text-yellow-700 underline"
                  >
                    📋 Копировать
                  </button>
                  <button
                    onClick={() => setShowDebug(!showDebug)}
                    className="text-xs text-yellow-700 underline"
                  >
                    {showDebug ? "Скрыть" : "Показать"}
                  </button>
                </div>
              </div>
              {showDebug && debugInfo && (
                <div className="mt-2">
                  <textarea
                    readOnly
                    value={debugInfo}
                    className="w-full p-2 text-xs font-mono bg-white border border-yellow-300 rounded resize-none"
                    rows={15}
                    onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => {
                        if (debugInfo) {
                          navigator.clipboard.writeText(debugInfo);
                          alert("✅ Скопировано в буфер обмена!");
                        }
                      }}
                      className="px-3 py-1 text-xs bg-yellow-200 text-yellow-800 rounded hover:bg-yellow-300"
                    >
                      📋 Копировать всё
                    </button>
                    <button
                      onClick={() => {
                        localStorage.removeItem('robokassa_debug_info');
                        localStorage.removeItem('robokassa_debug_time');
                        setDebugInfo(null);
                        setShowDebug(false);
                      }}
                      className="px-3 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                    >
                      🗑️ Очистить
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="space-y-3">
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className="mt-0.5 w-5 h-5 rounded border-gray-300 text-accent focus:ring-2 focus:ring-accent cursor-pointer flex-shrink-0"
                />
                <span className="text-sm text-textPrimary flex-1 leading-relaxed">
                  Я согласен на автоматические списания согласно{" "}
                  <Link
                    href={userId ? `/oferta?id=${userId}` : "/oferta"}
                    className="text-accent underline hover:text-accent/80 font-medium"
                    target="_blank"
                  >
                    условиям оферты
                  </Link>
                </span>
              </label>
            </div>

            {!paymentData ? (
              <>
                <button
                  onClick={startTrial}
                  disabled={!userId || !!loading || !agreedToTerms}
                  className="w-full py-3 rounded-xl bg-accent text-white font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                >
                  {loading === "creating" 
                    ? "Создаём оплату..." 
                    : "Начать пробный период"}
                </button>
                
                {loading === "creating" && (
                  <p className="text-sm text-textSecondary text-center mt-2">
                    Подготовка платежа... Пожалуйста, подождите
                  </p>
                )}
              </>
            ) : (
              <>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-2">
                  <p className="text-sm font-semibold text-blue-800 mb-1">
                    Готово к оплате!
                  </p>
                  <p className="text-xs text-blue-700">
                    Нажмите кнопку ниже для перехода на страницу оплаты
                  </p>
                </div>

                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log("[payment] BUTTON CLICKED - user explicitly clicked 'Перейти к оплате'");
                    submitPaymentForm(e);
                  }}
                  disabled={!!loading}
                  type="button"
                  className="w-full py-3 rounded-xl bg-accent text-white font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                >
                  {loading === "redirecting" 
                    ? "Переход на страницу оплаты..." 
                    : "Перейти к оплате"}
                </button>

                <button
                  onClick={() => {
                    setPaymentData(null);
                    setLoading(false);
                  }}
                  className="w-full py-2 rounded-xl border border-gray-300 text-textPrimary font-medium hover:bg-gray-50 transition-colors text-sm"
                >
                  Отмена
                </button>
              </>
            )}
          </div>
            </>
          )}

          {(isTrialActive || isActive) && (
            <Link
              href={`/profile?id=${userId}`}
              className="block w-full py-3 rounded-xl border border-gray-200 text-textPrimary font-semibold hover:bg-gray-50 text-center"
            >
              Отменить подписку
            </Link>
          )}

          <p className="text-xs text-textSecondary text-center">
            Оплата проходит через Robokassa. Вы можете отменить автосписание в любой момент до даты списания.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}

export default function PaymentPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="text-lg font-semibold text-textPrimary mb-2">Загрузка...</div>
          <div className="text-sm text-textSecondary">Подготовка страницы оплаты</div>
        </div>
      </div>
    }>
      <PaymentContent />
    </Suspense>
  );
}
