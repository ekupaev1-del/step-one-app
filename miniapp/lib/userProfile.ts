/**
 * User profile utilities
 * Functions to fetch and manage user profile from Supabase
 */

import { getBrowserSupabaseClient } from "./supabase/client";

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
 * Returns null if user doesn't exist
 * Throws error if query fails
 */
export async function fetchUserProfile(telegramId: number): Promise<UserProfile | null> {
  if (process.env.NODE_ENV === "development") {
    console.log("[fetchUserProfile] Fetching user profile for telegram_id:", telegramId);
  }

  const supabase = getBrowserSupabaseClient();

  const { data: user, error } = await supabase
    .from("users")
    .select("*")
    .eq("telegram_id", telegramId)
    .maybeSingle();

  if (error) {
    console.error("[fetchUserProfile] Supabase error:", error);
    throw new Error(`Database error: ${error.message}`);
  }

  if (user) {
    if (process.env.NODE_ENV === "development") {
      console.log("[fetchUserProfile] User exists:", { id: user.id, telegram_id: user.telegram_id });
    }
    return user as UserProfile;
  }

  if (process.env.NODE_ENV === "development") {
    console.log("[fetchUserProfile] User not found for telegram_id:", telegramId);
  }

  return null;
}
