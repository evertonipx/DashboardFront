import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const filename = resolve(root, "lib/report-export.ts");
const nodeRequire = createRequire(filename);
const internals = [
  "buildExcelDataSheetHeader",
  "buildExcelHeader",
  "canonicalReportTitle",
  "drawPdfCover",
  "drawPdfExecutiveAppendices",
  "drawPdfPageFooters",
  "drawPdfSectionMetadata",
  "drawPdfTable",
  "excelHeaderFooter",
];
const input = `${readFileSync(filename, "utf8")}\nexport { ${internals.join(", ")} };`;
const output = ts.transpileModule(input, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  fileName: filename,
}).outputText;
// This fixture executes the real layout functions against real jsPDF/ExcelJS
// instances; the chart-label import is unused by these functions.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fixture = any;
const moduleFixture: { exports: Record<string, Fixture> } = { exports: {} };
new Function("exports", "require", "module", output)(
  moduleFixture.exports,
  (specifier: string) => specifier.startsWith("@/") ? {} : nodeRequire(specifier),
  moduleFixture,
);
const layout = moduleFixture.exports;
const { jsPDF } = nodeRequire("jspdf");
const ExcelJS = nodeRequire("exceljs");

function payload(reportKind: "contagem" | "ocupacao" | "demographics", cutoff = true) {
  return {
    charts: [],
    context: [
      "Cenário: Entrada principal",
      "Período aplicado a todo o relatório: janeiro a dezembro de 2026",
      ...Array.from({ length: 12 }, (_, index) => `Nota operacional ${index + 1}`),
    ],
    dataCompleteUntil: cutoff ? new Date("2026-09-30T12:18:00.000Z") : null,
    filename: `ipxdata-${reportKind}-2026`,
    generatedAt: new Date("2026-09-30T12:18:00.000Z"),
    metrics: [],
    subtitle: "Janeiro a dezembro de 2026 · dados consolidados",
    timeZone: "America/Sao_Paulo",
    title: "Relatório - Entrada principal",
  };
}

function textOn(doc: Fixture) {
  const rendered: string[] = [];
  const original = doc.text.bind(doc);
  doc.text = (value: string | string[], ...args: Fixture[]) => {
    rendered.push(Array.isArray(value) ? value.join(" ") : value);
    return original(value, ...args);
  };
  return rendered;
}

test("PDF usa título canônico e apenas a data certificada no rodapé, sem página de governança", () => {
  for (const [reportKind, label] of [
    ["contagem", "Contagem"],
    ["ocupacao", "Ocupação"],
    ["demographics", "Demografia"],
  ] as const) {
    const report = payload(reportKind);
    const doc = new jsPDF({ format: "a4", orientation: "landscape", unit: "pt" });
    const rendered = textOn(doc);
    assert.equal(layout.canonicalReportTitle(report), `Relatório IPXData - ${label}`);
    layout.drawPdfCover(doc, report, "charts");
    layout.drawPdfExecutiveAppendices(doc, report, "charts");
    layout.drawPdfSectionMetadata(doc, "Leitura do gráfico");
    layout.drawPdfPageFooters(doc, report);
    assert.equal(doc.getNumberOfPages(), 1, "contexto longo não deve criar página de governança");
    const text = rendered.join("\n");
    assert.match(text, new RegExp(`Relatório IPXData - ${label}`));
    assert.match(text, /visão computacional com IA/);
    assert.equal(rendered.filter((line) => line.startsWith("Dados atualizados até")).length, 1);
    assert.doesNotMatch(text, /Entrada principal|GOVERNANÇA|Dados gerados em|Arquivo exportado em|Conteúdo:/);
  }
});

test("PDF com atualização não certificada não inventa horário de atualização", () => {
  const report = payload("demographics", false);
  const doc = new jsPDF({ format: "a4", orientation: "landscape", unit: "pt" });
  const rendered = textOn(doc);
  layout.drawPdfCover(doc, report, "charts");
  layout.drawPdfPageFooters(doc, report);
  assert.doesNotMatch(rendered.join("\n"), /Dados atualizados até|Dados gerados em|Arquivo exportado em/);
});

test("tabelas extensas continuam paginadas sem repetir metadados em cada página", () => {
  const report = payload("contagem");
  const doc = new jsPDF({ format: "a4", orientation: "landscape", unit: "pt" });
  const rendered = textOn(doc);
  layout.drawPdfCover(doc, report, "data");
  doc.addPage("a4", "landscape");
  layout.drawPdfTable(doc, {
    columns: [
      { key: "month", label: "Mês" },
      { key: "total", label: "Total", numeric: true },
    ],
    rows: Array.from({ length: 100 }, (_, index) => ({ month: `Mês ${index + 1}`, total: index + 1 })),
    title: "Totais mensais",
  }, 96, report, true);
  assert.ok(doc.getNumberOfPages() > 2);
  layout.drawPdfPageFooters(doc, report);
  const text = rendered.join("\n");
  assert.equal(rendered.filter((line) => line.startsWith("Dados atualizados até")).length, doc.getNumberOfPages());
  assert.doesNotMatch(text, /Entrada principal|GOVERNANÇA|Arquivo exportado em/);
  assert.match(text, /Mês 100/);
});

test("XLSX mantém capa concisa e rodapé canônico, sem metadados nos dados", () => {
  const report = payload("ocupacao");
  const workbook = new ExcelJS.Workbook();
  const summary = workbook.addWorksheet("Resumo");
  summary.columns = Array.from({ length: 5 }, () => ({ width: 20 }));
  layout.buildExcelHeader(summary, report);
  assert.equal(summary.getCell("A1").value, "Relatório IPXData - Ocupação");
  assert.equal(summary.getCell("A2").value, report.subtitle);
  assert.match(String(summary.getCell("A4").value), /visão computacional com IA/);
  assert.equal(summary.getCell("A5").value, null, "período já consta no subtítulo");
  assert.equal(summary.getCell("A6").value, null, "data de atualização fica somente no rodapé");

  const data = workbook.addWorksheet("Dados");
  data.columns = [{ width: 20 }, { width: 20 }];
  layout.buildExcelDataSheetHeader(data, report, "Totais mensais", "Dados consolidados");
  assert.equal(data.getCell("A1").value, "Relatório IPXData - Ocupação");
  assert.equal(data.getCell("A2").value, "Totais mensais");
  assert.equal(data.getCell("A3").value, "Dados consolidados");
  assert.equal(data.getCell("A4").value, null);
  const footer = layout.excelHeaderFooter(report).oddFooter;
  assert.match(footer, /Relatório IPXData - Ocupação/);
  assert.match(footer, /Dados atualizados até 30\/09\/2026/);
  assert.doesNotMatch(footer, /Entrada principal|Arquivo exportado em|Dados gerados em/);
  assert.doesNotMatch(layout.excelHeaderFooter(payload("demographics", false)).oddFooter, /Dados atualizados até/);
});

test("aba gráfica do XLSX separa título do relatório e título do gráfico", () => {
  assert.match(input, /titleCell\.value = canonicalReportTitle\(payload\)/);
  assert.match(input, /chartTitleCell\.value = chart\.title/);
  assert.match(input, /chartTitleCell\.alignment = \{ vertical: "middle", wrapText: true \}/);
  assert.match(input, /chartSheet\.getRow\(2\)\.height = excelTextRowHeight\(/);
  assert.match(input, /descCell = chartSheet\.getCell\(3, 1\)/);
  assert.match(input, /tl: \{ col: 0, row: 3 \}/);
  assert.doesNotMatch(input, /chartSheet\.getCell\([34], 1\)\.value = `?(?:Dados gerados|Arquivo exportado)/);
});
