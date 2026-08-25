import { useState } from "react";
import { encryptForShare } from "../crypto/zero-knowledge.js";
import { createCapsule } from "../services/api.js";
import { API_BASE_URL } from "../config.js";
import type { HistoryEntry } from "../hooks/useHistory.js";
import {
  ShareToChatModal,
  type CapsuleShareData,
} from "./ShareToChatModal.js";
import {
  LockIcon,
  ShieldCheckIcon,
  ClockIcon,
  CopyIcon,
  CheckIcon,
  QrCodeIcon,
  ArrowRightIcon,
  ShareIcon,
} from "./Icons.js";
import { MessageSquare } from "lucide-react";

type Props = {
  onNavigateCreate: () => void;
  onNavigateChat?: (conversationId?: string) => void;
  onAddToHistory?: (entry: HistoryEntry) => void;
};

const TTL_CHOICES = [
  { label: "15 min", seconds: 900 },
  { label: "1 hour", seconds: 3600 },
  { label: "6 hours", seconds: 21600 },
  { label: "24 hours", seconds: 86400 },
  { label: "3 days", seconds: 259200 },
  { label: "7 days", seconds: 604800 },
];

export function GlassComposer({ onNavigateCreate, onNavigateChat = () => {}, onAddToHistory }: Props) {
  const [secretText, setSecretText] = useState("");
  const [ttlSeconds, setTtlSeconds] = useState(3600);
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [createdShareUrl, setCreatedShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [lastCreatedCapsule, setLastCreatedCapsule] = useState<CapsuleShareData | null>(null);
  const [isShareToChatOpen, setIsShareToChatOpen] = useState(false);

  const charCount = secretText.length;
  const maxChars = 10000;

  async function handleQuickCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!secretText.trim() || isEncrypting) return;

    setIsEncrypting(true);
    setErrorMsg(null);

    try {
      // 1. Client-side AES-256-GCM encryption
      const { serverPayload, fragment } = await encryptForShare(secretText);

      // 2. Post ciphertext to backend
      const response = await createCapsule(
        {
          encryptedPayload: serverPayload,
          recipe: "QUICK",
          ttlSeconds: ttlSeconds,
          maxViews: 5,
          burnAfterRead: false,
          requiresPassword: false,
        },
        { baseUrl: API_BASE_URL }
      );

      // 3. Assemble share URL with key in fragment
      const shareUrl = `${window.location.origin}/share/${encodeURIComponent(
        response.metadata.id
      )}#${fragment}`;
      setCreatedShareUrl(shareUrl);

      const capsuleInfo: CapsuleShareData = {
        id: response.metadata.id,
        recipe: response.metadata.recipe,
        expiresAt: response.metadata.expiresAt,
        maxViews: response.metadata.maxViews,
        burnAfterRead: response.metadata.burnAfterRead,
        requiresPassword: response.metadata.requiresPassword,
        shareUrl: shareUrl,
      };
      setLastCreatedCapsule(capsuleInfo);

      // 4. Save metadata to local history
      if (onAddToHistory) {
        onAddToHistory({
          id: response.metadata.id,
          recipe: response.metadata.recipe,
          createdAt: response.metadata.createdAt,
          expiresAt: response.metadata.expiresAt,
          maxViews: response.metadata.maxViews,
          burnAfterRead: response.metadata.burnAfterRead,
          requiresPassword: response.metadata.requiresPassword,
        });
      }
    } catch (err) {
      console.error("Creation failed:", err);
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to encrypt secret. Please try again."
      );
    } finally {
      setIsEncrypting(false);
    }
  }

  function handleCopy() {
    if (!createdShareUrl) return;
    navigator.clipboard.writeText(createdShareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  }

  function handleReset() {
    setSecretText("");
    setCreatedShareUrl(null);
    setErrorMsg(null);
    setCopied(false);
    setShowQr(false);
    setLastCreatedCapsule(null);
    setIsShareToChatOpen(false);
  }

  return (
    <div className="relative w-full max-w-[490px] mx-auto">
      {/* ── Main Translucent Glass Card ── */}
      <div className="frosted-glass-card rounded-[2rem] p-5 sm:p-6 transition-all duration-300">
        {createdShareUrl ? (
          /* ── SUCCESS CREATED STATE ── */
          <div className="anim-fade-up flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="step-circle step-circle-active">
                  <CheckIcon className="w-3.5 h-3.5" />
                </span>
                <span
                  className="font-serif text-lg font-medium tracking-tight"
                  style={{ color: "var(--color-veil-ink)" }}
                >
                  Your secret is ready
                </span>
              </div>
              <button
                type="button"
                onClick={handleReset}
                className="text-xs font-medium text-muted hover:text-ink underline underline-offset-4 cursor-pointer"
                style={{ color: "var(--color-veil-muted)" }}
              >
                New secret
              </button>
            </div>

            <p className="text-xs leading-relaxed" style={{ color: "var(--color-veil-muted)" }}>
              Share this link. The encryption key is in the link fragment and never sent to our servers.
            </p>

            {/* Link Box */}
            <div className="glass-inset-well rounded-xl p-3 flex items-center justify-between gap-2">
              <span className="font-mono text-xs text-ink truncate select-all">
                {createdShareUrl}
              </span>
              <button
                type="button"
                onClick={handleCopy}
                className="btn-primary text-xs px-3.5 py-1.5 rounded-lg shrink-0 cursor-pointer"
              >
                {copied ? <CheckIcon className="w-3.5 h-3.5" /> : <CopyIcon className="w-3.5 h-3.5" />}
                <span>{copied ? "Copied" : "Copy"}</span>
              </button>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <button
                type="button"
                onClick={() => setIsShareToChatOpen(true)}
                className="btn-primary text-xs px-3.5 py-2 rounded-xl flex-1 cursor-pointer flex items-center justify-center gap-1.5"
                style={{
                  background: "linear-gradient(135deg, var(--color-veil-ember) 0%, #d97706 100%)",
                }}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Send to Chat</span>
              </button>

              <div className="flex items-center gap-2 flex-1">
                <button
                  type="button"
                  onClick={() => setShowQr(!showQr)}
                  className="btn-ghost text-xs px-3 py-2 rounded-xl flex-1 cursor-pointer flex items-center justify-center gap-1"
                >
                  <QrCodeIcon className="w-3.5 h-3.5" />
                  <span>{showQr ? "Hide QR" : "QR Code"}</span>
                </button>

                {typeof navigator !== "undefined" && "share" in navigator && (
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.share({
                        title: "Encrypted Secret (Ember)",
                        url: createdShareUrl,
                      });
                    }}
                    className="btn-ghost text-xs px-3 py-2 rounded-xl flex-1 cursor-pointer flex items-center justify-center gap-1"
                  >
                    <ShareIcon className="w-3.5 h-3.5" />
                    <span>Share</span>
                  </button>
                )}
              </div>
            </div>

            {showQr && (
              <div className="anim-fade-up glass-inset-well rounded-2xl p-4 flex flex-col items-center gap-2">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
                    createdShareUrl
                  )}`}
                  alt="Secret Share QR Code"
                  className="w-36 h-36 rounded-lg bg-white p-2"
                />
                <span className="text-[11px] text-muted">Scan to open on another device</span>
              </div>
            )}
          </div>
        ) : (
          /* ── COMPOSER INPUT STATE ── */
          <form onSubmit={handleQuickCreate} className="flex flex-col gap-4">
            {/* Top Label */}
            <div className="flex items-center justify-between">
              <label
                htmlFor="composer-textarea"
                className="text-xs sm:text-[13px] font-medium tracking-wide text-ink"
                style={{ color: "var(--color-veil-ink)" }}
              >
                Write your secret
              </label>
            </div>

            {/* Inset Textarea Well */}
            <div className="glass-inset-well relative rounded-2xl p-3.5 flex flex-col focus-within:ring-1 focus-within:ring-amber-500/50 transition-all">
              <textarea
                id="composer-textarea"
                value={secretText}
                onChange={(e) => {
                  if (e.target.value.length <= maxChars) {
                    setSecretText(e.target.value);
                  }
                }}
                placeholder="Just between us..."
                rows={5}
                className="w-full resize-none bg-transparent text-sm sm:text-base leading-relaxed text-ink placeholder:text-muted/60 outline-none"
                style={{ color: "var(--color-veil-ink)" }}
              />

              {/* Character counter inside well bottom-right */}
              <div
                className="self-end text-[11px] font-mono select-none mt-1"
                style={{ color: "var(--color-veil-muted)" }}
              >
                {charCount.toLocaleString()} / {maxChars.toLocaleString()}
              </div>
            </div>

            {/* Error notice if any */}
            {errorMsg && (
              <p
                className="anim-fade-up text-xs rounded-xl p-2.5 border"
                style={{
                  backgroundColor: "var(--color-veil-danger-dim)",
                  borderColor: "rgba(220, 38, 38, 0.2)",
                  color: "var(--color-veil-danger)",
                }}
              >
                {errorMsg}
              </p>
            )}

            {/* Bottom Controls Row: "Expires in" dropdown + "Create Link →" button */}
            <div className="flex items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted" style={{ color: "var(--color-veil-muted)" }}>
                  Expires in
                </span>
                <div className="relative">
                  <select
                    value={ttlSeconds}
                    onChange={(e) => setTtlSeconds(Number(e.target.value))}
                    className="glass-inset-well appearance-none rounded-xl px-3 py-1.5 pr-7 text-xs font-medium text-ink outline-none cursor-pointer hover:border-amber-500/50 transition-colors"
                    style={{ color: "var(--color-veil-ink)" }}
                  >
                    {TTL_CHOICES.map((choice) => (
                      <option key={choice.seconds} value={choice.seconds} className="bg-neutral-900 text-neutral-100">
                        {choice.label}
                      </option>
                    ))}
                  </select>
                  <div
                    className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs opacity-60"
                    style={{ color: "var(--color-veil-ink)" }}
                  >
                    ▾
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={!secretText.trim() || isEncrypting}
                className="btn-primary text-xs sm:text-sm px-4 sm:px-5 py-2.5 rounded-xl cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isEncrypting ? (
                  <span>Encrypting...</span>
                ) : (
                  <>
                    <span>Create Link</span>
                    <ArrowRightIcon className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* ── 3 Security Badges directly underneath the card (Matching Screenshot 1 & 3) ── */}
      <div className="mt-3.5 grid grid-cols-3 gap-2">
        <div
          className="frosted-glass-card rounded-xl p-2.5 flex items-center gap-2 text-[11px] font-medium"
          style={{ color: "var(--color-veil-ink)" }}
        >
          <div
            className="w-5 h-5 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: "var(--color-veil-ember-dim)", color: "var(--color-veil-ember)" }}
          >
            <LockIcon className="w-3 h-3" />
          </div>
          <span className="leading-tight text-[10px] sm:text-[11px]">End-to-end encrypted</span>
        </div>

        <div
          className="frosted-glass-card rounded-xl p-2.5 flex items-center gap-2 text-[11px] font-medium"
          style={{ color: "var(--color-veil-ink)" }}
        >
          <div
            className="w-5 h-5 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: "var(--color-veil-ember-dim)", color: "var(--color-veil-ember)" }}
          >
            <ShieldCheckIcon className="w-3 h-3" />
          </div>
          <span className="leading-tight text-[10px] sm:text-[11px]">Zero knowledge by design</span>
        </div>

        <div
          className="frosted-glass-card rounded-xl p-2.5 flex items-center gap-2 text-[11px] font-medium"
          style={{ color: "var(--color-veil-ink)" }}
        >
          <div
            className="w-5 h-5 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: "var(--color-veil-ember-dim)", color: "var(--color-veil-ember)" }}
          >
            <ClockIcon className="w-3 h-3" />
          </div>
          <span className="leading-tight text-[10px] sm:text-[11px]">Auto-delete after expiry</span>
        </div>
      </div>
      {/* Share to Chat Modal */}
      {lastCreatedCapsule && (
        <ShareToChatModal
          isOpen={isShareToChatOpen}
          onClose={() => setIsShareToChatOpen(false)}
          capsuleData={lastCreatedCapsule}
          onNavigateChat={onNavigateChat}
        />
      )}
    </div>
  );
}
