"use client";

import * as React from "react";
import { Maximize2, Minimize2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type MonitorModeOptions = {
  initialMode?: boolean;
  requestFullscreen?: boolean;
};

export function useMonitorMode({
  initialMode = false,
  requestFullscreen = true,
}: MonitorModeOptions = {}) {
  const [monitorMode, setMonitorMode] = React.useState(initialMode);
  const returnFocusRef = React.useRef<HTMLElement | null>(null);
  const restoreFocusPendingRef = React.useRef(false);

  const exitMonitorMode = React.useCallback(() => {
    setMonitorMode(false);

    if (requestFullscreen && document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
    }
  }, [requestFullscreen]);

  const enterMonitorMode = React.useCallback(() => {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && activeElement !== document.body) {
      returnFocusRef.current = activeElement;
      restoreFocusPendingRef.current = true;
    }
    setMonitorMode(true);

    if (requestFullscreen && !document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => undefined);
    }
  }, [requestFullscreen]);

  React.useEffect(() => {
    if (monitorMode || !restoreFocusPendingRef.current) return;
    restoreFocusPendingRef.current = false;
    const returnTarget = returnFocusRef.current;
    returnFocusRef.current = null;
    const frame = window.requestAnimationFrame(() => {
      const focusTarget = returnTarget?.isConnected
        ? returnTarget
        : document.querySelector<HTMLElement>("[data-monitor-mode-trigger]");
      focusTarget?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [monitorMode]);

  React.useEffect(() => {
    if (!monitorMode) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMonitorMode(false);
      }
    }

    function handleFullscreenChange() {
      if (requestFullscreen && !document.fullscreenElement) {
        setMonitorMode(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [monitorMode, requestFullscreen]);

  return {
    enterMonitorMode,
    exitMonitorMode,
    monitorMode,
  };
}

export function MonitorModeButton({
  compact = false,
  disabled,
  onClick,
}: {
  compact?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      data-monitor-mode-trigger
      type="button"
      variant="outline"
      size={compact ? "icon" : "default"}
      className={compact ? "h-8 w-8" : undefined}
      onClick={onClick}
      disabled={disabled}
      aria-label={compact ? "Ativar modo monitor" : undefined}
      title="Mostrar somente os dados configurados"
    >
      <Maximize2 className="h-4 w-4" />
      {compact ? null : "Modo monitor"}
    </Button>
  );
}

export function MonitorModeExitHint({
  className,
  onExit,
}: {
  className?: string;
  onExit: () => void;
}) {
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      buttonRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      className={cn(
        "fixed z-[120] opacity-100 transition-opacity",
        className,
      )}
      style={{
        insetInlineEnd: "max(0.75rem, env(safe-area-inset-right))",
        top: "max(0.75rem, env(safe-area-inset-top))",
      }}
    >
      <Button
        ref={buttonRef}
        type="button"
        variant="outline"
        size="sm"
        className="bg-card/95 shadow-sm backdrop-blur"
        onClick={onExit}
        aria-label="Sair do modo monitor"
      >
        <Minimize2 className="h-3.5 w-3.5" />
        Sair
      </Button>
    </div>
  );
}
