/**
 * Shared database operation logger
 * 
 * Logs all DB operations with structured JSON for Vercel logs.
 * Includes: requestId, route/handler, telegramUserId, userId, operation, table, project ref, and full error details.
 */

import { extractProjectRef } from './dbDiagnostics';

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
 * Formats a database error into a readable diagnostic message
 */
export function formatDbError(
  error: any,
  context: { table?: string; operation?: string; requestId?: string; telegramUserId?: number }
): string {
  const errorCode = error?.code || 'UNKNOWN';
  const errorMessage = error?.message || 'Unknown error';
  const table = error?.table || context.table || 'unknown';
  const operation = context.operation || 'unknown';
  const requestId = context.requestId || 'unknown';
  const telegramUserId = context.telegramUserId || null;

  let diagnostic = `[DB_ERROR:${requestId}] ${operation} on ${table}`;
  if (telegramUserId) {
    diagnostic += ` (telegramUserId: ${telegramUserId})`;
  }
  diagnostic += `: [${errorCode}] ${errorMessage}`;

  if (error?.constraint) {
    diagnostic += ` (constraint: ${error.constraint})`;
  }
  if (error?.column) {
    diagnostic += ` (column: ${error.column})`;
  }
  if (error?.details) {
    diagnostic += ` | Details: ${error.details}`;
  }
  if (error?.hint) {
    diagnostic += ` | Hint: ${error.hint}`;
  }

  return diagnostic;
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

  // Extract project ref from Supabase URL for diagnostics
  // ЕДИНЫЙ ИСТОЧНИК ПРАВДЫ: только из env (bot) или process.env.SUPABASE_URL (miniapp)
  // НЕТ fallback на NEXT_PUBLIC_SUPABASE_URL - это может быть неправильный проект
  let supabaseUrl: string | undefined;
  try {
    // Try to import env from bot config (if in bot context)
    const { env: botEnv } = await import("../config/env.js").catch(() => ({ env: null }));
    if (botEnv?.supabaseUrl) {
      supabaseUrl = botEnv.supabaseUrl;
    } else {
      // For miniapp, use SUPABASE_URL (not NEXT_PUBLIC_SUPABASE_URL to avoid wrong project)
      supabaseUrl = process.env.SUPABASE_URL;
    }
  } catch {
    // Fallback only to SUPABASE_URL (never NEXT_PUBLIC_SUPABASE_URL)
    supabaseUrl = process.env.SUPABASE_URL;
  }
  const projectRef = supabaseUrl ? extractProjectRef(supabaseUrl) : null;

  // Log formatted diagnostic message with project ref
  const diagnostic = formatDbError(error, {
    table: context.table,
    operation: context.operation,
    requestId: context.requestId,
    telegramUserId: context.telegramUserId,
  });
  
  // Add project ref to diagnostic if available
  const diagnosticWithRef = projectRef 
    ? `${diagnostic} | Project: ${projectRef}`
    : diagnostic;
  
  console.error(diagnosticWithRef);

  // Log full error context as structured JSON
  const fullContext = {
    requestId: context.requestId,
    route: context.route,
    operation: context.operation,
    table: context.table,
    telegramUserId: context.telegramUserId,
    userId: context.userId,
    projectRef: projectRef || undefined,
    error: {
      code: errorDetails.code,
      message: errorDetails.message,
      details: errorDetails.details,
      hint: errorDetails.hint,
      constraint: errorDetails.constraint,
      table: errorDetails.table,
      column: errorDetails.column,
      schema: errorDetails.schema,
    },
    ...(durationMs !== undefined && { durationMs }),
  };
  console.error(`[DB_ERROR] ${JSON.stringify(fullContext)}`);

  // Also log via structured operation logger
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
  if (errorCode === '42703') {
    return `Ошибка базы данных. Колонка не найдена. Код: ${requestId}`;
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
  if (errorCode === '42501') {
    return `Ошибка доступа к базе данных. Код: ${requestId}`;
  }
  return `Ошибка базы данных. Попробуйте позже. Код: ${requestId}`;
}
