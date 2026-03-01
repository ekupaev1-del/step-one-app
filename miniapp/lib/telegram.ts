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
 * Gets Telegram user ID from WebApp with retry logic
 * Single source of truth for Telegram user identification
 * 
 * Priority:
 * 1. window.Telegram?.WebApp?.initDataUnsafe?.user?.id (primary)
 * 2. Parse initData query string from window.Telegram.WebApp.initData
 * 3. URL query params (?telegram_id= or ?tg_user_id=) as fallback (set by bot)
 * 
 * Returns number or null
 */
export function getTelegramUserId(): number | null {
  if (typeof window === "undefined") return null;
  
  const tg = (window as any).Telegram?.WebApp;
  
  // Primary source: Telegram WebApp initDataUnsafe
  if (tg) {
    // Try to initialize if not ready
    if (typeof tg.ready === "function") {
      try {
        tg.ready();
      } catch {}
    }

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
  }

  // Fallback: parse URL query params (telegram_id or tg_user_id) - set by bot
  // This is the fallback when Telegram WebApp initData is missing
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const tgId = urlParams.get("telegram_id") || urlParams.get("tg_user_id");
    if (tgId) {
      const parsed = Number(tgId);
      if (Number.isFinite(parsed) && parsed > 0) {
        console.log("[getTelegramUserId] Using URL query param fallback (telegram_id):", tgId);
        return parsed;
      }
    }
  } catch {}

  return null;
}

/**
 * Async version with retry logic (5 tries, 200ms delay)
 * Use this when you need to wait for Telegram WebApp to initialize
 */
export async function getTelegramUserIdAsync(): Promise<number | null> {
  if (typeof window === "undefined") return null;

  const MAX_RETRIES = 5;
  const RETRY_DELAY_MS = 200;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const tg = (window as any).Telegram?.WebApp;
    
    if (tg) {
      // Call ready() on first attempt
      if (attempt === 0 && typeof tg.ready === "function") {
        try {
          tg.ready();
        } catch {}
      }

      // Try initDataUnsafe first
      const u = tg.initDataUnsafe?.user;
      if (u?.id && typeof u.id === "number") {
        return u.id;
      }

      // Try parsing from initData
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
    }

    // If not found and not last attempt, wait and retry
    if (attempt < MAX_RETRIES - 1) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }

  // Final fallback: URL query params
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const tgId = urlParams.get("telegram_id") || urlParams.get("id");
    if (tgId) {
      const parsed = Number(tgId);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
  } catch {}

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

/**
 * Gets diagnostics about Telegram WebApp availability
 * Useful for error messages and debugging
 */
export function getTelegramDiagnostics(): {
  hasWebApp: boolean;
  hasInitDataUnsafe: boolean;
  hasUser: boolean;
  telegramId: number | null;
  env: {
    nodeEnv: string;
    hasNextPublicSupabaseUrl: boolean;
  };
} {
  if (typeof window === "undefined") {
    return {
      hasWebApp: false,
      hasInitDataUnsafe: false,
      hasUser: false,
      telegramId: null,
      env: {
        nodeEnv: process.env.NODE_ENV || "unknown",
        hasNextPublicSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      },
    };
  }

  const tg = (window as any).Telegram?.WebApp;
  const hasWebApp = !!tg;
  const hasInitDataUnsafe = !!tg?.initDataUnsafe;
  const hasUser = !!tg?.initDataUnsafe?.user;
  const telegramId = getTelegramUserId();

  return {
    hasWebApp,
    hasInitDataUnsafe,
    hasUser,
    telegramId,
    env: {
      nodeEnv: process.env.NODE_ENV || "unknown",
      hasNextPublicSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    },
  };
}
