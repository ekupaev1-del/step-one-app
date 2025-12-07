"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export default function AppNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Получаем userId из query параметров для сохранения при навигации
  const userId = searchParams.get("id");
  const userIdParam = userId ? `?id=${userId}` : "";

  // Определяем активный таб на основе pathname
  const isReportsActive = pathname === "/report" || pathname.startsWith("/report");
  const isProfileActive = pathname === "/profile" || pathname.startsWith("/profile");

  const handleNavigation = (path: "/report" | "/profile") => {
    const url = `${path}${userIdParam}`;
    // Используем type assertion для обхода строгой типизации Next.js 16
    (router.push as (href: string) => void)(url);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="flex items-center justify-around h-16 max-w-md mx-auto">
        {/* Кнопка "Отчеты" */}
        <button
          onClick={() => handleNavigation("/report" as "/report" | "/profile")}
          className={`flex-1 flex flex-col items-center justify-center h-full transition-colors relative ${
            isReportsActive
              ? "text-accent"
              : "text-textSecondary active:text-textPrimary"
          }`}
        >
          <span className="text-2xl mb-1">📊</span>
          <span className={`text-xs font-medium ${isReportsActive ? "font-semibold" : ""}`}>
            Отчеты
          </span>
          {isReportsActive && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-t-full" />
          )}
        </button>

        {/* Кнопка "Личный кабинет" */}
        <button
          onClick={() => handleNavigation("/profile" as "/report" | "/profile")}
          className={`flex-1 flex flex-col items-center justify-center h-full transition-colors relative ${
            isProfileActive
              ? "text-accent"
              : "text-textSecondary active:text-textPrimary"
          }`}
        >
          <span className="text-2xl mb-1">👤</span>
          <span className={`text-xs font-medium ${isProfileActive ? "font-semibold" : ""}`}>
            Личный кабинет
          </span>
          {isProfileActive && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-t-full" />
          )}
        </button>
      </div>
    </nav>
  );
}

