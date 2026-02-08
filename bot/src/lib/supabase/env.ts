/**
 * Single source of truth for Supabase environment configuration in bot
 * 
 * Validates SUPABASE_URL and EXPECTED_SUPABASE_PROJECT_REF
 * Provides safe diagnostics (never logs full keys)
 */

import { extractProjectRef } from "../../../../lib/supabase-config";

export interface SupabaseEnvConfig {
  url: string;
  serviceKey: string;
  projectRef: string;
  envName: string;
}

/**
 * Gets the expected project ref from environment variable
 */
function getExpectedProjectRef(): string {
  const expected = process.env.EXPECTED_SUPABASE_PROJECT_REF;
  if (!expected) {
    throw new Error(
      `❌ CRITICAL: EXPECTED_SUPABASE_PROJECT_REF is not set!\n` +
      `   Set EXPECTED_SUPABASE_PROJECT_REF in bot/.env file.\n` +
      `   Example: EXPECTED_SUPABASE_PROJECT_REF=ipgxnqplwzptxyfjjssrr`
    );
  }
  return expected.trim();
}

/**
 * Detects key type from key string
 */
function detectKeyType(key: string): 'service_role' | 'anon' | 'unknown' {
  if (!key) return 'unknown';
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
  const expectedProjectRef = getExpectedProjectRef();

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

  // Fail fast if project ref doesn't match expected
  if (projectRef !== expectedProjectRef) {
    throw new Error(
      `❌ CRITICAL: Supabase project ref mismatch!\n` +
      `   Current project ref: ${projectRef}\n` +
      `   Expected project ref: ${expectedProjectRef}\n` +
      `   URL: ${normalizedUrl}\n` +
      `   \n` +
      `   Fix: Update SUPABASE_URL in bot/.env to point to the correct project.\n` +
      `   Set EXPECTED_SUPABASE_PROJECT_REF=${expectedProjectRef} in bot/.env.`
    );
  }

  const keyType = detectKeyType(serviceKey);
  const keySuffix = getKeySuffix(serviceKey);
  const envName = getEnvName();

  // Log diagnostics (safe: no full keys)
  console.log(
    `[SUPABASE] env=${envName} url=${normalizedUrl} projectRef=${projectRef} keyType=${keyType} keySuffix=${keySuffix}`
  );

  return {
    url: normalizedUrl,
    serviceKey,
    projectRef,
    envName,
  };
}
