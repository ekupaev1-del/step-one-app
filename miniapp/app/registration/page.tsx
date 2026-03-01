"use client";

import { Suspense } from "react";
import { QuestionnaireFormContent } from "../questionnaire";

export const dynamic = "force-dynamic";

export default function RegistrationPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-textSecondary">Загрузка...</div>
      </div>
    }>
      <QuestionnaireFormContent />
    </Suspense>
  );
}
