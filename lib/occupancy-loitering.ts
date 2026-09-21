import type { OccupancyScenario } from "@/lib/types";

const RFC3339_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

const SUMMARY_ROW_KEYS = [
  "area",
  "avg_duration_seconds",
  "camera_id",
  "max_duration_seconds",
  "min_duration_seconds",
  "session_count",
] as const;

const SESSION_ROW_KEYS = [
  "area",
  "camera_id",
  "duration_seconds",
  "ended_at",
  "object_class",
] as const;

declare const occupancyLoiteringKeyBrand: unique symbol;

/** Collision-safe identity for one physical area and object class. */
export type OccupancyLoiteringKey = string & {
  readonly [occupancyLoiteringKeyBrand]: true;
};

export type OccupancyLoiteringSummaryRow = {
  area: string;
  avg_duration_seconds: number;
  camera_id: string;
  max_duration_seconds: number;
  min_duration_seconds: number;
  object_class: string;
  session_count: number;
};

export type OccupancyLoiteringSummaryResponse = {
  data: OccupancyLoiteringSummaryRow[];
};

/** Exact backend identity expected from a tenant-wide summary response. */
export type OccupancyLoiteringExpectedArea = {
  area: string;
  cameraId: string;
  objectClass: string;
};

export type OccupancyLoiteringSessionRow = {
  area: string;
  camera_id: string;
  duration_seconds: number;
  ended_at: string;
  object_class: string;
};

export type OccupancyLoiteringSessionResponse = {
  data: OccupancyLoiteringSessionRow[];
};

export type OccupancyLoiteringTotals = {
  avgDurationSeconds: number | null;
  maxDurationSeconds: number | null;
  minDurationSeconds: number | null;
  sessionCount: number;
};

export type OccupancyLoiteringAreaSummary = {
  area: string;
  cameraId: string;
  key: OccupancyLoiteringKey;
  label: string;
  objectClass: string;
  summary: OccupancyLoiteringSummaryRow | null;
};

export type OccupancyLoiteringScenarioSummary = {
  areas: OccupancyLoiteringAreaSummary[];
  label: string;
  scenarioId: string;
  totals: OccupancyLoiteringTotals;
};

export type OccupancyLoiteringSummaryModel = {
  /** Unique physical areas across every selected scenario. */
  areas: OccupancyLoiteringAreaSummary[];
  scenarios: OccupancyLoiteringScenarioSummary[];
  /** Totals across unique physical areas, never across repeated scenarios. */
  totals: OccupancyLoiteringTotals;
};

export function formatOccupancyLoiteringDuration(
  value: number | null | undefined,
  precise = false,
) {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    return "—";
  }

  const secondPrecision = precise ? 2 : value < 60 ? 1 : 0;
  const roundedSeconds = roundDurationSeconds(value, secondPrecision);
  if (roundedSeconds < 60) {
    return `${new Intl.NumberFormat("pt-BR", {
      maximumFractionDigits: secondPrecision,
    }).format(roundedSeconds)} s`;
  }

  if (roundedSeconds < 60 * 60) {
    const minutes = Math.floor(roundedSeconds / 60);
    const seconds = roundedSeconds - minutes * 60;
    const formattedSeconds = new Intl.NumberFormat("pt-BR", {
      maximumFractionDigits: precise ? 2 : 0,
    }).format(seconds);
    return seconds > 0
      ? `${formatDurationInteger(minutes)} min ${formattedSeconds} s`
      : `${formatDurationInteger(minutes)} min`;
  }

  if (roundedSeconds < 24 * 60 * 60) {
    const hours = Math.floor(roundedSeconds / (60 * 60));
    const minutes = Math.floor((roundedSeconds - hours * 60 * 60) / 60);
    return minutes > 0
      ? `${formatDurationInteger(hours)} h ${formatDurationInteger(minutes)} min`
      : `${formatDurationInteger(hours)} h`;
  }

  const daySeconds = 24 * 60 * 60;
  const yearSeconds = 365 * daySeconds;
  if (roundedSeconds < yearSeconds) {
    const days = Math.floor(roundedSeconds / daySeconds);
    const hours = Math.floor((roundedSeconds - days * daySeconds) / (60 * 60));
    const dayLabel = days === 1 ? "dia" : "dias";
    return hours > 0
      ? `${formatDurationInteger(days)} ${dayLabel} ${formatDurationInteger(hours)} h`
      : `${formatDurationInteger(days)} ${dayLabel}`;
  }

  const years = Math.floor(roundedSeconds / yearSeconds);
  const days = Math.floor((roundedSeconds - years * yearSeconds) / daySeconds);
  const yearLabel = years === 1 ? "ano" : "anos";
  const dayLabel = days === 1 ? "dia" : "dias";
  return days > 0
    ? `${formatDurationInteger(years)} ${yearLabel} ${formatDurationInteger(days)} ${dayLabel}`
    : `${formatDurationInteger(years)} ${yearLabel}`;
}

function roundDurationSeconds(value: number, fractionDigits: number) {
  const factor = 10 ** fractionDigits;
  if (value > Number.MAX_VALUE / factor) {
    return value;
  }
  return Math.round(value * factor) / factor;
}

function formatDurationInteger(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 0,
  }).format(value);
}

type UnknownRecord = Record<string, unknown>;

type ExpectedArea = Omit<OccupancyLoiteringAreaSummary, "summary"> & {
  hasExplicitLabel: boolean;
};

type ScenarioScope = {
  keys: OccupancyLoiteringKey[];
  label: string;
  scenarioId: string;
};

/**
 * JSON tuple encoding avoids delimiter collisions while retaining the exact
 * camera + area + object-class identity required by the API contract.
 */
export function occupancyLoiteringKey(
  cameraId: string,
  area: string,
  objectClass: string,
): OccupancyLoiteringKey {
  const parts = [cameraId, area, objectClass];
  if (
    parts.some(
      (part) =>
        typeof part !== "string" || !part || part !== part.trim(),
    )
  ) {
    throw new TypeError("A identidade da área de permanência é inválida.");
  }
  return JSON.stringify(parts) as OccupancyLoiteringKey;
}

/** Strictly validates the documented `{ data: [...] }` summary response. */
export function requireOccupancyLoiteringSummaryRows(
  value: unknown,
  expectedAreas?: readonly OccupancyLoiteringExpectedArea[],
): OccupancyLoiteringSummaryRow[] {
  const response = requireRecordWithFields(
    value,
    ["data"],
    "resumo de permanência",
  );
  if (!Array.isArray(response.data)) {
    throw new TypeError(
      "A API retornou dados inválidos no resumo de permanência.",
    );
  }

  const expectedClassesByPair = expectedAreas === undefined
    ? null
    : buildExpectedClassesByPair(expectedAreas);
  const identities = new Set<OccupancyLoiteringKey>();
  const rows: OccupancyLoiteringSummaryRow[] = [];
  response.data.forEach((candidate, index) => {
    const context = `linha ${index + 1} do resumo de permanência`;
    const row = requireRecordWithFields(
      candidate,
      ["area", "camera_id"],
      context,
    );
    const cameraId = requireIdentityText(
      row.camera_id,
      `camera_id da linha ${index + 1} do resumo de permanência`,
    );
    const area = requireIdentityText(
      row.area,
      `area da linha ${index + 1} do resumo de permanência`,
    );
    const expectedClasses = expectedClassesByPair?.get(
      occupancyLoiteringPairKey(cameraId, area),
    );
    if (expectedClassesByPair && !expectedClasses) return;

    let objectClass: string;
    if (Object.hasOwn(row, "object_class")) {
      objectClass = requireObjectClass(
        row.object_class,
        `object_class da linha ${index + 1} do resumo de permanência`,
      );
      if (expectedClasses && !expectedClasses.has(objectClass)) return;
    } else if (expectedClasses?.size === 1) {
      objectClass = expectedClasses.values().next().value as string;
    } else if (expectedClasses) {
      throw new RangeError(
        `A API retornou ${context} sem object_class e a identidade esperada é ambígua.`,
      );
    } else {
      throw new TypeError(`A API retornou ${context} com schema inválido.`);
    }

    if (SUMMARY_ROW_KEYS.some((key) => !Object.hasOwn(row, key))) {
      throw new TypeError(`A API retornou ${context} com schema inválido.`);
    }
    const average = requireNonNegativeFiniteNumber(
      row.avg_duration_seconds,
      `avg_duration_seconds da linha ${index + 1} do resumo de permanência`,
    );
    const maximum = requireNonNegativeFiniteNumber(
      row.max_duration_seconds,
      `max_duration_seconds da linha ${index + 1} do resumo de permanência`,
    );
    const minimum = requireNonNegativeFiniteNumber(
      row.min_duration_seconds,
      `min_duration_seconds da linha ${index + 1} do resumo de permanência`,
    );
    const count = requireNonNegativeSafeInteger(
      row.session_count,
      `session_count da linha ${index + 1} do resumo de permanência`,
    );
    if (minimum > average || average > maximum) {
      throw new RangeError(
        `A API retornou durações inconsistentes na linha ${index + 1} do resumo de permanência.`,
      );
    }

    const identity = occupancyLoiteringKey(cameraId, area, objectClass);
    if (identities.has(identity)) {
      throw new RangeError(
        "A API retornou uma área repetida no resumo de permanência.",
      );
    }
    identities.add(identity);

    rows.push({
      area,
      avg_duration_seconds: average,
      camera_id: cameraId,
      max_duration_seconds: maximum,
      min_duration_seconds: minimum,
      object_class: objectClass,
      session_count: count,
    });
  });
  return rows;
}

/**
 * Strictly validates sessions and returns a stable local `ended_at DESC`
 * ordering. Equal timestamps are deliberately retained in their input order.
 */
export function requireOccupancyLoiteringSessionRows(
  value: unknown,
): OccupancyLoiteringSessionRow[] {
  const response = requireRecordWithFields(
    value,
    ["data"],
    "lista de sessões de permanência",
  );
  if (!Array.isArray(response.data)) {
    throw new TypeError(
      "A API retornou dados inválidos na lista de sessões de permanência.",
    );
  }

  return Array.from(response.data, (candidate, index) => {
    const row = requireRecordWithFields(
      candidate,
      SESSION_ROW_KEYS,
      `sessão ${index + 1} de permanência`,
    );
    const endedAt = requireRfc3339Timestamp(
      row.ended_at,
      `ended_at da sessão ${index + 1} de permanência`,
    );
    return {
      index,
      instant: Date.parse(endedAt),
      row: {
        area: requireIdentityText(
          row.area,
          `area da sessão ${index + 1} de permanência`,
        ),
        camera_id: requireIdentityText(
          row.camera_id,
          `camera_id da sessão ${index + 1} de permanência`,
        ),
        duration_seconds: requireNonNegativeFiniteNumber(
          row.duration_seconds,
          `duration_seconds da sessão ${index + 1} de permanência`,
        ),
        ended_at: endedAt,
        object_class: requireObjectClass(
          row.object_class,
          `object_class da sessão ${index + 1} de permanência`,
        ),
      },
    };
  })
    .sort(
      (left, right) =>
        right.instant - left.instant || left.index - right.index,
    )
    .map(({ row }) => row);
}

/**
 * Selects only the scenario keys from a tenant-wide summary. A physical area
 * shared by scenarios appears in each scenario, but contributes only once to
 * the model-wide totals.
 */
export function buildOccupancyLoiteringSummaryModel(
  scenarios: readonly OccupancyScenario[],
  rows: readonly OccupancyLoiteringSummaryRow[],
): OccupancyLoiteringSummaryModel {
  const certifiedRows = requireOccupancyLoiteringSummaryRows({
    data: Array.from(rows),
  });
  const scope = buildScenarioScope(scenarios);
  const summariesByKey = new Map(
    certifiedRows.map((row) => [
      occupancyLoiteringKey(row.camera_id, row.area, row.object_class),
      row,
    ]),
  );
  const areas = Array.from(scope.areas.values(), (expected) => ({
    area: expected.area,
    cameraId: expected.cameraId,
    key: expected.key,
    label: expected.label,
    objectClass: expected.objectClass,
    summary: summariesByKey.get(expected.key) ?? null,
  }));
  const areasByKey = new Map(areas.map((area) => [area.key, area]));

  const scenarioSummaries = scope.scenarios.map((scenario) => {
    const scenarioAreas = scenario.keys.map((key) => {
      const area = areasByKey.get(key);
      if (!area) {
        throw new RangeError(
          "A configuração dos cenários de permanência é inconsistente.",
        );
      }
      return area;
    });
    return {
      areas: scenarioAreas,
      label: scenario.label,
      scenarioId: scenario.scenarioId,
      totals: aggregateSummaryRows(
        scenarioAreas.flatMap((area) =>
          area.summary ? [area.summary] : [],
        ),
      ),
    };
  });

  return {
    areas,
    scenarios: scenarioSummaries,
    totals: aggregateSummaryRows(
      areas.flatMap((area) => (area.summary ? [area.summary] : [])),
    ),
  };
}

/** Filters a tenant-wide session list to selected scenario keys and sorts it. */
export function selectOccupancyLoiteringSessions(
  scenarios: readonly OccupancyScenario[],
  rows: readonly OccupancyLoiteringSessionRow[],
): OccupancyLoiteringSessionRow[] {
  const scope = buildScenarioScope(scenarios);
  const expectedKeys = new Set(scope.areas.keys());
  const certifiedRows = requireOccupancyLoiteringSessionRows({
    data: Array.from(rows),
  });
  return certifiedRows.filter((row) =>
    expectedKeys.has(
      occupancyLoiteringKey(row.camera_id, row.area, row.object_class),
    ),
  );
}

/**
 * Builds the same grouped statistics exposed by `/loitering/summary` from a
 * list returned by `/loitering/sessions`. Every session is retained, including
 * rows with equal timestamps, and identities remain case-sensitive.
 */
export function summarizeOccupancyLoiteringSessions(
  rows: readonly OccupancyLoiteringSessionRow[],
): OccupancyLoiteringSummaryRow[] {
  const certifiedRows = requireOccupancyLoiteringSessionRows({
    data: Array.from(rows),
  });
  const summaries = new Map<
    OccupancyLoiteringKey,
    {
      area: string;
      average: number;
      cameraId: string;
      count: number;
      maximum: number;
      minimum: number;
      objectClass: string;
    }
  >();

  certifiedRows.forEach((row) => {
    const key = occupancyLoiteringKey(
      row.camera_id,
      row.area,
      row.object_class,
    );
    const current = summaries.get(key);
    if (!current) {
      summaries.set(key, {
        area: row.area,
        average: row.duration_seconds,
        cameraId: row.camera_id,
        count: 1,
        maximum: row.duration_seconds,
        minimum: row.duration_seconds,
        objectClass: row.object_class,
      });
      return;
    }

    const count = current.count + 1;
    if (!Number.isSafeInteger(count)) {
      throw new RangeError(
        "A quantidade de sessões de permanência excede o limite seguro.",
      );
    }
    current.count = count;
    current.minimum = Math.min(current.minimum, row.duration_seconds);
    current.maximum = Math.max(current.maximum, row.duration_seconds);
    // The incremental mean avoids overflowing a finite sum when durations
    // are individually valid but close to Number.MAX_VALUE.
    const rawAverage =
      current.average +
      (row.duration_seconds - current.average) / current.count;
    current.average = Math.min(
      current.maximum,
      Math.max(current.minimum, rawAverage),
    );
  });

  return requireOccupancyLoiteringSummaryRows({
    data: Array.from(summaries.values(), (entry) => ({
      area: entry.area,
      avg_duration_seconds: entry.average,
      camera_id: entry.cameraId,
      max_duration_seconds: entry.maximum,
      min_duration_seconds: entry.minimum,
      object_class: entry.objectClass,
      session_count: entry.count,
    })),
  });
}

/**
 * Combines disjoint summary intervals without averaging averages. Every
 * interval contributes `average * count`; zero-session rows never distort
 * the minimum or maximum of intervals that do contain completed sessions.
 */
export function combineOccupancyLoiteringSummaryRows(
  groups: readonly (readonly OccupancyLoiteringSummaryRow[])[],
): OccupancyLoiteringSummaryRow[] {
  const combined = new Map<
    OccupancyLoiteringKey,
    {
      area: string;
      cameraId: string;
      count: number;
      maximum: number | null;
      minimum: number | null;
      objectClass: string;
      weightedDuration: number;
    }
  >();

  groups.forEach((group) => {
    const rows = requireOccupancyLoiteringSummaryRows({ data: Array.from(group) });
    rows.forEach((row) => {
      const key = occupancyLoiteringKey(
        row.camera_id,
        row.area,
        row.object_class,
      );
      const current = combined.get(key) ?? {
        area: row.area,
        cameraId: row.camera_id,
        count: 0,
        maximum: null,
        minimum: null,
        objectClass: row.object_class,
        weightedDuration: 0,
      };
      const count = current.count + row.session_count;
      if (!Number.isSafeInteger(count)) {
        throw new RangeError(
          "A soma das sessões de permanência excede o limite seguro.",
        );
      }
      current.count = count;
      const weightedDuration =
        current.weightedDuration +
        row.avg_duration_seconds * row.session_count;
      if (!Number.isFinite(weightedDuration)) {
        throw new RangeError(
          "A duração acumulada das sessões excede o limite seguro.",
        );
      }
      current.weightedDuration = weightedDuration;
      if (row.session_count > 0) {
        current.minimum = current.minimum === null
          ? row.min_duration_seconds
          : Math.min(current.minimum, row.min_duration_seconds);
        current.maximum = current.maximum === null
          ? row.max_duration_seconds
          : Math.max(current.maximum, row.max_duration_seconds);
      }
      combined.set(key, current);
    });
  });

  return Array.from(combined.values(), (entry) => {
    const minimum = entry.minimum ?? 0;
    const maximum = entry.maximum ?? 0;
    const rawAverage = entry.count > 0
      ? entry.weightedDuration / entry.count
      : 0;
    // Decimal averages returned by disjoint intervals can accumulate a tiny
    // floating-point residue. Clamp only that derived value to the certified
    // extrema before the combined row is validated again by its consumer.
    const average = entry.count > 0
      ? Math.min(maximum, Math.max(minimum, rawAverage))
      : 0;
    return {
      area: entry.area,
      avg_duration_seconds: average,
      camera_id: entry.cameraId,
      max_duration_seconds: maximum,
      min_duration_seconds: minimum,
      object_class: entry.objectClass,
      session_count: entry.count,
    };
  });
}

function buildScenarioScope(scenarios: readonly OccupancyScenario[]) {
  if (!Array.isArray(scenarios)) {
    throw new TypeError("A seleção de cenários de permanência é inválida.");
  }

  const areas = new Map<OccupancyLoiteringKey, ExpectedArea>();
  const scenarioIds = new Set<string>();
  const scenarioScopes: ScenarioScope[] = [];

  scenarios.forEach((candidate, scenarioIndex) => {
    const scenario = requireRecord(
      candidate,
      `cenário ${scenarioIndex + 1} da seleção de permanência`,
    );
    const scenarioId = requireIdentityText(
      scenario.id,
      `id do cenário ${scenarioIndex + 1} da seleção de permanência`,
    );
    if (scenarioIds.has(scenarioId)) {
      throw new RangeError(
        "A seleção de permanência contém cenários repetidos.",
      );
    }
    scenarioIds.add(scenarioId);
    const scenarioName = requireDisplayText(
      scenario.name,
      `nome do cenário ${scenarioIndex + 1} da seleção de permanência`,
    );
    const scenarioLabel =
      scenarioName === scenarioId
        ? `Cenário ${scenarioIndex + 1}`
        : scenarioName;
    const objectClass = requireObjectClass(
      scenario.object_class,
      `object_class do cenário ${scenarioIndex + 1} da seleção de permanência`,
    );
    if (!Array.isArray(scenario.areas)) {
      throw new TypeError(
        `As áreas do cenário ${scenarioIndex + 1} da seleção de permanência são inválidas.`,
      );
    }

    const keys = new Set<OccupancyLoiteringKey>();
    scenario.areas.forEach((candidateArea, areaIndex) => {
      const configuredArea = requireRecord(
        candidateArea,
        `área ${areaIndex + 1} do cenário ${scenarioIndex + 1}`,
      );
      const cameraId = requireIdentityText(
        configuredArea.camera_id,
        `camera_id da área ${areaIndex + 1} do cenário ${scenarioIndex + 1}`,
      );
      const area = requireIdentityText(
        configuredArea.area_id,
        `area_id da área ${areaIndex + 1} do cenário ${scenarioIndex + 1}`,
      );
      const key = occupancyLoiteringKey(cameraId, area, objectClass);
      keys.add(key);

      const fallbackLabel =
        humanizeAreaIdentifier(area) ?? `Área ${areas.size + 1}`;
      const configuredLabel = requireOptionalDisplayText(
        configuredArea.label,
        `label da área ${areaIndex + 1} do cenário ${scenarioIndex + 1}`,
      );
      const hasExplicitLabel =
        configuredLabel !== undefined &&
        configuredLabel !== area &&
        configuredLabel !== cameraId;
      const existing = areas.get(key);
      if (!existing) {
        areas.set(key, {
          area,
          cameraId,
          hasExplicitLabel,
          key,
          label: hasExplicitLabel ? configuredLabel : fallbackLabel,
          objectClass,
        });
      } else if (!existing.hasExplicitLabel && hasExplicitLabel) {
        existing.hasExplicitLabel = true;
        existing.label = configuredLabel;
      }
    });

    scenarioScopes.push({
      keys: Array.from(keys),
      label: scenarioLabel,
      scenarioId,
    });
  });

  return { areas, scenarios: scenarioScopes };
}

/**
 * Turns a human-readable backend area key into a presentation label without
 * leaking opaque identifiers. Numbers and uncommon punctuation intentionally
 * fall back to the neutral `Área N` label because they are commonly IDs.
 */
function humanizeAreaIdentifier(value: string) {
  if (
    value.length > 48 ||
    /\d/u.test(value) ||
    !/^[\p{L}]+(?:[ _-]+[\p{L}]+)*$/u.test(value) ||
    /^[a-f]{12,}$/iu.test(value)
  ) {
    return null;
  }

  const words = value
    .replace(/([\p{Ll}])([\p{Lu}])/gu, "$1 $2")
    .replace(/([\p{Lu}]+)([\p{Lu}][\p{Ll}])/gu, "$1 $2")
    .split(/[ _-]+/u)
    .filter(Boolean);
  if (
    words.length === 0 ||
    words.some((word) => word.length > 20)
  ) {
    return null;
  }

  const lowercaseConnectors = new Set([
    "a",
    "ao",
    "da",
    "das",
    "de",
    "do",
    "dos",
    "e",
    "em",
  ]);
  return words
    .map((word, index) => {
      const normalized = word.toLocaleLowerCase("pt-BR");
      if (index > 0 && lowercaseConnectors.has(normalized)) {
        return normalized;
      }
      if (word.length > 1 && word === word.toLocaleUpperCase("pt-BR")) {
        return word;
      }
      return `${normalized.charAt(0).toLocaleUpperCase("pt-BR")}${normalized.slice(1)}`;
    })
    .join(" ");
}

function buildExpectedClassesByPair(
  expectedAreas: readonly OccupancyLoiteringExpectedArea[],
) {
  if (!Array.isArray(expectedAreas)) {
    throw new TypeError("As áreas esperadas do resumo de permanência são inválidas.");
  }
  const classesByPair = new Map<string, Set<string>>();
  expectedAreas.forEach((candidate, index) => {
    const expected = requireRecord(
      candidate,
      `área esperada ${index + 1} do resumo de permanência`,
    );
    const cameraId = requireIdentityText(
      expected.cameraId,
      `cameraId da área esperada ${index + 1} do resumo de permanência`,
    );
    const area = requireIdentityText(
      expected.area,
      `area da área esperada ${index + 1} do resumo de permanência`,
    );
    const objectClass = requireObjectClass(
      expected.objectClass,
      `objectClass da área esperada ${index + 1} do resumo de permanência`,
    );
    const pair = occupancyLoiteringPairKey(cameraId, area);
    const classes = classesByPair.get(pair) ?? new Set<string>();
    classes.add(objectClass);
    classesByPair.set(pair, classes);
  });
  return classesByPair;
}

function occupancyLoiteringPairKey(cameraId: string, area: string) {
  return JSON.stringify([cameraId, area]);
}

function aggregateSummaryRows(
  rows: readonly OccupancyLoiteringSummaryRow[],
): OccupancyLoiteringTotals {
  let sessionCount = 0;
  let weightedDuration = 0;
  let maximum: number | null = null;
  let minimum: number | null = null;

  rows.forEach((row) => {
    if (row.session_count === 0) return;
    const nextCount = sessionCount + row.session_count;
    const nextWeightedDuration =
      weightedDuration + row.avg_duration_seconds * row.session_count;
    if (!Number.isSafeInteger(nextCount) || !Number.isFinite(nextWeightedDuration)) {
      throw new RangeError(
        "Os totais do resumo de permanência excedem o limite seguro.",
      );
    }
    sessionCount = nextCount;
    weightedDuration = nextWeightedDuration;
    maximum =
      maximum === null
        ? row.max_duration_seconds
        : Math.max(maximum, row.max_duration_seconds);
    minimum =
      minimum === null
        ? row.min_duration_seconds
        : Math.min(minimum, row.min_duration_seconds);
  });

  return {
    avgDurationSeconds:
      sessionCount > 0 ? weightedDuration / sessionCount : null,
    maxDurationSeconds: maximum,
    minDurationSeconds: minimum,
    sessionCount,
  };
}

/**
 * Requires the documented fields while remaining forward-compatible with
 * additional response metadata. Swagger does not set
 * `additionalProperties: false`, so a backend extension must not make an
 * otherwise valid occupancy response disappear from every widget.
 */
function requireRecordWithFields(
  value: unknown,
  requiredKeys: readonly string[],
  context: string,
): UnknownRecord {
  const record = requireRecord(value, context);
  if (requiredKeys.some((key) => !Object.hasOwn(record, key))) {
    throw new TypeError(`A API retornou ${context} com schema inválido.`);
  }
  return record;
}

function requireRecord(value: unknown, context: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`A API retornou ${context} inválido.`);
  }
  return value as UnknownRecord;
}

function requireIdentityText(value: unknown, context: string) {
  if (
    typeof value !== "string" ||
    !value ||
    value !== value.trim()
  ) {
    throw new TypeError(`A API retornou ${context} inválido.`);
  }
  return value;
}

function requireDisplayText(value: unknown, context: string) {
  return requireIdentityText(value, context);
}

function requireOptionalDisplayText(value: unknown, context: string) {
  if (value === undefined) return undefined;
  return requireDisplayText(value, context);
}

function requireObjectClass(value: unknown, context: string) {
  return requireIdentityText(value, context);
}

function requireNonNegativeFiniteNumber(value: unknown, context: string) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new TypeError(`A API retornou ${context} inválido.`);
  }
  return value;
}

function requireNonNegativeSafeInteger(value: unknown, context: string) {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new TypeError(`A API retornou ${context} inválido.`);
  }
  return value as number;
}

function requireRfc3339Timestamp(value: unknown, context: string) {
  const timestamp = requireIdentityText(value, context);
  const match = RFC3339_PATTERN.exec(timestamp);
  if (!match) {
    throw new TypeError(`A API retornou ${context} inválido.`);
  }

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, zone] =
    match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const offsetHour = zone === "Z" ? 0 : Number(zone.slice(1, 3));
  const offsetMinute = zone === "Z" ? 0 : Number(zone.slice(4, 6));
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month) ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 23 ||
    offsetMinute > 59 ||
    Number.isNaN(Date.parse(timestamp))
  ) {
    throw new TypeError(`A API retornou ${context} inválido.`);
  }
  return timestamp;
}

function daysInMonth(year: number, month: number) {
  if (month === 2) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}
