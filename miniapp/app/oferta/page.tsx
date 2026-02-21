import { Suspense } from "react";
import OfertaPageContent from "./OfertaPageContent";

// Force dynamic rendering to avoid static generation issues with useSearchParams
export const dynamic = 'force-dynamic';

// Server component wrapper with Suspense boundary
export default function OfertaPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background p-4 py-8 flex items-center justify-center">
        <div className="text-center">Загрузка...</div>
      </div>
    }>
      <OfertaPageContent />
    </Suspense>
  );
}
