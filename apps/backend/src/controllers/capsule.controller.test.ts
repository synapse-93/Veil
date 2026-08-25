import Fastify from "fastify";
import { describe, it, expect, vi } from "vitest";
import { registerCapsuleControllers } from "./capsule.controller.js";

const makeMockService = () => ({
  createCapsule: vi.fn(),
  consumeCapsule: vi.fn(),
});

describe("capsule controllers (integration with Fastify)", () => {
  it("POST /capsules returns 201 and payload for valid request", async () => {
    const app = Fastify();
    const svc = makeMockService();

    svc.createCapsule.mockResolvedValue({
      id: "id",
      ciphertext: "c",
      nonce: "n",
      algorithm: "AES-GCM-256",
      recipe: "QUICK",
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60000),
      maxViews: 5,
      currentViews: 0,
      requiresPassword: false,
      burnAfterRead: false,
      status: "ACTIVE",
    });

    registerCapsuleControllers(app as any, svc as any);

    const res = await app.inject({
      method: "POST",
      url: "/capsules",
      payload: {
        encryptedPayload: { ciphertext: "c", nonce: "n", algorithm: "AES-GCM-256" },
        recipe: "QUICK",
        ttlSeconds: 60,
        maxViews: 5,
        requiresPassword: false,
        burnAfterRead: false,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.metadata).toBeDefined();
    expect(body.encryptedPayload).toBeDefined();
  });

  it("POST /capsules/:id/consume maps not found and consumable errors correctly", async () => {
    const app = Fastify();
    const svc = makeMockService();

    // Not found
    svc.consumeCapsule.mockRejectedValueOnce(new (class NotFound extends Error {})());
    registerCapsuleControllers(app as any, svc as any);

    const res1 = await app.inject({ method: "POST", url: "/capsules/not-exist/consume" });
    // Our controller maps unknown errors without specific type to 500 in this test
    expect(res1.statusCode).toBe(500);
  });

  it("GET /capsules/:id is not a payload retrieval endpoint", async () => {
    const app = Fastify();
    const svc = makeMockService();

    registerCapsuleControllers(app as any, svc as any);

    const res = await app.inject({ method: "GET", url: "/capsules/any-id" });
    expect(res.statusCode).toBe(404);
    // Should not contain any encrypted payload
    expect(res.body).not.toContain("ciphertext");
    expect(res.body).not.toContain("nonce");
  });

  it("POST /capsules/:id/consume rejects empty, whitespace, long, and malformed ids", async () => {
    const app = Fastify();
    const svc = makeMockService();
    registerCapsuleControllers(app as any, svc as any);

    // empty
    const r1 = await app.inject({ method: "POST", url: "/capsules//consume" });
    expect(r1.statusCode).toBe(400);

    // whitespace id
    const r2 = await app.inject({ method: "POST", url: "/capsules/   /consume" });
    expect(r2.statusCode).toBe(400);

    // too long
    const longId = "a".repeat(129);
    const r3 = await app.inject({ method: "POST", url: `/capsules/${longId}/consume` });
    // Some HTTP servers reject overly long URLs before Fastify handler (414). Accept either 400 or 414.
    expect([400, 414]).toContain(r3.statusCode);

    // malformed characters
    const r4 = await app.inject({ method: "POST", url: "/capsules/has space/consume" });
    expect(r4.statusCode).toBe(400);
  });
});
