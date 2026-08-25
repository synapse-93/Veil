/**
 * End-to-End Encryption (E2EE) Module for Veil Chat
 *
 * Implements Zero-Knowledge End-to-End Encryption for chat capsule transfers:
 * - Uses Web Crypto API: ECDH (P-256) for Key Agreement + AES-256-GCM for Authenticated Encryption.
 * - Private keys NEVER leave the client's browser / localStorage.
 * - Server only stores encrypted ciphertext envelopes ("e2ee:v1:...").
 * - Supports dual unwrap (recipient + sender) so both participants can unlock in chat.
 */

const E2EE_KEY_PREFIX = "veil_e2ee_keypair_v1_";
const E2EE_PREFIX = "e2ee:v1:";

export type StoredKeyPairJWK = {
  publicKeyJwk: JsonWebKey;
  privateKeyJwk: JsonWebKey;
};

export type E2EEEnvelope = {
  v: 1;
  eph: {
    x: string;
    y: string;
  };
  iv: string; // base64url 12 bytes
  rCt: string; // base64url recipient ciphertext
  sCt?: string; // base64url sender ciphertext
};

// ---------------------------------------------------------------------------
// Helpers: Base64URL Encoding & Decoding
// ---------------------------------------------------------------------------

export function uint8ArrayToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function base64UrlToUint8Array(base64url: string): Uint8Array {
  let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4 !== 0) {
    base64 += "=";
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Key Management
// ---------------------------------------------------------------------------

export async function getOrCreateUserE2EEKeyPair(userId: string): Promise<{
  keyPair: CryptoKeyPair;
  publicKeyStr: string;
}> {
  const storageKey = `${E2EE_KEY_PREFIX}${userId}`;

  try {
    const cached = localStorage.getItem(storageKey);
    if (cached) {
      const parsed: StoredKeyPairJWK = JSON.parse(cached);
      const publicKey = await crypto.subtle.importKey(
        "jwk",
        parsed.publicKeyJwk,
        { name: "ECDH", namedCurve: "P-256" },
        true,
        [],
      );
      const privateKey = await crypto.subtle.importKey(
        "jwk",
        parsed.privateKeyJwk,
        { name: "ECDH", namedCurve: "P-256" },
        true,
        ["deriveKey", "deriveBits"],
      );
      const publicKeyStr = exportPublicKeyToCompactString(parsed.publicKeyJwk);
      return { keyPair: { publicKey, privateKey }, publicKeyStr };
    }
  } catch (err) {
    console.warn("[E2EE] Failed to load cached key pair, generating new one:", err);
  }

  // Generate new ECDH P-256 key pair
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey", "deriveBits"],
  );

  const publicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);

  try {
    localStorage.setItem(
      storageKey,
      JSON.stringify({ publicKeyJwk, privateKeyJwk }),
    );
  } catch (err) {
    console.warn("[E2EE] Failed to save key pair to localStorage:", err);
  }

  const publicKeyStr = exportPublicKeyToCompactString(publicKeyJwk);
  return { keyPair, publicKeyStr };
}

export function exportPublicKeyToCompactString(jwk: JsonWebKey): string {
  if (!jwk.x || !jwk.y) {
    throw new Error("Invalid EC public key JWK: missing x or y coordinates");
  }
  const payload = JSON.stringify({ crv: jwk.crv || "P-256", x: jwk.x, y: jwk.y });
  return uint8ArrayToBase64Url(new TextEncoder().encode(payload));
}

export async function importCompactPublicKey(compactStr: string): Promise<CryptoKey> {
  try {
    const raw = base64UrlToUint8Array(compactStr);
    const json = JSON.parse(new TextDecoder().decode(raw));
    const jwk: JsonWebKey = {
      kty: "EC",
      crv: json.crv || "P-256",
      x: json.x,
      y: json.y,
    };
    return await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "ECDH", namedCurve: "P-256" },
      true,
      [],
    );
  } catch (err) {
    throw new Error(`Failed to import recipient public key: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Encryption & Decryption
// ---------------------------------------------------------------------------

export async function encryptFragmentForE2EE(
  fragment: string,
  recipientPublicKeyCompact: string,
  senderUserId: string,
): Promise<string> {
  const { keyPair } = await getOrCreateUserE2EEKeyPair(senderUserId);
  const recipientPubKey = await importCompactPublicKey(recipientPublicKeyCompact);

  // Generate ephemeral ECDH key pair
  const ephKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey", "deriveBits"],
  );

  // Derive AES-256-GCM key for Recipient
  const recipientDerivedKey = await crypto.subtle.deriveKey(
    { name: "ECDH", public: recipientPubKey },
    ephKeyPair.privateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );

  // Derive AES-256-GCM key for Sender (so sender can also review/open their own sent capsule)
  const senderDerivedKey = await crypto.subtle.deriveKey(
    { name: "ECDH", public: keyPair.publicKey },
    ephKeyPair.privateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintextBytes = new TextEncoder().encode(fragment);

  const recipientCt = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    recipientDerivedKey,
    plaintextBytes,
  );

  const senderCt = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    senderDerivedKey,
    plaintextBytes,
  );

  const ephJwk = await crypto.subtle.exportKey("jwk", ephKeyPair.publicKey);
  if (!ephJwk.x || !ephJwk.y) {
    throw new Error("Failed to export ephemeral public key coordinates");
  }

  const envelope: E2EEEnvelope = {
    v: 1,
    eph: {
      x: ephJwk.x,
      y: ephJwk.y,
    },
    iv: uint8ArrayToBase64Url(iv),
    rCt: uint8ArrayToBase64Url(new Uint8Array(recipientCt)),
    sCt: uint8ArrayToBase64Url(new Uint8Array(senderCt)),
  };

  const serializedEnvelope = JSON.stringify(envelope);
  return `${E2EE_PREFIX}${uint8ArrayToBase64Url(new TextEncoder().encode(serializedEnvelope))}`;
}

export async function decryptFragmentFromE2EE(
  encryptedOrRawFragment: string,
  currentUserId: string,
): Promise<string> {
  if (!encryptedOrRawFragment) {
    return "";
  }

  if (!encryptedOrRawFragment.startsWith(E2EE_PREFIX)) {
    // Plaintext or legacy fragment - return as-is
    return encryptedOrRawFragment;
  }

  try {
    const rawPayload = encryptedOrRawFragment.slice(E2EE_PREFIX.length);
    const envelopeJson = new TextDecoder().decode(base64UrlToUint8Array(rawPayload));
    const envelope: E2EEEnvelope = JSON.parse(envelopeJson);

    if (envelope.v !== 1 || !envelope.eph?.x || !envelope.eph?.y || !envelope.iv) {
      throw new Error("Invalid E2EE envelope structure");
    }

    const { keyPair } = await getOrCreateUserE2EEKeyPair(currentUserId);

    const ephPubKey = await crypto.subtle.importKey(
      "jwk",
      {
        kty: "EC",
        crv: "P-256",
        x: envelope.eph.x,
        y: envelope.eph.y,
      },
      { name: "ECDH", namedCurve: "P-256" },
      true,
      [],
    );

    const sharedAesKey = await crypto.subtle.deriveKey(
      { name: "ECDH", public: ephPubKey },
      keyPair.privateKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"],
    );

    const iv = base64UrlToUint8Array(envelope.iv);

    // Try recipient ciphertext first
    if (envelope.rCt) {
      try {
        const ctBytes = base64UrlToUint8Array(envelope.rCt);
        const plainBytes = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv },
          sharedAesKey,
          ctBytes,
        );
        return new TextDecoder().decode(plainBytes);
      } catch {
        // Not recipient or failed, continue to check sender ciphertext
      }
    }

    // Try sender ciphertext
    if (envelope.sCt) {
      try {
        const ctBytes = base64UrlToUint8Array(envelope.sCt);
        const plainBytes = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv },
          sharedAesKey,
          ctBytes,
        );
        return new TextDecoder().decode(plainBytes);
      } catch (err) {
        throw new Error("Failed to decrypt sender ciphertext envelope");
      }
    }

    throw new Error("Could not decrypt capsule fragment with current user keys");
  } catch (err) {
    console.error("[E2EE] Decryption error:", err);
    throw err;
  }
}
