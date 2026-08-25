import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";

import {
  PrismaCapsuleRepository,
  type CreateCapsuleData,
} from "./capsule.repository.js";
import { CapsuleNotFoundError, DatabaseError } from "../errors.js";

// ---------------------------------------------------------------------------
// Mock factory
//
// We inject a minimal stub rather than vi.mock()-ing the prisma module, which
// keeps the tests free of module-level side effects and makes the dependency
// explicit.
// ---------------------------------------------------------------------------

type CapsuleDelegateMock = {
  create: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

function makeDbMock(): { capsule: CapsuleDelegateMock } {
  return {
    capsule: {
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
  };
}

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const baseInput: CreateCapsuleData = {
  ciphertext: "base64url-ciphertext",
  nonce: "base64url-nonce",
  algorithm: "AES-GCM-256",
  recipe: "QUICK",
  expiresAt: new Date("2026-12-31T00:00:00.000Z"),
  maxViews: 5,
  requiresPassword: false,
  burnAfterRead: false,
};

/** Simulates the raw record Prisma returns after a successful create/findUnique. */
const baseRecord = {
  id: "00000000-0000-0000-0000-000000000001",
  ciphertext: baseInput.ciphertext,
  nonce: baseInput.nonce,
  algorithm: baseInput.algorithm,
  recipe: baseInput.recipe,
  expiresAt: baseInput.expiresAt,
  createdAt: new Date("2026-08-23T12:00:00.000Z"),
  maxViews: baseInput.maxViews,
  currentViews: 0,
  requiresPassword: baseInput.requiresPassword,
  burnAfterRead: baseInput.burnAfterRead,
  status: "ACTIVE" as const,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PrismaCapsuleRepository", () => {
  let dbMock: ReturnType<typeof makeDbMock>;
  let repo: PrismaCapsuleRepository;

  beforeEach(() => {
    dbMock = makeDbMock();
    // Cast is required because the mock only implements the methods the
    // repository actually calls — full PrismaClient has many more members.
    repo = new PrismaCapsuleRepository(dbMock as unknown as PrismaClient);
  });

  // -------------------------------------------------------------------------
  describe("create", () => {
    it("persists all expected server-side fields and returns a mapped domain object", async () => {
      dbMock.capsule.create.mockResolvedValue(baseRecord);

      const result = await repo.create(baseInput);

      expect(result.id).toBe(baseRecord.id);
      expect(result.ciphertext).toBe(baseInput.ciphertext);
      expect(result.nonce).toBe(baseInput.nonce);
      expect(result.algorithm).toBe("AES-GCM-256");
      expect(result.recipe).toBe("QUICK");
      expect(result.maxViews).toBe(5);
      expect(result.currentViews).toBe(0);
      expect(result.requiresPassword).toBe(false);
      expect(result.burnAfterRead).toBe(false);
      expect(result.status).toBe("ACTIVE");
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it("does not persist plaintext, password, or client decryption material", async () => {
      // Security boundary: the exact toHaveBeenCalledWith assertion uses deep
      // equality — any extra field (plaintext, password, dek, kek, wrappedKey,
      // fragment, shareUrl …) in the actual call would cause this test to fail.
      dbMock.capsule.create.mockResolvedValue(baseRecord);
      await repo.create(baseInput);

      expect(dbMock.capsule.create).toHaveBeenCalledWith({
        data: {
          ciphertext: baseInput.ciphertext,
          nonce: baseInput.nonce,
          algorithm: baseInput.algorithm,
          recipe: baseInput.recipe,
          expiresAt: baseInput.expiresAt,
          maxViews: baseInput.maxViews,
          requiresPassword: baseInput.requiresPassword,
          burnAfterRead: baseInput.burnAfterRead,
        },
      });
    });

    it("does not silently inject extra fields beyond the creation contract", async () => {
      dbMock.capsule.create.mockResolvedValue(baseRecord);
      await repo.create(baseInput);

      const [[callArg]] = dbMock.capsule.create.mock.calls as [{ data: Record<string, unknown> }][];
      const persistedKeys = Object.keys(callArg.data).sort();

      // Exactly these eight fields — nothing more
      expect(persistedKeys).toEqual(
        [
          "algorithm",
          "burnAfterRead",
          "ciphertext",
          "expiresAt",
          "maxViews",
          "nonce",
          "recipe",
          "requiresPassword",
        ].sort(),
      );
    });

    it("wraps unexpected database errors in DatabaseError", async () => {
      dbMock.capsule.create.mockRejectedValue(new Error("Connection timeout"));
      await expect(repo.create(baseInput)).rejects.toBeInstanceOf(DatabaseError);
    });
  });

  // -------------------------------------------------------------------------
  describe("findById", () => {
    it("returns a StoredCapsule when the record exists", async () => {
      dbMock.capsule.findUnique.mockResolvedValue(baseRecord);

      const result = await repo.findById(baseRecord.id);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(baseRecord.id);
      expect(result?.recipe).toBe("QUICK");
      expect(result?.status).toBe("ACTIVE");
    });

    it("returns null when no record exists for the given ID", async () => {
      dbMock.capsule.findUnique.mockResolvedValue(null);

      const result = await repo.findById("00000000-0000-0000-0000-000000000000");

      expect(result).toBeNull();
    });

    it("rejects persisted records whose algorithm is not AES-GCM-256", async () => {
      dbMock.capsule.findUnique.mockResolvedValue({
        ...baseRecord,
        algorithm: "ChaCha20-Poly1305",
      });

      await expect(repo.findById(baseRecord.id)).rejects.toBeInstanceOf(DatabaseError);
    });

    it("maps createdAt and expiresAt as Date objects", async () => {
      dbMock.capsule.findUnique.mockResolvedValue(baseRecord);

      const result = await repo.findById(baseRecord.id);

      expect(result?.createdAt).toBeInstanceOf(Date);
      expect(result?.expiresAt).toBeInstanceOf(Date);
      expect(result?.createdAt.toISOString()).toBe("2026-08-23T12:00:00.000Z");
      expect(result?.expiresAt.toISOString()).toBe("2026-12-31T00:00:00.000Z");
    });

    it("preserves the recipe value unchanged for all three recipes", async () => {
      for (const recipe of ["QUICK", "SECURE", "NUCLEAR"] as const) {
        dbMock.capsule.findUnique.mockResolvedValue({ ...baseRecord, recipe });

        const result = await repo.findById(baseRecord.id);

        expect(result?.recipe).toBe(recipe);
      }
    });

    it("preserves the status field without mutation", async () => {
      for (const status of [
        "ACTIVE",
        "VIEW_LIMIT_REACHED",
        "EXPIRED",
        "BURNED",
      ] as const) {
        dbMock.capsule.findUnique.mockResolvedValue({ ...baseRecord, status });

        const result = await repo.findById(baseRecord.id);

        expect(result?.status).toBe(status);
      }
    });

    it("wraps unexpected database errors in DatabaseError", async () => {
      dbMock.capsule.findUnique.mockRejectedValue(new Error("Query failed"));
      await expect(repo.findById("any-id")).rejects.toBeInstanceOf(DatabaseError);
    });
  });

  // -------------------------------------------------------------------------
  describe("delete", () => {
    it("resolves without a value when the capsule is successfully deleted", async () => {
      dbMock.capsule.delete.mockResolvedValue(baseRecord);
      await expect(repo.delete(baseRecord.id)).resolves.toBeUndefined();
    });

    it("throws CapsuleNotFoundError for Prisma P2025 (record does not exist)", async () => {
      const p2025 = new Prisma.PrismaClientKnownRequestError(
        "Record to delete does not exist.",
        { code: "P2025", clientVersion: "6.0.0" },
      );
      dbMock.capsule.delete.mockRejectedValue(p2025);

      await expect(repo.delete("unknown-id")).rejects.toBeInstanceOf(
        CapsuleNotFoundError,
      );
    });

    it("includes the capsule ID in CapsuleNotFoundError", async () => {
      const p2025 = new Prisma.PrismaClientKnownRequestError(
        "Record to delete does not exist.",
        { code: "P2025", clientVersion: "6.0.0" },
      );
      dbMock.capsule.delete.mockRejectedValue(p2025);

      const error = await repo.delete("target-id").catch((e: unknown) => e);
      expect(error).toBeInstanceOf(CapsuleNotFoundError);
      expect((error as CapsuleNotFoundError).capsuleId).toBe("target-id");
    });

    it("wraps non-P2025 Prisma known errors in DatabaseError", async () => {
      const p2002 = new Prisma.PrismaClientKnownRequestError(
        "Unique constraint violation.",
        { code: "P2002", clientVersion: "6.0.0" },
      );
      dbMock.capsule.delete.mockRejectedValue(p2002);

      await expect(repo.delete("any-id")).rejects.toBeInstanceOf(DatabaseError);
    });

    it("wraps generic errors in DatabaseError", async () => {
      dbMock.capsule.delete.mockRejectedValue(new Error("Connection lost"));
      await expect(repo.delete("any-id")).rejects.toBeInstanceOf(DatabaseError);
    });
  });
});
