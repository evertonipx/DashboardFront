"use client";

import * as React from "react";
import { Maximize2, Minimize2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function useMonitorMode() {
  const [monitorMode, setMonitorMode] = React.useState(false);

  const exitMonitorMode = React.useCallback(() => {
    setMonitorMode(false);

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
    }
  }, []);

  const enterMonitorMode = React.useCallback(() => {
    setMonitorMode(true);

    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => undefined);
    }
  }, []);

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
      if (!document.fullscreenElement) {
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
  }, [monitorMode]);

  return {
    enterMonitorMode,
    exitMonitorMode,
    monitorMode,
  };
}

export function MonitorModeButton({
  disabled,
  onClick,
}: {
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      disabled={disabled}
      title="Mostrar somente os dados configurados"
    >
      <Maximize2 className="h-4 w-4" />
      Modo monitor
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
  return (
    <div
      className={cn(
        "fixed right-3 top-3 z-[120] opacity-0 transition-opacity hover:opacity-100 focus-within:opacity-100",
        className,
      )}
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="bg-card/95 shadow-sm backdrop-blur"
        onClick={onExit}
      >
        <Minimize2 className="h-3.5 w-3.5" />
        Sair
      </Button>
    </div>
  );
}
