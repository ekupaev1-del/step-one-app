/**
 * Shared database operation logger
 * 
 * Logs all DB operations with structured JSON for Vercel logs.
 * Includes: requestId, route/handler, telegramUserId, userId, operation, table, and full error details.
 */

export interface DBLogContext {
  requestId: string;
  route?: string; // API route or handler name (e.g., '/api/save', 'telegram.start')
  telegramUserId?: number;
  userId?: number;
  operation: string; // e.g., 'select', 'insert', 'update', 'upsert'
  table: string; // table name
  payload?: any; // sanitized payload (no secrets)
}

export interface DBErrorDetails {
  code?: string; // Postgres error code (e.g., '42P01')
  message?: string;
  details?: string;
  hint?: string;
  constraint?: string;
  table?: string;
  column?: string;
  schema?: string;
}

/**
 * Logs a database operation (success or failure)
 */
export function logDBOperation(
  context: DBLogContext,
  error?: DBErrorDetails | null,
  durationMs?: number
): void {
  const logEntry = {
    type: error ? 'db_error' : 'db_success',
    timestamp: new Date().toISOString(),
    ...context,
    ...(error && {
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        constraint: error.constraint,
        table: error.table,
        column: error.column,
        schema: error.schema,
      },
    }),
    ...(durationMs !== undefined && { durationMs }),
  };

  // Always output as single-line JSON for Vercel logs
  const logLine = JSON.stringify(logEntry);

  if (error) {
    console.error(logLine);
  } else {
    // Only log success if DEBUG is enabled
    if (process.env.DEBUG === '1' || process.env.DEBUG === 'true') {
      console.log(logLine);
    }
  }
}

/**
 * Logs a database error with full context
 */
export function logDBError(
  context: DBLogContext,
  error: any, // Supabase error or Postgres error
  durationMs?: number
): void {
  const errorDetails: DBErrorDetails = {
    code: error?.code,
    message: error?.message,
    details: error?.details,
    hint: error?.hint,
    constraint: (error as any)?.constraint,
    table: (error as any)?.table,
    column: (error as any)?.column,
    schema: (error as any)?.schema,
  };

  logDBOperation(context, errorDetails, durationMs);
}

/**
 * Creates a user-friendly error message for Telegram
 * Includes requestId for support
 */
export function createUserFriendlyError(requestId: string, errorCode?: string): string {
  if (errorCode === '42P01') {
    return `Ошибка базы данных. Таблица не найдена. Код: ${requestId}`;
  }
  if (errorCode === '23505') {
    return `Ошибка: дублирующая запись. Код: ${requestId}`;
  }
  if (errorCode === '23503') {
    return `Ошибка: нарушение внешнего ключа. Код: ${requestId}`;
  }
  if (errorCode === '23514') {
    return `Ошибка: нарушение ограничения. Код: ${requestId}`;
  }
  return `Ошибка базы данных. Попробуйте позже. Код: ${requestId}`;
}
