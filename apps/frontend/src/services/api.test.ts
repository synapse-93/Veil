import { describe, expect, it, vi } from "vitest";
import type { CapsuleCreationRequest } from "@secureshare/shared";
import {
  ApiError,
  ApiHttpError,
  ApiValidationError,
  consumeCapsule,
  createCapsule,
} from "./api.js";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

/** A well-formed server response that satisfies capsuleResponseSchema. */
const validCapsuleResponse = {
  metadata: {
    id: "00000000-0000-0000-0000-000000000001",
    recipe: "QUICK",
    createdAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2026-01-08T00:00:00.000Z",
    maxViews: 5,
    currentViews: 0,
    requiresPassword: false,
    burnAfterRead: false,
  },
  encryptedPayload: {
    ciphertext: "base64url-ciphertext",
    nonce: "base64url-nonce",
    algorithm: "AES-GCM-256",
  },
};

/**
 * A valid create-capsule request.
 * encryptedPayload contains ONLY the three server-visible fields.
 */
const validCreateParams: CapsuleCreationRequest = {
  encryptedPayload: {
    ciphertext: "base64url-ciphertext",
    nonce: "base64url-nonce",
    algorithm: "AES-GCM-256",
  },
  recipe: "QUICK",
  ttlSeconds: 604800,
  maxViews: 5,
  requiresPassword: false,
  burnAfterRead: false,
};

/** Build a mock fetch that returns the given status + JSON body. */
function mockFetch(status: number, body: unknown): typeof globalThis.fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

/** Build a mock fetch that rejects (network failure). */
function failingFetch(message = "Failed to fetch"): typeof globalThis.fetch {
  return vi.fn().mockRejectedValue(new Error(message));
}

// ---------------------------------------------------------------------------
// createCapsule
// ---------------------------------------------------------------------------

describe("createCapsule", () => {
  it("sends POST /capsules and returns the parsed response", async () => {
    const fetch = mockFetch(201, validCapsuleResponse);
    const result = await createCapsule(validCreateParams, { fetch });

    expect(result.metadata.id).toBe("00000000-0000-0000-0000-000000000001");
    expect(result.metadata.recipe).toBe("QUICK");
    expect(result.encryptedPayload.algorithm).toBe("AES-GCM-256");
  });

  it("sends the request to /capsules with method POST", async () => {
    const fetch = mockFetch(201, validCapsuleResponse);
    await createCapsule(validCreateParams, { fetch });

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/capsules");
    expect(init.method).toBe("POST");
  });

  it("sets Content-Type: application/json", async () => {
    const fetch = mockFetch(201, validCapsuleResponse);
    await createCapsule(validCreateParams, { fetch });

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("prefixes the URL with baseUrl when provided", async () => {
    const fetch = mockFetch(201, validCapsuleResponse);
    await createCapsule(validCreateParams, { fetch, baseUrl: "https://api.example.com" });

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).toBe("https://api.example.com/capsules");
  });

  it("sends the encryptedPayload with only the three allowed server-visible fields", async () => {
    const fetch = mockFetch(201, validCapsuleResponse);
    await createCapsule(validCreateParams, { fetch });

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const sent = JSON.parse(init.body as string) as Record<string, unknown>;
    const payloadKeys = Object.keys(sent["encryptedPayload"] as object).sort();

    expect(payloadKeys).toEqual(["algorithm", "ciphertext", "nonce"]);
  });

  it("never sends URL fragment, decryption key, or KDF material in the request body", async () => {
    const fetch = mockFetch(201, validCapsuleResponse);
    await createCapsule(validCreateParams, { fetch });

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const sent = JSON.parse(init.body as string) as Record<string, unknown>;
    const payload = sent["encryptedPayload"] as Record<string, unknown>;

    // Top-level request must not contain secret material
    for (const forbidden of ["fragment", "key", "dek", "kek", "salt", "password"]) {
      expect(sent, `unexpected top-level field: ${forbidden}`).not.toHaveProperty(forbidden);
    }

    // encryptedPayload must not contain client-side decryption material
    for (const forbidden of ["wrappedKey", "wrapNonce", "salt", "kdf", "iv", "authTag", "key"]) {
      expect(payload, `unexpected payload field: ${forbidden}`).not.toHaveProperty(forbidden);
    }
  });

  it("does not include any password verifier in the request", async () => {
    const fetch = mockFetch(201, {
      ...validCapsuleResponse,
      metadata: { ...validCapsuleResponse.metadata, requiresPassword: true },
    });
    const passwordProtectedRequest: CapsuleCreationRequest = {
      ...validCreateParams,
      recipe: "NUCLEAR",
      ttlSeconds: 900,
      maxViews: 1,
      requiresPassword: true,
      burnAfterRead: true,
    };

    await createCapsule(passwordProtectedRequest, { fetch });

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const sent = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(sent).not.toHaveProperty("passwordVerifier");
  });

  it("throws ApiHttpError(400) on a 400 response", async () => {
    const fetch = mockFetch(400, { error: "Invalid request" });
    const err = await createCapsule(validCreateParams, { fetch }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiHttpError);
    expect((err as ApiHttpError).status).toBe(400);
  });

  it("throws ApiHttpError(500) on a 500 response", async () => {
    const fetch = mockFetch(500, { error: "Internal Server Error" });
    const err = await createCapsule(validCreateParams, { fetch }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiHttpError);
    expect((err as ApiHttpError).status).toBe(500);
  });

  it("ApiHttpError carries the response body", async () => {
    const errorBody = { error: "Invalid request", details: ["bad field"] };
    const fetch = mockFetch(400, errorBody);
    const err = await createCapsule(validCreateParams, { fetch }).catch((e: unknown) => e);
    expect((err as ApiHttpError).responseBody).toEqual(errorBody);
  });

  it("throws ApiValidationError when the response is missing required fields", async () => {
    const fetch = mockFetch(201, { metadata: { id: "only-metadata" } });
    const err = await createCapsule(validCreateParams, { fetch }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiValidationError);
  });

  it("throws ApiValidationError when encryptedPayload has the wrong shape", async () => {
    const fetch = mockFetch(201, {
      ...validCapsuleResponse,
      encryptedPayload: { salt: "bad", algorithm: "RC4" }, // legacy / wrong shape
    });
    const err = await createCapsule(validCreateParams, { fetch }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiValidationError);
  });

  it("ApiValidationError exposes the Zod issues", async () => {
    const fetch = mockFetch(201, { broken: true });
    const err = await createCapsule(validCreateParams, { fetch }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiValidationError);
    expect(Array.isArray((err as ApiValidationError).issues)).toBe(true);
  });

  it("throws ApiError on a network failure", async () => {
    const fetch = failingFetch("Failed to fetch");
    const err = await createCapsule(validCreateParams, { fetch }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).cause).toBeInstanceOf(Error);
  });
});

// ---------------------------------------------------------------------------
// consumeCapsule
// ---------------------------------------------------------------------------

describe("consumeCapsule", () => {
  const CAPSULE_ID = "00000000-0000-0000-0000-000000000001";

  const consumedResponse = {
    ...validCapsuleResponse,
    metadata: { ...validCapsuleResponse.metadata, currentViews: 1 },
  };

  it("sends POST /capsules/:id/consume and returns the parsed response", async () => {
    const fetch = mockFetch(200, consumedResponse);
    const result = await consumeCapsule(CAPSULE_ID, { fetch });

    expect(result.metadata.id).toBe(CAPSULE_ID);
    expect(result.encryptedPayload.ciphertext).toBe("base64url-ciphertext");
  });

  it("sends the request to the correct URL with method POST", async () => {
    const fetch = mockFetch(200, consumedResponse);
    await consumeCapsule(CAPSULE_ID, { fetch });

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/capsules/${CAPSULE_ID}/consume`);
    expect(init.method).toBe("POST");
  });

  it("URL-encodes the capsule ID", async () => {
    const fetch = mockFetch(200, {
      ...consumedResponse,
      metadata: { ...consumedResponse.metadata, id: "id with spaces" },
    });
    await consumeCapsule("id with spaces", { fetch });

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).toBe("/capsules/id%20with%20spaces/consume");
  });

  it("prefixes the URL with baseUrl when provided", async () => {
    const fetch = mockFetch(200, consumedResponse);
    await consumeCapsule(CAPSULE_ID, { fetch, baseUrl: "https://api.example.com" });

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).toBe(`https://api.example.com/capsules/${CAPSULE_ID}/consume`);
  });

  it("sends no request body", async () => {
    const fetch = mockFetch(200, consumedResponse);
    await consumeCapsule(CAPSULE_ID, { fetch });

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(init.body).toBeUndefined();
  });

  it("throws ApiHttpError(404) when the capsule is not found", async () => {
    const fetch = mockFetch(404, { error: "Not found" });
    const err = await consumeCapsule(CAPSULE_ID, { fetch }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiHttpError);
    expect((err as ApiHttpError).status).toBe(404);
  });

  it("throws ApiHttpError(410) when the capsule is expired or burned", async () => {
    const fetch = mockFetch(410, { error: "Capsule ... cannot be consumed: EXPIRED" });
    const err = await consumeCapsule(CAPSULE_ID, { fetch }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiHttpError);
    expect((err as ApiHttpError).status).toBe(410);
  });

  it("throws ApiHttpError(429) when the view limit has been reached", async () => {
    const fetch = mockFetch(429, { error: "Capsule ... cannot be consumed: VIEW_LIMIT_REACHED" });
    const err = await consumeCapsule(CAPSULE_ID, { fetch }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiHttpError);
    expect((err as ApiHttpError).status).toBe(429);
  });

  it("throws ApiValidationError when the response has an unexpected shape", async () => {
    const fetch = mockFetch(200, { not: "a capsule" });
    const err = await consumeCapsule(CAPSULE_ID, { fetch }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiValidationError);
  });

  it("throws ApiValidationError when encryptedPayload contains legacy/extra fields", async () => {
    const fetch = mockFetch(200, {
      ...consumedResponse,
      encryptedPayload: {
        ciphertext: "c",
        nonce: "n",
        algorithm: "AES-GCM-256",
        salt: "should-not-be-here",
      },
    });
    const err = await consumeCapsule(CAPSULE_ID, { fetch }).catch((e: unknown) => e);
    // encryptedPayloadSchema is .strict(), so extra fields cause rejection
    expect(err).toBeInstanceOf(ApiValidationError);
  });

  it("throws ApiError on a network failure", async () => {
    const fetch = failingFetch("ERR_CONNECTION_REFUSED");
    const err = await consumeCapsule(CAPSULE_ID, { fetch }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
  });
});

describe("sendMessage", () => {
  it("preserves shareFragment while sanitizing content for capsule messages", async () => {
    const { sendMessage } = await import("./api.js");
    const fetch = mockFetch(201, {
      id: "msg-1",
      conversationId: "conv-1",
      senderId: "user-1",
      type: "CAPSULE",
      content: "https://example.com/share/cap-123",
      shareFragment: "sec-frag-xyz",
      createdAt: new Date().toISOString(),
    });

    const res = await sendMessage(
      "conv-1",
      {
        type: "CAPSULE",
        content: "https://example.com/share/cap-123#sec-frag-xyz",
        shareFragment: "sec-frag-xyz",
        capsuleId: "cap-123",
      },
      { fetch },
    );

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);

    expect(body.content).toBe("https://example.com/share/cap-123");
    expect(body.shareFragment).toBe("sec-frag-xyz");
    expect(res.shareFragment).toBe("sec-frag-xyz");
  });

  it("extracts shareFragment from content URL if shareFragment wasn't explicitly passed", async () => {
    const { sendMessage } = await import("./api.js");
    const fetch = mockFetch(201, {
      id: "msg-2",
      conversationId: "conv-1",
      senderId: "user-1",
      type: "CAPSULE",
      content: "https://example.com/share/cap-999",
      shareFragment: "auto-extracted-frag",
      createdAt: new Date().toISOString(),
    });

    await sendMessage(
      "conv-1",
      {
        type: "CAPSULE",
        content: "https://example.com/share/cap-999#auto-extracted-frag",
        capsuleId: "cap-999",
      },
      { fetch },
    );

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);

    expect(body.content).toBe("https://example.com/share/cap-999");
    expect(body.shareFragment).toBe("auto-extracted-frag");
  });
});

