import { GlassComposer } from "./GlassComposer.js";
import { BotanicalFlowerBee } from "./BotanicalFlowerBee.js";
import {
  LockIcon,
  ShieldCheckIcon,
  ClockIcon,
  ZapIcon,
  ArrowRightIcon,
  ArrowDownIcon,
  EditDocIcon,
  KeyIcon,
  SunburstIcon,
} from "./Icons.js";
import type { HistoryEntry } from "../hooks/useHistory.js";

type PageId = "home" | "create" | "history" | "chat" | "about";

type Props = {
  onNavigate: (page: PageId) => void;
  onAddToHistory?: (entry: HistoryEntry) => void;
};

export function HomePage({ onNavigate, onAddToHistory }: Props) {
  const steps = [
    {
      icon: <EditDocIcon className="w-5 h-5 text-ember" />,
      title: "You write",
      body: "Your secret never leaves your device in plain text.",
    },
    {
      icon: <ShieldCheckIcon className="w-5 h-5 text-ember" />,
      title: "We encrypt",
      body: "It's encrypted locally using AES-256-GCM. We never see it.",
    },
    {
      icon: <KeyIcon className="w-5 h-5 text-ember" />,
      title: "You share",
      body: "The key is embedded in the link fragment — invisible to us.",
    },
    {
      icon: <LockIcon className="w-5 h-5 text-ember" />,
      title: "They unlock",
      body: "Recipient decrypts it in their browser. We never know.",
    },
  ];

  const valueFeatures = [
    {
      icon: <LockIcon className="w-5 h-5 text-ember" />,
      title: "End-to-end encrypted",
      body: "Your message is encrypted on your device using AES-256-GCM.",
    },
    {
      icon: <ShieldCheckIcon className="w-5 h-5 text-ember" />,
      title: "Zero knowledge",
      body: "We never see your content or keys. Ever.",
    },
    {
      icon: <ClockIcon className="w-5 h-5 text-ember" />,
      title: "Auto-delete",
      body: "Secrets disappear after they're read or expire.",
    },
    {
      icon: <ZapIcon className="w-5 h-5 text-ember" />,
      title: "Simple & fast",
      body: "No sign-ups. No clutter. Just secure sharing.",
    },
  ];

  return (
    <div className="relative overflow-hidden">
      {/* ── Atmospheric Bokeh Lighting behind Hero ── */}
      <div className="bokeh-orb-1 top-[-60px] right-[10%] opacity-80" />
      <div className="bokeh-orb-2 top-[260px] left-[5%] opacity-60" />

      {/* ── HERO SECTION (Matching Screenshot 1 & 3) ── */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 pt-10 pb-16 sm:pt-14 sm:pb-20 lg:pt-16">
        <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_1.15fr] lg:gap-14">
          {/* LEFT: Editorial Heading & Typography */}
          <div className="relative z-10 flex flex-col items-start">
            <h1
              className="font-serif text-[3.2rem] sm:text-[4.2rem] lg:text-[4.8rem] leading-[1.04] tracking-[-0.035em]"
              style={{
                fontFamily: "var(--font-serif)",
                color: "var(--color-veil-ink)",
              }}
            >
              Private by design.
              <br />
              Calm by{" "}
              <span
                style={{
                  fontStyle: "italic",
                  color: "var(--color-veil-ember)",
                }}
              >
                nature.
              </span>
            </h1>

            <p
              className="mt-6 max-w-[430px] text-base sm:text-lg leading-relaxed text-muted"
              style={{ color: "var(--color-veil-muted)" }}
            >
              End-to-end encrypted sharing with zero knowledge. Your key. Your control.
            </p>

            {/* CTAs */}
            <div className="mt-8 flex flex-wrap items-center gap-3.5">
              <button
                type="button"
                onClick={() => onNavigate("create")}
                className="btn-primary text-sm sm:text-base px-6 py-3.5 rounded-xl cursor-pointer shadow-md"
              >
                <span>Create a secret</span>
                <ArrowRightIcon className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => onNavigate("about")}
                className="btn-ghost text-sm sm:text-base px-5 py-3.5 rounded-xl cursor-pointer"
              >
                <span>Learn more</span>
                <ArrowRightIcon className="w-4 h-4 opacity-70" />
              </button>
            </div>

            {/* Zero-knowledge Statement */}
            <div
              className="mt-10 flex items-center gap-3 text-xs sm:text-sm"
              style={{ color: "var(--color-veil-muted)" }}
            >
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border"
                style={{
                  backgroundColor: "var(--color-veil-ember-dim)",
                  borderColor: "rgba(201, 93, 38, 0.25)",
                  color: "var(--color-veil-ember)",
                }}
              >
                <LockIcon className="w-4 h-4" />
              </div>
              <div>
                <strong className="block text-xs font-semibold text-ink" style={{ color: "var(--color-veil-ink)" }}>
                  Zero knowledge encryption
                </strong>
                <span>Your data never touches our servers.</span>
              </div>
            </div>

            {/* Scroll Indicator */}
            <div
              className="mt-12 hidden lg:flex items-center gap-2 text-xs font-medium cursor-pointer transition-opacity hover:opacity-80"
              style={{ color: "var(--color-veil-muted)" }}
              onClick={() => {
                const el = document.getElementById("values-strip");
                el?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              <span>Scroll to explore</span>
              <ArrowDownIcon className="w-3.5 h-3.5 animate-bounce" />
            </div>
          </div>

          {/* RIGHT: Floating Glass Composer with Botanical Flower & Hovering Bee */}
          <div className="relative z-10 flex items-center justify-center">
            <GlassComposer
              onNavigateCreate={() => onNavigate("create")}
              onNavigateChat={(convId) => {
                if (convId) {
                  try {
                    sessionStorage.setItem("veil_target_chat_conv", convId);
                  } catch {
                    // ignore
                  }
                }
                onNavigate("chat");
              }}
              onAddToHistory={onAddToHistory}
            />

            {/* Signature Botanical Accent - Flower & Bee (Positioned to frame right side without blocking controls) */}
            <div
              className="hidden lg:block absolute -right-20 xl:-right-28 bottom-0 w-[170px] xl:w-[195px] select-none z-0 opacity-90 dark:opacity-80"
              style={{
                filter: "drop-shadow(0 14px 28px rgba(120, 60, 20, 0.12))",
              }}
            >
              <BotanicalFlowerBee onInteract={() => {}} />
            </div>
          </div>
        </div>
      </section>

      {/* ── 4-COLUMN VALUE STRIP (Matching Screenshot 3 Bottom) ── */}
      <section
        id="values-strip"
        className="relative z-10 border-y py-12 px-6"
        style={{
          borderColor: "var(--color-veil-border)",
          backgroundColor: "rgba(255, 255, 255, 0.2)",
        }}
      >
        <div className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {valueFeatures.map(({ icon, title, body }) => (
            <div key={title} className="flex flex-col gap-2.5">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center border"
                style={{
                  backgroundColor: "var(--color-veil-ember-dim)",
                  borderColor: "rgba(201, 93, 38, 0.2)",
                  color: "var(--color-veil-ember)",
                }}
              >
                {icon}
              </div>
              <h3
                className="font-serif text-base font-semibold"
                style={{ fontFamily: "var(--font-serif)", color: "var(--color-veil-ink)" }}
              >
                {title}
              </h3>
              <p className="text-xs sm:text-sm leading-relaxed" style={{ color: "var(--color-veil-muted)" }}>
                {body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS SECTION (Matching Screenshot 1 & 2) ── */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 py-20">
        <div className="text-center max-w-xl mx-auto mb-14">
          <h2
            className="font-serif text-3xl sm:text-4xl font-medium tracking-tight mb-3"
            style={{ fontFamily: "var(--font-serif)", color: "var(--color-veil-ink)" }}
          >
            How Veil protects your privacy
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: "var(--color-veil-muted)" }}>
            Mathematical security without trust required. We cannot read your secrets.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-14">
          {steps.map(({ icon, title, body }, idx) => (
            <div
              key={title}
              className="frosted-glass-card rounded-2xl p-6 flex flex-col justify-between transition-all duration-300 hover:-translate-y-1"
            >
              <div>
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-xl mb-4 border"
                  style={{
                    backgroundColor: "var(--color-veil-ember-dim)",
                    borderColor: "rgba(201, 93, 38, 0.2)",
                    color: "var(--color-veil-ember)",
                  }}
                >
                  {icon}
                </div>
                <h3
                  className="font-serif text-lg font-semibold mb-2"
                  style={{ fontFamily: "var(--font-serif)", color: "var(--color-veil-ink)" }}
                >
                  {title}
                </h3>
                <p className="text-xs sm:text-sm leading-relaxed" style={{ color: "var(--color-veil-muted)" }}>
                  {body}
                </p>
              </div>
              <div
                className="mt-6 pt-3 border-t text-[11px] font-mono"
                style={{
                  borderColor: "rgba(106, 86, 67, 0.12)",
                  color: "var(--color-veil-muted)",
                }}
              >
                0{idx + 1}
              </div>
            </div>
          ))}
        </div>

        {/* Zero knowledge by design banner */}
        <div
          className="frosted-glass-card rounded-[2.2rem] p-8 sm:p-10 flex flex-col lg:flex-row items-center justify-between gap-8 relative overflow-hidden"
        >
          <div className="max-w-lg">
            <h3
              className="font-serif text-2xl sm:text-3xl font-medium tracking-tight mb-3"
              style={{ fontFamily: "var(--font-serif)", color: "var(--color-veil-ink)" }}
            >
              Zero knowledge by design
            </h3>
            <p className="text-xs sm:text-sm leading-relaxed mb-6" style={{ color: "var(--color-veil-muted)" }}>
              We cannot read, store, or recover your secrets. That's the promise of Veil.
            </p>
            <button
              type="button"
              onClick={() => onNavigate("create")}
              className="btn-primary text-xs sm:text-sm px-6 py-3 rounded-xl cursor-pointer"
            >
              Create an encrypted secret →
            </button>
          </div>

          <div
            className="w-48 max-w-full pointer-events-none select-none"
            style={{ filter: "drop-shadow(0 14px 28px rgba(120, 60, 20, 0.12))" }}
          >
            <BotanicalFlowerBee />
          </div>
        </div>
      </section>
    </div>
  );
}
