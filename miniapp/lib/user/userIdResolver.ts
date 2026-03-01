"use client";

/**
 * User ID Resolver - Single source of truth for userId in WebApp
 * 
 * Priority:
 * 1. URL query param ?id=
 * 2. localStorage (stepone_user_id)
 * 3. null (fallback to telegram_id lookup)
 * 
 * When userId is found in URL, it's automatically saved to localStorage.
 */

const STORAGE_KEY = "stepone_user_id";

/**
 * Resolves userId from URL query params or localStorage
 * If found in URL, saves to localStorage for persistence
 */
export function resolveUserId(): number | null {
  if (typeof window === "undefined") return null;

  // Priority 1: URL query param
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const urlId = urlParams.get("id");
    if (urlId) {
      const parsed = Number(urlId);
      if (Number.isFinite(parsed) && parsed > 0) {
        // Save to localStorage for future navigation
        try {
          localStorage.setItem(STORAGE_KEY, String(parsed));
        } catch (e) {
          // Ignore localStorage errors (private mode, etc.)
        }
        return parsed;
      }
    }
  } catch (e) {
    // Ignore URL parsing errors
  }

  // Priority 2: localStorage
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = Number(stored);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
  } catch (e) {
    // Ignore localStorage errors
  }

  return null;
}

/**
 * Clears stored userId from localStorage
 */
export function clearUserId(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    // Ignore errors
  }
}

/**
 * Sets userId in localStorage (for manual updates)
 */
export function setUserId(userId: number | null): void {
  if (typeof window === "undefined") return;
  try {
    if (userId && Number.isFinite(userId) && userId > 0) {
      localStorage.setItem(STORAGE_KEY, String(userId));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch (e) {
    // Ignore errors
  }
}
