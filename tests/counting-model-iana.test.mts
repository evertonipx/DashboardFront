import assert from "node:assert/strict";
import test from "node:test";

process.env.TZ = "UTC";

const companyTime = await import("../lib/company-time-zone.ts");
const scenarioAnalytics = await import("../lib/scenario-analytics.ts");
const periodAnalysis = await import("../lib/period-analysis-model.ts");
const countingIntelligence = await import("../lib/counting-intelligence.ts");

const scenario = {
  active: true,
  company_id: "company",
  description: "Entrada principal",
  id: "entry",
  lines: [{ action_multiplier: 1 as const, line_count_id: "line-entry" }],
  name: "Entrada",
  scenario_type: "counting",
};

function row(bucket: string, total: number) {
  return {
    bucket,
    camera_id: "camera",
    line_count_id: "line-entry",
    metric_type: "count",
    total,
  };
}

function instant(value: string, timeZone: string) {
  const result = companyTime.companyDateTimeLocalInstant(value, timeZone);
  assert.ok(result, `${value} precisa existir em ${timeZone}`);
  return result;
}

function analysisData(hourRows: ReturnType<typeof row>[]) {
  const empty = (granularity: "day" | "hour" | "minute" | "month") => ({
    granularity,
    rows: [],
  });
  return {
    baseline: {},
    contextHour: { granularity: "hour" as const, rows: hourRows },
    day: empty("day"),
    hour: { granularity: "hour" as const, rows: hourRows },
    minute: empty("minute"),
    month: empty("month"),
  };
}

function widget(kind: string, granularity: "day" | "hour" | "minute" = "hour") {
  return {
    baseline: "previous_period",
    entryScenarioIds: [],
    exitScenarioIds: [],
    granularity,
    id: `iana-${kind}`,
    kind,
    scenarioIds: [],
    scopeMode: "scenario",
    selectionMode: "all",
    startHour: 0,
    title: kind,
  } as never;
}

test("scenario analytics alinha horas a um offset IANA fracionário", () => {
  const timeZone = "Asia/Kathmandu";
  const from = instant("2026-01-02T00:00:00", timeZone);
  const to = instant("2026-01-03T00:00:00", timeZone);
  const points = scenarioAnalytics.buildCombinedScenarioPoints({
    companyTimeZone: timeZone,
    from,
    granularity: "hour",
    rows: [
      row("2026-01-01T18:15:00.000Z", 3),
      row("2026-01-01T19:15:00.000Z", 4),
    ],
    scenarios: [scenario],
    sourceGranularity: "hour",
    to,
  });

  assert.equal(points.length, 24);
  assert.equal(points[0].bucket, "2026-01-01T18:15:00.000Z");
  assert.deepEqual(
    points.slice(0, 2).map((point) => point.total),
    [3, 4],
  );
  assert.match(points[0].label, /02\/01.*00/);
});

test("scenario analytics materializa dias DST com 23 e 25 instantes reais", () => {
  const timeZone = "America/New_York";
  const spring = scenarioAnalytics.buildCombinedScenarioPoints({
    companyTimeZone: timeZone,
    from: instant("2026-03-08T00:00:00", timeZone),
    granularity: "hour",
    rows: [],
    scenarios: [scenario],
    sourceGranularity: "hour",
    to: instant("2026-03-09T00:00:00", timeZone),
  });
  const fall = scenarioAnalytics.buildCombinedScenarioPoints({
    companyTimeZone: timeZone,
    from: instant("2026-11-01T00:00:00", timeZone),
    granularity: "hour",
    rows: [],
    scenarios: [scenario],
    sourceGranularity: "hour",
    to: instant("2026-11-02T00:00:00", timeZone),
  });

  assert.equal(spring.length, 23);
  assert.equal(
    spring.some(
      (point) =>
        companyTime.companyZonedDateParts(new Date(point.bucket), timeZone)
          .hour === 2,
    ),
    false,
  );
  assert.equal(fall.length, 25);
  assert.equal(
    fall.filter(
      (point) =>
        companyTime.companyZonedDateParts(new Date(point.bucket), timeZone)
          .hour === 1,
    ).length,
    2,
  );
  assert.equal(new Set(fall.map((point) => point.bucket)).size, 25);
});

test("Análises projeta heatmap e perfil pela hora civil da empresa", () => {
  const timeZone = "America/Sao_Paulo";
  const period = {
    from: new Date(2026, 8, 7),
    to: new Date(2026, 8, 8),
  };
  const rows = [
    row("2026-09-07T02:00:00.000Z", 900),
    row("2026-09-07T03:00:00.000Z", 10),
    row("2026-09-08T02:00:00.000Z", 20),
    row("2026-09-08T03:00:00.000Z", 800),
  ];
  const data = analysisData(rows);
  const profile = periodAnalysis.buildPeriodAnalysisWidgetModel({
    companyTimeZone: timeZone,
    data,
    period,
    scenarios: [scenario],
    widget: widget("hour_profile"),
  });
  const heatmap = periodAnalysis.buildPeriodAnalysisWidgetModel({
    companyTimeZone: timeZone,
    data,
    period,
    scenarios: [scenario],
    widget: widget("heatmap"),
  });
  const profileRows = profile.table?.rows ?? [];
  const heatmapSeries = Array.isArray(heatmap.option?.series)
    ? heatmap.option.series[0]
    : undefined;

  assert.equal(profileRows.find((item) => item.hour === "00h")?.total, 10);
  assert.equal(profileRows.find((item) => item.hour === "23h")?.total, 20);
  assert.deepEqual(heatmapSeries?.data, [
    [5, 23, 900],
    [6, 0, 10],
    [6, 23, 20],
  ]);
});

test("Relatórios deriva ano, mês aberto e direção pelo calendário IANA", () => {
  const timeZone = "America/Sao_Paulo";
  const model = countingIntelligence.buildCountingIntelligenceModel({
    companyTimeZone: timeZone,
    hourlyRows: [
      row("2025-12-31T23:00:00.000Z", 7),
      row("2026-01-01T02:00:00.000Z", 11),
    ],
    includeOpenPeriod: true,
    monthlyRows: [row("2025-12-01", 30)],
    now: new Date("2026-01-01T02:30:00.000Z"),
    period: {
      from: new Date(2025, 11, 1),
      to: new Date(2026, 1, 1),
    },
    scenarios: [scenario],
    scope: { cameraIds: [], name: "Entrada", scenario },
  });

  assert.equal(model.currentYear, 2025);
  assert.equal(model.currentMonth, 11);
  assert.equal(model.periodTo.getTime(), new Date(2026, 0, 1).getTime());
  assert.equal(model.accessHours.find((item) => item.hour === 20)?.entry, 7);
  assert.equal(model.accessHours.find((item) => item.hour === 23)?.entry, 11);
});
