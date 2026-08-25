"use client";

import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function OccupancyBlockingState({
  className,
  onRetry,
  retrying = false,
}: {
  className?: string;
  onRetry: () => void;
  retrying?: boolean;
}) {
  return (
    <div
      aria-atomic="true"
      aria-busy={retrying}
      aria-live="polite"
      className={cn(
        "flex min-h-9 w-full items-center justify-between gap-2 rounded-md border border-destructive/20 bg-destructive/5 px-2.5 py-1.5 text-xs",
        className,
      )}
      role="status"
    >
      <span className="min-w-0 truncate font-medium text-foreground">
        Ocupação indisponível.
      </span>
      <Button
        aria-label="Tentar carregar os dados de ocupação novamente"
        className="h-7 shrink-0 px-2 text-xs"
        disabled={retrying}
        onClick={onRetry}
        size="sm"
        type="button"
        variant="ghost"
      >
        <RefreshCw
          aria-hidden="true"
          className={cn("h-3.5 w-3.5", retrying && "animate-spin")}
        />
        Tentar novamente
      </Button>
    </div>
  );
}
