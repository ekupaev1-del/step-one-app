import { Suspense } from "react";
import PrivacyPageContent from "./PrivacyPageContent";

// Force dynamic rendering to avoid static generation issues with useSearchParams
export const dynamic = 'force-dynamic';

// Server component wrapper with Suspense boundary
export default function PrivacyPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background p-4 py-8 flex items-center justify-center">
        <div className="text-center">Загрузка...</div>
      </div>
    }>
      <PrivacyPageContent />
    </Suspense>
  );
}
