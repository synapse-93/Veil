import { useEffect, useRef, useState } from "react";
import { parseShareLink } from "@secureshare/shared";
import { decryptFromShare, decodeFragment, verifyFragmentPassword } from "../crypto/zero-knowledge.js";
import { consumeCapsule, ApiHttpError } from "../services/api.js";
import { API_BASE_URL } from "../config.js";
import { BotanicalFlowerBee } from "./BotanicalFlowerBee.js";
import {
  LockIcon,
  ShieldCheckIcon,
  CopyIcon,
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
  FlameIcon,
  ArrowRightIcon,
  ClockIcon,
  WarningIcon,
} from "./Icons.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseHref(): { capsuleId: string; fragment: string } | null {
  try {
    const parts = parseShareLink(window.location.href);
    return { capsuleId: parts.capsuleId, fragment: parts.decryptionKey };
  } catch {
    return null;
  }
}

function classifyHttpError(
  err: ApiHttpError
): "not-found" | "expired" | "burned" | "view-limit" | "revoked" | "server-error" {
  if (err.status === 404) return "not-found";
  if (err.status === 429) return "view-limit";
  if (err.status === 410) {
    const body =
      typeof err.responseBody === "object" && err.responseBody !== null
        ? JSON.stringify(err.responseBody)
        : String(err.responseBody ?? "");
    if (body.includes("REVOKED") || body.toLowerCase().includes("revoked")) return "revoked";
    if (body.includes("BURNED") || body.toLowerCase().includes("burned")) return "burned";
    return "expired";
  }
  return "server-error";
}

// ---------------------------------------------------------------------------
// Phase state machine
// ---------------------------------------------------------------------------

type Phase =
  | { kind: "parsing" }
  | { kind: "invalid-link"; reason: string }
  | { kind: "needs-password"; capsuleId: string; fragment: string; error?: string; verifying?: boolean }
  | { kind: "consuming"; capsuleId: string; fragment: string; password?: string }
  | { kind: "decrypting" }
  | { kind: "success"; plaintext: string; burnAfterRead: boolean; recipe: string }
  | { kind: "not-found" }
  | { kind: "expired" }
  | { kind: "burned" }
  | { kind: "revoked" }
  | { kind: "view-limit" }
  | { kind: "server-error"; capsuleId?: string; fragment?: string; password?: string }
  | { kind: "decryption-failed" }
  | { kind: "network-error"; message: string; capsuleId?: string; fragment?: string; password?: string };

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-5 py-16 anim-fade-in text-center">
      <div
        className="w-10 h-10 rounded-full border-2 border-transparent animate-spin"
        style={{ borderTopColor: "var(--color-veil-ember)", borderRightColor: "var(--color-veil-ember-dim)" }}
      />
      <p className="text-sm font-medium text-muted" style={{ color: "var(--color-veil-muted)" }}>
        {label}
      </p>
    </div>
  );
}

const ERROR_SCREENS: Partial<Record<Phase["kind"], { title: string; body: string }>> = {
  "invalid-link": { title: "Invalid link", body: "This share link is malformed or missing the required decryption fragment." },
  "not-found": { title: "Secret not found", body: "This secret does not exist or has already reached its view threshold." },
  "expired": { title: "Expired", body: "This secret has passed its expiration time and has been deleted." },
  "burned": { title: "Burned", body: "This secret was configured to burn on opening and has been completely deleted." },
  "revoked": { title: "Secret revoked", body: "This secret link was revoked by the sender before it could be opened." },
  "view-limit": { title: "View limit reached", body: "This secret has reached its maximum allowed view limit." },
  "decryption-failed": { title: "Decryption failed", body: "The secret could not be decrypted. The key in the link may be incomplete or invalid." },
  "server-error": { title: "Server error", body: "Something went wrong. Please try again in a moment." },
  "network-error": { title: "Connection failed", body: "Could not connect to Veil servers. Check your connection." },
};

// ---------------------------------------------------------------------------
// CapsuleView
// ---------------------------------------------------------------------------

export function CapsuleView() {
  const [phase, setPhase] = useState<Phase>({ kind: "parsing" });
  const [passwordInput, setPasswordInput] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [secretVisible, setSecretVisible] = useState(true);
  const [copied, setCopied] = useState(false);
  const consumedRef = useRef(false);

  // ── Parse URL on mount ──────────────────────────────────────────────────
  useEffect(() => {
    const parts = parseHref();

    if (!parts) {
      setPhase({ kind: "invalid-link", reason: "This share link is invalid or malformed." });
      return;
    }

    let decoded;
    try {
      decoded = decodeFragment(parts.fragment);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Malformed share fragment.";
      setPhase({ kind: "invalid-link", reason: msg });
      return;
    }

    if (decoded.mode === "password") {
      setPhase({ kind: "needs-password", capsuleId: parts.capsuleId, fragment: parts.fragment });
    } else {
      setPhase({ kind: "consuming", capsuleId: parts.capsuleId, fragment: parts.fragment });
    }
  }, []);

  // ── Consume when entering consuming phase ───────────────────────────────
  useEffect(() => {
    if (phase.kind !== "consuming") return;
    if (consumedRef.current) return;
    consumedRef.current = true;

    const { capsuleId, fragment, password } = phase;

    void (async () => {
      try {
        const response = await consumeCapsule(capsuleId, { baseUrl: API_BASE_URL });
        setPhase({ kind: "decrypting" });
        const plaintext = await decryptFromShare(response.encryptedPayload, fragment, password);
        setPhase({
          kind: "success",
          plaintext,
          burnAfterRead: response.metadata.burnAfterRead,
          recipe: response.metadata.recipe,
        });
      } catch (err) {
        if (err instanceof ApiHttpError) {
          const kind = classifyHttpError(err);
          setPhase({
            kind,
            ...(kind === "server-error" ? { capsuleId, fragment, password } : {}),
          });
        } else if (err instanceof Error && err.message === "Decryption failed.") {
          setPhase({ kind: "decryption-failed" });
        } else {
          const message = err instanceof Error ? err.message : "An unexpected error occurred.";
          setPhase({ kind: "network-error", message, capsuleId, fragment, password });
        }
      }
    })();
  }, [phase]);

  // ── Password submit ─────────────────────────────────────────────────────
  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (phase.kind !== "needs-password") return;
    const pwd = passwordInput.trim();
    if (!pwd) return;

    const { capsuleId, fragment } = phase;
    setPhase({ kind: "needs-password", capsuleId, fragment, verifying: true });

    // Pre-validate password client-side
    const valid = await verifyFragmentPassword(fragment, pwd);
    if (!valid) {
      setPhase({
        kind: "needs-password",
        capsuleId,
        fragment,
        error: "Incorrect password. Please try again.",
      });
      return;
    }

    consumedRef.current = false;
    setPhase({ kind: "consuming", capsuleId, fragment, password: pwd });
  }

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => {
      setCopied(false), 2400;
    });
  }

  // Loading states
  if (phase.kind === "parsing" || phase.kind === "consuming") {
    return <Spinner label="Retrieving encrypted secret..." />;
  }
  if (phase.kind === "decrypting") {
    return <Spinner label="Decrypting locally on your device..." />;
  }

  // Password prompt (Matching Screenshot 2 Decrypt page)
  if (phase.kind === "needs-password") {
    const { error, verifying } = phase;
    return (
      <div className="relative anim-fade-up max-w-md mx-auto py-10 px-6">
        <div className="text-center mb-8">
          <div
            className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center border shadow-xl"
            style={{
              backgroundColor: "var(--color-veil-ember-dim)",
              borderColor: "rgba(201, 93, 38, 0.3)",
              color: "var(--color-veil-ember)",
            }}
          >
            <LockIcon className="w-7 h-7" />
          </div>
          <h1
            className="font-serif text-3xl font-medium tracking-tight mb-2"
            style={{ fontFamily: "var(--font-serif)", color: "var(--color-veil-ink)" }}
          >
            You've received a secret
          </h1>
          <p className="text-xs sm:text-sm text-muted" style={{ color: "var(--color-veil-muted)" }}>
            It was encrypted with Veil. Enter the password to unlock.
          </p>
        </div>

        {/* Frosted Glass Card */}
        <div className="frosted-glass-card rounded-[2rem] p-6 sm:p-8 shadow-2xl relative mb-6">
          <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-4">
            <div>
              <label
                htmlFor="view-password"
                className="text-xs font-semibold uppercase tracking-wider text-ink block mb-2"
                style={{ color: "var(--color-veil-ink)" }}
              >
                Enter password
              </label>
              <div className="relative">
                <input
                  id="view-password"
                  name="capsule-password"
                  type={showPwd ? "text" : "password"}
                  autoComplete="new-password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Password..."
                  autoFocus
                  className="w-full rounded-xl border px-3.5 py-3 pr-12 text-sm text-ink outline-none bg-white/40 dark:bg-black/20 focus:border-amber-500"
                  style={{ borderColor: "var(--color-veil-border)" }}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink cursor-pointer"
                >
                  {showPwd ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p
                className="anim-fade-up text-xs rounded-xl p-3 border"
                style={{
                  backgroundColor: "var(--color-veil-danger-dim)",
                  color: "var(--color-veil-danger)",
                  borderColor: "rgba(185, 28, 28, 0.2)",
                }}
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={!passwordInput.trim() || verifying}
              className="btn-primary mt-2 text-xs sm:text-sm py-3.5 rounded-xl cursor-pointer shadow-lg flex items-center justify-center gap-2"
            >
              {verifying ? (
                <span>Verifying...</span>
              ) : (
                <>
                  <LockIcon className="w-4 h-4" />
                  <span>Unlock Secret</span>
                  <ArrowRightIcon className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Botanical Flower Accent */}
        <div
          className="hidden sm:block absolute -right-10 -bottom-10 w-[160px] pointer-events-none select-none z-10"
          style={{ filter: "drop-shadow(0 14px 28px rgba(120, 60, 20, 0.12))" }}
        >
          <BotanicalFlowerBee />
        </div>
      </div>
    );
  }

  // Success (Decrypted state)
  if (phase.kind === "success") {
    return (
      <div className="relative anim-fade-up max-w-xl mx-auto py-10 px-6">
        <div className="text-center mb-8">
          <div
            className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center border shadow-xl"
            style={{
              backgroundColor: "var(--color-veil-success-dim)",
              borderColor: "rgba(94, 127, 85, 0.3)",
              color: "var(--color-veil-success)",
            }}
          >
            <CheckIcon className="w-8 h-8" />
          </div>
          <h1
            className="font-serif text-3xl font-medium tracking-tight mb-2"
            style={{ fontFamily: "var(--font-serif)", color: "var(--color-veil-ink)" }}
          >
            Secret decrypted
          </h1>
          <p className="text-xs sm:text-sm text-muted" style={{ color: "var(--color-veil-muted)" }}>
            {phase.burnAfterRead
              ? "This secret was configured to burn on opening and has been deleted from the server."
              : "Decrypted locally on your device using the link key."}
          </p>
        </div>

        {/* Secret card */}
        <div className="frosted-glass-card rounded-[2rem] p-6 sm:p-8 flex flex-col gap-4 shadow-2xl mb-6 relative">
          <div className="flex items-center justify-between">
            <span
              className="text-xs font-semibold uppercase tracking-wider text-ink"
              style={{ color: "var(--color-veil-ink)" }}
            >
              Decrypted Content
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSecretVisible(!secretVisible)}
                className="btn-ghost text-xs px-2.5 py-1 rounded-lg cursor-pointer"
              >
                {secretVisible ? "Hide" : "Show"}
              </button>
              <button
                type="button"
                onClick={() => handleCopy(phase.plaintext)}
                className="btn-primary text-xs px-3 py-1 rounded-lg cursor-pointer flex items-center gap-1"
              >
                {copied ? <CheckIcon className="w-3 h-3" /> : <CopyIcon className="w-3 h-3" />}
                <span>{copied ? "Copied" : "Copy"}</span>
              </button>
            </div>
          </div>

          {/* Message well */}
          <div className="relative rounded-2xl p-4 sm:p-5 glass-inset-well min-h-[120px]">
            {secretVisible ? (
              <pre
                className="whitespace-pre-wrap break-words font-sans text-sm sm:text-base leading-relaxed text-ink outline-none select-all"
                style={{ color: "var(--color-veil-ink)", fontFamily: "inherit" }}
              >
                {phase.plaintext}
              </pre>
            ) : (
              <div className="flex items-center justify-center h-24 text-xs text-muted">
                Content is hidden. Click "Show" above to reveal.
              </div>
            )}
          </div>

          {phase.burnAfterRead && (
            <div
              className="rounded-xl border p-3 flex items-center gap-2 text-xs"
              style={{
                backgroundColor: "var(--color-veil-danger-dim)",
                borderColor: "rgba(185, 28, 28, 0.2)",
                color: "var(--color-veil-danger)",
              }}
            >
              <FlameIcon className="w-4 h-4 shrink-0" />
              <span>Nuclear secret consumed. This ciphertext has been deleted permanently.</span>
            </div>
          )}
        </div>

        <div className="text-center">
          <a
            href="/create"
            className="text-xs sm:text-sm font-medium text-ember hover:underline underline-offset-4"
            style={{ color: "var(--color-veil-ember)" }}
          >
            Create your own encrypted secret →
          </a>
        </div>

        {/* Botanical Flower Accent */}
        <div
          className="hidden sm:block absolute -right-10 -bottom-10 w-[160px] pointer-events-none select-none z-10"
          style={{ filter: "drop-shadow(0 14px 28px rgba(120, 60, 20, 0.12))" }}
        >
          <BotanicalFlowerBee />
        </div>
      </div>
    );
  }

  // Error screens
  const cfg = ERROR_SCREENS[phase.kind] ?? {
    title: "Something went wrong",
    body: "An unexpected error occurred.",
  };

  const dynamicBody =
    phase.kind === "invalid-link"
      ? phase.reason
      : phase.kind === "network-error"
      ? phase.message
      : cfg.body;

  return (
    <div className="text-center py-14 anim-fade-up max-w-md mx-auto px-6">
      <div
        className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center border shadow-md"
        style={{
          backgroundColor: "var(--color-veil-danger-dim)",
          borderColor: "rgba(185, 28, 28, 0.2)",
          color: "var(--color-veil-danger)",
        }}
      >
        <LockIcon className="w-6 h-6" />
      </div>
      <h2
        className="font-serif text-2xl sm:text-3xl font-medium tracking-tight mb-2"
        style={{ fontFamily: "var(--font-serif)", color: "var(--color-veil-ink)" }}
      >
        {cfg.title}
      </h2>
      <p className="text-xs sm:text-sm leading-relaxed text-muted mb-8" style={{ color: "var(--color-veil-muted)" }}>
        {dynamicBody}
      </p>

      <a
        href="/create"
        className="btn-primary text-xs sm:text-sm px-6 py-3 rounded-xl inline-flex items-center gap-2"
      >
        <span>Create a new secret</span>
        <ArrowRightIcon className="w-4 h-4" />
      </a>
    </div>
  );
}
