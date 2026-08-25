export const SECURITY_RECIPE_VALUES = ["QUICK", "SECURE", "NUCLEAR"] as const;

export type SecurityRecipe = (typeof SECURITY_RECIPE_VALUES)[number];

export type CapsuleStatus = "ACTIVE" | "VIEW_LIMIT_REACHED" | "EXPIRED" | "BURNED" | "REVOKED";

/**
 * The server-visible encrypted payload.
 * MUST contain only ciphertext, nonce, and algorithm identifier.
 * Client-side decryption material (DEK, KEK, wrapped key, salt, KDF params,
 * URL fragment) MUST NOT appear here.
 */
export type EncryptedPayload = {
  ciphertext: string;
  nonce: string;
  algorithm: "AES-GCM-256";
};

/**
 * Fields sent to the server when creating a capsule.
 * The URL fragment (decryption key material) is NEVER part of this type.
 */
export type CapsuleCreationRequest = {
  encryptedPayload: EncryptedPayload;
  recipe: SecurityRecipe;
  ttlSeconds: number;
  maxViews: number;
  requiresPassword: boolean;
  burnAfterRead: boolean;
};

export type CapsuleMetadata = {
  id: string;
  recipe: SecurityRecipe;
  createdAt: string;
  expiresAt: string;
  maxViews: number;
  currentViews: number;
  requiresPassword: boolean;
  burnAfterRead: boolean;
  status?: CapsuleStatus;
};

export type CapsuleResponse = {
  metadata: CapsuleMetadata;
  encryptedPayload: EncryptedPayload;
  revokeToken?: string;
};
