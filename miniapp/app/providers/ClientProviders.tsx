"use client";

import { ReactNode, Suspense } from "react";
import { UserSessionProvider } from "./UserSessionProvider";

export function ClientProviders({ children }: { children: ReactNode }) {
  // Wrap UserSessionProvider in Suspense because it uses useSearchParams()
  // This prevents build errors during static generation
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-textSecondary">Загрузка...</div>
      </div>
    }>
      <UserSessionProvider>
        {children}
      </UserSessionProvider>
    </Suspense>
  );
}
