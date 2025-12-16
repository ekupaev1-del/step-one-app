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

  // Не проверяем согласие здесь - пусть анкета сама покажет экран согласия
  useEffect(() => {
    if (!mounted || !userId) {
      setCheckingPrivacy(false);
      return;
    }
    // Пропускаем проверку - анкета сама покажет экран согласия если нужно
    setPrivacyAccepted(true);
    setCheckingPrivacy(false);
  }, [mounted, userId]);

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
