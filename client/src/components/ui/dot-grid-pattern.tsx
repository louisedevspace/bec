import { useId } from "react";
import { cn } from "@/lib/utils";

interface DotGridPatternProps {
  className?: string;
  /** Tailwind text-color utility controlling the pattern's stroke/fill via currentColor. */
  colorClassName?: string;
  /** Fade the pattern toward the edges with a radial mask (default true). */
  fade?: boolean;
}

/**
 * Decorative background texture: a repeating tile mixing small square dots,
 * plus marks, and x marks — a blueprint/schema motif for hero and loading
 * surfaces. Renders as SVG so it stays crisp at any size; color comes from
 * currentColor (set via colorClassName) so it always follows the semantic
 * token system, never a hardcoded hex.
 */
export function DotGridPattern({ className, colorClassName = "text-border", fade = true }: DotGridPatternProps) {
  const id = useId().replace(/[:]/g, "");
  const patternId = `dot-grid-pattern-${id}`;
  const maskId = `dot-grid-fade-${id}`;

  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", colorClassName, className)}
    >
      <svg className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id={patternId} width="64" height="64" patternUnits="userSpaceOnUse">
            {/* small square dot */}
            <rect x="14.5" y="14.5" width="3" height="3" fill="currentColor" opacity="0.55" />
            {/* plus mark */}
            <path d="M45 12 L45 20 M41 16 L49 16" stroke="currentColor" strokeWidth="1.25" opacity="0.5" strokeLinecap="round" />
            {/* x mark */}
            <path d="M13 43 L19 49 M19 43 L13 49" stroke="currentColor" strokeWidth="1.25" opacity="0.5" strokeLinecap="round" />
            {/* second, offset dot for density */}
            <rect x="46.5" y="46.5" width="3" height="3" fill="currentColor" opacity="0.4" />
          </pattern>
          {fade && (
            <radialGradient id={maskId} cx="50%" cy="42%" r="65%">
              <stop offset="0%" stopColor="white" stopOpacity="1" />
              <stop offset="70%" stopColor="white" stopOpacity="0.6" />
              <stop offset="100%" stopColor="white" stopOpacity="0" />
            </radialGradient>
          )}
          {fade && (
            <mask id={`${maskId}-mask`}>
              <rect width="100%" height="100%" fill={`url(#${maskId})`} />
            </mask>
          )}
        </defs>
        <rect
          width="100%"
          height="100%"
          fill={`url(#${patternId})`}
          mask={fade ? `url(#${maskId}-mask)` : undefined}
        />
      </svg>
    </div>
  );
}
