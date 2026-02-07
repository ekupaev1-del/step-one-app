/**
 * Server-only logging helper for writing to app_logs table in Supabase
 * 
 * This function MUST NEVER throw - if logging fails, it falls back to console.error
 * It uses SUPABASE_SERVICE_ROLE_KEY to bypass RLS policies
 * 
 * @param level - Log level: 'info', 'warn', or 'error'
 * @param source - Source of the log entry (e.g., 'telegram_webhook', 'food_analysis', 'db_insert')
 * @param options - Additional logging options
 */

import { supabase } from "./supabase.js";

export interface LogEventOptions {
  requestId?: string;
  userId?: number; // BIGINT user_id from users table
  telegramUserId?: string | number;
  chatId?: string | number;
  payload?: any;
  errorMessage?: string;
  errorStack?: string;
}

export async function logEvent(
  level: 'info' | 'warn' | 'error',
  source: string,
  options: LogEventOptions = {}
): Promise<void> {
  const {
    requestId,
    userId,
    telegramUserId,
    chatId,
    payload,
    errorMessage,
    errorStack,
  } = options;

  // Normalize telegramUserId to BIGINT (number)
  const telegramUserIdNum = telegramUserId ? (typeof telegramUserId === 'number' ? telegramUserId : parseInt(String(telegramUserId), 10)) : null;

  // Prepare log entry with BIGINT types (including chat_id as TEXT)
  const chatIdStr = chatId ? String(chatId) : null;
  const logEntry: any = {
    level,
    source,
    request_id: requestId || null,
    user_id: userId || null, // BIGINT
    telegram_user_id: (telegramUserIdNum && !isNaN(telegramUserIdNum)) ? telegramUserIdNum : null, // BIGINT
    chat_id: chatIdStr, // TEXT (as per schema)
    message: errorMessage || null,
    payload: payload ? JSON.parse(JSON.stringify(payload)) : {}, // Store in payload JSONB
  };

  // Always log to console as structured JSON (for Vercel logs)
  // This ensures logs are parseable and searchable
  const consoleLog = {
    level,
    source,
    requestId: requestId || null,
    userId: userId || null,
    telegramUserId: telegramUserIdNum || null,
    timestamp: new Date().toISOString(),
    ...(payload && { payload: typeof payload === 'object' ? JSON.stringify(payload).substring(0, 1000) : String(payload).substring(0, 1000) }),
    ...(errorMessage && { error: errorMessage }),
    ...(errorStack && { stack: errorStack.substring(0, 2000) }),
  };

  // Always output as single-line JSON for better log aggregation
  const logLine = JSON.stringify(consoleLog);
  
  if (level === 'error') {
    console.error(logLine);
  } else if (level === 'warn') {
    console.warn(logLine);
  } else {
    // Only log info level if DEBUG is enabled
    if (process.env.DEBUG === '1' || process.env.DEBUG === 'true') {
      console.log(logLine);
    }
  }

  // Try to insert into app_logs, but NEVER crash if it fails
  try {
    const { error } = await supabase.from('app_logs').insert(logEntry);

    if (error) {
      // Log to console as fallback - never throw
      console.error('[logEvent] Failed to write to app_logs:', {
        error: error.message,
        errorCode: error.code,
        errorDetails: error.details,
        errorHint: error.hint,
        logEntry: {
          level,
          source,
          requestId,
          userId,
          telegramUserId: telegramUserIdNum,
        },
      });
    }
  } catch (err: any) {
    // Critical: Never throw from logging function
    // Fallback to console.error
    console.error('[logEvent] Exception while logging to app_logs:', {
      error: err?.message || String(err),
      stack: err?.stack,
      logEntry: {
        level,
        source,
        requestId,
        userId,
        telegramUserId: telegramUserIdNum,
      },
    });
  }
}

/**
 * Helper to generate a unique request ID
 */
export function generateRequestId(): string {
  return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Helper to log errors with full context
 */
export async function logError(
  source: string,
  error: Error | any,
  options: Omit<LogEventOptions, 'errorMessage' | 'errorStack'> = {}
): Promise<void> {
  const errorMessage = error?.message || String(error);
  const errorStack = error?.stack || null;

  await logEvent('error', source, {
    ...options,
    errorMessage,
    errorStack,
  });
}
