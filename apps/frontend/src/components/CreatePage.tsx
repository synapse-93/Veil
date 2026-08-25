import { useState, useEffect } from "react";
import { encryptForShare } from "../crypto/zero-knowledge.js";
import { createCapsule } from "../services/api.js";
import { API_BASE_URL } from "../config.js";
import type { HistoryEntry } from "../hooks/useHistory.js";
import { BotanicalFlowerBee } from "./BotanicalFlowerBee.js";
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
  ArrowLeftIcon,
  ShareIcon,
  FlameIcon,
  EyeIcon,
  EyeOffIcon,
  InfoIcon,
  WarningIcon,
} from "./Icons.js";
import { MessageSquare, Home } from "lucide-react";

// ---------------------------------------------------------------------------
// Security presets
// ---------------------------------------------------------------------------

type PresetId = "NORMAL" | "SECURE" | "NUCLEAR" | "CUSTOM";

interface PresetConfig {
  id: PresetId;
  name: string;
  desc: string;
  ttlSeconds: number;
  maxViews: number;
  burnAfterRead: boolean;
  requiresPassword: boolean;
}

const PRESETS: PresetConfig[] = [
  {
    id: "NORMAL",
    name: "Normal",
    desc: "7 days • up to 5 views",
    ttlSeconds: 604800,
    maxViews: 5,
    burnAfterRead: false,
    requiresPassword: false,
  },
  {
    id: "SECURE",
    name: "Secure",
    desc: "24 hours • up to 3 views",
    ttlSeconds: 86400,
    maxViews: 3,
    burnAfterRead: false,
    requiresPassword: false,
  },
  {
    id: "NUCLEAR",
    name: "Nuclear",
    desc: "15 min • 1 view • burn • password required",
    ttlSeconds: 900,
    maxViews: 1,
    burnAfterRead: true,
    requiresPassword: true,
  },
  {
    id: "CUSTOM",
    name: "Custom",
    desc: "Set your own rules",
    ttlSeconds: 3600,
    maxViews: 1,
    burnAfterRead: false,
    requiresPassword: false,
  },
];

const TTL_OPTIONS = [
  { label: "15 min", seconds: 900 },
  { label: "1 hour", seconds: 3600 },
  { label: "6 hours", seconds: 21600 },
  { label: "24 hours", seconds: 86400 },
  { label: "3 days", seconds: 259200 },
  { label: "7 days", seconds: 604800 },
];

const VIEWS_OPTIONS = [
  { label: "1 read", count: 1 },
  { label: "3 views", count: 3 },
  { label: "5 views", count: 5 },
  { label: "10 views", count: 10 },
];

type StepNumber = 1 | 2 | 3 | 4;

type Props = {
  onNavigateHome: () => void;
  onNavigateSecrets: () => void;
  onNavigateChat?: (conversationId?: string) => void;
  addToHistory: (entry: HistoryEntry) => void;
};

export function CreatePage({
  onNavigateHome,
  onNavigateSecrets,
  onNavigateChat = () => {},
  addToHistory,
}: Props) {
  const [currentStep, setCurrentStep] = useState<StepNumber>(1);
  const [plaintext, setPlaintext] = useState("");
  const [selectedPreset, setSelectedPreset] = useState<PresetId>("NORMAL");
  const [passwordEnabled, setPasswordEnabled] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [selectedTtl, setSelectedTtl] = useState(604800);
  const [selectedViews, setSelectedViews] = useState(5);

  // Encryption progress in step 2
  const [encryptProgress, setEncryptProgress] = useState(15);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Success data in step 3
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [lastCreatedCapsule, setLastCreatedCapsule] = useState<CapsuleShareData | null>(null);
  const [isShareToChatOpen, setIsShareToChatOpen] = useState(false);

  const charCount = plaintext.length;
  const maxChars = 10000;

  function handleSelectPreset(id: PresetId) {
    setSelectedPreset(id);
    const p = PRESETS.find((item) => item.id === id);
    if (p && id !== "CUSTOM") {
      setSelectedTtl(p.ttlSeconds);
      setSelectedViews(p.maxViews);
      if (id === "NUCLEAR") {
        setPasswordEnabled(true);
      } else {
        setPasswordEnabled(false);
      }
    }
  }

  // Handle Submission & Steps
  async function handleStartEncrypt(e: React.FormEvent) {
    e.preventDefault();
    if (!plaintext.trim()) return;

    const isNuclear = selectedPreset === "NUCLEAR";

    if (isNuclear && !password.trim()) {
      setErrorMsg("Nuclear security preset requires a decryption password. Please enter one.");
      return;
    }

    if (passwordEnabled && !password.trim()) {
      setErrorMsg("Please enter a password or disable the password toggle.");
      return;
    }

    setErrorMsg(null);
    setCurrentStep(2);
    setEncryptProgress(20);

    const progressTimer = setInterval(() => {
      setEncryptProgress((prev) => (prev < 90 ? prev + 25 : prev));
    }, 120);

    try {
      // 1. Client-side encryption with optional password
      const { serverPayload, fragment } = await encryptForShare(
        plaintext,
        (passwordEnabled || isNuclear) ? password.trim() : undefined
      );

      setEncryptProgress(95);

      const activePreset = PRESETS.find((p) => p.id === selectedPreset);
      const apiRecipe: "QUICK" | "SECURE" | "NUCLEAR" =
        selectedPreset === "NUCLEAR" ? "NUCLEAR" : selectedPreset === "SECURE" ? "SECURE" : "QUICK";

      // 2. Post to backend
      const response = await createCapsule(
        {
          encryptedPayload: serverPayload,
          recipe: apiRecipe,
          ttlSeconds: selectedTtl,
          maxViews: isNuclear ? 1 : selectedViews,
          burnAfterRead: isNuclear || (activePreset ? activePreset.burnAfterRead : false),
          requiresPassword: isNuclear || passwordEnabled,
        },
        { baseUrl: API_BASE_URL }
      );

      // 3. Assemble URL with key fragment
      const fullShareUrl = `${window.location.origin}/share/${encodeURIComponent(
        response.metadata.id
      )}#${fragment}`;

      const capsuleInfo: CapsuleShareData = {
        id: response.metadata.id,
        recipe: response.metadata.recipe,
        expiresAt: response.metadata.expiresAt,
        maxViews: response.metadata.maxViews,
        burnAfterRead: response.metadata.burnAfterRead,
        requiresPassword: response.metadata.requiresPassword,
        shareUrl: fullShareUrl,
        shareFragment: fragment,
      };

      setLastCreatedCapsule(capsuleInfo);

      // 4. Save metadata to local browser history
      addToHistory({
        id: response.metadata.id,
        recipe: response.metadata.recipe,
        createdAt: response.metadata.createdAt,
        expiresAt: response.metadata.expiresAt,
        maxViews: response.metadata.maxViews,
        burnAfterRead: response.metadata.burnAfterRead,
        requiresPassword: response.metadata.requiresPassword,
      });

      clearInterval(progressTimer);
      setEncryptProgress(100);

      setTimeout(() => {
        setShareUrl(fullShareUrl);
        setCurrentStep(3);
      }, 400);
    } catch (err) {
      clearInterval(progressTimer);
      console.error("Encryption failure:", err);
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to encrypt secret. Please try again."
      );
      setCurrentStep(1);
    }
  }

  function handleCopy() {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  }

  function handleResetNewSecret() {
    setPlaintext("");
    setPassword("");
    setPasswordEnabled(false);
    setErrorMsg(null);
    setShareUrl(null);
    setCopied(false);
    setShowQr(false);
    setLastCreatedCapsule(null);
    setIsShareToChatOpen(false);
    setCurrentStep(1);
  }

  const ttlLabel = TTL_OPTIONS.find((t) => t.seconds === selectedTtl)?.label || "1 hour";
  const viewsLabel = VIEWS_OPTIONS.find((v) => v.count === selectedViews)?.label || "1 read";

  return (
    <div className="relative min-h-[85vh] max-w-5xl mx-auto px-6 py-8 sm:py-10">
      {/* Background orbs */}
      <div className="bokeh-orb-1 top-8 right-12 opacity-70" />
      <div className="bokeh-orb-2 bottom-12 left-10 opacity-60" />

      {/* ── TOP HEADER: Back button + 4-Step Stepper (Matching Screenshot 1 & 2) ── */}
      <div className="relative z-10 flex items-center justify-between gap-4 mb-10">
        <button
          type="button"
          onClick={onNavigateHome}
          className="flex items-center gap-1.5 text-xs sm:text-sm font-medium text-muted hover:text-ink transition-colors cursor-pointer"
          style={{ color: "var(--color-veil-muted)" }}
        >
          <ArrowLeftIcon className="w-3.5 h-3.5" />
          <span>Back</span>
        </button>

        {/* 4-Step Stepper */}
        <div className="flex items-center gap-2 sm:gap-4 text-xs">
          {/* Step 1 */}
          <div className="flex items-center gap-1.5">
            <span
              className={`step-circle ${
                currentStep === 1
                  ? "step-circle-active"
                  : currentStep > 1
                  ? "bg-amber-700/30 text-amber-500 dark:bg-amber-500/20"
                  : "step-circle-inactive"
              }`}
            >
              1
            </span>
            <span
              className={`hidden sm:inline font-medium ${
                currentStep === 1 ? "text-ink font-semibold" : "text-muted"
              }`}
              style={{ color: currentStep === 1 ? "var(--color-veil-ink)" : "var(--color-veil-muted)" }}
            >
              Create
            </span>
          </div>

          <div className="w-4 sm:w-8 h-[1px] bg-neutral-300 dark:bg-neutral-800" />

          {/* Step 2 */}
          <div className="flex items-center gap-1.5">
            <span
              className={`step-circle ${
                currentStep === 2
                  ? "step-circle-active"
                  : currentStep > 2
                  ? "bg-amber-700/30 text-amber-500 dark:bg-amber-500/20"
                  : "step-circle-inactive"
              }`}
            >
              2
            </span>
            <span
              className={`hidden sm:inline font-medium ${
                currentStep === 2 ? "text-ink font-semibold" : "text-muted"
              }`}
              style={{ color: currentStep === 2 ? "var(--color-veil-ink)" : "var(--color-veil-muted)" }}
            >
              Encrypt
            </span>
          </div>

          <div className="w-4 sm:w-8 h-[1px] bg-neutral-300 dark:bg-neutral-800" />

          {/* Step 3 */}
          <div className="flex items-center gap-1.5">
            <span
              className={`step-circle ${
                currentStep === 3
                  ? "step-circle-active"
                  : currentStep > 3
                  ? "bg-amber-700/30 text-amber-500 dark:bg-amber-500/20"
                  : "step-circle-inactive"
              }`}
            >
              3
            </span>
            <span
              className={`hidden sm:inline font-medium ${
                currentStep === 3 ? "text-ink font-semibold" : "text-muted"
              }`}
              style={{ color: currentStep === 3 ? "var(--color-veil-ink)" : "var(--color-veil-muted)" }}
            >
              Share
            </span>
          </div>

          <div className="w-4 sm:w-8 h-[1px] bg-neutral-300 dark:bg-neutral-800" />

          {/* Step 4 */}
          <div className="flex items-center gap-1.5">
            <span
              className={`step-circle ${
                currentStep === 4 ? "step-circle-active" : "step-circle-inactive"
              }`}
            >
              4
            </span>
            <span
              className={`hidden sm:inline font-medium ${
                currentStep === 4 ? "text-ink font-semibold" : "text-muted"
              }`}
              style={{ color: currentStep === 4 ? "var(--color-veil-ink)" : "var(--color-veil-muted)" }}
            >
              Done
            </span>
          </div>
        </div>

        <div className="w-12 hidden sm:block" />
      </div>

      {/* ── STEP 1: CREATE (INPUT) (Matching Screenshot 1 & 2 screen 2) ── */}
      {currentStep === 1 && (
        <div className="relative z-10 anim-fade-up">
          {/* Section Heading */}
          <div className="mb-8">
            <h1
              className="font-serif text-3xl sm:text-4xl font-medium tracking-tight mb-1"
              style={{ fontFamily: "var(--font-serif)", color: "var(--color-veil-ink)" }}
            >
              Create your secret
            </h1>
            <p className="text-xs sm:text-sm text-muted" style={{ color: "var(--color-veil-muted)" }}>
              It's encrypted in your browser before it's sent.
            </p>
          </div>

          {/* 2-Column Grid */}
          <form onSubmit={handleStartEncrypt}>
            <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6 items-start mb-8">
              {/* LEFT CARD: Your Secret */}
              <div className="frosted-glass-card rounded-[2rem] p-6 flex flex-col gap-4">
                <label
                  htmlFor="create-textarea"
                  className="text-xs font-semibold text-ink uppercase tracking-wider"
                  style={{ color: "var(--color-veil-ink)" }}
                >
                  Your secret
                </label>

                {/* Inset text well */}
                <div className="glass-inset-well relative rounded-2xl p-4 flex flex-col min-h-[220px]">
                  <textarea
                    id="create-textarea"
                    value={plaintext}
                    onChange={(e) => {
                      if (e.target.value.length <= maxChars) {
                        setPlaintext(e.target.value);
                      }
                    }}
                    placeholder="Write something private..."
                    rows={7}
                    autoFocus
                    className="w-full flex-1 resize-none bg-transparent text-sm sm:text-base leading-relaxed text-ink placeholder:text-muted/60 outline-none"
                    style={{ color: "var(--color-veil-ink)" }}
                  />
                  <div
                    className="self-end text-[11px] font-mono select-none mt-2"
                    style={{ color: "var(--color-veil-muted)" }}
                  >
                    {charCount.toLocaleString()} / {maxChars.toLocaleString()}
                  </div>
                </div>

                {/* Bottom Bar: Expires in & Max views */}
                <div className="flex items-center justify-between gap-4 pt-1 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted" style={{ color: "var(--color-veil-muted)" }}>
                      Expires in
                    </span>
                    <div className="relative">
                      <select
                        value={selectedTtl}
                        onChange={(e) => setSelectedTtl(Number(e.target.value))}
                        className="glass-inset-well appearance-none rounded-xl px-3 py-1.5 pr-7 text-xs font-medium text-ink outline-none cursor-pointer"
                        style={{ color: "var(--color-veil-ink)" }}
                      >
                        {TTL_OPTIONS.map((opt) => (
                          <option key={opt.seconds} value={opt.seconds} className="bg-neutral-900 text-neutral-100">
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs opacity-60">
                        ▾
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted" style={{ color: "var(--color-veil-muted)" }}>
                      Max views
                    </span>
                    <div className="relative">
                      <select
                        value={selectedViews}
                        onChange={(e) => setSelectedViews(Number(e.target.value))}
                        disabled={selectedPreset === "NUCLEAR"}
                        className="glass-inset-well appearance-none rounded-xl px-3 py-1.5 pr-7 text-xs font-medium text-ink outline-none cursor-pointer disabled:opacity-50"
                        style={{ color: "var(--color-veil-ink)" }}
                      >
                        {VIEWS_OPTIONS.map((opt) => (
                          <option key={opt.count} value={opt.count} className="bg-neutral-900 text-neutral-100">
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs opacity-60">
                        ▾
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* RIGHT CARD: Security profile */}
              <div className="frosted-glass-card rounded-[2rem] p-6 flex flex-col gap-5">
                <div className="flex items-center justify-between">
                  <span
                    className="text-xs font-semibold text-ink uppercase tracking-wider flex items-center gap-1.5"
                    style={{ color: "var(--color-veil-ink)" }}
                  >
                    <span>Security profile</span>
                    <InfoIcon className="w-3.5 h-3.5 text-muted opacity-70" />
                  </span>
                </div>

                {/* 4 Preset Options Radio Cards */}
                <div className="flex flex-col gap-2.5">
                  {PRESETS.map((preset) => {
                    const isSelected = selectedPreset === preset.id;
                    return (
                      <div
                        key={preset.id}
                        onClick={() => handleSelectPreset(preset.id)}
                        className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                          isSelected
                            ? "border-amber-500/80 bg-amber-500/10 shadow-sm"
                            : "border-transparent bg-white/25 dark:bg-black/20 hover:bg-white/40 dark:hover:bg-black/30"
                        }`}
                        style={{
                          borderColor: isSelected ? "var(--color-veil-ember)" : "var(--color-veil-border)",
                        }}
                      >
                        <div>
                          <div className="text-xs font-semibold text-ink" style={{ color: "var(--color-veil-ink)" }}>
                            {preset.name}
                          </div>
                          <div className="text-[11px] text-muted mt-0.5" style={{ color: "var(--color-veil-muted)" }}>
                            {preset.desc}
                          </div>
                        </div>

                        {/* Radio Dot */}
                        <div
                          className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                            isSelected
                              ? "border-amber-600 bg-amber-600 text-white"
                              : "border-neutral-400 dark:border-neutral-600"
                          }`}
                        >
                          {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Password Protection Toggle Row */}
                <div className="pt-2 border-t" style={{ borderColor: "var(--color-veil-border)" }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold text-ink flex items-center gap-1.5" style={{ color: "var(--color-veil-ink)" }}>
                        <span>Password Protection</span>
                        {selectedPreset === "NUCLEAR" && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-amber-500/20 text-amber-600 dark:text-amber-400 font-semibold uppercase tracking-wider">
                            Required
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted" style={{ color: "var(--color-veil-muted)" }}>
                        {selectedPreset === "NUCLEAR"
                          ? "Mandatory for Nuclear security preset"
                          : passwordEnabled
                          ? "Required to decrypt"
                          : "Not required"}
                      </div>
                    </div>

                    {/* Switch Toggle */}
                    <button
                      type="button"
                      disabled={selectedPreset === "NUCLEAR"}
                      onClick={() => selectedPreset !== "NUCLEAR" && setPasswordEnabled(!passwordEnabled)}
                      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        selectedPreset === "NUCLEAR"
                          ? "bg-amber-600 opacity-90 cursor-not-allowed"
                          : passwordEnabled
                          ? "bg-amber-600 cursor-pointer"
                          : "bg-neutral-300 dark:bg-neutral-700 cursor-pointer"
                      }`}
                      role="switch"
                      aria-checked={selectedPreset === "NUCLEAR" || passwordEnabled}
                      title={selectedPreset === "NUCLEAR" ? "Password is required for Nuclear preset" : undefined}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          (selectedPreset === "NUCLEAR" || passwordEnabled) ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Password Input Reveal */}
                  {(selectedPreset === "NUCLEAR" || passwordEnabled) && (
                    <div className="anim-fade-up mt-3 relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={selectedPreset === "NUCLEAR" ? "Enter mandatory Nuclear password..." : "Set decryption password..."}
                        className={`w-full rounded-xl border px-3 py-2 pr-10 text-xs text-ink outline-none bg-white/40 dark:bg-black/20 transition-colors ${
                          selectedPreset === "NUCLEAR" && !password.trim()
                            ? "border-amber-500 focus:border-amber-600 ring-1 ring-amber-500/30"
                            : "focus:border-amber-500"
                        }`}
                        style={{ borderColor: selectedPreset === "NUCLEAR" && !password.trim() ? "var(--color-veil-ember)" : "var(--color-veil-border)" }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink cursor-pointer"
                      >
                        {showPassword ? <EyeOffIcon className="w-3.5 h-3.5" /> : <EyeIcon className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {errorMsg && (
              <p
                className="anim-fade-up text-xs rounded-xl p-3 mb-6 border max-w-lg mx-auto text-center"
                style={{
                  backgroundColor: "var(--color-veil-danger-dim)",
                  borderColor: "rgba(220, 38, 38, 0.2)",
                  color: "var(--color-veil-danger)",
                }}
              >
                {errorMsg}
              </p>
            )}

            {/* Centered Large CTA: [ 🔒 Encrypt & Generate Link → ] */}
            <div className="flex flex-col items-center justify-center gap-3">
              <button
                type="submit"
                disabled={!plaintext.trim() || (selectedPreset === "NUCLEAR" && !password.trim())}
                className="btn-primary text-xs sm:text-sm px-8 py-3.5 rounded-xl cursor-pointer shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <LockIcon className="w-4 h-4" />
                <span>Encrypt & Generate Link</span>
                <ArrowRightIcon className="w-4 h-4" />
              </button>
            </div>
          </form>

          {/* Botanical Flower Accent - safely positioned outside main form, shrinks/hides on narrow mobile screens */}
          <div className="botanical-create-step1">
            <BotanicalFlowerBee showTrail={false} />
          </div>
        </div>
      )}

      {/* ── STEP 2: ENCRYPTING (Loading state) (Matching Screenshot 1 screen 3) ── */}
      {currentStep === 2 && (
        <div className="relative z-10 anim-fade-up max-w-md mx-auto py-12 text-center flex flex-col items-center">
          {/* Centered Lock circle with glowing ring */}
          <div className="relative mb-6">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center border shadow-xl animate-pulse"
              style={{
                backgroundColor: "var(--color-veil-ember-dim)",
                borderColor: "rgba(201, 93, 38, 0.3)",
                color: "var(--color-veil-ember)",
              }}
            >
              <LockIcon className="w-8 h-8" />
            </div>

            {/* Bee hovering beside lock - gracefully auto-hides on compact mobile screens */}
            <div className="botanical-create-step2-bee">
              <BotanicalFlowerBee showTrail={false} className="scale-75" />
            </div>
          </div>

          <h2
            className="font-serif text-2xl sm:text-3xl font-medium tracking-tight mb-2"
            style={{ fontFamily: "var(--font-serif)", color: "var(--color-veil-ink)" }}
          >
            Encrypting your secret
          </h2>
          <p className="text-xs sm:text-sm text-muted mb-8" style={{ color: "var(--color-veil-muted)" }}>
            This happens on your device. We never see your content.
          </p>

          {/* Progress bar */}
          <div className="w-full max-w-xs flex flex-col gap-2">
            <div className="w-full h-2 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-600 to-amber-500 transition-all duration-200"
                style={{ width: `${encryptProgress}%` }}
              />
            </div>
            <div className="text-[11px] font-mono text-muted text-right">
              {encryptProgress}%
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 3: SHARE (RESULT) (Matching Screenshot 1 & 2 screen 4) ── */}
      {currentStep === 3 && (
        <div className="relative z-10 anim-fade-up max-w-xl mx-auto py-4">
          <div className="text-center mb-8">
            <h1
              className="font-serif text-3xl font-medium tracking-tight mb-2"
              style={{ fontFamily: "var(--font-serif)", color: "var(--color-veil-ink)" }}
            >
              Your secret is ready
            </h1>
            <p className="text-xs sm:text-sm text-muted" style={{ color: "var(--color-veil-muted)" }}>
              Share the link. The key stays in the link.
            </p>
          </div>

          {/* Glass Share Card */}
          <div className="frosted-glass-card rounded-[2rem] p-6 sm:p-8 flex flex-col gap-5 shadow-2xl relative mb-6">
            <div>
              <label
                className="text-xs font-semibold uppercase tracking-wider text-ink block mb-2"
                style={{ color: "var(--color-veil-ink)" }}
              >
                Share this link
              </label>

              {/* URL bar with Copy Button */}
              <div className="glass-inset-well rounded-2xl p-3 flex items-center justify-between gap-3">
                <span className="font-mono text-xs sm:text-sm text-ink truncate select-all">
                  {shareUrl}
                </span>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="btn-primary text-xs px-4 py-2 rounded-xl shrink-0 cursor-pointer"
                >
                  {copied ? <CheckIcon className="w-3.5 h-3.5" /> : <CopyIcon className="w-3.5 h-3.5" />}
                  <span>{copied ? "Copied" : "Copy"}</span>
                </button>
              </div>
            </div>

            {/* Actions: Send to Chat, Native Share, QR Code */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <button
                type="button"
                onClick={() => setIsShareToChatOpen(true)}
                className="btn-primary text-xs sm:text-sm px-4 py-2.5 rounded-xl flex-1 cursor-pointer flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all"
                style={{
                  background: "linear-gradient(135deg, var(--color-veil-ember) 0%, #d97706 100%)",
                }}
              >
                <MessageSquare className="w-4 h-4" />
                <span>Send to Veil Chat</span>
              </button>

              <div className="flex items-center gap-2 flex-1">
                {typeof navigator !== "undefined" && "share" in navigator && (
                  <button
                    type="button"
                    onClick={() => {
                      if (shareUrl) {
                        void navigator.share({
                          title: "Encrypted Secret (Ember)",
                          url: shareUrl,
                        });
                      }
                    }}
                    className="btn-ghost text-xs sm:text-sm px-3.5 py-2.5 rounded-xl flex-1 cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <ShareIcon className="w-4 h-4" />
                    <span>Share</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setShowQr(!showQr)}
                  className="btn-ghost text-xs sm:text-sm px-3.5 py-2.5 rounded-xl flex-1 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <QrCodeIcon className="w-4 h-4" />
                  <span>{showQr ? "Hide QR" : "QR Code"}</span>
                </button>
              </div>
            </div>

            {showQr && (
              <div className="anim-fade-up glass-inset-well rounded-2xl p-4 flex flex-col items-center gap-2">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
                    shareUrl || ""
                  )}`}
                  alt="Secret Share QR Code"
                  className="w-36 h-36 rounded-lg bg-white p-2"
                />
                <span className="text-[11px] text-muted">Scan to open on recipient's device</span>
              </div>
            )}

            {/* Expiry & Views badges */}
            <div className="flex items-center gap-3 pt-1 text-xs text-muted flex-wrap">
              <span className="glass-inset-well px-3 py-1 rounded-full">
                Expires in {ttlLabel}
              </span>
              <span className="glass-inset-well px-3 py-1 rounded-full">
                Max views {viewsLabel}
              </span>
            </div>

            {/* Security Warning Box */}
            <div
              className="rounded-2xl border p-3.5 flex items-start gap-2.5 text-xs"
              style={{
                backgroundColor: "var(--color-veil-ember-dim)",
                borderColor: "rgba(201, 93, 38, 0.2)",
                color: "var(--color-veil-muted)",
              }}
            >
              <WarningIcon className="w-4 h-4 text-ember shrink-0 mt-0.5" />
              <div>
                <strong className="text-ink block mb-0.5">Share the link. Not the password (if any).</strong>
                Veil cannot recover your secret if you lose this link.
              </div>
            </div>

            {/* Prominent Continue to Done Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setCurrentStep(4)}
                className="btn-primary text-xs sm:text-sm py-3 px-6 rounded-xl cursor-pointer w-full flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all"
              >
                <span>Continue to Done</span>
                <ArrowRightIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Botanical Flower Accent - Gracefully scales and auto-hides on compact mobile screens */}
          <div className="botanical-create-step3">
            <BotanicalFlowerBee showTrail={false} />
          </div>
        </div>
      )}

      {/* ── STEP 4: DONE (Matching Screenshot 1 screen 5) ── */}
      {currentStep === 4 && (
        <div className="relative z-10 anim-fade-up max-w-md mx-auto py-10 text-center flex flex-col items-center">
          {/* Centered Glowing Checkmark circle */}
          <div className="relative mb-6">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center border shadow-xl"
              style={{
                backgroundColor: "var(--color-veil-ember-dim)",
                borderColor: "rgba(201, 93, 38, 0.3)",
                color: "var(--color-veil-ember)",
              }}
            >
              <CheckIcon className="w-10 h-10" />
            </div>

            {/* Hovering bee */}
            <div className="absolute -right-8 -top-3 w-14 pointer-events-auto">
              <BotanicalFlowerBee showTrail={false} className="scale-75" />
            </div>
          </div>

          <h2
            className="font-serif text-3xl font-medium tracking-tight mb-2"
            style={{ fontFamily: "var(--font-serif)", color: "var(--color-veil-ink)" }}
          >
            All set!
          </h2>
          <p className="text-xs sm:text-sm text-muted mb-6" style={{ color: "var(--color-veil-muted)" }}>
            Your secret is secure and ready to be shared.
          </p>

          <div className="flex flex-col items-center gap-3 w-full">
            <button
              type="button"
              onClick={handleResetNewSecret}
              className="btn-primary text-xs sm:text-sm px-6 py-3.5 rounded-xl cursor-pointer w-full shadow-lg flex items-center justify-center gap-2"
            >
              <span>Create another secret</span>
              <ArrowRightIcon className="w-4 h-4" />
            </button>

            {lastCreatedCapsule && (
              <button
                type="button"
                onClick={() => setIsShareToChatOpen(true)}
                className="btn-ghost text-xs sm:text-sm px-6 py-3 rounded-xl cursor-pointer w-full border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-ink flex items-center justify-center gap-2"
              >
                <MessageSquare className="w-4 h-4 text-ember" />
                <span>Share secret in Veil Chat</span>
              </button>
            )}

            <div className="flex items-center justify-between w-full pt-2">
              <button
                type="button"
                onClick={onNavigateHome}
                className="text-xs font-medium text-muted hover:text-ink transition-colors cursor-pointer py-2 flex items-center gap-1.5"
                style={{ color: "var(--color-veil-muted)" }}
              >
                <Home className="w-3.5 h-3.5" />
                <span>Home</span>
              </button>

              <button
                type="button"
                onClick={onNavigateSecrets}
                className="text-xs font-medium text-muted hover:text-ink transition-colors cursor-pointer py-2"
                style={{ color: "var(--color-veil-muted)" }}
              >
                View my secrets →
              </button>
            </div>
          </div>
        </div>
      )}

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
