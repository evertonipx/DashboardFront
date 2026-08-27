import type {
  AiAnalysisSnapshot,
  AiInsightCell,
  AiInsightModule,
  AiInsightSurface,
} from "@/lib/ai-insights-contract";
import {
  AI_INSIGHTS_LIMITS,
  AiAnalysisSnapshotSchema,
} from "@/lib/ai-insights-contract";
import type {
  ReportPayload,
  ReportTable,
  ReportTableColumn,
} from "@/lib/report-export";

const MAX_DATASETS = 16;
const REQUEST_ENVELOPE_RESERVE_BYTES = 8 * 1024;
const MAX_ROWS_PER_DATASET = 120;
const MAX_COLUMNS_PER_DATASET = 10;
const MAX_CONTEXT_ITEMS = 24;
const MAX_METRICS = 40;
const MAX_CELL_TEXT = 200;
const MAX_SHORT_TEXT = 160;
const MAX_DESCRIPTION_TEXT = 340;
const MAX_STATISTICS = 16;

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
  table: ReportTable;
  title: string;
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

  const candidates = collectTableCandidates(
    payload,
    Math.min(MAX_DATASETS, AI_INSIGHTS_LIMITS.datasets),
  );
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
    candidates.push(metricTableCandidate(metrics));
  }

  const datasets = buildDatasets(candidates);
  if (!datasets.length) {
    throw new Error(
      "A visão configurada ainda não possui dados tabulares ou indicadores para análise.",
    );
  }

  const capturedAt = new Date();
  const dataCompleteUntil = validDate(payload.dataCompleteUntil);
  const context = (payload.context ?? [])
    .slice(0, Math.min(MAX_CONTEXT_ITEMS, AI_INSIGHTS_LIMITS.contextItems))
    .map((item, index) => contextItem(item, index));
  const subtitle = nullableSanitizedText(
    payload.subtitle,
    MAX_DESCRIPTION_TEXT,
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
        from: null,
        label: sanitizedRequiredText(
          payload.subtitle || periodContext(payload.context) || "Período da visão configurada",
          MAX_SHORT_TEXT,
          "Período da visão configurada",
        ),
        to: dataCompleteUntil?.toISOString() ?? null,
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

function buildDatasets(candidates: TableCandidate[]) {
  const datasets: Dataset[] = [];
  let remainingRows = AI_INSIGHTS_LIMITS.totalRows;
  let remainingCells = AI_INSIGHTS_LIMITS.totalCells;

  for (const [candidateIndex, candidate] of candidates.entries()) {
    if (
      datasets.length >= Math.min(MAX_DATASETS, AI_INSIGHTS_LIMITS.datasets) ||
      remainingRows <= 0
    ) break;
    const columns = safeColumns(candidate.table.columns);
    if (!columns.length || remainingCells < columns.length) continue;

    const maximumRows = Math.min(
      MAX_ROWS_PER_DATASET,
      AI_INSIGHTS_LIMITS.datasetRows,
      remainingRows,
      Math.floor(remainingCells / columns.length),
    );
    const dataset = tableCandidateToDataset(
      candidate,
      candidateIndex,
      columns,
      maximumRows,
    );
    datasets.push(dataset);
    remainingRows -= dataset.rows.length;
    remainingCells -= dataset.rows.length * dataset.columns.length;
  }

  return datasets;
}

function tableCandidateToDataset(
  candidate: TableCandidate,
  candidateIndex: number,
  selectedColumns: ReportTableColumn[],
  maximumRows: number,
): Dataset {
  const columns = selectedColumns.map<DatasetColumn>((column, index) => ({
    key: sanitizedRequiredText(column.key, 80, `coluna_${index + 1}`),
    label: sanitizedRequiredText(column.label, 100, `Coluna ${index + 1}`),
    role: column.numeric
      ? "measure"
      : index === 0
        ? "dimension"
        : "context",
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
  const sampledIndexes = selectRepresentativeRowIndexes(
    candidate.table.rows.length,
    numericSummary.extremeIndexes,
    maximumRows,
  );
  const sampled = sampledIndexes.length < candidate.table.rows.length;
  const notes = [
    "Valores ausentes permanecem nulos e não representam zero.",
  ];
  if (sampled) {
    notes.push(
      "Amostra determinística com primeiro, último, extremos numéricos e distribuição uniforme.",
      "As estatísticas foram calculadas sobre todas as linhas antes da amostragem.",
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
      includedRows: sampledIndexes.length,
      notes: notes.slice(0, 6),
      originalRows: candidate.table.rows.length,
      strategy: sampled ? "sampled" : "complete",
    },
    description: candidate.description,
    id: `dataset-${String(candidateIndex + 1).padStart(2, "0")}`,
    rows: sampledIndexes.map((index) => {
      const row = candidate.table.rows[index];
      return selectedColumns.map((column) => sanitizeCell(row[column.key]));
    }),
    statistics,
    title: sanitizedRequiredText(
      candidate.title,
      MAX_SHORT_TEXT,
      `Conjunto de dados ${candidateIndex + 1}`,
    ),
  };
}

function collectTableCandidates(payload: ReportPayload, limit: number) {
  const candidates: TableCandidate[] = [];
  const seenTables = new WeakSet<ReportTable>();

  function addCandidate(candidate: TableCandidate) {
    if (candidates.length >= limit || seenTables.has(candidate.table)) return;
    if (!safeColumns(candidate.table.columns).length) return;
    seenTables.add(candidate.table);
    candidates.push(candidate);
  }

  for (const chart of payload.charts) {
    if (candidates.length >= limit) break;
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
    if (candidates.length >= limit) break;
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
): TableCandidate {
  return {
    description: "Indicadores consolidados exibidos na visão configurada.",
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
  limit = MAX_ROWS_PER_DATASET,
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
  while (currentBytes > maximumBytes && safety < 24) {
    safety += 1;
    const targetRatio = Math.max(
      0.1,
      Math.min(0.9, (maximumBytes / currentBytes) * 0.9),
    );
    let rowsReduced = false;
    snapshot.report.datasets.forEach((dataset) => {
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
    if (snapshot.report.datasets.length > 1) {
      snapshot.report.datasets.pop();
      currentBytes = jsonByteLength(snapshot);
      continue;
    }
    break;
  }

  if (currentBytes > maximumBytes) {
    throw new Error(
      "A visão configurada excede o limite seguro de 200 KB mesmo após a consolidação.",
    );
  }
  return snapshot;
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
