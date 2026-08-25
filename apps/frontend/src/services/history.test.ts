import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearStorage, readStorage, STORAGE_KEY, writeStorage, type HistoryEntry } from "../hooks/useHistory.js";

const SAFE_ENTRY: HistoryEntry = {
  id: "00000000-0000-0000-0000-000000000001",
  recipe: "QUICK",
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
  maxViews: 5,
  requiresPassword: false,
  burnAfterRead: false,
};

function createLocalStorageMock() {
  const store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach((key) => { delete store[key]; }); },
    get length() { return Object.keys(store).length; },
    key: (index: number) => Object.keys(store)[index] ?? null,
  };
}

describe("History storage — real implementation", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createLocalStorageMock());
    globalThis.localStorage.clear();
  });

  it("stores metadata and reads it back using the actual storage implementation", () => {
    writeStorage([SAFE_ENTRY]);

    expect(readStorage()).toHaveLength(1);
    expect(readStorage()[0]).toMatchObject({
      id: SAFE_ENTRY.id,
      recipe: SAFE_ENTRY.recipe,
      maxViews: SAFE_ENTRY.maxViews,
      requiresPassword: SAFE_ENTRY.requiresPassword,
      burnAfterRead: SAFE_ENTRY.burnAfterRead,
    });
    expect(globalThis.localStorage.getItem(STORAGE_KEY)).toContain(SAFE_ENTRY.id);
  });

  it("never stores plaintext, password values, DEK, KEK, or raw fragment material", () => {
    writeStorage([{ ...SAFE_ENTRY, id: "entry-with-secrets" }]);

    const raw = globalThis.localStorage.getItem(STORAGE_KEY) ?? "";
    for (const forbidden of [
      "my super secret message",
      "plaintext",
      "p@ssw0rd",
      "super-secret-passphrase",
      "dek",
      "kek",
      "fragment",
      "decryptionKey",
      "wrappedKey",
      "salt",
    ]) {
      expect(raw.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it("prepends new entries and keeps only recent metadata", () => {
    const first = { ...SAFE_ENTRY, id: "first" };
    const second = { ...SAFE_ENTRY, id: "second" };

    writeStorage([first]);
    writeStorage([second, ...readStorage()]);

    expect(readStorage().map((entry) => entry.id)).toEqual(["second", "first"]);
    expect(readStorage()).toHaveLength(2);
  });

  it("clears the history using the app's storage cleanup path", () => {
    writeStorage([SAFE_ENTRY]);
    expect(readStorage()).toHaveLength(1);

    clearStorage();

    expect(readStorage()).toEqual([]);
    expect(globalThis.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("handles malformed or non-array storage safely", () => {
    globalThis.localStorage.setItem(STORAGE_KEY, "not-valid-json{{");
    expect(readStorage()).toEqual([]);

    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify({ nope: true }));
    expect(readStorage()).toEqual([]);
  });

  it("preserves safe flags for password-protected capsules", () => {
    const nuclearEntry: HistoryEntry = {
      ...SAFE_ENTRY,
      id: "nuclear-entry",
      recipe: "NUCLEAR",
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
      maxViews: 1,
      requiresPassword: true,
      burnAfterRead: true,
    };

    writeStorage([nuclearEntry]);

    expect(readStorage()[0]).toMatchObject({
      requiresPassword: true,
      burnAfterRead: true,
    });
    expect(globalThis.localStorage.getItem(STORAGE_KEY) ?? "").not.toContain("fragment");
  });
});
