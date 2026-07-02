"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { gsap } from "gsap";

export function usePremiumShellMotion(
  rootRef: React.RefObject<HTMLElement | null>,
) {
  const pathname = usePathname();

  React.useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || prefersReducedMotion()) return;

    const context = gsap.context(() => {
      const title = root.querySelector<HTMLElement>("[data-premium-title]");
      const description = root.querySelector<HTMLElement>(
        "[data-premium-description]",
      );
      const navItems = limitedElements(root, "[data-premium-nav-item]", 12);
      const controls = limitedElements(root, "[data-premium-control]", 12);
      const cards = limitedElements(root, "[data-premium-card]", 28);
      const targets = [
        title,
        description,
        ...navItems,
        ...controls,
        ...cards,
      ].filter(Boolean);

      gsap.set(targets, {
        force3D: true,
        willChange: "transform, opacity, filter",
      });

      const timeline = gsap.timeline({
        defaults: {
          duration: 0.42,
          ease: "power3.out",
        },
      });

      if (title) {
        timeline.fromTo(
          title,
          { autoAlpha: 0, filter: "blur(4px)", y: 8 },
          { autoAlpha: 1, filter: "blur(0px)", y: 0 },
          0,
        );
      }

      if (description) {
        timeline.fromTo(
          description,
          { autoAlpha: 0, filter: "blur(3px)", y: 6 },
          { autoAlpha: 1, filter: "blur(0px)", y: 0 },
          0.06,
        );
      }

      if (navItems.length) {
        timeline.fromTo(
          navItems,
          { autoAlpha: 0, x: -6 },
          { autoAlpha: 1, duration: 0.34, stagger: 0.018, x: 0 },
          0.04,
        );
      }

      if (controls.length) {
        timeline.fromTo(
          controls,
          { autoAlpha: 0, y: 6 },
          { autoAlpha: 1, duration: 0.34, stagger: 0.018, y: 0 },
          0.1,
        );
      }

      if (cards.length) {
        timeline.fromTo(
          cards,
          { autoAlpha: 0, filter: "blur(5px)", y: 12 },
          {
            autoAlpha: 1,
            duration: 0.46,
            filter: "blur(0px)",
            stagger: 0.026,
            y: 0,
          },
          0.12,
        );
      }
    }, root);

    return () => context.revert();
  }, [pathname, rootRef]);

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root || prefersReducedMotion()) return;

    const targets = limitedElements(root, "[data-premium-hover]", 48);
    const cleanups = targets.map((target) => {
      function enter() {
        gsap.to(target, {
          duration: 0.22,
          ease: "power2.out",
          overwrite: "auto",
          scale: 1.002,
          y: -1.5,
        });
      }

      function leave() {
        gsap.to(target, {
          duration: 0.28,
          ease: "power2.out",
          overwrite: "auto",
          scale: 1,
          y: 0,
        });
      }

      target.addEventListener("pointerenter", enter);
      target.addEventListener("pointerleave", leave);
      target.addEventListener("pointercancel", leave);

      return () => {
        target.removeEventListener("pointerenter", enter);
        target.removeEventListener("pointerleave", leave);
        target.removeEventListener("pointercancel", leave);
      };
    });

    return () => {
      cleanups.forEach((cleanup) => cleanup());
      gsap.killTweensOf(targets);
    };
  }, [pathname, rootRef]);
}

function limitedElements(root: HTMLElement, selector: string, limit: number) {
  return Array.from(root.querySelectorAll<HTMLElement>(selector)).slice(0, limit);
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
