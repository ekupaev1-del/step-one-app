import { Suspense } from "react";
import QuestionClient from "./QuestionClient";
import AppLayout from "../components/AppLayout";

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-textSecondary">Загрузка...</div>
    </div>
  );
}

export default function QuestionPage() {
  return (
    <AppLayout>
      <Suspense fallback={<LoadingFallback />}>
        <QuestionClient />
      </Suspense>
    </AppLayout>
  );
}
