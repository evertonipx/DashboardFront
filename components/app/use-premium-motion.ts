"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

export function usePremiumShellMotion(
  rootRef: React.RefObject<HTMLElement | null>,
) {
  const pathname = usePathname();

  React.useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || prefersReducedMotion()) return;

    const candidates: Array<[HTMLElement | null, number]> = [
      [root.querySelector<HTMLElement>("[data-premium-title]"), 3],
      [root.querySelector<HTMLElement>("[data-premium-description]"), 2],
      [root.querySelector<HTMLElement>("[data-premium-content]"), 4],
    ];
    const animations = candidates.flatMap(([target, offset], index) =>
      target
        ? [
            target.animate(
              [
                { transform: `translateY(${offset}px)` },
                { transform: "translateY(0)" },
              ],
              {
                delay: index * 15,
                duration: 180,
                easing: "cubic-bezier(0.22, 1, 0.36, 1)",
              },
            ),
          ]
        : [],
    );

    return () => animations.forEach((animation) => animation.cancel());
  }, [pathname, rootRef]);
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
