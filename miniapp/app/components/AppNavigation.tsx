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
    <nav 
      className="fixed bottom-0 left-0 right-0 z-50"
      style={{ 
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)',
        paddingTop: '8px'
      }}
    >
      {/* Liquid Glass Background */}
      <div 
        className="mx-4 mb-2 rounded-t-[20px] border-t border-l border-r"
        style={{
          background: 'rgba(255, 255, 255, 0.15)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderColor: 'rgba(255, 255, 255, 0.35)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.25)',
          height: '72px'
        }}
      >
        <div className="flex items-center justify-around h-full max-w-md mx-auto px-2">
          {/* Кнопка "Отчеты" */}
          <button
            onClick={() => handleNavigation("/report" as "/report" | "/profile")}
            className="flex-1 flex flex-col items-center justify-center h-full transition-all duration-200 relative py-2"
            style={{
              opacity: isReportsActive ? 1 : 0.6
            }}
          >
            <span 
              className="text-2xl mb-1 transition-all duration-200"
              style={{
                filter: isReportsActive ? 'drop-shadow(0 0 8px rgba(164, 196, 154, 0.6))' : 'none',
                transform: isReportsActive ? 'scale(1.1)' : 'scale(1)'
              }}
            >
              📊
            </span>
            <span 
              className="text-xs font-medium transition-all duration-200"
              style={{
                color: isReportsActive ? '#A4C49A' : 'rgba(255, 255, 255, 0.8)',
                fontWeight: isReportsActive ? 600 : 400,
                textShadow: isReportsActive ? '0 0 8px rgba(164, 196, 154, 0.4)' : 'none'
              }}
            >
              Отчеты
            </span>
            {isReportsActive && (
              <div 
                className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-0.5 rounded-full"
                style={{
                  background: 'linear-gradient(90deg, transparent, #A4C49A, transparent)',
                  boxShadow: '0 0 8px rgba(164, 196, 154, 0.6)'
                }}
              />
            )}
          </button>

          {/* Кнопка "Личный кабинет" */}
          <button
            onClick={() => handleNavigation("/profile" as "/report" | "/profile")}
            className="flex-1 flex flex-col items-center justify-center h-full transition-all duration-200 relative py-2"
            style={{
              opacity: isProfileActive ? 1 : 0.6
            }}
          >
            <span 
              className="text-2xl mb-1 transition-all duration-200"
              style={{
                filter: isProfileActive ? 'drop-shadow(0 0 8px rgba(164, 196, 154, 0.6))' : 'none',
                transform: isProfileActive ? 'scale(1.1)' : 'scale(1)'
              }}
            >
              👤
            </span>
            <span 
              className="text-xs font-medium transition-all duration-200"
              style={{
                color: isProfileActive ? '#A4C49A' : 'rgba(255, 255, 255, 0.8)',
                fontWeight: isProfileActive ? 600 : 400,
                textShadow: isProfileActive ? '0 0 8px rgba(164, 196, 154, 0.4)' : 'none'
              }}
            >
              Личный кабинет
            </span>
            {isProfileActive && (
              <div 
                className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-0.5 rounded-full"
                style={{
                  background: 'linear-gradient(90deg, transparent, #A4C49A, transparent)',
                  boxShadow: '0 0 8px rgba(164, 196, 154, 0.6)'
                }}
              />
            )}
          </button>
        </div>
      </div>
    </nav>
  );
}

