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

  assert.equal(contract.AI_INSIGHTS_LIMITS.datasets, 24);
  assert.equal(parsed.report.datasets.length, 20);
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

test("série diária canônica preserva todos os dias mesmo após o 16º widget", () => {
  const secondaryCharts = Array.from({ length: 18 }, (_, chartIndex) => ({
    option: {},
    table: {
      columns: [
        { key: "period", label: "Período" },
        { key: "value", label: "Valor", numeric: true },
      ],
      rows: Array.from({ length: 200 }, (_, rowIndex) => ({
        period: `S${chartIndex}-P${rowIndex}`,
        value: rowIndex,
      })),
      title: `Série secundária ${chartIndex}`,
    },
    title: `Série secundária ${chartIndex}`,
  }));
  const dailyRows = Array.from({ length: 365 }, (_, index) => {
    const date = new Date(Date.UTC(2025, 0, index + 1));
    const civilDate = new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      timeZone: "UTC",
      year: "numeric",
    }).format(date);
    return {
      baseline: 1_000 + (index % 7) * 10,
      current: 1_100 + index,
      date: civilDate,
      total: 1_100 + index,
    };
  });
  const snapshot = snapshotModule.createAiAnalysisSnapshot({
    companyScopeId: "company-1",
    module: "counting",
    payload: {
      charts: [
        ...secondaryCharts,
        {
          description: "Comparação diária com a base certificada.",
          option: {},
          table: {
            columns: [
              { key: "date", label: "Data atual" },
              { key: "baseline", label: "Base", numeric: true },
              { key: "current", label: "Atual", numeric: true },
              { key: "total", label: "Total diário", numeric: true },
            ],
            rows: dailyRows,
            title: "Fluxo diário x período-base",
          },
          title: "Fluxo diário x período-base",
        },
      ],
      context: ["Período: 01/01/2025 a 31/12/2025"],
      dataCompleteUntil: new Date("2026-01-01T02:59:59.000Z"),
      filename: "serie-diaria",
      generatedAt: new Date("2026-01-01T03:00:00.000Z"),
      metrics: [],
      subtitle: "01/01/2025 a 31/12/2025",
      timeZone: "America/Sao_Paulo",
      title: "Análise anual",
    },
    surface: "analysis",
    timeZone: "America/Sao_Paulo",
    userId: "user-1",
  });
  const parsed = contract.AiAnalysisSnapshotSchema.parse(snapshot);
  const daily = parsed.report.datasets[0];
  const legacyCompatibleRequest =
    snapshotModule.createLegacyCompatibleAiInsightsRequest(snapshot);
  const wireCoverage =
    legacyCompatibleRequest.snapshot.report.datasets[0].coverage;
  assert.equal("canonical" in wireCoverage, false);
  assert.equal("granularity" in wireCoverage, false);
  assert.equal("omittedRows" in wireCoverage, false);
  assert.equal(
    contract.AiInsightsRequestSchema.parse(legacyCompatibleRequest).snapshot.report
      .datasets[0].coverage.canonical,
    true,
    "o servidor novo deve reconstruir e certificar a série enviada no formato v1",
  );

  assert.equal(daily.title, "Fluxo diário x período-base");
  assert.equal(daily.coverage.granularity, "day");
  assert.equal(daily.coverage.canonical, true);
  assert.equal(daily.coverage.strategy, "complete");
  assert.equal(daily.coverage.originalRows, 365);
  assert.equal(daily.coverage.includedRows, 365);
  assert.equal(daily.coverage.omittedRows, 0);
  assert.equal(daily.rows.length, 365);
  assert.equal(daily.rows[0][0], "2025-01-01");
  assert.equal(daily.rows.at(-1)[0], "2025-12-31");
  assert.equal(
    parsed.report.datasets.length,
    secondaryCharts.length + 1,
    "a série canônica não pode expulsar widgets secundários que ainda cabem no contrato",
  );
  assert.deepEqual(
    new Set(parsed.report.datasets.map((dataset) => dataset.title)),
    new Set([
      "Fluxo diário x período-base",
      ...secondaryCharts.map((chart) => chart.title),
    ]),
    "todos os títulos dos gráficos devem chegar à análise",
  );
  assert.deepEqual(parsed.report.period, {
    from: "2025-01-01",
    label: "01/01/2025 a 31/12/2025",
    to: "2025-12-31",
  });
  assert.ok(
    parsed.report.datasets.slice(1).every(
      (dataset) => dataset.rows.length <= contract.AI_INSIGHTS_LIMITS.sampledDatasetRows,
    ),
  );
  assert.ok(
    new TextEncoder().encode(JSON.stringify(parsed)).byteLength <=
      contract.AI_INSIGHTS_LIMITS.bodyBytes - 8 * 1024,
  );
});

test("16 gráficos mais a tabela diária preservam os 17 conjuntos e títulos", () => {
  const charts = Array.from({ length: 16 }, (_, chartIndex) => ({
    description: `Leitura operacional ${chartIndex + 1}.`,
    option: {},
    table: {
      columns: [
        { key: "period", label: "Faixa" },
        { key: "value", label: "Valor", numeric: true },
      ],
      rows: Array.from({ length: 4 }, (_, rowIndex) => ({
        period: `P${rowIndex + 1}`,
        value: (chartIndex + 1) * 100 + rowIndex,
      })),
      title: `Tabela do gráfico ${chartIndex + 1}`,
    },
    title: `Gráfico executivo ${chartIndex + 1}`,
  }));
  const dailyTitle = "Série diária canônica da Contagem";
  const snapshot = snapshotModule.createAiAnalysisSnapshot({
    companyScopeId: "company-17-datasets",
    module: "counting",
    payload: {
      charts,
      context: ["Período civil analisado: 01/08/2026 a 03/08/2026"],
      dataCompleteUntil: new Date("2026-08-04T02:59:59.000Z"),
      filename: "dezesseis-graficos-mais-diario",
      generatedAt: new Date("2026-08-04T03:00:00.000Z"),
      metrics: [],
      subtitle: "01/08/2026 a 03/08/2026",
      tables: [
        {
          columns: [
            { key: "date", label: "Data" },
            { key: "total", label: "Fluxo total atual", numeric: true },
          ],
          description: "Todos os dias civis, em ordem e sem amostragem.",
          rows: [
            { date: "01/08/2026", total: 100 },
            { date: "02/08/2026", total: 120 },
            { date: "03/08/2026", total: 90 },
          ],
          title: dailyTitle,
        },
      ],
      timeZone: "America/Sao_Paulo",
      title: "Relatório executivo completo",
    },
    surface: "live",
    timeZone: "America/Sao_Paulo",
    userId: "user-17-datasets",
  });
  const parsed = contract.AiAnalysisSnapshotSchema.parse(snapshot);
  const titles = parsed.report.datasets.map((dataset) => dataset.title);

  assert.equal(contract.AI_INSIGHTS_LIMITS.datasets, 24);
  assert.equal(parsed.report.datasets.length, 17);
  assert.equal(titles[0], dailyTitle, "a série oficial continua prioritária");
  assert.deepEqual(
    new Set(titles),
    new Set([dailyTitle, ...charts.map((chart) => chart.title)]),
  );
  assert.equal(
    parsed.report.datasets[0].coverage.canonical,
    true,
    "a ampliação não pode enfraquecer a certificação diária",
  );
});

test("Ocupação reconhece Período + Dia a dia como série diária completa", () => {
  const rows = Array.from({ length: 180 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 0, index + 1));
    return {
      average: 42 + (index % 5),
      current: 40 + (index % 12),
      period: new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        timeZone: "UTC",
        year: "numeric",
      }).format(date),
    };
  });
  const snapshot = snapshotModule.createAiAnalysisSnapshot({
    companyScopeId: "company-occupancy",
    module: "occupancy",
    payload: {
      charts: [
        {
          description: "Ocupação consolidada por dia civil.",
          option: {},
          table: {
            columns: [
              { key: "period", label: "Período" },
              { key: "current", label: "Atual", numeric: true },
              { key: "average", label: "Média", numeric: true },
            ],
            rows,
            title: "Dados - Dia a dia",
          },
          title: "Dia a dia",
        },
      ],
      context: ["Período: 01/01/2026 a 29/06/2026"],
      dataCompleteUntil: new Date("2026-06-30T02:59:59.000Z"),
      filename: "ocupacao-dia-a-dia",
      generatedAt: new Date("2026-06-30T03:00:00.000Z"),
      metrics: [],
      subtitle: "Intervalo 01/01/2026 a 29/06/2026",
      timeZone: "America/Sao_Paulo",
      title: "Análise de Ocupação",
    },
    surface: "analysis",
    timeZone: "America/Sao_Paulo",
    userId: "user-occupancy",
  });
  const daily = snapshot.report.datasets[0];

  assert.equal(daily.coverage.granularity, "day");
  assert.equal(daily.coverage.canonical, true);
  assert.equal(daily.coverage.strategy, "complete");
  assert.equal(daily.rows.length, 180);
  assert.equal(daily.coverage.omittedRows, 0);
  assert.equal(snapshot.report.period.from, "2026-01-01");
  assert.equal(snapshot.report.period.to, "2026-06-29");
});

test("Top 5 dias nunca é promovido a série diária canônica", () => {
  const snapshot = createFixtureSnapshot({
    charts: [
      {
        description: "Ranking dos cinco maiores volumes do intervalo.",
        option: {},
        table: {
          columns: [
            { key: "date", label: "Data" },
            { key: "total", label: "Total", numeric: true },
          ],
          rows: [
            { date: "03/01/2026", total: 120 },
            { date: "09/01/2026", total: 180 },
            { date: "15/01/2026", total: 150 },
            { date: "22/01/2026", total: 210 },
            { date: "30/01/2026", total: 190 },
          ],
          title: "Top 5 dias",
        },
        title: "Top 5 dias",
      },
    ],
    dataCompleteUntil: new Date("2026-02-01T02:59:59.000Z"),
    subtitle: "01/01/2026 a 31/01/2026",
  });
  const dataset = snapshot.report.datasets[0];

  assert.equal(dataset.coverage.granularity, "day");
  assert.equal(dataset.coverage.canonical, false);
  assert.equal(dataset.coverage.strategy, "complete");
  assert.equal(dataset.coverage.originalRows, 5);
  assert.equal(dataset.coverage.omittedRows, 0);
  assert.ok(
    snapshot.report.datasets.every((entry) => !entry.coverage.canonical),
  );
  assert.deepEqual(snapshot.report.period, {
    from: "2026-01-01",
    label: "01/01/2026 a 31/01/2026",
    to: "2026-01-31",
  });
});

test("hora, semana e mês mantêm sua granularidade sem virar série diária", () => {
  const snapshot = createFixtureSnapshot({
    charts: [
      {
        option: {},
        table: {
          columns: [
            { key: "period", label: "Período" },
            { key: "current", label: "Atual", numeric: true },
          ],
          rows: Array.from({ length: 24 }, (_, hour) => ({
            current: hour < 10 ? 0 : hour * 10,
            period: `${String(hour).padStart(2, "0")}h`,
          })),
          title: "Fluxo hora a hora",
        },
        title: "Fluxo - Hoje · Período configurado · Hora a hora",
      },
      {
        description: "Consolidação semanal do período consultado.",
        option: {},
        table: {
          columns: [
            { key: "period", label: "Período" },
            { key: "week_of_month", label: "Semana do mês" },
            { key: "current", label: "Atual", numeric: true },
          ],
          rows: [
            { current: 700, period: "Sem. 01/01", week_of_month: "1" },
            { current: 820, period: "Sem. 08/01", week_of_month: "2" },
            { current: 760, period: "Sem. 15/01", week_of_month: "3" },
          ],
          title: "Dados por semana",
        },
        title: "Comparativo semanal",
      },
      {
        option: {},
        table: {
          columns: [
            { key: "period", label: "Mês" },
            { key: "current", label: "Atual", numeric: true },
          ],
          rows: [
            { current: 3_100, period: "Jan/2026" },
            { current: 3_400, period: "Fev/2026" },
          ],
          title: "Dados mês a mês",
        },
        title: "Comparativo mensal",
      },
    ],
    dataCompleteUntil: new Date("2026-02-28T15:00:00.000Z"),
    subtitle: "01/01/2026 a 28/02/2026",
  });
  const byTitle = new Map(
    snapshot.report.datasets.map((dataset) => [dataset.title, dataset]),
  );

  assert.equal(
    byTitle.get("Fluxo - Hoje · Período configurado · Hora a hora").coverage
      .granularity,
    "hour",
  );
  assert.equal(
    byTitle.get("Comparativo semanal").coverage.granularity,
    "week",
  );
  assert.equal(
    byTitle.get("Comparativo mensal").coverage.granularity,
    "month",
  );
  assert.ok(
    snapshot.report.datasets.every((dataset) => !dataset.coverage.canonical),
  );
});

test("índice por dia do mês não é confundido com datas civis únicas", () => {
  const snapshot = createFixtureSnapshot({
    charts: [
      {
        description: "Comparação de índices posicionais de 7 e 30 dias.",
        option: {},
        table: {
          columns: [
            { key: "day_of_month", label: "Dia do mês", numeric: true },
            { key: "trend_7", label: "Tendência 7 dias", numeric: true },
            { key: "trend_30", label: "Tendência 30 dias", numeric: true },
          ],
          rows: Array.from({ length: 30 }, (_, index) => ({
            day_of_month: index + 1,
            trend_30: 900 + index,
            trend_7: 950 + index,
          })),
          title: "Tendência 7x30 dias",
        },
        title: "Tendência 7x30 dias",
      },
    ],
    dataCompleteUntil: new Date("2026-05-01T02:59:59.000Z"),
    subtitle: "01/04/2026 a 30/04/2026",
  });
  const dataset = snapshot.report.datasets[0];

  assert.equal(dataset.coverage.granularity, "day");
  assert.equal(dataset.coverage.canonical, false);
});

test("virada de ano em dd/mm usa o período explícito e preserva todos os dias", () => {
  const dates = ["28/12", "29/12", "30/12", "31/12", "01/01", "02/01", "03/01"];
  const snapshot = createFixtureSnapshot({
    charts: [
      {
        description: "Volume por dia civil.",
        option: {},
        table: {
          columns: [
            { key: "period", label: "Período" },
            { key: "current", label: "Atual", numeric: true },
          ],
          rows: dates.map((period, index) => ({
            current: 1_000 + index * 25,
            period,
          })),
          title: "Dados - Dia a dia",
        },
        title: "Fluxo diário",
      },
    ],
    dataCompleteUntil: new Date("2026-01-04T02:59:59.000Z"),
    subtitle: "28/12 a 03/01",
  });
  const daily = snapshot.report.datasets[0];

  assert.equal(daily.coverage.canonical, true);
  assert.equal(daily.coverage.granularity, "day");
  assert.equal(daily.coverage.strategy, "complete");
  assert.deepEqual(
    daily.rows.map((row) => row[0]),
    [
      "2025-12-28",
      "2025-12-29",
      "2025-12-30",
      "2025-12-31",
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
    ],
  );
  assert.deepEqual(snapshot.report.period, {
    from: "2025-12-28",
    label: "28/12 a 03/01",
    to: "2026-01-03",
  });
});

test("duplicata, lacuna ou ordem divergente impedem certificação diária", () => {
  const snapshot = createFixtureSnapshot({
    charts: [
      {
        option: {},
        table: {
          columns: [
            { key: "date", label: "Data" },
            { key: "total", label: "Total", numeric: true },
          ],
          rows: [
            "01/03/2026",
            "02/03/2026",
            "03/03/2026",
            "03/03/2026",
            "05/03/2026",
            "07/03/2026",
            "06/03/2026",
          ].map((date, index) => ({ date, total: index + 1 })),
          title: "Fluxo diário",
        },
        title: "Fluxo diário",
      },
    ],
    dataCompleteUntil: new Date("2026-03-08T02:59:59.000Z"),
    subtitle: "01/03/2026 a 07/03/2026",
  });
  const dataset = snapshot.report.datasets[0];

  assert.equal(dataset.coverage.granularity, "day");
  assert.equal(dataset.coverage.canonical, false);
  assert.doesNotMatch(dataset.coverage.notes.join(" "), /can[oô]nica/i);
});

test("um único dia exato também pode ser a série diária canônica", () => {
  const snapshot = createFixtureSnapshot({
    charts: [
      {
        option: {},
        table: {
          columns: [
            { key: "date", label: "Data" },
            { key: "total", label: "Total", numeric: true },
          ],
          rows: [{ date: "27/08/2026", total: 420 }],
          title: "Fluxo diário",
        },
        title: "Fluxo diário",
      },
    ],
    dataCompleteUntil: new Date("2026-08-28T02:59:59.000Z"),
    subtitle: "Período: 27/08/2026",
  });
  const dataset = snapshot.report.datasets[0];

  assert.equal(dataset.coverage.canonical, true);
  assert.deepEqual(dataset.rows, [["2026-08-27", 420]]);
  assert.match(dataset.coverage.notes.join(" "), /3 controles válidos/i);
});

test("série diária calcula mediana dos outros weekdays do mesmo mês e deltas", () => {
  const rows = Array.from({ length: 31 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 0, index + 1));
    return {
      date: new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        timeZone: "UTC",
        year: "numeric",
      }).format(date),
      total: index === 14 ? 160 : index === 15 ? null : 100,
    };
  });
  const snapshot = createFixtureSnapshot({
    charts: [
      {
        option: {},
        table: {
          columns: [
            { key: "date", label: "Data" },
            { key: "total", label: "Total", numeric: true },
          ],
          rows,
          title: "Fluxo diário",
        },
        title: "Fluxo diário",
      },
    ],
    dataCompleteUntil: new Date("2026-02-01T02:59:59.000Z"),
    subtitle: "01/01/2026 a 31/01/2026",
  });
  const daily = snapshot.report.datasets[0];
  const eventRow = daily.rows.find((row) => row[0] === "2026-01-15");
  const missingRow = daily.rows.find((row) => row[0] === "2026-01-16");

  assert.equal(daily.coverage.canonical, true);
  assert.equal(daily.rows.length, 31);
  assert.equal(daily.columns.length, 4);
  assert.deepEqual(
    daily.columns.map((column) => column.key),
    [
      "date",
      "total",
      "__ipx_ai_daily_reference",
      "__ipx_ai_daily_delta",
    ],
  );
  assert.deepEqual(eventRow, ["2026-01-15", 160, 100, "abs=60; pct=60%"]);
  assert.deepEqual(missingRow, ["2026-01-16", null, 100, null]);
  assert.match(daily.coverage.notes.join(" "), /mediana dos outros dias/i);
  assert.match(daily.coverage.notes.join(" "), /mínimo de 3 controles/i);
});

test("base explícita prevalece e zero ou ausente nunca vira delta zero", () => {
  const rows = Array.from({ length: 31 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 0, index + 1));
    return {
      baseline:
        index === 14 ? 120 : index === 16 ? 0 : index === 17 ? null : 80,
      current: index === 14 ? 160 : index === 15 ? null : 100,
      date: new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        timeZone: "UTC",
        year: "numeric",
      }).format(date),
    };
  });
  const snapshot = createFixtureSnapshot({
    charts: [
      {
        option: {},
        table: {
          columns: [
            { key: "date", label: "Data" },
            { key: "baseline", label: "Base certificada", numeric: true },
            { key: "current", label: "Atual", numeric: true },
          ],
          rows,
          title: "Fluxo diário x base",
        },
        title: "Fluxo diário x base",
      },
    ],
    dataCompleteUntil: new Date("2026-02-01T02:59:59.000Z"),
    subtitle: "01/01/2026 a 31/01/2026",
  });
  const daily = snapshot.report.datasets[0];
  const byDate = new Map(daily.rows.map((row) => [row[0], row]));

  assert.equal(daily.columns.length, 4);
  assert.deepEqual(
    daily.columns.map((column) => column.key),
    ["date", "current", "baseline", "__ipx_ai_daily_delta"],
  );
  assert.deepEqual(byDate.get("2026-01-15"), [
    "2026-01-15",
    160,
    120,
    "abs=40; pct=33.333333%",
  ]);
  assert.deepEqual(byDate.get("2026-01-16"), [
    "2026-01-16",
    null,
    80,
    null,
  ]);
  assert.deepEqual(byDate.get("2026-01-17"), [
    "2026-01-17",
    100,
    0,
    null,
  ]);
  assert.deepEqual(byDate.get("2026-01-18"), [
    "2026-01-18",
    100,
    null,
    null,
  ]);
  assert.match(daily.coverage.notes.join(" "), /referência explícita/i);
  assert.doesNotMatch(daily.coverage.notes.join(" "), /mediana dos outros dias/i);
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
  assert.match(action, /createLegacyCompatibleAiInsightsRequest\(snapshot\)/);
  assert.match(action, /body: requestPayload/);
  assert.doesNotMatch(
    action,
    /captureSnapshot|localStorage|sessionStorage|URLSearchParams|router\.push/,
  );
  assert.doesNotMatch(layout, /AiAnalysisProvider/);
});

function createFixtureSnapshot({ charts, dataCompleteUntil, subtitle }) {
  return snapshotModule.createAiAnalysisSnapshot({
    companyScopeId: "company-fixture",
    module: "counting",
    payload: {
      charts,
      context: [`Período: ${subtitle}`],
      dataCompleteUntil,
      filename: "fixture",
      generatedAt: new Date("2026-08-27T15:00:00.000Z"),
      metrics: [],
      subtitle,
      timeZone: "America/Sao_Paulo",
      title: "Fixture de análise",
    },
    surface: "analysis",
    timeZone: "America/Sao_Paulo",
    userId: "user-fixture",
  });
}

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
