"use client";

import * as React from "react";
import { FileSpreadsheet, FileText } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  exportReportToExcel,
  exportReportToPdf,
  type ReportExportMode,
  type ReportPayload,
} from "@/lib/report-export";

type ReportExportActionsProps = {
  payload: ReportPayload;
  disabled?: boolean;
};

export function ReportExportActions({
  payload,
  disabled = false,
}: ReportExportActionsProps) {
  const [exporting, setExporting] = React.useState<"excel" | "pdf" | null>(null);
  const [mode, setMode] = React.useState<ReportExportMode>("complete");

  async function exportFile(format: "excel" | "pdf") {
    setExporting(format);
    try {
      if (format === "excel") {
        await exportReportToExcel(payload, { mode });
        toast.success("Excel gerado.");
      } else {
        await exportReportToPdf(payload, { mode });
        toast.success("PDF gerado.");
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível gerar o relatório.",
      );
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="flex w-full flex-wrap items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 sm:w-auto">
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
      >
        <SelectTrigger className="h-8 w-full min-w-[136px] bg-background px-2 text-xs shadow-none sm:w-[136px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="complete">Completo</SelectItem>
          <SelectItem value="charts">Só gráficos</SelectItem>
          <SelectItem value="data">Só dados</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
