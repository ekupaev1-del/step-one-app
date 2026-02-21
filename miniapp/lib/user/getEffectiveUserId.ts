"use client";

import { getTelegramUserIdAsync } from "../telegram/getTelegramUserId";
import { getBrowserSupabaseClient } from "../supabase/client";

const USER_ID_CACHE_KEY = "user_id";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  userId: number;
  timestamp: number;
}

/**
 * Gets effective user ID with priority:
 * 1. Query param `id` (numeric) - highest priority (stable fallback)
 * 2. Telegram ID -> lookup user by telegram_id in Supabase -> return users.id
 * 
 * Caches resolved users.id in localStorage
 */
export async function getEffectiveUserId(
  queryId: string | null
): Promise<{ userId: number | null; source: "query" | "telegram" | "cache" | null }> {
  // Priority 1: Query param `id` if present and valid
  if (queryId) {
    const parsed = Number(queryId);
    if (Number.isFinite(parsed) && parsed > 0) {
      // Cache it
      try {
        const entry: CacheEntry = { userId: parsed, timestamp: Date.now() };
        localStorage.setItem(USER_ID_CACHE_KEY, JSON.stringify(entry));
      } catch {}
      return { userId: parsed, source: "query" };
    }
  }

  // Priority 2: Check cache first
  try {
    const cached = localStorage.getItem(USER_ID_CACHE_KEY);
    if (cached) {
      const entry: CacheEntry = JSON.parse(cached);
      if (Date.now() - entry.timestamp < CACHE_TTL_MS) {
        return { userId: entry.userId, source: "cache" };
      }
    }
  } catch {}

  // Priority 3: Telegram ID -> lookup in Supabase
  const telegramId = await getTelegramUserIdAsync();
  if (telegramId) {
    try {
      const supabase = getBrowserSupabaseClient();
      const { data: user, error } = await supabase
        .from("users")
        .select("id")
        .eq("telegram_id", telegramId)
        .maybeSingle();

      if (!error && user) {
        const userId = (user as { id: number }).id;
        if (userId) {
          // Cache resolved user ID
          try {
            const entry: CacheEntry = { userId, timestamp: Date.now() };
            localStorage.setItem(USER_ID_CACHE_KEY, JSON.stringify(entry));
          } catch {}
          return { userId, source: "telegram" };
        }
      }
    } catch (err) {
      console.error("[getEffectiveUserId] Error looking up user by telegram_id:", err);
    }
  }

  return { userId: null, source: null };
}

/**
 * Clears user ID cache
 */
export function clearUserIdCache(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(USER_ID_CACHE_KEY);
    sessionStorage.removeItem("tg_user_id");
  } catch {}
}
