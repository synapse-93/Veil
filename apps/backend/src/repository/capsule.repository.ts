import fs from "node:fs";
import path from "node:path";
import { type PrismaClient, Prisma } from "@prisma/client";
import type { Capsule as PrismaRecord } from "@prisma/client";
import type { SecurityRecipe } from "@secureshare/shared";

import {
  CapsuleNotFoundError,
  CapsuleNotConsumableError,
  DatabaseError,
  ForbiddenError,
} from "../errors.js";

// ---------------------------------------------------------------------------
// Domain types — server-side only, not exposed to the client
// ---------------------------------------------------------------------------

export type CapsuleStatus =
  | "ACTIVE"
  | "VIEW_LIMIT_REACHED"
  | "EXPIRED"
  | "BURNED"
  | "REVOKED";

export type StoredCapsule = {
  id: string;
  ciphertext: string;
  nonce: string;
  algorithm: "AES-GCM-256";
  recipe: SecurityRecipe;
  createdAt: Date;
  expiresAt: Date;
  maxViews: number;
  currentViews: number;
  requiresPassword: boolean;
  burnAfterRead: boolean;
  status: CapsuleStatus;
  revokeToken?: string | null;
  creatorId?: string | null;
};

export type CreateCapsuleData = {
  ciphertext: string;
  nonce: string;
  algorithm: "AES-GCM-256";
  recipe: SecurityRecipe;
  expiresAt: Date;
  maxViews: number;
  requiresPassword: boolean;
  burnAfterRead: boolean;
  revokeToken?: string;
  creatorId?: string;
};

// ---------------------------------------------------------------------------
// Repository interface
// ---------------------------------------------------------------------------

export interface CapsuleRepository {
  create(data: CreateCapsuleData): Promise<StoredCapsule>;
  findById(id: string): Promise<StoredCapsule | null>;
  findByCreatorId(creatorId: string): Promise<StoredCapsule[]>;
  delete(id: string): Promise<void>;
  expireStale(): Promise<number>;
  consumeView(id: string): Promise<StoredCapsule>;
  revoke(id: string, tokenOrUserId: string): Promise<StoredCapsule>;
}

// ---------------------------------------------------------------------------
// Mapping — Prisma record → domain object
// ---------------------------------------------------------------------------

function toDomain(record: PrismaRecord): StoredCapsule {
  if (record.algorithm !== "AES-GCM-256") {
    throw new DatabaseError(
      `Invalid persisted capsule algorithm: ${String(record.algorithm)}`,
    );
  }

  return {
    id: record.id,
    ciphertext: record.ciphertext,
    nonce: record.nonce,
    algorithm: record.algorithm,
    recipe: record.recipe,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    maxViews: record.maxViews,
    currentViews: record.currentViews,
    requiresPassword: record.requiresPassword,
    burnAfterRead: record.burnAfterRead,
    status: record.status as CapsuleStatus,
    revokeToken: record.revokeToken,
    creatorId: record.creatorId,
  };
}

// ---------------------------------------------------------------------------
// Prisma-backed implementation
// ---------------------------------------------------------------------------

export class PrismaCapsuleRepository implements CapsuleRepository {
  constructor(private readonly db: PrismaClient) {}

  async create(data: CreateCapsuleData): Promise<StoredCapsule> {
    try {
      const createData: any = {
        ciphertext: data.ciphertext,
        nonce: data.nonce,
        algorithm: data.algorithm,
        recipe: data.recipe,
        expiresAt: data.expiresAt,
        maxViews: data.maxViews,
        requiresPassword: data.requiresPassword,
        burnAfterRead: data.burnAfterRead,
      };
      if (data.revokeToken !== undefined) {
        createData.revokeToken = data.revokeToken;
      }
      if (data.creatorId !== undefined) {
        createData.creatorId = data.creatorId;
      }

      const record = await this.db.capsule.create({
        data: createData,
      });
      return toDomain(record);
    } catch (err) {
      throw new DatabaseError("Failed to create capsule.", { cause: err });
    }
  }

  async findById(id: string): Promise<StoredCapsule | null> {
    try {
      const record = await this.db.capsule.findUnique({ where: { id } });
      return record ? toDomain(record) : null;
    } catch (err) {
      throw new DatabaseError("Failed to find capsule.", { cause: err });
    }
  }

  async findByCreatorId(creatorId: string): Promise<StoredCapsule[]> {
    try {
      const records = await this.db.capsule.findMany({
        where: { creatorId },
        orderBy: { createdAt: "desc" },
      });
      return records.map(toDomain);
    } catch (err) {
      throw new DatabaseError("Failed to find capsules for user.", { cause: err });
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.db.capsule.delete({ where: { id } });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2025"
      ) {
        throw new CapsuleNotFoundError(id);
      }
      throw new DatabaseError("Failed to delete capsule.", { cause: err });
    }
  }

  async expireStale(): Promise<number> {
    try {
      const result = await this.db.capsule.updateMany({
        where: {
          status: "ACTIVE",
          expiresAt: {
            lte: new Date(),
          },
        },
        data: {
          status: "EXPIRED",
        },
      });
      return result.count;
    } catch (err) {
      throw new DatabaseError("Failed to expire stale capsules.", { cause: err });
    }
  }

  async consumeView(id: string): Promise<StoredCapsule> {
    try {
      return await this.db.$transaction(async (tx) => {
        const existing = await tx.capsule.findUnique({ where: { id } });

        if (!existing) {
          throw new CapsuleNotFoundError(id);
        }

        if (existing.status !== "ACTIVE") {
          throw new CapsuleNotConsumableError(
            id,
            existing.status as "EXPIRED" | "BURNED" | "VIEW_LIMIT_REACHED" | "REVOKED",
          );
        }

        const now = new Date();
        if (existing.expiresAt <= now) {
          await tx.capsule.update({
            where: { id },
            data: { status: "EXPIRED" },
          });
          throw new CapsuleNotConsumableError(id, "EXPIRED");
        }

        if (existing.currentViews >= existing.maxViews) {
          await tx.capsule.update({
            where: { id },
            data: { status: "VIEW_LIMIT_REACHED" },
          });
          throw new CapsuleNotConsumableError(id, "VIEW_LIMIT_REACHED");
        }

        const nextViews = existing.currentViews + 1;
        const nextStatus =
          nextViews >= existing.maxViews ? "VIEW_LIMIT_REACHED" : "ACTIVE";

        if (existing.burnAfterRead) {
          await tx.capsule.delete({ where: { id } });
          return { ...toDomain(existing), currentViews: nextViews, status: "BURNED" as const };
        }

        const updated = await tx.capsule.update({
          where: { id },
          data: {
            currentViews: nextViews,
            status: nextStatus,
          },
        });

        return toDomain(updated);
      });
    } catch (err) {
      if (
        err instanceof CapsuleNotFoundError ||
        err instanceof CapsuleNotConsumableError
      ) {
        throw err;
      }
      throw new DatabaseError("Failed to consume capsule view.", { cause: err });
    }
  }

  async revoke(id: string, tokenOrUserId: string): Promise<StoredCapsule> {
    try {
      const existing = await this.db.capsule.findUnique({ where: { id } });
      if (!existing) {
        throw new CapsuleNotFoundError(id);
      }

      // Check ownership via revokeToken or creatorId
      const authorized =
        (existing.revokeToken && existing.revokeToken === tokenOrUserId) ||
        (existing.creatorId && existing.creatorId === tokenOrUserId);

      if (!authorized) {
        throw new ForbiddenError("Invalid revoke token or unauthorized user.");
      }

      if (existing.status === "REVOKED") {
        return toDomain(existing);
      }

      const updated = await this.db.capsule.update({
        where: { id },
        data: {
          status: "REVOKED",
          ciphertext: "", // Erase ciphertext on revoke for immediate defense-in-depth
        },
      });

      return toDomain(updated);
    } catch (err) {
      if (
        err instanceof CapsuleNotFoundError ||
        err instanceof ForbiddenError
      ) {
        throw err;
      }
      throw new DatabaseError("Failed to revoke capsule.", { cause: err });
    }
  }
}

// ---------------------------------------------------------------------------
// In-Memory implementation (Fallback / AI Studio Ephemeral storage)
// ---------------------------------------------------------------------------

export class InMemoryCapsuleRepository implements CapsuleRepository {
  private readonly store = new Map<string, StoredCapsule>();
  private readonly storagePath: string;

  constructor(storageDir?: string) {
    const dir = storageDir || path.resolve(process.cwd(), ".veil_data");
    this.storagePath = path.join(dir, "capsules.json");
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      this.load();
    } catch (err) {
      console.warn(
        "[CapsuleRepository] Failed to init storage directory:",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  private load(): void {
    try {
      if (fs.existsSync(this.storagePath)) {
        const raw = fs.readFileSync(this.storagePath, "utf-8");
        const list: Array<StoredCapsule & { createdAt: string; expiresAt: string }> = JSON.parse(raw);
        for (const item of list) {
          this.store.set(item.id, {
            ...item,
            createdAt: new Date(item.createdAt),
            expiresAt: new Date(item.expiresAt),
          });
        }
      }
    } catch (err) {
      console.warn(
        "[CapsuleRepository] Failed to load persisted capsules:",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  private save(): void {
    try {
      const list = Array.from(this.store.values()).map((c) => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
        expiresAt: c.expiresAt.toISOString(),
      }));
      fs.writeFileSync(this.storagePath, JSON.stringify(list, null, 2), "utf-8");
    } catch (err) {
      console.warn(
        "[CapsuleRepository] Failed to persist capsules:",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  async create(data: CreateCapsuleData): Promise<StoredCapsule> {
    const id = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : (await import("node:crypto")).randomUUID();
    const capsule: StoredCapsule = {
      id,
      ciphertext: data.ciphertext,
      nonce: data.nonce,
      algorithm: data.algorithm,
      recipe: data.recipe,
      createdAt: new Date(),
      expiresAt: data.expiresAt,
      maxViews: data.maxViews,
      currentViews: 0,
      requiresPassword: data.requiresPassword,
      burnAfterRead: data.burnAfterRead,
      status: "ACTIVE",
      revokeToken: data.revokeToken ?? null,
      creatorId: data.creatorId ?? null,
    };
    this.store.set(id, capsule);
    this.save();
    return { ...capsule };
  }

  async findById(id: string): Promise<StoredCapsule | null> {
    const item = this.store.get(id);
    return item ? { ...item } : null;
  }

  async findByCreatorId(creatorId: string): Promise<StoredCapsule[]> {
    const results: StoredCapsule[] = [];
    for (const capsule of this.store.values()) {
      if (capsule.creatorId === creatorId) {
        results.push({ ...capsule });
      }
    }
    return results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async delete(id: string): Promise<void> {
    if (!this.store.has(id)) {
      throw new CapsuleNotFoundError(id);
    }
    this.store.delete(id);
    this.save();
  }

  async expireStale(): Promise<number> {
    const now = new Date();
    let count = 0;
    for (const [id, capsule] of this.store.entries()) {
      if (capsule.status === "ACTIVE" && capsule.expiresAt <= now) {
        capsule.status = "EXPIRED";
        this.store.set(id, capsule);
        count++;
      }
    }
    if (count > 0) this.save();
    return count;
  }

  async consumeView(id: string): Promise<StoredCapsule> {
    const capsule = this.store.get(id);
    if (!capsule) {
      throw new CapsuleNotFoundError(id);
    }

    if (capsule.status !== "ACTIVE") {
      throw new CapsuleNotConsumableError(
        id,
        capsule.status as "EXPIRED" | "BURNED" | "VIEW_LIMIT_REACHED" | "REVOKED",
      );
    }

    const now = new Date();
    if (capsule.expiresAt <= now) {
      capsule.status = "EXPIRED";
      this.store.set(id, capsule);
      this.save();
      throw new CapsuleNotConsumableError(id, "EXPIRED");
    }

    if (capsule.currentViews >= capsule.maxViews) {
      capsule.status = "VIEW_LIMIT_REACHED";
      this.store.set(id, capsule);
      this.save();
      throw new CapsuleNotConsumableError(id, "VIEW_LIMIT_REACHED");
    }

    capsule.currentViews += 1;
    if (capsule.currentViews >= capsule.maxViews) {
      capsule.status = "VIEW_LIMIT_REACHED";
    }

    if (capsule.burnAfterRead) {
      this.store.delete(id);
      this.save();
      return { ...capsule, status: "BURNED" as const };
    }

    this.store.set(id, capsule);
    this.save();
    return { ...capsule };
  }

  async revoke(id: string, tokenOrUserId: string): Promise<StoredCapsule> {
    const capsule = this.store.get(id);
    if (!capsule) {
      throw new CapsuleNotFoundError(id);
    }

    const authorized =
      (capsule.revokeToken && capsule.revokeToken === tokenOrUserId) ||
      (capsule.creatorId && capsule.creatorId === tokenOrUserId);

    if (!authorized) {
      throw new ForbiddenError("Invalid revoke token or unauthorized user.");
    }

    capsule.status = "REVOKED";
    capsule.ciphertext = "";
    this.store.set(id, capsule);
    this.save();
    return { ...capsule };
  }
}
