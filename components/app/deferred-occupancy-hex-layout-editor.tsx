"use client";

import * as React from "react";
import { LoaderCircle, Settings2 } from "lucide-react";

import type { OccupancyHexLayoutEditorProps } from "@/components/app/occupancy-hex-layout-editor";
import { Button } from "@/components/ui/button";

let editorModulePromise:
  | ReturnType<typeof importOccupancyHexLayoutEditor>
  | undefined;

function importOccupancyHexLayoutEditor() {
  return import("@/components/app/occupancy-hex-layout-editor");
}

function preloadEditor() {
  editorModulePromise ??= importOccupancyHexLayoutEditor();
  return editorModulePromise;
}

const LazyOccupancyHexLayoutEditor = React.lazy(() =>
  preloadEditor().then((module) => ({
    default: module.OccupancyHexLayoutEditor,
  })),
);

export function OccupancyHexLayoutEditor(
  props: OccupancyHexLayoutEditorProps,
) {
  const [requested, setRequested] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  if (!requested) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 w-8 shrink-0 gap-1.5 px-0 @sm:w-auto @sm:px-3"
        aria-label="Configurar layout do simulador operacional"
        title="Configurar layout"
        onClick={() => {
          setRequested(true);
          setOpen(true);
        }}
        onFocus={() => void preloadEditor()}
        onPointerEnter={() => void preloadEditor()}
      >
        <Settings2 className="h-3.5 w-3.5" />
        <span className="sr-only @sm:not-sr-only">Configurar layout</span>
      </Button>
    );
  }

  return (
    <React.Suspense
      fallback={
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 w-8 shrink-0 gap-1.5 px-0 @sm:w-auto @sm:px-3"
          aria-label="Carregando configuração do layout"
          disabled
        >
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          <span className="sr-only @sm:not-sr-only">Carregando</span>
        </Button>
      }
    >
      <LazyOccupancyHexLayoutEditor
        {...props}
        onOpenChange={setOpen}
        open={open}
      />
    </React.Suspense>
  );
}
