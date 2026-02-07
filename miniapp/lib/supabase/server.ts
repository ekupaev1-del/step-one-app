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

let serverClient: ReturnType<typeof createClient> | null = null;

export function getServerSupabaseClient() {
  if (serverClient) {
    return serverClient;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing Supabase credentials. Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in environment variables."
    );
  }

  // Runtime assertion: ensure we're not accidentally using anon key
  if (serviceKey.includes("anon") || serviceKey.length < 100) {
    throw new Error(
      "SECURITY ERROR: SUPABASE_SERVICE_ROLE_KEY appears to be an anon key. Service role key should be much longer and never contain 'anon'."
    );
  }

  serverClient = createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return serverClient;
}

// Export a default instance for convenience
export const supabase = getServerSupabaseClient();
