import { ConflictError, UnauthorizedError } from "../errors.js";
import type { UserRepository, StoredUser } from "../repository/user.repository.js";
import { hashPassword, verifyPassword, createSessionToken } from "../utils/auth.js";

export class UserService {
  constructor(private readonly userRepo: UserRepository) {}

  async register(
    username: string,
    password: string,
    isPublic = true,
    publicKey?: string,
  ): Promise<{ user: { id: string; username: string; isPublic: boolean; publicKey?: string | null; createdAt: string }; token: string }> {
    const cleanUsername = username.trim();
    const existing = await this.userRepo.findByUsername(cleanUsername);
    if (existing) {
      throw new ConflictError("Username is already taken");
    }

    const passwordHash = hashPassword(password);
    const created = await this.userRepo.create(cleanUsername, passwordHash, isPublic, publicKey);
    const token = createSessionToken(created.id, created.username);

    return {
      user: {
        id: created.id,
        username: created.username,
        isPublic: created.isPublic,
        publicKey: created.publicKey ?? null,
        createdAt: created.createdAt.toISOString(),
      },
      token,
    };
  }

  async login(
    username: string,
    password: string,
  ): Promise<{ user: { id: string; username: string; isPublic: boolean; publicKey?: string | null; createdAt: string }; token: string }> {
    const cleanUsername = username.trim();
    const user = await this.userRepo.findByUsername(cleanUsername);
    if (!user) {
      throw new UnauthorizedError("Invalid username or password");
    }

    const valid = verifyPassword(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedError("Invalid username or password");
    }

    const token = createSessionToken(user.id, user.username);

    return {
      user: {
        id: user.id,
        username: user.username,
        isPublic: user.isPublic,
        publicKey: user.publicKey ?? null,
        createdAt: user.createdAt.toISOString(),
      },
      token,
    };
  }

  async getUserById(id: string): Promise<StoredUser | null> {
    return this.userRepo.findById(id);
  }

  async getUserByUsername(username: string): Promise<StoredUser | null> {
    return this.userRepo.findByUsername(username);
  }

  async updatePrivacy(userId: string, isPublic: boolean): Promise<StoredUser> {
    return this.userRepo.updatePrivacy(userId, isPublic);
  }

  async updatePublicKey(userId: string, publicKey: string): Promise<StoredUser> {
    return this.userRepo.updatePublicKey(userId, publicKey);
  }

  async getOrCreateSessionUser(userId: string, username: string): Promise<StoredUser> {
    let user = await this.userRepo.findById(userId);
    if (!user) {
      user = await this.userRepo.findByUsername(username);
    }
    if (!user) {
      user = await this.userRepo.create(username, hashPassword("session-auto-recovered"), true);
    }
    return user;
  }

  async searchUsers(query: string, excludeUserId: string) {
    const results = await this.userRepo.searchUsers(query, excludeUserId, 10);
    return results.map((r) => ({
      id: r.id,
      username: r.username,
      isPublic: r.isPublic,
      publicKey: r.publicKey ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
