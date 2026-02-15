"use client";

/**
 * Robust Telegram User ID helper with caching
 * Single source of truth for Telegram user identification
 */

const STORAGE_KEY = "tg_user_id";
const RETRY_DELAY_MS = 150;

/**
 * Gets Telegram user ID from WebApp with retry logic
 * Caches result in sessionStorage
 */
export async function getTelegramUserIdAsync(): Promise<number | null> {
  if (typeof window === "undefined") return null;

  // Check cache first
  try {
    const cached = sessionStorage.getItem(STORAGE_KEY);
    if (cached) {
      const parsed = Number(cached);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
  } catch {}

  const tg = (window as any).Telegram?.WebApp;
  if (!tg) return null;

  // Try to initialize if not ready
  if (typeof tg.ready === "function") {
    try {
      tg.ready();
    } catch {}
  }

  // Try initDataUnsafe first (primary source)
  let userId: number | null = null;
  const u = tg.initDataUnsafe?.user;
  if (u?.id && typeof u.id === "number") {
    userId = u.id;
  } else {
    // Fallback: try parsing from initData querystring
    const initData = tg.initData;
    if (initData && typeof initData === "string") {
      try {
        const params = new URLSearchParams(initData);
        const userStr = params.get("user");
        if (userStr) {
          const user = JSON.parse(userStr);
          if (user?.id && typeof user.id === "number") {
            userId = user.id;
          }
        }
      } catch {}
    }
  }

  // If still not found, retry once after delay
  if (!userId) {
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    
    const u2 = tg.initDataUnsafe?.user;
    if (u2?.id && typeof u2.id === "number") {
      userId = u2.id;
    }
  }

  // Cache if found
  if (userId) {
    try {
      sessionStorage.setItem(STORAGE_KEY, String(userId));
    } catch {}
  }

  return userId;
}

/**
 * Synchronous version (uses cache or immediate check)
 * Returns null if not available yet (doesn't throw)
 */
export function getTelegramUserIdSync(): number | null {
  if (typeof window === "undefined") return null;

  // Check cache first
  try {
    const cached = sessionStorage.getItem(STORAGE_KEY);
    if (cached) {
      const parsed = Number(cached);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
  } catch {}

  const tg = (window as any).Telegram?.WebApp;
  if (!tg) return null;

  const u = tg.initDataUnsafe?.user;
  if (u?.id && typeof u.id === "number") {
    // Cache it
    try {
      sessionStorage.setItem(STORAGE_KEY, String(u.id));
    } catch {}
    return u.id;
  }

  return null;
}
