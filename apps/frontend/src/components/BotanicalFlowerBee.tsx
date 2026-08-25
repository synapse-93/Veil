import { useState, useCallback, useId } from "react";

type BotanicalProps = {
  className?: string;
  onInteract?: () => void;
  showTrail?: boolean;
};

export function BotanicalFlowerBee({ className = "", onInteract }: BotanicalProps) {
  const rawId = useId();
  const uid = rawId.replace(/[^a-zA-Z0-9_-]/g, "") || "botanical";
  const [isDashing, setIsDashing] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const handleClick = useCallback(() => {
    if (isDashing) return;
    setIsDashing(true);
    if (onInteract) {
      onInteract();
    }
    setTimeout(() => {
      setIsDashing(false);
    }, 2800);
  }, [isDashing, onInteract]);

  const isInteractive = typeof onInteract === "function";

  const petalGradPrimary = `petalGradPrimary-${uid}`;
  const petalGradSecondary = `petalGradSecondary-${uid}`;
  const petalGradBack = `petalGradBack-${uid}`;
  const stemGrad = `stemGrad-${uid}`;
  const leafGradLeft = `leafGradLeft-${uid}`;
  const leafGradRight = `leafGradRight-${uid}`;
  const pollenDiscRadial = `pollenDiscRadial-${uid}`;
  const beeWingGrad = `beeWingGrad-${uid}`;
  const flowerBloomGlow = `flowerBloomGlow-${uid}`;

  return (
    <div
      className={`relative select-none ${isInteractive ? "cursor-pointer" : "pointer-events-none"} ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={isInteractive ? undefined : { pointerEvents: "none" }}
    >
      <div
        onClick={isInteractive ? handleClick : undefined}
        role={isInteractive ? "button" : "presentation"}
        tabIndex={isInteractive ? 0 : -1}
        onKeyDown={
          isInteractive
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") handleClick();
              }
            : undefined
        }
        aria-label="Botanical cosmos flower and wandering honeybee illustration"
        className="group relative outline-none rounded-2xl bg-transparent border-0 p-0 block"
        style={{ WebkitTapHighlightColor: "transparent" }}
      >
        <svg
          viewBox="0 0 260 330"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-auto overflow-visible transition-transform duration-500"
          aria-hidden="true"
        >
          <defs>
            {/* Rich Amber & Terracotta Petal Gradients */}
            <linearGradient id={petalGradPrimary} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FDBA74" />
              <stop offset="40%" stopColor="#EA580C" />
              <stop offset="100%" stopColor="#9A3412" />
            </linearGradient>

            <linearGradient id={petalGradSecondary} x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#FED7AA" />
              <stop offset="50%" stopColor="#F97316" />
              <stop offset="100%" stopColor="#C2410C" />
            </linearGradient>

            <linearGradient id={petalGradBack} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#D97706" />
              <stop offset="60%" stopColor="#B45309" />
              <stop offset="100%" stopColor="#78350F" />
            </linearGradient>

            {/* Lush Botanical Foliage & Stem Gradients */}
            <linearGradient id={stemGrad} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#9BC092" />
              <stop offset="50%" stopColor="#5E8754" />
              <stop offset="100%" stopColor="#375531" />
            </linearGradient>

            <linearGradient id={leafGradLeft} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#A0C597" />
              <stop offset="60%" stopColor="#638C59" />
              <stop offset="100%" stopColor="#3C5C35" />
            </linearGradient>

            <linearGradient id={leafGradRight} x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#8FB786" />
              <stop offset="60%" stopColor="#567E4D" />
              <stop offset="100%" stopColor="#33502D" />
            </linearGradient>

            {/* Central Golden-Amber Pollen Core */}
            <radialGradient id={pollenDiscRadial} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#FDE047" />
              <stop offset="35%" stopColor="#F59E0B" />
              <stop offset="70%" stopColor="#9A3412" />
              <stop offset="100%" stopColor="#451A03" />
            </radialGradient>

            {/* Translucent Gossamer Bee Wing Gradient */}
            <linearGradient id={beeWingGrad} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.92" />
              <stop offset="45%" stopColor="#E0F2FE" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#BAE6FD" stopOpacity="0.4" />
            </linearGradient>

            {/* Petal Ambient Warm Glow Filter */}
            <filter id={flowerBloomGlow} x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="#EA580C" floodOpacity="0.18" />
            </filter>
          </defs>

          {/* ── UNIFIED BOTANICAL FLOWER & STEM PLANT ── */}
          {/* Entire plant sways naturally as a single living organism anchored at base (130, 325) */}
          <g
            className={`transition-transform duration-700 ease-out origin-bottom ${
              isHovered ? "rotate-1" : "anim-flower-sway"
            }`}
            style={{ transformOrigin: "135px 325px" }}
          >
            {/* 1. Main Botanical Stem - gracefully arches from root base (130, 325) directly to flower receptacle (135, 122) */}
            <path
              d="M 130 325 C 138 270, 142 205, 135 122"
              fill="none"
              stroke={`url(#${stemGrad})`}
              strokeWidth="4.5"
              strokeLinecap="round"
            />

            {/* 2. Lower-Left Leaf */}
            <g transform="translate(136, 260) rotate(-38)">
              <path
                d="M 0 0 C -24 -12 -46 -10 -64 4 C -48 18 -24 14 0 0 Z"
                fill={`url(#${leafGradLeft})`}
              />
              <path
                d="M 0 0 Q -30 2 -58 4"
                stroke="#BEE3B5"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeOpacity="0.65"
              />
            </g>

            {/* 3. Mid-Right Leaf */}
            <g transform="translate(138, 205) rotate(35)">
              <path
                d="M 0 0 C 22 -12 45 -10 62 3 C 45 16 22 12 0 0 Z"
                fill={`url(#${leafGradRight})`}
              />
              <path
                d="M 0 0 Q 30 -2 56 2"
                stroke="#BEE3B5"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeOpacity="0.65"
              />
            </g>

            {/* 4. Upper-Left Sprout & Bud */}
            <path
              d="M 137 175 Q 118 160, 102 142"
              fill="none"
              stroke={`url(#${stemGrad})`}
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <g transform="translate(102, 142) rotate(-30)">
              <path
                d="M 0 0 C -6 -10 -4 -18 0 -22 C 4 -18 6 -10 0 0 Z"
                fill={`url(#${petalGradPrimary})`}
              />
              <path
                d="M 0 0 C -5 -6 -7 -13 -3 -17 C 0 -11 0 -6 0 0 Z"
                fill={`url(#${leafGradLeft})`}
              />
            </g>

            {/* 5. Green Calyx / Sepals (Receptacle directly anchoring the flower head to the stem at 135, 122) */}
            <g transform="translate(135, 122)">
              <path
                d="M -12 2 C -18 10, -10 16, 0 14 C 10 16, 18 10, 12 2 C 7 6, -7 6, -12 2 Z"
                fill={`url(#${stemGrad})`}
              />
              <path
                d="M -8 2 C -14 -4, -6 -10, -2 -5 C 2 -10, 10 -4, 4 2 C 0 3, -4 3, -8 2 Z"
                fill="#375531"
                opacity="0.85"
              />
            </g>

            {/* 6. Radiant Blooming Cosmos Blossom (Seamlessly centered at 135, 120) */}
            <g transform="translate(135, 120)" filter={`url(#${flowerBloomGlow})`}>
              {/* Back Layer Petals (Deep Amber & Terracotta) */}
              <g opacity="0.94">
                {/* Petal: Top-Left (315°) */}
                <path
                  d="M 0 0 C -15 -18 -32 -42 -18 -55 C -5 -46 -2 -24 0 0 Z"
                  fill={`url(#${petalGradBack})`}
                />
                {/* Petal: Top-Right (45°) */}
                <path
                  d="M 0 0 C 15 -18 32 -42 18 -55 C 5 -46 2 -24 0 0 Z"
                  fill={`url(#${petalGradBack})`}
                />
                {/* Petal: Bottom-Left (225°) */}
                <path
                  d="M 0 0 C -24 10 -48 22 -54 10 C -42 -2 -22 0 0 0 Z"
                  fill={`url(#${petalGradBack})`}
                />
                {/* Petal: Bottom-Right (135°) */}
                <path
                  d="M 0 0 C 24 14 46 28 54 16 C 42 4 22 0 0 0 Z"
                  fill={`url(#${petalGradBack})`}
                />
              </g>

              {/* Front Layer Petals (Vibrant Apricot, Orange & Golden Peach) */}
              <g>
                {/* Petal: Straight Top (0°) */}
                <path
                  d="M 0 0 C -10 -25 -8 -52 0 -62 C 8 -52 10 -25 0 0 Z"
                  fill={`url(#${petalGradPrimary})`}
                />
                {/* Petal: Left (270°) */}
                <path
                  d="M 0 0 C -26 -16 -52 -22 -58 -12 C -48 -2 -24 6 0 0 Z"
                  fill={`url(#${petalGradSecondary})`}
                />
                {/* Petal: Lower-Left (210°) */}
                <path
                  d="M 0 0 C -28 8 -48 30 -42 40 C -30 34 -16 16 0 0 Z"
                  fill={`url(#${petalGradPrimary})`}
                />
                {/* Petal: Straight Bottom (180°) */}
                <path
                  d="M 0 0 C -8 24 -6 48 2 56 C 10 46 8 22 0 0 Z"
                  fill={`url(#${petalGradSecondary})`}
                />
                {/* Petal: Lower-Right (150°) */}
                <path
                  d="M 0 0 C 18 20 40 32 50 22 C 40 12 22 6 0 0 Z"
                  fill={`url(#${petalGradPrimary})`}
                />
                {/* Petal: Upper-Right (70°) */}
                <path
                  d="M 0 0 C 26 -10 52 -14 58 -2 C 48 8 24 8 0 0 Z"
                  fill={`url(#${petalGradSecondary})`}
                />
              </g>

              {/* Central Pollen Disc & Florets */}
              <circle cx="0" cy="0" r="17" fill={`url(#${pollenDiscRadial})`} />
              <circle
                cx="0"
                cy="0"
                r="14"
                fill="none"
                stroke="#FDE047"
                strokeWidth="1"
                strokeOpacity="0.4"
              />
              <circle cx="0" cy="0" r="9.5" fill="#451A03" opacity="0.85" />

              {/* Textured Pollen Granules */}
              <circle cx="-5" cy="-5" r="1.3" fill="#FEF08A" />
              <circle cx="5" cy="-4" r="1.4" fill="#FEF08A" />
              <circle cx="-4" cy="5" r="1.3" fill="#FEF08A" />
              <circle cx="5" cy="5" r="1.4" fill="#FEF08A" />
              <circle cx="0" cy="0" r="1.8" fill="#FFFFFF" opacity="0.95" />
              <circle cx="-2" cy="-2" r="1.1" fill="#FEF08A" />
              <circle cx="2.5" cy="1.5" r="1.1" fill="#FEF08A" />
            </g>
          </g>

          {/* ── THE WANDERING HONEYBEE ── */}
          {/* Smooth, organic multi-point flight path orbiting the blossom */}
          <g
            className={isDashing ? "anim-bee-dash" : "anim-bee-flight"}
            style={{ transformOrigin: "0px 0px" }}
          >
            {/* Secondary subtle micro-bobbing for living breath */}
            <g className="anim-bee-hover">
              <g transform="scale(1.15)">
                {/* Gossamer Wings with High-Frequency Flutter */}
                <g>
                  {/* Left Forewing */}
                  <g className="anim-wing-left">
                    <ellipse
                      cx="-7"
                      cy="-14"
                      rx="7.5"
                      ry="15"
                      transform="rotate(-20 -7 -14)"
                      fill={`url(#${beeWingGrad})`}
                      stroke="#FFFFFF"
                      strokeWidth="0.6"
                    />
                  </g>
                  {/* Right Forewing */}
                  <g className="anim-wing-right">
                    <ellipse
                      cx="5"
                      cy="-15"
                      rx="6.5"
                      ry="14"
                      transform="rotate(18 5 -15)"
                      fill={`url(#${beeWingGrad})`}
                      stroke="#FFFFFF"
                      strokeWidth="0.6"
                    />
                  </g>
                </g>

                {/* Bee Head */}
                <circle cx="-1" cy="7.5" r="3.6" fill="#1C140E" />
                {/* Delicate Antennae */}
                <path
                  d="M -2.5 9 Q -5 13 -7 14 M 0 9 Q 2.5 13 4.5 14"
                  stroke="#1C140E"
                  strokeWidth="0.85"
                  strokeLinecap="round"
                />

                {/* Velvety Thorax */}
                <ellipse cx="-0.5" cy="2" rx="5.2" ry="4.4" fill="#45260A" />
                <ellipse cx="-0.5" cy="2" rx="4" ry="3.2" fill="#8C531B" />
                <circle cx="-0.5" cy="1.8" r="2.2" fill="#D97706" opacity="0.5" />

                {/* Striped Abdomen */}
                <g transform="translate(0, -6.5)">
                  <ellipse cx="-0.5" cy="0" rx="4.8" ry="6.6" fill="#1A120B" />
                  {/* Golden Band 1 */}
                  <path
                    d="M -4.4 -2 Q -0.5 -0.3 3.5 -2 Q 4.2 0.3 3.2 1.8 Q -0.5 3.2 -4.2 1.8 Z"
                    fill="#FBBF24"
                  />
                  {/* Golden Band 2 */}
                  <path
                    d="M -3.6 -4.6 Q -0.5 -3.2 2.6 -4.6 Q 3.2 -3 2.4 -2 Q -0.5 -0.8 -3.2 -2 Z"
                    fill="#F59E0B"
                  />
                  {/* Stinger Tip */}
                  <polygon points="-0.5,-7.2 -1.4,-6.2 0.4,-6.2" fill="#1A120B" />
                </g>

                {/* Delicate Legs */}
                <path
                  d="M -4.5 3 Q -8 5 -9 9 M 3.5 3 Q 7 5 8 9"
                  stroke="#26170D"
                  strokeWidth="0.85"
                  strokeLinecap="round"
                />
                {/* Pollen Basket on Hind Leg */}
                <ellipse cx="-7.5" cy="6.5" rx="1.4" ry="2" fill="#FBBF24" opacity="0.85" />
              </g>
            </g>
          </g>
        </svg>
      </div>
    </div>
  );
}
