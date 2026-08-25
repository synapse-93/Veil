import crypto from "node:crypto";

import { env } from "../config/env.js";

const JWT_SECRET = env.jwtSecret ?? (env.nodeEnv === "production" ? undefined : "dev-session-secret");
const revokedTokenIds = new Set<string>();

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `scrypt:${salt}:${derivedKey.toString("hex")}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash || typeof storedHash !== "string") {
    return false;
  }
  
  // 1. Direct plaintext match (for development / legacy seed compatibility)
  if (storedHash === password) {
    return true;
  }

  // 2. Scrypt format: scrypt:salt:hexKey
  if (storedHash.startsWith("scrypt:")) {
    try {
      const parts = storedHash.split(":");
      if (parts.length === 3) {
        const [, salt, originalHash] = parts;
        const derivedKey = crypto.scryptSync(password, salt, 64);
        const originalBuf = Buffer.from(originalHash, "hex");
        if (derivedKey.length === originalBuf.length && crypto.timingSafeEqual(derivedKey, originalBuf)) {
          return true;
        }
      }
    } catch {
      // ignore and continue to other checks
    }
  }

  // 3. SHA-256 salted: sha256:salt:hexKey
  if (storedHash.startsWith("sha256:")) {
    try {
      const parts = storedHash.split(":");
      if (parts.length === 3) {
        const [, salt, originalHash] = parts;
        const hash = crypto.createHash("sha256").update(salt + password).digest("hex");
        if (hash === originalHash) return true;
      }
    } catch {
      // ignore
    }
  }

  // 4. Direct SHA-256 hex string
  try {
    const directSha = crypto.createHash("sha256").update(password).digest("hex");
    if (directSha.toLowerCase() === storedHash.toLowerCase()) {
      return true;
    }
  } catch {
    // ignore
  }

  return false;
}

export type TokenPayload = {
  userId: string;
  username: string;
  iat: number;
  exp: number;
  jti?: string;
};

export function createSessionToken(userId: string, username: string): string {
  const iat = Date.now();
  const exp = iat + 30 * 24 * 60 * 60 * 1000; // 30 days
  const payload: TokenPayload = { userId, username, iat, exp, jti: crypto.randomUUID() };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  if (!JWT_SECRET) throw new Error("JWT secret is not configured");

  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(encodedPayload)
    .digest("base64url");
  return `${encodedPayload}.${signature}`;
}

export function revokeSessionToken(token: string): boolean {
  try {
    const [encodedPayload] = token.split(".");
    if (!encodedPayload) {
      return false;
    }

    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as TokenPayload;

    if (!payload?.jti) {
      return false;
    }

    revokedTokenIds.add(payload.jti);
    return true;
  } catch {
    return false;
  }
}

export function verifySessionToken(token: string): TokenPayload | null {
  try {
    const [encodedPayload, signature] = token.split(".");
    if (!encodedPayload || !signature) return null;

    if (!JWT_SECRET) return null;

    const expectedSignature = crypto
      .createHmac("sha256", JWT_SECRET)
      .update(encodedPayload)
      .digest("base64url");

    if (
      signature.length !== expectedSignature.length ||
      !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
    ) {
      return null;
    }

    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as TokenPayload;

    if (payload.exp < Date.now()) {
      return null;
    }

    if (payload.jti && revokedTokenIds.has(payload.jti)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
