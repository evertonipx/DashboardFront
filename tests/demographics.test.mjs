import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const demographics = loadTypeScriptModule("lib/demographics.ts");
const demographicsDashboardSource = readFileSync(
  resolve(projectRoot, "components/app/demographics-dashboard.tsx"),
  "utf8",
);
const { userFacingErrorMessage } = loadTypeScriptModule(
  "lib/user-facing-error.ts",
);
const dateRangeStorage = new Map();
const dateRangeWrites = [];
const demographicsDateRange = loadTypeScriptModule(
  "lib/demographics-date-range.ts",
  {
    "@/lib/master-company-scope": {
      getUserViewScopedStorageKey: scopedStorageKey,
      readUserViewScopedStorageEntry(baseKey, companyId, userId, viewId) {
        const key = scopedStorageKey(baseKey, companyId, userId, viewId);
        const value = dateRangeStorage.get(key);
        return value === undefined ? null : { key, value };
      },
    },
    "@/lib/user-grid-local": {
      writeUserGridPreference(key, value) {
        dateRangeStorage.set(key, value);
        dateRangeWrites.push({ key, value });
        return true;
      },
    },
  },
);

const CAMERA_A = "550e8400-e29b-41d4-a716-446655440000";
const CAMERA_B = "550e8400-e29b-41d4-a716-446655440001";

test("preserva as ordens canônicas e apresenta unknown sem mascará-lo", () => {
  assert.deepEqual(demographics.GENDER_LABELS, ["Woman", "Man"]);
  assert.deepEqual(demographics.DEMOGRAPHIC_GENDERS, [
    "Woman",
    "Man",
    "unknown",
  ]);
  assert.deepEqual(demographics.AGE_LABELS, [
    "0-2",
    "3-9",
    "10-19",
    "20-29",
    "30-39",
    "40-49",
    "50-59",
    "60-69",
    "70+",
  ]);
  assert.deepEqual(demographics.EMOTION_LABELS, [
    "neutral",
    "happy",
    "surprise",
    "sad",
    "angry",
    "disgust",
    "fear",
    "contempt",
  ]);
  assert.equal(
    demographics.DEMOGRAPHIC_GENDER_DISPLAY_LABELS.unknown,
    "Não identificado",
  );
});

test("valida, normaliza e ordena buckets pelo instante e pelas dimensões", () => {
  const rows = demographics.requireDemographicBucketsResponse({
    data: [
      row({
        age_bucket: "70+",
        bucket: "2026-09-01T14:36:00+00:00",
        camera_id: CAMERA_B,
        emotion: "sad",
        gender: "Woman",
      }),
      row({
        age_bucket: "30-39",
        bucket: "2026-09-01T14:35:00Z",
        camera_id: CAMERA_B,
        emotion: "neutral",
        gender: "Man",
      }),
      row({
        age_bucket: "20-29",
        bucket: "2026-09-01T14:35:00Z",
        camera_id: CAMERA_A,
        emotion: "happy",
        gender: "Woman",
      }),
    ],
  });

  assert.deepEqual(
    rows.map(({ bucket, camera_id, age_bucket }) => [
      bucket,
      camera_id,
      age_bucket,
    ]),
    [
      ["2026-09-01T14:35:00.000Z", CAMERA_A, "20-29"],
      ["2026-09-01T14:35:00.000Z", CAMERA_B, "30-39"],
      ["2026-09-01T14:36:00.000Z", CAMERA_B, "70+"],
    ],
  );
});

test("agrega gênero, idade, emoção e todos os cruzamentos disponíveis", () => {
  const rows = demographics.requireDemographicBucketsResponse({
    data: sampleRows(),
  });
  const result = demographics.aggregateDemographicBuckets(rows);

  assert.equal(result.total, 4);
  assert.equal(result.hasData, true);
  assert.equal(result.unit, "detections");
  assert.equal(result.observedBucketCount, 2);
  assert.deepEqual(result.cameraIds, [CAMERA_A, CAMERA_B]);
  assert.deepEqual(
    result.gender.map(({ key, count, percentage, observed }) => ({
      key,
      count,
      percentage,
      observed,
    })),
    [
      { key: "Woman", count: 3, percentage: 75, observed: true },
      { key: "Man", count: 1, percentage: 25, observed: true },
      { key: "unknown", count: 0, percentage: 0, observed: true },
    ],
  );
  assert.deepEqual(
    result.age.map(({ key, count }) => [key, count]),
    [
      ["0-2", 0],
      ["3-9", 0],
      ["10-19", 0],
      ["20-29", 2],
      ["30-39", 1],
      ["40-49", 0],
      ["50-59", 0],
      ["60-69", 0],
      ["70+", 1],
    ],
  );

  const age20 = result.crossings.ageByGender.rows.find(
    ({ key }) => key === "20-29",
  );
  assert.deepEqual(
    age20.cells.map(({ columnKey, count, observed }) => [
      columnKey,
      count,
      observed,
    ]),
    [
      ["Woman", 2, true],
      ["Man", 0, false],
      ["unknown", 0, true],
    ],
  );
  assert.equal(age20.cells[0].rowPercentage, 100);
  assert.equal(age20.cells[0].columnPercentage, 66.67);
  assert.equal(age20.cells[0].percentage, 50);

  const women = result.crossings.genderByEmotion.rows.find(
    ({ key }) => key === "Woman",
  );
  assert.equal(
    women.cells.find(({ columnKey }) => columnKey === "happy").count,
    2,
  );
  assert.equal(
    result.crossings.ageByEmotion.rows
      .find(({ key }) => key === "70+")
      .cells.find(({ columnKey }) => columnKey === "sad").count,
    1,
  );
});

test("percentuais canônicos somam exatamente 100 sem divisão por zero", () => {
  const result = demographics.summarizeDemographicBuckets({
    data: [
      row({ gender: "Woman", count: 1 }),
      row({
        gender: "Man",
        count: 1,
        emotion: "sad",
        age_bucket: "30-39",
      }),
      row({
        gender: "unknown",
        count: 1,
        emotion: "fear",
        age_bucket: "70+",
      }),
    ],
  });
  assert.deepEqual(
    result.gender.map(({ percentage }) => percentage),
    [33.34, 33.33, 33.33],
  );
  assert.equal(
    result.gender.reduce((sum, { percentage }) => sum + percentage, 0),
    100,
  );
  for (const distribution of [result.gender, result.age, result.emotion]) {
    assert.equal(
      distribution.reduce((sum, { count }) => sum + count, 0),
      result.total,
      "cada dimensão deve usar exatamente o mesmo denominador",
    );
    assert.equal(
      distribution.reduce((sum, { percentage }) => sum + percentage, 0),
      100,
      "cada distribuição não vazia deve fechar em 100%",
    );
  }
  assert.equal(
    result.gender.find(({ key }) => key === "unknown").percentage,
    33.33,
    "unknown participa do denominador e não pode inflar Woman ou Man",
  );

  const empty = demographics.summarizeDemographicBuckets({ data: [] });
  assert.equal(empty.total, 0);
  assert.equal(empty.hasData, false);
  assert.ok(empty.gender.every(({ percentage }) => percentage === null));
  assert.equal(demographics.safeDemographicPercentage(0, 0), null);
  assert.equal(demographics.safeDemographicPercentage(2, 1), null);
});

test("contagens explicitamente zero não fabricam percentuais", () => {
  const result = demographics.summarizeDemographicBuckets({
    data: [
      row({ gender: "Woman", count: 0 }),
      row({
        gender: "unknown",
        count: 0,
        age_bucket: "70+",
        emotion: "neutral",
      }),
    ],
  });

  assert.equal(result.hasData, true, "as linhas zero foram observadas");
  assert.equal(result.total, 0);
  assert.ok(result.gender.every(({ percentage }) => percentage === null));
  assert.ok(result.age.every(({ percentage }) => percentage === null));
  assert.ok(result.emotion.every(({ percentage }) => percentage === null));
  assert.equal(
    result.gender.find(({ key }) => key === "Woman").observed,
    true,
  );
  assert.equal(
    result.gender.find(({ key }) => key === "unknown").observed,
    true,
  );
  assert.equal(
    result.gender.find(({ key }) => key === "Man").observed,
    false,
  );
});

test("zero explícito é dado observado, mas minuto ausente permanece null", () => {
  const rows = demographics.requireDemographicBucketsResponse({
    data: [
      row({ bucket: "2026-09-01T00:00:00Z", count: 2 }),
      row({
        bucket: "2026-09-01T00:02:00Z",
        count: 0,
        gender: "unknown",
      }),
    ],
  });
  const timeline = demographics.buildDemographicMinuteTimeline(rows, {
    from: "2026-09-01T00:00:00Z",
    to: "2026-09-01T00:03:00Z",
  });

  assert.deepEqual(
    timeline.map(({ status, total }) => [status, total]),
    [
      ["observed", 2],
      ["missing", null],
      ["observed", 0],
    ],
  );
  const coverage = demographics.summarizeDemographicMinuteCoverage(rows, {
    from: "2026-09-01T00:00:00Z",
    to: "2026-09-01T00:03:00Z",
  });
  assert.deepEqual(coverage, {
    allMinutesObserved: false,
    missingMinutes: 1,
    observedMinutes: 2,
    percentage: 66.67,
    requestedMinutes: 3,
  });
  assert.match(
    demographics.demographicCoverageWarning(coverage),
    /ausência de dados não é zero/,
  );
});

test("timeline consolidada sinaliza buckets parciais e respeita limite", () => {
  const rows = demographics.requireDemographicBucketsResponse({
    data: [
      row({ bucket: "2026-09-01T00:00:00Z", count: 2 }),
      row({ bucket: "2026-09-01T00:02:00Z", count: 0 }),
    ],
  });
  const timeline = demographics.buildDemographicMinuteTimeline(rows, {
    from: "2026-09-01T00:00:00Z",
    to: "2026-09-01T00:03:00Z",
    stepMinutes: 2,
  });
  assert.deepEqual(
    timeline.map(
      ({ status, total, observedMinuteCount, expectedMinuteCount }) => [
        status,
        total,
        observedMinuteCount,
        expectedMinuteCount,
      ],
    ),
    [
      ["partial", 2, 1, 2],
      ["observed", 0, 1, 1],
    ],
  );
  assert.throws(
    () =>
      demographics.buildDemographicMinuteTimeline(rows, {
        from: "2026-09-01T00:00:00Z",
        to: "2026-09-01T00:03:00Z",
        maxPoints: 2,
      }),
    /produziria 3 pontos/,
  );
});

test("combina partições agregadas sem reter linhas brutas", () => {
  const first = demographics.summarizeDemographicBuckets({
    data: sampleRows().slice(0, 3),
  });
  const second = demographics.summarizeDemographicBuckets({
    data: sampleRows().slice(3),
  });
  const combined = demographics.combineDemographicAggregations([first, second]);
  const direct = demographics.summarizeDemographicBuckets({
    data: sampleRows(),
  });

  assert.equal(combined.total, direct.total);
  assert.equal(combined.observedBucketCount, direct.observedBucketCount);
  assert.deepEqual(combined.gender, direct.gender);
  assert.deepEqual(combined.age, direct.age);
  assert.deepEqual(combined.emotion, direct.emotion);
  assert.deepEqual(combined.crossings, direct.crossings);
});

test("validação rejeita respostas fora do contrato sem alterar a origem", () => {
  const source = {
    data: [
      row({
        bucket: "2026-09-01T14:35:00+00:00",
        camera_id: CAMERA_A,
      }),
    ],
  };
  const snapshot = structuredClone(source);
  demographics.requireDemographicBucketsResponse(source);
  assert.deepEqual(source, snapshot);

  const invalidCases = [
    [null, /sem o campo data/],
    [{}, /sem o campo data/],
    [{ data: [null] }, /não é um objeto/],
    [
      { data: [row({ bucket: "2026-09-01T14:35:00" })] },
      /RFC3339 alinhado ao minuto/,
    ],
    [{ data: [row({ bucket: "2026-09-01T14:35:01Z" })] }, /alinhado ao minuto/],
    [{ data: [row({ bucket: "2026-02-30T14:35:00Z" })] }, /alinhado ao minuto/],
    [{ data: [row({ camera_id: " " })] }, /camera_id válido/],
    [{ data: [row({ count: -1 })] }, /count inválido/],
    [{ data: [row({ count: 1.5 })] }, /count inválido/],
    [{ data: [row({ age_bucket: "20s" })] }, /age_bucket fora/],
    [{ data: [row({ gender: "Female" })] }, /gender fora/],
    [{ data: [row({ emotion: "joy" })] }, /emotion fora/],
  ];
  invalidCases.forEach(([payload, pattern]) => {
    assert.throws(
      () => demographics.requireDemographicBucketsResponse(payload),
      pattern,
    );
  });
});

test("interface demográfica oculta campos e identificadores do contrato interno", () => {
  const fallback = "Não foi possível carregar os dados demográficos.";
  const invalidPayloads = [
    { data: [row({ camera_id: " " })] },
    { data: [row({ age_bucket: "20s" })] },
    { data: [row({ count: -1 })] },
    { data: [row({ gender: "Female" })] },
    { data: [row({ emotion: "joy" })] },
    { data: [row({ bucket: "2026-09-01T14:35:01Z" })] },
  ];

  invalidPayloads.forEach((payload) => {
    let validationError;
    try {
      demographics.requireDemographicBucketsResponse(payload);
    } catch (error) {
      validationError = error;
    }
    assert.ok(validationError instanceof Error);
    assert.equal(userFacingErrorMessage(validationError, fallback), fallback);
  });

  [
    "O campo camera_id é inválido.",
    "O campo age_bucket está fora do contrato.",
    "O campo count precisa ser um inteiro.",
    "O campo gender é desconhecido.",
    "O campo emotion é desconhecido.",
    "O bucket não possui data RFC3339 alinhada ao minuto.",
  ].forEach((technicalMessage) => {
    assert.equal(
      userFacingErrorMessage(new Error(technicalMessage), fallback),
      fallback,
    );
  });

  assert.equal(
    userFacingErrorMessage(
      new Error(
        `A linha demográfica na posição 0 pertence à câmera "camera-interna" em vez de "camera-esperada".`,
      ),
      fallback,
    ),
    fallback,
  );
  assert.equal(
    userFacingErrorMessage(
      new Error("Selecione um período válido para continuar."),
      fallback,
    ),
    "Selecione um período válido para continuar.",
  );
  assert.match(
    demographicsDashboardSource,
    /import \{ userFacingErrorMessage \} from "@\/lib\/user-facing-error";/,
  );
  assert.match(
    demographicsDashboardSource,
    /return userFacingErrorMessage\([\s\S]*?Não foi possível carregar os dados demográficos\./,
  );
});

test("validação certifica câmera, intervalo exclusivo e unicidade", () => {
  const duplicate = row();
  assert.throws(
    () =>
      demographics.requireDemographicBucketsResponse({
        data: [duplicate, { ...duplicate }],
      }),
    /duplica a mesma chave/,
  );
  assert.throws(
    () =>
      demographics.requireDemographicBucketsResponse(
        { data: [row({ camera_id: CAMERA_B })] },
        { expectedCameraId: CAMERA_A },
      ),
    /em vez de/,
  );
  assert.throws(
    () =>
      demographics.requireDemographicBucketsResponse(
        { data: [row({ bucket: "2026-09-01T00:02:00Z" })] },
        {
          from: "2026-09-01T00:00:00Z",
          to: "2026-09-01T00:02:00Z",
        },
      ),
    /fim exclusivo/,
  );
  assert.throws(
    () =>
      demographics.requireDemographicBucketsResponse(
        { data: [] },
        {
          from: "2026-09-01T00:02:00Z",
          to: "2026-09-01T00:00:00Z",
        },
      ),
    /anterior ao fim/,
  );
});

test("normaliza período demográfico inclusivo, futuro e limite de 31 dias", () => {
  const context = {
    fallback: { startInput: "2026-08-27", endInput: "2026-09-02" },
    todayInput: "2026-09-02",
  };
  assert.deepEqual(
    demographicsDateRange.normalizeDemographicsDateRange(
      { startInput: "2026-08-03", endInput: "2026-09-02" },
      context,
    ),
    { startInput: "2026-08-03", endInput: "2026-09-02" },
    "31 dias inclusivos devem ser aceitos",
  );
  assert.equal(
    demographicsDateRange.countDemographicsDateRangeDays({
      startInput: "2026-08-03",
      endInput: "2026-09-02",
    }),
    31,
  );
  assert.deepEqual(
    demographicsDateRange.normalizeDemographicsDateRange(
      { startInput: "2026-08-30", endInput: "2026-09-20" },
      context,
    ),
    { startInput: "2026-08-30", endInput: "2026-09-02" },
    "o final futuro deve ser limitado ao hoje civil fornecido",
  );
  for (const invalid of [
    { startInput: "2026-02-30", endInput: "2026-09-02" },
    { startInput: "2026-09-02", endInput: "2026-08-30" },
    { startInput: "2026-08-02", endInput: "2026-09-02" },
  ]) {
    assert.deepEqual(
      demographicsDateRange.normalizeDemographicsDateRange(invalid, context),
      context.fallback,
    );
  }
  assert.throws(
    () =>
      demographicsDateRange.normalizeDemographicsDateRange(null, {
        fallback: {
          startInput: "2026-08-02",
          endInput: "2026-09-02",
        },
        todayInput: "2026-09-02",
      }),
    /padrão deve ter no máximo 31 dias/,
  );
});

test("salva e carrega período por empresa, usuário e superfície via user-grid", () => {
  const previousWindow = globalThis.window;
  globalThis.window = {};
  dateRangeStorage.clear();
  dateRangeWrites.length = 0;
  try {
    const base = {
      companyId: "company-a",
      userId: "user-a",
      fallback: { startInput: "2026-09-01", endInput: "2026-09-02" },
      todayInput: "2026-09-02",
    };
    const analysisContext = { ...base, surface: "analysis" };
    const reportsContext = { ...base, surface: "reports" };
    const saved = demographicsDateRange.saveDemographicsDateRange(
      { startInput: "2026-08-20", endInput: "2026-09-10" },
      analysisContext,
    );
    assert.deepEqual(saved, {
      startInput: "2026-08-20",
      endInput: "2026-09-02",
    });
    assert.equal(dateRangeWrites.length, 1);
    assert.match(dateRangeWrites[0].key, /company\.company-a/);
    assert.match(dateRangeWrites[0].key, /user\.user-a/);
    assert.match(dateRangeWrites[0].key, /view\.analysis$/);
    assert.deepEqual(
      demographicsDateRange.loadDemographicsDateRange(analysisContext),
      saved,
    );
    assert.deepEqual(
      demographicsDateRange.loadDemographicsDateRange(reportsContext),
      base.fallback,
      "relatórios não devem herdar o período salvo em análises",
    );

    const otherCompany = {
      ...analysisContext,
      companyId: "company-b",
    };
    assert.deepEqual(
      demographicsDateRange.loadDemographicsDateRange(otherCompany),
      base.fallback,
      "outra empresa não deve herdar o período",
    );
    const otherUser = { ...analysisContext, userId: "user-b" };
    assert.deepEqual(
      demographicsDateRange.loadDemographicsDateRange(otherUser),
      base.fallback,
      "outro usuário não deve herdar o período",
    );
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test("persistência demográfica tolera JSON corrompido e ambiente servidor", () => {
  const context = {
    companyId: "company-a",
    userId: "user-a",
    surface: "reports",
    fallback: { startInput: "2026-09-01", endInput: "2026-09-02" },
    todayInput: "2026-09-02",
  };
  const key = demographicsDateRange.demographicsDateRangeStorageKey(context);
  dateRangeStorage.set(key, "{broken");
  const previousWindow = globalThis.window;
  globalThis.window = {};
  try {
    assert.deepEqual(
      demographicsDateRange.loadDemographicsDateRange(context),
      context.fallback,
    );
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
  assert.deepEqual(
    demographicsDateRange.loadDemographicsDateRange(context),
    context.fallback,
  );
  assert.throws(
    () =>
      demographicsDateRange.demographicsDateRangeStorageKey({
        ...context,
        surface: "live",
      }),
    /superfície/,
  );
});

test("user-grid gerencia o namespace do período demográfico", () => {
  const source = readFileSync(resolve(projectRoot, "lib/user-grid.ts"), "utf8");
  assert.match(source, /"ipxdata\.demographics-range\.v1"/);
  const rangeSource = readFileSync(
    resolve(projectRoot, "lib/demographics-date-range.ts"),
    "utf8",
  );
  assert.match(rangeSource, /readUserViewScopedStorageEntry/);
  assert.match(rangeSource, /writeUserGridPreference/);
  assert.match(
    rangeSource,
    /context\.companyId,[\s\S]*?context\.userId,[\s\S]*?(?:context\.surface|surface)/,
  );
});

test("fechamento do minuto usa epoch real de 2026 e preserva a multiplicação", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/app/demographics-dashboard.tsx"),
    "utf8",
  );
  assert.match(
    source,
    /Math\.floor\(clock\.getTime\(\) \/ MINUTE_MS\) \* MINUTE_MS/,
  );
  const timestamp = Date.parse("2026-09-02T14:35:42.789Z");
  const closedMinuteInstantMs = Math.floor(timestamp / 60_000) * 60_000;
  assert.equal(closedMinuteInstantMs, Date.parse("2026-09-02T14:35:00.000Z"));
});

test("dashboard consulta o endpoint bruto uma vez por dia civil, reutiliza partições e respeita empresa e fuso", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/app/demographics-dashboard.tsx"),
    "utf8",
  );

  assert.match(source, /`\/demographics\/buckets\?\$\{query\}`/);
  assert.match(source, /companyScopeId,\s*signal/);
  assert.match(source, /startOfCompanyTimeZoneCivilDay\(parts, timeZone\)/);
  assert.doesNotMatch(source, /requireCertifiedCompanyTimeZone/);
  assert.match(
    source,
    /Math\.floor\(clock\.getTime\(\) \/ MINUTE_MS\) \* MINUTE_MS/,
  );
  const civilPartitions = source.slice(
    source.indexOf("function buildCivilDayPartitions"),
    source.indexOf("function buildInstantPartitions"),
  );
  assert.match(civilPartitions, /if \(to > from\) partitions\.push\(\{ from, to \}\)/);
  assert.doesNotMatch(civilPartitions, /buildInstantPartitions/);
  assert.match(source, /demographicPartitionCacheKey\(/);
  assert.match(source, /cache\.get\(cacheKey\)/);
  assert.match(source, /cacheDemographicPartition\(cache, cacheKey, summary\)/);
  assert.match(
    source,
    /combined = combineDemographicAggregations\(\[combined, summary\]\)/,
  );
  assert.doesNotMatch(source, /(?:allRows|rows)\.push\(\.\.\./);
  assert.match(
    source,
    /if \(surface !== "live" \|\| !hasVisibleWidgets\) return;/,
  );
  assert.match(
    source,
    /if \(!hasVisibleWidgets\) \{[\s\S]*?setLoading\(false\)[\s\S]*?return;/,
  );
  assert.match(source, /onPreferencesChange=\{synchronizePreferences\}/);
  assert.doesNotMatch(
    source,
    /\[\s*preferences,[\s\S]*?requestWindow,[\s\S]*?surface,[\s\S]*?\]\);/,
    "alterações de título, cor ou tamanho não devem refazer a consulta",
  );
  assert.match(source, /isAbortError\(requestError, controller\.signal\)/);
});

test("dashboard mostra percentuais permanentes, exporta e persiste os nove widgets", () => {
  const dashboard = readFileSync(
    resolve(projectRoot, "components/app/demographics-dashboard.tsx"),
    "utf8",
  );
  const preferences = readFileSync(
    resolve(projectRoot, "lib/view-preferences.ts"),
    "utf8",
  );
  const userGrid = readFileSync(
    resolve(projectRoot, "lib/user-grid.ts"),
    "utf8",
  );
  const cardIds = [
    "demographics_total",
    "demographics_gender_leader",
    "demographics_age_leader",
    "demographics_emotion_leader",
    "demographics_gender_mix",
    "demographics_age_distribution",
    "demographics_emotion_distribution",
    "demographics_age_gender_pyramid",
    "demographics_age_emotion_heatmap",
  ];

  for (const cardId of cardIds) {
    assert.ok(dashboard.includes(`"${cardId}"`), `${cardId} ausente da tela`);
    assert.ok(
      preferences.includes(`"${cardId}"`),
      `${cardId} ausente do catálogo`,
    );
  }
  assert.match(dashboard, /menuKey=\{DEMOGRAPHICS_MENU_KEY\}/);
  assert.match(dashboard, /const preferenceScopeId = `demographics-\$\{surface\}`/);
  assert.match(dashboard, /preferenceScopeId=\{preferenceScopeId\}/);
  assert.match(dashboard, /<ReportExportActions/);
  assert.match(dashboard, /valueLabels="always"/);
  assert.match(dashboard, /max: 100/);
  assert.match(dashboard, /Não identificado/);
  assert.match(
    userGrid,
    /widget-view-presets\\\.v1\\\.\(\?:analysis\|demographics\|/,
  );
});

test("Relatórios consulta somente parâmetros aplicados e reutiliza o comparativo carregado", () => {
  const reports = readFileSync(
    resolve(projectRoot, "components/app/scenario-reports-dashboard.tsx"),
    "utf8",
  );
  const comparison = readFileSync(
    resolve(projectRoot, "components/app/scenario-comparison-card.tsx"),
    "utf8",
  );

  assert.doesNotMatch(reports, /useResourceAutoRefresh|window\.setInterval/);
  assert.match(
    reports,
    /completedChartQueryKeyRef\.current === chartQueryKey[\s\S]*?activeChartQueryKeyRef\.current === chartQueryKey/,
  );
  assert.match(
    reports,
    /visibleCardIds\.has\(`report_custom_\$\{widget\.id\}`\)/,
  );
  assert.match(
    reports,
    /const countingIntelligenceMonthRequired = React\.useMemo[\s\S]*?COUNTING_INTELLIGENCE_MONTH_CARD_ID_SET/,
  );
  assert.match(
    reports,
    /\.\.\.\(countingIntelligenceMonthRequired[\s\S]*?buildCountingMonthHistoryDefinition/,
  );
  assert.match(
    reports,
    /const visibleCustomHourRequired = requiredCustomGranularitiesKey[\s\S]*?\.includes\("hour"\)/,
  );
  assert.match(
    reports,
    /const canonicalHistoryRequired = countingIntelligenceHourRequired/,
  );
  assert.doesNotMatch(
    reports,
    /\.\.\.\(visibleCardIds\.size[\s\S]*?buildCountingHourHistoryDefinition/,
  );
  assert.match(reports, /onApply=\{applyCountingPeriod\}/);
  assert.match(reports, /onReportChartChange=\{updateComparisonReportChart\}/);
  const exportActionStart = reports.indexOf("<ReportExportActions");
  const exportActions = reports.slice(
    exportActionStart,
    reports.indexOf("/>", exportActionStart) + 2,
  );
  assert.match(exportActions, /getPayload=\{\(signal\) =>/);
  assert.match(exportActions, /resolveScenarioReportPayloadForContext/);
  assert.doesNotMatch(
    exportActions,
    /payload=/,
    "a composição do relatório deve ocorrer somente ao solicitar a exportação",
  );
  assert.match(comparison, /deferSettingsApply[\s\S]*?setDraftSettings/);
  assert.match(comparison, /onReportChartChange\(reportChartKey, loadedReportChart\)/);
});

test("Demographics Ao Vivo compartilha a requisição semântica no replay do Strict Mode", () => {
  const helper = demographicsDashboardSource.slice(
    demographicsDashboardSource.indexOf(
      "async function loadSharedLiveDemographicAggregation",
    ),
    demographicsDashboardSource.indexOf(
      "async function loadLiveDemographicAggregation",
    ),
  );
  const requestKey = demographicsDashboardSource.slice(
    demographicsDashboardSource.indexOf("function liveDemographicRequestKey"),
    demographicsDashboardSource.indexOf(
      "async function loadSharedLiveDemographicAggregation",
    ),
  );

  assert.match(
    demographicsDashboardSource,
    /pendingLiveAggregationRef =\s*React\.useRef<PendingLiveAggregation \| null>\(null\)/,
  );
  assert.match(
    demographicsDashboardSource,
    /surface === "live"[\s\S]*?loadSharedLiveDemographicAggregation\(/,
  );
  assert.match(
    helper,
    /current\?\.key === key\) return current\.promise/,
    "dois consumidores do mesmo tenant e minuto fechado devem aguardar a mesma promise",
  );
  assert.match(
    helper,
    /const controller = new AbortController\(\)[\s\S]*?signal: controller\.signal/,
    "o sinal da fonte compartilhada não pode pertencer ao effect efêmero",
  );
  assert.match(
    requestKey,
    /companyScopeId,[\s\S]*?scopeKey,[\s\S]*?window\.from\.toISOString\(\),[\s\S]*?window\.to\.toISOString\(\),[\s\S]*?refreshVersion/,
    "a identidade deve isolar empresa, fuso/data, janela e atualização manual",
  );
  assert.match(
    demographicsDashboardSource,
    /function forceRefresh\(\) \{[\s\S]*?pendingLiveAggregationRef\.current\.controller/,
    "a atualização explícita ainda deve cancelar a fonte obsoleta",
  );
  assert.match(
    demographicsDashboardSource,
    /if \(!hasVisibleWidgets\) \{[\s\S]*?cancelPendingLiveDemographicAggregation\([\s\S]*?pendingLiveAggregationRef/,
    "ocultar todos os widgets deve cancelar a fonte compartilhada sem consumidor",
  );
  assert.match(
    demographicsDashboardSource,
    /function cancelPendingLiveDemographicAggregation\([\s\S]*?abortRequest\(pending\.controller, reason\)[\s\S]*?pendingRef\.current = null/,
    "o cancelamento deve atingir o controller semântico e remover a referência obsoleta",
  );
});

function sampleRows() {
  return [
    row({
      bucket: "2026-09-01T00:00:00Z",
      camera_id: CAMERA_A,
      age_bucket: "20-29",
      gender: "Woman",
      emotion: "happy",
      count: 2,
    }),
    row({
      bucket: "2026-09-01T00:00:00Z",
      camera_id: CAMERA_B,
      age_bucket: "30-39",
      gender: "Man",
      emotion: "neutral",
      count: 1,
    }),
    row({
      bucket: "2026-09-01T00:00:00Z",
      camera_id: CAMERA_A,
      age_bucket: "20-29",
      gender: "unknown",
      emotion: "fear",
      count: 0,
    }),
    row({
      bucket: "2026-09-01T00:01:00Z",
      camera_id: CAMERA_A,
      age_bucket: "70+",
      gender: "Woman",
      emotion: "sad",
      count: 1,
    }),
  ];
}

function row(overrides = {}) {
  return {
    age_bucket: "20-29",
    bucket: "2026-09-01T14:35:00Z",
    camera_id: CAMERA_A,
    count: 1,
    emotion: "happy",
    gender: "Woman",
    ...overrides,
  };
}

function scopedStorageKey(baseKey, companyId, userId, viewId) {
  const segments = [
    companyId ? `company.${encodeURIComponent(companyId)}` : "",
    userId ? `user.${encodeURIComponent(userId)}` : "",
    viewId ? `view.${encodeURIComponent(viewId)}` : "",
  ].filter(Boolean);
  return segments.length ? `${baseKey}.${segments.join(".")}` : baseKey;
}

function loadTypeScriptModule(relativePath, overrides = {}) {
  const filename = resolve(projectRoot, relativePath);
  const source = readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
  const loadedModule = { exports: {} };
  const execute = new Function(
    "exports",
    "require",
    "module",
    "__filename",
    "__dirname",
    output,
  );
  const nodeRequire = createRequire(filename);
  const localRequire = (specifier) =>
    Object.hasOwn(overrides, specifier)
      ? overrides[specifier]
      : nodeRequire(specifier);
  execute(
    loadedModule.exports,
    localRequire,
    loadedModule,
    filename,
    dirname(filename),
  );
  return loadedModule.exports;
}
