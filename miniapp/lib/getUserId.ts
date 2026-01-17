/**
 * Utility to get user ID from request
 * Supports Telegram WebApp initData and query param fallback
 */

/**
 * Get user ID from request
 * Priority:
 * 1. Telegram initData (if available)
 * 2. Query param userId or id
 * 3. Return null if not found
 */
export async function getUserIdFromRequest(req: Request): Promise<number | null> {
  const url = new URL(req.url);
  
  // Try query params first (most common case)
  const userIdParam = url.searchParams.get("userId") || url.searchParams.get("id");
  if (userIdParam) {
    const numericId = Number(userIdParam);
    if (Number.isFinite(numericId) && numericId > 0) {
      return numericId;
    }
  }

  // TODO: Parse Telegram initData if available
  // For now, we rely on query params which is how the app works currently
  // In the future, we can parse initData from headers or request body

  return null;
}

/**
 * Get user ID from URL search params (client-side helper)
 */
export function getUserIdFromSearchParams(searchParams: URLSearchParams | null): number | null {
  if (!searchParams) return null;
  
  const userIdParam = searchParams.get("userId") || searchParams.get("id");
  if (!userIdParam) return null;

  const numericId = Number(userIdParam);
  if (Number.isFinite(numericId) && numericId > 0) {
    return numericId;
  }

  return null;
}
