import { useState } from "react";
import { createShareLink } from "@secureshare/shared";
import type { SecurityRecipe } from "@secureshare/shared";
import { encryptForShare } from "../crypto/zero-knowledge.js";
import { createCapsule } from "../services/api.js";
import { API_BASE_URL } from "../config.js";

// ---------------------------------------------------------------------------
// Recipe presets — must respect policy constraints from shared/constants
// ---------------------------------------------------------------------------

type RecipePreset = {
  recipe: SecurityRecipe;
  label: string;
  ttlSeconds: number;
  maxViews: number;
  requiresPassword: boolean;
  burnAfterRead: boolean;
  badge: string;
  color: string;
  ring: string;
  description: string;
};

const PRESETS: RecipePreset[] = [
  {
    recipe: "QUICK",
    label: "Quick",
    ttlSeconds: 604800,
    maxViews: 5,
    requiresPassword: false,
    burnAfterRead: false,
    badge: "⚡",
    color: "bg-sky-500 text-white",
    ring: "ring-sky-500",
    description: "7 days · up to 5 views",
  },
  {
    recipe: "SECURE",
    label: "Secure",
    ttlSeconds: 86400,
    maxViews: 3,
    requiresPassword: false,
    burnAfterRead: false,
    badge: "🔒",
    color: "bg-violet-600 text-white",
    ring: "ring-violet-600",
    description: "24 hours · up to 3 views",
  },
  {
    recipe: "NUCLEAR",
    label: "Nuclear",
    ttlSeconds: 900,
    maxViews: 1,
    requiresPassword: true,
    burnAfterRead: true,
    badge: "☢️",
    color: "bg-rose-600 text-white",
    ring: "ring-rose-600",
    description: "15 min · 1 view · password · burns on read",
  },
];

// ---------------------------------------------------------------------------
// Component state
// ---------------------------------------------------------------------------

type Phase =
  | { kind: "idle" }
  | { kind: "loading" }
  | {
      kind: "success";
      shareUrl: string;
      expiresAt: string;
      maxViews: number;
      burnAfterRead: boolean;
      recipe: SecurityRecipe;
    }
  | { kind: "error"; message: string };

// ---------------------------------------------------------------------------
// CapsuleForm
// ---------------------------------------------------------------------------

export function CapsuleForm() {
  const [plaintext, setPlaintext] = useState("");
  const [preset, setPreset] = useState<RecipePreset>(PRESETS[0]);
  const [password, setPassword] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [copied, setCopied] = useState(false);

  const isEmpty = plaintext.trim().length === 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (isEmpty) return;

    if (preset.requiresPassword && password.trim().length === 0) {
      setPhase({ kind: "error", message: "A password is required for Nuclear capsules." });
      return;
    }

    setPhase({ kind: "loading" });

    try {
      const passwordArg = preset.requiresPassword ? password : undefined;
      const { serverPayload, fragment } = await encryptForShare(plaintext, passwordArg);

      const response = await createCapsule(
        {
          encryptedPayload: serverPayload,
          recipe: preset.recipe,
          ttlSeconds: preset.ttlSeconds,
          maxViews: preset.maxViews,
          requiresPassword: preset.requiresPassword,
          burnAfterRead: preset.burnAfterRead,
        },
        { baseUrl: API_BASE_URL },
      );

      const shareUrl = createShareLink(
        window.location.origin || "http://localhost:5173",
        response.metadata.id,
        fragment,
      );

      setPhase({
        kind: "success",
        shareUrl,
        expiresAt: response.metadata.expiresAt,
        maxViews: response.metadata.maxViews,
        burnAfterRead: response.metadata.burnAfterRead,
        recipe: response.metadata.recipe,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setPhase({ kind: "error", message });
    }
  }

  async function handleCopy() {
    if (phase.kind !== "success") return;
    try {
      await navigator.clipboard.writeText(phase.shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* clipboard API not available */
    }
  }

  function handleReset() {
    setPlaintext("");
    setPassword("");
    setPreset(PRESETS[0]);
    setPhase({ kind: "idle" });
    setCopied(false);
  }

  // ── Success screen ────────────────────────────────────────────────────────

  if (phase.kind === "success") {
    const expiry = new Date(phase.expiresAt).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });

    const expiryLabel = phase.recipe === "NUCLEAR"
      ? "Expires in 15 minutes"
      : phase.recipe === "SECURE"
      ? "Expires in 24 hours"
      : "Expires in 7 days";

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Capsule created</h2>
            <p className="text-sm text-gray-500">Your encrypted link is ready to share</p>
          </div>
        </div>

        {/* Share URL */}
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-gray-500">
            Share link
          </label>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-3 py-2 text-sm text-gray-800 ring-1 ring-gray-200">
              {phase.shareUrl}
            </code>
            <button
              type="button"
              onClick={handleCopy}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-gray-700 active:scale-95"
            >
              {copied ? (
                <>
                  <svg className="h-4 w-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Copied
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy
                </>
              )}
            </button>
          </div>
        </div>

        {/* Metadata pills */}
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-gray-600">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {expiryLabel} · {expiry}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-gray-600">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            {phase.maxViews} {phase.maxViews === 1 ? "view" : "views"}
          </span>
          {phase.burnAfterRead && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-3 py-1 text-rose-700">
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
              </svg>
              Burns on read
            </span>
          )}
        </div>

        <div className="border-t border-gray-100 pt-4">
          <p className="mb-3 text-xs text-gray-400">
            🔐 Zero-knowledge: the server never sees your plaintext or decryption key.
            The fragment in the URL is client-side only.
          </p>
          <button
            type="button"
            onClick={handleReset}
            className="text-sm font-medium text-gray-500 underline-offset-2 hover:text-gray-800 hover:underline"
          >
            Create another capsule
          </button>
        </div>
      </div>
    );
  }

  // ── Create form ───────────────────────────────────────────────────────────

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Plaintext input */}
      <div>
        <label htmlFor="plaintext" className="mb-2 block text-sm font-medium text-gray-700">
          Secret message
        </label>
        <textarea
          id="plaintext"
          rows={5}
          value={plaintext}
          onChange={(e) => setPlaintext(e.target.value)}
          placeholder="Type or paste your secret here…"
          className="w-full resize-none rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-200"
          disabled={phase.kind === "loading"}
        />
        {isEmpty && phase.kind === "idle" && (
          <p className="mt-1 text-xs text-gray-400">Start typing to create an encrypted capsule.</p>
        )}
      </div>

      {/* Recipe selector */}
      <div>
        <p className="mb-2 text-sm font-medium text-gray-700">Security level</p>
        <div className="grid grid-cols-3 gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.recipe}
              type="button"
              onClick={() => {
                setPreset(p);
                if (!p.requiresPassword) setPassword("");
              }}
              className={[
                "flex flex-col items-center rounded-xl border-2 px-2 py-3 text-center transition",
                preset.recipe === p.recipe
                  ? `border-current ${p.color} ring-2 ${p.ring} ring-offset-1`
                  : "border-gray-200 bg-white text-gray-600 hover:border-gray-300",
              ].join(" ")}
              disabled={phase.kind === "loading"}
            >
              <span className="mb-1 text-xl">{p.badge}</span>
              <span className="text-xs font-semibold">{p.label}</span>
              <span className={["mt-0.5 text-[10px] leading-tight", preset.recipe === p.recipe ? "text-white/80" : "text-gray-400"].join(" ")}>
                {p.description}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Password field — only for NUCLEAR */}
      {preset.requiresPassword && (
        <div>
          <label htmlFor="capsule-password" className="mb-2 block text-sm font-medium text-gray-700">
            Password <span className="text-rose-500">*</span>
          </label>
          <input
            id="capsule-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Set a strong password for this capsule"
            autoComplete="new-password"
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-200"
            disabled={phase.kind === "loading"}
          />
          <p className="mt-1 text-xs text-gray-400">
            The password never leaves your device — it's used locally to wrap the decryption key.
          </p>
        </div>
      )}

      {/* Error banner */}
      {phase.kind === "error" && (
        <div className="flex items-start gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {phase.message}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={isEmpty || phase.kind === "loading"}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 px-6 py-3 text-sm font-semibold text-white shadow transition hover:bg-gray-700 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {phase.kind === "loading" ? (
          <>
            <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Encrypting &amp; uploading…
          </>
        ) : (
          <>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Create encrypted link
          </>
        )}
      </button>
    </form>
  );
}
