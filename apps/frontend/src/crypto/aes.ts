export type EncryptedResult = {
  ciphertext: string;
  nonce: string;
};

const AES_GCM_ALGORITHM = { name: "AES-GCM", length: 256 } as const;
const NONCE_BYTES = 12;
const KEY_BYTES = 32;

function toBase64(bytes: Uint8Array | ArrayBuffer): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";

  for (let index = 0; index < view.length; index += 1) {
    binary += String.fromCharCode(view[index]);
  }

  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy.buffer;
}

async function importAesKey(key: Uint8Array): Promise<CryptoKey> {
  if (key.length !== KEY_BYTES) {
    throw new Error("AES-GCM keys must be exactly 32 bytes.");
  }

  return crypto.subtle.importKey("raw", toArrayBuffer(key), AES_GCM_ALGORITHM, false, [
    "encrypt",
    "decrypt",
  ]);
}

export function generateEncryptionKey(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(KEY_BYTES));
}

export function generateNonce(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
}

export async function encrypt(
  plaintext: string,
  key: Uint8Array,
  nonce: Uint8Array = generateNonce(),
): Promise<EncryptedResult> {
  if (nonce.length !== NONCE_BYTES) {
    throw new Error("AES-GCM nonces must be exactly 12 bytes.");
  }

  const cryptoKey = await importAesKey(key);
  const encoded = new TextEncoder().encode(plaintext);
  const cipherBytes = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: toArrayBuffer(nonce) }, cryptoKey, encoded),
  );

  return {
    ciphertext: toBase64(cipherBytes),
    nonce: toBase64(nonce),
  };
}

export async function decrypt(
  ciphertext: string,
  key: Uint8Array,
  nonce: string | Uint8Array,
): Promise<string> {
  const nonceBytes = typeof nonce === "string" ? fromBase64(nonce) : nonce;

  if (nonceBytes.length !== NONCE_BYTES) {
    throw new Error("AES-GCM nonces must be exactly 12 bytes.");
  }

  try {
    const cryptoKey = await importAesKey(key);
    const cipherBytes = fromBase64(ciphertext);
    const plainBytes = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: toArrayBuffer(nonceBytes) },
        cryptoKey,
        toArrayBuffer(cipherBytes),
      ),
    );

    return new TextDecoder().decode(plainBytes);
  } catch {
    throw new Error("Decryption failed.");
  }
}
