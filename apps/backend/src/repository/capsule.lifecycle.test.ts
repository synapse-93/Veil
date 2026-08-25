/**
 * Phase 3D — expireStale() unit tests (mocked Prisma) + integration stubs.
 *
 * Unit tests verify application-level behaviour deterministically:
 *   - correct return value (row count from $executeRaw)
 *   - error wrapping
 *   - idempotency at the call level
 *
 * The SQL predicate correctness (which capsule statuses are touched and which
 * are not) can only be proven against a real PostgreSQL database and is
 * covered by the integration tests below, which are skipped unless
 * DATABASE_URL is set.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type PrismaClient } from "@prisma/client";

import { PrismaCapsuleRepository } from "./capsule.repository.js";
import { DatabaseError } from "../errors.js";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/**
 * Minimal db mock for expireStale() tests.
 * Only $executeRaw is needed; no capsule delegate methods are called.
 */
type LifecycleDbMock = {
  $executeRaw: ReturnType<typeof vi.fn>;
};

function makeDbMock(): LifecycleDbMock {
  return { $executeRaw: vi.fn() };
}

// ---------------------------------------------------------------------------
// Unit tests — mocked Prisma
// ---------------------------------------------------------------------------

describe("PrismaCapsuleRepository.expireStale — unit (mocked Prisma)", () => {
  let db: LifecycleDbMock;
  let repo: PrismaCapsuleRepository;

  beforeEach(() => {
    db = makeDbMock();
    repo = new PrismaCapsuleRepository(db as unknown as PrismaClient);
  });

  it("returns the count of rows transitioned to EXPIRED", async () => {
    db.$executeRaw.mockResolvedValue(7);
    const count = await repo.expireStale();
    expect(count).toBe(7);
  });

  it("returns 0 when no ACTIVE expired capsules exist", async () => {
    db.$executeRaw.mockResolvedValue(0);
    const count = await repo.expireStale();
    expect(count).toBe(0);
  });

  it("calls $executeRaw exactly once per invocation", async () => {
    db.$executeRaw.mockResolvedValue(0);
    await repo.expireStale();
    expect(db.$executeRaw).toHaveBeenCalledOnce();
  });

  it("delegates entirely to the database — no per-row application code", async () => {
    // expireStale() must NOT do a SELECT-then-UPDATE loop; one $executeRaw call
    // is the sole database round-trip per invocation.
    db.$executeRaw.mockResolvedValue(3);
    await repo.expireStale();
    // Exactly one call confirms the single-statement strategy.
    expect(db.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("is idempotent: a second call with nothing left to expire returns 0", async () => {
    db.$executeRaw
      .mockResolvedValueOnce(4)  // first sweep: 4 capsules expired
      .mockResolvedValueOnce(0); // second sweep: nothing left

    const first = await repo.expireStale();
    const second = await repo.expireStale();

    expect(first).toBe(4);
    expect(second).toBe(0);
    expect(db.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it("wraps unexpected database errors in DatabaseError", async () => {
    db.$executeRaw.mockRejectedValue(new Error("Connection reset by peer"));
    await expect(repo.expireStale()).rejects.toBeInstanceOf(DatabaseError);
  });

  it("wraps Prisma-specific errors in DatabaseError", async () => {
    db.$executeRaw.mockRejectedValue(
      new Error("db: relation \"Capsule\" does not exist"),
    );
    await expect(repo.expireStale()).rejects.toBeInstanceOf(DatabaseError);
  });

  it("DatabaseError preserves the original error as cause", async () => {
    const original = new Error("timeout");
    db.$executeRaw.mockRejectedValue(original);

    const err = await repo.expireStale().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DatabaseError);
    expect((err as DatabaseError).cause).toBe(original);
  });
});

// ---------------------------------------------------------------------------
// Integration tests — require a live PostgreSQL database
//
// These tests prove that the SQL predicate is correct:
//   - ACTIVE + expired    → EXPIRED
//   - ACTIVE + unexpired  → unchanged
//   - EXPIRED             → unchanged  (idempotent on already-expired rows)
//   - VIEW_LIMIT_REACHED  → unchanged
//   - BURNED              → unchanged  (defensive; burned capsules are normally deleted)
//   - repeated calls      → idempotent
//
// Run with:
//   DATABASE_URL=postgres://... corepack pnpm exec vitest run apps/backend/src/repository
// ---------------------------------------------------------------------------

const hasPg = Boolean(process.env["DATABASE_URL"]);

describe.skipIf(!hasPg)(
  "PrismaCapsuleRepository.expireStale — integration (requires PostgreSQL)",
  () => {
    let prismaClient: PrismaClient;
    let repo: PrismaCapsuleRepository;

    /** Direct Prisma access for setting up rows in arbitrary states. */
    type RawCapsuleDelegate = {
      create: (args: {
        data: {
          ciphertext: string;
          nonce: string;
          algorithm: string;
          recipe: string;
          expiresAt: Date;
          maxViews: number;
          requiresPassword: boolean;
          burnAfterRead: boolean;
          status?: string;
        };
      }) => Promise<{ id: string }>;
      deleteMany: (args?: unknown) => Promise<unknown>;
      findUnique: (args: { where: { id: string } }) => Promise<{
        id: string;
        status: string;
        expiresAt: Date;
      } | null>;
    };

    function capsule() {
      return (
        prismaClient as unknown as { capsule: RawCapsuleDelegate }
      ).capsule;
    }

    async function createCapsule(overrides: {
      expiresAt: Date;
      status?: string;
    }) {
      return capsule().create({
        data: {
          ciphertext: "int-ciphertext",
          nonce: "int-nonce",
          algorithm: "AES-GCM-256",
          recipe: "QUICK",
          expiresAt: overrides.expiresAt,
          maxViews: 3,
          requiresPassword: false,
          burnAfterRead: false,
          ...(overrides.status ? { status: overrides.status } : {}),
        },
      });
    }

    beforeEach(async () => {
      const { PrismaClient: PC } = await import("@prisma/client");
      prismaClient = new PC() as PrismaClient;
      repo = new PrismaCapsuleRepository(prismaClient);
    });

    afterEach(async () => {
      try {
        await capsule().deleteMany({});
      } finally {
        await prismaClient.$disconnect();
      }
    });

    it("marks an ACTIVE expired capsule as EXPIRED and returns count = 1", async () => {
      const created = await createCapsule({
        expiresAt: new Date(Date.now() - 60_000), // 1 minute in the past
      });

      const count = await repo.expireStale();

      expect(count).toBeGreaterThanOrEqual(1);
      const after = await capsule().findUnique({ where: { id: created.id } });
      expect(after?.status).toBe("EXPIRED");
    });

    it("does NOT modify an ACTIVE capsule whose TTL has not yet elapsed", async () => {
      const created = await createCapsule({
        expiresAt: new Date(Date.now() + 3_600_000), // 1 hour in the future
      });

      await repo.expireStale();

      const after = await capsule().findUnique({ where: { id: created.id } });
      expect(after?.status).toBe("ACTIVE");
    });

    it("does NOT modify a capsule already in EXPIRED status", async () => {
      const created = await createCapsule({
        expiresAt: new Date(Date.now() - 120_000),
        status: "EXPIRED",
      });

      // expireStale() should not touch already-EXPIRED rows (no-op for them).
      const count = await repo.expireStale();

      expect(count).toBe(0); // nothing new to expire
      const after = await capsule().findUnique({ where: { id: created.id } });
      expect(after?.status).toBe("EXPIRED");
    });

    it("does NOT modify a VIEW_LIMIT_REACHED capsule", async () => {
      const created = await createCapsule({
        expiresAt: new Date(Date.now() - 60_000),
        status: "VIEW_LIMIT_REACHED",
      });

      await repo.expireStale();

      const after = await capsule().findUnique({ where: { id: created.id } });
      expect(after?.status).toBe("VIEW_LIMIT_REACHED");
    });

    it("does NOT modify a BURNED capsule (defensive path)", async () => {
      // In practice burned capsules are hard-deleted; this verifies the
      // WHERE clause still excludes them even if a BURNED record exists.
      const created = await createCapsule({
        expiresAt: new Date(Date.now() - 60_000),
        status: "BURNED",
      });

      await repo.expireStale();

      const after = await capsule().findUnique({ where: { id: created.id } });
      expect(after?.status).toBe("BURNED");
    });

    it("is idempotent: a second call after all eligible rows are expired returns 0", async () => {
      await createCapsule({ expiresAt: new Date(Date.now() - 60_000) });
      await createCapsule({ expiresAt: new Date(Date.now() - 120_000) });

      const first = await repo.expireStale();
      const second = await repo.expireStale();

      expect(first).toBe(2);
      expect(second).toBe(0);
    });

    it("expires multiple eligible capsules in one call", async () => {
      await createCapsule({ expiresAt: new Date(Date.now() - 10_000) });
      await createCapsule({ expiresAt: new Date(Date.now() - 20_000) });
      await createCapsule({ expiresAt: new Date(Date.now() - 30_000) });
      // Non-eligible — should remain ACTIVE
      await createCapsule({ expiresAt: new Date(Date.now() + 3_600_000) });

      const count = await repo.expireStale();

      expect(count).toBe(3);
    });
  },
);
