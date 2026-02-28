/**
 * User profile utilities
 * Functions to fetch and manage user profile from Supabase
 */

import { getBrowserSupabaseClient } from "./supabase/client";
import type { UserRow } from "./types";

export interface UserProfile {
  id: number;
  telegram_id: number;
  name: string | null;
  calories: number | null;
  privacy_accepted: boolean;
  terms_accepted: boolean;
  [key: string]: any;
}

/**
 * Fetches user profile from Supabase by telegram_id
 * Returns null if user doesn't exist (0 rows)
 * Throws error only if query fails (not for 0 rows)
 * 
 * This is the single source of truth for checking if user exists.
 * Use this on every protected page to gate access.
 */
export async function fetchUserByTelegramId(telegramId: number): Promise<UserProfile | null> {
  if (process.env.NODE_ENV === "development") {
    console.log("[fetchUserByTelegramId] Fetching user for telegram_id:", telegramId);
  }

  if (!Number.isFinite(telegramId) || telegramId <= 0) {
    console.error("[fetchUserByTelegramId] Invalid telegram_id:", telegramId);
    return null;
  }

  const supabase = getBrowserSupabaseClient();

  // Use .maybeSingle() to handle 0 rows as null (not throw)
  // Explicitly type the result to avoid "never" errors
  const { data: user, error } = await supabase
    .from("users")
    .select("*")
    .eq("telegram_id", telegramId)
    .maybeSingle<UserRow>();

  if (error) {
    // Only throw if it's a real error, not "no rows found"
    if (error.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error("[fetchUserByTelegramId] Supabase error:", error);
      throw new Error(`Database error: ${error.message}`);
    }
    // PGRST116 means no rows found - this is expected, return null
    if (process.env.NODE_ENV === "development") {
      console.log("[fetchUserByTelegramId] User not found (0 rows) for telegram_id:", telegramId);
    }
    return null;
  }

  // Type guard: ensure user has required fields
  if (user && typeof user.id === 'number' && user.telegram_id) {
    if (process.env.NODE_ENV === "development") {
      console.log("[fetchUserByTelegramId] User exists:", { id: user.id, telegram_id: user.telegram_id });
    }
    return {
      id: user.id,
      telegram_id: user.telegram_id,
      name: user.name,
      calories: user.calories,
      privacy_accepted: user.privacy_accepted ?? false,
      terms_accepted: user.terms_accepted ?? false,
    } as UserProfile;
  }

  if (process.env.NODE_ENV === "development") {
    console.log("[fetchUserByTelegramId] User not found for telegram_id:", telegramId);
  }

  return null;
}

/**
 * Legacy export for backward compatibility
 * @deprecated Use fetchUserByTelegramId instead
 */
export const fetchUserProfile = fetchUserByTelegramId;
