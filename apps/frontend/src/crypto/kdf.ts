export const PBKDF2_ITERATIONS = 600_000;
export const SALT_BYTE_LENGTH = 16;
export const DERIVED_KEY_BYTE_LENGTH = 32;

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy.buffer;
}

export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_BYTE_LENGTH));
}

export async function deriveKeyFromPassword(
  password: string,
  salt: Uint8Array,
): Promise<Uint8Array> {
  if (salt.length !== SALT_BYTE_LENGTH) {
    throw new Error(`PBKDF2 salt must be exactly ${SALT_BYTE_LENGTH} bytes.`);
  }

  const passwordKey = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(new TextEncoder().encode(password)),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations: PBKDF2_ITERATIONS,
      salt: toArrayBuffer(salt),
    },
    passwordKey,
    DERIVED_KEY_BYTE_LENGTH * 8,
  );

  return new Uint8Array(derivedBits);
}
