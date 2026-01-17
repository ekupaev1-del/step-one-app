/**
 * Client-side debug context collection
 * Gathers information about the current environment, Telegram context, and user state
 */

export interface ClientDebugContext {
  location: {
    href: string;
    route?: string;
  };
  environment: {
    nodeEnv?: string;
    buildId?: string;
    debugPayments?: boolean;
  };
  userAgent: string;
  telegram: {
    webAppAvailable: boolean;
    initDataPresent: boolean;
    initDataLength?: number;
    userId?: number;
    platform?: string;
    version?: string;
    chatId?: number;
  };
  storage: {
    keys: string[];
    values: Record<string, string>; // truncated values only
  };
  timestamp: string;
}

/**
 * Masks sensitive values in strings
 */
function maskSecret(value: string, maxVisible: number = 4): string {
  if (!value || value.length <= maxVisible) {
    return "***";
  }
  return value.substring(0, maxVisible) + "***";
}

/**
 * Checks if a key name suggests it contains secrets
 */
function isSecretKey(key: string): boolean {
  const secretPatterns = [
    /token/i,
    /key/i,
    /secret/i,
    /password/i,
    /auth/i,
    /credential/i,
    /api[_-]?key/i,
    /supabase[_-]?service[_-]?role/i,
    /robokassa[_-]?password/i,
  ];
  return secretPatterns.some((pattern) => pattern.test(key));
}

/**
 * Collects client-side debug context
 */
export function collectClientDebugContext(): ClientDebugContext {
  const context: ClientDebugContext = {
    location: {
      href: typeof window !== "undefined" ? window.location.href : "N/A",
      route: typeof window !== "undefined" ? window.location.pathname : undefined,
    },
    environment: {
      nodeEnv: typeof process !== "undefined" ? process.env.NODE_ENV : undefined,
      buildId: typeof process !== "undefined" ? process.env.NEXT_PUBLIC_BUILD_ID : undefined,
      debugPayments:
        typeof process !== "undefined"
          ? process.env.NEXT_PUBLIC_DEBUG_PAYMENTS === "true"
          : undefined,
    },
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "N/A",
    telegram: {
      webAppAvailable: false,
      initDataPresent: false,
    },
    storage: {
      keys: [],
      values: {},
    },
    timestamp: new Date().toISOString(),
  };

  // Check Telegram WebApp
  if (typeof window !== "undefined" && (window as any).Telegram?.WebApp) {
    const webApp = (window as any).Telegram.WebApp;
    context.telegram.webAppAvailable = true;
    context.telegram.initDataPresent = !!webApp.initData;
    context.telegram.initDataLength = webApp.initData?.length;
    context.telegram.platform = webApp.platform;
    context.telegram.version = webApp.version;

    // Get detailed initDataUnsafe info
    if (webApp.initDataUnsafe) {
      context.telegram.userId = webApp.initDataUnsafe.user?.id;
      context.telegram.chatId = webApp.initDataUnsafe.chat?.id;
    }
  }

  // Check localStorage (only show key names and truncated non-secret values)
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      const keys: string[] = [];
      const values: Record<string, string> = {};

      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key) {
          keys.push(key);
          // Only show truncated values for non-secret keys
          if (!isSecretKey(key)) {
            const value = window.localStorage.getItem(key);
            if (value) {
              // Truncate long values
              values[key] =
                value.length > 50 ? value.substring(0, 50) + "..." : value;
            }
          } else {
            values[key] = maskSecret(window.localStorage.getItem(key) || "");
          }
        }
      }

      context.storage.keys = keys;
      context.storage.values = values;
    } catch (e) {
      // localStorage might be blocked
      context.storage.keys = ["(access denied)"];
    }
  }

  return context;
}

/**
 * Masks secrets in an object recursively
 */
export function maskSecretsInObject(obj: any, maxDepth: number = 5): any {
  if (maxDepth <= 0) {
    return "[max depth reached]";
  }

  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === "string") {
    // Check if it looks like a secret (long alphanumeric string)
    if (obj.length > 20 && /^[a-zA-Z0-9_-]+$/.test(obj)) {
      return maskSecret(obj);
    }
    return obj;
  }

  if (typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => maskSecretsInObject(item, maxDepth - 1));
  }

  const masked: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (isSecretKey(key)) {
      masked[key] = typeof value === "string" ? maskSecret(value) : "[hidden]";
    } else {
      masked[key] = maskSecretsInObject(value, maxDepth - 1);
    }
  }

  return masked;
}
