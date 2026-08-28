import type {
  AiAnalysisSnapshot,
  AiInsightCell,
  AiInsightModule,
  AiInsightSurface,
} from "@/lib/ai-insights-contract";
import {
  AI_INSIGHTS_CANONICAL_DAILY_NOTE_PREFIX,
  AI_INSIGHTS_GRANULARITY_NOTE_PREFIX,
  AI_INSIGHTS_LIMITS,
  AiAnalysisSnapshotSchema,
} from "@/lib/ai-insights-contract";
import { companyDateKey } from "@/lib/company-time-zone";
import type {
  ReportPayload,
  ReportTable,
  ReportTableColumn,
} from "@/lib/report-export";

const MAX_DATASETS = 24;
const REQUEST_ENVELOPE_RESERVE_BYTES = 8 * 1024;
const MAX_SAMPLED_ROWS_PER_DATASET = 120;
const MAX_DAILY_COLUMNS = 4;
const MAX_COLUMNS_PER_DATASET = 10;
const MAX_CONTEXT_ITEMS = 24;
const MAX_METRICS = 40;
const MAX_CELL_TEXT = 200;
const MAX_SHORT_TEXT = 160;
const MAX_DESCRIPTION_TEXT = 340;
const MAX_STATISTICS = 16;
const MIN_SAME_WEEKDAY_MONTH_CONTROLS = 3;
const DERIVED_DAILY_REFERENCE_KEY = "__ipx_ai_daily_reference";
const DERIVED_DAILY_DELTA_KEY = "__ipx_ai_daily_delta";

type AiAnalysisSnapshotInput = {
  companyScopeId: string;
  module: AiInsightModule;
  payload: ReportPayload;
  surface: AiInsightSurface;
  timeZone: string;
  userId: string;
};

type Dataset = AiAnalysisSnapshot["report"]["datasets"][number];
type DatasetColumn = Dataset["columns"][number];
type DatasetStatistic = Dataset["statistics"][number];

type NumericAccumulator = {
  count: number;
  mean: number;
  maximum: number;
  maximumIndex: number;
  minimum: number;
  minimumIndex: number;
};

type TableCandidate = {
  description: string | null;
  originalIndex: number;
  table: ReportTable;
  title: string;
};

type DatasetGranularity = Dataset["coverage"]["granularity"];

type TableProfile = {
  canonicalDates: string[] | null;
  dateColumnIndex: number;
  dailyScore: number;
  granularity: DatasetGranularity;
};

type CivilDateRange = {
  from: string;
  to: string;
};

type DailyEnrichment = {
  mode: "calculated" | "explicit";
  primaryColumnKey: string;
  referenceColumnKey: string;
  references: Array<number | null>;
};

type DailyColumnSelection = {
  columns: ReportTableColumn[];
  enrichment: DailyEnrichment | null;
  referenceNote: string | null;
};

export function createAiAnalysisSnapshot({
  companyScopeId,
  module,
  payload,
  surface,
  timeZone,
  userId,
}: AiAnalysisSnapshotInput): AiAnalysisSnapshot {
  const cleanCompanyScopeId = requireText(companyScopeId, "empresa");
  const cleanUserId = requireText(userId, "usuário");
  const cleanTimeZone = requireText(timeZone, "fuso IANA");
  if (payload.timeZone && payload.timeZone !== cleanTimeZone) {
    throw new Error(
      "O fuso do relatório diverge do contexto autenticado da empresa.",
    );
  }

  const capturedAt = new Date();
  const dataCompleteUntil = validDate(payload.dataCompleteUntil);
  const referenceDate = dataCompleteUntil
    ? companyDateKey(dataCompleteUntil, cleanTimeZone)
    : null;
  const explicitPeriod = resolveExplicitSnapshotPeriod(
    payload,
    referenceDate,
  );
  const candidates = collectTableCandidates(payload);
  const metrics = payload.metrics
    .slice(0, Math.min(MAX_METRICS, AI_INSIGHTS_LIMITS.metrics))
    .map((metric) => ({
      description: nullableSanitizedText(
        metric.description,
        MAX_DESCRIPTION_TEXT,
      ),
      label: sanitizedRequiredText(metric.label, 100, "Indicador"),
      value: sanitizeCell(metric.value),
    }));
  if (!candidates.length && metrics.length) {
    candidates.push(metricTableCandidate(metrics, candidates.length));
  }

  const datasets = buildDatasets(candidates, explicitPeriod);
  if (!datasets.length) {
    throw new Error(
      "A visão configurada ainda não possui dados tabulares ou indicadores para análise.",
    );
  }

  const context = (payload.context ?? [])
    .slice(0, Math.min(MAX_CONTEXT_ITEMS, AI_INSIGHTS_LIMITS.contextItems))
    .map((item, index) => contextItem(item, index));
  const subtitle = nullableSanitizedText(
    payload.subtitle,
    MAX_DESCRIPTION_TEXT,
  );
  const period = resolveSnapshotPeriod(
    payload,
    datasets,
    cleanTimeZone,
    dataCompleteUntil,
    explicitPeriod,
  );
  const snapshot: AiAnalysisSnapshot = {
    binding: {
      companyScopeId: cleanCompanyScopeId,
      timeZone: cleanTimeZone,
      userId: cleanUserId,
    },
    report: {
      context,
      datasets,
      metrics,
      period: {
        from: period.from,
        label: sanitizedRequiredText(
          payload.subtitle || periodContext(payload.context) || "Período da visão configurada",
          MAX_SHORT_TEXT,
          "Período da visão configurada",
        ),
        to: period.to,
      },
      subtitle,
      title: sanitizedRequiredText(
        payload.title,
        MAX_SHORT_TEXT,
        "Visão operacional",
      ),
    },
    source: {
      capturedAt: capturedAt.toISOString(),
      dataCompleteUntil: dataCompleteUntil?.toISOString() ?? null,
      module,
      surface,
    },
    version: 1,
  };

  return AiAnalysisSnapshotSchema.parse(
    fitSnapshotToBodyLimit(
      snapshot,
      AI_INSIGHTS_LIMITS.bodyBytes - REQUEST_ENVELOPE_RESERVE_BYTES,
    ),
  );
}

export function reportPayloadHasAnalyzableData(payload: ReportPayload) {
  if (payload.metrics.length) return true;
  return [...payload.charts.map((chart) => chart.table), ...(payload.tables ?? [])]
    .some((table) => table.rows.length && safeColumns(table.columns).length);
}

function buildDatasets(
  candidates: TableCandidate[],
  explicitPeriod: CivilDateRange | null,
) {
  const datasets: Dataset[] = [];
  let remainingRows = AI_INSIGHTS_LIMITS.totalRows;
  let remainingCells = AI_INSIGHTS_LIMITS.totalCells;

  const profiled = candidates.map((candidate) => ({
    candidate,
    columns: safeColumns(candidate.table.columns),
    profile: profileTableCandidate(candidate, explicitPeriod),
  }));
  const primaryDaily = profiled
    .filter(
      ({ profile }) =>
        Boolean(profile.canonicalDates?.length) &&
        profile.granularity === "day" &&
        profile.dailyScore > 0,
    )
    .sort(
      (left, right) =>
        right.profile.dailyScore - left.profile.dailyScore ||
        right.candidate.table.rows.length - left.candidate.table.rows.length ||
        left.candidate.originalIndex - right.candidate.originalIndex,
    )[0];
  const ordered = primaryDaily
    ? [primaryDaily, ...profiled.filter((entry) => entry !== primaryDaily)]
    : profiled;

  for (const { candidate, columns: availableColumns, profile } of ordered) {
    if (
      datasets.length >= Math.min(MAX_DATASETS, AI_INSIGHTS_LIMITS.datasets) ||
      remainingRows <= 0
    ) break;
    const preserveCompleteDailyTimeline = primaryDaily?.candidate === candidate;
    const selection: DailyColumnSelection = preserveCompleteDailyTimeline
      ? selectDailyColumns(availableColumns, profile, candidate.table.rows)
      : {
          columns: availableColumns,
          enrichment: null,
          referenceNote: null,
        };
    const { columns } = selection;
    if (!columns.length || remainingCells < columns.length) continue;

    if (
      preserveCompleteDailyTimeline &&
      candidate.table.rows.length > AI_INSIGHTS_LIMITS.dailyDatasetRows
    ) {
      throw new Error(
        `O período possui ${candidate.table.rows.length} dias, acima do limite seguro de ${AI_INSIGHTS_LIMITS.dailyDatasetRows} dias por análise. Divida a consulta sem permitir amostragem silenciosa.`,
      );
    }

    const maximumRows = Math.min(
      preserveCompleteDailyTimeline
        ? AI_INSIGHTS_LIMITS.dailyDatasetRows
        : Math.min(
            MAX_SAMPLED_ROWS_PER_DATASET,
            AI_INSIGHTS_LIMITS.sampledDatasetRows,
          ),
      AI_INSIGHTS_LIMITS.datasetRows,
      remainingRows,
      Math.floor(remainingCells / columns.length),
    );
    if (
      preserveCompleteDailyTimeline &&
      maximumRows < candidate.table.rows.length
    ) {
      throw new Error(
        "A série diária completa não cabe no contrato seguro da análise. Reduza o período consultado.",
      );
    }
    const dataset = tableCandidateToDataset(
      candidate,
      columns,
      maximumRows,
      profile,
      preserveCompleteDailyTimeline,
      selection.enrichment,
      selection.referenceNote,
    );
    datasets.push(dataset);
    remainingRows -= dataset.rows.length;
    remainingCells -= dataset.rows.length * dataset.columns.length;
  }

  return datasets;
}

function tableCandidateToDataset(
  candidate: TableCandidate,
  selectedColumns: ReportTableColumn[],
  maximumRows: number,
  profile: TableProfile,
  preserveCompleteTimeline: boolean,
  dailyEnrichment: DailyEnrichment | null,
  dailyReferenceNote: string | null,
): Dataset {
  const columns = selectedColumns.map<DatasetColumn>((column, index) => ({
    key: sanitizedRequiredText(column.key, 80, `coluna_${index + 1}`),
    label: sanitizedRequiredText(column.label, 100, `Coluna ${index + 1}`),
    role: index === 0 ? "dimension" : column.numeric ? "measure" : "context",
    unit: inferColumnUnit(column),
  }));
  const numericColumnIndexes = selectedColumns.flatMap((column, index) =>
    column.numeric ? [index] : [],
  );
  const numericSummary = summarizeNumericColumns(
    candidate.table.rows,
    selectedColumns,
    numericColumnIndexes,
  );
  const statistics = buildCompleteStatistics(
    numericSummary.accumulators,
    columns,
    numericColumnIndexes,
  );
  const sampledIndexes = preserveCompleteTimeline
    ? Array.from(
        { length: candidate.table.rows.length },
        (_, index) => index,
      )
    : selectRepresentativeRowIndexes(
        candidate.table.rows.length,
        numericSummary.extremeIndexes,
        maximumRows,
      );
  const sampled = sampledIndexes.length < candidate.table.rows.length;
  const notes = [
    "Valores ausentes permanecem nulos e não representam zero.",
    `${AI_INSIGHTS_GRANULARITY_NOTE_PREFIX} ${profile.granularity}.`,
  ];
  if (sampled) {
    notes.push(
      "Amostra determinística com primeiro, último, extremos numéricos e distribuição uniforme.",
      "As estatísticas foram calculadas sobre todas as linhas antes da amostragem.",
    );
  }
  if (preserveCompleteTimeline) {
    notes.push(
      `${AI_INSIGHTS_CANONICAL_DAILY_NOTE_PREFIX} todos os dias foram enviados, em ordem, sem amostragem.`,
    );
  }
  if (dailyReferenceNote) notes.push(dailyReferenceNote);
  if (dailyEnrichment) {
    notes.push(
      "Delta absoluto e percentual ficam nulos se a medida ou referência faltar; referência zero também invalida ambos.",
      "Última coluna usa abs=<valor>; pct=<valor>% para transportar ambos os deltas sem exceder quatro colunas.",
    );
  }
  const measureColumnCount = numericColumnIndexes.length;
  if (measureColumnCount > Math.floor(MAX_STATISTICS / 4)) {
    notes.push(
      `Estatísticas detalhadas limitadas às primeiras ${Math.floor(MAX_STATISTICS / 4)} medidas.`,
    );
  }

  return {
    columns,
    coverage: {
      canonical: preserveCompleteTimeline,
      granularity: profile.granularity,
      includedRows: sampledIndexes.length,
      notes: notes.slice(0, 6),
      omittedRows: candidate.table.rows.length - sampledIndexes.length,
      originalRows: candidate.table.rows.length,
      strategy: sampled ? "sampled" : "complete",
    },
    description: candidate.description,
    id: `dataset-${String(candidate.originalIndex + 1).padStart(2, "0")}`,
    rows: sampledIndexes.map((index) => {
      const row = candidate.table.rows[index];
      return selectedColumns.map((column, columnIndex) => {
        if (preserveCompleteTimeline && columnIndex === 0) {
          return profile.canonicalDates?.[index] ?? sanitizeCell(row[column.key]);
        }
        if (dailyEnrichment && column.key === DERIVED_DAILY_REFERENCE_KEY) {
          return dailyEnrichment.references[index] ?? null;
        }
        if (dailyEnrichment && column.key === DERIVED_DAILY_DELTA_KEY) {
          return dailyComparisonCell(
            row[dailyEnrichment.primaryColumnKey],
            dailyEnrichment.references[index] ?? null,
          );
        }
        return sanitizeCell(row[column.key]);
      });
    }),
    statistics,
    title: sanitizedRequiredText(
      candidate.title,
      MAX_SHORT_TEXT,
      `Conjunto de dados ${candidate.originalIndex + 1}`,
    ),
  };
}

/**
 * Keeps the request wire-compatible with the previous strict v1 server while
 * retaining the richer coverage metadata inside the current client. The new
 * server reconstructs and validates canonical coverage from the legacy marker,
 * exact period and contiguous ISO dates; an old server simply ignores no data.
 */
export function createLegacyCompatibleAiInsightsRequest(
  snapshot: AiAnalysisSnapshot,
) {
  return {
    snapshot: {
      ...snapshot,
      report: {
        ...snapshot.report,
        datasets: snapshot.report.datasets.map((dataset) => ({
          ...dataset,
          coverage: {
            includedRows: dataset.coverage.includedRows,
            notes: dataset.coverage.notes,
            originalRows: dataset.coverage.originalRows,
            strategy: dataset.coverage.strategy,
          },
        })),
      },
    },
  };
}

function collectTableCandidates(payload: ReportPayload) {
  const candidates: TableCandidate[] = [];
  const seenTables = new WeakSet<ReportTable>();

  function addCandidate(candidate: Omit<TableCandidate, "originalIndex">) {
    if (seenTables.has(candidate.table)) return;
    if (!safeColumns(candidate.table.columns).length) return;
    seenTables.add(candidate.table);
    candidates.push({ ...candidate, originalIndex: candidates.length });
  }

  for (const chart of payload.charts) {
    addCandidate({
      description: nullableSanitizedText(
        [chart.description, chart.comparison].filter(Boolean).join(" "),
        MAX_DESCRIPTION_TEXT,
      ),
      table: chart.table,
      title: chart.title,
    });
  }
  for (const table of payload.tables ?? []) {
    addCandidate({
      description: nullableSanitizedText(
        table.description,
        MAX_DESCRIPTION_TEXT,
      ),
      table,
      title: table.title,
    });
  }

  return candidates;
}

function metricTableCandidate(
  metrics: AiAnalysisSnapshot["report"]["metrics"],
  originalIndex: number,
): TableCandidate {
  return {
    description: "Indicadores consolidados exibidos na visão configurada.",
    originalIndex,
    table: {
      columns: [
        { key: "metric", label: "Indicador" },
        { key: "value", label: "Valor" },
        { key: "description", label: "Contexto" },
      ],
      rows: metrics.map((metric) => ({
        description: metric.description,
        metric: metric.label,
        value: metric.value,
      })),
      title: "Indicadores da visão",
    },
    title: "Indicadores da visão",
  };
}

function safeColumns(columns: ReportTableColumn[]) {
  return columns
    .filter((column) => !sensitiveColumn(column))
    .slice(0, Math.min(MAX_COLUMNS_PER_DATASET, AI_INSIGHTS_LIMITS.datasetColumns));
}

function profileTableCandidate(
  candidate: TableCandidate,
  explicitPeriod: CivilDateRange | null,
): TableProfile {
  const columns = safeColumns(candidate.table.columns);
  const searchableText = normalizeSemanticText(
    `${candidate.title} ${candidate.description ?? ""} ${columns
      .map((column) => `${column.key} ${column.label}`)
      .join(" ")}`,
  );
  const dateColumnIndex = findDailyDateColumn(candidate.table.rows, columns);
  const numericMeasures = columns.filter(
    (column, index) => index !== dateColumnIndex && column.numeric,
  );
  const canonicalDates =
    dateColumnIndex >= 0 && numericMeasures.length && explicitPeriod
      ? validateCanonicalDailySeries(
          candidate.table.rows,
          columns[dateColumnIndex],
          explicitPeriod,
          searchableText,
        )
      : null;
  const granularity = inferDatasetGranularity(
    searchableText,
    dateColumnIndex,
    candidate.table.rows,
    dateColumnIndex >= 0 ? columns[dateColumnIndex] : null,
    canonicalDates,
  );

  const measureSemantics = normalizeSemanticText(
    numericMeasures.map((column) => `${column.key} ${column.label}`).join(" "),
  );
  const dailyScore = canonicalDates
    ? Math.min(candidate.table.rows.length, 5_000) +
      (/\b(total|volume|fluxo|current|atual|ocupacao)\b/.test(measureSemantics)
        ? 400
        : 0) +
      (/\b(base|baseline|compar|tendencia|media)\b/.test(
        `${measureSemantics} ${searchableText}`,
      )
        ? 250
        : 0) +
      (/\b(diari\w*|dia|dias|date|data|calendar)\b/.test(searchableText)
        ? 100
        : 0)
    : 0;

  return { canonicalDates, dateColumnIndex, dailyScore, granularity };
}

function findDailyDateColumn(
  rows: ReportTable["rows"],
  columns: ReportTableColumn[],
) {
  let bestIndex = -1;
  let bestScore = Number.NEGATIVE_INFINITY;

  columns.forEach((column, index) => {
    const values = rows.map((row) => row[column.key]);
    if (!values.length) return;
    const recognizedDates = values.filter(isDailyDimensionValue).length;
    const recognizedRatio = recognizedDates / values.length;
    if (recognizedRatio < 0.7) return;

    const semantic = normalizeSemanticText(`${column.key} ${column.label}`);
    const directDateSemantic = /\b(date|data|day|dia)\b/.test(semantic);
    const periodSemantic = /\b(period|periodo|bucket)\b/.test(semantic);
    if (!directDateSemantic && !periodSemantic) return;

    const score =
      recognizedRatio * 100 + (directDateSemantic ? 30 : 0) +
      (periodSemantic ? 10 : 0) - index;
    if (score > bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  });

  return bestIndex;
}

function validateCanonicalDailySeries(
  rows: ReportTable["rows"],
  dateColumn: ReportTableColumn,
  explicitPeriod: CivilDateRange,
  searchableText: string,
) {
  const expectedDates = listCivilDateKeys(explicitPeriod);
  if (!expectedDates.length || rows.length !== expectedDates.length) return null;
  const dateSemantic = normalizeSemanticText(
    `${dateColumn.key} ${dateColumn.label}`,
  );
  const identities = new Set<string>();

  for (let index = 0; index < expectedDates.length; index += 1) {
    const value = rows[index][dateColumn.key];
    const identity = dailyDimensionIdentity(value, expectedDates[index]);
    if (
      !identity ||
      identities.has(identity) ||
      !dailyDimensionMatchesDate(value, expectedDates[index])
    ) {
      return null;
    }
    if (
      identity.startsWith("day:") &&
      (/\b(month|mes)\b/.test(dateSemantic) ||
        /\b(minut\w*|minute\w*|hour\w*|hora\w*|horari\w*|week\w*|seman\w*|month\w*|mes|mensal|mensais)\b/.test(
          searchableText,
        ))
    ) {
      return null;
    }
    identities.add(identity);
  }
  return expectedDates;
}

function dailyDimensionIdentity(value: unknown, expectedDate: string) {
  if (typeof value === "number" || /^\d{1,2}$/.test(String(value).trim())) {
    const day = Number(value);
    return Number.isInteger(day) && day >= 1 && day <= 31
      ? `day:${day}`
      : null;
  }
  if (typeof value !== "string") return null;
  const clean = value.trim();
  const local = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/.exec(clean);
  if (local && !local[3]) {
    return `month-day:${String(Number(local[2])).padStart(2, "0")}-${String(Number(local[1])).padStart(2, "0")}`;
  }
  const date = normalizeCivilDate(clean, expectedDate);
  return date ? `date:${date}` : null;
}

function dailyDimensionMatchesDate(value: unknown, expectedDate: string) {
  const expected = /^(\d{4})-(\d{2})-(\d{2})$/.exec(expectedDate);
  if (!expected) return false;
  const expectedMonth = Number(expected[2]);
  const expectedDay = Number(expected[3]);

  if (typeof value === "number" || /^\d{1,2}$/.test(String(value).trim())) {
    return Number(value) === expectedDay;
  }
  if (typeof value !== "string") return false;
  const clean = value.trim();
  const local = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/.exec(clean);
  if (local && !local[3]) {
    return Number(local[1]) === expectedDay && Number(local[2]) === expectedMonth;
  }
  return normalizeCivilDate(clean, expectedDate) === expectedDate;
}

function inferDatasetGranularity(
  searchableText: string,
  dateColumnIndex: number,
  rows: ReportTable["rows"],
  dateColumn: ReportTableColumn | null,
  canonicalDates: string[] | null,
): DatasetGranularity {
  if (canonicalDates) return "day";
  if (/\b(minut\w*|minute\w*)\b/.test(searchableText)) return "minute";
  if (/\b(hour\w*|hora\w*|horari\w*)\b/.test(searchableText)) return "hour";
  if (/\b(week\w*|seman\w*)\b/.test(searchableText)) return "week";

  const hasDailyValues =
    dateColumnIndex >= 0 &&
    Boolean(rows.length) &&
    Boolean(dateColumn) &&
    rows.filter((row) => isDailyDimensionValue(row[dateColumn!.key])).length /
      rows.length >=
      0.7;
  const hasDailySemantic =
    /\b(day|days|daily|dia|dias|diari\w*|date|data|calendar)\b/.test(
      searchableText,
    );
  if (hasDailyValues && hasDailySemantic) return "day";
  if (/\b(month\w*|mes|mensal|mensais)\b/.test(searchableText)) return "month";
  if (hasDailyValues) return "day";
  return "other";
}

function selectDailyColumns(
  columns: ReportTableColumn[],
  profile: TableProfile,
  rows: ReportTable["rows"],
): DailyColumnSelection {
  const dateColumn = columns[profile.dateColumnIndex];
  if (!dateColumn || !rows.length || !profile.canonicalDates) {
    return { columns: [], enrichment: null, referenceNote: null };
  }
  const maximumColumns = Math.max(
    1,
    Math.min(
      MAX_DAILY_COLUMNS,
      Math.floor(AI_INSIGHTS_LIMITS.totalCells / rows.length),
    ),
  );
  const rankedMeasures = columns
    .map((column, index) => ({
      column,
      index,
      score: dailyMeasureScore(column),
    }))
    .filter(
      ({ column, index }) => index !== profile.dateColumnIndex && column.numeric,
    )
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const primaryColumn = rankedMeasures[0]?.column;
  if (!primaryColumn) {
    return { columns: [], enrichment: null, referenceNote: null };
  }

  if (maximumColumns >= 4) {
    const explicitReference = rankedMeasures
      .slice(1)
      .map(({ column, index }) => ({
        column,
        index,
        score: explicitDailyReferenceScore(column),
      }))
      .filter(
        ({ column, score }) =>
          score > 0 &&
          rows.some((row) => finiteNumberOrNull(row[column.key]) !== null),
      )
      .sort((left, right) => right.score - left.score || left.index - right.index)[0]
      ?.column;
    if (explicitReference) {
      const references = rows.map((row) => finiteNumberOrNull(row[explicitReference.key]));
      return {
        columns: [
          dateColumn,
          primaryColumn,
          explicitReference,
          derivedDailyDeltaColumn(explicitReference),
        ],
        enrichment: {
          mode: "explicit",
          primaryColumnKey: primaryColumn.key,
          referenceColumnKey: explicitReference.key,
          references,
        },
        referenceNote:
          "Referência explícita comparável preservada; deltas usam essa base sem substituir valores ausentes.",
      };
    }

    const references = buildSameWeekdayMonthReferences(
      rows,
      primaryColumn,
      profile.canonicalDates,
    );
    if (references.some((value) => value !== null)) {
      const referenceColumn = derivedDailyReferenceColumn(primaryColumn);
      return {
        columns: [
          dateColumn,
          primaryColumn,
          referenceColumn,
          derivedDailyDeltaColumn(referenceColumn),
        ],
        enrichment: {
          mode: "calculated",
          primaryColumnKey: primaryColumn.key,
          referenceColumnKey: referenceColumn.key,
          references,
        },
        referenceNote: `Referência determinística = mediana dos outros dias do mesmo dia da semana e mês; mínimo de ${MIN_SAME_WEEKDAY_MONTH_CONTROLS} controles válidos.`,
      };
    }
  }

  return {
    columns: [
      dateColumn,
      ...rankedMeasures
        .slice(0, Math.max(0, maximumColumns - 1))
        .map(({ column }) => column),
    ],
    enrichment: null,
    referenceNote:
      maximumColumns >= 4
        ? `Referência por dia da semana e mês não calculada: nenhum dia possuía ${MIN_SAME_WEEKDAY_MONTH_CONTROLS} controles válidos.`
        : "Referência diária não adicionada por limite seguro de colunas/células.",
  };
}

function explicitDailyReferenceScore(column: ReportTableColumn) {
  const semantic = normalizeSemanticText(`${column.key} ${column.label}`);
  if (/\b(base|baseline|reference|referencia)\b/.test(semantic)) return 500;
  if (/\b(previous|prior|anterior|compar\w*)\b/.test(semantic)) return 400;
  return 0;
}

function derivedDailyReferenceColumn(
  primaryColumn: ReportTableColumn,
): ReportTableColumn {
  return {
    key: DERIVED_DAILY_REFERENCE_KEY,
    label: `Referência mediana · ${primaryColumn.label}`,
    numeric: true,
  };
}

function derivedDailyDeltaColumn(
  referenceColumn: ReportTableColumn,
): ReportTableColumn {
  return {
    key: DERIVED_DAILY_DELTA_KEY,
    label: `Delta abs. | Delta % vs ${referenceColumn.label}`,
  };
}

function buildSameWeekdayMonthReferences(
  rows: ReportTable["rows"],
  primaryColumn: ReportTableColumn,
  canonicalDates: string[],
) {
  const controlsByGroup = new Map<
    string,
    Array<{ index: number; value: number }>
  >();
  rows.forEach((row, index) => {
    const date = canonicalDates[index];
    const value = finiteNumberOrNull(row[primaryColumn.key]);
    if (!date || value === null) return;
    const group = sameWeekdayMonthGroup(date);
    if (!group) return;
    const controls = controlsByGroup.get(group) ?? [];
    controls.push({ index, value });
    controlsByGroup.set(group, controls);
  });

  return rows.map((_, index) => {
    const date = canonicalDates[index];
    if (!date) return null;
    const group = sameWeekdayMonthGroup(date);
    if (!group) return null;
    const controls = (controlsByGroup.get(group) ?? [])
      .filter((entry) => entry.index !== index)
      .map((entry) => entry.value);
    if (controls.length < MIN_SAME_WEEKDAY_MONTH_CONTROLS) return null;
    return median(controls);
  });
}

function sameWeekdayMonthGroup(date: string) {
  const milliseconds = civilDateToUtcMilliseconds(date);
  if (milliseconds === null) return null;
  return `${date.slice(0, 7)}:${new Date(milliseconds).getUTCDay()}`;
}

function median(values: number[]) {
  if (!values.length) return null;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  const value =
    ordered.length % 2
      ? ordered[middle]
      : (ordered[middle - 1] + ordered[middle]) / 2;
  return roundedStatistic(value);
}

function dailyComparisonCell(actualValue: unknown, reference: number | null) {
  const actual = finiteNumberOrNull(actualValue);
  if (actual === null || reference === null || reference === 0) return null;
  const absolute = roundedStatistic(actual - reference);
  const percentage = roundedStatistic(((actual - reference) / reference) * 100);
  return `abs=${normalizeNegativeZero(absolute)}; pct=${normalizeNegativeZero(percentage)}%`;
}

function finiteNumberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeNegativeZero(value: number) {
  return Object.is(value, -0) ? 0 : value;
}

function dailyMeasureScore(column: ReportTableColumn) {
  const semantic = normalizeSemanticText(`${column.key} ${column.label}`);
  if (/\b(total|volume|fluxo|current|atual|ocupacao)\b/.test(semantic)) return 300;
  if (/\b(base|baseline|compar|anterior)\b/.test(semantic)) return 250;
  if (/\b(media|average|tendencia)\b/.test(semantic)) return 200;
  if (/\b(acumul|peak|pico|max|min)\b/.test(semantic)) return 150;
  return 50;
}

function isDailyDimensionValue(value: unknown) {
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 1 && value <= 31;
  }
  if (typeof value !== "string") return false;
  const clean = value.trim();
  return (
    /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(clean) ||
    /^\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?$/.test(clean) ||
    /^\d{1,2}$/.test(clean)
  );
}

function normalizeSemanticText(value: string) {
  return normalizeSearchText(value).replace(/[^a-z0-9%]+/g, " ").trim();
}

function sensitiveColumn(column: ReportTableColumn) {
  const normalized = normalizeSearchText(
    `${splitCamelCase(column.key)} ${splitCamelCase(column.label)}`,
  );
  return /(?:^|[\s_-])(id|uuid|email|e-mail|token|jwt|authorization|senha|password|secret|ip|worker|workers|camera|cameras)(?:$|[\s_-])/.test(
    normalized,
  );
}

function buildCompleteStatistics(
  accumulators: Map<number, NumericAccumulator>,
  columns: DatasetColumn[],
  numericColumnIndexes: number[],
) {
  const statistics: DatasetStatistic[] = [];
  const maximumMeasures = Math.floor(MAX_STATISTICS / 4);

  numericColumnIndexes.slice(0, maximumMeasures).forEach((columnIndex) => {
    const accumulator = accumulators.get(columnIndex);
    if (!accumulator?.count) return;
    const label = columns[columnIndex].label;
    const unit = columns[columnIndex].unit;
    statistics.push(
      { label: `${label} · observações`, unit: null, value: accumulator.count },
      { label: `${label} · mínimo`, unit, value: roundedStatistic(accumulator.minimum) },
      { label: `${label} · máximo`, unit, value: roundedStatistic(accumulator.maximum) },
      { label: `${label} · média`, unit, value: roundedStatistic(accumulator.mean) },
    );
  });

  return statistics.slice(0, Math.min(MAX_STATISTICS, AI_INSIGHTS_LIMITS.datasetStatistics));
}

export function selectRepresentativeRowIndexes(
  rowCount: number,
  requiredIndexes: Iterable<number>,
  limit = MAX_SAMPLED_ROWS_PER_DATASET,
) {
  if (limit <= 0 || rowCount <= 0) return [];
  if (rowCount <= limit) return Array.from({ length: rowCount }, (_, index) => index);

  const indexes = new Set<number>([0, rowCount - 1]);
  for (const index of requiredIndexes) {
    if (Number.isInteger(index) && index >= 0 && index < rowCount) {
      indexes.add(index);
    }
  }

  if (indexes.size > limit) {
    const required = Array.from(indexes).sort((left, right) => left - right);
    return uniformIndexes(required.length, limit).map((index) => required[index]);
  }

  const remaining = limit - indexes.size;
  for (let position = 1; position <= remaining; position += 1) {
    indexes.add(
      Math.round((position * (rowCount - 1)) / (remaining + 1)),
    );
  }
  if (indexes.size < limit) {
    for (let index = 0; index < rowCount && indexes.size < limit; index += 1) {
      indexes.add(index);
    }
  }

  return Array.from(indexes)
    .sort((left, right) => left - right)
    .slice(0, limit);
}

function summarizeNumericColumns(
  rows: ReportTable["rows"],
  columns: ReportTableColumn[],
  numericColumnIndexes: number[],
) {
  const accumulators = new Map<number, NumericAccumulator>();
  numericColumnIndexes.forEach((columnIndex) => {
    accumulators.set(columnIndex, {
      count: 0,
      mean: 0,
      maximum: Number.NEGATIVE_INFINITY,
      maximumIndex: -1,
      minimum: Number.POSITIVE_INFINITY,
      minimumIndex: -1,
    });
  });

  rows.forEach((row, rowIndex) => {
    numericColumnIndexes.forEach((columnIndex) => {
      const value = row[columns[columnIndex].key];
      if (typeof value !== "number" || !Number.isFinite(value)) return;
      const accumulator = accumulators.get(columnIndex)!;
      accumulator.count += 1;
      accumulator.mean +=
        (value - accumulator.mean) / accumulator.count;
      if (value < accumulator.minimum) {
        accumulator.minimum = value;
        accumulator.minimumIndex = rowIndex;
      }
      if (value > accumulator.maximum) {
        accumulator.maximum = value;
        accumulator.maximumIndex = rowIndex;
      }
    });
  });

  const extremeIndexes = new Set<number>();
  accumulators.forEach((accumulator) => {
    if (accumulator.minimumIndex >= 0) extremeIndexes.add(accumulator.minimumIndex);
    if (accumulator.maximumIndex >= 0) extremeIndexes.add(accumulator.maximumIndex);
  });
  return { accumulators, extremeIndexes };
}

function contextItem(value: string, index: number) {
  const text = sanitizedRequiredText(
    value,
    MAX_DESCRIPTION_TEXT,
    `Contexto ${index + 1}`,
  );
  const delimiterIndex = text.indexOf(":");
  if (delimiterIndex > 0 && delimiterIndex <= 79) {
    return {
      label: sanitizedRequiredText(
        text.slice(0, delimiterIndex),
        80,
        `Contexto ${index + 1}`,
      ),
      value: sanitizeCell(text.slice(delimiterIndex + 1).trim()),
    };
  }
  return { label: `Contexto ${index + 1}`, value: sanitizeCell(text) };
}

function inferColumnUnit(column: ReportTableColumn) {
  const normalized = normalizeSearchText(column.label);
  if (normalized.includes("%") || normalized.includes("percent")) return "%";
  return null;
}

function resolveSnapshotPeriod(
  payload: ReportPayload,
  datasets: Dataset[],
  timeZone: string,
  dataCompleteUntil: Date | null,
  explicitPeriod: CivilDateRange | null,
) {
  if (explicitPeriod) return explicitPeriod;

  const referenceDate = dataCompleteUntil
    ? companyDateKey(dataCompleteUntil, timeZone)
    : null;
  const completeDailyDataset = datasets.find(
    (dataset) =>
      dataset.coverage.granularity === "day" &&
      dataset.coverage.strategy === "complete" &&
      dataset.coverage.omittedRows === 0 &&
      dataset.columns[0]?.role === "dimension",
  );
  if (completeDailyDataset) {
    const dates = normalizeCivilDateSequence(
      completeDailyDataset.rows.map((row) => row[0]),
      referenceDate,
    );
    if (dates && isStrictContiguousCivilDates(dates)) {
      return { from: dates[0], to: dates.at(-1)! };
    }
  }

  const explicitSources = [payload.subtitle, ...(payload.context ?? [])].filter(
    (value): value is string => Boolean(value?.trim()),
  );
  const explicitDates = explicitSources.flatMap((source) =>
    extractCivilDates(source, referenceDate),
  );
  if (explicitDates.length) return civilDateBounds(explicitDates);
  return { from: referenceDate, to: referenceDate };
}

function resolveExplicitSnapshotPeriod(
  payload: ReportPayload,
  referenceDate: string | null,
): CivilDateRange | null {
  const context = payload.context ?? [];
  const sources = [
    payload.subtitle,
    periodContext(context),
    ...context.filter((item) => /per[ií]odo|intervalo|dia civil/i.test(item)),
  ].filter((value, index, values): value is string =>
    Boolean(value?.trim()) && values.indexOf(value) === index,
  );

  for (const source of sources) {
    const tokens = extractCivilDateTokens(source);
    if (tokens.length >= 2) {
      const range = normalizeCivilDateRange(
        tokens[0]!,
        tokens[1]!,
        referenceDate,
      );
      if (range) return range;
    }
  }

  for (const source of sources) {
    const tokens = extractCivilDateTokens(source);
    if (tokens.length !== 1) continue;
    const sourceIsDateOnly = source.trim() === tokens[0];
    if (
      !sourceIsDateOnly &&
      !/per[ií]odo|intervalo|dia civil|data selecionada/i.test(source)
    ) {
      continue;
    }
    const date = normalizeCivilDateAtOrBefore(tokens[0], referenceDate);
    if (date) return { from: date, to: date };
  }
  return null;
}

function extractCivilDateTokens(value: string) {
  return (
    value.match(
      /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g,
    ) ?? []
  );
}

function normalizeCivilDateRange(
  fromToken: string,
  toToken: string,
  referenceDate: string | null,
): CivilDateRange | null {
  const from = parseCivilDateToken(fromToken);
  const to = parseCivilDateToken(toToken);
  if (!from || !to) return null;

  let fromYear = from.year;
  let toYear = to.year;
  if (fromYear !== null && toYear === null) {
    toYear =
      fromYear + (compareMonthDay(to, from) < 0 ? 1 : 0);
  } else if (fromYear === null && toYear !== null) {
    fromYear =
      toYear - (compareMonthDay(from, to) > 0 ? 1 : 0);
  } else if (fromYear === null && toYear === null) {
    const reference = referenceDate
      ? parseCivilDateToken(referenceDate)
      : null;
    if (!reference?.year) return null;
    toYear =
      reference.year - (compareMonthDay(to, reference) > 0 ? 1 : 0);
    fromYear = toYear - (compareMonthDay(from, to) > 0 ? 1 : 0);
  }

  if (fromYear === null || toYear === null) return null;
  const fromDate = formatCivilDate(fromYear, from.month, from.day);
  const toDate = formatCivilDate(toYear, to.month, to.day);
  if (!fromDate || !toDate || fromDate > toDate) return null;
  return { from: fromDate, to: toDate };
}

function normalizeCivilDateAtOrBefore(
  token: string,
  referenceDate: string | null,
) {
  const parsed = parseCivilDateToken(token);
  if (!parsed) return null;
  if (parsed.year !== null) {
    return formatCivilDate(parsed.year, parsed.month, parsed.day);
  }
  const reference = referenceDate
    ? parseCivilDateToken(referenceDate)
    : null;
  if (!reference?.year) return null;
  const year =
    reference.year - (compareMonthDay(parsed, reference) > 0 ? 1 : 0);
  return formatCivilDate(year, parsed.month, parsed.day);
}

function parseCivilDateToken(value: string) {
  const clean = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean);
  const local = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/.exec(clean);
  if (!iso && !local) return null;
  const year = iso
    ? Number(iso[1])
    : local![3]
      ? normalizeCivilYear(Number(local![3]))
      : null;
  const month = Number(iso ? iso[2] : local![2]);
  const day = Number(iso ? iso[3] : local![1]);
  const validationYear = year ?? 2000;
  if (!validCivilDate(validationYear, month, day)) return null;
  return { day, month, year };
}

function compareMonthDay(
  left: { day: number; month: number },
  right: { day: number; month: number },
) {
  return left.month - right.month || left.day - right.day;
}

function formatCivilDate(year: number, month: number, day: number) {
  if (!validCivilDate(year, month, day)) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function listCivilDateKeys(range: CivilDateRange) {
  const from = civilDateToUtcMilliseconds(range.from);
  const to = civilDateToUtcMilliseconds(range.to);
  if (from === null || to === null || from > to) return [];
  const dates: string[] = [];
  for (let cursor = from; cursor <= to; cursor += 86_400_000) {
    dates.push(new Date(cursor).toISOString().slice(0, 10));
  }
  return dates;
}

function civilDateToUtcMilliseconds(value: string) {
  const parsed = parseCivilDateToken(value);
  if (!parsed?.year) return null;
  return Date.UTC(parsed.year, parsed.month - 1, parsed.day);
}

function normalizeCivilDateSequence(
  values: AiInsightCell[],
  referenceDate: string | null,
) {
  if (!values.length) return null;
  const normalized = Array<string>(values.length);
  let nextDate = referenceDate;

  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index];
    const parsed = parseDailyDimension(value);
    if (!parsed) return null;
    let year = parsed.year;
    let month = parsed.month;

    if (year === null) {
      const next = nextDate ? parseCivilDateToken(nextDate) : null;
      if (!next?.year) return null;
      if (month === null) {
        year = next.year;
        month = next.month;
        if (parsed.day > next.day) {
          month -= 1;
          if (month === 0) {
            month = 12;
            year -= 1;
          }
        }
      } else {
        year = next.year -
          (compareMonthDay({ day: parsed.day, month }, next) > 0 ? 1 : 0);
      }
    }
    if (month === null || year === null) return null;
    const date = formatCivilDate(year, month, parsed.day);
    if (!date) return null;
    normalized[index] = date;
    nextDate = date;
  }
  return normalized;
}

function parseDailyDimension(value: AiInsightCell) {
  if (typeof value === "number" || /^\d{1,2}$/.test(String(value).trim())) {
    const day = Number(value);
    if (!Number.isInteger(day) || day < 1 || day > 31) return null;
    return { day, month: null, year: null };
  }
  if (typeof value !== "string") return null;
  const clean = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:T|$)/.exec(clean);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    return validCivilDate(year, month, day) ? { day, month, year } : null;
  }
  return parseCivilDateToken(clean);
}

function isStrictContiguousCivilDates(dates: string[]) {
  if (!dates.length || new Set(dates).size !== dates.length) return false;
  for (let index = 1; index < dates.length; index += 1) {
    const previous = civilDateToUtcMilliseconds(dates[index - 1]);
    const current = civilDateToUtcMilliseconds(dates[index]);
    if (previous === null || current !== previous + 86_400_000) return false;
  }
  return true;
}

function extractCivilDates(value: string, referenceDate: string | null) {
  return extractCivilDateTokens(value).flatMap((match) => {
    const date = normalizeCivilDateAtOrBefore(match, referenceDate);
    return date ? [date] : [];
  });
}

function normalizeCivilDate(value: AiInsightCell, referenceDate: string | null) {
  let year: number;
  let month: number;
  let day: number;

  if (typeof value === "number" || /^\d{1,2}$/.test(String(value).trim())) {
    if (!referenceDate) return null;
    const parsedDay = Number(value);
    const reference = /^(\d{4})-(\d{2})-(\d{2})$/.exec(referenceDate);
    if (!Number.isInteger(parsedDay) || !reference) return null;
    year = Number(reference[1]);
    month = Number(reference[2]);
    day = parsedDay;
  } else if (typeof value === "string") {
    const clean = value.trim();
    const iso = /^(\d{4})-(\d{2})-(\d{2})(?:T|$)/.exec(clean);
    const local = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/.exec(clean);
    if (iso) {
      year = Number(iso[1]);
      month = Number(iso[2]);
      day = Number(iso[3]);
    } else if (local) {
      const reference = referenceDate
        ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(referenceDate)
        : null;
      if (!local[3] && !reference) return null;
      day = Number(local[1]);
      month = Number(local[2]);
      year = local[3]
        ? normalizeCivilYear(Number(local[3]))
        : Number(reference![1]);
    } else {
      return null;
    }
  } else {
    return null;
  }

  if (!validCivilDate(year, month, day)) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function normalizeCivilYear(value: number) {
  if (value >= 100) return value;
  return value >= 70 ? 1900 + value : 2000 + value;
}

function validCivilDate(year: number, month: number, day: number) {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    year < 1900 ||
    year > 2200 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return false;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function civilDateBounds(dates: string[]) {
  const ordered = [...new Set(dates)].sort();
  return { from: ordered[0] ?? null, to: ordered.at(-1) ?? null };
}

function periodContext(context: string[] | undefined) {
  return context?.find((item) =>
    /per[ií]odo|intervalo|dia civil/i.test(item),
  );
}

function sanitizeCell(value: unknown): AiInsightCell {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    if (containsSecretLikeValue(value)) return null;
    return sanitizedText(value, MAX_CELL_TEXT);
  }
  return null;
}

function sanitizedRequiredText(
  value: unknown,
  maximumLength: number,
  fallback: string,
) {
  return sanitizedText(value, maximumLength) || fallback;
}

function nullableSanitizedText(value: unknown, maximumLength: number) {
  return sanitizedText(value, maximumLength) || null;
}

function sanitizedText(value: unknown, maximumLength: number) {
  if (typeof value !== "string") return "";
  const withoutSecrets = value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "[credencial removida]")
    .replace(/\b[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[credencial removida]")
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, "[e-mail removido]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[IP removido]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "[ID removido]")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (withoutSecrets.length <= maximumLength) return withoutSecrets;
  return `${withoutSecrets.slice(0, Math.max(1, maximumLength - 1)).trimEnd()}…`;
}

function containsSecretLikeValue(value: string) {
  const clean = value.trim();
  const normalized = normalizeSearchText(clean);
  return (
    /^Bearer\s+/i.test(clean) ||
    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(clean) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean) ||
    /^[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}$/.test(clean) ||
    /^(?:\d{1,3}\.){3}\d{1,3}$/.test(clean) ||
    looksLikeIpv6(clean) ||
    /^(camera|worker)(?:\b|[\s_-])/i.test(normalized)
  );
}

function looksLikeIpv6(value: string) {
  if (!/^[0-9a-f:]+$/i.test(value)) return false;
  if (value.includes("::")) return true;
  const groups = value.split(":");
  return (
    groups.length >= 5 &&
    groups.every((group) => group.length >= 1 && group.length <= 4)
  );
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function splitCamelCase(value: string) {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}

function roundedStatistic(value: number) {
  if (Number.isInteger(value)) return value;
  return Math.round(value * 1_000_000) / 1_000_000;
}

function validDate(value: Date | null) {
  return value instanceof Date && Number.isFinite(value.getTime())
    ? value
    : null;
}

function requireText(value: string, label: string) {
  const clean = value.trim();
  if (!clean) throw new Error(`Não foi possível certificar ${label} da captura.`);
  return clean;
}

function fitSnapshotToBodyLimit(
  source: AiAnalysisSnapshot,
  maximumBytes: number,
) {
  const snapshot = structuredClone(source);
  let safety = 0;
  let currentBytes = jsonByteLength(snapshot);
  while (currentBytes > maximumBytes && safety < 64) {
    safety += 1;
    const targetRatio = Math.max(
      0.1,
      Math.min(0.9, (maximumBytes / currentBytes) * 0.9),
    );
    let rowsReduced = false;
    snapshot.report.datasets.forEach((dataset) => {
      if (isProtectedDailyTimeline(dataset)) return;
      const requiredIndexes = datasetExtremaIndexes(dataset);
      const minimumSize = Math.max(2, requiredIndexes.size);
      if (dataset.rows.length <= minimumSize) return;
      const nextSize = Math.max(
        minimumSize,
        Math.floor(dataset.rows.length * targetRatio),
      );
      if (nextSize >= dataset.rows.length) return;
      const indexes = selectRepresentativeRowIndexes(
        dataset.rows.length,
        requiredIndexes,
        nextSize,
      );
      dataset.rows = indexes.map((index) => dataset.rows[index]);
      dataset.coverage.includedRows = dataset.rows.length;
      dataset.coverage.omittedRows =
        dataset.coverage.originalRows - dataset.rows.length;
      dataset.coverage.strategy = "sampled";
      if (!dataset.coverage.notes.includes("Amostra adicional aplicada para respeitar o limite seguro da requisição.")) {
        dataset.coverage.notes = [
          ...dataset.coverage.notes,
          "Amostra adicional aplicada para respeitar o limite seguro da requisição.",
        ].slice(0, 6);
      }
      rowsReduced = true;
    });
    if (rowsReduced) {
      currentBytes = jsonByteLength(snapshot);
      continue;
    }
    if (snapshot.report.context.length) {
      snapshot.report.context.pop();
      currentBytes = jsonByteLength(snapshot);
      continue;
    }
    if (snapshot.report.metrics.length) {
      snapshot.report.metrics.pop();
      currentBytes = jsonByteLength(snapshot);
      continue;
    }
    const removableDatasetIndex = snapshot.report.datasets.findLastIndex(
      (dataset) => !isProtectedDailyTimeline(dataset),
    );
    if (removableDatasetIndex >= 0 && snapshot.report.datasets.length > 1) {
      snapshot.report.datasets.splice(removableDatasetIndex, 1);
      currentBytes = jsonByteLength(snapshot);
      continue;
    }
    const protectedDataset = snapshot.report.datasets.find(
      isProtectedDailyTimeline,
    );
    if (protectedDataset?.statistics.length) {
      protectedDataset.statistics.pop();
      currentBytes = jsonByteLength(snapshot);
      continue;
    }
    if (protectedDataset?.description) {
      protectedDataset.description = null;
      currentBytes = jsonByteLength(snapshot);
      continue;
    }
    if (protectedDataset && protectedDataset.coverage.notes.length > 1) {
      const canonicalMarker = protectedDataset.coverage.notes.find((note) =>
        note.startsWith(AI_INSIGHTS_CANONICAL_DAILY_NOTE_PREFIX),
      );
      protectedDataset.coverage.notes = canonicalMarker
        ? [canonicalMarker]
        : protectedDataset.coverage.notes.slice(-1);
      currentBytes = jsonByteLength(snapshot);
      continue;
    }
    break;
  }

  if (currentBytes > maximumBytes) {
    throw new Error(
      `A série diária completa excede o limite seguro de ${Math.floor(maximumBytes / 1024)} KB. Reduza o período; nenhum dia foi removido silenciosamente.`,
    );
  }
  return snapshot;
}

function isProtectedDailyTimeline(dataset: Dataset) {
  return (
    dataset.coverage.canonical &&
    dataset.coverage.granularity === "day" &&
    dataset.coverage.strategy === "complete" &&
    dataset.coverage.omittedRows === 0
  );
}

function datasetExtremaIndexes(dataset: Dataset) {
  const required = new Set<number>();
  if (dataset.rows.length) {
    required.add(0);
    required.add(dataset.rows.length - 1);
  }
  dataset.columns.forEach((column, columnIndex) => {
    if (column.role !== "measure") return;
    let minimum = Number.POSITIVE_INFINITY;
    let maximum = Number.NEGATIVE_INFINITY;
    let minimumIndex = -1;
    let maximumIndex = -1;
    dataset.rows.forEach((row, rowIndex) => {
      const value = row[columnIndex];
      if (typeof value !== "number" || !Number.isFinite(value)) return;
      if (value < minimum) {
        minimum = value;
        minimumIndex = rowIndex;
      }
      if (value > maximum) {
        maximum = value;
        maximumIndex = rowIndex;
      }
    });
    if (minimumIndex >= 0) required.add(minimumIndex);
    if (maximumIndex >= 0) required.add(maximumIndex);
  });
  return required;
}

function uniformIndexes(length: number, limit: number) {
  if (length <= limit) return Array.from({ length }, (_, index) => index);
  if (limit === 1) return [0];
  return Array.from({ length: limit }, (_, index) =>
    Math.round((index * (length - 1)) / (limit - 1)),
  );
}

function jsonByteLength(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}
