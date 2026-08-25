import { describe, expect, it } from "vitest";

import { createSessionToken, revokeSessionToken, verifySessionToken } from "./auth.js";

describe("session token invalidation", () => {
  it("revokes a session token so it cannot be used after logout", () => {
    const token = createSessionToken("user-123", "alice");

    expect(verifySessionToken(token)).not.toBeNull();
    expect(revokeSessionToken(token)).toBe(true);
    expect(verifySessionToken(token)).toBeNull();
  });

  it("rejects a session token with a missing jti after logout if it was manually revoked", () => {
    const token = createSessionToken("user-456", "bob");
    const cold = token.split(".")[0];

    expect(cold).toBeTruthy();
    expect(verifySessionToken(token)).not.toBeNull();
    expect(revokeSessionToken(token)).toBe(true);
    expect(verifySessionToken(token)).toBeNull();
  });
});
