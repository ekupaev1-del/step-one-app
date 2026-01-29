import { createHash, createHmac, timingSafeEqual } from "crypto";

export class TelegramInitDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TelegramInitDataError";
  }
}

export interface TelegramWebAppUser {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  language_code?: string;
}

export interface TelegramInitDataParsed {
  /** Raw initData query string (as received) */
  initData: string;
  /** Telegram user object from initData `user=` */
  user: TelegramWebAppUser;
  /** Telegram numeric user id */
  telegramId: number;
  /** auth_date (unix seconds) */
  authDate: number;
  /** query_id (optional) */
  queryId?: string;
}

function toBufferUtf8(s: string): Buffer {
  return Buffer.from(s, "utf8");
}

function base64urlDecodeToString(input: string): string {
  // Not used for initData; kept here to avoid accidental misuse.
  return Buffer.from(input, "base64url").toString("utf8");
}

export function parseTelegramInitData(initData: string): TelegramInitDataParsed {
  if (!initData || typeof initData !== "string") {
    throw new TelegramInitDataError("initData is required");
  }

  const params = new URLSearchParams(initData);

  const userRaw = params.get("user");
  if (!userRaw) {
    throw new TelegramInitDataError("initData.user is missing");
  }

  let user: any;
  try {
    // `URLSearchParams` already decodes percent-encoding.
    user = JSON.parse(userRaw);
  } catch (e) {
    throw new TelegramInitDataError("initData.user is not valid JSON");
  }

  const telegramId = Number(user?.id);
  if (!Number.isInteger(telegramId) || telegramId <= 0) {
    throw new TelegramInitDataError("initData.user.id must be a positive integer");
  }

  const authDate = Number(params.get("auth_date"));
  if (!Number.isInteger(authDate) || authDate <= 0) {
    throw new TelegramInitDataError("initData.auth_date is missing or invalid");
  }

  const queryId = params.get("query_id") ?? undefined;

  return {
    initData,
    user: user as TelegramWebAppUser,
    telegramId,
    authDate,
    queryId,
  };
}

/**
 * Validates Telegram Mini App `initData` signature.
 *
 * Algorithm per official Telegram docs:
 * - secret_key = sha256(bot_token)
 * - data_check_string = sorted key=value (excluding `hash`) joined with \n
 * - hash = hex(HMAC-SHA256(secret_key, data_check_string))
 */
export function validateTelegramInitData(
  initData: string,
  botToken: string,
  options?: { maxAgeSeconds?: number }
): TelegramInitDataParsed {
  const parsed = parseTelegramInitData(initData);

  if (!botToken) {
    throw new TelegramInitDataError("TELEGRAM_BOT_TOKEN is not configured");
  }

  const maxAgeSeconds = options?.maxAgeSeconds ?? 24 * 60 * 60; // 24h default
  const nowSec = Math.floor(Date.now() / 1000);
  if (maxAgeSeconds > 0 && nowSec - parsed.authDate > maxAgeSeconds) {
    throw new TelegramInitDataError("initData is too old");
  }

  const params = new URLSearchParams(initData);
  const providedHash = params.get("hash");
  if (!providedHash) {
    throw new TelegramInitDataError("initData.hash is missing");
  }

  // Build data_check_string
  const pairs: string[] = [];
  for (const [key, value] of params.entries()) {
    if (key === "hash") continue;
    pairs.push(`${key}=${value}`);
  }
  pairs.sort((a, b) => a.localeCompare(b));
  const dataCheckString = pairs.join("\n");

  const secretKey = createHash("sha256").update(toBufferUtf8(botToken)).digest(); // bytes
  const computedHash = createHmac("sha256", secretKey).update(toBufferUtf8(dataCheckString)).digest("hex");

  // Timing-safe compare
  const provided = Buffer.from(providedHash, "hex");
  const computed = Buffer.from(computedHash, "hex");
  if (provided.length !== computed.length || !timingSafeEqual(provided, computed)) {
    throw new TelegramInitDataError("initData signature is invalid");
  }

  return parsed;
}

