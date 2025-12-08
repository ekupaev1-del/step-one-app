"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export const dynamic = "force-dynamic";

export default function Page() {
  const router = useRouter();
  const searchParams = useSearchParams();

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
