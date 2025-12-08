"use client";

import { Suspense } from "react";
import { QuestionnaireFormContent } from "../../questionnaire";

export const dynamic = "force-dynamic";

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-600">Загрузка...</div>
    </div>
  );
}

export default function RegistrationContactPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <QuestionnaireFormContent />
    </Suspense>
  );
}

