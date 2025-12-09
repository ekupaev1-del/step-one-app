import { Suspense } from "react";
import { QuestionnaireFormContent } from "../questionnaire";

export const dynamic = "force-dynamic";

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-600">Загрузка...</div>
    </div>
  );
}

// Серверный компонент - получает searchParams на сервере
export default function RegistrationPage({
  searchParams
}: {
  searchParams?: { id?: string | string[] };
}) {
  const id = searchParams?.id;
  const idValue = Array.isArray(id) ? id[0] : id;
  const userId = typeof idValue === "string" && idValue.length > 0 ? idValue : null;

  return (
    <Suspense fallback={<LoadingFallback />}>
      <QuestionnaireFormContent initialUserId={userId} />
    </Suspense>
  );
}

