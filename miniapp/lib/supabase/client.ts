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

let clientInstance: ReturnType<typeof createClient> | null = null;

export function getClientSupabaseClient() {
  if (clientInstance) {
    return clientInstance;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing Supabase credentials. Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set in environment variables."
    );
  }

  // Runtime assertion: ensure we're using anon key (not service role)
  if (anonKey.length > 200 || !anonKey.includes("eyJ")) {
    throw new Error(
      "SECURITY ERROR: NEXT_PUBLIC_SUPABASE_ANON_KEY appears to be a service role key. Anon key should be shorter and safe to expose to clients."
    );
  }

  clientInstance = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
    },
  });

  return clientInstance;
}

// Export a default instance for convenience
export const supabase = getClientSupabaseClient();
