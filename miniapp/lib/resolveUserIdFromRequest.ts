/**
 * Authoritative server-side userId resolver
 * Safely extracts userId from NextRequest with full diagnostics
 */

import { NextRequest } from "next/server";

export interface UserIdResolutionResult {
  userId: number | null;
  source: string;
  candidates: {
    query_userId: string | null;
    query_id: string | null;
    body_userId: number | null;
    body_id: number | null;
    header_user_id: string | null;
    telegram_user_id: number | null;
  };
  notes: string[];
}

/**
 * Resolves userId from request following strict priority order:
 * 1. Query param ?userId=
 * 2. Query param ?id=
 * 3. JSON body { userId }
 * 4. JSON body { id }
 * 5. Header x-user-id
 * 6. Telegram WebApp initDataUnsafe.user.id (if present)
 * 7. null if none found
 * 
 * NEVER throws - always returns a result with diagnostics
 * 
 * @param req - NextRequest object
 * @param parsedBody - Optional pre-parsed body to avoid double reading
 */
export async function resolveUserIdFromRequest(
  req: NextRequest,
  parsedBody?: any
): Promise<UserIdResolutionResult> {
  const result: UserIdResolutionResult = {
    userId: null,
    source: "none",
    candidates: {
      query_userId: null,
      query_id: null,
      body_userId: null,
      body_id: null,
      header_user_id: null,
      telegram_user_id: null,
    },
    notes: [],
  };

  const url = new URL(req.url);

  // 1. Try query param ?userId=
  const queryUserId = url.searchParams.get("userId");
  result.candidates.query_userId = queryUserId;
  if (queryUserId) {
    const n = Number(queryUserId);
    if (Number.isFinite(n) && n > 0) {
      result.userId = n;
      result.source = "query_userId";
      result.notes.push(`Found userId=${n} from query param ?userId=${queryUserId}`);
      return result;
    } else {
      result.notes.push(`Query param userId exists but invalid: "${queryUserId}"`);
    }
  }

  // 2. Try query param ?id=
  const queryId = url.searchParams.get("id");
  result.candidates.query_id = queryId;
  if (queryId) {
    const n = Number(queryId);
    if (Number.isFinite(n) && n > 0) {
      result.userId = n;
      result.source = "query_id";
      result.notes.push(`Found userId=${n} from query param ?id=${queryId}`);
      return result;
    } else {
      result.notes.push(`Query param id exists but invalid: "${queryId}"`);
    }
  }

  // 3. Try JSON body { userId } and { id }
  let body = parsedBody;
  if (!body) {
    try {
      body = await req.json().catch(() => null);
    } catch (e) {
      // Body parsing failed - not JSON or already consumed
      result.notes.push(`Body parsing failed (may be non-JSON or already consumed): ${e}`);
    }
  }

  if (body && typeof body === "object") {
    if (body.userId !== undefined) {
      const n = Number(body.userId);
      result.candidates.body_userId = Number.isFinite(n) ? n : null;
      if (Number.isFinite(n) && n > 0) {
        result.userId = n;
        result.source = "body_userId";
        result.notes.push(`Found userId=${n} from request body.userId`);
        return result;
      } else {
        result.notes.push(`Body userId exists but invalid: ${body.userId}`);
      }
    }

    // 4. Try JSON body { id }
    if (body.id !== undefined) {
      const n = Number(body.id);
      result.candidates.body_id = Number.isFinite(n) ? n : null;
      if (Number.isFinite(n) && n > 0) {
        result.userId = n;
        result.source = "body_id";
        result.notes.push(`Found userId=${n} from request body.id`);
        return result;
      } else {
        result.notes.push(`Body id exists but invalid: ${body.id}`);
      }
    }
  }

  // 5. Try header x-user-id
  const headerUserId = req.headers.get("x-user-id");
  result.candidates.header_user_id = headerUserId;
  if (headerUserId) {
    const n = Number(headerUserId);
    if (Number.isFinite(n) && n > 0) {
      result.userId = n;
      result.source = "header_x_user_id";
      result.notes.push(`Found userId=${n} from header x-user-id`);
      return result;
    } else {
      result.notes.push(`Header x-user-id exists but invalid: "${headerUserId}"`);
    }
  }

  // 6. Try Telegram WebApp initDataUnsafe.user.id
  // This requires parsing initData from headers or body
  // For now, we'll check if there's an init-data header (Telegram sends it)
  const initData = req.headers.get("x-telegram-init-data");
  if (initData) {
    try {
      // Parse initData (it's URL-encoded query string)
      const params = new URLSearchParams(initData);
      const userParam = params.get("user");
      if (userParam) {
        const user = JSON.parse(decodeURIComponent(userParam));
        if (user?.id) {
          const n = Number(user.id);
          result.candidates.telegram_user_id = Number.isFinite(n) ? n : null;
          if (Number.isFinite(n) && n > 0) {
            result.userId = n;
            result.source = "telegram_initData_user_id";
            result.notes.push(`Found userId=${n} from Telegram initData user.id`);
            return result;
          }
        }
      }
    } catch (e) {
      result.notes.push(`Telegram initData parsing failed: ${e}`);
    }
  }

  // 7. No userId found
  result.notes.push("No userId found in any source");
  return result;
}
