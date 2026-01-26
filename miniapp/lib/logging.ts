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
import { createServerSupabaseClient } from "./supabaseAdmin";

export interface LogEventOptions {
  requestId?: string;
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
    telegramUserId,
    chatId,
    payload,
    errorMessage,
    errorStack,
  } = options;

  // Normalize telegramUserId and chatId to strings
  const telegramUserIdStr = telegramUserId ? String(telegramUserId) : undefined;
  const chatIdStr = chatId ? String(chatId) : undefined;

  // Prepare log entry
  const logEntry: any = {
    level,
    source,
    request_id: requestId || null,
    telegram_user_id: telegramUserIdStr || null,
    chat_id: chatIdStr || null,
    payload: payload ? JSON.parse(JSON.stringify(payload)) : null, // Deep clone to avoid circular refs
    error_message: errorMessage || null,
    error_stack: errorStack || null,
  };

  try {
    const supabase = createServerSupabaseClient();
    const { error } = await supabase.from('app_logs').insert(logEntry);

    if (error) {
      // Log to console as fallback - never throw
      console.error('[logEvent] Failed to write to app_logs:', {
        error: error.message,
        errorCode: error.code,
        logEntry: {
          level,
          source,
          requestId,
          telegramUserId: telegramUserIdStr,
        },
      });
    }
  } catch (err: any) {
    // Critical: Never throw from logging function
    // Fallback to console.error
    console.error('[logEvent] Exception while logging:', {
      error: err?.message || String(err),
      stack: err?.stack,
      logEntry: {
        level,
        source,
        requestId,
        telegramUserId: telegramUserIdStr,
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
