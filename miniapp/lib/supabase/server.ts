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

  if (!env.serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for server-side Supabase client");
  }

  serverClient = createClient(env.url, env.serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return serverClient;
}

// Export a default instance for convenience
export const supabase = getServerSupabaseClient();
