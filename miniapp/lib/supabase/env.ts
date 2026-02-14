/**
 * Single source of truth for Supabase environment configuration in miniapp
 * 
 * Validates SUPABASE_URL
 * Provides safe diagnostics (never logs full keys)
 */

export interface SupabaseEnvConfig {
  url: string;
  anonKey?: string;
  serviceKey?: string;
  projectRef: string;
  envName: string;
}

/**
 * Extracts project reference from Supabase URL
 */
function extractProjectRef(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return hostname.split('.')[0];
  } catch {
    return "";
  }
}

/**
 * Detects key type from JWT payload role
 */
function detectKeyType(key: string): 'service_role' | 'anon' | 'unknown' {
  if (!key) return 'unknown';
  
  // Try to decode JWT payload to check role
  try {
    const parts = key.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      if (payload.role === 'service_role') return 'service_role';
      if (payload.role === 'anon') return 'anon';
    }
  } catch {
    // Fallback to length-based detection
  }
  
  // Fallback: length-based detection
  if (key.length > 200) return 'service_role';
  if (key.length > 100 && key.length < 200) return 'anon';
  return 'unknown';
}

/**
 * Gets last 6 characters of key for safe logging
 */
function getKeySuffix(key: string): string {
  if (!key || key.length < 6) return '***';
  return key.slice(-6);
}

/**
 * Detects environment name for diagnostics
 */
function getEnvName(): string {
  if (process.env.VERCEL_ENV === 'production') return 'prod';
  if (process.env.VERCEL_ENV === 'preview') return 'preview';
  if (process.env.NODE_ENV === 'production') return 'prod';
  if (process.env.NODE_ENV === 'development') return 'local';
  return 'unknown';
}

/**
 * Validates and returns Supabase configuration for server-side use
 */
export function getServerSupabaseEnv(): SupabaseEnvConfig {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  let serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) {
    throw new Error(
      `❌ CRITICAL: SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL is not set!\n` +
      `   Set SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL in Vercel environment variables.`
    );
  }

  // Fallback to anon key if service role key is not available (with warning)
  if (!serviceKey) {
    if (anonKey) {
      console.warn(
        `⚠️  WARNING: SUPABASE_SERVICE_ROLE_KEY is not set, falling back to anon key.\n` +
        `   This may cause RLS policy issues. Set SUPABASE_SERVICE_ROLE_KEY in Vercel.`
      );
      serviceKey = anonKey;
    } else {
      throw new Error(
        `❌ CRITICAL: SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY is not set!\n` +
        `   Set at least one of them in Vercel environment variables.`
      );
    }
  }

  // Normalize URL (remove trailing slash) and trim keys (remove quotes/spaces)
  const normalizedUrl = url.trim().replace(/\/$/, '');
  const trimmedServiceKey = serviceKey.trim();
  const projectRef = extractProjectRef(normalizedUrl);

  if (!projectRef) {
    throw new Error(
      `❌ CRITICAL: Invalid Supabase URL format: ${normalizedUrl}\n` +
      `   Expected format: https://<project-ref>.supabase.co`
    );
  }

  const keyType = detectKeyType(trimmedServiceKey);
  const keySuffix = getKeySuffix(trimmedServiceKey);
  const envName = getEnvName();
  const nodeEnv = process.env.NODE_ENV || 'not_set';
  const vercelEnv = process.env.VERCEL_ENV;

  // Log diagnostics (safe: no full keys)
  console.log(
    `[SUPABASE] url=${normalizedUrl} project=${projectRef} keyRole=${keyType} keySuffix=${keySuffix} env=${vercelEnv || nodeEnv}`
  );

  return {
    url: normalizedUrl,
    serviceKey: trimmedServiceKey,
    projectRef,
    envName,
  };
}

/**
 * Validates and returns Supabase configuration for client-side use
 */
export function getClientSupabaseEnv(): SupabaseEnvConfig {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) {
    throw new Error(
      `❌ CRITICAL: NEXT_PUBLIC_SUPABASE_URL is not set!\n` +
      `   Set NEXT_PUBLIC_SUPABASE_URL in Vercel environment variables.`
    );
  }

  if (!anonKey) {
    throw new Error(
      `❌ CRITICAL: NEXT_PUBLIC_SUPABASE_ANON_KEY is not set!\n` +
      `   Set NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel environment variables.`
    );
  }

  // Normalize URL (remove trailing slash) and trim key (remove quotes/spaces)
  const normalizedUrl = url.trim().replace(/\/$/, '');
  const trimmedAnonKey = anonKey.trim();
  const projectRef = extractProjectRef(normalizedUrl);

  if (!projectRef) {
    throw new Error(
      `❌ CRITICAL: Invalid Supabase URL format: ${normalizedUrl}\n` +
      `   Expected format: https://<project-ref>.supabase.co`
    );
  }

  const keyType = detectKeyType(trimmedAnonKey);
  const keySuffix = getKeySuffix(trimmedAnonKey);
  const envName = getEnvName();
  const nodeEnv = process.env.NODE_ENV || 'not_set';
  const vercelEnv = process.env.VERCEL_ENV;

  // Log diagnostics only in dev (client-side)
  if (process.env.NODE_ENV !== 'production') {
    console.log(
      `[SUPABASE] url=${normalizedUrl} project=${projectRef} keyRole=${keyType} keySuffix=${keySuffix} env=${vercelEnv || nodeEnv}`
    );
  }

  return {
    url: normalizedUrl,
    anonKey: trimmedAnonKey,
    projectRef,
    envName,
  };
}
