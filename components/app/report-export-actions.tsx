"use client";

import * as React from "react";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  ReportExportMode,
  ReportPayload,
} from "@/lib/report-export";
import { userFacingErrorMessage } from "@/lib/user-facing-error";

type ReportExportActionsProps = {
  payload?: ReportPayload;
  disabled?: boolean;
  getPayload?: (signal?: AbortSignal) => Promise<ReportPayload> | ReportPayload;
  compact?: boolean;
};

export function ReportExportActions({
  payload,
  disabled = false,
  getPayload,
  compact = false,
}: ReportExportActionsProps) {
  const [exporting, setExporting] = React.useState<"excel" | "pdf" | null>(null);
  const [mode, setMode] = React.useState<ReportExportMode>("complete");
  const exportInFlightRef = React.useRef(false);
  const exportControllerRef = React.useRef<AbortController | null>(null);

  React.useEffect(
    () => () => {
      const controller = exportControllerRef.current;
      if (controller && !controller.signal.aborted) {
        controller.abort(
          new DOMException("A exportação foi fechada.", "AbortError"),
        );
      }
    },
    [],
  );

  async function exportFile(format: "excel" | "pdf") {
    if (exportInFlightRef.current) return;
    exportInFlightRef.current = true;
    setExporting(format);
    const controller = new AbortController();
    exportControllerRef.current = controller;
    try {
      const exportPayload = getPayload
        ? await getPayload(controller.signal)
        : payload;
      controller.signal.throwIfAborted();
      if (!exportPayload) {
        throw new Error("Os dados do relatório ainda não estão disponíveis.");
      }
      const { exportReportToExcel, exportReportToPdf } = await import(
        "@/lib/report-export"
      );

      if (format === "excel") {
        await exportReportToExcel(exportPayload, {
          mode,
          signal: controller.signal,
        });
        controller.signal.throwIfAborted();
        toast.success("Excel gerado.");
      } else {
        await exportReportToPdf(exportPayload, {
          mode,
          signal: controller.signal,
        });
        controller.signal.throwIfAborted();
        toast.success("PDF gerado.");
      }
    } catch (error) {
      if (isExportAbort(error, controller.signal)) return;
      toast.error(userFacingErrorMessage(error, "Não foi possível gerar o relatório."));
    } finally {
      if (exportControllerRef.current === controller) {
        exportControllerRef.current = null;
      }
      exportInFlightRef.current = false;
      setExporting(null);
    }
  }

  if (compact) {
    return (
      <Dialog>
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0"
            disabled={disabled || Boolean(exporting)}
            aria-label="Exportar relatório"
            title="Exportar relatório"
          >
            <Download className="h-4 w-4" />
            <span className="sr-only">Exportar relatório</span>
          </Button>
        </DialogTrigger>
        <DialogContent
          className="max-w-sm gap-3"
          aria-busy={Boolean(exporting)}
        >
          <DialogHeader>
            <DialogTitle className="text-base">Exportar relatório</DialogTitle>
            <DialogDescription>
              Escolha o conteúdo e o formato do arquivo.
            </DialogDescription>
          </DialogHeader>

          <Select
            value={mode}
            onValueChange={(value) => setMode(value as ReportExportMode)}
            disabled={disabled || Boolean(exporting)}
          >
            <SelectTrigger
              className="h-9 w-full bg-background px-2 text-xs shadow-none"
              aria-label="Conteúdo da exportação"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="complete">Completo</SelectItem>
              <SelectItem value="charts">Só gráficos</SelectItem>
              <SelectItem value="data">Só dados</SelectItem>
            </SelectContent>
          </Select>

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => exportFile("excel")}
              disabled={disabled || Boolean(exporting)}
            >
              <FileSpreadsheet className="h-4 w-4" />
              {exporting === "excel" ? "Gerando..." : "Excel"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => exportFile("pdf")}
              disabled={disabled || Boolean(exporting)}
            >
              <FileText className="h-4 w-4" />
              {exporting === "pdf" ? "Gerando..." : "PDF"}
            </Button>
          </div>
          <span className="sr-only" role="status" aria-live="polite">
            {exporting
              ? `Gerando arquivo ${exporting === "excel" ? "Excel" : "PDF"}.`
              : ""}
          </span>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <div
      className="flex w-full flex-wrap items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 sm:w-auto"
      aria-busy={Boolean(exporting)}
    >
      <span className="w-full px-1 text-xs font-semibold uppercase text-muted-foreground sm:w-auto">
        Exportação
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="flex-1 sm:flex-none"
        onClick={() => exportFile("excel")}
        disabled={disabled || Boolean(exporting)}
      >
        <FileSpreadsheet className="h-4 w-4" />
        {exporting === "excel" ? "Gerando..." : "Excel"}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="flex-1 sm:flex-none"
        onClick={() => exportFile("pdf")}
        disabled={disabled || Boolean(exporting)}
      >
        <FileText className="h-4 w-4" />
        {exporting === "pdf" ? "Gerando..." : "PDF"}
      </Button>
      <Select
        value={mode}
        onValueChange={(value) => setMode(value as ReportExportMode)}
        disabled={disabled || Boolean(exporting)}
      >
        <SelectTrigger
          className="h-8 w-full min-w-[136px] bg-background px-2 text-xs shadow-none sm:w-[136px]"
          aria-label="Conteúdo da exportação"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="complete">Completo</SelectItem>
          <SelectItem value="charts">Só gráficos</SelectItem>
          <SelectItem value="data">Só dados</SelectItem>
        </SelectContent>
      </Select>
      <span className="sr-only" role="status" aria-live="polite">
        {exporting
          ? `Gerando arquivo ${exporting === "excel" ? "Excel" : "PDF"}.`
          : ""}
      </span>
    </div>
  );
}

function isExportAbort(error: unknown, signal: AbortSignal) {
  return (
    signal.aborted ||
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}
