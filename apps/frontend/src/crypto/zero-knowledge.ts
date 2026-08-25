import { decrypt as decryptString, encrypt as encryptString, generateEncryptionKey, generateNonce } from "./aes.js";
import { PBKDF2_ITERATIONS, SALT_BYTE_LENGTH, deriveKeyFromPassword, generateSalt } from "./kdf.js";

export type ServerPayload = {
  ciphertext: string;
  nonce: string;
  algorithm: "AES-GCM-256";
};

export type PlainShareFragment = {
  version: 1;
  mode: "plain";
  key: string;
};

export type PasswordShareFragment = {
  version: 1;
  mode: "password";
  wrappedKey: string;
  wrapNonce: string;
  salt: string;
  kdf: "PBKDF2-SHA256";
  iterations: number;
};

export type ShareFragment = PlainShareFragment | PasswordShareFragment;

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy.buffer;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function encodeFragmentPayload(payload: ShareFragment): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
}

function decodeBase64UrlField(value: unknown, fieldName: string): Uint8Array {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Share fragment is missing the ${fieldName}.`);
  }

  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error(`Share fragment field ${fieldName} must be valid Base64URL.`);
  }

  return fromBase64Url(value);
}

export function decodeFragment(rawFragment: string): ShareFragment {
  const fragment = rawFragment.startsWith("#") ? rawFragment.slice(1) : rawFragment;

  if (!fragment) {
    throw new Error("Share fragment is missing.");
  }

  let parsed: unknown;

  try {
    const bytes = fromBase64Url(fragment);
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error("Malformed share fragment.");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Malformed share fragment structure.");
  }

  const candidate = parsed as Record<string, unknown>;
  if (candidate.version !== 1) {
    throw new Error("Unsupported share fragment version.");
  }

  if (candidate.mode === "plain") {
    const keyBytes = decodeBase64UrlField(candidate.key, "key");
    if (keyBytes.length !== 32) {
      throw new Error("Plain share fragment key must decode to exactly 32 bytes.");
    }

    return { version: 1, mode: "plain", key: candidate.key as string } satisfies PlainShareFragment;
  }

  if (candidate.mode === "password") {
    const wrappedKey = candidate.wrappedKey;
    const wrapNonce = candidate.wrapNonce;
    const salt = candidate.salt;
    const kdf = candidate.kdf;
    const iterations = candidate.iterations;

    const wrappedKeyBytes = decodeBase64UrlField(wrappedKey, "wrappedKey");
    const wrapNonceBytes = decodeBase64UrlField(wrapNonce, "wrapNonce");
    const saltBytes = decodeBase64UrlField(salt, "salt");

    if (wrappedKeyBytes.length !== 48) {
      throw new Error("Password share fragment wrappedKey must decode to exactly 48 bytes.");
    }
    if (wrapNonceBytes.length !== 12) {
      throw new Error("Password share fragment wrapNonce must decode to exactly 12 bytes.");
    }
    if (saltBytes.length !== 16) {
      throw new Error("Password share fragment salt must decode to exactly 16 bytes.");
    }

    if (kdf !== "PBKDF2-SHA256") {
      throw new Error("Unsupported KDF in share fragment.");
    }
    if (typeof iterations !== "number" || iterations !== PBKDF2_ITERATIONS) {
      throw new Error("Unsupported PBKDF2 iteration count.");
    }

    return {
      version: 1,
      mode: "password",
      wrappedKey: wrappedKey as string,
      wrapNonce: wrapNonce as string,
      salt: salt as string,
      kdf: "PBKDF2-SHA256",
      iterations,
    } satisfies PasswordShareFragment;
  }

  throw new Error("Unsupported share fragment mode.");
}

async function encryptBinaryBytes(plaintext: Uint8Array, key: Uint8Array, nonce: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey("raw", toArrayBuffer(key), { name: "AES-GCM", length: 256 }, false, [
    "encrypt",
  ]);

  const cipherBytes = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(nonce) },
    cryptoKey,
    toArrayBuffer(plaintext),
  );

  return new Uint8Array(cipherBytes);
}

async function decryptBinaryBytes(ciphertext: Uint8Array, key: Uint8Array, nonce: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey("raw", toArrayBuffer(key), { name: "AES-GCM", length: 256 }, false, [
    "decrypt",
  ]);

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(nonce) },
    cryptoKey,
    toArrayBuffer(ciphertext),
  );

  return new Uint8Array(plaintext);
}

export async function encryptForShare(
  plaintext: string,
  password?: string,
): Promise<{ serverPayload: ServerPayload; fragment: string }> {
  if (password === undefined) {
    const dek = generateEncryptionKey();
    const nonce = generateNonce();
    const encrypted = await encryptString(plaintext, dek, nonce);

    return {
      serverPayload: {
        ciphertext: encrypted.ciphertext,
        nonce: encrypted.nonce,
        algorithm: "AES-GCM-256",
      },
      fragment: encodeFragmentPayload({ version: 1, mode: "plain", key: toBase64Url(dek) }),
    };
  }

  if (password === "") {
    throw new Error("Password cannot be empty.");
  }

  const dek = generateEncryptionKey();
  const plaintextNonce = generateNonce();
  const encrypted = await encryptString(plaintext, dek, plaintextNonce);
  const salt = generateSalt();
  const kek = await deriveKeyFromPassword(password, salt);
  const wrapNonce = generateNonce();
  const wrappedKey = await encryptBinaryBytes(dek, kek, wrapNonce);

  return {
    serverPayload: {
      ciphertext: encrypted.ciphertext,
      nonce: encrypted.nonce,
      algorithm: "AES-GCM-256",
    },
    fragment: encodeFragmentPayload({
      version: 1,
      mode: "password",
      wrappedKey: toBase64Url(wrappedKey),
      wrapNonce: toBase64Url(wrapNonce),
      salt: toBase64Url(salt),
      kdf: "PBKDF2-SHA256",
      iterations: PBKDF2_ITERATIONS,
    }),
  };
}

export async function decryptFromShare(
  serverPayload: ServerPayload,
  fragment: string,
  password?: string,
): Promise<string> {
  if (serverPayload.algorithm !== "AES-GCM-256") {
    throw new Error("Unsupported encryption algorithm.");
  }

  const decoded = decodeFragment(fragment);

  try {
    if (decoded.mode === "plain") {
      const dek = fromBase64Url(decoded.key);
      return decryptString(serverPayload.ciphertext, dek, serverPayload.nonce);
    }

    if (typeof password !== "string" || password.length === 0) {
      throw new Error("Password is required for protected shares.");
    }

    const wrappedKey = decodeBase64UrlField(decoded.wrappedKey, "wrappedKey");
    const wrapNonce = decodeBase64UrlField(decoded.wrapNonce, "wrapNonce");
    const salt = decodeBase64UrlField(decoded.salt, "salt");
    const dek = await decryptBinaryBytes(wrappedKey, await deriveKeyFromPassword(password, salt), wrapNonce);

    return decryptString(serverPayload.ciphertext, dek, serverPayload.nonce);
  } catch {
    throw new Error("Decryption failed.");
  }
}

export const parseShareFragment = decodeFragment;

/**
 * Validates `password` against the wrapped key stored in a password-mode
 * share fragment WITHOUT consuming the capsule (no server call).
 *
 * Returns `true` when the fragment is plain-mode (no password required) or
 * when the password correctly unwraps the DEK.
 * Returns `false` when the password is wrong.
 */
export async function verifyFragmentPassword(
  fragment: string,
  password: string,
): Promise<boolean> {
  try {
    const decoded = decodeFragment(fragment);
    if (decoded.mode !== "password") return true;

    const wrappedKey = decodeBase64UrlField(decoded.wrappedKey, "wrappedKey");
    const wrapNonce = decodeBase64UrlField(decoded.wrapNonce, "wrapNonce");
    const salt = decodeBase64UrlField(decoded.salt, "salt");
    const kek = await deriveKeyFromPassword(password, salt);
    await decryptBinaryBytes(wrappedKey, kek, wrapNonce);
    return true;
  } catch {
    return false;
  }
}
