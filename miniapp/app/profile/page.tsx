"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense, useRef } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import "../globals.css";
import AppLayout from "../components/AppLayout";

// Dynamic import with stable component structure
// Using dynamic import to prevent SSR issues, but component always mounts on client
const RobokassaDebugModal = dynamic(
  () => import("../components/RobokassaDebugModal"),
  { 
    ssr: false,
    // Ensure component structure is stable
    loading: () => null
  }
);

interface ProfileData {
  name: string | null;
  avatarUrl: string | null;
  weightKg: number | null;
  heightCm: number | null;
  goal: string | null;
  activityLevel: string | null;
  gender: string | null;
  age: number | null;
  caloriesGoal: number | null;
  proteinGoal: number | null;
  fatGoal: number | null;
  carbsGoal: number | null;
  waterGoalMl: number | null;
}

function ProfilePageContent() {
  // ALL HOOKS MUST BE CALLED UNCONDITIONALLY AT TOP LEVEL
  // No early returns, no conditional hooks, no hooks in loops/conditions
  
  const searchParams = useSearchParams();
  const userIdParam = searchParams.get("id");
  
  // Safe Telegram initialization - hooks must run regardless of Telegram availability
  const [tg, setTg] = useState<any>(null);
  
  const [userId, setUserId] = useState<number | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [normsExpanded, setNormsExpanded] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [basicInfoExpanded, setBasicInfoExpanded] = useState(false);

  // Редактируемые поля
  const [editName, setEditName] = useState<string>("");
  const [editWeight, setEditWeight] = useState<string>("");
  const [editHeight, setEditHeight] = useState<string>("");
  const [editGoal, setEditGoal] = useState<string>("");
  const [editActivity, setEditActivity] = useState<string>("");
  const [editGender, setEditGender] = useState<string>("");
  const [editAge, setEditAge] = useState<string>("");
  const [deleting, setDeleting] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [payDebug, setPayDebug] = useState<string[]>([]);
  const [debugData, setDebugData] = useState<any>(null);
  const [paymentDebugInfo, setPaymentDebugInfo] = useState<any>(null);
  const [showDebugModal, setShowDebugModal] = useState(false);
  const [error29, setError29] = useState(false);
  const [checkingPrivacy, setCheckingPrivacy] = useState(false);
  const [schemaCheck, setSchemaCheck] = useState<any>(null);

  // Safe Telegram bootstrap - must be unconditional hook
  useEffect(() => {
    if (typeof window !== "undefined") {
      const tgWebApp = (window as any).Telegram?.WebApp ?? null;
      setTg(tgWebApp);
    }
  }, []);

  // Derive isInTelegram AFTER all hooks are declared
  const isInTelegram = !!tg;

  // Инициализация userId
  useEffect(() => {
    if (userIdParam) {
      const n = Number(userIdParam);
      if (Number.isFinite(n) && n > 0) {
        setUserId(n);
        setError(null);
      } else {
        setError("Некорректный id пользователя");
        setLoading(false);
      }
    } else {
      setError("ID не передан");
      setLoading(false);
    }
  }, [userIdParam]);

  // Проверка согласия с политикой конфиденциальности
  useEffect(() => {
    if (!userId) return;

    const checkPrivacy = async () => {
      setCheckingPrivacy(true);
      try {
        const response = await fetch(`/api/privacy/check?userId=${userId}`);
        const data = await response.json();

        if (response.ok && data.ok) {
          if (!data.all_accepted) {
            // Пользователь не дал согласие (хотя бы одно из двух) - редирект на экран согласия
            window.location.href = `/privacy/consent?id=${userId}`;
            return;
          }
        } else {
          // Если ошибка, разрешаем продолжить (на случай проблем с API)
          console.warn("[ProfilePage] Ошибка проверки согласия:", data.error);
        }
      } catch (err) {
        console.error("[ProfilePage] Ошибка проверки согласия:", err);
        // При ошибке разрешаем продолжить
      } finally {
        setCheckingPrivacy(false);
      }
    };

    checkPrivacy();
  }, [userId]);

  // Загрузка данных профиля
  useEffect(() => {
    if (!userId) return;

    const loadProfile = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/user?userId=${userId}`);
        const data = await response.json();

        if (!response.ok || !data.ok) {
          throw new Error(data.error || "Ошибка загрузки профиля");
        }

        setProfile({
          name: data.name,
          avatarUrl: data.avatarUrl,
          weightKg: data.weightKg,
          heightCm: data.heightCm,
          goal: data.goal,
          activityLevel: data.activityLevel,
          gender: data.gender,
          age: data.age,
          caloriesGoal: data.caloriesGoal,
          proteinGoal: data.proteinGoal,
          fatGoal: data.fatGoal,
          carbsGoal: data.carbsGoal,
          waterGoalMl: data.waterGoalMl,
        });

        setAvatarUrl(data.avatarUrl || null);

        // Инициализируем поля редактирования
        setEditName(data.name || "");
        setEditWeight(data.weightKg?.toString() || "");
        setEditHeight(data.heightCm?.toString() || "");
        setEditGoal(data.goal || "");
        setEditActivity(data.activityLevel || "");
        setEditGender(data.gender || "");
        setEditAge(data.age?.toString() || "");
      } catch (err: any) {
        console.error("[profile] Ошибка загрузки:", err);
        setError(err.message || "Ошибка загрузки профиля");
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [userId]);

  // Если профиль пустой — отправляем на онбординг
  useEffect(() => {
    if (!profile || !userId) return;
    const requiredFilled =
      profile.weightKg &&
      profile.heightCm &&
      profile.goal &&
      profile.activityLevel &&
      profile.gender &&
      profile.age;
    if (!requiredFilled) {
      setNeedsOnboarding(true);
      window.location.href = `/registration?id=${userId}`;
    }
  }, [profile, userId]);

  // Check for Error 29 in URL after Robokassa redirect
  // MUST be before any early returns to maintain hook order
  useEffect(() => {
    if (!userId || typeof window === "undefined") return;
    
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const errorCode = urlParams.get("ErrorCode");
      const errorDesc = urlParams.get("ErrorDescription");
      const paymentStatus = urlParams.get("payment");
      
      // Handle payment success/failure redirects
      if (paymentStatus === "success") {
        console.log("[profile] Payment success detected in URL");
        setError(null);
        // Optionally show success message
        // You can add a success state here if needed
      } else if (paymentStatus === "failed") {
        console.log("[profile] Payment failed detected in URL");
        setError("Оплата не была завершена. Попробуйте еще раз.");
      }
      
      if (errorCode === "29" || urlParams.get("error")?.includes("29") || errorDesc?.includes("29")) {
        setError29(true);
        setPayError("Robokassa отклонил платеж (код ошибки 29). Это проблема на стороне мерчанта. Проверьте настройки в личном кабинете Robokassa.");
        
        // Try to get debug data from sessionStorage if available
        try {
          const storedDebug = sessionStorage.getItem("robokassa_debug");
          const storedDebugInfo = sessionStorage.getItem("robokassa_debug_info");
          
          if (storedDebug) {
            const parsedDebug = JSON.parse(storedDebug);
            setDebugData(parsedDebug);
            setShowDebugModal(true);
          }
          
          if (storedDebugInfo) {
            const parsedDebugInfo = JSON.parse(storedDebugInfo);
            setPaymentDebugInfo(parsedDebugInfo);
          } else if (storedDebug) {
            // Reconstruct debug info from stored debug
            const parsedDebug = JSON.parse(storedDebug);
            setPaymentDebugInfo({
              merchantLogin: parsedDebug.merchantLogin,
              isTest: parsedDebug.isTest,
              isProd: !parsedDebug.isTest,
              outSum: parsedDebug.outSum,
              recurring: false,
              invoiceId: parsedDebug.invoiceId,
              paymentUrl: parsedDebug.targetUrl || "N/A",
              timestamp: new Date().toISOString(),
              environment: parsedDebug.environment || { vercelEnv: "unknown", nodeEnv: "unknown" },
              signatureStringMasked: parsedDebug.signatureStringMasked,
              signatureValue: parsedDebug.signatureValue?.substring(0, 8) + "...",
              signatureChecks: parsedDebug.signatureChecks,
            });
          } else {
            // If no stored debug, try to fetch it from backend
            // This is a fallback - normally debug should be stored before redirect
            console.warn("[profile] Error 29 detected but no debug data in storage");
          }
        } catch (e) {
          console.error("Failed to parse stored debug data", e);
        }
      }
    } catch (e) {
      console.error("[profile] Error checking URL params:", e);
    }
  }, [userId]);

  // Функция для форматирования цели
  const formatGoal = (goal: string | null): string => {
    if (!goal) return "Не указана";
    switch (goal) {
      case "lose":
        return "Похудение";
      case "gain":
        return "Набор веса";
      case "maintain":
        return "Поддержание веса";
      default:
        return goal;
    }
  };

  // Функция для форматирования активности
  const formatActivity = (activity: string | null): string => {
    if (!activity) return "Не указана";
    const activityMap: Record<string, string> = {
      sedentary: "Сидячая работа",
      light: "1–2 тренировки в неделю",
      moderate: "3–4 тренировки в неделю",
      active: "5+ тренировок в неделю",
      very_active: "Спорт ежедневно"
    };
    return activityMap[activity] || activity;
  };

  // Функция для форматирования пола
  const formatGender = (gender: string | null): string => {
    if (!gender) return "Не указан";
    return gender === "male" ? "Мужской" : "Женский";
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!userId) return;
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("userId", String(userId));
    formData.append("file", file);

    try {
      setUploadingAvatar(true);
      const response = await fetch("/api/profile/avatar", {
        method: "POST",
        body: formData
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Не удалось загрузить фото");
      }
      // Обновляем аватар с cache busting для немедленного отображения
      const avatarUrlWithCache = data.avatarUrl ? `${data.avatarUrl.split('?')[0]}?t=${Date.now()}` : null;
      setAvatarUrl(avatarUrlWithCache);
      setProfile(prev => prev ? { ...prev, avatarUrl: avatarUrlWithCache } : prev);
    } catch (err: any) {
      console.error("[avatar] Ошибка загрузки:", err);
      setError(err.message || "Не удалось загрузить фото");
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Обработчик сохранения
  const handleSave = async () => {
    if (!userId) return;

    // Валидация
    if (!editWeight || !editHeight || !editGoal || !editActivity || !editGender || !editAge) {
      setError("Все поля обязательны для заполнения");
      return;
    }

    const weightNum = Number(editWeight);
    const heightNum = Number(editHeight);
    const ageNum = Number(editAge);

    if (!Number.isFinite(weightNum) || weightNum <= 0) {
      setError("Вес должен быть положительным числом");
      return;
    }

    if (!Number.isFinite(heightNum) || heightNum <= 0) {
      setError("Рост должен быть положительным числом");
      return;
    }

    if (!Number.isFinite(ageNum) || ageNum <= 0 || ageNum > 150) {
      setError("Возраст должен быть числом от 1 до 150");
      return;
    }

    setSaving(true);
    setError(null);

    const normalizedName = editName.trim() || null;

    try {
      const response = await fetch(`/api/profile/update?userId=${userId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: normalizedName,
          weightKg: weightNum,
          heightCm: heightNum,
          goal: editGoal,
          activityLevel: editActivity,
          gender: editGender,
          age: ageNum
        })
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Ошибка сохранения профиля");
      }

      // Обновляем профиль из ответа
      setProfile(data.profile);
      setAvatarUrl(data.profile.avatarUrl || null);
      setIsEditing(false);
    } catch (err: any) {
      console.error("[profile] Ошибка сохранения:", err);
      setError(err.message || "Ошибка сохранения профиля");
    } finally {
      setSaving(false);
    }
  };

  if (loading || checkingPrivacy) {
    return (
      <AppLayout>
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="text-textSecondary">Загрузка...</div>
        </div>
      </AppLayout>
    );
  }

  if (error && !profile) {
    return (
      <AppLayout>
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-soft p-6 text-center">
            <h2 className="text-xl font-semibold mb-2 text-red-600">Ошибка</h2>
            <p className="text-textPrimary">{error}</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!profile) {
    return (
      <AppLayout>
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="text-textSecondary">Профиль не найден</div>
        </div>
      </AppLayout>
    );
  }

  const displayName = profile.name || "Пользователь";

  const handleDeleteProfile = async () => {
    if (!userId) return;
    const confirmDelete = window.confirm("Вы действительно хотите удалить профиль?");
    if (!confirmDelete) return;

    try {
      setDeleting(true);
      const response = await fetch(`/api/profile/delete?userId=${userId}`, {
        method: "DELETE"
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Не удалось удалить профиль");
      }
      // После удаления отправляем на онбординг/старт
      window.location.href = "/";
    } catch (err: any) {
      console.error("[profile] Ошибка удаления профиля:", err);
      setError(err.message || "Ошибка удаления профиля");
    } finally {
      setDeleting(false);
    }
  };

  // Helper to add debug messages
  const pushDebug = (msg: string) => {
    const timestamp = new Date().toISOString();
    setPayDebug(prev => [...prev, `[${timestamp}] ${msg}`]);
    console.log(`[profile] PAY_DEBUG: ${msg}`);
  };

  const handleSubscribe = async () => {
    const startTime = Date.now();
    pushDebug("Клик по кнопке оплаты");
    
    if (!userId) {
      const errorMsg = "ID пользователя не найден";
      pushDebug(`ОШИБКА: ${errorMsg}`);
      setPayError(errorMsg);
      return;
    }

    // Get telegram_user_id from Telegram.WebApp.initDataUnsafe
    let telegramUserId: number | null = null;
    if (typeof window !== "undefined" && tg?.initDataUnsafe?.user?.id) {
      telegramUserId = tg.initDataUnsafe.user.id;
      pushDebug(`Найден telegram_user_id из initDataUnsafe: ${telegramUserId}`);
    } else if (typeof window !== "undefined" && (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.id) {
      telegramUserId = (window as any).Telegram.WebApp.initDataUnsafe.user.id;
      pushDebug(`Найден telegram_user_id из window.Telegram: ${telegramUserId}`);
    } else {
      const errorMsg = "telegram_user_id не найден. Убедитесь, что приложение открыто в Telegram.";
      pushDebug(`ОШИБКА: ${errorMsg}`);
      setPayError(errorMsg);
      return;
    }

    // Reset states
    setPayError(null);
    setPayDebug([]);
    setSubscribing(true);
    setError(null);
    setDebugData(null);
    setError29(false);

    let navigated = false;
    let navigationWatchdog: NodeJS.Timeout | null = null;

    try {
      pushDebug(`Вызов API /api/payments/start для userId=${userId}, telegramUserId=${telegramUserId}`);

      // Create AbortController with 8s timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
        pushDebug("Таймаут запроса (8 секунд)");
      }, 8000);

      const response = await fetch("/api/payments/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          userId,
          telegramUserId,
          planCode: "trial_3d_199"
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      pushDebug(`Получен ответ: status=${response.status}, ok=${response.ok}`);

      // Read response text once (can only be read once)
      let responseText = "";
      try {
        responseText = await response.text();
        pushDebug(`Длина ответа: ${responseText.length} символов`);
      } catch (readError: any) {
        pushDebug(`ОШИБКА чтения ответа: ${readError.message}`);
        throw new Error(`Не удалось прочитать ответ от сервера: ${readError.message}`);
      }

      // Handle non-OK responses
      if (!response.ok) {
        pushDebug(`Ошибка ответа (status ${response.status}): ${responseText.substring(0, 200)}`);
        
        // Try to parse as JSON
        let errorData: any = null;
        if (responseText && responseText.trim().length > 0) {
          try {
            errorData = JSON.parse(responseText);
          } catch (e) {
            // Not JSON, use text as error
            pushDebug("Ответ не является JSON, используем текст как ошибку");
          }
        }

        const errorMessage = errorData?.error || errorData?.details || responseText || `Ошибка сервера: ${response.status}`;
        
        // Check if it's Error 29
        const isError29 = errorMessage.includes("29") || errorMessage.includes("SignatureValue");
        if (isError29) {
          setError29(true);
          setPayError("Robokassa отклонил платеж (код ошибки 29). Это проблема на стороне мерчанта. Проверьте настройки в личном кабинете Robokassa.");
        }
        
        // If we have debug data, show modal even on error
        if (errorData?.debug?.robokassa) {
          setDebugData(errorData.debug.robokassa);
          setShowDebugModal(true);
          
          // Store debug info for UI panel
          const debugInfo = {
            merchantLogin: errorData.debug.robokassa.merchantLogin,
            isTest: errorData.debug.robokassa.isTest,
            isProd: !errorData.debug.robokassa.isTest,
            outSum: errorData.debug.robokassa.outSum,
            recurring: false,
            invoiceId: errorData.debug.robokassa.invoiceId,
            paymentUrl: errorData.debug.robokassa.targetUrl || "N/A",
            timestamp: new Date().toISOString(),
            environment: {
              vercelEnv: errorData.debug.robokassa.environment?.vercelEnv || "unknown",
              nodeEnv: errorData.debug.robokassa.environment?.nodeEnv || "unknown",
            },
            signatureStringMasked: errorData.debug.robokassa.signatureStringMasked,
            signatureValue: errorData.debug.robokassa.signatureValue?.substring(0, 8) + "...",
            signatureChecks: errorData.debug.robokassa.signatureChecks,
          };
          setPaymentDebugInfo(debugInfo);
        }
        
        throw new Error(errorMessage);
      }

      // Parse JSON safely (response is OK)
      let data: any;
      try {
        if (!responseText || responseText.trim().length === 0) {
          throw new Error("Пустой ответ от сервера");
        }
        
        data = JSON.parse(responseText);
        pushDebug("JSON успешно распарсен");
      } catch (parseError: any) {
        pushDebug(`ОШИБКА парсинга JSON: ${parseError.message}`);
        throw new Error(`Неверный формат ответа от сервера. Проверьте подключение и попробуйте еще раз.`);
      }

      if (!data.ok) {
        const errorMessage = data.error || "Не удалось начать оплату";
        pushDebug(`ОШИБКА: ${errorMessage}`);
        
        // Check if it's Error 29
        const isError29 = errorMessage.includes("29") || errorMessage.includes("SignatureValue");
        if (isError29) {
          setError29(true);
          setPayError("Robokassa отклонил платеж (код ошибки 29). Это проблема на стороне мерчанта. Проверьте настройки в личном кабинете Robokassa.");
        }
        
        // If we have debug data, show modal even on error
        if (data.debug?.robokassa) {
          setDebugData(data.debug.robokassa);
          setShowDebugModal(true);
          
          // Store debug info for UI panel
          const debugInfo = {
            merchantLogin: data.debug.robokassa.merchantLogin,
            isTest: data.debug.robokassa.isTest,
            isProd: !data.debug.robokassa.isTest,
            outSum: data.debug.robokassa.outSum,
            recurring: false,
            invoiceId: data.debug.robokassa.invoiceId,
            paymentUrl: data.debug.robokassa.targetUrl || "N/A",
            timestamp: new Date().toISOString(),
            environment: {
              vercelEnv: data.debug.robokassa.environment?.vercelEnv || "unknown",
              nodeEnv: data.debug.robokassa.environment?.nodeEnv || "unknown",
            },
            signatureStringMasked: data.debug.robokassa.signatureStringMasked,
            signatureValue: data.debug.robokassa.signatureValue?.substring(0, 8) + "...",
            signatureChecks: data.debug.robokassa.signatureChecks,
          };
          setPaymentDebugInfo(debugInfo);
        }
        
        throw new Error(errorMessage);
      }

      // Validate paymentUrl
      if (!data.paymentUrl || typeof data.paymentUrl !== "string") {
        pushDebug(`ОШИБКА: paymentUrl отсутствует или не строка`);
        throw new Error("Ссылка на оплату не получена от сервера");
      }

      if (!data.paymentUrl.startsWith("https://")) {
        pushDebug(`ОШИБКА: paymentUrl не начинается с https://: ${data.paymentUrl.substring(0, 50)}`);
        throw new Error("Некорректная ссылка на оплату");
      }

      pushDebug(`Получена ссылка на оплату: ${data.paymentUrl.substring(0, 80)}...`);

      // Store debug data if available
      if (data.debug?.robokassa) {
        setDebugData(data.debug.robokassa);
        
        // Store comprehensive debug info for UI panel
        const debugInfo = {
          merchantLogin: data.debug.robokassa.merchantLogin,
          isTest: data.debug.robokassa.isTest,
          isProd: !data.debug.robokassa.isTest,
          outSum: data.debug.robokassa.outSum,
          recurring: false, // We don't set recurring flag in URL params, it's configured in merchant settings
          invoiceId: data.invoiceId || data.debug.robokassa.invoiceId,
          paymentUrl: data.paymentUrl.substring(0, 120) + (data.paymentUrl.length > 120 ? "..." : ""),
          timestamp: new Date().toISOString(),
          environment: {
            vercelEnv: data.debug.robokassa.environment?.vercelEnv || "unknown",
            nodeEnv: data.debug.robokassa.environment?.nodeEnv || "unknown",
          },
          signatureStringMasked: data.debug.robokassa.signatureStringMasked,
          signatureValue: data.debug.robokassa.signatureValue?.substring(0, 8) + "...",
          signatureChecks: data.debug.robokassa.signatureChecks,
          openMethod: null as string | null,
          openSuccess: false,
        };
        setPaymentDebugInfo(debugInfo);
        
        try {
          if (typeof window !== "undefined" && window.sessionStorage) {
            sessionStorage.setItem("robokassa_debug", JSON.stringify(data.debug.robokassa));
            sessionStorage.setItem("robokassa_payment_url", data.paymentUrl);
            sessionStorage.setItem("robokassa_debug_info", JSON.stringify(debugInfo));
            pushDebug("Debug данные сохранены в sessionStorage");
          }
        } catch (e) {
          pushDebug(`Не удалось сохранить debug данные: ${e}`);
        }
      }

      // Open payment URL with robust fallbacks
      pushDebug("Открытие страницы оплаты...");
      const currentUrl = typeof window !== "undefined" ? window.location.href : "";
      let openMethod = "unknown";
      let openSuccess = false;

      if (typeof window !== "undefined") {
        // Try Telegram WebApp.openLink first (preferred for Telegram)
        if ((window as any).Telegram?.WebApp?.openLink) {
          try {
            pushDebug("Попытка открыть через Telegram.WebApp.openLink");
            (window as any).Telegram.WebApp.openLink(data.paymentUrl, { try_instant_view: false });
            openMethod = "Telegram.WebApp.openLink";
            openSuccess = true;
            navigated = true;
            pushDebug("✓ openLink вызван успешно");
          } catch (e: any) {
            pushDebug(`✗ ОШИБКА openLink: ${e.message}, используем fallback`);
            openMethod = "Telegram.WebApp.openLink (failed, using fallback)";
            // Fall through to fallback
          }
        }
        
        // Fallback: window.location.href (most reliable)
        if (!navigated) {
          try {
            pushDebug("Используется window.location.href (fallback)");
            window.location.href = data.paymentUrl;
            openMethod = "window.location.href";
            openSuccess = true;
            navigated = true;
            pushDebug("✓ window.location.href установлен");
          } catch (e: any) {
            pushDebug(`✗ ОШИБКА window.location.href: ${e.message}`);
            openMethod = "window.location.href (failed)";
            // Last resort: window.open
            try {
              pushDebug("Попытка window.open (последний fallback)");
              window.open(data.paymentUrl, '_blank', 'noopener,noreferrer');
              openMethod = "window.open";
              openSuccess = true;
              navigated = true;
              pushDebug("✓ window.open вызван");
            } catch (e2: any) {
              pushDebug(`✗ ОШИБКА window.open: ${e2.message}`);
              openMethod = "all methods failed";
              throw new Error(`Не удалось открыть страницу оплаты. Все методы открытия не сработали. URL: ${data.paymentUrl.substring(0, 100)}...`);
            }
          }
        }
      }
      
      // Store open method in debug info for overlay
      if (paymentDebugInfo) {
        setPaymentDebugInfo({
          ...paymentDebugInfo,
          openMethod,
          openSuccess,
        });
      }

      // Watchdog: if navigation didn't happen after 3s, reset loading
      if (navigated && typeof window !== "undefined") {
        const watchdogStartTime = Date.now();
        navigationWatchdog = setTimeout(() => {
          // Check if we're still on the same page and document is visible
          const stillOnSamePage = window.location.href === currentUrl;
          const isVisible = document.visibilityState === "visible";
          
          if (stillOnSamePage && isVisible) {
            const elapsed = Date.now() - watchdogStartTime;
            pushDebug(`ВНИМАНИЕ: Страница оплаты не открылась через ${elapsed}ms`);
            setPayError("Страница оплаты не открылась. Попробуйте еще раз или откройте ссылку вручную.");
            setSubscribing(false);
          }
        }, 3000);
      } else {
        // If navigation was not attempted, reset immediately
        setSubscribing(false);
      }

    } catch (err: any) {
      const elapsed = Date.now() - startTime;
      pushDebug(`ОШИБКА после ${elapsed}ms: ${err.message}`);
      
      if (err.name === "AbortError") {
        setPayError("Превышено время ожидания (8 секунд). Проверьте подключение к интернету и попробуйте еще раз.");
      } else {
        const errorMsg = err.message || "Ошибка оформления подписки";
        setPayError(errorMsg);
      }
      
      // Always reset loading state on error
      setSubscribing(false);
      
      // Clean up watchdog if it was set
      if (navigationWatchdog) {
        clearTimeout(navigationWatchdog);
        navigationWatchdog = null;
      }
    } finally {
      // Ensure we always clean up the timeout if navigation didn't happen
      // The watchdog will handle resetting loading state if navigation fails
      if (navigationWatchdog && !navigated) {
        clearTimeout(navigationWatchdog);
      }
    }
  };

  const formatDate = (iso?: string | null) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  return (
    <AppLayout>
      <div className="min-h-screen bg-background p-4 py-8">
      <div className="max-w-md mx-auto">
        {/* Заголовок */}
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-textPrimary">Личный кабинет</h1>
        </div>

        {/* Сообщение об ошибке (если есть) */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Профильный хедер */}
        <div className="bg-white rounded-2xl shadow-soft p-6 mb-4 flex flex-col items-center text-center">
          <div
            className="w-28 h-28 rounded-full border border-gray-200 bg-gray-100 overflow-hidden mb-3"
            style={{
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundImage: avatarUrl ? `url(${avatarUrl})` : "none"
            }}
          >
            {!avatarUrl && (
              <div className="w-full h-full flex items-center justify-center text-textSecondary text-xs">
                Фото
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarChange}
          />
          <div className="text-xl font-semibold text-textPrimary">{displayName}</div>
          <div className="text-sm text-textSecondary mb-3">Личный кабинет</div>
          <button
            onClick={handleAvatarClick}
            disabled={uploadingAvatar}
            className="px-4 py-2 rounded-full border border-gray-200 text-textPrimary text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {uploadingAvatar ? "Загрузка..." : "Изменить фото"}
          </button>
        </div>

        {/* Кнопка подписки */}
        <div className="bg-white rounded-2xl shadow-soft p-6 mb-4">
          <button
            onClick={handleSubscribe}
            disabled={subscribing || !userId}
            className="w-full px-6 py-4 bg-accent text-white font-semibold rounded-xl hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {subscribing ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                <span>Обработка...</span>
              </>
            ) : (
              "Оформить подписку — 1 ₽ за 3 дня, затем 199 ₽"
            )}
          </button>
          
          {/* Error message */}
          {payError && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700 text-sm mb-2">{payError}</p>
              <button
                onClick={handleSubscribe}
                disabled={subscribing}
                className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                Попробовать снова
              </button>
            </div>
          )}
          
          {/* Payment Debug Panel - shown when ?debug=1 or payment fails */}
          {(() => {
            const showDebug = typeof window !== "undefined" && (
              new URLSearchParams(window.location.search).get("debug") === "1" ||
              payError !== null ||
              error29 ||
              paymentDebugInfo !== null
            );
            
            if (!showDebug) return null;
            
            return (
              <div className="mt-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h3 className="text-sm font-semibold text-blue-900 mb-3">Отладочная информация о платеже</h3>
                
                {paymentDebugInfo ? (
                  <div className="space-y-2 text-xs font-mono">
                    <div className="grid grid-cols-2 gap-2">
                      <div><span className="text-blue-700">Merchant Login:</span></div>
                      <div className="text-gray-800">{paymentDebugInfo.merchantLogin || "N/A"}</div>
                      
                      <div><span className="text-blue-700">Режим:</span></div>
                      <div className="text-gray-800">
                        {paymentDebugInfo.isTest ? "Тестовый" : "Продакшн"} 
                        {paymentDebugInfo.isProd && " (Prod)"}
                      </div>
                      
                      <div><span className="text-blue-700">Сумма (OutSum):</span></div>
                      <div className="text-gray-800">{paymentDebugInfo.outSum || "N/A"}</div>
                      
                      <div><span className="text-blue-700">Recurring:</span></div>
                      <div className="text-gray-800">{paymentDebugInfo.recurring ? "Да" : "Нет"}</div>
                      
                      <div><span className="text-blue-700">Invoice ID:</span></div>
                      <div className="text-gray-800 break-all">{paymentDebugInfo.invoiceId || "N/A"}</div>
                      
                      <div><span className="text-blue-700">Payment URL:</span></div>
                      <div className="text-gray-800 break-all">{paymentDebugInfo.paymentUrl || "N/A"}</div>
                      
                      <div><span className="text-blue-700">Время:</span></div>
                      <div className="text-gray-800">{paymentDebugInfo.timestamp || "N/A"}</div>
                      
                      <div><span className="text-blue-700">Vercel Env:</span></div>
                      <div className="text-gray-800">{paymentDebugInfo.environment?.vercelEnv || "unknown"}</div>
                      
                      <div><span className="text-blue-700">Node Env:</span></div>
                      <div className="text-gray-800">{paymentDebugInfo.environment?.nodeEnv || "unknown"}</div>
                      
                      {paymentDebugInfo.signatureStringMasked && (
                        <>
                          <div><span className="text-blue-700">Signature String:</span></div>
                          <div className="text-gray-800 break-all text-[10px]">{paymentDebugInfo.signatureStringMasked}</div>
                          
                          <div><span className="text-blue-700">Signature Value:</span></div>
                          <div className="text-gray-800 break-all">{paymentDebugInfo.signatureValue || "N/A"}</div>
                        </>
                      )}
                      
                      {paymentDebugInfo.signatureChecks && (
                        <>
                          <div><span className="text-blue-700">Signature Checks:</span></div>
                          <div className="text-gray-800">
                            Length: {paymentDebugInfo.signatureChecks.lengthIs32 ? "✓" : "✗"}, 
                            Lowercase: {paymentDebugInfo.signatureChecks.lowercase ? "✓" : "✗"}, 
                            Hex: {paymentDebugInfo.signatureChecks.hexOnly ? "✓" : "✗"}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-600">Debug информация недоступна</p>
                )}
                
                {/* Debug messages log */}
                {payDebug.length > 0 && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs text-blue-700 font-medium">Лог отладки ({payDebug.length} сообщений)</summary>
                    <div className="mt-2 space-y-1 font-mono text-[10px] text-gray-700 max-h-40 overflow-y-auto bg-white p-2 rounded border">
                      {payDebug.map((msg, idx) => (
                        <div key={idx} className="break-all">{msg}</div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            );
          })()}
        </div>

        {/* Основная информация (сворачиваемая секция) */}
        <div className="bg-white rounded-2xl shadow-soft p-6 mb-4">
          <button
            onClick={() => setBasicInfoExpanded(!basicInfoExpanded)}
            className="w-full flex justify-between items-center"
          >
            <h2 className="text-lg font-semibold text-textPrimary">Основная информация</h2>
            <span className={`transform transition-transform duration-200 ${basicInfoExpanded ? 'rotate-180' : ''}`}>
              ▼
            </span>
          </button>
          
          {basicInfoExpanded && (
            <div className="mt-4">
              {isEditing ? (
                <div className="space-y-4">
                  {/* Имя */}
                  <div>
                    <label className="block text-sm font-medium text-textSecondary mb-2">
                      Имя
                    </label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                      placeholder="Введите имя"
                      maxLength={100}
                    />
                  </div>

                  {/* Вес */}
                  <div>
                    <label className="block text-sm font-medium text-textSecondary mb-2">
                      Вес (кг)
                    </label>
                    <input
                      type="number"
                      value={editWeight}
                      onChange={(e) => setEditWeight(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                      placeholder="Введите вес"
                      min="1"
                      max="500"
                    />
                  </div>

                  {/* Рост */}
                  <div>
                    <label className="block text-sm font-medium text-textSecondary mb-2">
                      Рост (см)
                    </label>
                    <input
                      type="number"
                      value={editHeight}
                      onChange={(e) => setEditHeight(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                      placeholder="Введите рост"
                      min="50"
                      max="300"
                    />
                  </div>

                  {/* Пол */}
                  <div>
                    <label className="block text-sm font-medium text-textSecondary mb-2">
                      Пол
                    </label>
                    <select
                      value={editGender}
                      onChange={(e) => setEditGender(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                    >
                      <option value="">Выберите пол</option>
                      <option value="male">Мужской</option>
                      <option value="female">Женский</option>
                    </select>
                  </div>

                  {/* Возраст */}
                  <div>
                    <label className="block text-sm font-medium text-textSecondary mb-2">
                      Возраст (лет)
                    </label>
                    <input
                      type="number"
                      value={editAge}
                      onChange={(e) => setEditAge(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                      placeholder="Введите возраст"
                      min="1"
                      max="150"
                    />
                  </div>

                  {/* Уровень активности */}
                  <div>
                    <label className="block text-sm font-medium text-textSecondary mb-2">
                      Активность
                    </label>
                    <select
                      value={editActivity}
                      onChange={(e) => setEditActivity(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                    >
                      <option value="">Выберите уровень активности</option>
                      <option value="sedentary">Сидячая работа</option>
                      <option value="light">1–2 тренировки в неделю</option>
                      <option value="moderate">3–4 тренировки в неделю</option>
                      <option value="active">5+ тренировок в неделю</option>
                      <option value="very_active">Спорт ежедневно</option>
                    </select>
                  </div>

                  {/* Цель */}
                  <div>
                    <label className="block text-sm font-medium text-textSecondary mb-2">
                      Цель
                    </label>
                    <select
                      value={editGoal}
                      onChange={(e) => setEditGoal(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                    >
                      <option value="">Выберите цель</option>
                      <option value="lose">Похудение</option>
                      <option value="maintain">Поддержание веса</option>
                      <option value="gain">Набор веса</option>
                    </select>
                  </div>

                  {/* Кнопки действий */}
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => {
                        setIsEditing(false);
                        setError(null);
                        // Восстанавливаем значения из профиля
                        setEditName(profile.name || "");
                        setEditWeight(profile.weightKg?.toString() || "");
                        setEditHeight(profile.heightCm?.toString() || "");
                        setEditGoal(profile.goal || "");
                        setEditActivity(profile.activityLevel || "");
                        setEditGender(profile.gender || "");
                        setEditAge(profile.age?.toString() || "");
                      }}
                      className="flex-1 px-4 py-2 border border-gray-300 text-textPrimary font-medium rounded-lg hover:bg-gray-50 transition-colors"
                      disabled={saving}
                    >
                      Отмена
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="flex-1 px-4 py-2 bg-accent text-white font-medium rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50"
                    >
                      {saving ? "Сохранение..." : "Сохранить"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {profile.weightKg && (
                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-textSecondary">Вес</span>
                      <span className="font-medium text-textPrimary">{profile.weightKg} кг</span>
                    </div>
                  )}
                  
                  {profile.heightCm && (
                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-textSecondary">Рост</span>
                      <span className="font-medium text-textPrimary">{profile.heightCm} см</span>
                    </div>
                  )}

                  {profile.gender && (
                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-textSecondary">Пол</span>
                      <span className="font-medium text-textPrimary">{formatGender(profile.gender)}</span>
                    </div>
                  )}

                  {profile.age && (
                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-textSecondary">Возраст</span>
                      <span className="font-medium text-textPrimary">{profile.age} лет</span>
                    </div>
                  )}

                  {profile.activityLevel && (
                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-textSecondary">Активность</span>
                      <span className="font-medium text-textPrimary">{formatActivity(profile.activityLevel)}</span>
                    </div>
                  )}
                  
                  <div className="flex justify-between items-center py-2">
                    <span className="text-textSecondary">Цель</span>
                    <span className="font-medium text-textPrimary">{formatGoal(profile.goal)}</span>
                  </div>

                  {/* Кнопка редактирования внизу блока */}
                  <div className="pt-4 mt-4 border-t border-gray-100">
                    <button
                      onClick={() => setIsEditing(true)}
                      className="w-full px-4 py-2 bg-accent/20 text-accent font-medium rounded-lg hover:bg-accent/30 transition-colors"
                    >
                      Редактировать данные
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>


        {/* Нормы (сворачиваемая секция) */}
        <div className="bg-white rounded-2xl shadow-soft p-6 mb-4">
          <button
            onClick={() => setNormsExpanded(!normsExpanded)}
            className="w-full flex justify-between items-center"
          >
            <h2 className="text-lg font-semibold text-textPrimary">Ваши нормы</h2>
            <span className={`transform transition-transform duration-200 text-textPrimary ${normsExpanded ? 'rotate-180' : ''}`}>
              ▼
            </span>
          </button>
          
          {normsExpanded && (
            <div className="mt-4 space-y-3 animate-fadeIn">
              {profile.caloriesGoal && (
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-textSecondary">Калории</span>
                  <span className="font-medium text-textPrimary">{profile.caloriesGoal} ккал</span>
                </div>
              )}
              
              {profile.proteinGoal && (
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-textSecondary">Белки</span>
                  <span className="font-medium text-textPrimary">{profile.proteinGoal} г</span>
                </div>
              )}
              
              {profile.fatGoal && (
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-textSecondary">Жиры</span>
                  <span className="font-medium text-textPrimary">{profile.fatGoal} г</span>
                </div>
              )}
              
              {profile.carbsGoal && (
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-textSecondary">Углеводы</span>
                  <span className="font-medium text-textPrimary">{profile.carbsGoal} г</span>
                </div>
              )}
              
              {profile.waterGoalMl && (
                <div className="flex justify-between items-center py-2">
                  <span className="text-textSecondary">Вода</span>
                  <span className="font-medium text-textPrimary">{profile.waterGoalMl} мл</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Дисклеймер про здоровье */}
        <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-2xl">
          <p className="text-sm text-yellow-800 text-center leading-relaxed">
            <strong>⚠️ Важно:</strong> Сервис не является медицинским. Рекомендации носят информационный характер и не заменяют консультацию специалиста.
          </p>
        </div>

        {/* Политика конфиденциальности и Пользовательское соглашение */}
        <div className="mb-4 space-y-3">
          <Link
            href={`/privacy${userId ? `?id=${userId}` : ''}` as any}
            className="block w-full px-4 py-3 bg-white border border-gray-200 text-textPrimary font-medium rounded-2xl shadow-soft hover:bg-gray-50 transition-colors text-center"
          >
            Политика конфиденциальности
          </Link>
          <Link
            href={`/terms${userId ? `?id=${userId}` : ''}` as any}
            className="block w-full px-4 py-3 bg-white border border-gray-200 text-textPrimary font-medium rounded-2xl shadow-soft hover:bg-gray-50 transition-colors text-center"
          >
            Пользовательское соглашение
          </Link>
        </div>

        {/* Удаление профиля */}
        <div className="mb-4">
          <button
            onClick={handleDeleteProfile}
            disabled={deleting}
            className="w-full px-4 py-3 bg-white border border-red-200 text-red-600 font-medium rounded-2xl shadow-soft hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            {deleting ? "Удаление..." : "Удалить профиль"}
          </button>
        </div>

        {/* Место для будущих секций (подписки, документы и т.д.) */}
        {/* Можно добавить здесь позже */}
      </div>
    </div>

    {/* Robokassa Debug Modal - always mount to avoid hook order issues */}
    <RobokassaDebugModal
      debugData={debugData}
      error29={error29}
      onClose={() => {
        setShowDebugModal(false);
        // If no error, proceed with redirect
        if (!error29 && debugData) {
          try {
            // Try to get payment URL from stored data or redirect
            if (typeof window !== "undefined" && window.sessionStorage) {
              const storedUrl = sessionStorage.getItem("robokassa_payment_url");
              if (storedUrl) {
                window.location.href = storedUrl;
              }
            }
          } catch (e) {
            console.error("[profile] Failed to get payment URL from sessionStorage:", e);
          }
        }
      }}
    />
    </AppLayout>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-textSecondary">Загрузка...</div>
    </div>
  );
}

// Wrapper component to handle Suspense boundary properly
function ProfilePageWrapper() {
  // This component ensures hooks are called before Suspense boundary
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ProfilePageContent />
    </Suspense>
  );
}

export default function ProfilePage() {
  // Export wrapper to maintain stable component structure
  return <ProfilePageWrapper />;
}
