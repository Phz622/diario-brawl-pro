// Minimalist neon trophy icon with cut-out aggressive eyes (PRO rank style).
// Eyes are true SVG cut-outs (evenodd fill-rule) so the page background shows through.
export function ProTrophy({ className, size = 96 }: { className?: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 120 140"
      width={size}
      height={(size * 140) / 120}
      className={className}
      fill="#39FF14"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="
          M30 8
          H90
          V46
          C90 70 78 84 60 86
          C42 84 30 70 30 46
          Z
          M22 18 H30 V40 C30 46 26 50 20 50 H14 C14 32 16 22 22 18 Z
          M98 18 H90 V40 C90 46 94 50 100 50 H106 C106 32 104 22 98 18 Z
          M52 92 H68 V104 H80 V116 H40 V104 H52 Z
          M30 122 H90 V134 H30 Z

          M44 36
          L58 42
          L56 54
          L42 50
          Z

          M76 36
          L62 42
          L64 54
          L78 50
          Z
        "
      />
    </svg>
  );
}
