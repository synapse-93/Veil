import { describe, it, expect, vi } from "vitest";
import { CapsuleService } from "./capsule.service.js";

const makeRepo = () => ({
  create: vi.fn(),
  findById: vi.fn(),
  consumeView: vi.fn(),
});

describe("CapsuleService", () => {
  it("creates a capsule and computes expiresAt from ttlSeconds", async () => {
    const repo = makeRepo();
    const svc = new CapsuleService(repo as any);

    const now = Date.now();
    const ttlSeconds = 60;
    const fakeStored = {
      id: "id",
      ciphertext: "c",
      nonce: "n",
      algorithm: "AES-GCM-256",
      recipe: "QUICK",
      createdAt: new Date(now),
      expiresAt: new Date(now + ttlSeconds * 1000),
      maxViews: 5,
      currentViews: 0,
      requiresPassword: false,
      burnAfterRead: false,
      status: "ACTIVE",
    };

    repo.create.mockResolvedValue(fakeStored);

    const result = await svc.createCapsule({
      ciphertext: "c",
      nonce: "n",
      algorithm: "AES-GCM-256",
      recipe: "QUICK",
      ttlSeconds,
      maxViews: 5,
      requiresPassword: false,
      burnAfterRead: false,
    });

    expect(repo.create).toHaveBeenCalled();
    expect(result).toBe(fakeStored);
  });

  it("forwards consumeCapsule calls to the repository", async () => {
    const repo = makeRepo();
    const svc = new CapsuleService(repo as any);

    repo.consumeView.mockResolvedValue({ id: "id", ciphertext: "c", nonce: "n", algorithm: "AES-GCM-256", recipe: "QUICK", createdAt: new Date(), expiresAt: new Date(), maxViews: 1, currentViews: 0, requiresPassword: false, burnAfterRead: false, status: "ACTIVE" });

    const c = await svc.consumeCapsule("id");
    expect(repo.consumeView).toHaveBeenCalledWith("id");
    expect(c).toBeTruthy();
  });
});
