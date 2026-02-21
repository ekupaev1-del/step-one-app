import { Suspense } from "react";
import ConsentPageContent from "./ConsentPageContent";

// Force dynamic rendering to avoid static generation issues with useSearchParams
export const dynamic = 'force-dynamic';

// Server component wrapper with Suspense boundary
export default function ConsentPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-textSecondary">Загрузка...</div>
      </div>
    }>
      <ConsentPageContent />
    </Suspense>
  );
}
