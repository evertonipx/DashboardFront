"use client";

import type { EnterpriseChartOption } from "@/components/app/echart";
import {
  CHART_VALUE_LABEL_ANGLE,
  chartValueLabelRightPadding,
  chartValueLabelTopPadding,
  composeChartValueLabelLayout,
} from "@/lib/chart-value-labels";

async function renderEChartToDataUrl(
  option: EnterpriseChartOption,
  dimensions?: { width?: number; height?: number; signal?: AbortSignal },
) {
  dimensions?.signal?.throwIfAborted();
  const chartRuntime = await import("@/components/app/echart");
  dimensions?.signal?.throwIfAborted();
  return chartRuntime.renderEChartToDataUrl(option, dimensions);
}

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
  /** @deprecated Mantido apenas para compatibilidade com payloads antigos. */
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
  /** `null` means that the source did not certify a temporal cut-off. */
  dataCompleteUntil: Date | null;
  /** Certified IANA time zone used for every civil date printed in the report. */
  timeZone?: string;
  context?: string[];
  metrics: ReportMetric[];
  charts: ReportChart[];
  tables?: ReportTable[];
};

export type ReportExportMode = "complete" | "charts" | "data";

type ReportExportOptions = {
  mode?: ReportExportMode;
  signal?: AbortSignal;
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
  options.signal?.throwIfAborted();
  const exportedAt = new Date();
  const ExcelJS = (await import("exceljs")).default;
  options.signal?.throwIfAborted();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "IPXData";
  workbook.created = exportedAt;
  workbook.modified = exportedAt;
  workbook.properties.date1904 = false;

  const summary = workbook.addWorksheet("Resumo", {
    headerFooter: excelHeaderFooter(payload.title),
    pageSetup: {
      fitToPage: true,
      fitToHeight: 0,
      fitToWidth: 1,
      horizontalCentered: true,
      margins: excelPageMargins(),
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

  if (mode !== "charts") {
    buildExcelMetrics(summary, payload.metrics, summaryContentStartRow);
  }

  for (const [index, chart] of payload.charts.entries()) {
    options.signal?.throwIfAborted();
    if (mode !== "data") {
      const chartSheet = workbook.addWorksheet(
        safeSheetName(`Gráfico ${index + 1} ${chart.title}`),
        {
          headerFooter: excelHeaderFooter(payload.title),
          pageSetup: {
            fitToPage: true,
            fitToHeight: 1,
            fitToWidth: 1,
            horizontalCentered: true,
            margins: excelPageMargins(),
            orientation: "landscape",
            paperSize: 9,
          },
          views: [{ showGridLines: false }],
        },
      );
      const chartSheetColumnCount = 8;
      chartSheet.columns = Array.from(
        { length: chartSheetColumnCount },
        (_, columnIndex) => ({
          key: `__chart_canvas_${columnIndex}`,
          width: 14,
        }),
      );
      chartSheet.mergeCells(1, 1, 1, chartSheetColumnCount);
      const titleCell = chartSheet.getCell(1, 1);
      titleCell.value = chart.title;
      titleCell.font = {
        bold: true,
        color: { argb: `FF${DARK_TEXT}` },
        size: 16,
      };
      chartSheet.getRow(1).height = 24;

      chartSheet.mergeCells(2, 1, 2, chartSheetColumnCount);
      const descCell = chartSheet.getCell(2, 1);
      const chartDescription = [
        chart.description,
        chart.comparison,
        chartExportDensityNote(chart),
      ]
        .filter(Boolean)
        .join(" | ");
      descCell.value = chartDescription;
      descCell.font = { color: { argb: `FF${MUTED_TEXT}` }, size: 10 };
      descCell.alignment = { vertical: "top", wrapText: true };
      chartSheet.getRow(2).height = excelTextRowHeight(
        chartDescription,
        chartSheetColumnCount * 14,
        22,
        48,
      );

      chartSheet.mergeCells(3, 1, 3, chartSheetColumnCount);
      const completeCell = chartSheet.getCell(3, 1);
      completeCell.value = `Dados gerados em ${formatReportDateTime(payload, payload.generatedAt)} · ${reportCompletenessLabel(payload)}`;
      completeCell.font = { color: { argb: `FF${MUTED_TEXT}` }, size: 10 };
      completeCell.alignment = { vertical: "top", wrapText: true };

      chartSheet.mergeCells(4, 1, 4, chartSheetColumnCount);
      const exportCell = chartSheet.getCell(4, 1);
      exportCell.value = `Arquivo exportado em ${formatReportDateTime(payload, exportedAt)}`;
      exportCell.font = { color: { argb: `FF${MUTED_TEXT}` }, size: 9 };

      const dataUrl = await renderEChartToDataUrl(
        withExportBarValueLabels(chart.option),
        { height: 400, signal: options.signal, width: 900 },
      );
      options.signal?.throwIfAborted();
      const imageId = workbook.addImage({
        base64: dataUrl,
        extension: "png",
      });
      chartSheet.addImage(imageId, {
        ext: { height: 327, width: 735 },
        tl: { col: 0, row: 5 },
      });
      chartSheet.pageSetup.printArea = "A1:H23";
    }

    if (mode !== "charts") {
      const dataSheet = workbook.addWorksheet(
        safeSheetName(`Dados ${index + 1} ${chart.table.title}`),
        {
          headerFooter: excelHeaderFooter(payload.title),
          pageSetup: {
            fitToPage: false,
            fitToHeight: 0,
            fitToWidth: 0,
            horizontalCentered: true,
            margins: excelPageMargins(),
            orientation: "landscape",
            paperSize: 9,
            scale: 90,
          },
          views: [{ showGridLines: false }],
        },
      );
      dataSheet.columns = chart.table.columns.map((column) => ({
        key: column.key,
        width: column.width ?? 20,
      }));
      const tableStartRow = buildExcelDataSheetHeader(
        dataSheet,
        payload,
        chart.title,
        exportedAt,
        [chart.description, chart.comparison].filter(Boolean).join(" | "),
      );
      buildExcelTable(dataSheet, chart.table, tableStartRow);
    }
  }

  for (const [index, table] of reportTablesForMode(
    payload.tables,
    mode,
    payload.charts,
  ).entries()) {
    options.signal?.throwIfAborted();
    const sheet = workbook.addWorksheet(
      safeSheetName(`Anexo ${index + 1} ${table.title}`),
      {
        headerFooter: excelHeaderFooter(payload.title),
        pageSetup: {
          fitToPage: false,
          fitToHeight: 0,
          fitToWidth: 0,
          horizontalCentered: true,
          margins: excelPageMargins(),
          orientation: "landscape",
          paperSize: 9,
          scale: 90,
        },
        views: [{ showGridLines: false }],
      },
    );
    sheet.columns = table.columns.map((column) => ({
      key: column.key,
      width: column.width ?? 20,
    }));
    const tableStartRow = buildExcelDataSheetHeader(
      sheet,
      payload,
      table.title,
      exportedAt,
    );
    buildExcelTable(sheet, table, tableStartRow);
  }

  options.signal?.throwIfAborted();
  const buffer = await workbook.xlsx.writeBuffer();
  options.signal?.throwIfAborted();
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
  options.signal?.throwIfAborted();
  const exportedAt = new Date();
  const { jsPDF } = await import("jspdf");
  options.signal?.throwIfAborted();
  const doc = new jsPDF({
    format: "a4",
    orientation: "landscape",
    unit: "pt",
  });
  doc.setProperties({
    author: "IPXData",
    creator: "IPXData",
    keywords: "IPXData, relatório executivo, inteligência operacional",
    subject: payload.subtitle ?? "Relatório executivo",
    title: payload.title,
  });

  drawPdfCover(doc, payload, mode, exportedAt);
  drawPdfExecutiveAppendices(doc, payload, mode);
  const annexTables = reportTablesForMode(payload.tables, mode, payload.charts);

  if (mode !== "data") {
    for (const [index, chart] of payload.charts.entries()) {
      options.signal?.throwIfAborted();
      addPdfLandscapePage(doc);
      drawPdfPageHeader(
        doc,
        payload.title,
        chart.title,
        `GRÁFICO ${index + 1} DE ${payload.charts.length}`,
      );
      let chartTop = drawPdfSectionMetadata(
        doc,
        payload,
        chart.description,
      );
      const densityNote = chartExportDensityNote(chart);
      if (densityNote) {
        chartTop += drawPdfNoteBox(doc, densityNote, 42, chartTop) + 10;
      }
      if (chart.comparison) {
        chartTop += drawPdfNoteBox(doc, chart.comparison, 42, chartTop) + 10;
      }

      const image = await renderEChartToDataUrl(
        withExportBarValueLabels(chart.option),
        {
          height: 400,
          signal: options.signal,
          width: 900,
        },
      );
      options.signal?.throwIfAborted();
      drawPdfChartImage(doc, image, chartTop);
    }
  }

  if (mode !== "charts") {
    for (const [index, chart] of payload.charts.entries()) {
      options.signal?.throwIfAborted();
      addPdfLandscapePage(doc);
      drawPdfPageHeader(
        doc,
        payload.title,
        chart.table.title,
        `DADOS DO GRÁFICO ${index + 1} DE ${payload.charts.length}`,
      );
      let tableTop = drawPdfSectionMetadata(
        doc,
        payload,
        chartTableDescription(chart),
      );
      if (chart.comparison) {
        tableTop += drawPdfNoteBox(doc, chart.comparison, 42, tableTop) + 10;
      }
      drawPdfTable(doc, chart.table, tableTop, payload, true);
    }
  }

  for (const [index, table] of annexTables.entries()) {
    options.signal?.throwIfAborted();
    addPdfLandscapePage(doc);
    drawPdfPageHeader(
      doc,
      payload.title,
      table.title,
      `ANEXO ${index + 1} DE ${annexTables.length}`,
    );
    const tableTop = drawPdfSectionMetadata(
      doc,
      payload,
      table.description,
    );
    drawPdfTable(doc, table, tableTop, payload, true);
  }

  options.signal?.throwIfAborted();
  drawPdfPageFooters(doc, payload, exportedAt);
  options.signal?.throwIfAborted();
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

  sheet.getCell("A4").value = "Dados gerados em";
  sheet.getCell("B4").value = formatReportDateTime(payload, payload.generatedAt);
  sheet.getCell("A4").font = labelFont();
  sheet.getCell("B4").font = valueFont();

  sheet.getCell("A5").value = "Arquivo exportado em";
  sheet.getCell("B5").value = formatReportDateTime(payload, exportedAt);
  sheet.getCell("A5").font = labelFont();
  sheet.getCell("B5").font = valueFont();

  sheet.getCell("A6").value = "Atualizado até";
  sheet.getCell("B6").value = reportCompletenessValue(payload);
  sheet.getCell("A6").font = labelFont();
  sheet.getCell("B6").font = valueFont();

  sheet.getCell("A7").value = "Conteúdo";
  sheet.getCell("B7").value = modeLabel(mode);
  sheet.getCell("A7").font = labelFont();
  sheet.getCell("B7").font = valueFont();

  payload.context?.forEach((item, index) => {
    const row = 8 + index;
    sheet.getCell(row, 1).value = item;
    sheet.mergeCells(row, 1, row, 5);
    sheet.getCell(row, 1).font = { color: { argb: `FF${MUTED_TEXT}` }, size: 10 };
    sheet.getCell(row, 1).alignment = { vertical: "top", wrapText: true };
    sheet.getRow(row).height = excelTextRowHeight(
      item,
      excelColumnsWidth(sheet, 5),
      22,
      52,
    );
  });

  return 9 + (payload.context?.length ?? 0);
}

function buildExcelDataSheetHeader(
  sheet: import("exceljs").Worksheet,
  payload: ReportPayload,
  sectionTitle: string,
  exportedAt: Date,
  description?: string,
): number {
  const lastColumn = Math.max(1, sheet.columnCount);
  if (lastColumn > 1) sheet.mergeCells(1, 1, 1, lastColumn);
  sheet.getCell(1, 1).value = payload.title;
  sheet.getCell(1, 1).font = {
    bold: true,
    color: { argb: `FF${DARK_TEXT}` },
    size: 16,
  };
  sheet.getRow(1).height = 24;

  if (lastColumn > 1) sheet.mergeCells(2, 1, 2, lastColumn);
  sheet.getCell(2, 1).value = sectionTitle;
  sheet.getCell(2, 1).font = {
    bold: true,
    color: { argb: `FF${BRAND_BLUE}` },
    size: 11,
  };

  let metadataRow = 3;
  if (description?.trim()) {
    if (lastColumn > 1) sheet.mergeCells(3, 1, 3, lastColumn);
    sheet.getCell(3, 1).value = description;
    sheet.getCell(3, 1).font = {
      color: { argb: `FF${MUTED_TEXT}` },
      size: 9,
    };
    sheet.getCell(3, 1).alignment = { vertical: "top", wrapText: true };
    sheet.getRow(3).height = excelTextRowHeight(
      description,
      excelColumnsWidth(sheet, lastColumn),
      30,
      64,
    );
    metadataRow = 4;
  }

  if (lastColumn > 1) {
    sheet.mergeCells(metadataRow, 1, metadataRow, lastColumn);
  }
  const metadata = `Dados gerados em ${formatReportDateTime(payload, payload.generatedAt)} · ${reportCompletenessLabel(payload)} · Arquivo exportado em ${formatReportDateTime(payload, exportedAt)}`;
  sheet.getCell(metadataRow, 1).value = metadata;
  sheet.getCell(metadataRow, 1).font = {
    color: { argb: `FF${MUTED_TEXT}` },
    size: 9,
  };
  sheet.getCell(metadataRow, 1).alignment = {
    vertical: "top",
    wrapText: true,
  };
  sheet.getRow(metadataRow).height = excelTextRowHeight(
    metadata,
    excelColumnsWidth(sheet, lastColumn),
    28,
    76,
  );

  return metadataRow + 3;
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
    sheet.getCell(row + 1, col).value = metric.value;
    sheet.getCell(row + 2, col).value = metric.description ?? "";
    sheet.getCell(row, col).font = labelFont();
    sheet.getCell(row + 1, col).font = {
      bold: true,
      color: { argb: `FF${BRAND_BLUE}` },
      size: 16,
    };
    if (typeof metric.value === "number") {
      sheet.getCell(row + 1, col).numFmt = excelNumberFormat(metric.value);
    }
    sheet.getCell(row + 2, col).font = {
      color: { argb: `FF${MUTED_TEXT}` },
      size: 9,
    };
    sheet.getCell(row, col).alignment = {
      vertical: "middle",
      wrapText: true,
    };
    sheet.getCell(row + 1, col).alignment = {
      vertical: "middle",
      wrapText: true,
    };
    sheet.getCell(row + 2, col).alignment = {
      vertical: "top",
      wrapText: true,
    };
    sheet.getRow(row).height = Math.max(sheet.getRow(row).height ?? 0, 20);
    sheet.getRow(row + 1).height = Math.max(
      sheet.getRow(row + 1).height ?? 0,
      25,
    );
    sheet.getRow(row + 2).height = Math.max(
      sheet.getRow(row + 2).height ?? 0,
      excelTextRowHeight(
        metric.description ?? "",
        Number(sheet.getColumn(col).width ?? 10) +
          Number(sheet.getColumn(col + 1).width ?? 10),
        30,
        64,
      ),
    );
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
    sheet.getRow(startRow + 1).height = excelTextRowHeight(
      table.description,
      excelColumnsWidth(sheet, lastColumn),
      28,
      64,
    );
  }

  const headerRow = sheet.getRow(startRow + 3);
  headerRow.height = 36;
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
  sheet.autoFilter = {
    from: { column: 1, row: startRow + 3 },
    to: {
      column: lastColumn,
      row: startRow + 3 + Math.max(0, table.rows.length),
    },
  };
  sheet.pageSetup.printTitlesRow = `${startRow + 3}:${startRow + 3}`;
  if (table.columns.length > 6) {
    sheet.pageSetup.printTitlesColumn = "A:A";
  }

  table.rows.forEach((row, rowIndex) => {
    const excelRow = sheet.getRow(startRow + 4 + rowIndex);
    excelRow.height = excelTableRowHeight(row, table.columns);
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
        cell.numFmt = excelNumberFormat(value);
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

function excelColumnsWidth(
  sheet: import("exceljs").Worksheet,
  lastColumn: number,
) {
  let width = 0;
  for (let index = 1; index <= lastColumn; index += 1) {
    width += Number(sheet.getColumn(index).width ?? 10);
  }
  return width;
}

function excelTextRowHeight(
  text: string,
  width: number,
  minimum: number,
  maximum: number,
) {
  if (!text.trim()) return minimum;
  const charactersPerLine = Math.max(10, Math.floor(width * 1.2));
  const lines = Math.max(1, Math.ceil(text.length / charactersPerLine));
  return Math.min(maximum, Math.max(minimum, 10 + lines * 12));
}

function excelTableRowHeight(
  row: ReportTableRow,
  columns: ReportTableColumn[],
) {
  const estimatedLines = columns.reduce((maximum, column) => {
    if (column.numeric) return maximum;
    const value = formatCellValue(row[column.key]);
    const charactersPerLine = Math.max(8, Math.floor((column.width ?? 18) * 1.35));
    return Math.max(maximum, Math.ceil(value.length / charactersPerLine));
  }, 1);
  return Math.min(
    90,
    Math.max(23, 11 + Math.min(estimatedLines, 6) * 12),
  );
}

function excelNumberFormat(value: number) {
  return Number.isInteger(value)
    ? "#,##0;[Red]-#,##0"
    : "#,##0.0########;[Red]-#,##0.0########";
}

function excelPageMargins() {
  return {
    bottom: 0.45,
    footer: 0.2,
    header: 0.2,
    left: 0.35,
    right: 0.35,
    top: 0.45,
  };
}

function excelHeaderFooter(reportTitle: string) {
  const safeTitle = reportTitle.replace(/&/g, "&&").slice(0, 120);
  return {
    oddFooter: `&LIPXData · ${safeTitle}&C&P de &N&RConfidencial`,
  };
}

function drawPdfCover(
  doc: import("jspdf").jsPDF,
  payload: ReportPayload,
  mode: ReportExportMode,
  exportedAt: Date,
) {
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const contentWidth = width - 84;
  doc.setFillColor(`#${BRAND_BLUE}`);
  doc.rect(0, 0, width, 16, "F");

  drawPdfText(doc, "IPXData", 42, 48, 12, BRAND_BLUE, true);
  drawPdfFittedText(
    doc,
    payload.title,
    42,
    82,
    contentWidth,
    24,
    DARK_TEXT,
    true,
    16,
  );
  const subtitleHeight = drawPdfParagraph(
    doc,
    payload.subtitle ?? "Relatório executivo",
    42,
    108,
    contentWidth,
    12,
    MUTED_TEXT,
    false,
    2,
    15,
  );
  let contentY = 108 + subtitleHeight + 10;
  const coverContextLimit = mode === "charts" ? 3 : 2;
  drawPdfText(
    doc,
    `Dados gerados em ${formatReportDateTime(payload, payload.generatedAt)}`,
    42,
    contentY,
    10,
    MUTED_TEXT,
  );
  contentY += 18;
  drawPdfText(
    doc,
    `Arquivo exportado em ${formatReportDateTime(payload, exportedAt)}`,
    42,
    contentY,
    10,
    MUTED_TEXT,
  );
  contentY += 18;
  drawPdfText(doc, reportCompletenessLabel(payload), 42, contentY, 10, MUTED_TEXT);
  contentY += 18;
  drawPdfText(doc, `Conteúdo: ${modeLabel(mode)}`, 42, contentY, 10, MUTED_TEXT);
  contentY += 18;

  payload.context?.slice(0, coverContextLimit).forEach((item) => {
    const boxHeight = drawPdfNoteBox(doc, item, 42, contentY);
    contentY += boxHeight + 6;
  });
  if ((payload.context?.length ?? 0) > coverContextLimit) {
    drawPdfText(
      doc,
      `Contexto completo na próxima página · + ${(payload.context?.length ?? 0) - coverContextLimit} item(ns)`,
      52,
      contentY + 4,
      8,
      MUTED_TEXT,
    );
    contentY += 16;
  }

  const cardWidth = (width - 84 - 36) / 4;
  if (mode === "charts") return;
  const metricsY = Math.max(202, contentY + 8);
  const cardHeight = Math.max(
    78,
    Math.min(84, (height - metricsY - 54) / 2 - 6),
  );

  payload.metrics.slice(0, 8).forEach((metric, index) => {
    const col = index % 4;
    const row = Math.floor(index / 4);
    const x = 42 + col * (cardWidth + 12);
    const y = metricsY + row * (cardHeight + 10);
    doc.setFillColor("#F8FBFF");
    doc.setDrawColor(`#${BORDER}`);
    doc.roundedRect(x, y, cardWidth, cardHeight, 6, 6, "FD");
    drawPdfFittedText(
      doc,
      metric.label.toUpperCase(),
      x + 12,
      y + 19,
      cardWidth - 24,
      8,
      MUTED_TEXT,
      true,
      7,
    );
    drawPdfFittedText(
      doc,
      String(metric.value),
      x + 12,
      y + 43,
      cardWidth - 24,
      17,
      BRAND_BLUE,
      true,
      10,
    );
    drawPdfParagraph(
      doc,
      metric.description ?? "",
      x + 12,
      y + 59,
      cardWidth - 24,
      7.5,
      MUTED_TEXT,
      false,
      2,
      9,
    );
  });

  if (payload.metrics.length > 8) {
    drawPdfText(
      doc,
      `Indicadores 9–${payload.metrics.length} na página executiva seguinte`,
      42,
      height - 43,
      8,
      MUTED_TEXT,
      true,
    );
  }
}

function drawPdfExecutiveAppendices(
  doc: import("jspdf").jsPDF,
  payload: ReportPayload,
  mode: ReportExportMode,
) {
  const context = payload.context ?? [];
  const coverContextLimit = mode === "charts" ? 3 : 2;
  if (context.length > coverContextLimit) {
    drawPdfContextPages(doc, payload, context);
  }

  if (mode !== "charts" && payload.metrics.length > 8) {
    addPdfLandscapePage(doc);
    drawPdfPageHeader(
      doc,
      payload.title,
      "Indicadores executivos · continuação",
      `INDICADORES 9–${payload.metrics.length}`,
    );
    const tableTop = drawPdfSectionMetadata(
      doc,
      payload,
      "Indicadores adicionais preservados integralmente após os oito destaques da capa.",
    );
    drawPdfTable(
      doc,
      {
        columns: [
          { key: "indicator", label: "Indicador", width: 24 },
          { key: "value", label: "Valor", width: 16 },
          { key: "description", label: "Contexto", width: 42 },
        ],
        description:
          "Continuação dos indicadores executivos apresentados na capa.",
        rows: payload.metrics.slice(8).map((metric) => ({
          description: metric.description ?? "—",
          indicator: metric.label,
          value: metric.value,
        })),
        title: "Indicadores adicionais",
      },
      tableTop,
      payload,
      true,
    );
  }
}

function drawPdfContextPages(
  doc: import("jspdf").jsPDF,
  payload: ReportPayload,
  context: string[],
) {
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();
  const boxWidth = pageWidth - 84;
  let pageIndex = 1;
  let y = 90;

  const startPage = () => {
    addPdfLandscapePage(doc);
    drawPdfPageHeader(
      doc,
      payload.title,
      "Contexto e critérios",
      pageIndex === 1 ? "GOVERNANÇA DO RELATÓRIO" : "CONTINUAÇÃO",
    );
    y = 90;
    pageIndex += 1;
  };

  startPage();
  context.forEach((item, index) => {
    const text = `${index + 1}. ${item}`;
    const boxHeight = measurePdfNoteBoxHeight(doc, text, boxWidth, 8);
    if (y + boxHeight > pageHeight - 54) startPage();
    y += drawPdfNoteBox(doc, text, 42, y, boxWidth, 8) + 8;
  });
}

function certifiedDataCompleteUntil(payload: ReportPayload) {
  const value = payload.dataCompleteUntil;
  return value instanceof Date && Number.isFinite(value.getTime())
    ? value
    : null;
}

function reportCompletenessLabel(payload: ReportPayload) {
  const value = certifiedDataCompleteUntil(payload);
  return value
    ? `Dados atualizados até ${formatReportDateTime(payload, value)}`
    : "Atualização dos dados não informada";
}

function reportCompletenessValue(payload: ReportPayload) {
  const value = certifiedDataCompleteUntil(payload);
  return value ? formatReportDateTime(payload, value) : "Não informada";
}

function modeLabel(mode: ReportExportMode) {
  if (mode === "charts") return "Somente gráficos";
  if (mode === "data") return "Somente dados";
  return "Completo";
}

function reportTablesForMode(
  tables: ReportTable[] | undefined,
  mode: ReportExportMode,
  charts: ReportChart[] = [],
) {
  const availableTables = tables ?? [];
  if (mode === "charts") return [];
  const chartTableSignatures = new Set(
    charts.map((chart) => reportTableDataSignature(chart.table)),
  );
  return availableTables.filter(
    (table) => !chartTableSignatures.has(reportTableDataSignature(table)),
  );
}

function reportTableDataSignature(table: ReportTable) {
  const keys = table.columns.map((column) => column.key);
  return JSON.stringify({
    columns: keys,
    rows: table.rows.map((row) => keys.map((key) => row[key] ?? null)),
  });
}

function drawPdfPageHeader(
  doc: import("jspdf").jsPDF,
  reportTitle: string,
  pageTitle: string,
  eyebrow?: string,
) {
  const width = doc.internal.pageSize.getWidth();
  doc.setFillColor(`#${BRAND_BLUE}`);
  doc.rect(0, 0, width, 12, "F");
  drawPdfFittedText(doc, reportTitle, 42, 40, width - 300, 9, MUTED_TEXT, true, 8);
  if (eyebrow) {
    drawPdfFittedText(
      doc,
      eyebrow,
      width - 42,
      40,
      216,
      8,
      BRAND_BLUE,
      true,
      7,
      "right",
    );
  }
  drawPdfFittedText(doc, pageTitle, 42, 64, width - 84, 18, DARK_TEXT, true, 12);
}

function addPdfLandscapePage(doc: import("jspdf").jsPDF) {
  doc.addPage("a4", "landscape");
}

function chartTableDescription(chart: ReportChart) {
  return Array.from(
    new Set(
      [chart.description, chart.table.description]
        .filter((value): value is string => Boolean(value?.trim()))
        .map((value) => value.trim()),
    ),
  ).join(" · ");
}

function chartExportDensityNote(chart: ReportChart) {
  const rawSeries = (chart.option as { series?: unknown }).series;
  const series = Array.isArray(rawSeries) ? rawSeries : [rawSeries];
  const hasHeatmap = series.some(
    (item) =>
      item &&
      typeof item === "object" &&
      (item as { type?: unknown }).type === "heatmap",
  );
  if (hasHeatmap) {
    return "Mapa de calor: a cor sintetiza a intensidade; os valores exatos permanecem na tabela de dados.";
  }
  const maximumPointCount = series.reduce((maximum, item) => {
    if (!item || typeof item !== "object") return maximum;
    const data = (item as { data?: unknown }).data;
    return Math.max(maximum, Array.isArray(data) ? data.length : 0);
  }, 0);
  return maximumPointCount > 36
    ? "Série densa: rótulos espaçados para leitura; todos os valores permanecem na tabela de dados."
    : undefined;
}

function drawPdfSectionMetadata(
  doc: import("jspdf").jsPDF,
  payload: ReportPayload,
  description?: string,
) {
  const width = doc.internal.pageSize.getWidth() - 84;
  let y = 86;
  if (description?.trim()) {
    y += drawPdfParagraph(
      doc,
      description,
      42,
      y,
      width,
      10.5,
      MUTED_TEXT,
      false,
      4,
      13,
    );
    y += 5;
  }
  drawPdfText(doc, reportCompletenessLabel(payload), 42, y, 9, MUTED_TEXT);
  return y + 18;
}

function drawPdfChartImage(
  doc: import("jspdf").jsPDF,
  image: string,
  chartTop: number,
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const outerWidth = pageWidth - 84;
  const outerHeight = Math.max(180, pageHeight - chartTop - 54);
  const inset = 8;
  const maximumImageWidth = outerWidth - inset * 2;
  const maximumImageHeight = outerHeight - inset * 2;
  const sourceRatio = 900 / 400;
  let imageWidth = maximumImageWidth;
  let imageHeight = imageWidth / sourceRatio;
  if (imageHeight > maximumImageHeight) {
    imageHeight = maximumImageHeight;
    imageWidth = imageHeight * sourceRatio;
  }
  const outerX = 42;
  const outerY = chartTop;
  const imageX = outerX + (outerWidth - imageWidth) / 2;
  const imageY = outerY + inset;

  doc.setFillColor("#FFFFFF");
  doc.setDrawColor(`#${BORDER}`);
  doc.roundedRect(outerX, outerY, outerWidth, imageHeight + inset * 2, 5, 5, "FD");
  doc.addImage(
    image,
    "PNG",
    imageX,
    imageY,
    imageWidth,
    imageHeight,
    undefined,
    "MEDIUM",
  );
}

function drawPdfTable(
  doc: import("jspdf").jsPDF,
  table: ReportTable,
  startY: number,
  payload: ReportPayload,
  fullPage = false,
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 42;
  const tableWidth = pageWidth - margin * 2;
  const bands = splitPdfTableColumns(
    doc,
    table.columns,
    tableWidth,
    table.rows,
  );
  const tableFontSize = 8.25;
  const headerFontSize = 8.25;
  const lineHeight = 10.25;
  const headerLineHeight = 10;
  const cellPadding = 4.5;
  const minimumRowHeight = fullPage ? 21 : 19;

  bands.forEach((band, bandIndex) => {
    let y = startY;
    if (bandIndex > 0) {
      addPdfLandscapePage(doc);
      drawPdfPageHeader(
        doc,
        payload.title,
        table.title,
        band.label.toUpperCase(),
      );
      y = drawPdfSectionMetadata(
        doc,
        payload,
        [table.description, band.label].filter(Boolean).join(" · "),
      );
    } else if (!fullPage) {
      drawPdfText(doc, table.title, margin, y - 10, 10, DARK_TEXT, true);
    }

    const columns = band.columns;
    const widths = resolvePdfTableColumnWidths(
      doc,
      columns,
      tableWidth,
      table.rows,
    );
    const headerLines = columns.map((column, index) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(headerFontSize);
      return limitPdfLines(
        doc,
        column.label,
        Math.max(1, widths[index] - cellPadding * 2),
        3,
      );
    });
    const headerHeight = Math.max(
      25,
      Math.max(...headerLines.map((lines) => lines.length), 1) *
        headerLineHeight +
        cellPadding * 2,
    );

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

    function continueTable(rowIndex: number) {
      addPdfLandscapePage(doc);
      drawPdfPageHeader(
        doc,
        payload.title,
        table.title,
        bands.length > 1
          ? `${band.label.toUpperCase()} · CONTINUAÇÃO`
          : "CONTINUAÇÃO",
      );
      y = drawPdfSectionMetadata(
        doc,
        payload,
        `${band.label}${table.rows.length ? ` · linhas ${rowIndex + 1}–${table.rows.length}` : ""}`,
      );
      drawHeader();
    }

    if (y + headerHeight + minimumRowHeight > pageHeight - 54) {
      continueTable(0);
    } else {
      drawHeader();
    }

    table.rows.forEach((row, rowIndex) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(tableFontSize);
      const contentByColumn = columns.map((column, index) => {
        const text = formatCellValue(row[column.key]);
        const availableWidth = Math.max(1, widths[index] - cellPadding * 2);
        if (column.numeric) {
          return {
            fontSize: fitPdfTableCellFontSize(
              doc,
              text,
              availableWidth,
              tableFontSize,
            ),
            lines: [text],
          };
        }
        // A continuation page can spend up to ~210pt on title, metadata and
        // the repeated header. Bound the cell by the real remaining body so a
        // single verbose row can never invade the executive footer.
        const maximumLines = Math.max(
          4,
          Math.floor(
            (pageHeight - 54 - 210 - cellPadding * 2) / lineHeight,
          ),
        );
        return {
          fontSize: tableFontSize,
          lines: limitPdfLines(doc, text, availableWidth, maximumLines),
        };
      });
      const rowHeight = Math.max(
        minimumRowHeight,
        Math.max(...contentByColumn.map((content) => content.lines.length), 1) *
          lineHeight +
          cellPadding * 2,
      );
      if (y + rowHeight > pageHeight - 54) continueTable(rowIndex);

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
        const content = contentByColumn[index];
        doc.setFontSize(content.fontSize);
        const lines = content.lines;
        const textY =
          y +
          (rowHeight - lines.length * lineHeight) / 2 +
          content.fontSize;
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
  });
}

type PdfTableColumnBand = {
  columns: ReportTableColumn[];
  label: string;
  sourceIndexes: number[];
};

function splitPdfTableColumns(
  doc: import("jspdf").jsPDF,
  columns: ReportTableColumn[],
  availableWidth: number,
  rows: ReportTableRow[] = [],
): PdfTableColumnBand[] {
  if (!columns.length) return [];
  const minimums = columns.map((column) =>
    pdfTableColumnMinimumWidth(
      doc,
      column,
      rows.map((row) => row[column.key]),
    ),
  );
  if (minimums.reduce((sum, width) => sum + width, 0) <= availableWidth) {
    return [
      {
        columns,
        label: "Todas as colunas",
        sourceIndexes: columns.map((_, index) => index),
      },
    ];
  }

  const anchor = columns[0];
  const anchorWidth = minimums[0];
  const groups: number[][] = [];
  let indexes: number[] = [];
  let occupiedWidth = anchorWidth;

  for (let index = 1; index < columns.length; index += 1) {
    const minimumWidth = minimums[index];
    if (indexes.length && occupiedWidth + minimumWidth > availableWidth) {
      groups.push(indexes);
      indexes = [];
      occupiedWidth = anchorWidth;
    }
    indexes.push(index);
    occupiedWidth += minimumWidth;
  }
  if (indexes.length) groups.push(indexes);

  for (let groupIndex = groups.length - 1; groupIndex > 0; groupIndex -= 1) {
    const previous = groups[groupIndex - 1];
    const current = groups[groupIndex];
    let currentWidth =
      anchorWidth +
      current.reduce((sum, index) => sum + minimums[index], 0);
    while (previous.length - current.length > 1) {
      const candidate = previous.at(-1);
      if (
        candidate === undefined ||
        currentWidth + minimums[candidate] > availableWidth
      ) {
        break;
      }
      previous.pop();
      current.unshift(candidate);
      currentWidth += minimums[candidate];
    }
  }

  return groups.length
    ? groups.map((group) => pdfTableColumnBand(columns, group))
    : [{ columns: [anchor], label: "Coluna 1 de 1", sourceIndexes: [0] }];
}

function pdfTableColumnBand(
  columns: ReportTableColumn[],
  indexes: number[],
): PdfTableColumnBand {
  const sourceIndexes = [0, ...indexes];
  const firstDataColumn = indexes[0] + 1;
  const lastDataColumn = indexes[indexes.length - 1] + 1;
  return {
    columns: sourceIndexes.map((index) => columns[index]),
    label: `Colunas ${firstDataColumn}–${lastDataColumn} de ${columns.length}`,
    sourceIndexes,
  };
}

function pdfTableColumnMinimumWidth(
  doc: import("jspdf").jsPDF,
  column: ReportTableColumn,
  values: Array<string | number | null | undefined> = [],
) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.25);
  const labelWidth = doc.getTextWidth(column.label) + 12;
  const semanticMinimum = column.numeric ? 76 : 92;
  const numericContentWidth = column.numeric
    ? Math.max(
        0,
        ...values.map((value) =>
          doc.getTextWidth(
            typeof value === "number"
              ? new Intl.NumberFormat("pt-BR").format(value)
              : String(value ?? ""),
          ),
        ),
      ) + 12
    : 0;
  return Math.min(
    180,
    Math.max(semanticMinimum, labelWidth / 2, numericContentWidth),
  );
}

function resolvePdfTableColumnWidths(
  doc: import("jspdf").jsPDF,
  columns: ReportTableColumn[],
  tableWidth: number,
  rows: ReportTableRow[] = [],
) {
  const minimums = columns.map((column) =>
    pdfTableColumnMinimumWidth(
      doc,
      column,
      rows.map((row) => row[column.key]),
    ),
  );
  const minimumTotal = minimums.reduce((sum, width) => sum + width, 0);
  if (minimumTotal >= tableWidth) {
    return minimums.map((width) => (width / minimumTotal) * tableWidth);
  }
  const remaining = tableWidth - minimumTotal;
  const totalWeight = columns.reduce(
    (sum, column) => sum + (column.width ?? 16),
    0,
  );
  return minimums.map(
    (width, index) =>
      width + remaining * ((columns[index].width ?? 16) / totalWeight),
  );
}

function fitPdfTableCellFontSize(
  doc: import("jspdf").jsPDF,
  text: string,
  maxWidth: number,
  initialSize: number,
  minimumSize = 7.5,
) {
  let size = initialSize;
  doc.setFontSize(size);
  while (size > minimumSize && doc.getTextWidth(text) > maxWidth) {
    size -= 0.25;
    doc.setFontSize(size);
  }
  return Math.max(minimumSize, size);
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
  let lower = 0;
  let upper = text.length;
  while (lower < upper) {
    const middle = Math.ceil((lower + upper) / 2);
    if (doc.getTextWidth(`${text.slice(0, middle)}${suffix}`) <= maxWidth) {
      lower = middle;
    } else {
      upper = middle - 1;
    }
  }
  return lower ? `${text.slice(0, lower)}${suffix}` : "";
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

function drawPdfFittedText(
  doc: import("jspdf").jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  size: number,
  color: string,
  bold = false,
  minimumSize = Math.max(6, size - 4),
  align: "left" | "center" | "right" = "left",
) {
  doc.setFont("helvetica", bold ? "bold" : "normal");
  let resolvedSize = size;
  doc.setFontSize(resolvedSize);
  while (
    resolvedSize > minimumSize &&
    doc.getTextWidth(text) > maxWidth
  ) {
    resolvedSize -= 0.5;
    doc.setFontSize(resolvedSize);
  }
  doc.setTextColor(`#${color}`);
  doc.text(fitPdfText(doc, text, maxWidth), x, y, { align });
  return resolvedSize;
}

function drawPdfParagraph(
  doc: import("jspdf").jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  size: number,
  color: string,
  bold = false,
  maxLines = 2,
  lineHeight = size + 2,
) {
  if (!text.trim()) return 0;
  doc.setFont("helvetica", bold ? "bold" : "normal");
  doc.setFontSize(size);
  doc.setTextColor(`#${color}`);
  const lines = limitPdfLines(doc, text, maxWidth, maxLines);
  doc.text(lines, x, y, {
    lineHeightFactor: lineHeight / size,
  });
  return lines.length * lineHeight;
}

function drawPdfPageFooters(
  doc: import("jspdf").jsPDF,
  payload: ReportPayload,
  exportedAt: Date,
) {
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    const width = doc.internal.pageSize.getWidth();
    const height = doc.internal.pageSize.getHeight();
    doc.setDrawColor(`#${BORDER}`);
    doc.line(42, height - 34, width - 42, height - 34);
    drawPdfFittedText(
      doc,
      `IPXData · ${payload.title}`,
      42,
      height - 18,
      250,
      7.5,
      MUTED_TEXT,
      true,
      6.5,
    );
    drawPdfFittedText(
      doc,
      `Arquivo exportado em ${formatReportDateTime(payload, exportedAt)}`,
      width / 2,
      height - 18,
      240,
      7.5,
      MUTED_TEXT,
      false,
      6.5,
      "center",
    );
    drawPdfFittedText(
      doc,
      `Página ${page} de ${pageCount}`,
      width - 42,
      height - 18,
      120,
      7.5,
      MUTED_TEXT,
      true,
      6.5,
      "right",
    );
  }
}

function drawPdfNoteBox(
  doc: import("jspdf").jsPDF,
  text: string,
  x: number,
  y: number,
  width = doc.internal.pageSize.getWidth() - 84,
  maxLines = 3,
) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  const lines = limitPdfLines(doc, text, width - 20, maxLines);
  const height = measurePdfNoteBoxHeight(doc, text, width, maxLines);

  doc.setFillColor(`#${SOFT_BLUE}`);
  doc.setDrawColor(`#${BORDER}`);
  doc.roundedRect(x, y, width, height, 5, 5, "FD");
  doc.setTextColor(`#${BRAND_BLUE}`);
  doc.text(lines, x + 10, y + 14);

  return height;
}

function measurePdfNoteBoxHeight(
  doc: import("jspdf").jsPDF,
  text: string,
  width: number,
  maxLines = 3,
) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  const lines = limitPdfLines(doc, text, width - 20, maxLines);
  return Math.max(24, 12 + lines.length * 11);
}

function withExportBarValueLabels(
  option: EnterpriseChartOption,
): EnterpriseChartOption {
  const series = (option as { series?: unknown }).series;
  if (!series) return option;
  const seriesList = Array.isArray(series) ? series : [series];
  const valueSeries = seriesList.filter(
    (item) =>
      item &&
      typeof item === "object" &&
      !isExportReferenceSeries(item as Record<string, unknown>) &&
      ((item as { type?: unknown }).type === "bar" ||
        (item as { type?: unknown }).type === "line"),
  );
  const pointCount = valueSeries.reduce((sum, item) => {
    const data = (item as { data?: unknown }).data;
    return (
      sum +
      (Array.isArray(data)
        ? data.filter((value) => formatBarLabelValue(value) !== "").length
        : 0)
    );
  }, 0);
  const horizontal =
    axisType((option as { xAxis?: unknown }).xAxis) === "value" &&
    axisType((option as { yAxis?: unknown }).yAxis) === "category";
  const dense = pointCount > 24;
  const labeledSeries = Array.isArray(series)
    ? series.map((item) => addExportValueLabel(item, dense, horizontal))
    : addExportValueLabel(series, dense, horizontal);
  const labeledSeriesList = Array.isArray(labeledSeries)
    ? labeledSeries
    : [labeledSeries];

  return {
    ...option,
    grid: enhanceExportGrid(
      option.grid,
      dense,
      horizontal,
      labeledSeriesList,
    ),
    legend: enhanceExportLegend(option.legend),
    series: labeledSeries,
    textStyle: {
      ...(option.textStyle ?? {}),
      color: "#13233A",
      fontFamily: "Arial, sans-serif",
      fontSize: dense ? 10 : 11,
    },
    xAxis: enhanceExportAxis(option.xAxis, dense),
    yAxis: enhanceExportAxis(option.yAxis, dense),
  } as EnterpriseChartOption;
}

function enhanceExportGrid(
  grid: unknown,
  dense: boolean,
  horizontal: boolean,
  series: unknown[],
) {
  const enhance = (item: unknown) => {
    const record =
      item && typeof item === "object"
        ? (item as Record<string, unknown>)
        : {};
    return {
      ...record,
      bottom: record.bottom ?? 44,
      containLabel: record.containLabel ?? true,
      left: record.left ?? 50,
      right:
        exportGridRight(record.right, horizontal, series) ??
        (horizontal ? 72 : 32),
      top: exportGridTop(record.top, dense, horizontal, series),
    };
  };

  return Array.isArray(grid) ? grid.map(enhance) : enhance(grid);
}

function enhanceExportAxis(axis: unknown, dense: boolean): unknown {
  if (Array.isArray(axis)) {
    return axis.map((item) => enhanceExportAxis(item, dense));
  }
  if (!axis || typeof axis !== "object") return axis;
  const record = axis as Record<string, unknown>;
  const axisLabel =
    record.axisLabel && typeof record.axisLabel === "object"
      ? (record.axisLabel as Record<string, unknown>)
      : {};
  const existingFontSize = Number(axisLabel.fontSize);
  return {
    ...record,
    axisLabel: {
      ...axisLabel,
      color: "#334155",
      fontSize: Math.max(
        Number.isFinite(existingFontSize) ? existingFontSize : 0,
        dense ? 10 : 11,
      ),
    },
  };
}

function enhanceExportLegend(legend: unknown): unknown {
  if (Array.isArray(legend)) {
    return legend.map((item) => enhanceExportLegend(item));
  }
  if (!legend || typeof legend !== "object") return legend;
  const record = legend as Record<string, unknown>;
  const textStyle =
    record.textStyle && typeof record.textStyle === "object"
      ? (record.textStyle as Record<string, unknown>)
      : {};
  const existingFontSize = Number(textStyle.fontSize);
  return {
    ...record,
    itemGap: Math.max(Number(record.itemGap) || 0, 12),
    textStyle: {
      ...textStyle,
      color: "#334155",
      fontSize: Math.max(
        Number.isFinite(existingFontSize) ? existingFontSize : 0,
        10,
      ),
    },
  };
}

function exportGridRight(
  value: unknown,
  horizontal: boolean,
  series: unknown[] = [],
) {
  const minimum = horizontal ? 72 : chartValueLabelRightPadding(series);
  if (!minimum) return value;
  const percentageValue = exportGridPercentage(value);
  if (percentageValue !== null) {
    return `${Math.max(percentageValue, (minimum / 900) * 100)}%`;
  }
  const numericValue =
    typeof value === "number" ? value : Number(String(value ?? ""));
  return Number.isFinite(numericValue) ? Math.max(numericValue, minimum) : minimum;
}

function axisType(axis: unknown) {
  const firstAxis = Array.isArray(axis) ? axis[0] : axis;
  return firstAxis && typeof firstAxis === "object"
    ? (firstAxis as { type?: unknown }).type
    : undefined;
}

function exportGridTop(
  value: unknown,
  dense: boolean,
  horizontal: boolean,
  series: unknown[] = [],
) {
  const numericValue =
    typeof value === "number" ? value : Number(String(value ?? ""));
  const minimum = horizontal ? 22 : dense ? 72 : 48;
  const labelMinimum = horizontal
    ? minimum
    : chartValueLabelTopPadding(series, minimum, Math.max(minimum, 56));
  const percentageValue = exportGridPercentage(value);
  if (percentageValue !== null) {
    return `${Math.max(percentageValue, (labelMinimum / 400) * 100)}%`;
  }

  return Number.isFinite(numericValue)
    ? Math.max(numericValue, labelMinimum)
    : labelMinimum;
}

function exportGridPercentage(value: unknown) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d+(?:\.\d+)?)%$/);
  if (!match) return null;
  const percentage = Number(match[1]);
  return Number.isFinite(percentage) ? percentage : null;
}

function addExportValueLabel(
  series: unknown,
  dense: boolean,
  horizontal: boolean,
) {
  if (!series || typeof series !== "object") return series;

  const record = series as Record<string, unknown>;
  if (record.type !== "bar" && record.type !== "line") return series;
  if (isExportReferenceSeries(record)) return series;
  if (
    record.label &&
    typeof record.label === "object" &&
    (record.label as { show?: unknown }).show === false
  ) {
    return series;
  }

  const isLine = record.type === "line";
  const verticalBarLabel = record.type === "bar" && !horizontal;
  const data = Array.isArray(record.data) ? record.data : [];
  const numericDataIndexes = data.flatMap((value, dataIndex) =>
    formatBarLabelValue(value) ? [dataIndex] : [],
  );
  // High-frequency series (especially minute data) cannot carry hundreds of
  // readable labels on an A4 chart. Keep a representative, deterministic set
  // plus the closing point; the following data page retains every exact value.
  const labelStride =
    numericDataIndexes.length > 36
      ? Math.ceil(numericDataIndexes.length / 32)
      : 1;
  const visibleDataIndexes = new Set(
    numericDataIndexes.filter(
      (_, numericIndex) => numericIndex % labelStride === 0,
    ),
  );
  const lastNumericDataIndex = numericDataIndexes.at(-1);
  if (lastNumericDataIndex !== undefined) {
    visibleDataIndexes.add(lastNumericDataIndex);
  }
  const label = {
    ...(record.label && typeof record.label === "object" ? record.label : {}),
    // The shared angle keeps exports consistent with the interactive charts;
    // left alignment lets the label grow upward from its data point.
    align: horizontal || verticalBarLabel || isLine ? "left" : "center",
    color: "#13233A",
    distance: horizontal
      ? 6
      : isLine
        ? 7
        : verticalBarLabel
          ? 5
          : dense
            ? 3
            : 5,
    fontSize: dense ? 9 : 11,
    fontWeight: 600,
    formatter: (params: { dataIndex?: number; value?: unknown }) =>
      params.dataIndex !== undefined &&
      labelStride > 1 &&
      !visibleDataIndexes.has(params.dataIndex)
        ? ""
        : formatBarLabelValue(params.value),
    position: horizontal ? "right" : "top",
    rotate:
      horizontal || (!verticalBarLabel && !isLine)
        ? 0
        : CHART_VALUE_LABEL_ANGLE,
    show: true,
    verticalAlign:
      horizontal || verticalBarLabel || isLine ? "middle" : "bottom",
  };
  return {
    ...record,
    label,
    labelLayout: composeChartValueLabelLayout(record.labelLayout, {
      angled: !horizontal && (verticalBarLabel || isLine),
      hideOverlap: !isLine,
    }),
  };
}

function isExportReferenceSeries(series: Record<string, unknown>) {
  if (series.silent === true) return true;
  const name = typeof series.name === "string" ? series.name.toLowerCase() : "";
  const stack = typeof series.stack === "string" ? series.stack.toLowerCase() : "";
  return (
    stack.includes("occupancy_range") ||
    name === "intervalo" ||
    name.includes("limite mínimo") ||
    name.includes("limite máximo") ||
    name.includes("média-base") ||
    name.includes("média móvel") ||
    name.includes("meta") ||
    name.includes("limiar")
  );
}

function formatBarLabelValue(value: unknown) {
  const candidate = Array.isArray(value) ? value[value.length - 1] : value;
  const unwrappedValue =
    candidate && typeof candidate === "object" && "value" in candidate
      ? (candidate as { value?: unknown }).value
      : candidate;
  const rawValue = Array.isArray(unwrappedValue)
    ? unwrappedValue[unwrappedValue.length - 1]
    : unwrappedValue;
  if (rawValue === null || rawValue === undefined || rawValue === "") return "";
  const numericValue =
    typeof rawValue === "number" ? rawValue : Number(String(rawValue));

  if (!Number.isFinite(numericValue)) return "";
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

function certifiedReportTimeZone(payload: ReportPayload) {
  const timeZone = payload.timeZone?.trim();
  if (!timeZone) return undefined;
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone }).format(new Date(0));
    return timeZone;
  } catch {
    return undefined;
  }
}

function formatReportDateTime(payload: ReportPayload, value: Date) {
  return formatDateTime(value, certifiedReportTimeZone(payload));
}

function formatDateTime(value: Date, timeZone?: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    ...(timeZone ? { timeZone } : {}),
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
