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
      "NEXT_PUBLIC_SUPABASE_URL не задан. Добавь его в .env.local или Vercel environment variables."
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

export const createServerSupabaseClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY не заданы. Добавь их в .env.local или Vercel environment variables."
    );
  }

  // ЖЁСТКАЯ ПРОВЕРКА: URL должен быть правильным
  const validatedUrl = validateSupabaseUrl(url);

  // Проверяем тип ключа
  if (serviceKey.length < 200) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY appears to be anon key! Service role key should be 200+ characters long."
    );
  }

  // Логируем при создании клиента (только в dev)
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[supabaseAdmin] Using Supabase URL: ${validatedUrl}`);
    console.log(`[supabaseAdmin] Project ref: ${EXPECTED_PROJECT_REF}`);
  }

  return createClient(validatedUrl, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
};
