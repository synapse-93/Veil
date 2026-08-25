import { useEffect, useState } from "react";
import type { SecurityRecipe } from "@secureshare/shared";

export const STORAGE_KEY = "veil_history";
const MAX_ENTRIES = 50;

export function getHistoryStorageKey(userId?: string | null): string {
  return userId ? `${STORAGE_KEY}:${userId}` : STORAGE_KEY;
}

/**
 * A single capsule entry in local creator history.
 *
 * SECURITY — intentionally excludes all sensitive fields.
 * NEVER store: plaintext · password · DEK · KEK · fragment · decryption key.
 */
export type HistoryEntry = {
  id: string;
  recipe: SecurityRecipe;
  createdAt: string;
  expiresAt: string;
  maxViews: number;
  requiresPassword: boolean;
  burnAfterRead: boolean;
  revokeToken?: string;
  revoked?: boolean;
};

export function readStorage(userId?: string | null): HistoryEntry[] {
  const key = getHistoryStorageKey(userId);
  try {
    const raw =
      localStorage.getItem(key) ||
      localStorage.getItem(STORAGE_KEY) ||
      localStorage.getItem("secureshare_history") ||
      localStorage.getItem("veil_history_v1");
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

export function writeStorage(entries: HistoryEntry[], userId?: string | null): void {
  try {
    localStorage.setItem(getHistoryStorageKey(userId), JSON.stringify(entries));
  } catch {
    /* quota exceeded or unavailable */
  }
}

export function clearStorage(userId?: string | null): void {
  try {
    if (userId) {
      localStorage.removeItem(getHistoryStorageKey(userId));
    }
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem("secureshare_history");
    localStorage.removeItem("veil_history_v1");
  } catch {
    /* storage unavailable */
  }
}

export function useHistory(userId?: string | null) {
  const [entries, setEntries] = useState<HistoryEntry[]>(() => readStorage(userId));

  useEffect(() => {
    setEntries(readStorage(userId));
  }, [userId]);

  function addEntry(entry: HistoryEntry): void {
    setEntries((prev) => {
      const updated = [entry, ...prev].slice(0, MAX_ENTRIES);
      writeStorage(updated, userId);
      return updated;
    });
  }

  function markRevoked(id: string): void {
    setEntries((prev) => {
      const updated = prev.map((e) => (e.id === id ? { ...e, revoked: true } : e));
      writeStorage(updated, userId);
      return updated;
    });
  }

  function clearHistory(): void {
    setEntries([]);
    clearStorage(userId);
  }

  return { entries, addEntry, markRevoked, clearHistory };
}
