import { useId } from "react";

import { cn } from "@/lib/utils";

type IPXBrandMarkProps = {
  className?: string;
  decorative?: boolean;
};

// Self-contained SVG: no fonts, images, timers or animation runtime.
// Local paint/clip IDs are unique when desktop and mobile marks coexist.
const markStyles = `
  [data-ipx-brand-mark] {
    color: hsl(var(--foreground));
    overflow: hidden;
  }
  [data-ipx-brand-mark] .ipx-mark-surface {
    fill: hsl(var(--primary) / 0.025);
    stroke: hsl(var(--foreground) / 0.2);
    stroke-width: 0.85;
  }
  [data-ipx-brand-mark] .ipx-mark-type {
    fill: currentColor;
    stroke: none;
  }
  [data-ipx-brand-mark] .ipx-mark-light {
    stop-color: hsl(var(--primary));
  }
  [data-ipx-brand-mark] .ipx-mark-scan {
    pointer-events: none;
  }
  [data-ipx-brand-mark] .ipx-mark-sweep {
    transform-box: view-box;
    transform-origin: 0 0;
    transform: translateX(-18px);
    opacity: 0;
    animation: ipx-brand-scan 3.6s cubic-bezier(0.4, 0, 0.6, 1) both;
  }
  @keyframes ipx-brand-scan {
    0%, 8% { opacity: 0; transform: translateX(-18px); }
    22% { opacity: 0.8; }
    78% { opacity: 0.8; }
    100% { opacity: 0; transform: translateX(52px); }
  }
  @media (prefers-reduced-motion: reduce) {
    [data-ipx-brand-mark] .ipx-mark-scan { display: none; }
    [data-ipx-brand-mark] .ipx-mark-sweep { animation: none; }
  }
  @media (forced-colors: active) {
    [data-ipx-brand-mark] { color: CanvasText; }
    [data-ipx-brand-mark] .ipx-mark-surface { fill: Canvas; stroke: CanvasText; }
    [data-ipx-brand-mark] .ipx-mark-type { fill: CanvasText; }
    [data-ipx-brand-mark] .ipx-mark-scan { display: none; }
    [data-ipx-brand-mark] .ipx-mark-sweep { animation: none; }
  }
`;

const frame = "M15 3H33A12 12 0 0 1 45 15V33A12 12 0 0 1 33 45H15A12 12 0 0 1 3 33V15A12 12 0 0 1 15 3Z";
const lettersIP = "M9 16H11.5V32H9ZM15.5 32V16H21.2C25 16 27.1 18 27.1 21.25C27.1 24.5 25 26.5 21.2 26.5H18V32ZM18 18.3V24.2H21C23.4 24.2 24.6 23.2 24.6 21.25C24.6 19.3 23.4 18.3 21 18.3Z";
const letterX = "M28.7 16H31.5L34.25 21.6L37 16H39.8L35.75 23.8L40 32H37.15L34.25 26.1L31.35 32H28.5L32.75 23.8Z";

/** The navigation's compact, geometric IPX monogram. */
export function IPXBrandMark({ className, decorative = false }: IPXBrandMarkProps) {
  const instanceId = useId();
  const clipId = `ipx-letters-${instanceId}`;
  const lightId = `ipx-light-${instanceId}`;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 48"
      width="40"
      height="40"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("block shrink-0 select-none", className)}
      data-ipx-brand-mark=""
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : "IPXData"}
      aria-hidden={decorative ? true : undefined}
      focusable="false"
    >
      <style>{markStyles}</style>
      <defs>
        <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
          <path d={lettersIP} clipRule="evenodd" />
          <path d={letterX} />
        </clipPath>
        <linearGradient id={lightId} x1="0" y1="0" x2="16" y2="0" gradientUnits="userSpaceOnUse">
          <stop className="ipx-mark-light" offset="0" stopOpacity="0" />
          <stop className="ipx-mark-light" offset="0.35" stopOpacity="0.18" />
          <stop className="ipx-mark-light" offset="0.55" stopOpacity="0.85" />
          <stop className="ipx-mark-light" offset="0.72" stopOpacity="0.22" />
          <stop className="ipx-mark-light" offset="1" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path className="ipx-mark-surface" d={frame} />
      {/* Filled, sans-serif outlines stay clear at 36/40 px; no hairline
          letter strokes, serif bars or decorative marks around the initials. */}
      <path className="ipx-mark-type" fillRule="evenodd" d={lettersIP} />
      <path className="ipx-mark-type" d={letterX} />
      {/* One softly feathered scan, clipped to the existing letters. The
          original opaque glyphs remain underneath, sharp and stationary. */}
      <g className="ipx-mark-scan" clipPath={`url(#${clipId})`} aria-hidden="true">
        <rect className="ipx-mark-sweep" x="0" y="14" width="16" height="20" fill={`url(#${lightId})`} />
      </g>
    </svg>
  );
}
