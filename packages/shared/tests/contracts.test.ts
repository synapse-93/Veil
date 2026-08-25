import { describe, expect, it } from "vitest";

import {
  capsuleCreationRequestSchema,
  capsuleMetadataSchema,
  capsuleResponseSchema,
  encryptedPayloadSchema,
} from "../src/validation/capsule.schema.js";
import { sendMessageSchema } from "../src/validation/social.schema.js";
import { createShareLink, isSafeShareLink, parseShareLink } from "../src/share/link.js";

const validEncryptedPayload = {
  ciphertext: "ciphertext",
  nonce: "nonce-value",
  algorithm: "AES-GCM-256",
};

const validMetadata = {
  id: "capsule-123",
  recipe: "QUICK",
  createdAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2026-01-02T00:00:00.000Z",
  maxViews: 3,
  currentViews: 1,
  requiresPassword: false,
  burnAfterRead: false,
};

describe("encrypted payload schema", () => {
  it("accepts a canonical server payload", () => {
    expect(encryptedPayloadSchema.parse(validEncryptedPayload)).toMatchObject({
      ciphertext: "ciphertext",
      nonce: "nonce-value",
      algorithm: "AES-GCM-256",
    });
  });

  it("rejects payloads missing nonce", () => {
    expect(() =>
      encryptedPayloadSchema.parse({
        ciphertext: "ciphertext",
        algorithm: "AES-GCM-256",
      }),
    ).toThrow();
  });

  it("rejects missing ciphertext", () => {
    expect(() =>
      encryptedPayloadSchema.parse({
        nonce: "nonce-value",
        algorithm: "AES-GCM-256",
      }),
    ).toThrow();
  });

  it("rejects missing algorithm", () => {
    expect(() =>
      encryptedPayloadSchema.parse({
        ciphertext: "ciphertext",
        nonce: "nonce-value",
      }),
    ).toThrow();
  });

  it("rejects extra server payload fields", () => {
    expect(() =>
      encryptedPayloadSchema.parse({
        ciphertext: "ciphertext",
        nonce: "nonce-value",
        algorithm: "AES-GCM-256",
        salt: "salt-value",
      }),
    ).toThrow();
  });
});

describe("capsule creation schema", () => {
  it("accepts valid QUICK, SECURE, and NUCLEAR requests at the recipe maximums", () => {
    expect(
      capsuleCreationRequestSchema.parse({
        encryptedPayload: validEncryptedPayload,
        recipe: "QUICK",
        ttlSeconds: 604800,
        maxViews: 10,
        requiresPassword: false,
        burnAfterRead: false,
      }),
    ).toMatchObject({ recipe: "QUICK" });

    expect(
      capsuleCreationRequestSchema.parse({
        encryptedPayload: validEncryptedPayload,
        recipe: "SECURE",
        ttlSeconds: 86400,
        maxViews: 3,
        requiresPassword: false,
        burnAfterRead: false,
      }),
    ).toMatchObject({ recipe: "SECURE" });

    expect(
      capsuleCreationRequestSchema.parse({
        encryptedPayload: validEncryptedPayload,
        recipe: "NUCLEAR",
        ttlSeconds: 900,
        maxViews: 1,
        requiresPassword: true,
        burnAfterRead: true,
      }),
    ).toMatchObject({ recipe: "NUCLEAR" });
  });

  it("rejects TTL above each recipe limit", () => {
    expect(() =>
      capsuleCreationRequestSchema.parse({
        encryptedPayload: validEncryptedPayload,
        recipe: "QUICK",
        ttlSeconds: 604801,
        maxViews: 10,
        requiresPassword: false,
        burnAfterRead: false,
      }),
    ).toThrow();

    expect(() =>
      capsuleCreationRequestSchema.parse({
        encryptedPayload: validEncryptedPayload,
        recipe: "SECURE",
        ttlSeconds: 86401,
        maxViews: 3,
        requiresPassword: false,
        burnAfterRead: false,
      }),
    ).toThrow();

    expect(() =>
      capsuleCreationRequestSchema.parse({
        encryptedPayload: validEncryptedPayload,
        recipe: "NUCLEAR",
        ttlSeconds: 901,
        maxViews: 1,
        requiresPassword: true,
        burnAfterRead: true,
      }),
    ).toThrow();
  });

  it("rejects views above each recipe limit", () => {
    expect(() =>
      capsuleCreationRequestSchema.parse({
        encryptedPayload: validEncryptedPayload,
        recipe: "QUICK",
        ttlSeconds: 60,
        maxViews: 11,
        requiresPassword: false,
        burnAfterRead: false,
      }),
    ).toThrow();

    expect(() =>
      capsuleCreationRequestSchema.parse({
        encryptedPayload: validEncryptedPayload,
        recipe: "SECURE",
        ttlSeconds: 60,
        maxViews: 4,
        requiresPassword: false,
        burnAfterRead: false,
      }),
    ).toThrow();

    expect(() =>
      capsuleCreationRequestSchema.parse({
        encryptedPayload: validEncryptedPayload,
        recipe: "NUCLEAR",
        ttlSeconds: 60,
        maxViews: 2,
        requiresPassword: true,
        burnAfterRead: true,
      }),
    ).toThrow();
  });

  it("accepts password-protected capsules without a server-side verifier", () => {
    expect(
      capsuleCreationRequestSchema.parse({
        encryptedPayload: validEncryptedPayload,
        recipe: "NUCLEAR",
        ttlSeconds: 900,
        maxViews: 1,
        requiresPassword: true,
        burnAfterRead: true,
      }),
    ).toMatchObject({ recipe: "NUCLEAR" });
  });

  it("rejects invalid NUCLEAR password, burn, and view combinations", () => {
    expect(() =>
      capsuleCreationRequestSchema.parse({
        encryptedPayload: validEncryptedPayload,
        recipe: "NUCLEAR",
        ttlSeconds: 900,
        maxViews: 1,
        requiresPassword: false,
        burnAfterRead: true,
      }),
    ).toThrow();

    expect(() =>
      capsuleCreationRequestSchema.parse({
        encryptedPayload: validEncryptedPayload,
        recipe: "NUCLEAR",
        ttlSeconds: 900,
        maxViews: 1,
        requiresPassword: true,
        burnAfterRead: false,
      }),
    ).toThrow();

    expect(() =>
      capsuleCreationRequestSchema.parse({
        encryptedPayload: validEncryptedPayload,
        recipe: "NUCLEAR",
        ttlSeconds: 900,
        maxViews: 2,
        requiresPassword: true,
        burnAfterRead: true,
      }),
    ).toThrow();
  });

  it("rejects QUICK and SECURE burnAfterRead=true", () => {
    expect(() =>
      capsuleCreationRequestSchema.parse({
        encryptedPayload: validEncryptedPayload,
        recipe: "QUICK",
        ttlSeconds: 60,
        maxViews: 2,
        requiresPassword: false,
        burnAfterRead: true,
      }),
    ).toThrow();

    expect(() =>
      capsuleCreationRequestSchema.parse({
        encryptedPayload: validEncryptedPayload,
        recipe: "SECURE",
        ttlSeconds: 60,
        maxViews: 2,
        requiresPassword: false,
        burnAfterRead: true,
      }),
    ).toThrow();
  });
});

describe("capsule metadata schema", () => {
  it("accepts valid metadata", () => {
    expect(capsuleMetadataSchema.parse(validMetadata)).toMatchObject({ id: "capsule-123" });
  });

  it("rejects invalid or missing ID", () => {
    expect(() => capsuleMetadataSchema.parse({ ...validMetadata, id: "" })).toThrow();
    expect(() =>
      capsuleMetadataSchema.parse({
        ...validMetadata,
        id: undefined,
      }),
    ).toThrow();
  });

  it("rejects invalid createdAt or expiresAt values", () => {
    expect(() =>
      capsuleMetadataSchema.parse({
        ...validMetadata,
        createdAt: "not-a-date",
      }),
    ).toThrow();

    expect(() =>
      capsuleMetadataSchema.parse({
        ...validMetadata,
        expiresAt: "not-a-date",
      }),
    ).toThrow();
  });

  it("rejects negative currentViews", () => {
    expect(() =>
      capsuleMetadataSchema.parse({
        ...validMetadata,
        currentViews: -1,
      }),
    ).toThrow();
  });
});

describe("capsule response schema", () => {
  it("accepts a valid response", () => {
    expect(
      capsuleResponseSchema.parse({
        metadata: validMetadata,
        encryptedPayload: validEncryptedPayload,
      }),
    ).toMatchObject({ metadata: { id: "capsule-123" } });
  });

  it("rejects invalid metadata", () => {
    expect(() =>
      capsuleResponseSchema.parse({
        metadata: { ...validMetadata, id: "" },
        encryptedPayload: validEncryptedPayload,
      }),
    ).toThrow();
  });

  it("rejects invalid encrypted payload", () => {
    expect(() =>
      capsuleResponseSchema.parse({
        metadata: validMetadata,
        encryptedPayload: { ...validEncryptedPayload, ciphertext: "" },
      }),
    ).toThrow();
  });
});

describe("share links", () => {
  it("creates a share URL in the required format", () => {
    expect(createShareLink("example.com", "capsule-123", "decryption-key")).toBe(
      "https://example.com/share/capsule-123#decryption-key",
    );
  });

  it("preserves the explicit scheme for local dev origins", () => {
    expect(createShareLink("http://localhost:5173", "capsule-123", "decryption-key")).toBe(
      "http://localhost:5173/share/capsule-123#decryption-key",
    );
  });

  it("parses a share URL and extracts the capsule and fragment key", () => {
    const parsed = parseShareLink("https://example.com/share/capsule-123#decryption-key");

    expect(parsed).toMatchObject({
      domain: "example.com",
      capsuleId: "capsule-123",
      decryptionKey: "decryption-key",
    });
  });

  it("keeps the decryption key in the URL fragment", () => {
    const parsed = parseShareLink("https://example.com/share/capsule-123#decryption-key");
    expect(parsed.url.hash).toBe("#decryption-key");
    expect(parsed.url.search).toBe("");
  });

  it("rejects query-parameter-based decryption keys and any query parameters", () => {
    expect(() => parseShareLink("https://example.com/share/capsule-123?key=unsafe#decryption-key")).toThrow();
    expect(() => parseShareLink("https://example.com/share/capsule-123?foo=bar#decryption-key")).toThrow();
  });

  it("rejects malformed share paths", () => {
    expect(() => parseShareLink("https://example.com/not-a-share#decryption-key")).toThrow();
    expect(() => parseShareLink("https://example.com/share/#decryption-key")).toThrow();
  });

  it("rejects missing capsule IDs and missing fragments", () => {
    expect(() => parseShareLink("https://example.com/share/#decryption-key")).toThrow();
    expect(() => parseShareLink("https://example.com/share/capsule-123")).toThrow();
  });

  it("returns safe/unsafe status correctly", () => {
    expect(isSafeShareLink("https://example.com/share/capsule-123#decryption-key")).toBe(true);
    expect(isSafeShareLink("https://example.com/share/capsule-123?foo=bar#decryption-key")).toBe(false);
    expect(isSafeShareLink("https://example.com/share#decryption-key")).toBe(false);
  });
});

describe("sendMessageSchema", () => {
  it("accepts valid TEXT message", () => {
    const result = sendMessageSchema.parse({
      type: "TEXT",
      content: "Hello there!",
    });
    expect(result).toMatchObject({
      type: "TEXT",
      content: "Hello there!",
    });
  });

  it("accepts valid CAPSULE message without fragment", () => {
    const result = sendMessageSchema.parse({
      type: "CAPSULE",
      content: "Encrypted secret",
      capsuleId: "capsule-abc-123",
      recipe: "SECURE",
      expiresAt: "2026-01-02T00:00:00.000Z",
      maxViews: 3,
      burnAfterRead: false,
      requiresPassword: false,
    });
    expect(result).toMatchObject({
      type: "CAPSULE",
      capsuleId: "capsule-abc-123",
      recipe: "SECURE",
    });
    // Ensure fragment property is not defined or required
    expect((result as any).fragment).toBeUndefined();
  });

  it("rejects CAPSULE message missing required capsuleId", () => {
    expect(() =>
      sendMessageSchema.parse({
        type: "CAPSULE",
        content: "Encrypted secret",
        recipe: "SECURE",
        expiresAt: "2026-01-02T00:00:00.000Z",
        maxViews: 3,
        burnAfterRead: false,
        requiresPassword: false,
      }),
    ).toThrow();
  });
});
