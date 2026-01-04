/**
 * Robokassa configuration module
 * Reads all Robokassa credentials from environment variables
 * NEVER hardcodes secrets
 */

export interface RobokassaConfig {
  merchantLogin: string;
  pass1: string;
  pass2: string;
  isTest: boolean;
}

/**
 * Mask password for logging (shows length + first/last 2 chars)
 */
function maskPassword(password: string): string {
  if (!password || password.length === 0) {
    return '[EMPTY]';
  }
  if (password.length <= 4) {
    return '[***]';
  }
  return `${password.substring(0, 2)}...${password.substring(password.length - 2)} (length: ${password.length})`;
}

/**
 * Get Robokassa configuration from environment variables
 * 
 * Reads:
 * - ROBOKASSA_MERCHANT_LOGIN (required)
 * - ROBOKASSA_PASSWORD1 (required) - Password #1 for signature generation
 * - ROBOKASSA_PASSWORD2 (required) - Password #2 for callback verification
 * - ROBOKASSA_TEST_MODE (optional) - If 'true' or '1', test mode is enabled
 * 
 * @throws Error if any required variable is missing
 */
export function getRobokassaConfig(): RobokassaConfig {
  const merchantLogin = process.env.ROBOKASSA_MERCHANT_LOGIN;
  const pass1 = process.env.ROBOKASSA_PASSWORD1;
  const pass2 = process.env.ROBOKASSA_PASSWORD2;
  const testModeEnv = process.env.ROBOKASSA_TEST_MODE;
  const isTest = testModeEnv === 'true' || testModeEnv === '1';

  // Validate required variables
  if (!merchantLogin) {
    throw new Error(
      'ROBOKASSA_MERCHANT_LOGIN is required. Set it in Vercel environment variables.'
    );
  }

  if (!pass1) {
    throw new Error(
      'ROBOKASSA_PASSWORD1 is required. Set it in Vercel environment variables.'
    );
  }

  if (!pass2) {
    throw new Error(
      'ROBOKASSA_PASSWORD2 is required. Set it in Vercel environment variables.'
    );
  }

  // Log configuration (server-side only, never in client, never log secrets)
  if (typeof window === 'undefined') {
    console.log('[robokassa] ========== CONFIGURATION CHECK ==========');
    console.log('[robokassa] MerchantLogin:', merchantLogin);
    console.log('[robokassa] MerchantLogin is "steopone":', merchantLogin === 'steopone');
    console.log('[robokassa] Pass1:', maskPassword(pass1));
    console.log('[robokassa] Pass2:', maskPassword(pass2));
    console.log('[robokassa] IsTest:', isTest);
    console.log('[robokassa] Environment:', process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown');
    console.log('[robokassa] =========================================');
  }

  // Strict check: merchantLogin must be exactly "steopone"
  if (merchantLogin !== 'steopone') {
    console.error('[robokassa] ❌ CRITICAL: merchantLogin is not "steopone"! Current value:', merchantLogin);
    console.error('[robokassa] ❌ This will cause Robokassa Error 26!');
  }

  return {
    merchantLogin: merchantLogin.trim(), // Trim to avoid trailing spaces
    pass1: pass1.trim(), // Trim to avoid trailing spaces
    pass2: pass2.trim(), // Trim to avoid trailing spaces
    isTest,
  };
}

