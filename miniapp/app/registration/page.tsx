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

// Обертка для получения searchParams в клиентском компоненте
function RegistrationPageContent() {
  const searchParams = useSearchParams();
  const userIdParam = searchParams.get("id");
  
  return <QuestionnaireFormContent initialUserId={userIdParam} />;
}

export default function RegistrationPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <RegistrationPageContent />
    </Suspense>
  );
}

