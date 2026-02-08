/**
 * Debug helper for Supabase connection context
 * Logs connection details without exposing secrets
 */

export interface SupabaseContext {
  url: string;
  projectRef: string | null;
  keyType: 'anon' | 'service_role' | 'unknown';
  keyMasked: string; // First 6 + ... + last 4 chars
  environment: 'production' | 'preview' | 'development' | 'local' | 'unknown';
  nodeEnv: string;
  vercelEnv: string | undefined;
  expectedTables: string[];
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
 * Masks a secret key for safe logging
 */
export function maskKey(key: string): string {
  if (!key || key.length < 10) return '***';
  if (key.length <= 10) return key.substring(0, 6) + '***';
  return key.substring(0, 6) + '...' + key.slice(-4);
}

/**
 * Detects key type from length and structure
 */
export function detectKeyType(key: string): 'anon' | 'service_role' | 'unknown' {
  if (!key) return 'unknown';
  // Service role keys are typically 200+ chars, anon keys are ~100-150
  if (key.length > 200) return 'service_role';
  if (key.length > 100 && key.length < 200) return 'anon';
  return 'unknown';
}

/**
 * Detects runtime environment
 */
export function detectEnvironment(): 'production' | 'preview' | 'development' | 'local' | 'unknown' {
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
 * Gets Supabase connection context
 */
export function getSupabaseContext(
  url: string | undefined,
  key: string | undefined,
  expectedTables: string[] = ['users', 'diary', 'water_logs', 'app_logs', 'reminders']
): SupabaseContext {
  const actualUrl = url || 'NOT_SET';
  const actualKey = key || 'NOT_SET';
  
  return {
    url: actualUrl,
    projectRef: actualUrl !== 'NOT_SET' ? extractProjectRef(actualUrl) : null,
    keyType: actualKey !== 'NOT_SET' ? detectKeyType(actualKey) : 'unknown',
    keyMasked: actualKey !== 'NOT_SET' ? maskKey(actualKey) : '***',
    environment: detectEnvironment(),
    nodeEnv: process.env.NODE_ENV || 'not_set',
    vercelEnv: process.env.VERCEL_ENV,
    expectedTables,
  };
}

/**
 * Logs a compact diagnostic line
 */
export function logSupabaseContext(context: SupabaseContext): void {
  const envStr = context.vercelEnv 
    ? `${context.environment} (VERCEL_ENV=${context.vercelEnv})`
    : `${context.environment} (NODE_ENV=${context.nodeEnv})`;
  
  const projectInfo = context.projectRef 
    ? `project=${context.projectRef}`
    : 'project=UNKNOWN';
  
  console.log(
    `[SUPABASE] ${envStr} | ${context.url} | ${projectInfo} | key=${context.keyType}(${context.keyMasked}) | tables=[${context.expectedTables.join(',')}]`
  );
}
