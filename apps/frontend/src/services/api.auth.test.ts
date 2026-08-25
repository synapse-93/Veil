import { beforeEach, describe, expect, it, vi } from "vitest";

import { clearAuthStorage, getAuthToken, logoutUser, setAuthToken } from "./api.js";

function createStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    clear: () => {
      map.clear();
    },
  };
}

describe("auth lifecycle storage", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", { value: createStorage(), configurable: true });
    Object.defineProperty(globalThis, "sessionStorage", { value: createStorage(), configurable: true });
  });

  it("clears persisted auth and queued chat state on logout", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer token-a",
      });

      return {
        ok: true,
        json: async () => ({ success: true }),
      } as Response;
    });

    setAuthToken("token-a");
    sessionStorage.setItem("veil_target_chat_conv", "conv-1");

    await logoutUser({ fetch: fetchMock as typeof fetch });

    expect(getAuthToken()).toBeNull();
    expect(sessionStorage.getItem("veil_target_chat_conv")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("removes stale auth state before a new session is installed", () => {
    setAuthToken("token-a");
    sessionStorage.setItem("veil_target_chat_conv", "conv-1");

    clearAuthStorage();
    setAuthToken("token-b");

    expect(getAuthToken()).toBe("token-b");
    expect(sessionStorage.getItem("veil_target_chat_conv")).toBeNull();
  });

  it("drops account A session on logout before allowing account B to be installed", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer token-a",
      });

      return {
        ok: true,
        json: async () => ({ success: true }),
      } as Response;
    });

    setAuthToken("token-a");
    sessionStorage.setItem("veil_target_chat_conv", "conv-a");

    await logoutUser({ fetch: fetchMock as typeof fetch });

    expect(getAuthToken()).toBeNull();
    expect(sessionStorage.getItem("veil_target_chat_conv")).toBeNull();

    setAuthToken("token-b");
    expect(getAuthToken()).toBe("token-b");
  });
});
