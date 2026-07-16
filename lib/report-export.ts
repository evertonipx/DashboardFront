"use client";

import { renderEChartToDataUrl, type EnterpriseChartOption } from "@/components/app/echart";

export type ReportMetric = {
  label: string;
  value: string | number;
  description?: string;
};

export type ReportTableColumn = {
  key: string;
  label: string;
  width?: number;
  numeric?: boolean;
};

export type ReportTableRow = Record<string, string | number | null | undefined>;

export type ReportTable = {
  title: string;
  description?: string;
  columns: ReportTableColumn[];
  rows: ReportTableRow[];
  includeInCharts?: boolean;
};

export type ReportChart = {
  title: string;
  description?: string;
  comparison?: string;
  option: EnterpriseChartOption;
  table: ReportTable;
};

export type ReportPayload = {
  title: string;
  subtitle?: string;
  filename: string;
  generatedAt: Date;
  dataCompleteUntil?: Date;
  context?: string[];
  metrics: ReportMetric[];
  charts: ReportChart[];
  tables?: ReportTable[];
};

export type ReportExportMode = "complete" | "charts" | "data";

type ReportExportOptions = {
  mode?: ReportExportMode;
};

const BRAND_BLUE = "1267C4";
const DARK_TEXT = "13233A";
const MUTED_TEXT = "526477";
const BORDER = "D8E3F2";
const SOFT_BLUE = "EAF4FF";
const POSITIVE_TEXT = "0F766E";
const NEGATIVE_TEXT = "C2410C";

export async function exportReportToExcel(
  payload: ReportPayload,
  options: ReportExportOptions = {},
) {
  const mode = options.mode ?? "complete";
  const exportedAt = new Date();
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "IPXData";
  workbook.created = exportedAt;
  workbook.modified = exportedAt;
  workbook.properties.date1904 = false;

  const summary = workbook.addWorksheet("Resumo", {
    pageSetup: {
      fitToPage: true,
      fitToWidth: 1,
      orientation: "landscape",
      paperSize: 9,
    },
    views: [{ showGridLines: false }],
  });
  summary.columns = [
    { key: "a", width: 28 },
    { key: "b", width: 18 },
    { key: "c", width: 28 },
    { key: "d", width: 18 },
    { key: "e", width: 28 },
  ];
  const summaryContentStartRow = buildExcelHeader(summary, payload, mode, exportedAt);

  let nextRow = summaryContentStartRow;
  if (mode !== "charts") {
    buildExcelMetrics(summary, payload.metrics, summaryContentStartRow);
    nextRow = summaryContentStartRow + 4 + Math.ceil(payload.metrics.length / 2) * 3;
  }
  for (const table of reportTablesForMode(payload.tables, mode)) {
    nextRow = buildExcelTable(summary, table, nextRow) + 2;
  }

  for (const [index, chart] of payload.charts.entries()) {
    const sheet = workbook.addWorksheet(safeSheetName(`${index + 1} ${chart.title}`), {
      pageSetup: {
        fitToPage: true,
        fitToWidth: 1,
        orientation: "landscape",
        paperSize: 9,
      },
      views: [{ showGridLines: false }],
    });
    sheet.columns = chart.table.columns.map((column) => ({
      key: column.key,
      width: column.width ?? 20,
    }));

    sheet.mergeCells(1, 1, 1, Math.max(chart.table.columns.length, 3));
    const titleCell = sheet.getCell(1, 1);
    titleCell.value = chart.title;
    titleCell.font = { bold: true, color: { argb: `FF${DARK_TEXT}` }, size: 16 };

    sheet.mergeCells(2, 1, 2, Math.max(chart.table.columns.length, 3));
    const descCell = sheet.getCell(2, 1);
    descCell.value = [chart.description, chart.comparison].filter(Boolean).join(" | ");
    descCell.font = { color: { argb: `FF${MUTED_TEXT}` }, size: 10 };
    descCell.alignment = { vertical: "top", wrapText: true };
    sheet.getRow(2).height = chart.comparison ? 32 : 20;

    sheet.mergeCells(3, 1, 3, Math.max(chart.table.columns.length, 3));
    const completeCell = sheet.getCell(3, 1);
    completeCell.value = reportCompletenessLabel(payload);
    completeCell.font = { color: { argb: `FF${MUTED_TEXT}` }, size: 10 };
    completeCell.alignment = { vertical: "top", wrapText: true };

    if (mode !== "data") {
      const dataUrl = await renderEChartToDataUrl(
        withExportBarValueLabels(chart.option),
      );
      const imageId = workbook.addImage({
        base64: dataUrl,
        extension: "png",
      });
      sheet.addImage(imageId, {
        ext: { height: 270, width: 735 },
        tl: { col: 0, row: 4 },
      });
    }

    if (mode !== "charts") {
      buildExcelTable(sheet, chart.table, mode === "data" ? 6 : 23);
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer as BlobPart], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `${safeFilename(`${payload.filename}-${mode}`)}.xlsx`,
  );
}

export async function exportReportToPdf(
  payload: ReportPayload,
  options: ReportExportOptions = {},
) {
  const mode = options.mode ?? "complete";
  const exportedAt = new Date();
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({
    format: "a4",
    orientation: "landscape",
    unit: "pt",
  });

  drawPdfCover(doc, payload, mode, exportedAt);

  if (mode !== "data") {
    for (const chart of payload.charts) {
      doc.addPage();
      drawPdfPageHeader(doc, payload.title, chart.title);
      drawPdfText(doc, chart.description ?? "", 42, 86, 11, MUTED_TEXT);
      drawPdfText(doc, reportCompletenessLabel(payload), 42, 104, 10, MUTED_TEXT);
      let chartTop = 128;
      if (chart.comparison) {
        chartTop = 122 + drawPdfNoteBox(doc, chart.comparison, 42, 122) + 12;
      }

      const image = await renderEChartToDataUrl(
        withExportBarValueLabels(chart.option),
        {
          height: 340,
          width: 980,
        },
      );
      doc.addImage(image, "PNG", 42, chartTop, 758, 265, undefined, "FAST");

      if (mode === "complete") {
        doc.addPage();
        drawPdfPageHeader(doc, payload.title, chart.table.title);
        drawPdfText(doc, chart.description ?? "", 42, 86, 11, MUTED_TEXT);
        drawPdfText(doc, reportCompletenessLabel(payload), 42, 104, 10, MUTED_TEXT);
        drawPdfTable(doc, chart.table, 128, payload.title, true);
      }
    }
  }

  if (mode === "data") {
    for (const chart of payload.charts) {
      doc.addPage();
      drawPdfPageHeader(doc, payload.title, chart.table.title);
      drawPdfText(doc, chart.description ?? "", 42, 86, 11, MUTED_TEXT);
      drawPdfText(doc, reportCompletenessLabel(payload), 42, 104, 10, MUTED_TEXT);
      drawPdfTable(doc, chart.table, 128, payload.title, true);
    }
  }

  for (const table of reportTablesForMode(payload.tables, mode)) {
    doc.addPage();
    drawPdfPageHeader(doc, payload.title, table.title);
    if (table.description) drawPdfText(doc, table.description, 42, 86, 11, MUTED_TEXT);
    drawPdfText(doc, reportCompletenessLabel(payload), 42, table.description ? 104 : 86, 10, MUTED_TEXT);
    drawPdfTable(doc, table, table.description ? 128 : 112, payload.title, true);
  }

  doc.save(`${safeFilename(`${payload.filename}-${mode}`)}.pdf`);
}

function buildExcelHeader(
  sheet: import("exceljs").Worksheet,
  payload: ReportPayload,
  mode: ReportExportMode,
  exportedAt: Date,
): number {
  sheet.mergeCells("A1:E1");
  sheet.getCell("A1").value = payload.title;
  sheet.getCell("A1").font = {
    bold: true,
    color: { argb: `FF${DARK_TEXT}` },
    size: 20,
  };
  sheet.getCell("A1").alignment = { vertical: "middle" };
  sheet.getRow(1).height = 28;

  sheet.mergeCells("A2:E2");
  sheet.getCell("A2").value = payload.subtitle ?? "Relatório IPXData";
  sheet.getCell("A2").font = { color: { argb: `FF${MUTED_TEXT}` }, size: 11 };

  sheet.getCell("A4").value = "Exportado em";
  sheet.getCell("B4").value = formatDateTime(exportedAt);
  sheet.getCell("A4").font = labelFont();
  sheet.getCell("B4").font = valueFont();

  sheet.getCell("A5").value = "Dados completos até";
  sheet.getCell("B5").value = formatDateTime(dataCompleteUntil(payload));
  sheet.getCell("A5").font = labelFont();
  sheet.getCell("B5").font = valueFont();

  sheet.getCell("A6").value = "Conteúdo";
  sheet.getCell("B6").value = modeLabel(mode);
  sheet.getCell("A6").font = labelFont();
  sheet.getCell("B6").font = valueFont();

  payload.context?.slice(0, 3).forEach((item, index) => {
    const row = 7 + index;
    sheet.getCell(row, 1).value = item;
    sheet.mergeCells(row, 1, row, 5);
    sheet.getCell(row, 1).font = { color: { argb: `FF${MUTED_TEXT}` }, size: 10 };
    sheet.getCell(row, 1).alignment = { vertical: "top", wrapText: true };
    sheet.getRow(row).height = 22;
  });

  return 8 + Math.min(payload.context?.length ?? 0, 3);
}

function buildExcelMetrics(
  sheet: import("exceljs").Worksheet,
  metrics: ReportMetric[],
  startRow: number,
) {
  sheet.getCell(startRow, 1).value = "Indicadores";
  sheet.getCell(startRow, 1).font = {
    bold: true,
    color: { argb: `FF${DARK_TEXT}` },
    size: 13,
  };

  metrics.forEach((metric, index) => {
    const row = startRow + 2 + Math.floor(index / 2) * 3;
    const col = index % 2 === 0 ? 1 : 4;
    sheet.getCell(row, col).value = metric.label;
    sheet.getCell(row + 1, col).value = String(metric.value);
    sheet.getCell(row + 2, col).value = metric.description ?? "";
    sheet.getCell(row, col).font = labelFont();
    sheet.getCell(row + 1, col).font = {
      bold: true,
      color: { argb: `FF${BRAND_BLUE}` },
      size: 16,
    };
    sheet.getCell(row + 2, col).font = {
      color: { argb: `FF${MUTED_TEXT}` },
      size: 9,
    };
    for (let r = row; r <= row + 2; r += 1) {
      sheet.getCell(r, col).fill = softFill();
      sheet.getCell(r, col).border = softBorder();
      sheet.getCell(r, col + 1).fill = softFill();
      sheet.getCell(r, col + 1).border = softBorder();
    }
    sheet.mergeCells(row, col, row, col + 1);
    sheet.mergeCells(row + 1, col, row + 1, col + 1);
    sheet.mergeCells(row + 2, col, row + 2, col + 1);
  });
}

function buildExcelTable(
  sheet: import("exceljs").Worksheet,
  table: ReportTable,
  startRow: number,
) {
  const lastColumn = Math.max(1, table.columns.length);
  if (lastColumn > 1) {
    sheet.mergeCells(startRow, 1, startRow, lastColumn);
  }
  sheet.getCell(startRow, 1).value = table.title;
  sheet.getCell(startRow, 1).font = {
    bold: true,
    color: { argb: `FF${DARK_TEXT}` },
    size: 13,
  };
  if (table.description) {
    if (lastColumn > 1) {
      sheet.mergeCells(startRow + 1, 1, startRow + 1, lastColumn);
    }
    sheet.getCell(startRow + 1, 1).value = table.description;
    sheet.getCell(startRow + 1, 1).font = {
      color: { argb: `FF${MUTED_TEXT}` },
      size: 10,
    };
    sheet.getCell(startRow + 1, 1).alignment = {
      vertical: "top",
      wrapText: true,
    };
    sheet.getRow(startRow + 1).height = 28;
  }

  const headerRow = sheet.getRow(startRow + 3);
  headerRow.height = 30;
  table.columns.forEach((column, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = column.label;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.fill = {
      fgColor: { argb: `FF${BRAND_BLUE}` },
      pattern: "solid",
      type: "pattern",
    };
    cell.border = softBorder();
    cell.alignment = {
      horizontal: column.numeric ? "right" : "left",
      vertical: "middle",
      wrapText: true,
    };
    sheet.getColumn(index + 1).width = column.width ?? 18;
  });

  table.rows.forEach((row, rowIndex) => {
    const excelRow = sheet.getRow(startRow + 4 + rowIndex);
    excelRow.height = 21;
    const variationRow = Object.values(row).some(
      (value) => typeof value === "string" && /^Var(?:\.|iação)/i.test(value),
    );
    table.columns.forEach((column, columnIndex) => {
      const cell = excelRow.getCell(columnIndex + 1);
      const value = row[column.key];
      cell.value = value ?? "";
      cell.border = softBorder();
      cell.alignment = {
        horizontal: column.numeric ? "right" : "left",
        vertical: "middle",
        wrapText: !column.numeric,
      };
      if (column.numeric && typeof value === "number") {
        cell.numFmt = "#,##0;[Red]-#,##0";
      }
      if (variationRow) {
        const deltaColor = reportDeltaColor(value);
        cell.fill = {
          fgColor: { argb: "FFF1F5F9" },
          pattern: "solid",
          type: "pattern",
        };
        cell.font = {
          bold: true,
          color: { argb: `FF${deltaColor ?? MUTED_TEXT}` },
          size: 9,
        };
      } else if (rowIndex % 2 === 0) {
        cell.fill = softFill();
      }
    });
  });

  return startRow + 4 + table.rows.length;
}

function drawPdfCover(
  doc: import("jspdf").jsPDF,
  payload: ReportPayload,
  mode: ReportExportMode,
  exportedAt: Date,
) {
  const width = doc.internal.pageSize.getWidth();
  doc.setFillColor(`#${BRAND_BLUE}`);
  doc.rect(0, 0, width, 16, "F");

  drawPdfText(doc, "IPXData", 42, 48, 12, BRAND_BLUE, true);
  drawPdfText(doc, payload.title, 42, 82, 24, DARK_TEXT, true);
  drawPdfText(doc, payload.subtitle ?? "Relatório executivo", 42, 108, 12, MUTED_TEXT);
  drawPdfText(doc, `Exportado em ${formatDateTime(exportedAt)}`, 42, 132, 10, MUTED_TEXT);
  drawPdfText(doc, reportCompletenessLabel(payload), 42, 150, 10, MUTED_TEXT);
  drawPdfText(doc, `Conteúdo: ${modeLabel(mode)}`, 42, 168, 10, MUTED_TEXT);

  let contentY = 190;
  payload.context?.forEach((item) => {
    const boxHeight = drawPdfNoteBox(doc, item, 42, contentY);
    contentY += boxHeight + 6;
  });

  const cardWidth = (width - 84 - 36) / 4;
  if (mode === "charts") return;
  const metricsY = Math.max(202, contentY + 10);

  payload.metrics.slice(0, 8).forEach((metric, index) => {
    const col = index % 4;
    const row = Math.floor(index / 4);
    const x = 42 + col * (cardWidth + 12);
    const y = metricsY + row * 92;
    doc.setFillColor("#F8FBFF");
    doc.setDrawColor(`#${BORDER}`);
    doc.roundedRect(x, y, cardWidth, 76, 6, 6, "FD");
    drawPdfText(doc, metric.label.toUpperCase(), x + 14, y + 22, 8, MUTED_TEXT, true);
    drawPdfText(doc, String(metric.value), x + 14, y + 46, 18, BRAND_BLUE, true);
    drawPdfText(doc, metric.description ?? "", x + 14, y + 63, 8, MUTED_TEXT);
  });
}

function dataCompleteUntil(payload: ReportPayload) {
  return payload.dataCompleteUntil ?? payload.generatedAt;
}

function reportCompletenessLabel(payload: ReportPayload) {
  return `Dados completos até ${formatDateTime(dataCompleteUntil(payload))}`;
}

function modeLabel(mode: ReportExportMode) {
  if (mode === "charts") return "Somente gráficos";
  if (mode === "data") return "Somente dados";
  return "Completo";
}

function reportTablesForMode(
  tables: ReportTable[] | undefined,
  mode: ReportExportMode,
) {
  const availableTables = tables ?? [];
  return mode === "charts"
    ? availableTables.filter((table) => table.includeInCharts)
    : availableTables;
}

function drawPdfPageHeader(
  doc: import("jspdf").jsPDF,
  reportTitle: string,
  pageTitle: string,
) {
  const width = doc.internal.pageSize.getWidth();
  doc.setFillColor(`#${BRAND_BLUE}`);
  doc.rect(0, 0, width, 12, "F");
  drawPdfText(doc, reportTitle, 42, 40, 9, MUTED_TEXT, true);
  drawPdfText(doc, pageTitle, 42, 64, 18, DARK_TEXT, true);
}

function drawPdfTable(
  doc: import("jspdf").jsPDF,
  table: ReportTable,
  startY: number,
  reportTitle: string,
  fullPage = false,
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 42;
  const tableWidth = pageWidth - margin * 2;
  const columns = table.columns;
  const denseTable = columns.length >= 14;
  const minimumRowHeight = denseTable ? 15 : fullPage ? 21 : 18;
  const tableFontSize = columns.length >= 14 ? 6 : columns.length >= 9 ? 7 : 8;
  const headerFontSize = Math.max(6, tableFontSize);
  const lineHeight = tableFontSize + 2;
  const headerLineHeight = headerFontSize + 2;
  const cellPadding = columns.length >= 14 ? 3 : 6;
  const totalWeight = columns.reduce((sum, column) => sum + (column.width ?? 16), 0);
  const widths = columns.map((column) => ((column.width ?? 16) / totalWeight) * tableWidth);
  const headerLines = columns.map((column, index) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(headerFontSize);
    return limitPdfLines(
      doc,
      column.label,
      Math.max(1, widths[index] - cellPadding * 2),
      2,
    );
  });
  const headerHeight = Math.max(
    denseTable ? 22 : 24,
    Math.max(...headerLines.map((lines) => lines.length), 1) *
      headerLineHeight +
      cellPadding * 2,
  );
  let y = startY;

  if (!fullPage) {
    drawPdfText(doc, table.title, margin, y - 10, 10, DARK_TEXT, true);
  }

  function ensureSpace(requiredHeight: number) {
    if (y + requiredHeight <= pageHeight - 36) return;
    doc.addPage();
    drawPdfPageHeader(doc, reportTitle, table.title);
    y = 104;
    drawHeader();
  }

  function drawHeader() {
    let x = margin;
    columns.forEach((column, index) => {
      doc.setFillColor(`#${BRAND_BLUE}`);
      doc.setDrawColor(`#${BORDER}`);
      doc.rect(x, y, widths[index], headerHeight, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(headerFontSize);
      doc.setTextColor("#FFFFFF");
      const lines = headerLines[index];
      const textY =
        y +
        (headerHeight - lines.length * headerLineHeight) / 2 +
        headerFontSize;
      doc.text(
        lines,
        column.numeric ? x + widths[index] - cellPadding : x + cellPadding,
        textY,
        {
          align: column.numeric ? "right" : "left",
          lineHeightFactor: headerLineHeight / headerFontSize,
        },
      );
      x += widths[index];
    });
    y += headerHeight;
  }

  function rowCellLines(row: ReportTableRow) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(tableFontSize);

    return columns.map((column, index) => {
      const text = formatCellValue(row[column.key]);
      const availableWidth = Math.max(1, widths[index] - cellPadding * 2);
      if (column.numeric || denseTable) {
        return [fitPdfText(doc, text, availableWidth)];
      }
      return limitPdfLines(doc, text, availableWidth, 2);
    });
  }

  if (y + headerHeight + minimumRowHeight > pageHeight - 36) {
    doc.addPage();
    drawPdfPageHeader(doc, reportTitle, table.title);
    y = 104;
  }
  drawHeader();
  table.rows.forEach((row, rowIndex) => {
    const linesByColumn = rowCellLines(row);
    const rowHeight = Math.max(
      minimumRowHeight,
      Math.max(...linesByColumn.map((lines) => lines.length), 1) * lineHeight +
        cellPadding * 2,
    );
    ensureSpace(rowHeight);
    let x = margin;
    const variationRow = Object.values(row).some(
      (value) => typeof value === "string" && /^Var(?:\.|iação)/i.test(value),
    );

    columns.forEach((column, index) => {
      doc.setFillColor(
        variationRow
          ? "#F1F5F9"
          : rowIndex % 2 === 0
            ? "#F8FBFF"
            : "#FFFFFF",
      );
      doc.setDrawColor(`#${BORDER}`);
      doc.rect(x, y, widths[index], rowHeight, "FD");
      const deltaColor = reportDeltaColor(row[column.key]);
      doc.setTextColor(
        `#${deltaColor ?? (variationRow ? MUTED_TEXT : DARK_TEXT)}`,
      );
      doc.setFont("helvetica", variationRow ? "bold" : "normal");
      doc.setFontSize(tableFontSize);
      const lines = linesByColumn[index];
      const textY =
        y +
        (rowHeight - lines.length * lineHeight) / 2 +
        tableFontSize;
      doc.text(
        lines,
        column.numeric ? x + widths[index] - cellPadding : x + cellPadding,
        textY,
        {
          align: column.numeric ? "right" : "left",
          lineHeightFactor: lineHeight / tableFontSize,
        },
      );
      x += widths[index];
    });
    y += rowHeight;
  });
}

function limitPdfLines(
  doc: import("jspdf").jsPDF,
  text: string,
  maxWidth: number,
  maxLines: number,
) {
  const lines = doc.splitTextToSize(text || " ", maxWidth) as string[];
  if (lines.length <= maxLines) return lines;

  const visible = lines.slice(0, maxLines);
  visible[maxLines - 1] = fitPdfText(
    doc,
    `${visible[maxLines - 1]}...`,
    maxWidth,
  );
  return visible;
}

function fitPdfText(
  doc: import("jspdf").jsPDF,
  text: string,
  maxWidth: number,
) {
  if (!text || doc.getTextWidth(text) <= maxWidth) return text;

  const suffix = "...";
  let value = text;
  while (value.length && doc.getTextWidth(`${value}${suffix}`) > maxWidth) {
    value = value.slice(0, -1);
  }

  return value ? `${value}${suffix}` : "";
}

function drawPdfText(
  doc: import("jspdf").jsPDF,
  text: string,
  x: number,
  y: number,
  size: number,
  color: string,
  bold = false,
) {
  doc.setFont("helvetica", bold ? "bold" : "normal");
  doc.setFontSize(size);
  doc.setTextColor(`#${color}`);
  doc.text(text, x, y);
}

function drawPdfNoteBox(
  doc: import("jspdf").jsPDF,
  text: string,
  x: number,
  y: number,
  width = doc.internal.pageSize.getWidth() - 84,
) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  const lines = doc.splitTextToSize(text, width - 20) as string[];
  const height = Math.max(24, 12 + lines.length * 11);

  doc.setFillColor(`#${SOFT_BLUE}`);
  doc.setDrawColor(`#${BORDER}`);
  doc.roundedRect(x, y, width, height, 5, 5, "FD");
  doc.setTextColor(`#${BRAND_BLUE}`);
  doc.text(lines, x + 10, y + 14);

  return height;
}

function withExportBarValueLabels(
  option: EnterpriseChartOption,
): EnterpriseChartOption {
  const series = (option as { series?: unknown }).series;
  if (!series) return option;
  const seriesList = Array.isArray(series) ? series : [series];
  const barSeries = seriesList.filter(
    (item) =>
      item && typeof item === "object" && (item as { type?: unknown }).type === "bar",
  );
  const pointCount = barSeries.reduce((sum, item) => {
    const data = (item as { data?: unknown }).data;
    return sum + (Array.isArray(data) ? data.length : 0);
  }, 0);
  const horizontal =
    axisType((option as { xAxis?: unknown }).xAxis) === "value" &&
    axisType((option as { yAxis?: unknown }).yAxis) === "category";
  const dense = pointCount > 24;

  return {
    ...option,
    grid:
      option.grid && !Array.isArray(option.grid)
          ? {
            ...option.grid,
            top: exportGridTop(option.grid.top, dense, horizontal),
          }
        : option.grid,
    series: Array.isArray(series)
      ? series.map((item) => addExportBarValueLabel(item, dense, horizontal))
      : addExportBarValueLabel(series, dense, horizontal),
  } as EnterpriseChartOption;
}

function axisType(axis: unknown) {
  const firstAxis = Array.isArray(axis) ? axis[0] : axis;
  return firstAxis && typeof firstAxis === "object"
    ? (firstAxis as { type?: unknown }).type
    : undefined;
}

function exportGridTop(value: unknown, dense: boolean, horizontal: boolean) {
  const numericValue =
    typeof value === "number" ? value : Number(String(value ?? ""));
  const minimum = horizontal ? 22 : dense ? 72 : 48;

  return Number.isFinite(numericValue) ? Math.max(numericValue, minimum) : minimum;
}

function addExportBarValueLabel(
  series: unknown,
  dense: boolean,
  horizontal: boolean,
) {
  if (!series || typeof series !== "object") return series;

  const record = series as Record<string, unknown>;
  if (record.type !== "bar") return series;

  return {
    ...record,
    label: {
      ...(record.label && typeof record.label === "object" ? record.label : {}),
      color: "#13233A",
      distance: dense ? 3 : 5,
      fontSize: dense ? 7 : 9,
      fontWeight: 600,
      formatter: (params: { value?: unknown }) =>
        formatBarLabelValue(params.value),
      position: horizontal ? "right" : "top",
      rotate: horizontal ? 0 : dense ? 90 : 0,
      show: true,
    },
    labelLayout: {
      ...(record.labelLayout && typeof record.labelLayout === "object"
        ? record.labelLayout
        : {}),
      hideOverlap: true,
    },
  };
}

function formatBarLabelValue(value: unknown) {
  const rawValue = Array.isArray(value) ? value[value.length - 1] : value;
  const numericValue =
    typeof rawValue === "number" ? rawValue : Number(String(rawValue ?? ""));

  if (!Number.isFinite(numericValue)) return "";
  if (numericValue === 0) return "";
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(
    numericValue,
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeSheetName(value: string) {
  return value.replace(/[\]\\/*?:[\]]/g, " ").slice(0, 31).trim() || "Relatório";
}

function safeFilename(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(value);
}

function formatCellValue(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return new Intl.NumberFormat("pt-BR").format(value);
  return value;
}

function reportDeltaColor(value: string | number | null | undefined) {
  if (typeof value !== "string" || !value.trim().endsWith("%")) return null;

  const numeric = Number(
    value
      .trim()
      .slice(0, -1)
      .replace(/\./g, "")
      .replace(",", ".")
      .replace("+", ""),
  );
  if (!Number.isFinite(numeric) || numeric === 0) return null;
  return numeric > 0 ? POSITIVE_TEXT : NEGATIVE_TEXT;
}

function labelFont() {
  return { bold: true, color: { argb: `FF${MUTED_TEXT}` }, size: 9 };
}

function valueFont() {
  return { bold: true, color: { argb: `FF${DARK_TEXT}` }, size: 10 };
}

function softFill() {
  return {
    fgColor: { argb: "FFF8FBFF" },
    pattern: "solid" as const,
    type: "pattern" as const,
  };
}

function softBorder() {
  return {
    bottom: { color: { argb: `FF${BORDER}` }, style: "thin" as const },
    left: { color: { argb: `FF${BORDER}` }, style: "thin" as const },
    right: { color: { argb: `FF${BORDER}` }, style: "thin" as const },
    top: { color: { argb: `FF${BORDER}` }, style: "thin" as const },
  };
}
