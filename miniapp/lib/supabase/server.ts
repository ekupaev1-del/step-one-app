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
import { getSupabaseServerConfig, logSupabaseConfig } from "../../../lib/supabase-config";

let serverClient: ReturnType<typeof createClient> | null = null;

export function getServerSupabaseClient() {
  if (serverClient) {
    return serverClient;
  }

  // Use shared config module (single source of truth)
  const config = getSupabaseServerConfig();
  
  // Log connection info (safe, no secrets)
  logSupabaseConfig(config, 'supabase/server');

  serverClient = createClient(config.url, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return serverClient;
}

// Export a default instance for convenience
export const supabase = getServerSupabaseClient();
