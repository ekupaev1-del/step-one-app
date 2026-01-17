/**
 * Resolves userId from various sources with detailed tracing
 */

export interface UserIdResolutionTrace {
  userId: number | null;
  source: string;
  candidates: Record<string, any>;
  notes: string[];
}

/**
 * Resolves userId from all possible sources with tracing
 */
export function resolveUserIdWithTrace(
  searchParams: URLSearchParams | null,
  options?: {
    checkLocalStorage?: boolean;
    checkSessionStorage?: boolean;
    checkTelegram?: boolean;
  }
): UserIdResolutionTrace {
  const trace: UserIdResolutionTrace = {
    userId: null,
    source: "none",
    candidates: {},
    notes: [],
  };

  const opts = {
    checkLocalStorage: true,
    checkSessionStorage: true,
    checkTelegram: true,
    ...options,
  };

  // 1. Check URL search params (id or userId)
  if (searchParams) {
    const idParam = searchParams.get("id");
    const userIdParam = searchParams.get("userId");
    
    trace.candidates.url_id = idParam;
    trace.candidates.url_userId = userIdParam;

    if (idParam) {
      const n = Number(idParam);
      if (Number.isFinite(n) && n > 0) {
        trace.userId = n;
        trace.source = "url_searchParams_id";
        trace.notes.push(`Found userId=${n} from URL searchParams.get("id")`);
        return trace;
      } else {
        trace.notes.push(`URL id param exists but invalid: "${idParam}"`);
      }
    }

    if (userIdParam) {
      const n = Number(userIdParam);
      if (Number.isFinite(n) && n > 0) {
        trace.userId = n;
        trace.source = "url_searchParams_userId";
        trace.notes.push(`Found userId=${n} from URL searchParams.get("userId")`);
        return trace;
      } else {
        trace.notes.push(`URL userId param exists but invalid: "${userIdParam}"`);
      }
    }
  }

  // 2. Check window.location.href directly (fallback)
  if (typeof window !== "undefined") {
    const href = window.location.href;
    trace.candidates.location_href = href;
    
    const hrefMatch = href.match(/[?&](?:id|userId)=(\d+)/);
    if (hrefMatch && hrefMatch[1]) {
      const n = Number(hrefMatch[1]);
      if (Number.isFinite(n) && n > 0) {
        trace.userId = n;
        trace.source = "window_location_href";
        trace.notes.push(`Found userId=${n} from window.location.href regex match`);
        return trace;
      }
    }

    // 3. Check localStorage
    if (opts.checkLocalStorage && window.localStorage) {
      try {
        const localStorageKeys = ["userId", "user_id", "id"];
        for (const key of localStorageKeys) {
          const value = window.localStorage.getItem(key);
          trace.candidates[`localStorage_${key}`] = value;
          if (value) {
            const n = Number(value);
            if (Number.isFinite(n) && n > 0) {
              trace.userId = n;
              trace.source = `localStorage_${key}`;
              trace.notes.push(`Found userId=${n} from localStorage.getItem("${key}")`);
              return trace;
            }
          }
        }
      } catch (e) {
        trace.notes.push(`localStorage access error: ${e}`);
      }
    }

    // 4. Check sessionStorage
    if (opts.checkSessionStorage && window.sessionStorage) {
      try {
        const sessionStorageKeys = ["userId", "user_id", "id"];
        for (const key of sessionStorageKeys) {
          const value = window.sessionStorage.getItem(key);
          trace.candidates[`sessionStorage_${key}`] = value;
          if (value) {
            const n = Number(value);
            if (Number.isFinite(n) && n > 0) {
              trace.userId = n;
              trace.source = `sessionStorage_${key}`;
              trace.notes.push(`Found userId=${n} from sessionStorage.getItem("${key}")`);
              return trace;
            }
          }
        }
      } catch (e) {
        trace.notes.push(`sessionStorage access error: ${e}`);
      }
    }

    // 5. Check Telegram WebApp initDataUnsafe
    if (opts.checkTelegram && (window as any).Telegram?.WebApp?.initDataUnsafe) {
      const webApp = (window as any).Telegram.WebApp;
      const initDataUnsafe = webApp.initDataUnsafe;
      
      trace.candidates.telegram_webApp_available = true;
      trace.candidates.telegram_initData_present = !!webApp.initData;
      trace.candidates.telegram_initData_length = webApp.initData?.length;
      trace.candidates.telegram_initDataUnsafe_user = initDataUnsafe?.user;
      trace.candidates.telegram_initDataUnsafe_user_id = initDataUnsafe?.user?.id;
      trace.candidates.telegram_initDataUnsafe_user_username = initDataUnsafe?.user?.username;
      trace.candidates.telegram_initDataUnsafe_query_id = initDataUnsafe?.query_id;

      if (initDataUnsafe?.user?.id) {
        const n = Number(initDataUnsafe.user.id);
        if (Number.isFinite(n) && n > 0) {
          trace.userId = n;
          trace.source = "telegram_initDataUnsafe_user_id";
          trace.notes.push(`Found userId=${n} from Telegram.WebApp.initDataUnsafe.user.id`);
          return trace;
        }
      } else {
        trace.notes.push("Telegram WebApp available but initDataUnsafe.user.id is missing");
      }
    } else {
      trace.candidates.telegram_webApp_available = false;
      trace.notes.push("Telegram.WebApp not available");
    }
  }

  trace.notes.push("No userId found in any source");
  return trace;
}
