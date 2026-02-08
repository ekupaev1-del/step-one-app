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
// @ts-ignore - root lib is outside miniapp scope, use relative import
import { getSupabaseClientConfig, logSupabaseConfig } from "../../../lib/supabase-config";

let clientInstance: ReturnType<typeof createClient> | null = null;

export function getClientSupabaseClient() {
  if (clientInstance) {
    return clientInstance;
  }

  // Use shared config module (single source of truth)
  const config = getSupabaseClientConfig();
  
  // Log connection info (safe, no secrets) - only in dev
  if (process.env.NODE_ENV !== 'production') {
    logSupabaseConfig(config, 'supabase/client');
  }

  clientInstance = createClient(config.url, config.anonKey!, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
    },
  });

  return clientInstance;
}

// Export a default instance for convenience
export const supabase = getClientSupabaseClient();
