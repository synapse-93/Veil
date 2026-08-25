import crypto from "node:crypto";
import type { SecurityRecipe } from "@secureshare/shared";
import type {
  CapsuleRepository,
  CreateCapsuleData,
  StoredCapsule,
} from "./../repository/capsule.repository.js";

export class CapsuleService {
  constructor(private readonly repo: CapsuleRepository) {}

  async createCapsule(data: {
    ciphertext: string;
    nonce: string;
    algorithm: "AES-GCM-256";
    recipe: SecurityRecipe;
    ttlSeconds: number;
    maxViews: number;
    requiresPassword: boolean;
    burnAfterRead: boolean;
    creatorId?: string;
    revokeToken?: string;
  }): Promise<StoredCapsule> {
    const expiresAt = new Date(Date.now() + data.ttlSeconds * 1000);
    const revokeToken = data.revokeToken || crypto.randomBytes(24).toString("hex");

    const createData: CreateCapsuleData = {
      ciphertext: data.ciphertext,
      nonce: data.nonce,
      algorithm: data.algorithm,
      recipe: data.recipe,
      expiresAt,
      maxViews: data.maxViews,
      requiresPassword: data.requiresPassword,
      burnAfterRead: data.burnAfterRead,
      revokeToken,
      creatorId: data.creatorId,
    };

    return this.repo.create(createData);
  }

  async consumeCapsule(id: string): Promise<StoredCapsule> {
    return this.repo.consumeView(id);
  }

  async revokeCapsule(id: string, tokenOrUserId: string): Promise<StoredCapsule> {
    return this.repo.revoke(id, tokenOrUserId);
  }

  async getUserCapsules(userId: string): Promise<StoredCapsule[]> {
    return this.repo.findByCreatorId(userId);
  }
}
