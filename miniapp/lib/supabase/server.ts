/**
 * Server-side Supabase client using SERVICE_ROLE_KEY
 * 
 * WARNING: This client bypasses RLS and has full database access.
 * NEVER expose this key to the client. Only use in:
 * - API routes (/app/api/**)
 * - Server components
 * - Server actions
 * 
 * For client-side code, use ./client.ts instead.
 */

import { createClient } from "@supabase/supabase-js";
import { getServerSupabaseEnv } from "./env";

let serverClient: ReturnType<typeof createClient> | null = null;

export function getServerSupabaseClient() {
  if (serverClient) {
    return serverClient;
  }

  // Use single source of truth env module (validates URL and project ref)
  const env = getServerSupabaseEnv();

  // Use service key if available, otherwise fallback to anon (already handled in env.ts with warning)
  const key = env.serviceKey || env.anonKey;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY is required for server-side Supabase client");
  }

  serverClient = createClient(env.url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return serverClient;
}

// Export a default instance for convenience
export const supabase = getServerSupabaseClient();
