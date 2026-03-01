/**
 * Fetches or creates user by telegram_id
 * Single source of truth for user existence check
 */

export interface UserResult {
  id: number;
  telegram_id: number;
  exists: boolean;
}

/**
 * Fetches user by telegram_id from API
 * Returns null if user doesn't exist
 */
export async function fetchOrCreateUser(telegramId: number): Promise<UserResult | null> {
  if (!Number.isFinite(telegramId) || telegramId <= 0) {
    console.error("[fetchOrCreateUser] Invalid telegram_id:", telegramId);
    return null;
  }

  try {
    const response = await fetch(`/api/user/by-telegram-id?telegramId=${telegramId}`);
    const data = await response.json();

    if (!response.ok || !data.ok) {
      console.error("[fetchOrCreateUser] API error:", data.error);
      return null;
    }

    if (data.found && data.userId) {
      return {
        id: data.userId,
        telegram_id: telegramId,
        exists: true,
      };
    }

    // User doesn't exist
    return null;
  } catch (err: any) {
    console.error("[fetchOrCreateUser] Error:", err);
    return null;
  }
}
