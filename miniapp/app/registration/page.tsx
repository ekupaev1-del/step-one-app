"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
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
  const [userId, setUserId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

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

  // Показываем контент сразу, не ждем Suspense
  if (!mounted) {
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
