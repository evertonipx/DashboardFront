import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

import {
  OCCUPANCY_LOITERING_ACCUMULATED_SESSION_TIME_CARD_ID,
  OCCUPANCY_LOITERING_AREA_PERIOD_HEATMAP_CARD_ID,
  OCCUPANCY_LOITERING_AVERAGE_OVER_TIME_CARD_ID,
  OCCUPANCY_LOITERING_DURATION_DISTRIBUTION_CARD_ID,
  OCCUPANCY_LOITERING_PERCENTILES_BY_AREA_CARD_ID,
  OCCUPANCY_LOITERING_SESSIONS_OVER_TIME_CARD_ID,
  OCCUPANCY_LOITERING_TEMPORAL_CARD_IDS,
  buildOccupancyLoiteringAreaPeriodHeatmapOption,
  buildOccupancyLoiteringAverageOverTimeOption,
  buildOccupancyLoiteringTemporalChartOption,
  buildOccupancyLoiteringTemporalReportAssets,
  buildSharedOccupancyLoiteringTemporalModel,
} from "../components/app/occupancy-loitering-temporal-widgets.tsx";
import {
  buildOccupancyLoiteringSummaryModel,
  type OccupancyLoiteringSessionRow,
} from "../lib/occupancy-loitering.ts";
import type { OccupancyScenario } from "../lib/types.ts";

const require = createRequire(import.meta.url);

const scenario: OccupancyScenario = {
  active: true,
  areas: [
    { area_id: "parado", camera_id: "camera-private-a", label: "Parado" },
    { area_id: "espera", camera_id: "camera-private-a", label: "Espera" },
  ],
  company_id: "company-private",
  id: "scenario-private",
  name: "Recepção",
  object_class: "person",
};

const period = {
  from: new Date("2026-09-19T21:15:00.000Z"),
  to: new Date("2026-09-19T21:20:00.000Z"),
};

const sessions: OccupancyLoiteringSessionRow[] = [
  {
    area: "parado",
    camera_id: "camera-private-a",
    duration_seconds: 0,
    ended_at: "2026-09-19T21:16:05.000Z",
    object_class: "person",
  },
  {
    area: "parado",
    camera_id: "camera-private-a",
    duration_seconds: 20,
    ended_at: "2026-09-19T21:17:05.000Z",
    object_class: "person",
  },
  {
    area: "espera",
    camera_id: "camera-private-a",
    duration_seconds: 90,
    ended_at: "2026-09-19T21:18:05.000Z",
    object_class: "person",
  },
];

function temporalModel() {
  const context = buildOccupancyLoiteringSummaryModel([scenario], []);
  return buildSharedOccupancyLoiteringTemporalModel({
    dataPeriod: period,
    model: context,
    period,
    sessions,
    timeZone: "America/Sao_Paulo",
  });
}

function seriesFrom(option: unknown) {
  const series = (option as { series?: unknown }).series;
  return Array.isArray(series) ? series : series ? [series] : [];
}

test("catálogo temporal deixa o acumulado ao summary e mantém três séries de sessões", () => {
  assert.deepEqual(OCCUPANCY_LOITERING_TEMPORAL_CARD_IDS, [
    OCCUPANCY_LOITERING_AVERAGE_OVER_TIME_CARD_ID,
    OCCUPANCY_LOITERING_PERCENTILES_BY_AREA_CARD_ID,
    OCCUPANCY_LOITERING_AREA_PERIOD_HEATMAP_CARD_ID,
  ]);
  assert.ok(
    !(OCCUPANCY_LOITERING_TEMPORAL_CARD_IDS as readonly string[]).includes(
      OCCUPANCY_LOITERING_ACCUMULATED_SESSION_TIME_CARD_ID,
    ),
  );
  assert.ok(
    !(OCCUPANCY_LOITERING_TEMPORAL_CARD_IDS as readonly string[]).includes(
      OCCUPANCY_LOITERING_SESSIONS_OVER_TIME_CARD_ID,
    ),
  );
  assert.ok(
    !(OCCUPANCY_LOITERING_TEMPORAL_CARD_IDS as readonly string[]).includes(
      OCCUPANCY_LOITERING_DURATION_DISTRIBUTION_CARD_ID,
    ),
  );
  assert.equal(
    new Set(OCCUPANCY_LOITERING_TEMPORAL_CARD_IDS).size,
    OCCUPANCY_LOITERING_TEMPORAL_CARD_IDS.length,
  );

  const model = temporalModel();
  OCCUPANCY_LOITERING_TEMPORAL_CARD_IDS.forEach((cardId) => {
    const option = buildOccupancyLoiteringTemporalChartOption(
      cardId,
      model,
      "dark",
    );
    assert.ok(seriesFrom(option).length > 0, `${cardId} sem série`);
    assert.equal(
      (option as { backgroundColor?: unknown }).backgroundColor,
      "transparent",
    );
  });
});

test("cache compartilha o agrupamento apenas para a mesma fonte, contexto e intervalo", () => {
  const context = buildOccupancyLoiteringSummaryModel([scenario], []);
  const input = {
    dataPeriod: period,
    model: context,
    period,
    sessions,
    timeZone: "America/Sao_Paulo",
  } as const;
  const first = buildSharedOccupancyLoiteringTemporalModel(input);
  const second = buildSharedOccupancyLoiteringTemporalModel(input);
  assert.equal(first, second);

  const changed = buildSharedOccupancyLoiteringTemporalModel({
    ...input,
    dataPeriod: {
      from: period.from,
      to: new Date("2026-09-19T21:19:00.000Z"),
    },
  });
  assert.notEqual(changed, first);
});

test("média zero continua auditável sem imprimir rótulo zero no gráfico", () => {
  const model = temporalModel();
  const option = buildOccupancyLoiteringAverageOverTimeOption(model);
  const parado = seriesFrom(option)[0] as {
    data: Array<{
      hasSessions: boolean;
      rawValue: number | null;
      value: number | null;
    }>;
    label: { formatter: (params: unknown) => string };
  };
  const zeroPoint = parado.data.find(
    (point) => point.hasSessions && point.rawValue === 0,
  );
  assert.ok(zeroPoint);
  assert.equal(zeroPoint.value, 0);
  assert.equal(parado.label.formatter({ data: zeroPoint }), "");

  const tooltip = (option as {
    tooltip: { formatter: (params: unknown) => string };
  }).tooltip.formatter({ data: zeroPoint });
  assert.match(tooltip, /0 s/);
  assert.doesNotMatch(tooltip, /Nenhuma sessão concluída/);
});

test("acumulado não fabrica zero antes da primeira sessão e preserva o patamar depois", () => {
  const model = temporalModel();
  const option = buildOccupancyLoiteringTemporalChartOption(
    OCCUPANCY_LOITERING_ACCUMULATED_SESSION_TIME_CARD_ID,
    model,
  );
  const parado = seriesFrom(option)[0] as {
    data: Array<{
      hasSessions: boolean;
      rawValue: number | null;
      value: number | null;
    }>;
  };
  assert.equal(parado.data[0].hasSessions, false);
  assert.equal(parado.data[0].value, null);
  assert.equal(parado.data[1].hasSessions, true);
  assert.equal(parado.data[1].rawValue, 0);
  assert.equal(parado.data.at(-1)?.rawValue, 20);
});

test("heatmap diferencia bucket observado sem sessão e mantém maior intensidade mais escura", () => {
  const option = buildOccupancyLoiteringAreaPeriodHeatmapOption(
    temporalModel(),
    "dark",
    "#1267C4",
  );
  const [emptySeries, valueSeries] = seriesFrom(option) as Array<{
    data: Array<{ rawValue: number | null; value: [number, number, number] }>;
    itemStyle?: { color?: string };
    label?: {
      color?: unknown;
      formatter?: (params: unknown) => string;
      rich?: Record<string, { color?: string }>;
    };
  }>;
  assert.ok(emptySeries.data.some((point) => point.rawValue === null));
  assert.ok(valueSeries.data.some((point) => point.rawValue === 0));
  assert.notEqual(emptySeries.itemStyle?.color, "#F8FAFC");

  const visualMaps = (option as {
    visualMap: Array<{
      inRange?: { color: string[] };
      seriesIndex?: number | number[];
      type?: string;
    }>;
  }).visualMap;
  assert.equal(visualMaps[0]?.type, "piecewise");
  assert.equal(visualMaps[0]?.seriesIndex, 0);
  assert.equal(visualMaps[1]?.type, "continuous");
  assert.equal(visualMaps[1]?.seriesIndex, 1);
  const colors = visualMaps[1]?.inRange?.color ?? [];
  assert.equal(colors[0]?.toUpperCase(), "#FFFFFF");
  assert.notEqual(colors.at(-1)?.toUpperCase(), "#FFFFFF");
  assert.notEqual(typeof valueSeries.label?.color, "function");
  assert.equal(valueSeries.label?.rich?.soft?.color, "#0F172A");
  assert.equal(valueSeries.label?.rich?.strong?.color, "#FFFFFF");
  const highest = valueSeries.data.reduce((selected, candidate) =>
    (candidate.rawValue ?? -1) > (selected.rawValue ?? -1)
      ? candidate
      : selected,
  );
  assert.match(
    valueSeries.label?.formatter?.({ data: highest }) ?? "",
    /^\{(?:soft|strong)\|.+\}$/,
  );
});

test("heatmap temporal cobre cada série com visualMap e renderiza no ECharts", () => {
  const echarts = require("echarts/core");
  const { HeatmapChart } = require("echarts/charts");
  const {
    DataZoomComponent,
    GridComponent,
    TooltipComponent,
    VisualMapComponent,
  } = require("echarts/components");
  const { LegacyGridContainLabel } = require("echarts/features");
  const { SVGRenderer } = require("echarts/renderers");
  echarts.use([
    DataZoomComponent,
    GridComponent,
    HeatmapChart,
    LegacyGridContainLabel,
    TooltipComponent,
    VisualMapComponent,
    SVGRenderer,
  ]);

  const option = buildOccupancyLoiteringAreaPeriodHeatmapOption(
    temporalModel(),
    "dark",
    "#1267C4",
  );
  const heatmapSeriesIndexes = seriesFrom(option).flatMap((series, index) =>
    (series as { type?: unknown }).type === "heatmap" ? [index] : [],
  );
  const visualMaps = Array.isArray(
    (option as { visualMap?: unknown }).visualMap,
  )
    ? (option as {
        visualMap: Array<{ seriesIndex?: number | number[] }>;
      }).visualMap
    : [(option as {
        visualMap?: { seriesIndex?: number | number[] };
      }).visualMap].filter(Boolean);
  const coveredSeriesIndexes = new Set(
    visualMaps.flatMap((visualMap) => {
      const seriesIndex = visualMap?.seriesIndex;
      return Array.isArray(seriesIndex)
        ? seriesIndex
        : typeof seriesIndex === "number"
          ? [seriesIndex]
          : heatmapSeriesIndexes;
    }),
  );
  assert.deepEqual(
    heatmapSeriesIndexes.filter((index) => !coveredSeriesIndexes.has(index)),
    [],
    "toda série heatmap precisa estar associada a um visualMap",
  );

  const chart = echarts.init(null, null, {
    height: 420,
    renderer: "svg",
    ssr: true,
    width: 760,
  });
  try {
    assert.doesNotThrow(
      () => chart.setOption(option),
      "a opção completa não pode disparar 'Heatmap must use with visualMap'",
    );
    assert.match(chart.renderToSVGString(), /<svg/);
  } finally {
    chart.dispose();
  }
});

test("relatório explicita duração, prévia e nunca expõe IDs operacionais", () => {
  const assets = buildOccupancyLoiteringTemporalReportAssets({
    contextLabel: "01/09/2026 a 19/09/2026",
    dataContextLabel: "19/09/2026",
    model: temporalModel(),
    sessionsSlicedByDay: true,
    timeZone: "America/Sao_Paulo",
  });
  assert.equal(assets.length, OCCUPANCY_LOITERING_TEMPORAL_CARD_IDS.length);
  assets.forEach(({ chart }) => {
    assert.match(chart.description ?? "", /permanênc/i);
    assert.match(chart.description ?? "", /não o tempo cronológico/i);
    assert.match(chart.description ?? "", /prévia efetivamente carregada/i);
    assert.match(chart.description ?? "", /horário de encerramento/i);
    assert.match(chart.description ?? "", /período de saída/i);
    const presentation = JSON.stringify({
      description: chart.description,
      table: chart.table,
      title: chart.title,
    });
    assert.doesNotMatch(presentation, /camera-private-a|scenario-private|company-private/);
  });
});

test("fit de exportação restaura duração crua depois do formatter global", () => {
  const context = buildOccupancyLoiteringSummaryModel([scenario], []);
  const extremeSessions: OccupancyLoiteringSessionRow[] = [
    sessions[1],
    {
      area: "parado",
      camera_id: "camera-private-a",
      duration_seconds: 789_852_803,
      ended_at: "2026-09-19T21:18:10.000Z",
      object_class: "person",
    },
  ];
  const model = buildSharedOccupancyLoiteringTemporalModel({
    dataPeriod: period,
    model: context,
    period,
    sessions: extremeSessions,
    timeZone: "America/Sao_Paulo",
  });
  const averageAsset = buildOccupancyLoiteringTemporalReportAssets({
    contextLabel: "19/09/2026",
    model,
    timeZone: "America/Sao_Paulo",
    visibleCardIds: [OCCUPANCY_LOITERING_AVERAGE_OVER_TIME_CARD_ID],
  })[0];
  assert.ok(averageAsset?.chart.fitOption);
  const originalSeries = seriesFrom(averageAsset.chart.option) as Array<{
    data: Array<{
      hasSessions: boolean;
      rawValue: number | null;
      value: number | null;
    }>;
    label?: Record<string, unknown>;
    type?: unknown;
  }>;
  const exportedOption = {
    ...averageAsset.chart.option,
    series: originalSeries.map((series) => ({
      ...series,
      label: {
        ...series.label,
        formatter: ({ dataIndex }: { dataIndex?: number }) =>
          dataIndex === 0 ? "" : "20,5",
      },
    })),
  };
  const fitted = averageAsset.chart.fitOption(exportedOption, {
    height: 360,
    width: 980,
  });
  const fittedSeries = seriesFrom(fitted) as Array<{
    data: Array<{
      hasSessions: boolean;
      rawValue: number | null;
      value: number | null;
    }>;
    label: { formatter: (params: unknown) => string };
  }>;
  const pointIndex = fittedSeries[0].data.findIndex(
    (point) => point.rawValue === 789_852_803,
  );
  assert.ok(pointIndex > 0);
  const point = fittedSeries[0].data[pointIndex];
  assert.notEqual(point.value, point.rawValue);
  assert.match(
    fittedSeries[0].label.formatter({
      data: point,
      dataIndex: pointIndex,
      value: point.value,
    }),
    /a$/,
  );
  assert.equal(
    fittedSeries[0].label.formatter({
      data: fittedSeries[0].data[0],
      dataIndex: 0,
      value: fittedSeries[0].data[0].value,
    }),
    "",
  );
});
