/**
 * Comprehensive database diagnostics and healthcheck
 * 
 * Provides:
 * - Supabase connection diagnostics (URL, project ref, key type)
 * - Schema verification (tables, columns, constraints)
 * - Runtime environment detection
 * - Detailed error context for all DB operations
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

export interface SupabaseConnectionInfo {
  url: string;
  projectRef: string | null;
  keyType: 'anon' | 'service_role' | 'unknown';
  keySuffix: string; // Last 6 chars for identification (safe to log)
  environment: 'production' | 'preview' | 'development' | 'local' | 'unknown';
  nodeEnv: string;
  vercelEnv: string | undefined;
}

export interface SchemaHealthCheck {
  healthy: boolean;
  database: string;
  schema: string;
  searchPath: string;
  tables: {
    name: string;
    exists: boolean;
    columns?: string[];
    missingColumns?: string[];
  }[];
  errors: string[];
}

/**
 * Extracts project reference from Supabase URL
 * Example: https://abcdefghijklmnop.supabase.co -> abcdefghijklmnop
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
 * Detects key type from the key itself (without exposing the full key)
 */
export function detectKeyType(key: string): 'anon' | 'service_role' | 'unknown' {
  if (!key) return 'unknown';
  
  // Service role keys are typically much longer (200+ chars)
  // Anon keys are shorter (100-150 chars)
  if (key.length > 200) {
    return 'service_role';
  }
  
  // Check for explicit markers
  if (key.includes('anon') || key.includes('eyJ')) {
    // Decode JWT header to check
    try {
      const parts = key.split('.');
      if (parts.length >= 2) {
        const header = JSON.parse(Buffer.from(parts[0], 'base64').toString());
        if (header.alg && key.length < 200) {
          return 'anon';
        }
      }
    } catch {
      // Fall through
    }
  }
  
  // Default: assume service_role if very long
  return key.length > 150 ? 'service_role' : 'anon';
}

/**
 * Gets last N characters of a string (safe for logging)
 */
export function getKeySuffix(key: string, length: number = 6): string {
  if (!key || key.length < length) return '***';
  return key.slice(-length);
}

/**
 * Detects runtime environment
 */
export function detectEnvironment(): 'production' | 'preview' | 'development' | 'local' | 'unknown' {
  const vercelEnv = process.env.VERCEL_ENV;
  const nodeEnv = process.env.NODE_ENV;
  
  if (vercelEnv === 'production') return 'production';
  if (vercelEnv === 'preview') return 'preview';
  if (nodeEnv === 'production') return 'production';
  if (nodeEnv === 'development') return 'development';
  if (!vercelEnv && !nodeEnv) return 'local';
  
  return 'unknown';
}

/**
 * Analyzes Supabase connection configuration
 */
export function analyzeSupabaseConnection(
  url: string | undefined,
  key: string | undefined
): SupabaseConnectionInfo {
  const actualUrl = url || 'NOT_SET';
  const actualKey = key || 'NOT_SET';
  
  return {
    url: actualUrl,
    projectRef: actualUrl !== 'NOT_SET' ? extractProjectRef(actualUrl) : null,
    keyType: actualKey !== 'NOT_SET' ? detectKeyType(actualKey) : 'unknown',
    keySuffix: actualKey !== 'NOT_SET' ? getKeySuffix(actualKey) : '***',
    environment: detectEnvironment(),
    nodeEnv: process.env.NODE_ENV || 'not_set',
    vercelEnv: process.env.VERCEL_ENV,
  };
}

/**
 * Logs comprehensive connection diagnostics
 */
export function logConnectionDiagnostics(info: SupabaseConnectionInfo): void {
  console.log('[DB_DIAGNOSTICS] ========================================');
  console.log('[DB_DIAGNOSTICS] Supabase Connection Info:');
  console.log('[DB_DIAGNOSTICS]   URL:', info.url);
  console.log('[DB_DIAGNOSTICS]   Project Ref:', info.projectRef || 'NOT_FOUND');
  console.log('[DB_DIAGNOSTICS]   Key Type:', info.keyType);
  console.log('[DB_DIAGNOSTICS]   Key Suffix:', info.keySuffix);
  console.log('[DB_DIAGNOSTICS]   Environment:', info.environment);
  console.log('[DB_DIAGNOSTICS]   NODE_ENV:', info.nodeEnv);
  console.log('[DB_DIAGNOSTICS]   VERCEL_ENV:', info.vercelEnv || 'not_set');
  console.log('[DB_DIAGNOSTICS] ========================================');
}

/**
 * Performs comprehensive schema healthcheck
 */
export async function performSchemaHealthCheck(
  supabase: SupabaseClient
): Promise<SchemaHealthCheck> {
  const result: SchemaHealthCheck = {
    healthy: true,
    database: 'unknown',
    schema: 'unknown',
    searchPath: 'unknown',
    tables: [],
    errors: [],
  };

  try {
    // 1. Check database connection by trying to query users table
    // This is the simplest way to verify connection without RPC
    const { error: testError } = await supabase
      .from('users')
      .select('id')
      .limit(0);
    
    if (testError) {
      if (testError.code === '42P01' || testError.message?.includes('does not exist')) {
        result.errors.push(`Table 'users' does not exist - database may not be initialized`);
      } else {
        result.errors.push(`Database connection failed: ${testError.message} (code: ${testError.code})`);
      }
      result.healthy = false;
      // Still continue to check other tables
    } else {
      result.database = 'connected';
      result.schema = 'public';
      result.searchPath = 'public';
    }

    // 2. Check required tables and columns
    const requiredTables = [
      {
        name: 'users',
        requiredColumns: ['id', 'telegram_id', 'calories', 'goal', 'protein', 'fat', 'carbs', 'water_goal_ml'],
      },
      {
        name: 'reminders',
        requiredColumns: ['id', 'user_id', 'type', 'time'],
      },
      {
        name: 'app_logs',
        requiredColumns: ['id', 'level', 'source', 'request_id', 'user_id', 'telegram_user_id', 'chat_id'],
      },
      {
        name: 'diary',
        requiredColumns: ['id', 'user_id', 'source', 'text', 'created_at'],
      },
      {
        name: 'water_logs',
        requiredColumns: ['id', 'user_id', 'amount_ml', 'created_at'],
      },
    ];

    for (const tableSpec of requiredTables) {
      const tableCheck = {
        name: tableSpec.name,
        exists: false,
        columns: [] as string[],
        missingColumns: [] as string[],
      };

      // Try to query the table
      const { data, error } = await supabase
        .from(tableSpec.name)
        .select('*')
        .limit(0);

      if (error) {
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          tableCheck.exists = false;
          result.errors.push(`Table '${tableSpec.name}' does not exist`);
          result.healthy = false;
        } else {
          // Table exists but might have permission issues
          tableCheck.exists = true;
          result.errors.push(`Table '${tableSpec.name}' query error: ${error.message}`);
        }
      } else {
        tableCheck.exists = true;
        // Table exists - we can't easily check columns via Supabase client
        // So we'll try to select a specific column to verify
        for (const col of tableSpec.requiredColumns) {
          const { error: colError } = await supabase
            .from(tableSpec.name)
            .select(col)
            .limit(0);
          
          if (colError && (colError.code === '42703' || colError.message?.includes('column'))) {
            tableCheck.missingColumns.push(col);
            result.errors.push(`Table '${tableSpec.name}' missing column '${col}'`);
            result.healthy = false;
          } else {
            tableCheck.columns.push(col);
          }
        }
      }

      result.tables.push(tableCheck);
    }

  } catch (err: any) {
    result.errors.push(`Healthcheck exception: ${err?.message || String(err)}`);
    result.healthy = false;
  }

  return result;
}

/**
 * Logs schema healthcheck results
 */
export function logSchemaHealthCheck(result: SchemaHealthCheck): void {
  console.log('[DB_HEALTHCHECK] ========================================');
  console.log('[DB_HEALTHCHECK] Schema Health Status:', result.healthy ? '✅ HEALTHY' : '❌ UNHEALTHY');
  console.log('[DB_HEALTHCHECK] Database:', result.database);
  console.log('[DB_HEALTHCHECK] Schema:', result.schema);
  console.log('[DB_HEALTHCHECK] Search Path:', result.searchPath);
  console.log('[DB_HEALTHCHECK] Tables:');
  
  for (const table of result.tables) {
    const status = table.exists ? '✅' : '❌';
    console.log(`[DB_HEALTHCHECK]   ${status} ${table.name} (exists: ${table.exists})`);
    
    if (table.missingColumns && table.missingColumns.length > 0) {
      console.log(`[DB_HEALTHCHECK]     Missing columns: ${table.missingColumns.join(', ')}`);
    }
    if (table.columns && table.columns.length > 0) {
      console.log(`[DB_HEALTHCHECK]     Verified columns: ${table.columns.join(', ')}`);
    }
  }
  
  if (result.errors.length > 0) {
    console.log('[DB_HEALTHCHECK] Errors:');
    result.errors.forEach((err, idx) => {
      console.log(`[DB_HEALTHCHECK]   ${idx + 1}. ${err}`);
    });
  }
  
  console.log('[DB_HEALTHCHECK] ========================================');
}

/**
 * Creates actionable error message from healthcheck results
 */
export function createHealthCheckErrorMessage(result: SchemaHealthCheck): string {
  if (result.healthy) {
    return 'Database schema is healthy.';
  }

  const messages: string[] = [];
  messages.push('Database schema healthcheck failed:');
  
  for (const table of result.tables) {
    if (!table.exists) {
      messages.push(`  - Table '${table.name}' does not exist. Run migration to create it.`);
    } else if (table.missingColumns && table.missingColumns.length > 0) {
      messages.push(`  - Table '${table.name}' is missing columns: ${table.missingColumns.join(', ')}. Run migration to add them.`);
    }
  }
  
  if (result.errors.length > 0) {
    messages.push('  Errors:');
    result.errors.forEach(err => messages.push(`    - ${err}`));
  }
  
  messages.push('');
  messages.push('Action required: Apply migrations from supabase/migrations/ in Supabase SQL Editor.');
  
  return messages.join('\n');
}
