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
      setError(e.message || "Ошибка создания платежа");
      setLoading(false);
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
    // 2. InvoiceID
    // 3. Description
    // 4. SignatureValue
    // 5. OutSum
    // 6. Recurring
    // 7. Shp_ параметры (если есть)
    const fieldOrder = [
      "MerchantLogin",
      "InvoiceID",
      "Description",
      "SignatureValue",
      "OutSum",
      "Recurring",
      "Shp_userId"
    ];
    
    // Добавляем поля в правильном порядке
    const formFields: Array<{ name: string; value: string }> = [];
    fieldOrder.forEach((key) => {
      if (paymentData.formData[key]) {
        const value = String(paymentData.formData[key]);
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        // ВАЖНО: Не кодируем значение - браузер сам закодирует при отправке формы
        // Но убеждаемся, что это строка
        input.value = value;
        form.appendChild(input);
        formFields.push({ name: key, value: value });
        console.log(`[payment] Added form field: ${key} = ${value} (length: ${value.length})`);
      } else {
        console.warn(`[payment] Missing form field: ${key}`);
      }
    });
    
    // Добавляем любые другие поля, которые не в списке (на всякий случай)
    Object.entries(paymentData.formData).forEach(([key, value]) => {
      if (!fieldOrder.includes(key)) {
        const valueStr = String(value);
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        input.value = valueStr;
        form.appendChild(input);
        formFields.push({ name: key, value: valueStr });
        console.log(`[payment] Added additional form field: ${key} = ${valueStr}`);
      }
    });
    
    console.log("[payment] Form created with fields:", formFields);
    console.log("[payment] Form action URL:", form.action);
    console.log("[payment] Form method:", form.method);
    
    // Добавляем форму в DOM
    document.body.appendChild(form);
    
    console.log("[payment] Form created, will submit in 500ms...");
    
    // Задержка перед отправкой
    setTimeout(() => {
      console.log("[payment] Submitting form NOW - this should ONLY happen after user click!");
      form.submit();
    }, 500);
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
              {error}
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
