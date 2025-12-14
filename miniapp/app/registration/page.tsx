"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { QuestionnaireFormContent } from "../questionnaire";

export const dynamic = "force-dynamic";

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-textSecondary">Загрузка...</div>
    </div>
  );
}

// Клиентский компонент-обертка для получения searchParams
function RegistrationPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [checkingPrivacy, setCheckingPrivacy] = useState(true);
  const [privacyAccepted, setPrivacyAccepted] = useState<boolean | null>(null);

  // Быстро получаем userId из URL при монтировании
  useEffect(() => {
    setMounted(true);
    const userIdParam = searchParams.get("id");
    
    // Fallback через window.location для быстрой загрузки
    if (!userIdParam && typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const fallbackUserId = urlParams.get("id");
      setUserId(fallbackUserId);
    } else {
      setUserId(userIdParam);
    }
  }, [searchParams]);

  // Проверяем согласие с политикой конфиденциальности
  useEffect(() => {
    if (!mounted || !userId) {
      setCheckingPrivacy(false);
      return;
    }

    const checkPrivacy = async () => {
      try {
        const response = await fetch(`/api/privacy/check?userId=${userId}`);
        const data = await response.json();

        if (response.ok && data.ok) {
          if (!data.all_accepted) {
            // Пользователь не дал согласие (хотя бы одно из двух) - редирект на экран согласия
            router.push(`/privacy/consent?id=${userId}`);
            return;
          }
          setPrivacyAccepted(true);
        } else {
          // Если ошибка, разрешаем продолжить (на случай проблем с API)
          console.warn("[RegistrationPage] Ошибка проверки согласия:", data.error);
          setPrivacyAccepted(true);
        }
      } catch (err) {
        console.error("[RegistrationPage] Ошибка проверки согласия:", err);
        // При ошибке разрешаем продолжить
        setPrivacyAccepted(true);
      } finally {
        setCheckingPrivacy(false);
      }
    };

    checkPrivacy();
  }, [mounted, userId, router]);

  // Показываем контент сразу, не ждем Suspense
  if (!mounted || checkingPrivacy) {
    return <LoadingFallback />;
  }

  // Если согласие не дано, редирект уже произошел
  if (privacyAccepted === false) {
    return <LoadingFallback />;
  }

  return <QuestionnaireFormContent initialUserId={userId} />;
}

// Главный компонент страницы
export default function RegistrationPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <RegistrationPageContent />
    </Suspense>
  );
}
