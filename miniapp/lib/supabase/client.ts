/**
 * Client-side Supabase client using ANON_KEY
 * 
 * This client respects RLS policies and is safe to use in:
 * - Client components
 * - Browser code
 * - Any code that runs in the user's browser
 * 
 * For server-side code (API routes, server components), use ./server.ts instead.
 */

import { createClient } from "@supabase/supabase-js";
import { getClientSupabaseEnv } from "./env";

let clientInstance: ReturnType<typeof createClient> | null = null;

export function getBrowserSupabaseClient() {
  if (clientInstance) {
    return clientInstance;
  }

  // Use single source of truth env module (validates URL and project ref)
  const env = getClientSupabaseEnv();

  if (!env.anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is required for client-side Supabase client");
  }

  clientInstance = createClient(env.url, env.anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
    },
  });

  return clientInstance;
}

// Legacy export name for compatibility
export const getClientSupabaseClient = getBrowserSupabaseClient;

// Export a default instance for convenience
export const supabase = getBrowserSupabaseClient();
