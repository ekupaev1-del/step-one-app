"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";

export const dynamic = "force-dynamic";

function RegistrationRedirect() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const id = searchParams.get("id");
    const target = id ? `/registration/contact?id=${id}` : "/registration/contact";
    router.replace(target as any);
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-600">Загрузка...</div>
    </div>
  );
}

export default function RegistrationIndexPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-600">Загрузка...</div>
      </div>
    }>
      <RegistrationRedirect />
    </Suspense>
  );
}

