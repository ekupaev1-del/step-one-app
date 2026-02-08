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

// ПРАВИЛЬНЫЙ Supabase Project URL (из Dashboard → API Settings)
const EXPECTED_SUPABASE_URL = "https://ipgxnqplwzptxyfjjsrr.supabase.co";
const EXPECTED_PROJECT_REF = "ipgxnqplwzptxyfjjsrr";

/**
 * Extracts project reference from Supabase URL
 */
function extractProjectRef(url: string): string | null {
  try {
    const match = url.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Validates Supabase URL matches expected project
 */
function validateSupabaseUrl(url: string | undefined): string {
  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL is not set. Set it in Vercel environment variables."
    );
  }

  // Normalize URL (remove trailing slash)
  const normalizedUrl = url.trim().replace(/\/$/, '');
  const projectRef = extractProjectRef(normalizedUrl);

  if (normalizedUrl !== EXPECTED_SUPABASE_URL) {
    console.error("❌ CRITICAL: Wrong Supabase project URL!");
    console.error(`   Current:  ${normalizedUrl}`);
    console.error(`   Expected: ${EXPECTED_SUPABASE_URL}`);
    console.error(`   Project ref: ${projectRef || 'UNKNOWN'} (expected: ${EXPECTED_PROJECT_REF})`);
    throw new Error(
      `Wrong Supabase project URL. Current: ${normalizedUrl}, Expected: ${EXPECTED_SUPABASE_URL}. ` +
      `Update NEXT_PUBLIC_SUPABASE_URL in Vercel environment variables.`
    );
  }

  return normalizedUrl;
}

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

  // ЖЁСТКАЯ ПРОВЕРКА: URL должен быть правильным
  const validatedUrl = validateSupabaseUrl(url);

  // Runtime assertion: ensure we're using anon key (not service role)
  if (anonKey.length > 200 || !anonKey.includes("eyJ")) {
    throw new Error(
      "SECURITY ERROR: NEXT_PUBLIC_SUPABASE_ANON_KEY appears to be a service role key. Anon key should be shorter and safe to expose to clients."
    );
  }

  clientInstance = createClient(validatedUrl, anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
    },
  });

  return clientInstance;
}

// Export a default instance for convenience
export const supabase = getClientSupabaseClient();
