/**
 * VeilMotif — recurring botanical/flower brand element.
 *
 * A delicate 12-petal layered flower (6 outer + 6 inner, offset 30°)
 * with a stem, two leaves, and scattered firefly dots.
 *
 * Uses `currentColor` throughout — set colour via CSS on the parent.
 * Size and positioning are fully controlled via `className`.
 */
export function VeilMotif({ className = "" }: { className?: string }) {
  const outerAngles = [0, 60, 120, 180, 240, 300];
  const innerAngles = [30, 90, 150, 210, 270, 330];
  const fireflies: [number, number, number, number][] = [
    [32, 32, 1.5, 0.25],
    [168, 24, 1.0, 0.2],
    [24, 145, 1.5, 0.2],
    [174, 152, 1.2, 0.25],
    [58, 182, 1.5, 0.2],
    [177, 82, 1.0, 0.18],
    [20, 70, 1.0, 0.15],
    [138, 192, 1.2, 0.2],
    [55, 50, 0.8, 0.15],
    [155, 48, 0.8, 0.15],
  ];

  return (
    <svg
      viewBox="0 0 200 222"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Outer petals */}
      {outerAngles.map((r) => (
        <g key={`op${r}`} transform={`rotate(${r},100,100)`}>
          <path
            d="M100 100 C111 77 111 50 100 36 C89 50 89 77 100 100"
            stroke="currentColor"
            strokeWidth="0.75"
          />
        </g>
      ))}

      {/* Inner petals */}
      {innerAngles.map((r) => (
        <g key={`ip${r}`} transform={`rotate(${r},100,100)`}>
          <path
            d="M100 100 C107 82 107 62 100 52 C93 62 93 82 100 100"
            stroke="currentColor"
            strokeWidth="0.6"
            opacity="0.45"
          />
        </g>
      ))}

      {/* Centre */}
      <circle cx="100" cy="100" r="5.5" stroke="currentColor" strokeWidth="0.6" />
      <circle cx="100" cy="100" r="2.2" fill="currentColor" />

      {/* Stem */}
      <path
        d="M100 100 C101 128 102 155 100 187"
        stroke="currentColor"
        strokeWidth="0.65"
      />
      {/* Leaf right */}
      <path
        d="M101 138 C113 130 118 118 112 109"
        stroke="currentColor"
        strokeWidth="0.55"
        opacity="0.7"
      />
      {/* Leaf left */}
      <path
        d="M101 158 C89 149 84 136 90 126"
        stroke="currentColor"
        strokeWidth="0.55"
        opacity="0.7"
      />

      {/* Fireflies */}
      {fireflies.map(([cx, cy, r, op], i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={r}
          fill="currentColor"
          opacity={op}
        />
      ))}
    </svg>
  );
}
