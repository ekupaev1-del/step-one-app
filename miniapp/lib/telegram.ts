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

// Initialize Telegram WebApp once on app start
let telegramWebAppInitialized = false;

/**
 * Initializes Telegram WebApp (call once on app start)
 */
export function initTelegramWebApp(): void {
  if (typeof window === "undefined" || telegramWebAppInitialized) return;
  
  const tg = (window as any).Telegram?.WebApp;
  if (tg && typeof tg.ready === "function") {
    try {
      tg.ready();
      telegramWebAppInitialized = true;
    } catch {}
  }
}

/**
 * Gets Telegram user ID from WebApp
 * Single source of truth for Telegram user identification
 * Returns number or null
 */
export function getTelegramUserId(): number | null {
  if (typeof window === "undefined") return null;
  
  const tg = (window as any).Telegram?.WebApp;
  if (!tg) return null;

  // Try initDataUnsafe first (primary source)
  const u = tg.initDataUnsafe?.user;
  if (u?.id && typeof u.id === "number") {
    return u.id;
  }

  // Fallback: try parsing from initData querystring
  const initData = tg.initData;
  if (initData && typeof initData === "string") {
    try {
      const params = new URLSearchParams(initData);
      const userStr = params.get("user");
      if (userStr) {
        const user = JSON.parse(userStr);
        if (user?.id && typeof user.id === "number") {
          return user.id;
        }
      }
    } catch {}
  }

  // Fallback: try parse tgWebAppData from location.hash
  const hash = window.location.hash || "";
  if (hash.includes("tgWebAppData=")) {
    try {
      const params = new URLSearchParams(hash.replace(/^#/, ""));
      const data = params.get("tgWebAppData");
      if (data) {
        const decoded = decodeURIComponent(data);
        const p = new URLSearchParams(decoded);
        const userStr = p.get("user");
        if (userStr) {
          const user = JSON.parse(userStr);
          if (user?.id && typeof user.id === "number") {
            return user.id;
          }
        }
      }
    } catch {}
  }

  return null;
}

/**
 * Gets current Telegram user from WebApp initDataUnsafe
 * Returns null if not in Telegram WebApp context
 * Includes fallback parser for tgWebAppData from URL hash
 */
export function getTgUser(): TgUser | null {
  if (typeof window === "undefined") return null;
  
  const tg = (window as any).Telegram?.WebApp;
  if (!tg) return null;

  const userId = getTelegramUserId();
  if (!userId) return null;

  const u = tg.initDataUnsafe?.user;
  if (u) {
    return { 
      id: userId, 
      username: u.username, 
      first_name: u.first_name, 
      last_name: u.last_name 
    };
  }

  return { id: userId };
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
