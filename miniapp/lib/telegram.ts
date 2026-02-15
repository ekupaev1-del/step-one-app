/**
 * Telegram WebApp utilities
 * Helper functions to work with Telegram WebApp API
 */

export interface TelegramUser {
  telegramId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
}

/**
 * Gets current Telegram user from WebApp initDataUnsafe
 * Returns null if not in Telegram WebApp context
 */
export function getCurrentTelegramUser(): TelegramUser | null {
  if (typeof window === "undefined") {
    return null;
  }

  const tg = (window as any).Telegram?.WebApp;
  if (!tg) {
    return null;
  }

  // Use initDataUnsafe for direct access (no validation needed on client)
  const user = tg.initDataUnsafe?.user;
  if (!user || !user.id) {
    return null;
  }

  return {
    telegramId: Number(user.id),
    username: user.username,
    firstName: user.first_name,
    lastName: user.last_name,
  };
}

/**
 * Gets Telegram WebApp initData string
 */
export function getTelegramInitData(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const tg = (window as any).Telegram?.WebApp;
  if (!tg) {
    return null;
  }

  return tg.initData || null;
}
