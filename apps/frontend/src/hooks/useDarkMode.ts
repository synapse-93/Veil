import { useEffect, useState } from "react";

const STORAGE_KEY = "veil_dark";

/**
 * Manages dark/light mode toggle.
 * Reads localStorage first, falls back to prefers-color-scheme.
 * Applies/removes `.dark` on <html>.
 */
export function useDarkMode(): { dark: boolean; toggle: () => void } {
  const [dark, setDark] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored !== null) return stored === "true";
    } catch {
      /* storage unavailable */
    }
    return typeof window !== "undefined"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : false;
  });

  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    try {
      localStorage.setItem(STORAGE_KEY, String(dark));
    } catch {
      /* storage unavailable */
    }
  }, [dark]);

  return { dark, toggle: () => setDark((d) => !d) };
}
