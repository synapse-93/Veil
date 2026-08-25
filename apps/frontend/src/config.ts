/**
 * Runtime API base URL.
 *
 * In development the Vite proxy forwards /capsules/* to the backend,
 * so the default empty string (same-origin) is correct.
 * In production, set VITE_API_URL to the full backend origin.
 */
export const API_BASE_URL: string = import.meta.env.VITE_API_URL ?? "";
