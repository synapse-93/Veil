import { useState } from "react";
import type { HistoryEntry } from "../hooks/useHistory.js";
import { BotanicalFlowerBee } from "./BotanicalFlowerBee.js";
import { revokeCapsule } from "../services/api.js";
import {
  ShieldCheckIcon,
  LockIcon,
  ArrowRightIcon,
} from "./Icons.js";
import { Ban, CheckCircle2, AlertCircle } from "lucide-react";

function recipeLabel(recipe: string): string {
  if (recipe === "NORMAL" || recipe === "QUICK") return "Normal";
  if (recipe === "SECURE") return "Secure";
  if (recipe === "NUCLEAR") return "Nuclear";
  return recipe;
}

function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() < Date.now();
}

function timeUntil(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "Expired";
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

type Props = {
  entries: HistoryEntry[];
  onClear: () => void;
  onRevoke?: (id: string) => void;
  onNavigateCreate: () => void;
};

export function HistoryPage({ entries, onClear, onRevoke, onNavigateCreate }: Props) {
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokingLoading, setRevokingLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  function handleClear() {
    if (!confirmingClear) {
      setConfirmingClear(true);
      return;
    }
    onClear();
    setConfirmingClear(false);
  }

  async function handleConfirmRevoke(entry: HistoryEntry) {
    setRevokingLoading(true);
    try {
      await revokeCapsule(entry.id, entry.revokeToken);
      if (onRevoke) {
        onRevoke(entry.id);
      }
      setToastMessage(`Secret #${entry.id.substring(0, 8)} revoked successfully`);
      setTimeout(() => setToastMessage(null), 3000);
    } catch (err: any) {
      alert(err.message || "Failed to revoke secret");
    } finally {
      setRevokingLoading(false);
      setRevokingId(null);
    }
  }

  return (
    <div className="relative max-w-4xl mx-auto px-6 py-10">
      {/* Bokeh Background Orbs */}
      <div className="bokeh-orb-1 top-6 left-10 opacity-70" />
      <div className="bokeh-orb-2 bottom-10 right-10 opacity-60" />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-950/90 border border-emerald-500/30 text-emerald-300 text-xs shadow-xl animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Revoke Confirmation Modal */}
      {revokingId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in"
          onClick={() => !revokingLoading && setRevokingId(null)}
        >
          <div
            className="w-full max-w-sm bg-[#14161d] border border-white/10 rounded-2xl p-5 shadow-2xl text-slate-100 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-white">Revoke Secret Link?</h3>
                <p className="text-xs text-slate-400">Secret #{revokingId.substring(0, 8)}</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 mb-5 leading-relaxed">
              Anyone with this share link will immediately be permanently prevented from viewing or decrypting this secret.
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={revokingLoading}
                onClick={() => setRevokingId(null)}
                className="flex-1 py-2 px-3 rounded-xl border border-white/10 text-xs font-medium text-slate-300 hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              {(() => {
                const targetEntry = entries.find((e) => e.id === revokingId);
                return (
                  <button
                    type="button"
                    disabled={revokingLoading || !targetEntry}
                    onClick={() => targetEntry && handleConfirmRevoke(targetEntry)}
                    className="flex-1 py-2 px-3 rounded-xl bg-red-500 hover:bg-red-600 text-white text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    {revokingLoading ? "Revoking..." : "Revoke Now"}
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1
            className="font-serif text-3xl sm:text-4xl font-medium tracking-tight mb-1"
            style={{ fontFamily: "var(--font-serif)", color: "var(--color-veil-ink)" }}
          >
            Your secrets
          </h1>
          <p className="text-xs sm:text-sm text-muted" style={{ color: "var(--color-veil-muted)" }}>
            Metadata only • never stored
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border text-xs font-medium text-muted"
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.35)",
              borderColor: "var(--color-veil-border)",
            }}
          >
            <ShieldCheckIcon className="w-3.5 h-3.5 text-ember" />
            <span>Only visible to you on this device</span>
          </div>

          {entries.length > 0 && (
            <button
              id="history-clear-all-btn"
              type="button"
              onClick={handleClear}
              className="text-xs font-medium text-muted hover:text-red-500 underline underline-offset-4 transition-colors cursor-pointer"
            >
              {confirmingClear ? "Confirm clear" : "Clear all"}
            </button>
          )}
        </div>
      </div>

      {/* Empty state */}
      {entries.length === 0 ? (
        <div
          className="relative z-10 frosted-glass-card rounded-[2rem] flex flex-col items-center gap-4 py-16 px-6 text-center anim-fade-in mb-8"
        >
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center border"
            style={{
              backgroundColor: "var(--color-veil-ember-dim)",
              borderColor: "rgba(201, 93, 38, 0.2)",
              color: "var(--color-veil-ember)",
            }}
          >
            <LockIcon className="w-6 h-6" />
          </div>
          <h3
            className="font-serif text-2xl font-medium"
            style={{ fontFamily: "var(--font-serif)", color: "var(--color-veil-ink)" }}
          >
            No secrets sealed yet
          </h3>
          <p className="text-xs sm:text-sm text-muted max-w-sm" style={{ color: "var(--color-veil-muted)" }}>
            Secrets you encrypt will show here with their metadata. Your plain text and decryption keys
            are never stored.
          </p>
          <button
            id="history-create-secret-btn"
            type="button"
            onClick={onNavigateCreate}
            className="btn-primary mt-3 text-xs sm:text-sm px-6 py-3 cursor-pointer rounded-xl flex items-center gap-2"
          >
            <span>Create a secret</span>
            <ArrowRightIcon className="w-4 h-4" />
          </button>
        </div>
      ) : (
        /* Entry list */
        <div className="relative z-10 flex flex-col gap-3 mb-8">
          {entries.map((entry) => {
            const expired = isExpired(entry.expiresAt);
            const revoked = !!entry.revoked;
            const label = recipeLabel(entry.recipe);
            const displayTitle = `Secret #${entry.id.substring(0, 8)}`;

            return (
              <div
                key={entry.id}
                id={`history-entry-${entry.id.substring(0, 8)}`}
                className="frosted-glass-card rounded-2xl p-4 sm:p-5 flex items-center justify-between gap-4 transition-all duration-200 hover:-translate-y-0.5"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  {/* Status indicator circle */}
                  <div
                    className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${
                      revoked
                        ? "border-red-500 bg-red-500/20 text-red-400"
                        : expired
                        ? "border-neutral-400 bg-neutral-400/20 text-neutral-400"
                        : "border-amber-500 bg-amber-500/20 text-ember"
                    }`}
                  >
                    <div
                      className={`w-1.5 h-1.5 rounded-full ${
                        revoked ? "bg-red-400" : expired ? "bg-neutral-400" : "bg-ember"
                      }`}
                    />
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs sm:text-sm font-semibold text-ink">
                        {displayTitle}
                      </span>
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                        style={{
                          backgroundColor: "var(--color-veil-ember-dim)",
                          color: "var(--color-veil-ember)",
                        }}
                      >
                        {label}
                      </span>
                      {revoked && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 font-medium">
                          Revoked
                        </span>
                      )}
                      {entry.requiresPassword && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-200 dark:bg-neutral-800 text-muted font-medium">
                          Password protected
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted mt-0.5" style={{ color: "var(--color-veil-muted)" }}>
                      {entry.maxViews === 1 ? "1 read" : `up to ${entry.maxViews} views`} •{" "}
                      {entry.burnAfterRead ? "Burns on read" : "Auto-expiring"}
                    </div>
                  </div>
                </div>

                {/* Right metadata countdown + Revoke Action */}
                <div className="flex items-center gap-3 shrink-0">
                  <div
                    className={`text-xs px-3 py-1 rounded-full font-medium ${
                      revoked
                        ? "bg-red-950/40 text-red-400 border border-red-500/20"
                        : expired
                        ? "bg-neutral-200/80 dark:bg-neutral-800 text-neutral-500"
                        : "bg-amber-100/80 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 font-mono"
                    }`}
                  >
                    {revoked ? "Revoked" : expired ? "Expired" : timeUntil(entry.expiresAt)}
                  </div>

                  {!revoked && !expired && (
                    <button
                      id={`revoke-btn-${entry.id.substring(0, 8)}`}
                      type="button"
                      onClick={() => setRevokingId(entry.id)}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/20 transition-all flex items-center gap-1 cursor-pointer"
                      title="Revoke link"
                    >
                      <Ban className="w-3 h-3" />
                      <span>Revoke</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Bottom Privacy Notice & Botanical Vignette */}
      <div className="relative z-10 grid grid-cols-1 md:grid-cols-[1fr_auto] items-center gap-6 pt-4">
        <div
          className="rounded-2xl border p-4 sm:p-5 flex items-start gap-3.5 text-xs leading-relaxed frosted-glass-card"
          style={{
            borderColor: "var(--color-veil-border)",
            color: "var(--color-veil-muted)",
          }}
        >
          <div
            className="p-1.5 rounded-xl border shrink-0"
            style={{
              backgroundColor: "var(--color-veil-ember-dim)",
              borderColor: "rgba(201, 93, 38, 0.2)",
              color: "var(--color-veil-ember)",
            }}
          >
            <ShieldCheckIcon className="w-4 h-4" />
          </div>
          <div>
            <strong className="text-ink block mb-0.5" style={{ color: "var(--color-veil-ink)" }}>
              We never store your secrets, passwords, or keys.
            </strong>
            Your history stays private on your device. Revoked secrets are permanently invalidated immediately.
          </div>
        </div>

        {/* Botanical Flower Accent */}
        <div
          className="hidden md:flex items-center justify-center w-[160px] pointer-events-auto select-none shrink-0"
          style={{
            filter: "drop-shadow(0 14px 28px rgba(120, 60, 20, 0.12))",
          }}
        >
          <BotanicalFlowerBee onInteract={() => {}} />
        </div>
      </div>
    </div>
  );
}
