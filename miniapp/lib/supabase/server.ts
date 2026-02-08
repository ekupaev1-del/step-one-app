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

  // ЖЁСТКАЯ ПРОВЕРКА: URL должен быть правильным
  const validatedUrl = validateSupabaseUrl(url);

  // Runtime assertion: ensure we're not accidentally using anon key
  if (serviceKey.includes("anon") || serviceKey.length < 200) {
    throw new Error(
      "SECURITY ERROR: SUPABASE_SERVICE_ROLE_KEY appears to be an anon key. Service role key should be 200+ characters long and never contain 'anon'."
    );
  }

  // Log connection info (only in dev)
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[supabase/server] Using Supabase URL: ${validatedUrl}`);
    console.log(`[supabase/server] Project ref: ${EXPECTED_PROJECT_REF}`);
    console.log(`[supabase/server] Key type: service_role (${serviceKey.substring(0, 6)}...${serviceKey.slice(-4)})`);
  }

  serverClient = createClient(validatedUrl, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return serverClient;
}

// Export a default instance for convenience
export const supabase = getServerSupabaseClient();
