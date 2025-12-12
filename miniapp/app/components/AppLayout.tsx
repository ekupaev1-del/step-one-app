"use client";

import { ReactNode } from "react";
import AppNavigation from "./AppNavigation";
import { Suspense } from "react";

interface AppLayoutProps {
  children: ReactNode;
}

/**
 * Общий layout для страниц Mini App с навигацией
 * Обеспечивает единую навигацию между разделами приложения
 */
export default function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-background" style={{ paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>
      {/* Основной контент */}
      <main className="w-full">
        {children}
      </main>
      
      {/* Нижняя навигационная панель */}
      <Suspense fallback={null}>
        <AppNavigation />
      </Suspense>
    </div>
  );
}

