/**
 * Single source of truth for Supabase environment configuration in bot
 * 
 * Validates SUPABASE_URL
 * Provides safe diagnostics (never logs full keys)
 */

export interface SupabaseEnvConfig {
  url: string;
  serviceKey: string;
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
  if (process.env.NODE_ENV === 'production') return 'prod';
  if (process.env.NODE_ENV === 'development') return 'local';
  return 'unknown';
}

/**
 * Validates and returns Supabase configuration for bot use
 */
export function getBotSupabaseEnv(): SupabaseEnvConfig {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error(
      `❌ CRITICAL: SUPABASE_URL is not set!\n` +
      `   Set SUPABASE_URL in bot/.env file.`
    );
  }

  if (!serviceKey) {
    throw new Error(
      `❌ CRITICAL: SUPABASE_SERVICE_ROLE_KEY is not set!\n` +
      `   Set SUPABASE_SERVICE_ROLE_KEY in bot/.env file.`
    );
  }

  // Normalize URL
  const normalizedUrl = url.trim().replace(/\/$/, '');
  const projectRef = extractProjectRef(normalizedUrl);

  if (!projectRef) {
    throw new Error(
      `❌ CRITICAL: Invalid Supabase URL format: ${normalizedUrl}\n` +
      `   Expected format: https://<project-ref>.supabase.co`
    );
  }

  const keyType = detectKeyType(serviceKey);
  const keySuffix = getKeySuffix(serviceKey);
  const envName = getEnvName();
  const nodeEnv = process.env.NODE_ENV || 'not_set';
  const vercelEnv = process.env.VERCEL_ENV;

  // Log diagnostics (safe: no full keys)
  console.log(
    `[SUPABASE] url=${normalizedUrl} project=${projectRef} keyRole=${keyType} keySuffix=${keySuffix} env=${vercelEnv || nodeEnv}`
  );

  return {
    url: normalizedUrl,
    serviceKey,
    projectRef,
    envName,
  };
}
