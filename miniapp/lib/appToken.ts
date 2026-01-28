import { createHmac, timingSafeEqual } from "crypto";

export class AppTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppTokenError";
  }
}

export interface AppTokenPayload {
  sub: string; // UUID user id
  iat: number;
  exp: number;
  telegram_id?: number;
}

function base64urlEncode(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, "utf8");
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64urlDecode(input: string): Buffer {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64");
}

function hmacSha256(key: string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

export function signAppToken(
  payload: Omit<AppTokenPayload, "iat" | "exp">,
  secret: string,
  options?: { expiresInSeconds?: number }
): string {
  if (!secret) throw new AppTokenError("APP_JWT_SECRET is not configured");
  if (!payload?.sub) throw new AppTokenError("sub is required");

  const header = { alg: "HS256", typ: "JWT" };
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + (options?.expiresInSeconds ?? 30 * 24 * 60 * 60); // 30d default

  const fullPayload: AppTokenPayload = {
    ...payload,
    iat,
    exp,
  };

  const encodedHeader = base64urlEncode(JSON.stringify(header));
  const encodedPayload = base64urlEncode(JSON.stringify(fullPayload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = base64urlEncode(hmacSha256(secret, signingInput));
  return `${signingInput}.${signature}`;
}

export function verifyAppToken(token: string, secret: string): AppTokenPayload {
  if (!secret) throw new AppTokenError("APP_JWT_SECRET is not configured");
  if (!token || typeof token !== "string") throw new AppTokenError("token is required");

  const parts = token.split(".");
  if (parts.length !== 3) throw new AppTokenError("invalid token format");

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const expectedSig = base64urlEncode(hmacSha256(secret, signingInput));

  const provided = base64urlDecode(encodedSignature);
  const expected = base64urlDecode(expectedSig);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new AppTokenError("invalid token signature");
  }

  let payload: any;
  try {
    payload = JSON.parse(base64urlDecode(encodedPayload).toString("utf8"));
  } catch {
    throw new AppTokenError("invalid token payload");
  }

  const now = Math.floor(Date.now() / 1000);
  if (!payload?.sub || typeof payload.sub !== "string") throw new AppTokenError("token sub is missing");
  if (!Number.isInteger(payload.iat) || !Number.isInteger(payload.exp)) throw new AppTokenError("token iat/exp invalid");
  if (payload.exp <= now) throw new AppTokenError("token expired");

  return payload as AppTokenPayload;
}

export function getBearerTokenFromRequest(req: Request): string | null {
  const auth = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!auth) return null;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

