/**
 * Thrown when a requested capsule does not exist in the database.
 * The capsule may never have existed, may have already been deleted, or
 * may have been burned after read.
 */
export class CapsuleNotFoundError extends Error {
  readonly capsuleId: string;

  constructor(capsuleId: string) {
    super(`Capsule not found: ${capsuleId}`);
    this.name = "CapsuleNotFoundError";
    this.capsuleId = capsuleId;
  }
}

/**
 * Thrown when a capsule exists but its current lifecycle state prevents
 * consumption. The `reason` field maps directly to the blocking status so
 * the controller layer can return the correct HTTP status code without
 * touching Prisma internals.
 */
export class CapsuleNotConsumableError extends Error {
  readonly capsuleId: string;
  readonly reason: "EXPIRED" | "BURNED" | "VIEW_LIMIT_REACHED" | "REVOKED";

  constructor(
    capsuleId: string,
    reason: "EXPIRED" | "BURNED" | "VIEW_LIMIT_REACHED" | "REVOKED",
  ) {
    super(`Capsule ${capsuleId} cannot be consumed: ${reason}`);
    this.name = "CapsuleNotConsumableError";
    this.capsuleId = capsuleId;
    this.reason = reason;
  }
}

/**
 * Thrown when an unauthenticated request attempts to access a protected resource.
 */
export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/**
 * Thrown when an authenticated user does not have permission to access or modify a resource.
 */
export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Thrown on resource conflict (e.g. username already taken, friend request already exists).
 */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

/**
 * Thrown when a Prisma/database operation fails unexpectedly.
 * The underlying Prisma error is available via the standard `cause` property.
 */
export class DatabaseError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "DatabaseError";
  }
}
