import {
  LockIcon,
  ShieldCheckIcon,
  EyeOffIcon,
  SunburstIcon,
  ArrowRightIcon,
} from "./Icons.js";
import { BotanicalFlowerBee } from "./BotanicalFlowerBee.js";

type Props = {
  onNavigateCreate: () => void;
};

export function AboutPage({ onNavigateCreate }: Props) {
  const principles = [
    {
      icon: <LockIcon className="w-5 h-5 text-ember" />,
      title: "Private by design",
      body: "End-to-end encrypted with zero knowledge. Your content is encrypted on your device and can only be decrypted by the intended recipient.",
    },
    {
      icon: <ShieldCheckIcon className="w-5 h-5 text-ember" />,
      title: "Open & transparent",
      body: "Built with open standards (AES-256-GCM, PBKDF2) and transparent cryptographic primitives. No proprietary lock-in or obscure black boxes.",
    },
    {
      icon: <EyeOffIcon className="w-5 h-5 text-ember" />,
      title: "No tracking",
      body: "We collect nothing. No analytics trackers, no advertising cookies, no persistent user identities. You share secrets; we keep silence.",
    },
    {
      icon: <SunburstIcon className="w-5 h-5 text-ember" />,
      title: "Made with care",
      body: "Thoughtful design for a calmer digital world. We believe security software can be visually serene, deeply human, and effortless to use.",
    },
  ];

  return (
    <div className="relative max-w-5xl mx-auto px-6 py-12">
      {/* Bokeh Background Orbs */}
      <div className="bokeh-orb-1 top-8 right-8 opacity-70" />
      <div className="bokeh-orb-2 bottom-8 left-8 opacity-60" />

      {/* Header */}
      <div className="relative z-10 text-center max-w-2xl mx-auto mb-14">
        <h1
          className="font-serif text-3xl sm:text-5xl font-medium tracking-tight mb-3"
          style={{ fontFamily: "var(--font-serif)", color: "var(--color-veil-ink)" }}
        >
          About Veil
        </h1>
        <p className="text-sm sm:text-base leading-relaxed text-muted" style={{ color: "var(--color-veil-muted)" }}>
          Veil is built for people who value privacy, control, and simplicity.
        </p>
      </div>

      {/* 2-Column: Left stacked cards, Right botanical illustration (Matching Screenshot 1 screen 8) */}
      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-8 items-center mb-16">
        {/* Left Stacked Principle Cards */}
        <div className="flex flex-col gap-4">
          {principles.map((item) => (
            <div
              key={item.title}
              className="frosted-glass-card rounded-2xl p-5 sm:p-6 flex items-start gap-4 transition-all duration-200 hover:-translate-y-0.5"
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center border shrink-0 mt-0.5"
                style={{
                  backgroundColor: "var(--color-veil-ember-dim)",
                  borderColor: "rgba(201, 93, 38, 0.2)",
                  color: "var(--color-veil-ember)",
                }}
              >
                {item.icon}
              </div>
              <div>
                <h3
                  className="font-serif text-base sm:text-lg font-semibold mb-1"
                  style={{ fontFamily: "var(--font-serif)", color: "var(--color-veil-ink)" }}
                >
                  {item.title}
                </h3>
                <p className="text-xs sm:text-sm leading-relaxed text-muted" style={{ color: "var(--color-veil-muted)" }}>
                  {item.body}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Right Botanical Artwork */}
        <div className="flex flex-col items-center justify-center p-6 text-center">
          <div
            className="w-64 max-w-full select-none mb-6 cursor-pointer"
            style={{
              filter: "drop-shadow(0 16px 32px rgba(120, 60, 20, 0.14))",
            }}
          >
            <BotanicalFlowerBee onInteract={() => {}} />
          </div>

          <p
            className="font-serif text-lg italic text-muted max-w-xs"
            style={{ color: "var(--color-veil-muted)" }}
          >
            "Privacy is not something that I'm merely entitled to, it's an absolute prerequisite."
          </p>

          <button
            type="button"
            onClick={onNavigateCreate}
            className="btn-primary mt-6 text-xs sm:text-sm px-6 py-3 cursor-pointer rounded-xl flex items-center gap-2"
          >
            <span>Create a secret</span>
            <ArrowRightIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
