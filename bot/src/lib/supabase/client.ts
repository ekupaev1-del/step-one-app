/**
 * Bot Supabase client using SERVICE_ROLE_KEY
 * 
 * This client bypasses RLS and has full database access.
 * Used by bot services and handlers.
 */

import { createClient } from "@supabase/supabase-js";
import { getBotSupabaseEnv } from "./env";

let botClient: ReturnType<typeof createClient> | null = null;

export function getBotSupabaseClient() {
  if (botClient) {
    return botClient;
  }

  // Use single source of truth env module (validates URL and project ref)
  const env = getBotSupabaseEnv();

  botClient = createClient(env.url, env.serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return botClient;
}

// Export a default instance for convenience
export const supabase = getBotSupabaseClient();
