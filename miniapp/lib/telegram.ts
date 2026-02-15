/**
 * Telegram WebApp utilities
 * Helper functions to work with Telegram WebApp API
 */

export type TgUser = { 
  id: number; 
  username?: string; 
  first_name?: string; 
  last_name?: string;
};

/**
 * Gets current Telegram user from WebApp initDataUnsafe
 * Returns null if not in Telegram WebApp context
 * Includes fallback parser for tgWebAppData from URL hash
 */
export function getTgUser(): TgUser | null {
  if (typeof window === "undefined") return null;
  
  const tg = (window as any).Telegram?.WebApp;
  if (!tg) return null;

  try { 
    tg.ready(); 
  } catch {}

  const u = tg.initDataUnsafe?.user;
  if (u?.id) {
    return { 
      id: u.id, 
      username: u.username, 
      first_name: u.first_name, 
      last_name: u.last_name 
    };
  }

  // fallback: try parse tgWebAppData from location.hash
  const hash = window.location.hash || "";
  if (hash.includes("tgWebAppData=")) {
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const data = params.get("tgWebAppData");
    if (data) {
      try {
        const decoded = decodeURIComponent(data);
        const p = new URLSearchParams(decoded);
        const userStr = p.get("user");
        if (userStr) {
          const user = JSON.parse(userStr);
          if (user?.id) {
            return { 
              id: user.id, 
              username: user.username, 
              first_name: user.first_name, 
              last_name: user.last_name 
            };
          }
        }
      } catch {}
    }
  }

  return null;
}

/**
 * Legacy export for backward compatibility
 */
export function getCurrentTelegramUser() {
  const tgUser = getTgUser();
  if (!tgUser) return null;
  return {
    telegramId: tgUser.id,
    username: tgUser.username,
    firstName: tgUser.first_name,
    lastName: tgUser.last_name,
  };
}

/**
 * Gets Telegram WebApp initData string
 */
export function getTelegramInitData(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const tg = (window as any).Telegram?.WebApp;
  if (!tg) {
    return null;
  }

  return tg.initData || null;
}
