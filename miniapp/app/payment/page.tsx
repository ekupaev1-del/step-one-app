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
    
    // Сбрасываем состояние при загрузке
    setLoading(false);
    setAgreedToTerms(false);
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
      // Use clean subscription endpoint
      const res = await fetch("/api/pay/subscribe", {
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
      
      // Проверяем наличие subscription URL
      if (!data.subscriptionUrl) {
        console.error("[payment] Missing subscription URL:", data);
        throw new Error("URL подписки не получен от сервера.");
      }
      
      console.log("[payment] ✅ Subscription URL получен:", data.subscriptionUrl);
      
      // Открываем ссылку на подписку Robokassa
      // В Telegram Mini App это откроется в WebView
      window.location.href = data.subscriptionUrl;
      
      setLoading(false);
      setError(null);
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
  // submitPaymentForm removed - we use direct URL redirect now
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
    
    // Required fields for subscription payment:
    // 1. MerchantLogin
    // 2. OutSum
    // 3. InvId
    // 4. Description
    // 5. Recurring
    // 6. SignatureValue
    const fieldOrder = [
      "MerchantLogin",
      "OutSum",
      "InvId",
      "Description",
      "Recurring",
      "SignatureValue",
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
    
    // Add remaining fields (if any) that are in formData but not in fieldOrder
    // This ensures all fields from backend are included
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
    
    // Required fields for subscription payment
    const requiredFields = ["MerchantLogin", "OutSum", "InvId", "Description", "Recurring", "SignatureValue"];
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
    // Recurring отсутствует по требованию схемы первого платежа
    
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
    
    // DEBUG: Добавляем информацию о подписи если доступна
    const signatureInfo = paymentData && 'debugSignature' in paymentData && paymentData.debugSignature
      ? `\nSignature base (without password): ${paymentData.debugSignature.base}\nSignature MD5: ${paymentData.debugSignature.md5}`
      : '';
    
    const debugText = `=== DEBUG INFO ===
Time: ${new Date().toISOString()}
Action URL: ${form.action}
Method: ${form.method}
Total fields: ${allFormFields.length}
Fields:
${allFormFields.map(f => `  ${f.name} = ${f.value}`).join('\n')}${signatureInfo}
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
            <p className="text-xs text-textSecondary mt-1">Автоматическое продление каждый месяц</p>
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
            <p className="font-semibold mb-1">Оформить подписку</p>
                <p className="text-textSecondary mb-2">
                  При оплате карта будет сохранена для автоматического продления подписки каждый месяц.
                </p>
            <p className="text-textSecondary">
              Подписка продлевается автоматически. Вы можете отменить её в любой момент в личном кабинете.
            </p>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              <p className="font-semibold mb-1">❌ Ошибка:</p>
              <p>{error}</p>
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

            <button
              onClick={startTrial}
              disabled={!userId || !!loading || !agreedToTerms}
              className="w-full py-3 rounded-xl bg-accent text-white font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              {loading === "creating" 
                ? "Переход на страницу оплаты..." 
                : "Оформить подписку"}
            </button>
            
            {loading === "creating" && (
              <p className="text-sm text-textSecondary text-center mt-2">
                Переход на страницу оплаты Robokassa...
              </p>
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
