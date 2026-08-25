/**
 * Phase 3C — consumeView unit tests (mocked Prisma) + integration stubs.
 *
 * Unit tests: cover every logic path deterministically using a mocked
 * Prisma $transaction / $queryRaw.  They prove correctness of the
 * application-level logic but cannot prove database-level concurrency safety.
 *
 * Integration tests (tagged with describe.skipIf): prove the concurrency
 * guarantee using a real PostgreSQL connection.  They are skipped unless
 * DATABASE_URL is set in the environment.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type PrismaClient } from "@prisma/client";

import {
  PrismaCapsuleRepository,
  type StoredCapsule,
} from "./capsule.repository.js";
import {
  CapsuleNotConsumableError,
  CapsuleNotFoundError,
  DatabaseError,
} from "../errors.js";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/**
 * Minimal mock of the Prisma interactive-transaction context (tx).
 * Only the operations that consumeView actually calls are represented.
 */
type TxMock = {
  $queryRaw: ReturnType<typeof vi.fn>;
  capsule: {
    findUnique: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
};

function makeTxMock(): TxMock {
  const fn = vi.fn().mockImplementation((sql: unknown) => {
    const s = Array.isArray(sql) ? sql.join("") : String(sql);
    // Default behaviour: respond to the diagnostic DB clock read with a valid
    // timestamp, and default UPDATEs to returning no rows. Tests that need
    // different UPDATE results should use mockResolvedValueOnce(...) to
    // override per-call behaviour.
    if (s.includes("clock_timestamp")) {
      return [{ now: new Date() }];
    }
    return [];
  });

  return {
    $queryRaw: fn,
    capsule: {
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
  };
}

/**
 * Wraps a tx mock in a db mock so db.$transaction(callback) calls callback(tx)
 * and returns its result — matching Prisma's real interactive-transaction API.
 */
function makeDb(tx: TxMock) {
  return {
    $transaction: vi.fn().mockImplementation(
      (callback: (tx: TxMock) => Promise<unknown>) => callback(tx),
    ),
  };
}

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const CAPSULE_ID = "00000000-0000-0000-0000-000000000001";
const FUTURE = new Date(Date.now() + 3_600_000); // 1 hour from now

/** Base "raw" row shape matching what PostgreSQL RETURNING * would emit. */
const baseRow = {
  id: CAPSULE_ID,
  ciphertext: "AES-ciphertext",
  nonce: "AES-nonce",
  algorithm: "AES-GCM-256",
  recipe: "QUICK",
  createdAt: new Date("2026-08-23T00:00:00.000Z"),
  expiresAt: FUTURE,
  maxViews: 3,
  currentViews: 0,
  requiresPassword: false,
  burnAfterRead: false,
  status: "ACTIVE",
};

function row(overrides: Partial<typeof baseRow>) {
  return { ...baseRow, ...overrides };
}

// ---------------------------------------------------------------------------
// Unit tests — mocked Prisma
// ---------------------------------------------------------------------------

describe("PrismaCapsuleRepository.consumeView — unit (mocked Prisma)", () => {
  let tx: TxMock;
  let repo: PrismaCapsuleRepository;

  beforeEach(() => {
    tx = makeTxMock();
    repo = new PrismaCapsuleRepository(makeDb(tx) as unknown as PrismaClient);
  });

  // -------------------------------------------------------------------------
  describe("successful consumption", () => {
    it("increments currentViews and returns ACTIVE when views remain", async () => {
      // Database returns the post-update row (currentViews already incremented)
      tx.$queryRaw.mockResolvedValue([row({ currentViews: 1, status: "ACTIVE" })]);

      const result = await repo.consumeView(CAPSULE_ID);

      expect(result.id).toBe(CAPSULE_ID);
      expect(result.currentViews).toBe(1);
      expect(result.maxViews).toBe(3);
      expect(result.status).toBe("ACTIVE");
      expect(result.algorithm).toBe("AES-GCM-256");
    });

    it("returns the correct ciphertext and nonce for the caller to decrypt", async () => {
      tx.$queryRaw.mockResolvedValue([row({ currentViews: 1, status: "ACTIVE" })]);

      const result = await repo.consumeView(CAPSULE_ID);

      expect(result.ciphertext).toBe("AES-ciphertext");
      expect(result.nonce).toBe("AES-nonce");
    });

    it("transitions to VIEW_LIMIT_REACHED on the last view (maxViews > 1)", async () => {
      // Pre-state: currentViews = 2, maxViews = 3 → post: currentViews = 3, VIEW_LIMIT_REACHED
      tx.$queryRaw.mockResolvedValue([
        row({ currentViews: 3, status: "VIEW_LIMIT_REACHED" }),
      ]);

      const result = await repo.consumeView(CAPSULE_ID);

      expect(result.currentViews).toBe(3);
      expect(result.status).toBe("VIEW_LIMIT_REACHED");
    });

    it("transitions to VIEW_LIMIT_REACHED on the only view (maxViews = 1, NUCLEAR-style)", async () => {
      // Pre-state: currentViews = 0, maxViews = 1 → post: currentViews = 1, VIEW_LIMIT_REACHED
      tx.$queryRaw.mockResolvedValue([
        row({ maxViews: 1, currentViews: 1, status: "VIEW_LIMIT_REACHED" }),
      ]);

      const result = await repo.consumeView(CAPSULE_ID);

      expect(result.currentViews).toBe(1);
      expect(result.maxViews).toBe(1);
      expect(result.status).toBe("VIEW_LIMIT_REACHED");
    });

    it("uses clock_timestamp() in its TTL predicate", async () => {
      tx.$queryRaw.mockResolvedValue([row({ currentViews: 1, status: "ACTIVE" })]);

      await repo.consumeView(CAPSULE_ID);

      expect(tx.$queryRaw).toHaveBeenCalled();
      const template = tx.$queryRaw.mock.calls[0][0];
      const sql = Array.isArray(template) ? template.join("") : String(template);
      expect(sql).toContain("clock_timestamp()");
    });
  });

  // -------------------------------------------------------------------------
  describe("burnAfterRead / NUCLEAR", () => {
    it("hard-deletes the capsule within the same transaction and returns BURNED", async () => {
      const nuclearRow = row({
        recipe: "NUCLEAR",
        maxViews: 1,
        currentViews: 1,
        requiresPassword: true,
        burnAfterRead: true,
        status: "VIEW_LIMIT_REACHED",
      });
      tx.$queryRaw.mockResolvedValue([nuclearRow]);
      tx.capsule.delete.mockResolvedValue(nuclearRow);

      const result = await repo.consumeView(CAPSULE_ID);

      // Status in the returned snapshot must be BURNED
      expect(result.status).toBe("BURNED");
      // Encrypted payload must still be present so the caller can decrypt
      expect(result.ciphertext).toBe("AES-ciphertext");
      expect(result.nonce).toBe("AES-nonce");
      expect(result.burnAfterRead).toBe(true);
      // Delete must have been called exactly once inside the same tx
      expect(tx.capsule.delete).toHaveBeenCalledOnce();
      expect(tx.capsule.delete).toHaveBeenCalledWith({ where: { id: CAPSULE_ID } });
    });

    it("does NOT call delete for capsules where burnAfterRead is false", async () => {
      tx.$queryRaw.mockResolvedValue([row({ burnAfterRead: false, currentViews: 1 })]);

      await repo.consumeView(CAPSULE_ID);

      expect(tx.capsule.delete).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  describe("rejection — capsule not consumable", () => {
    it("throws CapsuleNotFoundError when the capsule does not exist", async () => {
      tx.$queryRaw.mockResolvedValue([]);
      tx.capsule.findUnique.mockResolvedValue(null);

      await expect(repo.consumeView(CAPSULE_ID)).rejects.toBeInstanceOf(CapsuleNotFoundError);
    });

    it("CapsuleNotFoundError includes the capsule ID", async () => {
      tx.$queryRaw.mockResolvedValue([]);
      tx.capsule.findUnique.mockResolvedValue(null);

      const err = await repo.consumeView(CAPSULE_ID).catch((e: unknown) => e);
      expect((err as CapsuleNotFoundError).capsuleId).toBe(CAPSULE_ID);
    });

    it("throws CapsuleNotConsumableError(VIEW_LIMIT_REACHED) when status is VIEW_LIMIT_REACHED", async () => {
      tx.$queryRaw.mockResolvedValue([]);
      tx.capsule.findUnique.mockResolvedValue(
        row({ status: "VIEW_LIMIT_REACHED", currentViews: 3 }),
      );

      const err = await repo.consumeView(CAPSULE_ID).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(CapsuleNotConsumableError);
      expect((err as CapsuleNotConsumableError).reason).toBe("VIEW_LIMIT_REACHED");
    });

    it("throws CapsuleNotConsumableError(EXPIRED) when status is EXPIRED", async () => {
      tx.$queryRaw.mockResolvedValue([]);
      tx.capsule.findUnique.mockResolvedValue(row({ status: "EXPIRED" }));

      const err = await repo.consumeView(CAPSULE_ID).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(CapsuleNotConsumableError);
      expect((err as CapsuleNotConsumableError).reason).toBe("EXPIRED");
    });

    it("throws CapsuleNotConsumableError(BURNED) when record has BURNED status (defensive)", async () => {
      // In practice burned capsules are hard-deleted, so a real caller usually gets
      // CapsuleNotFoundError. This covers the defensive path where the record exists
      // but somehow carries BURNED status without having been deleted.
      tx.$queryRaw.mockResolvedValue([]);
      tx.capsule.findUnique.mockResolvedValue(row({ status: "BURNED" }));

      const err = await repo.consumeView(CAPSULE_ID).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(CapsuleNotConsumableError);
      expect((err as CapsuleNotConsumableError).reason).toBe("BURNED");
    });

    it("throws CapsuleNotConsumableError(EXPIRED) when ACTIVE but expiresAt is in the past (DB clock)", async () => {
      // Simulate UPDATE matched no rows; diagnostic read shows DB clock has advanced
      // past the stored expiresAt.
      tx.$queryRaw
        .mockResolvedValueOnce([]) // UPDATE produced no row
        .mockResolvedValueOnce([{ now: new Date() }]); // SELECT clock_timestamp()

      tx.capsule.findUnique.mockResolvedValue(
        row({ status: "ACTIVE", expiresAt: new Date(Date.now() - 60_000) }),
      );

      const err = await repo.consumeView(CAPSULE_ID).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(CapsuleNotConsumableError);
      expect((err as CapsuleNotConsumableError).reason).toBe("EXPIRED");
    });

    it("throws CapsuleNotConsumableError(VIEW_LIMIT_REACHED) when a concurrent consumer won the race", async () => {
      // The UPDATE matched 0 rows; diagnostic read shows ACTIVE + valid TTL but
      // currentViews already at maxViews — the canonical "lost race" fingerprint.
      tx.$queryRaw
        .mockResolvedValueOnce([]) // UPDATE produced no row
        .mockResolvedValueOnce([{ now: new Date() }]); // SELECT clock_timestamp()

      tx.capsule.findUnique.mockResolvedValue(
        row({ status: "ACTIVE", maxViews: 3, currentViews: 3, expiresAt: FUTURE }),
      );

      const err = await repo.consumeView(CAPSULE_ID).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(CapsuleNotConsumableError);
      expect((err as CapsuleNotConsumableError).reason).toBe("VIEW_LIMIT_REACHED");
    });

    it("CapsuleNotConsumableError includes the capsule ID", async () => {
      tx.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ now: new Date() }]);
      tx.capsule.findUnique.mockResolvedValue(row({ status: "EXPIRED" }));

      const err = await repo.consumeView(CAPSULE_ID).catch((e: unknown) => e);
      expect((err as CapsuleNotConsumableError).capsuleId).toBe(CAPSULE_ID);
    });
  });

  // -------------------------------------------------------------------------
  describe("error handling", () => {
    it("wraps unexpected Prisma/connection errors in DatabaseError", async () => {
      tx.$queryRaw.mockRejectedValue(new Error("Connection reset by peer"));
      await expect(repo.consumeView(CAPSULE_ID)).rejects.toBeInstanceOf(DatabaseError);
    });

    it("wraps invalid-algorithm rows (toDomain boundary) in DatabaseError", async () => {
      tx.$queryRaw.mockResolvedValue([
        row({ algorithm: "ChaCha20-Poly1305", currentViews: 1, status: "ACTIVE" }),
      ]);
      await expect(repo.consumeView(CAPSULE_ID)).rejects.toBeInstanceOf(DatabaseError);
    });

    it("propagates DB clock read failures as DatabaseError (do not swallow)", async () => {
      // UPDATE matched no row; the diagnostic clock query failed.
      tx.$queryRaw
        .mockResolvedValueOnce([])
        .mockRejectedValueOnce(new Error("DB clock read failed"));

      tx.capsule.findUnique.mockResolvedValue(
        row({ status: "ACTIVE", expiresAt: new Date(Date.now() - 60_000) }),
      );

      await expect(repo.consumeView(CAPSULE_ID)).rejects.toBeInstanceOf(DatabaseError);
    });

    it("does not re-wrap CapsuleNotFoundError as DatabaseError", async () => {
      tx.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ now: new Date() }]);
      tx.capsule.findUnique.mockResolvedValue(null);

      const err = await repo.consumeView(CAPSULE_ID).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(CapsuleNotFoundError);
      expect(err).not.toBeInstanceOf(DatabaseError);
    });

    it("does not re-wrap CapsuleNotConsumableError as DatabaseError", async () => {
      tx.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ now: new Date() }]);
      tx.capsule.findUnique.mockResolvedValue(row({ status: "EXPIRED" }));

      const err = await repo.consumeView(CAPSULE_ID).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(CapsuleNotConsumableError);
      expect(err).not.toBeInstanceOf(DatabaseError);
    });
  });

  // -------------------------------------------------------------------------
  describe("simulated serialised concurrency (unit-level only)", () => {
    /**
     * IMPORTANT: these are NOT true concurrency tests.
     *
     * They simulate the serialised outcome that PostgreSQL's row-level locking
     * produces: the mock grants exactly N successful UPDATE results and rejects
     * the rest.  The application-level logic is verified, but the database's
     * atomic guarantee can only be proven by the integration tests below.
     */

    it("maxViews = 1: exactly 1 of 10 callers succeeds; all losers receive CapsuleNotConsumableError", async () => {
      const successRow = row({ maxViews: 1, currentViews: 1, status: "VIEW_LIMIT_REACHED" });
      const exhausted  = row({ maxViews: 1, currentViews: 1, status: "VIEW_LIMIT_REACHED", expiresAt: FUTURE });

      tx.$queryRaw
        .mockResolvedValueOnce([successRow]) // winner
        .mockResolvedValue([]);              // all losers

      tx.capsule.findUnique.mockResolvedValue(exhausted);

      const results = await Promise.allSettled(
        Array.from({ length: 10 }, () => repo.consumeView(CAPSULE_ID)),
      );

      const successes = results.filter((r) => r.status === "fulfilled");
      const failures  = results.filter((r) => r.status === "rejected");

      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(9);

      for (const f of failures) {
        const reason = (f as PromiseRejectedResult).reason;
        expect(reason).toBeInstanceOf(CapsuleNotConsumableError);
        expect((reason as CapsuleNotConsumableError).reason).toBe("VIEW_LIMIT_REACHED");
      }
    });

    it("maxViews = 3: exactly 3 of 10 callers succeed; 7 losers receive CapsuleNotConsumableError", async () => {
      const r1 = row({ maxViews: 3, currentViews: 1, status: "ACTIVE" });
      const r2 = row({ maxViews: 3, currentViews: 2, status: "ACTIVE" });
      const r3 = row({ maxViews: 3, currentViews: 3, status: "VIEW_LIMIT_REACHED" });
      const exhausted = row({ maxViews: 3, currentViews: 3, status: "VIEW_LIMIT_REACHED", expiresAt: FUTURE });

      tx.$queryRaw
        .mockResolvedValueOnce([r1])
        .mockResolvedValueOnce([r2])
        .mockResolvedValueOnce([r3])
        .mockResolvedValue([]);

      tx.capsule.findUnique.mockResolvedValue(exhausted);

      const results = await Promise.allSettled(
        Array.from({ length: 10 }, () => repo.consumeView(CAPSULE_ID)),
      );

      const successes = results.filter((r) => r.status === "fulfilled");
      const failures  = results.filter((r) => r.status === "rejected");

      expect(successes).toHaveLength(3);
      expect(failures).toHaveLength(7);

      // The three successful views must carry the correct incremented counts
      const views = (successes as PromiseFulfilledResult<StoredCapsule>[])
        .map((r) => r.value.currentViews)
        .sort((a, b) => a - b);
      expect(views).toEqual([1, 2, 3]);

      for (const f of failures) {
        expect((f as PromiseRejectedResult).reason).toBeInstanceOf(CapsuleNotConsumableError);
      }
    });

    it("NUCLEAR burnAfterRead: 1 of 10 succeeds with BURNED status; delete called exactly once", async () => {
      const nuclearRow = row({
        recipe: "NUCLEAR",
        maxViews: 1,
        currentViews: 1,
        requiresPassword: true,
        burnAfterRead: true,
        status: "VIEW_LIMIT_REACHED",
      });
      const exhausted = row({
        recipe: "NUCLEAR",
        maxViews: 1,
        currentViews: 1,
        status: "VIEW_LIMIT_REACHED",
        expiresAt: FUTURE,
      });

      tx.$queryRaw
        .mockResolvedValueOnce([nuclearRow])  // winner
        .mockResolvedValue([]);               // losers

      tx.capsule.delete.mockResolvedValue(nuclearRow);
      tx.capsule.findUnique.mockResolvedValue(exhausted);

      const results = await Promise.allSettled(
        Array.from({ length: 10 }, () => repo.consumeView(CAPSULE_ID)),
      );

      const successes = results.filter((r) => r.status === "fulfilled");
      expect(successes).toHaveLength(1);

      const winner = (successes[0] as PromiseFulfilledResult<StoredCapsule>).value;
      expect(winner.status).toBe("BURNED");
      expect(winner.burnAfterRead).toBe(true);

      // The capsule must have been hard-deleted exactly once
      expect(tx.capsule.delete).toHaveBeenCalledOnce();
      expect(tx.capsule.delete).toHaveBeenCalledWith({ where: { id: CAPSULE_ID } });
    });
  });
});

// ---------------------------------------------------------------------------
// Integration tests — require a live PostgreSQL database
//
// These tests prove that PostgreSQL's row-level locking inside the atomic
// UPDATE statement prevents concurrent over-consumption.  They cannot be
// proven by mocks and MUST be run against a real database.
//
// They are automatically skipped when DATABASE_URL is not set.
//
// To run them:
//   DATABASE_URL=postgres://user:pass@host/db \
//     corepack pnpm exec vitest run apps/backend/src/repository
// ---------------------------------------------------------------------------

const hasPg = Boolean(process.env["DATABASE_URL"]);

describe.skipIf(!hasPg)(
  "PrismaCapsuleRepository.consumeView — integration (requires PostgreSQL)",
  () => {
    let prismaClient: PrismaClient;
    let repo: PrismaCapsuleRepository;

    beforeEach(async () => {
      // Dynamic import ensures PrismaClient does not attempt a connection
      // during unit-test runs where DATABASE_URL is absent.
      const { PrismaClient: PC } = await import("@prisma/client");
      prismaClient = new PC() as PrismaClient;
      repo = new PrismaCapsuleRepository(prismaClient);
    });

    afterEach(async () => {
      try {
        // Remove all rows created by this test.
        await (prismaClient as unknown as {
          capsule: { deleteMany: (args?: unknown) => Promise<unknown> };
        }).capsule.deleteMany({});
      } finally {
        await prismaClient.$disconnect();
      }
    });

    it("allows exactly 1 of 10 concurrent consumers for maxViews = 1 (NUCLEAR)", async () => {
      const capsule = await repo.create({
        ciphertext: "int-ciphertext",
        nonce: "int-nonce",
        algorithm: "AES-GCM-256",
        recipe: "NUCLEAR",
        expiresAt: new Date(Date.now() + 900_000),
        maxViews: 1,
        requiresPassword: true,
        burnAfterRead: true,
      });

      const results = await Promise.allSettled(
        Array.from({ length: 10 }, () => repo.consumeView(capsule.id)),
      );

      const successes = results.filter((r) => r.status === "fulfilled");
      const failures  = results.filter((r) => r.status === "rejected");

      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(9);

      const winner = (successes[0] as PromiseFulfilledResult<StoredCapsule>).value;
      expect(winner.status).toBe("BURNED");

      // Record must be gone (burned + deleted)
      const finalState = await repo.findById(capsule.id);
      expect(finalState).toBeNull();
    });

    it("allows exactly 3 of 10 concurrent consumers for maxViews = 3 (SECURE)", async () => {
      const capsule = await repo.create({
        ciphertext: "int-ciphertext",
        nonce: "int-nonce",
        algorithm: "AES-GCM-256",
        recipe: "SECURE",
        expiresAt: new Date(Date.now() + 86_400_000),
        maxViews: 3,
        requiresPassword: false,
        burnAfterRead: false,
      });

      const results = await Promise.allSettled(
        Array.from({ length: 10 }, () => repo.consumeView(capsule.id)),
      );

      const successes = results.filter((r) => r.status === "fulfilled");
      const failures  = results.filter((r) => r.status === "rejected");

      expect(successes).toHaveLength(3);
      expect(failures).toHaveLength(7);

      for (const f of failures) {
        expect((f as PromiseRejectedResult).reason).toBeInstanceOf(CapsuleNotConsumableError);
      }

      // Final persisted state: exactly 3 views, limit reached
      const finalState = await repo.findById(capsule.id);
      expect(finalState?.currentViews).toBe(3);
      expect(finalState?.status).toBe("VIEW_LIMIT_REACHED");
    });
  },
);
