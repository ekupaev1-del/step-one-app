/**
 * User check utilities with localStorage cache
 * Always re-checks DB, but uses cache for optimization
 */

const CACHE_KEY_TG_USER_ID = "tg_user_id";
const CACHE_KEY_HAS_PROFILE = "has_profile";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  telegramId: number;
  hasProfile: boolean;
  timestamp: number;
}

/**
 * Gets cached user check result
 */
export function getCachedUserCheck(telegramId: number): boolean | null {
  if (typeof window === "undefined") return null;
  
  try {
    const cached = localStorage.getItem(CACHE_KEY_HAS_PROFILE);
    const cachedTgId = localStorage.getItem(CACHE_KEY_TG_USER_ID);
    
    if (cached && cachedTgId) {
      const entry: CacheEntry = JSON.parse(cached);
      const cachedId = Number(cachedTgId);
      
      // Check if cache is for same user and not expired
      if (cachedId === telegramId && (Date.now() - entry.timestamp) < CACHE_TTL_MS) {
        return entry.hasProfile;
      }
    }
  } catch {}
  
  return null;
}

/**
 * Sets cached user check result
 */
export function setCachedUserCheck(telegramId: number, hasProfile: boolean): void {
  if (typeof window === "undefined") return;
  
  try {
    const entry: CacheEntry = {
      telegramId,
      hasProfile,
      timestamp: Date.now(),
    };
    localStorage.setItem(CACHE_KEY_HAS_PROFILE, JSON.stringify(entry));
    localStorage.setItem(CACHE_KEY_TG_USER_ID, String(telegramId));
  } catch {}
}

/**
 * Clears user check cache
 */
export function clearUserCheckCache(): void {
  if (typeof window === "undefined") return;
  
  try {
    localStorage.removeItem(CACHE_KEY_HAS_PROFILE);
    localStorage.removeItem(CACHE_KEY_TG_USER_ID);
  } catch {}
}
