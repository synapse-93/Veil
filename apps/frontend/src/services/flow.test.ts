/**
 * Frontend integration tests — 4.5G
 *
 * Proves the full sender + recipient flow, zero-knowledge contract,
 * and lifecycle error handling without making real network calls.
 */

import { describe, expect, it, vi } from "vitest";
import type { CapsuleCreationRequest, CapsuleResponse } from "@secureshare/shared";
import { createShareLink, parseShareLink } from "@secureshare/shared";
import { encryptForShare, decryptFromShare, decodeFragment, verifyFragmentPassword } from "../crypto/zero-knowledge.js";
import { createCapsule, consumeCapsule, ApiHttpError } from "./api.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildCapsuleResponse(overrides: Partial<CapsuleResponse["metadata"]> = {}): CapsuleResponse {
  return {
    metadata: {
      id: "00000000-0000-0000-0000-000000000001",
      recipe: "QUICK",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      maxViews: 5,
      currentViews: 0,
      requiresPassword: false,
      burnAfterRead: false,
      ...overrides,
    },
    encryptedPayload: {
      ciphertext: "placeholder",
      nonce: "placeholder",
      algorithm: "AES-GCM-256",
    },
  };
}

function mockFetch(status: number, body: unknown): typeof globalThis.fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

function failFetch(message = "Failed to fetch"): typeof globalThis.fetch {
  return vi.fn().mockRejectedValue(new Error(message));
}

// ---------------------------------------------------------------------------
// SENDER FLOW: plaintext → encryption → API request → share link
// ---------------------------------------------------------------------------

describe("Sender flow", () => {
  it("encrypts plaintext and sends only allowed fields to the server", async () => {
    const plaintext = "super secret message";
    const { serverPayload, fragment } = await encryptForShare(plaintext);

    // serverPayload must contain exactly ciphertext, nonce, algorithm
    expect(Object.keys(serverPayload).sort()).toEqual(["algorithm", "ciphertext", "nonce"]);
    expect(serverPayload.algorithm).toBe("AES-GCM-256");
    expect(typeof serverPayload.ciphertext).toBe("string");
    expect(typeof serverPayload.nonce).toBe("string");

    // fragment (decryption key) must be a non-empty string
    expect(typeof fragment).toBe("string");
    expect(fragment.length).toBeGreaterThan(0);
  });

  it("sends only encrypted payload and metadata — never plaintext", async () => {
    const plaintext = "secret";
    const { serverPayload } = await encryptForShare(plaintext);

    const fetch = mockFetch(201, buildCapsuleResponse());
    const params: CapsuleCreationRequest = {
      encryptedPayload: serverPayload,
      recipe: "QUICK",
      ttlSeconds: 604800,
      maxViews: 5,
      requiresPassword: false,
      burnAfterRead: false,
    };

    await createCapsule(params, { fetch });

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;

    // plaintext must not appear anywhere in the request
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(plaintext);

    // encryptedPayload has exactly the three allowed fields
    const epKeys = Object.keys(body["encryptedPayload"] as object).sort();
    expect(epKeys).toEqual(["algorithm", "ciphertext", "nonce"]);

    // No forbidden fields at top level
    for (const field of ["fragment", "key", "dek", "kek", "password", "salt"]) {
      expect(body).not.toHaveProperty(field);
    }
  });

  it("fragment never appears in the API request body", async () => {
    const { serverPayload, fragment } = await encryptForShare("classified");

    const fetch = mockFetch(201, buildCapsuleResponse());
    await createCapsule(
      {
        encryptedPayload: serverPayload,
        recipe: "QUICK",
        ttlSeconds: 604800,
        maxViews: 5,
        requiresPassword: false,
        burnAfterRead: false,
      },
      { fetch },
    );

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(init.body as string).not.toContain(fragment);
  });

  it("constructs a valid share link with the capsule ID and fragment in the hash", async () => {
    const { serverPayload, fragment } = await encryptForShare("link test");
    const fetch = mockFetch(201, buildCapsuleResponse());

    const response = await createCapsule(
      {
        encryptedPayload: serverPayload,
        recipe: "QUICK",
        ttlSeconds: 604800,
        maxViews: 5,
        requiresPassword: false,
        burnAfterRead: false,
      },
      { fetch },
    );

    const shareUrl = createShareLink("example.com", response.metadata.id, fragment);
    const parts = parseShareLink(shareUrl);

    expect(parts.capsuleId).toBe(response.metadata.id);
    expect(parts.decryptionKey).toBe(fragment);
    expect(shareUrl).toMatch(/^https:\/\/example\.com\/share\//);
    expect(shareUrl).toContain("#");
    // Path must not contain the fragment
    const url = new URL(shareUrl);
    expect(url.pathname).not.toContain(fragment);
  });
});

// ---------------------------------------------------------------------------
// RECIPIENT FLOW: share URL → consume API → decryption → plaintext
// ---------------------------------------------------------------------------

describe("Recipient flow", () => {
  it("round-trips plaintext through encrypt → consume → decrypt (plain mode)", async () => {
    const plaintext = "Hello, recipient!";
    const { serverPayload, fragment } = await encryptForShare(plaintext);

    // Simulate backend returning the encrypted payload
    const consumeResponse: CapsuleResponse = {
      metadata: buildCapsuleResponse().metadata,
      encryptedPayload: serverPayload,
    };

    const fetch = mockFetch(200, consumeResponse);
    const consumed = await consumeCapsule("00000000-0000-0000-0000-000000000001", { fetch });
    const decrypted = await decryptFromShare(consumed.encryptedPayload, fragment);

    expect(decrypted).toBe(plaintext);
  });

  it("round-trips plaintext through encrypt → consume → decrypt (password mode)", async () => {
    const plaintext = "Nuclear secret";
    const password = "str0ng-p@ssw0rd";
    const { serverPayload, fragment } = await encryptForShare(plaintext, password);

    const consumeResponse: CapsuleResponse = {
      metadata: buildCapsuleResponse({ requiresPassword: true, burnAfterRead: true }).metadata,
      encryptedPayload: serverPayload,
    };

    const fetch = mockFetch(200, consumeResponse);
    const consumed = await consumeCapsule("00000000-0000-0000-0000-000000000001", { fetch });
    const decrypted = await decryptFromShare(consumed.encryptedPayload, fragment, password);

    expect(decrypted).toBe(plaintext);
  });

  it("fragment contains plain-mode marker (no password) when created without password", async () => {
    const { fragment } = await encryptForShare("no password");
    const decoded = decodeFragment(fragment);
    expect(decoded.mode).toBe("plain");
  });

  it("fragment contains password-mode marker when created with password", async () => {
    const { fragment } = await encryptForShare("with password", "s3cr3t");
    const decoded = decodeFragment(fragment);
    expect(decoded.mode).toBe("password");
  });
});

// ---------------------------------------------------------------------------
// SECURITY: no secrets in API requests
// ---------------------------------------------------------------------------

describe("Zero-knowledge security", () => {
  it("DEK never appears in the createCapsule request", async () => {
    const { serverPayload, fragment } = await encryptForShare("zktest");
    const fetch = mockFetch(201, buildCapsuleResponse());

    await createCapsule(
      {
        encryptedPayload: serverPayload,
        recipe: "QUICK",
        ttlSeconds: 604800,
        maxViews: 5,
        requiresPassword: false,
        burnAfterRead: false,
      },
      { fetch },
    );

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const body = init.body as string;

    // The fragment contains the DEK — it must not appear in the request body
    expect(body).not.toContain(fragment);
  });

  it("password never appears in the createCapsule request for NUCLEAR mode", async () => {
    const password = "ultra-secret-pass";
    const { serverPayload } = await encryptForShare("nuclear secret", password);

    const fetch = mockFetch(201, buildCapsuleResponse({ requiresPassword: true, burnAfterRead: true }));
    await createCapsule(
      {
        encryptedPayload: serverPayload,
        recipe: "NUCLEAR",
        ttlSeconds: 900,
        maxViews: 1,
        requiresPassword: true,
        burnAfterRead: true,
      },
      { fetch },
    );

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(init.body as string).not.toContain(password);
  });

  it("decrypted plaintext never leaks into the consume request", async () => {
    const plaintext = "super sensitive";
    const { serverPayload, fragment } = await encryptForShare(plaintext);

    const consumeResponse: CapsuleResponse = {
      metadata: buildCapsuleResponse().metadata,
      encryptedPayload: serverPayload,
    };
    const fetch = mockFetch(200, consumeResponse);
    await consumeCapsule("some-id", { fetch });

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    // consumeCapsule sends no body
    expect(init.body).toBeUndefined();

    // The URL must not contain the fragment
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).not.toContain(fragment);
    expect(url).not.toContain(plaintext);
  });
});

// ---------------------------------------------------------------------------
// LIFECYCLE: error responses handled correctly
// ---------------------------------------------------------------------------

describe("Lifecycle error handling", () => {
  const CAPSULE_ID = "00000000-0000-0000-0000-000000000001";

  it("propagates 404 as ApiHttpError with status 404", async () => {
    const fetch = mockFetch(404, { error: "Not found" });
    const err = await consumeCapsule(CAPSULE_ID, { fetch }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiHttpError);
    expect((err as ApiHttpError).status).toBe(404);
  });

  it("propagates 410 EXPIRED as ApiHttpError with status 410", async () => {
    const fetch = mockFetch(410, { error: "Capsule ... cannot be consumed: EXPIRED" });
    const err = await consumeCapsule(CAPSULE_ID, { fetch }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiHttpError);
    expect((err as ApiHttpError).status).toBe(410);
    expect(JSON.stringify((err as ApiHttpError).responseBody)).toContain("EXPIRED");
  });

  it("propagates 410 BURNED as ApiHttpError with status 410", async () => {
    const fetch = mockFetch(410, { error: "Capsule ... cannot be consumed: BURNED" });
    const err = await consumeCapsule(CAPSULE_ID, { fetch }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiHttpError);
    expect((err as ApiHttpError).status).toBe(410);
    expect(JSON.stringify((err as ApiHttpError).responseBody)).toContain("BURNED");
  });

  it("propagates 429 view-limit as ApiHttpError with status 429", async () => {
    const fetch = mockFetch(429, { error: "VIEW_LIMIT_REACHED" });
    const err = await consumeCapsule(CAPSULE_ID, { fetch }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiHttpError);
    expect((err as ApiHttpError).status).toBe(429);
  });

  it("wrong password throws Decryption failed after consuming", async () => {
    const { serverPayload, fragment } = await encryptForShare("secret", "correct-pass");
    const consumeResponse: CapsuleResponse = {
      metadata: buildCapsuleResponse().metadata,
      encryptedPayload: serverPayload,
    };
    const fetch = mockFetch(200, consumeResponse);
    const consumed = await consumeCapsule(CAPSULE_ID, { fetch });

    const err = await decryptFromShare(consumed.encryptedPayload, fragment, "wrong-pass").catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("Decryption failed.");
  });

  it("corrupted ciphertext/nonce throws an error", async () => {
    const { fragment } = await encryptForShare("data");
    // Use a ciphertext that decodes to wrong-length data to trigger failure
    const badPayload = {
      ciphertext: btoa("corrupt"),
      nonce: btoa("bad-nonce-123"),  // 13 bytes — not 12
      algorithm: "AES-GCM-256" as const,
    };

    const err = await decryptFromShare(badPayload, fragment).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    // Either a nonce-length error or a decryption failure — both are correct
    expect((err as Error).message).toMatch(/decryption failed|nonce/i);
  });

  it("network failure in consumeCapsule propagates as ApiError", async () => {
    const { ApiError } = await import("./api.js");
    const fetch = failFetch("ERR_CONNECTION_REFUSED");
    const err = await consumeCapsule(CAPSULE_ID, { fetch }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
  });
});

// ---------------------------------------------------------------------------
// REGRESSION: NUCLEAR capsule full lifecycle end-to-end
// ---------------------------------------------------------------------------

describe("NUCLEAR capsule lifecycle regression", () => {
  it("allows exactly one successful unlock after wrong password attempts, then fails on subsequent attempts", async () => {
    const secretMessage = "Top Secret Nuclear Launch Codes";
    const correctPassword = "CorrectNuclearPassword123!";
    const wrongPassword = "WrongPassword456!";

    // 1. Sender encrypts with NUCLEAR parameters
    const { serverPayload, fragment } = await encryptForShare(secretMessage, correctPassword);

    // Verify fragment is in password mode
    const decoded = decodeFragment(fragment);
    expect(decoded.mode).toBe("password");

    // Mock backend capsule database store
    let capsuleStore: {
      id: string;
      serverPayload: typeof serverPayload;
      maxViews: number;
      currentViews: number;
      status: "ACTIVE" | "BURNED";
    } | null = {
      id: "nuclear-capsule-uuid",
      serverPayload,
      maxViews: 1,
      currentViews: 0,
      status: "ACTIVE",
    };

    const mockServerFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const parsedUrl = new URL(url, "https://example.com");
      if (parsedUrl.pathname === "/capsules" && init?.method === "POST") {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            metadata: {
              id: capsuleStore!.id,
              recipe: "NUCLEAR",
              createdAt: new Date().toISOString(),
              expiresAt: new Date(Date.now() + 900000).toISOString(),
              maxViews: 1,
              currentViews: 0,
              requiresPassword: true,
              burnAfterRead: true,
            },
            encryptedPayload: capsuleStore!.serverPayload,
          }),
        } as Response;
      }

      if (parsedUrl.pathname === `/capsules/${capsuleStore?.id ?? "nuclear-capsule-uuid"}/consume` && init?.method === "POST") {
        if (!capsuleStore || capsuleStore.status === "BURNED") {
          return {
            ok: false,
            status: 410,
            json: async () => ({ error: "Capsule nuclear-capsule-uuid cannot be consumed: BURNED" }),
          } as Response;
        }

        // Increment and burn
        capsuleStore.currentViews += 1;
        capsuleStore.status = "BURNED";
        const returnedPayload = capsuleStore.serverPayload;
        // Hard-delete
        capsuleStore = null;

        return {
          ok: true,
          status: 200,
          json: async () => ({
            metadata: {
              id: "nuclear-capsule-uuid",
              recipe: "NUCLEAR",
              createdAt: new Date().toISOString(),
              expiresAt: new Date(Date.now() + 900000).toISOString(),
              maxViews: 1,
              currentViews: 1,
              requiresPassword: true,
              burnAfterRead: true,
            },
            encryptedPayload: returnedPayload,
          }),
        } as Response;
      }

      return {
        ok: false,
        status: 404,
        json: async () => ({ error: "Not found" }),
      } as Response;
    });

    // Create capsule via API
    const createResult = await createCapsule(
      {
        encryptedPayload: serverPayload,
        recipe: "NUCLEAR",
        ttlSeconds: 900,
        maxViews: 1,
        requiresPassword: true,
        burnAfterRead: true,
      },
      { fetch: mockServerFetch },
    );
    expect(createResult.metadata.id).toBe("nuclear-capsule-uuid");

    // 2. Recipient tests wrong password first (pure client-side verification - NO API consumption)
    const isWrongValid = await verifyFragmentPassword(fragment, wrongPassword);
    expect(isWrongValid).toBe(false);

    // Verify no server call happened during password check
    const callsBeforeConsume = mockServerFetch.mock.calls.filter(([url]) =>
      String(url).includes("/consume"),
    );
    expect(callsBeforeConsume).toHaveLength(0);
    // Capsule remains ACTIVE and intact
    expect(capsuleStore).not.toBeNull();
    expect(capsuleStore?.status).toBe("ACTIVE");
    expect(capsuleStore?.currentViews).toBe(0);

    // 3. Recipient tests correct password (pure client-side verification)
    const isCorrectValid = await verifyFragmentPassword(fragment, correctPassword);
    expect(isCorrectValid).toBe(true);

    // 4. Recipient proceeds to consume and decrypt (First attempt - MUST SUCCEED)
    const consumeResponse = await consumeCapsule("nuclear-capsule-uuid", { fetch: mockServerFetch });
    expect(consumeResponse.metadata.id).toBe("nuclear-capsule-uuid");

    const decryptedSecret = await decryptFromShare(
      consumeResponse.encryptedPayload,
      fragment,
      correctPassword,
    );
    expect(decryptedSecret).toBe(secretMessage);

    // Capsule is now burned and deleted on server
    expect(capsuleStore).toBeNull();

    // 5. Recipient (or another user) attempts second view (MUST FAIL with 410)
    const secondAttemptError = await consumeCapsule("nuclear-capsule-uuid", { fetch: mockServerFetch }).catch(
      (e: unknown) => e,
    );
    expect(secondAttemptError).toBeInstanceOf(ApiHttpError);
    expect((secondAttemptError as ApiHttpError).status).toBe(410);
  });
});
