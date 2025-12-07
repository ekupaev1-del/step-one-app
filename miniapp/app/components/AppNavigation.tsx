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
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 10px)',
        paddingTop: '10px'
      }}
    >
      {/* Liquid Glass Background */}
      <div 
        className="mx-4 mb-2 border-t border-l border-r"
        style={{
          background: 'rgba(255, 255, 255, 0.22)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          borderColor: 'rgba(255, 255, 255, 0.40)',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.20)',
          borderTopLeftRadius: '22px',
          borderTopRightRadius: '22px',
          height: '76px',
          minHeight: '76px'
        }}
      >
        <div className="flex items-center justify-around h-full max-w-md mx-auto px-2" style={{ paddingTop: '12px', paddingBottom: '12px' }}>
          {/* Кнопка "Отчеты" */}
          <button
            onClick={() => handleNavigation("/report" as "/report" | "/profile")}
            className="flex-1 flex flex-col items-center justify-center h-full transition-all duration-200 relative"
            style={{
              paddingTop: '10px',
              paddingBottom: '10px'
            }}
          >
            <span 
              className="mb-2 transition-all duration-200"
              style={{
                fontSize: '24px',
                opacity: isReportsActive ? 1.0 : 0.7,
                filter: isReportsActive ? 'drop-shadow(0 0 6px rgba(255, 255, 255, 0.65))' : 'none',
                transform: isReportsActive ? 'scale(1.05)' : 'scale(1)'
              }}
            >
              📊
            </span>
            <span 
              className="font-medium transition-all duration-200"
              style={{
                fontSize: '12px',
                color: isReportsActive ? '#FFFFFF' : 'rgba(255, 255, 255, 0.75)',
                fontWeight: isReportsActive ? 600 : 500,
                textShadow: isReportsActive ? '0 0 6px rgba(255, 255, 255, 0.65)' : 'none'
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
                  background: '#F4CC00',
                  boxShadow: '0 0 8px rgba(244, 204, 0, 0.6)'
                }}
              />
            )}
          </button>

          {/* Кнопка "Личный кабинет" */}
          <button
            onClick={() => handleNavigation("/profile" as "/report" | "/profile")}
            className="flex-1 flex flex-col items-center justify-center h-full transition-all duration-200 relative"
            style={{
              paddingTop: '10px',
              paddingBottom: '10px'
            }}
          >
            <span 
              className="mb-2 transition-all duration-200"
              style={{
                fontSize: '24px',
                opacity: isProfileActive ? 1.0 : 0.7,
                filter: isProfileActive ? 'drop-shadow(0 0 6px rgba(255, 255, 255, 0.65))' : 'none',
                transform: isProfileActive ? 'scale(1.05)' : 'scale(1)'
              }}
            >
              👤
            </span>
            <span 
              className="font-medium transition-all duration-200"
              style={{
                fontSize: '12px',
                color: isProfileActive ? '#FFFFFF' : 'rgba(255, 255, 255, 0.75)',
                fontWeight: isProfileActive ? 600 : 500,
                textShadow: isProfileActive ? '0 0 6px rgba(255, 255, 255, 0.65)' : 'none'
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
                  background: '#F4CC00',
                  boxShadow: '0 0 8px rgba(244, 204, 0, 0.6)'
                }}
              />
            )}
          </button>
        </div>
      </div>
    </nav>
  );
}

