"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { memo } from "react";

function AppNavigation() {
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
    // Мгновенная навигация без задержек
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
      {/* Легкий стеклянный фон */}
      <div 
        className="mx-4 mb-2"
        style={{
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          borderTop: '0.5px solid rgba(0, 0, 0, 0.06)',
          borderTopLeftRadius: '20px',
          borderTopRightRadius: '20px',
          height: '68px',
          minHeight: '68px',
          boxShadow: '0 -2px 12px rgba(0, 0, 0, 0.08)'
        }}
      >
        <div className="flex items-center justify-around h-full max-w-md mx-auto px-2">
          {/* Кнопка "Отчеты" */}
          <button
            onClick={() => handleNavigation("/report" as "/report" | "/profile")}
            className="flex-1 flex flex-col items-center justify-center h-full relative"
            style={{
              paddingTop: '8px',
              paddingBottom: '8px'
            }}
          >
            <span 
              className="mb-1.5"
              style={{
                fontSize: '22px',
                lineHeight: '1',
                opacity: isReportsActive ? 1.0 : 0.65
              }}
            >
              📊
            </span>
            <span 
              className="font-medium"
              style={{
                fontSize: '12px',
                color: isReportsActive ? '#8FBC8F' : '#5F5B62',
                fontWeight: isReportsActive ? 600 : 500
              }}
            >
              Отчеты
            </span>
            {isReportsActive && (
              <div 
                className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full"
                style={{
                  width: '40px',
                  height: '3px',
                  background: '#8FBC8F',
                  borderRadius: '2px'
                }}
              />
            )}
          </button>

          {/* Кнопка "Личный кабинет" */}
          <button
            onClick={() => handleNavigation("/profile" as "/report" | "/profile")}
            className="flex-1 flex flex-col items-center justify-center h-full relative"
            style={{
              paddingTop: '8px',
              paddingBottom: '8px'
            }}
          >
            <span 
              className="mb-1.5"
              style={{
                fontSize: '22px',
                lineHeight: '1',
                opacity: isProfileActive ? 1.0 : 0.65
              }}
            >
              👤
            </span>
            <span 
              className="font-medium"
              style={{
                fontSize: '12px',
                color: isProfileActive ? '#8FBC8F' : '#5F5B62',
                fontWeight: isProfileActive ? 600 : 500
              }}
            >
              Личный кабинет
            </span>
            {isProfileActive && (
              <div 
                className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full"
                style={{
                  width: '40px',
                  height: '3px',
                  background: '#8FBC8F',
                  borderRadius: '2px'
                }}
              />
            )}
          </button>
        </div>
      </div>
    </nav>
  );
}

// Мемоизация для предотвращения лишних ре-рендеров
export default memo(AppNavigation);

