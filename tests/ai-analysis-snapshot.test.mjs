import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();
const snapshotModule = loadTypeScriptModule("lib/ai-analysis-snapshot.ts");
const contract = loadTypeScriptModule("lib/ai-insights-contract.ts");

test("snapshot limita volume, remove dados sensíveis e calcula estatísticas completas", () => {
  const rows = Array.from({ length: 500 }, (_, index) => ({
    camera_id: `camera-${index}`,
    email: `pessoa${index}@empresa.com`,
    internal_id: `977696b6-5bf7-4cb8-afe8-${String(index).padStart(12, "0")}`,
    period: `P${index}`,
    total: index === 0 ? null : index === 237 ? 99_999 : index + 10,
  }));
  const charts = Array.from({ length: 20 }, (_, index) => ({
    description: `Série ${index} contato diretoria@empresa.com em 192.168.1.10`,
    option: {
      series: [{ formatter: () => "não deve ser serializado" }],
    },
    table: {
      columns: [
        { key: "period", label: "Período" },
        { key: "total", label: "Total", numeric: true },
        { key: "internal_id", label: "ID interno" },
        { key: "email", label: "E-mail" },
        { key: "camera_id", label: "Câmera" },
      ],
      rows,
      title: `Dados ${index}`,
    },
    title: `Gráfico ${index}`,
  }));
  const payload = {
    charts,
    context: [
      "Período: janeiro a dezembro",
      "Credencial: abc.def.ghi",
      "Responsável: conselho@empresa.com",
    ],
    dataCompleteUntil: new Date("2026-08-26T15:00:00.000Z"),
    filename: "relatorio",
    generatedAt: new Date("2026-08-26T15:00:00.000Z"),
    metrics: [
      {
        description: "Mantém a apresentação localizada",
        label: "Média-base",
        value: "3.775,097",
      },
      {
        description: "Horário civil exibido pelo relatório",
        label: "Hora de referência",
        value: "10:42:00",
      },
    ],
    subtitle: "Janeiro a dezembro de 2026",
    timeZone: "America/Sao_Paulo",
    title: "Visão executiva",
  };

  const snapshot = snapshotModule.createAiAnalysisSnapshot({
    companyScopeId: "company-1",
    module: "counting",
    payload,
    surface: "reports",
    timeZone: "America/Sao_Paulo",
    userId: "user-1",
  });
  const parsed = contract.AiAnalysisSnapshotSchema.parse(snapshot);
  const serialized = JSON.stringify(parsed);
  const firstDataset = parsed.report.datasets[0];

  assert.equal(parsed.report.datasets.length, 16);
  assert.ok(
    parsed.report.datasets.every(
      (dataset) => dataset.rows.length <= 120 && dataset.columns.length === 2,
    ),
  );
  assert.equal(firstDataset.coverage.originalRows, 500);
  assert.equal(firstDataset.coverage.strategy, "sampled");
  assert.equal(firstDataset.rows[0][1], null, "null não pode virar zero");
  assert.ok(
    firstDataset.rows.some((row) => row[0] === "P237" && row[1] === 99_999),
    "o pico precisa sobreviver à amostragem",
  );
  assert.deepEqual(
    firstDataset.statistics.map(({ label, value }) => [label, value]),
    [
      ["Total · observações", 499],
      ["Total · mínimo", 11],
      ["Total · máximo", 99_999],
      ["Total · média", 459.903808],
    ],
  );
  assert.equal(parsed.report.metrics[0].value, "3.775,097");
  assert.equal(parsed.report.metrics[1].value, "10:42:00");
  assert.doesNotMatch(serialized, /diretoria@empresa\.com|conselho@empresa\.com/);
  assert.doesNotMatch(serialized, /192\.168\.1\.10|abc\.def\.ghi/);
  assert.doesNotMatch(serialized, /camera_id|internal_id|formatter/);
  assert.ok(
    new TextEncoder().encode(serialized).byteLength <=
      contract.AI_INSIGHTS_LIMITS.bodyBytes - 8 * 1024,
  );
});

test("amostragem preserva bordas, extremos e ordem cronológica", () => {
  const indexes = snapshotModule.selectRepresentativeRowIndexes(
    1_000,
    [724, 18, 500],
    12,
  );

  assert.equal(indexes.length, 12);
  assert.equal(indexes[0], 0);
  assert.equal(indexes.at(-1), 999);
  assert.ok(indexes.includes(18));
  assert.ok(indexes.includes(500));
  assert.ok(indexes.includes(724));
  assert.deepEqual(indexes, [...indexes].sort((left, right) => left - right));
});

test("limite por bytes reduz todas as séries sem perder bordas ou extremos", () => {
  const padding = "contexto-operacional-".repeat(16);
  const charts = Array.from({ length: 16 }, (_, chartIndex) => ({
    option: {
      rawOptionOnly: "não deve atravessar o normalizador",
      series: [{ data: Array.from({ length: 120 }, () => padding) }],
    },
    table: {
      columns: [
        { key: "period", label: "Período" },
        { key: "total", label: "Total", numeric: true },
        { key: "context", label: "Contexto" },
      ],
      rows: Array.from({ length: 120 }, (_, rowIndex) => ({
        context: `${padding}-${chartIndex}-${rowIndex}`,
        period: `C${chartIndex}-P${rowIndex}`,
        total: rowIndex === 73 ? 1_000_000 + chartIndex : rowIndex,
      })),
      title: `Tabela extensa ${chartIndex}`,
    },
    title: `Série extensa ${chartIndex}`,
  }));
  const snapshot = snapshotModule.createAiAnalysisSnapshot({
    companyScopeId: "company-1",
    module: "occupancy",
    payload: {
      charts,
      context: Array.from(
        { length: 24 },
        (_, index) => `Contexto ${index}: ${padding}`,
      ),
      dataCompleteUntil: new Date("2026-08-26T15:00:00.000Z"),
      filename: "relatorio-extenso",
      generatedAt: new Date("2026-08-26T15:00:00.000Z"),
      metrics: Array.from({ length: 40 }, (_, index) => ({
        description: padding,
        label: `Indicador ${index}`,
        value: padding,
      })),
      subtitle: padding,
      timeZone: "America/Sao_Paulo",
      title: "Visão extensa",
    },
    surface: "analysis",
    timeZone: "America/Sao_Paulo",
    userId: "user-1",
  });
  const parsed = contract.AiAnalysisSnapshotSchema.parse(snapshot);
  const bytes = new TextEncoder().encode(JSON.stringify(parsed)).byteLength;

  assert.ok(bytes <= contract.AI_INSIGHTS_LIMITS.bodyBytes - 8 * 1024);
  assert.equal(parsed.report.datasets.length, 16);
  parsed.report.datasets.forEach((dataset, chartIndex) => {
    assert.equal(dataset.rows[0][0], `C${chartIndex}-P0`);
    assert.equal(dataset.rows.at(-1)[0], `C${chartIndex}-P119`);
    assert.ok(
      dataset.rows.some(
        (row) =>
          row[0] === `C${chartIndex}-P73` &&
          row[1] === 1_000_000 + chartIndex,
      ),
    );
    assert.equal(dataset.coverage.originalRows, 120);
    assert.equal(dataset.coverage.includedRows, dataset.rows.length);
    assert.equal(dataset.coverage.strategy, "sampled");
  });
  assert.doesNotMatch(JSON.stringify(parsed), /rawOptionOnly|atravessar o normalizador/);
});

test("snapshot fica somente na solicitação corrente e não é persistido", () => {
  const action = readFileSync(
    resolve(projectRoot, "components/app/ai-analysis-action.tsx"),
    "utf8",
  );
  const layout = readFileSync(resolve(projectRoot, "app/layout.tsx"), "utf8");

  assert.match(action, /const snapshot = createAiAnalysisSnapshot\(/);
  assert.match(action, /body: \{ snapshot \}/);
  assert.doesNotMatch(
    action,
    /captureSnapshot|localStorage|sessionStorage|URLSearchParams|router\.push/,
  );
  assert.doesNotMatch(layout, /AiAnalysisProvider/);
});

function loadTypeScriptModule(relativePath) {
  const filename = resolve(projectRoot, relativePath);
  const cached = moduleCache.get(filename);
  if (cached) return cached.exports;

  const source = readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
  const loadedModule = { exports: {} };
  moduleCache.set(filename, loadedModule);
  const nodeRequire = createRequire(filename);
  const localRequire = (specifier) => {
    if (!specifier.startsWith("@/")) return nodeRequire(specifier);
    return loadTypeScriptModule(`${specifier.slice(2)}.ts`);
  };
  const execute = new Function(
    "exports",
    "require",
    "module",
    "__filename",
    "__dirname",
    output,
  );
  execute(
    loadedModule.exports,
    localRequire,
    loadedModule,
    filename,
    dirname(filename),
  );
  return loadedModule.exports;
}
