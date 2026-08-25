import fs from "node:fs";
import path from "node:path";
import { type PrismaClient } from "@prisma/client";
import { DatabaseError } from "../errors.js";
import { hashPassword } from "../utils/auth.js";

export type StoredUser = {
  id: string;
  username: string;
  passwordHash: string;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export interface UserRepository {
  create(username: string, passwordHash: string, isPublic?: boolean): Promise<StoredUser>;
  findByUsername(username: string): Promise<StoredUser | null>;
  findById(id: string): Promise<StoredUser | null>;
  updatePrivacy(id: string, isPublic: boolean): Promise<StoredUser>;
  searchUsers(
    query: string,
    excludeUserId: string,
    limit?: number,
  ): Promise<Array<{ id: string; username: string; isPublic: boolean; createdAt: Date }>>;
}

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly db: PrismaClient) {}

  async create(username: string, passwordHash: string, isPublic = true): Promise<StoredUser> {
    try {
      const created = await (this.db.user as any).create({
        data: { username, passwordHash, isPublic },
      });
      return {
        ...created,
        isPublic: created.isPublic ?? true,
      };
    } catch (err) {
      throw new DatabaseError("Failed to create user.", { cause: err });
    }
  }

  async findByUsername(username: string): Promise<StoredUser | null> {
    try {
      const user = await this.db.user.findFirst({
        where: {
          username: {
            equals: username,
            mode: "insensitive",
          },
        },
      });
      if (!user) return null;
      return {
        ...user,
        isPublic: (user as any).isPublic ?? true,
      };
    } catch (err) {
      throw new DatabaseError("Failed to find user by username.", { cause: err });
    }
  }

  async findById(id: string): Promise<StoredUser | null> {
    try {
      const user = await this.db.user.findUnique({ where: { id } });
      if (!user) return null;
      return {
        ...user,
        isPublic: (user as any).isPublic ?? true,
      };
    } catch (err) {
      throw new DatabaseError("Failed to find user by id.", { cause: err });
    }
  }

  async updatePrivacy(id: string, isPublic: boolean): Promise<StoredUser> {
    try {
      const user = await (this.db.user as any).update({
        where: { id },
        data: { isPublic },
      });
      return {
        ...user,
        isPublic: user.isPublic ?? true,
      };
    } catch (err) {
      throw new DatabaseError("Failed to update user privacy.", { cause: err });
    }
  }

  async searchUsers(
    query: string,
    excludeUserId: string,
    limit = 10,
  ): Promise<Array<{ id: string; username: string; isPublic: boolean; createdAt: Date }>> {
    try {
      const records = await this.db.user.findMany({
        where: {
          id: { not: excludeUserId },
          username: {
            contains: query,
            mode: "insensitive",
          },
        },
        select: {
          id: true,
          username: true,
          createdAt: true,
        },
        take: limit,
      });
      return records.map((r: any) => ({
        id: r.id,
        username: r.username,
        isPublic: r.isPublic ?? true,
        createdAt: r.createdAt,
      }));
    } catch (err) {
      throw new DatabaseError("Failed to search users.", { cause: err });
    }
  }
}

export class InMemoryUserRepository implements UserRepository {
  private readonly users = new Map<string, StoredUser>();
  private readonly storagePath: string;

  constructor(storageDir?: string) {
    const dir = storageDir || path.resolve(process.cwd(), ".veil_data");
    this.storagePath = path.join(dir, "users.json");
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      this.load();
    } catch (err) {
      console.warn(
        "[UserRepository] Failed to init storage directory:",
        err instanceof Error ? err.message : String(err),
      );
    }
    this.seedDefaultUsers();
  }

  private load(): void {
    try {
      if (fs.existsSync(this.storagePath)) {
        const raw = fs.readFileSync(this.storagePath, "utf-8");
        const list: Array<StoredUser & { createdAt: string; updatedAt: string }> = JSON.parse(raw);
        for (const item of list) {
          this.users.set(item.id, {
            ...item,
            isPublic: item.isPublic ?? true,
            createdAt: new Date(item.createdAt),
            updatedAt: new Date(item.updatedAt),
          });
        }
      }
    } catch (err) {
      console.warn(
        "[UserRepository] Failed to load persisted users:",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  private save(): void {
    try {
      const list = Array.from(this.users.values()).map((u) => ({
        ...u,
        isPublic: u.isPublic ?? true,
        createdAt: u.createdAt.toISOString(),
        updatedAt: u.updatedAt.toISOString(),
      }));
      fs.writeFileSync(this.storagePath, JSON.stringify(list, null, 2), "utf-8");
    } catch (err) {
      console.warn(
        "[UserRepository] Failed to persist users:",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  private seedDefaultUsers(): void {
    // Seed @synapse_2 if not existing
    const hasSynapse2 = Array.from(this.users.values()).some(
      (u) => u.username.toLowerCase() === "synapse_2",
    );
    if (!hasSynapse2) {
      const id = "synapse_2_demo_id";
      const now = new Date();
      const user: StoredUser = {
        id,
        username: "synapse_2",
        passwordHash: hashPassword("password123"),
        isPublic: true,
        createdAt: now,
        updatedAt: now,
      };
      this.users.set(id, user);
      this.save();
    }
  }

  async create(username: string, passwordHash: string, isPublic = true): Promise<StoredUser> {
    const id = (await import("node:crypto")).randomUUID();
    const now = new Date();
    const user: StoredUser = {
      id,
      username,
      passwordHash,
      isPublic,
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(id, user);
    this.save();
    return { ...user };
  }

  async findByUsername(username: string): Promise<StoredUser | null> {
    const lower = username.toLowerCase();
    for (const user of this.users.values()) {
      if (user.username.toLowerCase() === lower) {
        return { ...user, isPublic: user.isPublic ?? true };
      }
    }
    return null;
  }

  async findById(id: string): Promise<StoredUser | null> {
    const user = this.users.get(id);
    return user ? { ...user, isPublic: user.isPublic ?? true } : null;
  }

  async updatePrivacy(id: string, isPublic: boolean): Promise<StoredUser> {
    const user = this.users.get(id);
    if (!user) {
      throw new DatabaseError(`User ${id} not found.`);
    }
    const updated: StoredUser = {
      ...user,
      isPublic,
      updatedAt: new Date(),
    };
    this.users.set(id, updated);
    this.save();
    return { ...updated };
  }

  async searchUsers(
    query: string,
    excludeUserId: string,
    limit = 10,
  ): Promise<Array<{ id: string; username: string; isPublic: boolean; createdAt: Date }>> {
    const q = query.toLowerCase();
    const results: Array<{ id: string; username: string; isPublic: boolean; createdAt: Date }> = [];
    for (const user of this.users.values()) {
      if (user.id !== excludeUserId && user.username.toLowerCase().includes(q)) {
        results.push({
          id: user.id,
          username: user.username,
          isPublic: user.isPublic ?? true,
          createdAt: user.createdAt,
        });
        if (results.length >= limit) break;
      }
    }
    return results;
  }
}

