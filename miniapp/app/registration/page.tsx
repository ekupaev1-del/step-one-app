"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { QuestionnaireFormContent } from "../questionnaire";

export const dynamic = "force-dynamic";

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-600">Загрузка...</div>
    </div>
  );
}

// Клиентский компонент-обертка для получения searchParams
function RegistrationPageContent() {
  const searchParams = useSearchParams();
  const userIdParam = searchParams.get("id");
  
  // Логируем для отладки
  console.log("[RegistrationPageContent] searchParams:", searchParams);
  console.log("[RegistrationPageContent] userIdParam from searchParams:", userIdParam);
  
  // Также пробуем получить из window.location как fallback
  let fallbackUserId = null;
  if (typeof window !== "undefined" && !userIdParam) {
    const urlParams = new URLSearchParams(window.location.search);
    fallbackUserId = urlParams.get("id");
    console.log("[RegistrationPageContent] fallbackUserId from window.location:", fallbackUserId);
  }
  
  const finalUserId = userIdParam || fallbackUserId;
  console.log("[RegistrationPageContent] finalUserId:", finalUserId);
  
  return <QuestionnaireFormContent initialUserId={finalUserId} />;
}

// Главный компонент страницы
export default function RegistrationPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <RegistrationPageContent />
    </Suspense>
  );
}

