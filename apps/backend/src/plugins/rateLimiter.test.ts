import Fastify from "fastify";
import { describe, it, expect } from "vitest";
import { rateLimiter } from "./rateLimiter.js";
import { registerCapsuleControllers } from "../controllers/capsule.controller.js";

function makeMockService() {
  return {
    createCapsule: async () => ({
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
    }),
    consumeCapsule: async () => ({
      id: "id",
      ciphertext: "c",
      nonce: "n",
      algorithm: "AES-GCM-256",
      recipe: "QUICK",
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60000),
      maxViews: 5,
      currentViews: 1,
      requiresPassword: false,
      burnAfterRead: false,
      status: "ACTIVE",
    }),
  } as any;
}

describe("rate limiter plugin", () => {
  it("enforces create limits for POST /capsules", async () => {
    const app = Fastify();
    await rateLimiter(app);
    const svc = makeMockService();
    registerCapsuleControllers(app as any, svc as any);

    // Use remoteAddress to simulate client IP (Fastify inject supports remoteAddress)
    const ip = "1.2.3.4";

    // First, send exactly CREATE_LIMIT requests and ensure they are accepted.
    for (let i = 0; i < 20; i++) {
      const res = await app.inject({
        method: "POST",
        url: "/capsules",
        remoteAddress: ip,
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
    }

    // One more -> should be rejected
    const resOver = await app.inject({
      method: "POST",
      url: "/capsules",
      remoteAddress: ip,
      payload: {
        encryptedPayload: { ciphertext: "c", nonce: "n", algorithm: "AES-GCM-256" },
        recipe: "QUICK",
        ttlSeconds: 60,
        maxViews: 5,
        requiresPassword: false,
        burnAfterRead: false,
      },
    });
    expect(resOver.statusCode).toBe(429);
  });

  it("enforces consume limits for POST /capsules/:id/consume and keeps separate buckets", async () => {
    const app = Fastify();
    await rateLimiter(app);
    const svc = makeMockService();
    registerCapsuleControllers(app as any, svc as any);

    const ip = "5.6.7.8";

    // Send exactly CONSUME_LIMIT requests and ensure they are accepted.
    for (let i = 0; i < 10; i++) {
      const res = await app.inject({
        method: "POST",
        url: "/capsules/some-id/consume",
        remoteAddress: ip,
      });
      expect(res.statusCode).toBe(200);
    }

    // One more -> should be rejected
    const resOver = await app.inject({ method: "POST", url: "/capsules/some-id/consume", remoteAddress: ip });
    expect(resOver.statusCode).toBe(429);

    // Create should still be allowed for same IP (separate bucket)
    const createRes = await app.inject({
      method: "POST",
      url: "/capsules",
      remoteAddress: ip,
      payload: {
        encryptedPayload: { ciphertext: "c", nonce: "n", algorithm: "AES-GCM-256" },
        recipe: "QUICK",
        ttlSeconds: 60,
        maxViews: 5,
        requiresPassword: false,
        burnAfterRead: false,
      },
    });
    expect(createRes.statusCode).toBe(201);
  });

  it("different client IPs have independent limits and XFF spoofing does not bypass without trustProxy", async () => {
    const app = Fastify();
    await rateLimiter(app);
    const svc = makeMockService();
    registerCapsuleControllers(app as any, svc as any);

    const ipA = "9.9.9.9";
    const ipB = "8.8.8.8";

    // Exhaust ipA create limit
    for (let i = 0; i < 20; i++) {
      const r = await app.inject({ method: "POST", url: "/capsules", remoteAddress: ipA, payload: { encryptedPayload: { ciphertext: "c", nonce: "n", algorithm: "AES-GCM-256" }, recipe: "QUICK", ttlSeconds: 60, maxViews: 5, requiresPassword: false, burnAfterRead: false } });
      expect(r.statusCode).toBe(201);
    }
    // One more should be 429
    const overA = await app.inject({ method: "POST", url: "/capsules", remoteAddress: ipA });
    expect(overA.statusCode).toBe(429);

    // ipB still allowed
    const rB = await app.inject({ method: "POST", url: "/capsules", remoteAddress: ipB, payload: { encryptedPayload: { ciphertext: "c", nonce: "n", algorithm: "AES-GCM-256" }, recipe: "QUICK", ttlSeconds: 60, maxViews: 5, requiresPassword: false, burnAfterRead: false } });
    expect(rB.statusCode).toBe(201);

    // Now try to spoof X-Forwarded-For on ipA to point to ipB — should NOT bypass
    const spoof = await app.inject({ method: "POST", url: "/capsules", remoteAddress: ipA, headers: { "x-forwarded-for": ipB } });
    expect(spoof.statusCode).toBe(429);

    // Unrelated route is not rate limited (return 404 not 429)
    const other = await app.inject({ method: "GET", url: "/nonexistent", remoteAddress: ipA });
    expect(other.statusCode).not.toBe(429);
  });

});
