/**
 * Single source of truth for Supabase configuration
 * Used by both bot and miniapp
 * 
 * IMPORTANT: Never print full secrets. Only show safe diagnostics.
 */

// Get expected project ref from environment variable
// If not set, extract from SUPABASE_URL or use fallback
function getExpectedProjectRef(): string {
  const fromEnv = process.env.EXPECTED_SUPABASE_PROJECT_REF;
  if (fromEnv) {
    return fromEnv.trim();
  }
  
  // Fallback: try to extract from SUPABASE_URL
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (url) {
    const extracted = extractProjectRef(url);
    if (extracted) {
      return extracted;
    }
  }
  
  // Last resort: use the known correct project ref
  return "ipgxnqplwzptxyfjjssrr";
}

const EXPECTED_PROJECT_REF = getExpectedProjectRef();

// Build expected URL from project ref
const EXPECTED_SUPABASE_URL = `https://${EXPECTED_PROJECT_REF}.supabase.co`;

// WRONG project URL that should be rejected (legacy)
const WRONG_PROJECT_REF = "ppisnuivnswwpkoxwpef";

export interface SupabaseConfig {
  url: string;
  projectRef: string;
  serviceRoleKey: string;
  anonKey?: string;
  keyType: 'service_role' | 'anon' | 'unknown';
  keySuffix: string; // Last 6 chars for safe logging
  environment: 'production' | 'preview' | 'development' | 'local' | 'unknown';
  nodeEnv: string;
  vercelEnv?: string;
}

/**
 * Extracts project reference from Supabase URL
 */
export function extractProjectRef(url: string): string | null {
  try {
    const match = url.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Detects key type from length and structure
 */
function detectKeyType(key: string): 'service_role' | 'anon' | 'unknown' {
  if (!key) return 'unknown';
  // Service role keys are typically 200+ chars, anon keys are ~100-150
  if (key.length > 200) return 'service_role';
  if (key.length > 100 && key.length < 200) return 'anon';
  return 'unknown';
}

/**
 * Masks a secret key for safe logging (first 6 + ... + last 4 chars)
 */
function maskKey(key: string): string {
  if (!key || key.length < 10) return '***';
  if (key.length <= 10) return key.substring(0, 6) + '***';
  return key.substring(0, 6) + '...' + key.slice(-4);
}

/**
 * Detects runtime environment
 */
function detectEnvironment(): 'production' | 'preview' | 'development' | 'local' | 'unknown' {
  const vercelEnv = process.env.VERCEL_ENV;
  const nodeEnv = process.env.NODE_ENV;
  
  if (vercelEnv === 'production') return 'production';
  if (vercelEnv === 'preview') return 'preview';
  if (vercelEnv === 'development') return 'development';
  if (nodeEnv === 'production') return 'production';
  if (nodeEnv === 'development') return 'development';
  if (!vercelEnv && !nodeEnv) return 'local';
  return 'unknown';
}

/**
 * Validates Supabase URL matches expected project
 * Throws with clear error message if wrong project detected
 */
function validateSupabaseUrl(url: string | undefined, envVarName: string): string {
  if (!url) {
    throw new Error(
      `❌ CRITICAL: ${envVarName} is not set!\n` +
      `   Set ${envVarName} in .env file or environment variables.\n` +
      `   Expected: ${EXPECTED_SUPABASE_URL}`
    );
  }

  // Normalize URL (remove trailing slash)
  const normalizedUrl = url.trim().replace(/\/$/, '');
  const projectRef = extractProjectRef(normalizedUrl);

  // GUARD: Reject wrong project URL
  if (projectRef === WRONG_PROJECT_REF) {
    throw new Error(
      `❌ CRITICAL: Wrong Supabase project detected!\n` +
      `   Current URL points to OLD project: ${normalizedUrl}\n` +
      `   Project ref: ${WRONG_PROJECT_REF}\n` +
      `   Expected project ref: ${EXPECTED_PROJECT_REF}\n` +
      `   \n` +
      `   Fix: Update ${envVarName} to point to the correct project:\n` +
      `   ${envVarName}=${EXPECTED_SUPABASE_URL}\n` +
      `   \n` +
      `   Get the correct URL from Supabase Dashboard → Settings → API → Project URL`
    );
  }

  // Validate project ref matches expected (from EXPECTED_SUPABASE_PROJECT_REF env var)
  // NOTE: EXPECTED_SUPABASE_PROJECT_REF is optional and only used for validation/warning
  // If EXPECTED_SUPABASE_PROJECT_REF is set, log a warning if mismatch, but don't fail
  // This allows switching Supabase projects without blocking startup
  if (process.env.EXPECTED_SUPABASE_PROJECT_REF && projectRef !== EXPECTED_PROJECT_REF) {
    console.warn(
      `⚠️  WARNING: Supabase project ref mismatch (non-fatal):\n` +
      `   Current URL:  ${normalizedUrl}\n` +
      `   Current project ref: ${projectRef || 'UNKNOWN'}\n` +
      `   Expected project ref (from env): ${EXPECTED_PROJECT_REF}\n` +
      `   Continuing with current project ref...\n` +
      `   To silence this warning, remove EXPECTED_SUPABASE_PROJECT_REF or update it to match current project.`
    );
  }

  return normalizedUrl;
}

/**
 * Gets Supabase configuration for server-side use (service_role key)
 * Used by bot and miniapp API routes
 */
export function getSupabaseServerConfig(): SupabaseConfig {
  // Bot uses SUPABASE_URL, miniapp uses NEXT_PUBLIC_SUPABASE_URL
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const envVarName = process.env.SUPABASE_URL ? 'SUPABASE_URL' : 'NEXT_PUBLIC_SUPABASE_URL';

  if (!url) {
    throw new Error(
      `❌ CRITICAL: Supabase URL is not set!\n` +
      `   Set SUPABASE_URL (for bot) or NEXT_PUBLIC_SUPABASE_URL (for miniapp) in environment variables.\n` +
      `   Expected: ${EXPECTED_SUPABASE_URL}`
    );
  }

  if (!serviceKey) {
    throw new Error(
      `❌ CRITICAL: SUPABASE_SERVICE_ROLE_KEY is not set!\n` +
      `   Get it from Supabase Dashboard → Settings → API → service_role key`
    );
  }

  // Validate URL
  const validatedUrl = validateSupabaseUrl(url, envVarName);
  const projectRef = extractProjectRef(validatedUrl)!;

  // Validate key type
  if (serviceKey.length < 200 || serviceKey.includes('anon')) {
    throw new Error(
      `❌ SECURITY ERROR: SUPABASE_SERVICE_ROLE_KEY appears to be an anon key!\n` +
      `   Service role key should be 200+ characters long and never contain 'anon'.\n` +
      `   Get the correct key from Supabase Dashboard → Settings → API → service_role key`
    );
  }

  const keyType = detectKeyType(serviceKey);
  const keySuffix = maskKey(serviceKey);
  const environment = detectEnvironment();

  return {
    url: validatedUrl,
    projectRef,
    serviceRoleKey: serviceKey,
    keyType,
    keySuffix,
    environment,
    nodeEnv: process.env.NODE_ENV || 'not_set',
    vercelEnv: process.env.VERCEL_ENV,
  };
}

/**
 * Gets Supabase configuration for client-side use (anon key)
 * Used by miniapp client components
 */
export function getSupabaseClientConfig(): SupabaseConfig {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) {
    throw new Error(
      `❌ CRITICAL: NEXT_PUBLIC_SUPABASE_URL is not set!\n` +
      `   Set it in Vercel environment variables.\n` +
      `   Expected: ${EXPECTED_SUPABASE_URL}`
    );
  }

  if (!anonKey) {
    throw new Error(
      `❌ CRITICAL: NEXT_PUBLIC_SUPABASE_ANON_KEY is not set!\n` +
      `   Get it from Supabase Dashboard → Settings → API → anon public key`
    );
  }

  // Validate URL
  const validatedUrl = validateSupabaseUrl(url, 'NEXT_PUBLIC_SUPABASE_URL');
  const projectRef = extractProjectRef(validatedUrl)!;

  // Validate key type
  if (anonKey.length > 200 || !anonKey.includes('eyJ')) {
    throw new Error(
      `❌ SECURITY ERROR: NEXT_PUBLIC_SUPABASE_ANON_KEY appears to be a service role key!\n` +
      `   Anon key should be shorter (~100-150 chars) and safe to expose to clients.\n` +
      `   Get the correct key from Supabase Dashboard → Settings → API → anon public key`
    );
  }

  const keyType = detectKeyType(anonKey);
  const keySuffix = maskKey(anonKey);
  const environment = detectEnvironment();

  return {
    url: validatedUrl,
    projectRef,
    anonKey,
    serviceRoleKey: '', // Not used for client
    keyType,
    keySuffix,
    environment,
    nodeEnv: process.env.NODE_ENV || 'not_set',
    vercelEnv: process.env.VERCEL_ENV,
  };
}

/**
 * Logs Supabase connection diagnostics (safe, no secrets)
 */
export function logSupabaseConfig(config: SupabaseConfig, context: string = 'Supabase'): void {
  const envStr = config.vercelEnv 
    ? `${config.environment} (VERCEL_ENV=${config.vercelEnv})`
    : `${config.environment} (NODE_ENV=${config.nodeEnv})`;
  
  console.log(
    `[${context}] ${envStr} | URL=${config.url} | project=${config.projectRef} | key=${config.keyType}(${config.keySuffix})`
  );
}
