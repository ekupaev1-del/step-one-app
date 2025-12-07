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
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)',
        paddingTop: '12px'
      }}
    >
      {/* Liquid Glass Background */}
      <div 
        className="mx-4 mb-2 border-t border-l border-r"
        style={{
          background: 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderColor: 'rgba(255, 255, 255, 0.9)',
          boxShadow: '0 -4px 24px rgba(0, 0, 0, 0.12), 0 0 1px rgba(0, 0, 0, 0.08)',
          borderTopLeftRadius: '24px',
          borderTopRightRadius: '24px',
          height: '80px',
          minHeight: '80px'
        }}
      >
        <div className="flex items-center justify-around h-full max-w-md mx-auto px-4" style={{ paddingTop: '14px', paddingBottom: '14px' }}>
          {/* Кнопка "Отчеты" */}
          <button
            onClick={() => handleNavigation("/report" as "/report" | "/profile")}
            className="flex-1 flex flex-col items-center justify-center h-full transition-all duration-200 relative"
            style={{
              paddingTop: '8px',
              paddingBottom: '8px'
            }}
          >
            <span 
              className="mb-2 transition-all duration-200"
              style={{
                fontSize: '26px',
                lineHeight: '1',
                opacity: isReportsActive ? 1.0 : 0.5,
                transform: isReportsActive ? 'scale(1.1)' : 'scale(1)',
                filter: isReportsActive ? 'none' : 'grayscale(0.3)'
              }}
            >
              📊
            </span>
            <span 
              className="font-medium transition-all duration-200"
              style={{
                fontSize: '13px',
                color: isReportsActive ? '#8FBC8F' : '#5F5B62',
                fontWeight: isReportsActive ? 600 : 500,
                letterSpacing: '0.01em'
              }}
            >
              Отчеты
            </span>
            {isReportsActive && (
              <div 
                className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full"
                style={{
                  width: '48px',
                  height: '3px',
                  background: '#8FBC8F',
                  boxShadow: '0 2px 8px rgba(143, 188, 143, 0.4)'
                }}
              />
            )}
          </button>

          {/* Кнопка "Личный кабинет" */}
          <button
            onClick={() => handleNavigation("/profile" as "/report" | "/profile")}
            className="flex-1 flex flex-col items-center justify-center h-full transition-all duration-200 relative"
            style={{
              paddingTop: '8px',
              paddingBottom: '8px'
            }}
          >
            <span 
              className="mb-2 transition-all duration-200"
              style={{
                fontSize: '26px',
                lineHeight: '1',
                opacity: isProfileActive ? 1.0 : 0.5,
                transform: isProfileActive ? 'scale(1.1)' : 'scale(1)',
                filter: isProfileActive ? 'none' : 'grayscale(0.3)'
              }}
            >
              👤
            </span>
            <span 
              className="font-medium transition-all duration-200"
              style={{
                fontSize: '13px',
                color: isProfileActive ? '#8FBC8F' : '#5F5B62',
                fontWeight: isProfileActive ? 600 : 500,
                letterSpacing: '0.01em'
              }}
            >
              Личный кабинет
            </span>
            {isProfileActive && (
              <div 
                className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full"
                style={{
                  width: '48px',
                  height: '3px',
                  background: '#8FBC8F',
                  boxShadow: '0 2px 8px rgba(143, 188, 143, 0.4)'
                }}
              />
            )}
          </button>
        </div>
      </div>
    </nav>
  );
}

