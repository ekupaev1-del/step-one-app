"use client";

/**
 * Robust Telegram User ID helper with caching and retry logic
 * Single source of truth for Telegram user identification
 */

const STORAGE_KEY = "tg_user_id";
const RETRY_DELAY_MS = 200;
const MAX_RETRIES = 5;

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
  
  // Retry loop: try up to MAX_RETRIES times
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (tg) {
      // Call ready() on first attempt
      if (attempt === 0 && typeof tg.ready === "function") {
        try {
          tg.ready();
        } catch {}
      }

      // Try initDataUnsafe first (primary source)
      const u = tg.initDataUnsafe?.user;
      if (u?.id && typeof u.id === "number") {
        const userId = u.id;
        // Cache it
        try {
          sessionStorage.setItem(STORAGE_KEY, String(userId));
        } catch {}
        return userId;
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
              const userId = user.id;
              // Cache it
              try {
                sessionStorage.setItem(STORAGE_KEY, String(userId));
              } catch {}
              return userId;
            }
          }
        } catch {}
      }
    }

    // If not found and not last attempt, wait and retry
    if (attempt < MAX_RETRIES - 1) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }

  // Final fallback: URL query params (telegram_id or id)
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const tgId = urlParams.get("telegram_id") || urlParams.get("id");
    if (tgId) {
      const parsed = Number(tgId);
      if (Number.isFinite(parsed) && parsed > 0) {
        // Cache it
        try {
          sessionStorage.setItem(STORAGE_KEY, String(parsed));
        } catch {}
        return parsed;
      }
    }
  } catch {}

  return null;
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
