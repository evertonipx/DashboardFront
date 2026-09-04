import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();
const bodyReader = loadTypeScriptModule("lib/ai-insights-body.ts");
const companySettings = loadTypeScriptModule(
  "lib/ai-insights-company-settings.ts",
);
const availabilityRuntime = loadTypeScriptModule(
  "lib/ai-insights-availability.ts",
);
const contract = loadTypeScriptModule("lib/ai-insights-contract.ts");
const localSettings = loadTypeScriptModule("lib/ai-insights-local-settings.ts");
const rateLimit = loadTypeScriptModule("lib/ai-insights-rate-limit.ts");
const openAIService = loadTypeScriptModule("lib/openai-insights.ts");
const { zodTextFormat } = require("openai/helpers/zod");

test("contrato de captura aceita somente dados tabulares limitados e vinculados", () => {
  const request = validRequest();
  assert.equal(contract.AiInsightsRequestSchema.safeParse(request).success, true);

  assert.equal(
    contract.AiInsightsRequestSchema.safeParse({
      ...request,
      unexpected: "não permitido",
    }).success,
    false,
  );

  const booleanCell = structuredClone(request);
  booleanCell.snapshot.report.datasets[0].rows[0][1] = true;
  assert.equal(
    contract.AiInsightsRequestSchema.safeParse(booleanCell).success,
    false,
    "células não podem transportar objetos, booleanos ou metadados arbitrários",
  );

  const mismatchedRow = structuredClone(request);
  mismatchedRow.snapshot.report.datasets[0].rows[0] = ["10h"];
  assert.equal(
    contract.AiInsightsRequestSchema.safeParse(mismatchedRow).success,
    false,
    "cada linha precisa manter a correspondência exata com suas colunas",
  );

  for (const forbiddenField of [
    "apiKey",
    "constraints",
    "model",
    "objective",
    "prompt",
  ]) {
    assert.equal(
      contract.AiInsightsRequestSchema.safeParse({
        ...request,
        [forbiddenField]: "não permitido",
      }).success,
      false,
      `a geração não pode transportar ${forbiddenField}`,
    );
  }
});

test("contrato preserva null como ausência e rejeita limites globais", () => {
  const request = validRequest();
  request.snapshot.report.datasets[0].rows[1][1] = null;
  assert.equal(contract.AiInsightsRequestSchema.safeParse(request).success, true);

  const excessive = validRequest();
  const dataset = excessive.snapshot.report.datasets[0];
  dataset.rows = Array.from(
    { length: contract.AI_INSIGHTS_LIMITS.datasetRows + 1 },
    (_, index) => [`${index}h`, index],
  );
  dataset.coverage.includedRows = dataset.rows.length;
  dataset.coverage.originalRows = dataset.rows.length;
  assert.equal(
    contract.AiInsightsRequestSchema.safeParse(excessive).success,
    false,
  );
});

test("servidor novo normaliza coverage amostrado do contrato v1", () => {
  const legacyRequest = validRequest();
  const coverage = legacyRequest.snapshot.report.datasets[0].coverage;
  coverage.originalRows = 365;
  coverage.includedRows = 2;
  coverage.strategy = "sampled";
  delete coverage.canonical;
  delete coverage.granularity;
  delete coverage.omittedRows;

  const parsed = contract.AiInsightsRequestSchema.parse(legacyRequest);
  assert.deepEqual(parsed.snapshot.report.datasets[0].coverage, {
    canonical: false,
    granularity: "other",
    includedRows: 2,
    notes: [],
    omittedRows: 363,
    originalRows: 365,
    strategy: "sampled",
  });

  const legacyHourlyRequest = validRequest();
  legacyHourlyRequest.snapshot.report.datasets[0].coverage.notes = [
    "Granularidade certificada: hour.",
  ];
  const parsedHourly = contract.AiInsightsRequestSchema.parse(
    legacyHourlyRequest,
  );
  assert.equal(
    parsedHourly.snapshot.report.datasets[0].coverage.granularity,
    "hour",
  );
});

test("contrato do servidor certifica datas da série canônica contra o período", () => {
  const request = validRequest();
  request.snapshot.report.period = {
    from: "2026-08-25",
    label: "25/08/2026 a 27/08/2026",
    to: "2026-08-27",
  };
  request.snapshot.report.datasets = [
    {
      columns: [
        { key: "date", label: "Data", role: "dimension", unit: null },
        { key: "total", label: "Total", role: "measure", unit: null },
      ],
      coverage: {
        canonical: true,
        granularity: "day",
        includedRows: 3,
        notes: [],
        omittedRows: 0,
        originalRows: 3,
        strategy: "complete",
      },
      description: null,
      id: "daily-flow",
      rows: [
        ["2026-08-25", 100],
        ["2026-08-26", 120],
        ["2026-08-27", 130],
      ],
      statistics: [],
      title: "Fluxo diário",
    },
  ];
  assert.equal(contract.AiInsightsRequestSchema.safeParse(request).success, true);

  const duplicate = structuredClone(request);
  duplicate.snapshot.report.datasets[0].rows[1][0] = "2026-08-25";
  assert.equal(
    contract.AiInsightsRequestSchema.safeParse(duplicate).success,
    false,
    "datas repetidas ou fora de ordem não podem ser declaradas canônicas",
  );

  const incomplete = structuredClone(request);
  incomplete.snapshot.report.datasets[0].rows.pop();
  incomplete.snapshot.report.datasets[0].coverage.includedRows = 2;
  incomplete.snapshot.report.datasets[0].coverage.originalRows = 2;
  assert.equal(
    contract.AiInsightsRequestSchema.safeParse(incomplete).success,
    false,
    "o servidor deve rejeitar uma janela diária incompleta",
  );

  const duplicatedCanonicalDataset = structuredClone(request);
  duplicatedCanonicalDataset.snapshot.report.datasets.push({
    ...structuredClone(request.snapshot.report.datasets[0]),
    id: "daily-flow-copy",
  });
  assert.equal(
    contract.AiInsightsRequestSchema.safeParse(duplicatedCanonicalDataset).success,
    false,
    "somente uma linha do tempo pode ser a referência oficial",
  );
});

test("configuração empresarial valida chave write-only, prompt, modelo e acessos", () => {
  const update = validConfigurationUpdate();
  assert.equal(
    contract.AiInsightsConfigurationUpdateSchema.safeParse(update).success,
    true,
  );
  assert.equal(
    contract.AiInsightsConfigurationUpdateSchema.safeParse({
      ...update,
      apiKey: undefined,
    }).success,
    true,
    "omitir a chave deve preservar a credencial já armazenada",
  );
  assert.equal(
    contract.AiInsightsConfigurationUpdateSchema.safeParse({
      ...update,
      apiKey: null,
    }).success,
    true,
    "null deve permitir a remoção explícita da credencial",
  );

  for (const apiKey of [
    "curta",
    "opaque credential 1234567890",
    "opaque\ncredential-1234567890",
    "x".repeat(513),
  ]) {
    assert.equal(
      contract.AiInsightsConfigurationUpdateSchema.safeParse({
        ...update,
        apiKey,
      }).success,
      false,
      `credencial insegura aceita: ${JSON.stringify(apiKey.slice(0, 24))}`,
    );
  }

  for (const requiredField of [
    "constraints",
    "enabledForAdmins",
    "enabledForOperators",
    "model",
    "prompt",
  ]) {
    const missing = { ...update };
    delete missing[requiredField];
    assert.equal(
      contract.AiInsightsConfigurationUpdateSchema.safeParse(missing).success,
      false,
      `campo obrigatório ausente: ${requiredField}`,
    );
  }

  assert.equal(
    contract.AiInsightsConfigurationUpdateSchema.safeParse({
      ...update,
      configured: true,
    }).success,
    false,
    "campos de status não podem ser escritos como configuração",
  );
});

test("leitor limita o corpo UTF-8 completo por bytes", async () => {
  const maximumBytes = contract.AI_INSIGHTS_LIMITS.bodyBytes;
  const exactBody = "á".repeat(maximumBytes / 2);
  assert.equal(new TextEncoder().encode(exactBody).byteLength, maximumBytes);

  const exactRequest = new Request("http://localhost/ai", {
    body: exactBody,
    method: "POST",
  });
  assert.equal(
    await bodyReader.readLimitedUtf8Body(exactRequest, maximumBytes),
    exactBody,
  );

  const excessiveRequest = new Request("http://localhost/ai", {
    body: `${exactBody}a`,
    method: "POST",
  });
  await assert.rejects(
    () => bodyReader.readLimitedUtf8Body(excessiveRequest, maximumBytes),
    (error) => error?.code === "payload_too_large",
  );

  const invalidUtf8 = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([0xc3]));
      controller.close();
    },
  });
  await assert.rejects(
    () =>
      bodyReader.readLimitedUtf8Body(
        { body: invalidUtf8, signal: new AbortController().signal },
        maximumBytes,
      ),
    (error) => error?.code === "invalid_body",
  );
});

test("resposta executiva exige todos os campos e usa nullable em vez de optional", () => {
  const insights = validInsights();
  const apiResponse = {
    insights,
    meta: {
      generatedAt: "2026-08-26T15:00:00.000Z",
      model: "gpt-5.6-terra",
      usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
    },
  };
  assert.equal(contract.AiInsightsResponseSchema.safeParse(insights).success, true);
  assert.equal(
    contract.AiInsightsApiResponseSchema.safeParse(apiResponse).success,
    true,
  );
  assert.equal(
    contract.AiInsightsReportSchema.safeParse({
      id: "analysis-1",
      ...apiResponse,
    }).success,
    true,
  );

  const modelOutput = {
    summary: insights.summary,
    findings: insights.findings,
    actions: insights.actions,
  };
  assert.equal(
    contract.AiInsightsModelOutputSchema.safeParse(modelOutput).success,
    true,
  );
  assert.equal(
    contract.AiInsightsModelOutputSchema.safeParse({
      ...modelOutput,
      dataQuality: insights.dataQuality,
    }).success,
    false,
    "o modelo não deve consumir a resposta com uma auditoria de qualidade",
  );

  const legacyVerboseResponse = structuredClone(apiResponse);
  legacyVerboseResponse.insights.findings = Array.from(
    { length: 8 },
    (_, index) => ({
      ...insights.findings[0],
      title: `Achado legado ${index + 1}`,
    }),
  );
  legacyVerboseResponse.insights.actions = Array.from(
    { length: 8 },
    (_, index) => ({
      ...insights.actions[0],
      title: `Ação legada ${index + 1}`,
    }),
  );
  legacyVerboseResponse.insights.questions = Array.from(
    { length: 6 },
    (_, index) => `Pergunta legada ${index + 1}?`,
  );
  const normalizedLegacy = contract.AiInsightsCompatibleApiResponseSchema.parse(
    legacyVerboseResponse,
  );
  assert.equal(normalizedLegacy.insights.findings.length, 3);
  assert.equal(normalizedLegacy.insights.actions.length, 3);
  assert.equal(normalizedLegacy.insights.questions.length, 3);

  const missingNullableField = structuredClone(insights);
  delete missingNullableField.actions[0].target;
  assert.equal(
    contract.AiInsightsResponseSchema.safeParse(missingNullableField).success,
    false,
  );
});

test("SDK converte o contrato Zod 4 para Structured Outputs sem rede", () => {
  const format = zodTextFormat(
    contract.AiInsightsResponseSchema,
    "ipxdata_operational_insights_test",
  );

  assert.equal(format.type, "json_schema");
  assert.equal(format.strict, true);
  assert.equal(format.name, "ipxdata_operational_insights_test");
  assert.deepEqual(
    [...format.schema.required].sort(),
    [
      "actions",
      "dataQuality",
      "disclaimer",
      "findings",
      "period",
      "questions",
      "source",
      "summary",
    ].sort(),
  );

  const modelFormat = zodTextFormat(
    contract.AiInsightsModelOutputSchema,
    "ipxdata_outcome_advisor_test",
  );
  assert.deepEqual(
    [...modelFormat.schema.required].sort(),
    ["actions", "findings", "summary"],
  );
});

test("cobertura técnica é certificada pelo servidor, não pelo modelo", () => {
  const partial = contract.AiInsightsRequestSchema.parse(validRequest()).snapshot;
  assert.deepEqual(openAIService.certifySnapshotCoverage(partial), {
    status: "parcial",
    notes: [
      "A visão não forneceu uma série diária canônica para certificar todo o período.",
    ],
  });

  const canonicalRequest = validRequest();
  canonicalRequest.snapshot.report.datasets[0] = {
    ...canonicalRequest.snapshot.report.datasets[0],
    columns: [
      { key: "date", label: "Data", role: "dimension", unit: null },
      { key: "total", label: "Total", role: "measure", unit: "pessoas" },
    ],
    rows: [["2026-08-26", 120]],
    coverage: {
      canonical: true,
      granularity: "day",
      originalRows: 1,
      includedRows: 1,
      strategy: "complete",
      notes: [],
    },
  };
  const canonical = contract.AiInsightsRequestSchema.parse(canonicalRequest).snapshot;
  assert.deepEqual(openAIService.certifySnapshotCoverage(canonical), {
    status: "suficiente",
    notes: [],
  });

  const emptyRequest = validRequest();
  emptyRequest.snapshot.report.datasets[0].rows = [];
  emptyRequest.snapshot.report.datasets[0].coverage = {
    originalRows: 0,
    includedRows: 0,
    strategy: "complete",
    notes: [],
  };
  const empty = contract.AiInsightsRequestSchema.parse(emptyRequest).snapshot;
  assert.equal(
    openAIService.certifySnapshotCoverage(empty).status,
    "insuficiente",
  );
});

test("status expõe papel e disponibilidade sem devolver a chave empresarial", () => {
  const previousModel = process.env.OPENAI_MODEL;
  const previousAllowedModels = process.env.OPENAI_ALLOWED_MODELS;

  try {
    process.env.OPENAI_MODEL = "gpt-default";
    process.env.OPENAI_ALLOWED_MODELS =
      "gpt-secondary,gpt-default,modelo com espaço,gpt-secondary";
    const runtime = openAIService.getAiInsightsConfiguration();
    assert.deepEqual(runtime, {
      allowedModels: ["gpt-default", "gpt-secondary"],
      model: "gpt-default",
    });

    const masterStatus = validStatus({
      available: true,
      configuration: validAdminConfiguration(),
      role: "master",
    });
    assert.equal(
      contract.AiInsightsStatusResponseSchema.safeParse(masterStatus).success,
      true,
    );
    assert.equal(Object.hasOwn(masterStatus, "apiKey"), false);
    assert.equal(
      Object.hasOwn(masterStatus.configuration, "apiKey"),
      false,
      "nem o superadmin pode receber a chave salva",
    );

    const adminStatus = validStatus({
      available: true,
      configuration: null,
      role: "admin",
    });
    assert.equal(
      contract.AiInsightsStatusResponseSchema.safeParse(adminStatus).success,
      true,
    );
    assert.equal(
      contract.AiInsightsStatusResponseSchema.safeParse({
        ...adminStatus,
        configuration: validAdminConfiguration(),
      }).success,
      false,
      "a configuração detalhada deve ser exclusiva do master",
    );
    assert.equal(
      contract.AiInsightsStatusResponseSchema.safeParse({
        ...adminStatus,
        available: true,
        configured: false,
      }).success,
      false,
      "uma empresa sem credencial não pode anunciar IA disponível",
    );
    assert.equal(
      contract.AiInsightsScopedStatusResponseSchema.safeParse({
        latestReport: validReport(),
        status: adminStatus,
      }).success,
      true,
    );
    assert.equal(
      contract.AiInsightsScopedStatusResponseSchema.safeParse({
        latestReport: validReport(),
        status: { ...adminStatus, available: false },
      }).success,
      false,
      "um perfil desabilitado não pode receber a última análise",
    );
    assert.equal(
      contract.AiInsightsStatusResponseSchema.safeParse({
        ...masterStatus,
        apiKey: "opaque-server-credential-1234567890",
      }).success,
      false,
      "o schema de status deve rejeitar segredo no nível raiz",
    );
    assert.equal(
      contract.AiInsightsStatusResponseSchema.safeParse({
        ...masterStatus,
        configuration: {
          ...masterStatus.configuration,
          apiKey: "opaque-server-credential-1234567890",
        },
      }).success,
      false,
      "o schema administrativo deve rejeitar segredo na configuração",
    );

  } finally {
    restoreEnvironment("OPENAI_MODEL", previousModel);
    restoreEnvironment("OPENAI_ALLOWED_MODELS", previousAllowedModels);
  }
});

test("limitador aplica concorrência, janela por minuto, hora e teto global", () => {
  const limiter = new rateLimit.AiInsightsRateLimiter();
  const first = limiter.acquire("user-a", 1_000);
  assert.equal(first.allowed, true);
  assert.deepEqual(limiter.acquire("user-a", 1_000), {
    allowed: false,
    reason: "user_concurrency",
    retryAfterSeconds: 2,
  });
  first.release();

  for (let index = 0; index < 2; index += 1) {
    const capacity = limiter.acquire("user-a", 1_000 + index);
    assert.equal(capacity.allowed, true);
    capacity.release();
  }
  const minuteLimited = limiter.acquire("user-a", 1_003);
  assert.equal(minuteLimited.allowed, false);
  assert.equal(minuteLimited.reason, "rate");
  assert.ok(minuteLimited.retryAfterSeconds >= 59);

  const hourly = new rateLimit.AiInsightsRateLimiter();
  for (let index = 0; index < 20; index += 1) {
    const capacity = hourly.acquire("user-hour", 10_000 + index * 61_000);
    assert.equal(capacity.allowed, true);
    capacity.release();
  }
  const hourLimited = hourly.acquire("user-hour", 10_000 + 20 * 61_000);
  assert.equal(hourLimited.allowed, false);
  assert.equal(hourLimited.reason, "rate");

  const global = new rateLimit.AiInsightsRateLimiter();
  const acquired = Array.from({ length: 4 }, (_, index) =>
    global.acquire(`user-${index}`, 2_000),
  );
  assert.ok(acquired.every((capacity) => capacity.allowed));
  assert.deepEqual(global.acquire("user-5", 2_000), {
    allowed: false,
    reason: "global_concurrency",
    retryAfterSeconds: 2,
  });
  acquired.forEach((capacity) => capacity.allowed && capacity.release());
});

test("integração OpenAI permanece server-only, estruturada e sem binding sensível", () => {
  const source = readFileSync(
    resolve(projectRoot, "lib/openai-insights.ts"),
    "utf8",
  );
  assert.match(source, /^import "server-only";/);
  assert.match(
    source,
    /client\.responses\s*\.create\([\s\S]*?\)\s*\.withResponse\(\)/,
    "a chamada deve preservar os headers upstream para correlação segura",
  );
  assert.doesNotMatch(
    source,
    /client\.responses\.parse\(/,
    "o status upstream precisa ser inspecionado antes de tentar interpretar JSON parcial",
  );
  assert.match(source, /AiInsightsModelOutputSchema/);
  assert.match(source, /zodTextFormat\([\s\S]*?AiInsightsModelOutputSchema/);
  assert.match(source, /OPENAI_INSIGHTS_MAX_OUTPUT_TOKENS = 12_000/);
  assert.match(source, /OPENAI_INSIGHTS_TIMEOUT_MS = 90_000/);
  assert.match(
    source,
    /reasoning:\s*\{\s*effort:\s*"low"\s*,?\s*\}/,
    "o modelo não pode consumir silenciosamente o orçamento inteiro com reasoning médio",
  );
  assert.match(
    source,
    /text:\s*\{[\s\S]*?verbosity:\s*"low"[\s\S]*?\}/,
    "a resposta executiva deve pedir baixa verbosidade sem abandonar o schema",
  );
  assert.match(
    source,
    /response\.incomplete_details\?\.reason/,
    "o motivo de uma resposta incompleta deve ser certificado antes do parse",
  );
  assert.match(source, /response\.output_text/);
  assert.match(source, /store: false/);
  assert.match(source, /DEFAULT_OPENAI_MODEL = "gpt-5\.6-terra"/);
  assert.match(source, /safety_identifier: hashSafetyIdentifier/);
  assert.match(source, /Examine cada linha do dataset diário/);
  assert.match(source, /canonical=true/);
  assert.match(source, /referência comparável e delta determinístico/);
  assert.match(source, /no máximo 3 achados/);
  assert.match(
    source,
    /mudança quantificada → oportunidade → próxima ação → meta de validação/,
  );
  assert.match(source, /businessPlaybook é contexto estratégico/);
  assert.match(source, /Projeções e cenários nunca são resultados realizados/);
  assert.match(source, /Não produzir seção de qualidade, metodologia, limitações ou perguntas/);
  assert.match(source, /businessPlaybook: constraints/);
  assert.match(source, /dataQuality: certifySnapshotCoverage\(snapshot\)/);
  assert.match(source, /questions: \[\]/);
  assert.match(
    source,
    /const snapshotWithoutBinding = \{[\s\S]*?report:[\s\S]*?source:[\s\S]*?version:/,
  );
  assert.match(source, /sanitizeModelValue\(/);
  assert.match(source, /\[e-mail removido\]/);
  assert.match(source, /\[credencial removida\]/);
  assert.match(source, /const client = createOpenAIClient\(apiKey\)/);
  assert.match(
    source,
    /OPENAI_API_BASE_URL = "https:\/\/api\.openai\.com\/v1"/,
  );
  assert.match(
    source,
    /buildModelInput\(snapshot, objective, constraints\)/,
  );
  assert.doesNotMatch(source, /openAIClientKeyFingerprint|let openAIClient/);
  assert.doesNotMatch(source, /defaultHeaders|process\.env\.OPENAI_BASE_URL/);
  assert.match(
    source,
    /error\.status === 401 \|\| error\.status === 403[\s\S]*?"invalid_api_key"/,
  );
  assert.match(
    source,
    /error\.status === 404 \|\| isModelError\(error\)[\s\S]*?"model_unavailable"/,
    "modelo inexistente ou indisponível deve ter diagnóstico próprio",
  );
  assert.doesNotMatch(source, /NEXT_PUBLIC_OPENAI/);
});

test("falhas da OpenAI registram somente diagnóstico seguro e acionável", () => {
  const service = readFileSync(
    resolve(projectRoot, "lib/openai-insights.ts"),
    "utf8",
  );
  const route = readFileSync(
    resolve(projectRoot, "app/api/v1/ai/insights/route.ts"),
    "utf8",
  );
  const diagnosticsSource = `${service}\n${route}`;

  for (const field of [
    "incompleteReason",
    "upstreamCode",
    "upstreamRequestId",
    "upstreamStatus",
  ]) {
    assert.match(
      diagnosticsSource,
      new RegExp(`\\b${field}\\b`),
      `diagnóstico seguro ausente: ${field}`,
    );
  }

  const logMarker = route.indexOf('"[ai-insights] request failed"');
  const logStart = route.lastIndexOf("console.error(", logMarker);
  assert.notEqual(logStart, -1, "a falha precisa manter correlação operacional");
  const logEnd = route.indexOf(");", logMarker);
  assert.notEqual(logEnd, -1, "não foi possível delimitar o log da rota IA");
  const logBlock = route.slice(logStart, logEnd + 2);

  assert.match(logBlock, /diagnostic|incompleteReason|upstreamStatus/i);
  assert.doesNotMatch(logBlock, /error\.message|error\.error|settings\.apiKey/);
  assert.doesNotMatch(logBlock, /authorization|headers|payload|requestApiKey/i);
});

test("rota IA usa configuração por empresa e separa status, escrita e geração", () => {
  const route = readFileSync(
    resolve(projectRoot, "app/api/v1/ai/insights/route.ts"),
    "utf8",
  );
  const api = readFileSync(resolve(projectRoot, "lib/api.ts"), "utf8");
  const envExample = readFileSync(
    resolve(projectRoot, ".env.production.example"),
    "utf8",
  );

  assert.match(route, /export async function GET/);
  assert.match(route, /export async function PUT/);
  assert.match(route, /export async function POST/);
  assert.match(
    route,
    /export async function GET[\s\S]*?readAiInsightsCompanySettings\(\s*authentication\.companyId[\s\S]*?buildStatusResponse\(authentication, settings\)/,
    "GET deve carregar o status da empresa autenticada",
  );
  assert.match(
    route,
    /export async function PUT[\s\S]*?if \(!authentication\.isMaster\)[\s\S]*?ai_configuration_forbidden[\s\S]*?saveAiInsightsCompanySettings\(\s*authentication\.companyId,\s*update,\s*authentication\.user\.id/,
    "PUT deve ser master-only e gravar somente no escopo empresarial",
  );
  assert.match(
    route,
    /export async function POST[\s\S]*?readAiInsightsCompanySettings\(\s*authentication\.companyId[\s\S]*?companySettingsAllowUser\(settings, authentication\.user\)[\s\S]*?RouteFailure\("ai_access_disabled", 403\)/,
    "POST deve negar perfis desabilitados antes de gerar",
  );
  assert.match(
    route,
    /generateOpenAIInsights\(\{[\s\S]*?apiKey: settings\.apiKey,[\s\S]*?constraints: settings\.constraints\.trim\(\) \|\| null,[\s\S]*?model: settings\.model,[\s\S]*?objective: settings\.prompt,[\s\S]*?snapshot: boundPayload\.snapshot/,
    "segredo, prompt e modelo devem ser carregados do store no servidor",
  );
  assert.match(
    route,
    /configuration: authentication\.isMaster[\s\S]*?: null/,
    "GET só pode devolver a configuração administrativa ao master",
  );
  assert.match(route, /toPublicAiInsightsCompanySettings\(settings\)/);
  assert.match(route, /credentialFingerprint\(settings\.apiKey\)/);
  assert.match(route, /"\/api\/v1\/auth\/me"/);
  assert.match(route, /reconcileCurrentUserWithAccessToken/);
  assert.match(route, /master_company_required/);
  assert.match(route, /company_binding_mismatch/);
  assert.match(route, /user_binding_mismatch/);
  assert.match(route, /resolveCurrentUserCompanyTimeZone/);
  assert.doesNotMatch(route, /\/api\/v1\/companies\/\$\{/);
  assert.match(route, /"\/api\/v1\/company\/modules"/);
  assert.match(route, /authentication\.user\.permissions === undefined/);
  assert.match(route, /canViewCounting/);
  assert.match(route, /canViewOccupancy/);
  assert.match(
    route,
    /readJsonPayload\(\s*request,\s*AI_INSIGHTS_LIMITS\.bodyBytes/,
    "a geração deve usar o limite de corpo do snapshot",
  );
  assert.match(
    route,
    /readJsonPayload\(\s*request,\s*AI_INSIGHTS_CONFIGURATION_BODY_BYTES/,
    "a atualização administrativa deve ter limite próprio",
  );
  assert.match(route, /issue\.path\[0\] === "apiKey"/);
  assert.match(route, /aiInsightsRateLimiter\.acquire/);
  assert.match(route, /readOptionalReportScope\(request\)/);
  assert.match(route, /readLatestAiInsightsReport/);
  assert.match(route, /AiInsightsScopedStatusResponseSchema\.parse/);
  assert.match(route, /saveLatestAiInsightsReport\(authentication\.companyId, report\)/);
  assert.match(route, /AiInsightsReportSchema\.parse\(\{/);
  assert.match(
    route,
    /catch \{[\s\S]*?if \(sourceSignal\.aborted\)[\s\S]*?RouteFailure\("request_aborted", 499\)/,
    "cancelar a tela deve preservar o aborto também nas certificações do backend",
  );
  assert.match(
    route,
    /return jsonResponse\(response, 200, requestId\)/,
    "o POST deve preservar o contrato legado durante deploys mistos",
  );
  assert.match(route, /Retry-After/);
  assert.match(route, /"Cache-Control": "no-store, max-age=0"/);
  assert.doesNotMatch(route, /process\.env\.OPENAI_API_KEY/);
  assert.doesNotMatch(route, /analysisPayload\.(?:apiKey|constraints|model|prompt)/);
  assert.doesNotMatch(route, /boundPayload\.(?:apiKey|constraints|model|prompt)/);
  assert.match(api, /return \[[\s\S]*?"\/ai",[\s\S]*?"\/analytics"/);
  assert.match(envExample, /^OPENAI_MODEL=gpt-5\.6-terra$/m);
  assert.match(envExample, /^OPENAI_ALLOWED_MODELS=gpt-5\.6-terra$/m);
  assert.doesNotMatch(envExample, /^OPENAI_API_KEY=/m);
  assert.doesNotMatch(envExample, /NEXT_PUBLIC_OPENAI/);
});

test("parser leve da disponibilidade mantém o contrato fail-closed", () => {
  const scopeKey = '["user-a","company-a","counting","live"]';
  const report = validReport();
  const status = validStatus();

  assert.deepEqual(
    availabilityRuntime.parseAiInsightsAvailabilityPayload(
      { latestReport: report, status },
      scopeKey,
    ),
    { latestReport: report, scopeKey, status },
  );
  assert.deepEqual(
    availabilityRuntime.parseAiInsightsAvailabilityPayload(status, scopeKey),
    { latestReport: null, scopeKey, status },
    "o deploy legado deve continuar aceito sem segunda consulta",
  );

  for (const invalid of [
    { ...status, available: true, configured: false },
    { ...status, role: "guest" },
    { ...status, allowedModels: [status.model, status.model] },
    { ...status, limits: { ...status.limits, maxDatasets: 0 } },
    { ...status, unexpected: true },
    {
      latestReport: report,
      status: { ...status, available: false },
    },
  ]) {
    assert.equal(
      availabilityRuntime.parseAiInsightsAvailabilityPayload(invalid, scopeKey),
      null,
    );
  }

  assert.equal(
    availabilityRuntime.isAiInsightsFailClosedError(
      new availabilityRuntime.AiInsightsAvailabilityPayloadError(),
    ),
    true,
  );
  assert.equal(
    availabilityRuntime.isAiInsightsFailClosedError({ status: 403 }),
    true,
  );
  assert.equal(
    availabilityRuntime.isAiInsightsFailClosedError(new Error("offline")),
    false,
    "uma falha transitória de rede não deve revogar visualmente um acesso já validado",
  );
});

test("ação abre a última análise, gera sob demanda e exporta o IA Advisor", () => {
  const action = readFileSync(
    resolve(projectRoot, "components/app/ai-analysis-action.tsx"),
    "utf8",
  );
  const deferredAction = readFileSync(
    resolve(projectRoot, "components/app/deferred-ai-analysis-action.tsx"),
    "utf8",
  );
  const availability = readFileSync(
    resolve(projectRoot, "lib/ai-insights-availability.ts"),
    "utf8",
  );
  const exportActions = readFileSync(
    resolve(projectRoot, "components/app/report-export-actions.tsx"),
    "utf8",
  );
  const layout = readFileSync(resolve(projectRoot, "app/layout.tsx"), "utf8");

  assert.match(
    availability,
    /`\/ai\/insights\?module=\$\{module\}&surface=\$\{surface\}`/,
    "o ícone deve consultar o último relatório no escopo selecionado",
  );
  assert.match(availability, /parseAiInsightsAvailabilityPayload\(payload, scopeKey\)/);
  assert.match(availability, /value\.available && !value\.configured/);
  assert.match(action, /storeNewestScopedReport\(initialReport\)/);
  assert.match(action, /if \(!available\) return null/);
  assert.match(action, /createAiAnalysisSnapshot/);
  assert.match(action, /createLegacyCompatibleAiInsightsRequest\(snapshot\)/);
  assert.match(action, /assertServiceAcceptsSnapshot\(snapshot, requestPayload, serviceLimits\)/);
  assert.match(action, /LEGACY_AI_MAX_TOTAL_CELLS = 6_000/);
  assert.match(action, /totalCells > LEGACY_AI_MAX_TOTAL_CELLS/);
  assert.match(action, /body: requestPayload/);
  assert.match(action, /AiInsightsReportSchema\.safeParse\(responsePayload\)/);
  assert.match(action, /AiInsightsCompatibleApiResponseSchema\.safeParse\(responsePayload\)/);
  assert.match(action, /<Dialog open=\{dialogOpen\}/);
  assert.match(action, /onClick=\{openAdvisor\}/);
  assert.match(action, /<BrainCog[\s\S]*?strokeWidth=\{1\.8\}/);
  assert.match(action, /aria-haspopup="dialog"/);
  assert.match(action, /aria-expanded=\{dialogOpen\}/);
  assert.doesNotMatch(action, /Sparkles|BrainCircuit/);
  assert.doesNotMatch(
    action,
    /function openAdvisor\(\)[\s\S]*?refreshAvailability\(\)/,
    "abrir o diálogo deve reutilizar o status e o relatório já carregados",
  );
  assert.match(action, /Gerar novo relatório/);
  assert.match(action, /Exportar PDF/);
  assert.match(action, /exportAiInsightsToPdf\(report, \{/);
  assert.match(action, /companyLabel/);
  assert.match(action, /aria-describedby/);
  assert.match(action, /<AiInsightsResult[\s\S]*?result=\{report\.insights\}/);
  assert.doesNotMatch(
    action,
    /aria-label="Abrir IA Advisor[^>]*[\s\S]{0,300}onClick=\{\(\) => void generateInsights\(\)\}/,
    "abrir o diálogo não pode consumir uma nova chamada da OpenAI",
  );
  assert.match(action, /abortAnalysis\(\s*analysisControllerRef\.current/);
  assert.match(action, /analysisRequestSequence\.current \+= 1/);
  assert.match(action, /role="status" aria-live="polite"/);
  assert.doesNotMatch(action, /next\/navigation|router\.(?:push|replace)/);
  assert.doesNotMatch(
    action,
    /body:\s*\{[\s\S]*?(?:apiKey|constraints|model|objective|prompt)/,
    "o POST do navegador não pode transportar configuração nem segredo",
  );
  assert.doesNotMatch(action, /localStorage|sessionStorage/);
  assert.doesNotMatch(deferredAction, /localStorage|sessionStorage/);
  assert.doesNotMatch(layout, /AiAnalysisProvider|ai-analysis-provider/);
  assert.match(action, /payload\?: ReportPayload/);
  assert.match(exportActions, /payload\?: ReportPayload/);
  assert.match(
    action,
    /const hasData = payload[\s\S]*?Boolean\(getPayload\)/,
    "o Advisor deve permitir captura sob demanda sem montar relatório no render",
  );
  assert.match(
    exportActions,
    /if \(!exportPayload\)[\s\S]*?dados do relatório ainda não estão disponíveis/,
    "a exportação deve validar com segurança a ausência de payload somente no clique",
  );

  const integrations = [
    ["components/app/realtime-dashboard.tsx", /module: "counting", surface: "live"/],
    ["components/app/period-analysis-dashboard.tsx", /module: "counting", surface: "analysis"/],
    ["components/app/scenario-reports-dashboard.tsx", /module: "counting", surface: "reports"/],
    ["components/app/occupancy-scenario-dashboard.tsx", /module: "occupancy", surface: "live"/],
  ];
  for (const [pathname, pattern] of integrations) {
    const source = readFileSync(resolve(projectRoot, pathname), "utf8");
    assert.match(source, /<AiAnalysisAction/);
    assert.match(source, pattern);
  }

  const periodAnalysis = readFileSync(
    resolve(projectRoot, "components/app/period-analysis-dashboard.tsx"),
    "utf8",
  );
  assert.match(
    periodAnalysis,
    /const queryWidgets = React\.useMemo\([\s\S]*?orderByCardPreferences\(widgets, preferences\)[\s\S]*?models: queryWidgets\.flatMap/,
    "a captura deve seguir visibilidade e ordem configuradas na tela",
  );
  assert.doesNotMatch(
    periodAnalysis,
    /model: modelByWidgetId\.get\(widget\.id\)!/,
    "a captura não pode assumir que o modelo já existe durante a hidratação",
  );

  const occupancyReports = readFileSync(
    resolve(projectRoot, "components/app/occupancy-reports-dashboard.tsx"),
    "utf8",
  );
  assert.match(occupancyReports, /surface: analysis \? "analysis" : "reports"/);
  assert.match(occupancyReports, /getPayload=\{getOccupancyAiPayload\}/);
  assert.match(occupancyReports, /AI_OCCUPANCY_DAILY_CHUNK_DAYS = 62/);
  assert.match(occupancyReports, /Série diária completa de ocupação/);
  const realtimeDashboard = readFileSync(
    resolve(projectRoot, "components/app/realtime-dashboard.tsx"),
    "utf8",
  );
  assert.match(
    realtimeDashboard,
    /<AiAnalysisAction[\s\S]*?getPayload=\{buildAiLiveReportPayload\}/,
  );
  assert.match(
    realtimeDashboard,
    /async function buildConfiguredLiveReportPayload\(signal\?: AbortSignal\)[\s\S]*?fetchScenarioComparisonRows\([\s\S]*?\{ signal \},[\s\S]*?signal\?\.throwIfAborted\(\)/,
    "a captura do Ao Vivo deve cancelar também os comparativos em andamento",
  );
  assert.match(
    realtimeDashboard,
    /buildAiLiveReportPayload\(signal\?: AbortSignal\)[\s\S]*?buildConfiguredLiveReportPayload\(signal\)/,
  );
  assert.match(realtimeDashboard, /function buildLiveReportAssets\(\)/);
  assert.doesNotMatch(realtimeDashboard, /const liveReportPayload\s*=/);
  assert.doesNotMatch(
    realtimeDashboard,
    /<ReportExportActions[\s\S]{0,500}?payload=/,
  );
  const scenarioReports = readFileSync(
    resolve(projectRoot, "components/app/scenario-reports-dashboard.tsx"),
    "utf8",
  );
  assert.match(
    scenarioReports,
    /<AiAnalysisAction[\s\S]*?getPayload=\{buildAiScenarioReportPayload\}/,
  );
  assert.match(
    scenarioReports,
    /buildAiScenarioReportPayload\(signal\?: AbortSignal\)[\s\S]*?resolveScenarioReportPayloadForContext\(\s*requestSignal,\s*"análise da IA"/,
    "a IA de Relatórios deve usar o sinal recebido sem tocar no controller da exportação",
  );
  assert.doesNotMatch(
    scenarioReports,
    /buildAiScenarioReportPayload\(signal\?: AbortSignal\)[\s\S]{0,400}buildConfiguredScenarioReportPayload\(\)/,
  );
  assert.match(scenarioReports, /function buildScenarioReportAssets\(\)/);
  assert.doesNotMatch(scenarioReports, /const scenarioReportPayload\s*=/);
  assert.match(periodAnalysis, /getPayload=\{buildAiPeriodAnalysisPayload\}/);
  assert.match(
    periodAnalysis,
    /getPayload=\{buildPeriodAnalysisReportPayload\}/,
  );
  assert.doesNotMatch(periodAnalysis, /const reportPayload = composePeriodAnalysisReport/);
  assert.match(
    occupancyReports,
    /getPayload=\{buildOccupancyReportPayload\}/,
  );
  assert.doesNotMatch(
    occupancyReports,
    /<ReportExportActions[\s\S]{0,500}?payload=/,
  );
  for (const source of [
    periodAnalysis,
    realtimeDashboard,
    scenarioReports,
  ]) {
    assert.match(source, /Detalhamento diário da Contagem/);
  }
});

test("disponibilidade do IA Advisor compartilha consultas por escopo e absorve rajadas de foco", () => {
  const action = readFileSync(
    resolve(projectRoot, "components/app/ai-analysis-action.tsx"),
    "utf8",
  );
  const deferredAction = readFileSync(
    resolve(projectRoot, "components/app/deferred-ai-analysis-action.tsx"),
    "utf8",
  );
  const availability = readFileSync(
    resolve(projectRoot, "lib/ai-insights-availability.ts"),
    "utf8",
  );

  assert.match(
    availability,
    /const aiInsightsAvailabilityCache = new Map<[\s\S]*?AiInsightsAvailabilityCacheEntry[\s\S]*?>\(\)/,
  );
  assert.match(
    availability,
    /JSON\.stringify\(\[userId, companyScopeId, module, surface\]\)/,
    "cache deve isolar usuário, empresa, módulo e visão",
  );
  assert.match(availability, /AI_INSIGHTS_AVAILABILITY_CACHE_TTL_MS = 30_000/);
  assert.match(availability, /AI_INSIGHTS_AVAILABILITY_ERROR_TTL_MS = 5_000/);
  assert.match(
    availability,
    /let request = entry\.request;[\s\S]*?if \(!request\)[\s\S]*?entry\.request = sharedRequest/,
    "montagens concorrentes devem compartilhar a mesma promessa",
  );
  assert.match(
    availability,
    /request\.subscribers \+= 1;[\s\S]*?request\.subscribers = Math\.max[\s\S]*?request\.controller\.abort/,
    "a requisição só pode ser cancelada quando perder todos os consumidores",
  );
  assert.match(availability, /\{ companyScopeId, signal \}/);
  assert.match(deferredAction, /window\.addEventListener\("focus", handleFocus\)/);
  assert.match(deferredAction, /for \(const release of releases\) release\(\)/);
  assert.match(
    action,
    /storeNewestScopedReport\(generatedReport\);[\s\S]*?storeAiInsightsAvailabilityReport\(activeScopeKey, generatedReport\)/,
    "o POST deve atualizar o cache local sem disparar um GET de confirmação",
  );

  const generateBlock = action.slice(
    action.indexOf("async function generateInsights()"),
    action.indexOf("async function exportReport()"),
  );
  const openBlock = action.slice(
    action.indexOf("function openAdvisor()"),
    action.indexOf("if (!available) return null;"),
  );
  assert.doesNotMatch(generateBlock, /refreshAvailability\(\)/);
  assert.doesNotMatch(openBlock, /refreshAvailability\(\)/);
  assert.equal(
    availability.match(/`\/ai\/insights\?module=/g)?.length,
    1,
    "deve existir um único caminho de GET para disponibilidade e último relatório",
  );
  assert.doesNotMatch(
    deferredAction,
    /requestIdleCallback|setTimeout\([^)]*setReady/,
    "o runtime completo da IA não pode baixar automaticamente em idle",
  );
  assert.match(
    deferredAction,
    /onFocus=\{preloadRuntime\}[\s\S]*?onMouseEnter=\{preloadRuntime\}[\s\S]*?onPointerDown=\{preloadRuntime\}/,
    "a intenção deve antecipar o chunk sem trocar o botão focado",
  );
  assert.match(
    deferredAction,
    /function preloadRuntime\(\)[\s\S]*?runtimePromise === request[\s\S]*?runtimePromise = null/,
    "uma falha de prefetch não pode envenenar a primeira abertura",
  );
  assert.match(
    deferredAction,
    /Component = await request;[\s\S]*?catch[\s\S]*?loadAiAnalysisActionRuntime\(\)[\s\S]*?Component = await request/,
    "o clique deve repetir uma importação que falhou durante a intenção",
  );
  assert.match(
    deferredAction,
    /<Runtime[\s\S]*?availability=\{availability\}[\s\S]*?initialDialogOpen/,
    "o primeiro clique deve entregar o GET já resolvido e abrir o diálogo",
  );
  const refreshAvailabilityBlock = deferredAction.slice(
    deferredAction.indexOf("const refreshAvailability = React.useCallback"),
    deferredAction.indexOf("React.useEffect(() =>"),
  );
  assert.doesNotMatch(
    refreshAvailabilityBlock,
    /availabilityState\?\.scopeKey/,
    "o callback de disponibilidade não pode depender do estado que ele próprio atualiza",
  );
  assert.doesNotMatch(
    `${deferredAction}\n${availability}`,
    /from ["']zod["']|AiInsights(?:ScopedStatusResponse|StatusResponse)Schema/,
    "o controle leve não deve carregar nem executar Zod antes da interação",
  );
});

test("dashboard master persiste no servidor e usa localStorage somente na migração", () => {
  const dashboard = readFileSync(
    resolve(projectRoot, "components/app/ai-insights-dashboard.tsx"),
    "utf8",
  );

  assert.match(
    dashboard,
    /apiFetch<unknown>\("\/ai\/insights", \{\s*companyScopeId,\s*\}\)/,
  );
  assert.match(dashboard, /method: "PUT"/);
  assert.match(
    dashboard,
    /body: \{[\s\S]*?apiKey: null[\s\S]*?apiKey[\s\S]*?\.\.\.form/,
    "a chave deve ser write-only e a configuração deve seguir pelo PUT",
  );
  assert.match(dashboard, /AiInsightsStatusResponseSchema\.safeParse\(payload\)/);
  assert.match(dashboard, /nextStatus\.configuration/);
  assert.match(dashboard, /type=\{showApiKey \? "text" : "password"\}/);
  assert.match(dashboard, /autoComplete="off"/);
  assert.match(dashboard, /data-1p-ignore="true"/);
  assert.match(dashboard, /data-lpignore="true"/);
  assert.match(dashboard, /spellCheck=\{false\}/);
  assert.match(dashboard, /AiInsightsApiKeySchema\.safeParse\(apiKey\)/);
  assert.match(dashboard, /retry: false/);
  assert.match(dashboard, /status\.allowedModels\.map/);
  assert.match(dashboard, /loadAiInsightsLocalApiKey/);
  assert.match(dashboard, /loadAiInsightsLocalPrompt/);
  assert.match(dashboard, /if \(!configuration\.updatedAt\)/);
  assert.match(
    dashboard,
    /findLegacyPrompt\(\s*requestedCompanyScopeId,\s*requestedUserId,?\s*\)/,
  );
  assert.match(
    dashboard,
    /configuration\.configured[\s\S]*?loadAiInsightsLocalApiKey/,
  );
  assert.match(
    dashboard,
    /clearLegacyConfiguration\(requestedCompanyScopeId, requestedUserId\)/,
  );
  assert.doesNotMatch(dashboard, /saveAiInsightsLocalApiKey/);
  assert.doesNotMatch(dashboard, /saveAiInsightsLocalPrompt/);
  assert.doesNotMatch(
    dashboard,
    /window\.localStorage|sessionStorage|document\.cookie|URLSearchParams/,
  );
  assert.match(dashboard, /permanece protegida e não pode ser consultada novamente/);
  assert.match(dashboard, /protegida por empresa/);
  assert.match(
    dashboard,
    /nunca é disponibilizada aos administradores ou operadores/,
  );
  assert.match(dashboard, /Contexto estratégico da empresa/);
  assert.match(dashboard, /accept="\.txt,text\/plain"/);
  assert.match(dashboard, /file\.text\(\)/);
  assert.match(
    dashboard,
    /export type AiInsightsDashboardProps = \{[\s\S]*?companyName\?: string \| null;[\s\S]*?companyScopeId\?: string \| null;[\s\S]*?embedded\?: boolean;/,
    "o painel deve aceitar o escopo controlado sem quebrar a rota autônoma",
  );
  assert.match(
    dashboard,
    /controlledCompanyScopeId === undefined[\s\S]*?effectiveCompanyScopeId[\s\S]*?: controlledCompanyScopeId \?\? ""/,
    "a ausência da prop mantém o escopo efetivo, enquanto vazio controlado não reutiliza outra empresa",
  );
  assert.match(
    dashboard,
    /const aiInsightsConfigurationCache = new Map<[\s\S]*?const aiInsightsConfigurationRequests = new Map</,
  );
  assert.match(
    dashboard,
    /const pendingRequest = aiInsightsConfigurationRequests\.get\(cacheKey\);[\s\S]*?if \(pendingRequest\) return pendingRequest;[\s\S]*?if \(!force && cached\) return cached;/,
    "requisições simultâneas e revisitas devem compartilhar a mesma leitura por escopo",
  );
  assert.match(
    dashboard,
    /writeAiInsightsConfigurationCache\(\s*\{ companyScopeId, userId \},\s*parsed\.data,?\s*\);[\s\S]*?setStatus\(parsed\.data\)/,
    "a resposta do PUT deve atualizar o cache e o formulário sem GET adicional",
  );
  assert.match(
    dashboard,
    /setStatus\(null\);[\s\S]*?setForm\(null\);[\s\S]*?setApiKey\(""\);[\s\S]*?setLoadedScopeKey\(""\)/,
    "a troca de empresa deve retirar imediatamente dados e credenciais do escopo anterior",
  );
  assert.match(dashboard, /function RoleAccessCheckbox/);
  assert.match(dashboard, /<Checkbox[\s\S]*?checked=\{checked\}/);
  assert.match(dashboard, /onCheckedChange=\{\(nextChecked\)/);
  assert.match(dashboard, /aria-describedby=\{descriptionId\}/);
  assert.doesNotMatch(dashboard, /role="switch"/);
  assert.match(
    dashboard,
    /embedded[\s\S]*?2xl:grid-cols-\[minmax\(0,1\.2fr\)_minmax\(300px,0\.8fr\)\][\s\S]*?: "xl:grid-cols-/,
    "o painel incorporado só deve dividir colunas quando a área útil comportar o formulário",
  );
  assert.match(
    dashboard,
    /embedded \? "min-h-\[140px\]" : "min-h-\[180px\]"/,
    "campos extensos devem permanecer utilizáveis sem alongar excessivamente o Master",
  );
  assert.equal(contract.AI_INSIGHTS_CONFIGURATION_LIMITS.constraints, 24_000);
  assert.equal(companySettings.AI_INSIGHTS_COMPANY_CONSTRAINTS_MAX_LENGTH, 24_000);
});

test("resultado visual prioriza decisão futura e recolhe premissas técnicas", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/app/ai-insights-result.tsx"),
    "utf8",
  );

  for (const expected of [
    "Direção recomendada",
    "Próximo movimento",
    "Oportunidades de resultado",
    "Plano para capturar o resultado",
    "O que isso abre para o próximo ciclo",
  ]) {
    assert.match(source, new RegExp(expected));
  }
  assert.match(source, /<details[\s\S]*?Base e premissas/);
  assert.doesNotMatch(source, /Conclusão orientada por dados|Evidências quantitativas|Qualidade e limites dos dados/);
});

test("store empresarial é server-only, cifrado, atômico e serializado por lock", () => {
  const source = readFileSync(
    resolve(projectRoot, "lib/ai-insights-company-settings.ts"),
    "utf8",
  );
  const gitignore = readFileSync(resolve(projectRoot, ".gitignore"), "utf8");
  const secret = "opaque-server-credential-1234567890";
  const stored = {
    apiKey: secret,
    companyId: "company-a",
    constraints: "Respeitar a capacidade.",
    enabledForAdmins: true,
    enabledForOperators: false,
    model: "gpt-5.6-terra",
    prompt: "Analise os dados certificados.",
    updatedAt: "2026-08-27T12:00:00.000Z",
    updatedBy: "master-a",
  };
  const publicSettings = companySettings.toPublicAiInsightsCompanySettings(stored);

  assert.equal(Object.hasOwn(publicSettings, "apiKey"), false);
  assert.equal(publicSettings.configured, true);
  assert.doesNotMatch(JSON.stringify(publicSettings), new RegExp(secret));
  assert.equal(
    companySettings.companySettingsAllowUser(stored, {
      is_master: true,
      role: "operator",
    }),
    true,
  );
  assert.equal(
    companySettings.companySettingsAllowUser(stored, {
      is_master: false,
      role: "super-admin",
    }),
    true,
  );
  assert.equal(
    companySettings.companySettingsAllowUser(stored, {
      is_master: false,
      role: "admin",
    }),
    true,
  );
  assert.equal(
    companySettings.companySettingsAllowUser(stored, {
      is_master: false,
      role: "operator",
    }),
    false,
  );
  assert.equal(
    companySettings.companySettingsAllowUser(
      { ...stored, apiKey: null },
      { is_master: true, role: "super-admin" },
    ),
    false,
    "nem o master pode gerar sem credencial empresarial",
  );

  assert.match(source, /^import "server-only";/);
  assert.match(source, /ENCRYPTION_ALGORITHM = "aes-256-gcm"/);
  assert.match(source, /createCipheriv\(ENCRYPTION_ALGORITHM/);
  assert.match(source, /createDecipheriv\(ENCRYPTION_ALGORITHM/);
  assert.match(source, /cipher\.setAAD\(encryptionAdditionalData\(\)\)/);
  assert.match(source, /cipher\.getAuthTag\(\)/);
  assert.match(source, /decipher\.setAuthTag\(authTag\)/);
  assert.match(source, /writeFileAtomically\(dataFile/);
  assert.match(source, /fs\.writeFile\(temporaryFile,[\s\S]*?flag: "wx"/);
  assert.match(source, /fs\.rename\(temporaryFile, destination\)/);
  assert.match(source, /storeWriteQueue/);
  assert.match(source, /acquireStoreLock\(\)/);
  assert.match(source, /fs\.open\(lockFile, "wx", FILE_MODE\)/);
  assert.match(source, /STALE_LOCK_MS/);
  assert.match(source, /companyId === normalizedCompanyId/);

  const ignoresWholeStore = /^\.ipxdata\/$/m.test(gitignore);
  for (const artifact of [
    ".ipxdata/ai-insights-config.v1.json",
    ".ipxdata/ai-insights-config.v1.key",
    ".ipxdata/ai-insights-config.v1.lock",
    ".ipxdata/ai-insights-config.v1.*.tmp",
  ]) {
    assert.ok(
      ignoresWholeStore || gitignore.split(/\r?\n/).includes(artifact),
      `artefato sensível sem ignore: ${artifact}`,
    );
  }
});

test("histórico do IA Advisor usa cofre separado, cifrado e limitado", () => {
  const source = readFileSync(
    resolve(projectRoot, "lib/ai-insights-report-store.ts"),
    "utf8",
  );
  const settingsSource = readFileSync(
    resolve(projectRoot, "lib/ai-insights-company-settings.ts"),
    "utf8",
  );
  const gitignore = readFileSync(resolve(projectRoot, ".gitignore"), "utf8");

  assert.match(source, /^import "server-only";/);
  assert.match(source, /ai-insights-reports\.v1\.json/);
  assert.match(source, /ENCRYPTION_ALGORITHM = "aes-256-gcm"/);
  assert.match(source, /MAX_REPORTS_PER_COMPANY = 6/);
  assert.match(source, /MAX_PLAINTEXT_BYTES/);
  assert.match(source, /MAX_ENCRYPTED_FILE_BYTES/);
  assert.match(source, /Buffer\.byteLength\(serializedEnvelope, "utf8"\)/);
  assert.match(source, /readLatestAiInsightsReport/);
  assert.match(source, /saveLatestAiInsightsReport/);
  assert.match(source, /candidate\.insights\.source\.module === module/);
  assert.match(source, /candidate\.insights\.source\.surface === surface/);
  assert.match(source, /writeFileAtomically\(dataFile/);
  assert.match(source, /acquireStoreLock\(\)/);
  assert.doesNotMatch(
    settingsSource,
    /latestReports|AiInsightsReportSchema|saveLatestAiInsightsReport/,
    "o histórico não pode mudar o formato do cofre de credenciais v1",
  );
  for (const artifact of [
    ".ipxdata/ai-insights-reports.v1.json",
    ".ipxdata/ai-insights-reports.v1.key",
    ".ipxdata/ai-insights-reports.v1.lock",
    ".ipxdata/ai-insights-reports.v1.*.tmp",
  ]) {
    assert.ok(
      gitignore.split(/\r?\n/).includes(artifact),
      `artefato do histórico sem ignore: ${artifact}`,
    );
  }
});

test("cofre do IA Advisor substitui somente o mesmo escopo e isola empresas", async () => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "ipxdata-ai-reports-"));
  const previousDirectory = process.env.IPXDATA_AI_SETTINGS_DIRECTORY;
  process.env.IPXDATA_AI_SETTINGS_DIRECTORY = temporaryDirectory;

  try {
    const reportStore = loadTypeScriptModule("lib/ai-insights-report-store.ts");
    const first = validReport();
    await reportStore.saveLatestAiInsightsReport("company-a", first);

    assert.equal(
      (await reportStore.readLatestAiInsightsReport("company-a", "counting", "live"))?.id,
      first.id,
    );
    assert.equal(
      await reportStore.readLatestAiInsightsReport("company-b", "counting", "live"),
      null,
    );
    assert.equal(
      await reportStore.readLatestAiInsightsReport("company-a", "occupancy", "live"),
      null,
    );

    const replacement = structuredClone(first);
    replacement.id = "analysis-2";
    replacement.meta.generatedAt = "2026-08-26T16:00:00.000Z";
    replacement.insights.summary = "Conclusão mais recente e isolada.";
    await reportStore.saveLatestAiInsightsReport("company-a", replacement);
    const latest = await reportStore.readLatestAiInsightsReport(
      "company-a",
      "counting",
      "live",
    );
    assert.equal(latest?.id, replacement.id);
    assert.equal(latest?.insights.summary, replacement.insights.summary);

    const delayedOlderReport = structuredClone(first);
    delayedOlderReport.id = "analysis-delayed-older";
    delayedOlderReport.meta.generatedAt = "2026-08-26T15:30:00.000Z";
    const preserved = await reportStore.saveLatestAiInsightsReport(
      "company-a",
      delayedOlderReport,
    );
    assert.equal(
      preserved.id,
      replacement.id,
      "uma gravação atrasada não pode substituir o relatório cronologicamente mais novo",
    );
    assert.equal(
      (
        await reportStore.readLatestAiInsightsReport(
          "company-a",
          "counting",
          "live",
        )
      )?.id,
      replacement.id,
    );

    const encryptedFile = readFileSync(
      join(temporaryDirectory, "ai-insights-reports.v1.json"),
      "utf8",
    );
    assert.doesNotMatch(encryptedFile, /Conclusão mais recente|company-a/);
    assert.match(encryptedFile, /"algorithm":"aes-256-gcm"/);
  } finally {
    restoreEnvironment(
      "IPXDATA_AI_SETTINGS_DIRECTORY",
      previousDirectory,
    );
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
});

test("helper de migração lê e remove configuração legada com escopo exato", () => {
  const previousWindow = globalThis.window;
  const storage = memoryStorage();
  globalThis.window = { localStorage: storage };
  const apiKey = "local-credential-12345678901234567890";
  const credentialScope = { companyId: "company.a", userId: "user.a" };
  const countingLiveScope = {
    ...credentialScope,
    module: "counting",
    surface: "live",
  };
  const prompt = {
    objective: "Priorize ações para aumentar o fluxo com evidências.",
    constraints: "Não ampliar a equipe neste ciclo.",
  };

  try {
    const apiStorageKey =
      localSettings.aiInsightsLocalApiKeyStorageKey(credentialScope);
    storage.setItem(apiStorageKey, apiKey);
    assert.equal(
      localSettings.loadAiInsightsLocalApiKey(credentialScope),
      apiKey,
    );
    assert.equal(
      localSettings.loadAiInsightsLocalApiKey({
        companyId: "company.b",
        userId: "user.a",
      }),
      "",
    );
    assert.equal(
      localSettings.loadAiInsightsLocalApiKey({
        companyId: "company.a",
        userId: "user.b",
      }),
      "",
    );
    assert.match(
      localSettings.aiInsightsLocalApiKeyStorageKey(credentialScope),
      /company\.company%2Ea\.user\.user%2Ea$/,
    );

    const promptStorageKey =
      localSettings.aiInsightsLocalPromptStorageKey(countingLiveScope);
    storage.setItem(
      promptStorageKey,
      JSON.stringify({ ...prompt, schemaVersion: 1 }),
    );
    assert.deepEqual(
      localSettings.loadAiInsightsLocalPrompt(countingLiveScope),
      prompt,
    );
    assert.equal(
      localSettings.loadAiInsightsLocalPrompt({
        ...credentialScope,
        module: "counting",
        surface: "analysis",
      }),
      null,
    );
    assert.equal(
      localSettings.loadAiInsightsLocalPrompt({
        ...credentialScope,
        module: "occupancy",
        surface: "live",
      }),
      null,
    );

    assert.equal(
      localSettings.clearAiInsightsLocalPrompt(countingLiveScope),
      true,
    );
    assert.equal(
      localSettings.loadAiInsightsLocalApiKey(credentialScope),
      apiKey,
      "restaurar o prompt não pode apagar a credencial",
    );
    assert.equal(
      localSettings.clearAiInsightsLocalApiKey(credentialScope),
      true,
    );
    assert.equal(storage.getItem(apiStorageKey), null);
    assert.equal(
      localSettings.loadAiInsightsLocalPrompt(countingLiveScope),
      null,
      "a migração concluída deve remover a configuração legada",
    );
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test("migração local rejeita fallback, corrupção e indisponibilidade do navegador", () => {
  const previousWindow = globalThis.window;
  const storage = memoryStorage();
  globalThis.window = { localStorage: storage };
  const credentialScope = { companyId: "company-a", userId: "user-a" };
  const promptScope = {
    ...credentialScope,
    module: "counting",
    surface: "reports",
  };

  try {
    storage.setItem(localSettings.AI_INSIGHTS_LOCAL_API_KEY_STORAGE_KEY, "x".repeat(32));
    storage.setItem(
      `${localSettings.AI_INSIGHTS_LOCAL_API_KEY_STORAGE_KEY}.company.company-a`,
      "y".repeat(32),
    );
    assert.equal(localSettings.loadAiInsightsLocalApiKey(credentialScope), "");
    assert.equal(
      localSettings.loadAiInsightsLocalApiKey({ companyId: "company-a" }),
      "",
    );

    const apiStorageKey =
      localSettings.aiInsightsLocalApiKeyStorageKey(credentialScope);
    storage.setItem(apiStorageKey, "inválida com espaços");
    assert.equal(localSettings.loadAiInsightsLocalApiKey(credentialScope), "");
    assert.equal(storage.getItem(apiStorageKey), null);

    const promptStorageKey =
      localSettings.aiInsightsLocalPromptStorageKey(promptScope);
    storage.setItem(promptStorageKey, "{json quebrado");
    assert.equal(localSettings.loadAiInsightsLocalPrompt(promptScope), null);
    assert.equal(storage.getItem(promptStorageKey), null);

    globalThis.window = {
      localStorage: {
        getItem() {
          throw new DOMException("bloqueado", "SecurityError");
        },
        removeItem() {
          throw new DOMException("bloqueado", "SecurityError");
        },
        setItem() {
          throw new DOMException("cheio", "QuotaExceededError");
        },
      },
    };
    assert.equal(localSettings.loadAiInsightsLocalApiKey(credentialScope), "");
    assert.equal(localSettings.loadAiInsightsLocalPrompt(promptScope), null);
    assert.equal(localSettings.clearAiInsightsLocalApiKey(credentialScope), false);
    assert.equal(localSettings.clearAiInsightsLocalPrompt(promptScope), false);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test("configuração IA fica exclusiva e carrega apenas dentro da seção do Superadmin", () => {
  const appShell = readFileSync(
    resolve(projectRoot, "components/app/app-shell.tsx"),
    "utf8",
  );
  const routeShell = readFileSync(
    resolve(projectRoot, "components/app/authenticated-route-shell.tsx"),
    "utf8",
  );
  const managerLayout = readFileSync(
    resolve(projectRoot, "app/manager/layout.tsx"),
    "utf8",
  );
  const managerPage = readFileSync(
    resolve(projectRoot, "app/manager/insights/page.tsx"),
    "utf8",
  );
  const clientPage = readFileSync(
    resolve(projectRoot, "app/dashboard/insights/page.tsx"),
    "utf8",
  );
  const masterDashboard = readFileSync(
    resolve(projectRoot, "components/app/super-admin-dashboard.tsx"),
    "utf8",
  );
  const routePreload = readFileSync(
    resolve(projectRoot, "lib/app-route-preload.ts"),
    "utf8",
  );
  const clientNavigation = appShell.slice(
    appShell.indexOf("const clientNavItems"),
    appShell.indexOf("const managerNavItems"),
  );

  assert.doesNotMatch(clientNavigation, /insights|Configuração IA/);
  assert.doesNotMatch(appShell, /href: "\/manager\/insights"|BrainCog/);
  assert.doesNotMatch(routePreload, /"\/manager\/insights"/);
  assert.match(managerLayout, /<ManagerRouteShell>\{children\}<\/ManagerRouteShell>/);
  assert.match(
    routeShell,
    /const requireMaster = pathname === "\/manager\/master"/,
  );
  assert.match(routeShell, /<AuthGuard[\s\S]*?requireManager[\s\S]*?requireMaster=\{requireMaster\}/);
  for (const page of [managerPage, clientPage]) {
    assert.match(page, /import \{ redirect \} from "next\/navigation"/);
    assert.match(page, /redirect\("\/manager\/master\?section=insights"\)/);
    assert.doesNotMatch(
      page,
      /"use client"|AiInsightsDashboard|useAuth|useRouter/,
    );
  }

  assert.match(
    masterDashboard,
    /DeferredAiInsightsDashboard as AiInsightsDashboard/,
  );
  assert.match(masterDashboard, /<TabsTrigger value="insights"[\s\S]*?IA Advisor/);
  assert.match(
    masterDashboard,
    /<TabsContent value="insights"[^>]*>[\s\S]*?activeCompanyTab === "insights" \? \([\s\S]*?<AiInsightsDashboard[\s\S]*?companyScopeId=\{selectedCompanyId\}[\s\S]*?companyName=\{selectedCompany\?\.name\}[\s\S]*?embedded/,
    "o painel pesado e seu GET devem existir somente enquanto a seção de IA estiver ativa",
  );
  assert.match(
    masterDashboard,
    /new URLSearchParams\(window\.location\.search\)\.get\("section"\)[\s\S]*?masterSections\.has/,
    "o alias deve conseguir abrir diretamente a seção embutida",
  );
});

function validRequest() {
  return {
    snapshot: {
      version: 1,
      binding: {
        companyScopeId: "company-a",
        userId: "user-a",
        timeZone: "America/Sao_Paulo",
      },
      source: {
        module: "counting",
        surface: "live",
        capturedAt: "2026-08-26T14:00:00.000Z",
        dataCompleteUntil: "2026-08-26T13:59:59.000Z",
      },
      report: {
        title: "Contagem ao vivo",
        subtitle: null,
        period: {
          label: "Hoje",
          from: "2026-08-26",
          to: "2026-08-26",
        },
        context: [{ label: "Cenário", value: "Todos" }],
        metrics: [
          { label: "Hoje até agora", value: 120, description: null },
        ],
        datasets: [
          {
            id: "hourly-flow",
            title: "Fluxo por hora",
            description: null,
            columns: [
              { key: "hour", label: "Hora", role: "dimension", unit: null },
              { key: "total", label: "Total", role: "measure", unit: "pessoas" },
            ],
            rows: [
              ["10h", 50],
              ["11h", 70],
            ],
            statistics: [
              { label: "Média", value: 60, unit: "pessoas" },
            ],
            coverage: {
              originalRows: 2,
              includedRows: 2,
              strategy: "complete",
              notes: [],
            },
          },
        ],
      },
    },
  };
}

function validConfigurationUpdate() {
  return {
    apiKey: "opaque-server-credential-1234567890",
    constraints: "Respeitar capacidade, orçamento e segurança.",
    enabledForAdmins: true,
    enabledForOperators: false,
    model: "gpt-5.6-terra",
    prompt: "Analise os dados certificados e proponha ações mensuráveis.",
  };
}

function validReport() {
  return {
    id: "analysis-1",
    insights: validInsights(),
    meta: {
      generatedAt: "2026-08-26T15:00:00.000Z",
      model: "gpt-5.6-terra",
      usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
    },
  };
}

function validAdminConfiguration() {
  return {
    companyId: "company-a",
    configured: true,
    constraints: "Respeitar capacidade, orçamento e segurança.",
    credentialFingerprint: "123456abcdef",
    enabledForAdmins: true,
    enabledForOperators: false,
    model: "gpt-default",
    prompt: "Analise os dados certificados e proponha ações mensuráveis.",
    updatedAt: "2026-08-27T12:00:00.000Z",
  };
}

function validStatus(overrides = {}) {
  return {
    allowedModels: ["gpt-default", "gpt-secondary"],
    available: true,
    configured: true,
    configuration: null,
    limits: {
      maxBodyBytes: contract.AI_INSIGHTS_LIMITS.bodyBytes,
      maxDatasets: contract.AI_INSIGHTS_LIMITS.datasets,
      maxRowsPerDataset: contract.AI_INSIGHTS_LIMITS.datasetRows,
      requestsPerMinute: 3,
    },
    model: "gpt-default",
    role: "admin",
    ...overrides,
  };
}

function validInsights() {
  return {
    summary: "O fluxo se concentrou no segundo horário observado.",
    period: {
      label: "Hoje",
      from: "2026-08-26",
      to: "2026-08-26",
      timeZone: "America/Sao_Paulo",
    },
    source: {
      module: "counting",
      surface: "live",
      reportTitle: "Contagem ao vivo",
      capturedAt: "2026-08-26T14:00:00.000Z",
      dataCompleteUntil: "2026-08-26T13:59:59.000Z",
    },
    dataQuality: { status: "parcial", notes: ["Janela intradiária."] },
    findings: [
      {
        title: "Crescimento entre horas",
        evidence: "O total passou de 50 para 70.",
        interpretation: "Há concentração mais recente, ainda sem causalidade.",
        confidence: "alta",
        widget: "Fluxo por hora",
      },
    ],
    actions: [
      {
        priority: "alta",
        title: "Testar reforço no pico",
        whyNow: "A maior contagem ocorreu às 11h.",
        steps: ["Ajustar a operação às 11h", "Medir por sete dias"],
        expectedEffect: "Hipótese de melhor atendimento no pico.",
        targetKpi: "Fluxo atendido",
        baseline: "70 pessoas às 11h",
        target: null,
        measurementWindow: "7 dias comparáveis",
        owner: "Operações",
        effort: "baixo",
        confidence: "media",
        risks: ["Variação natural entre dias"],
      },
    ],
    questions: ["Há registro de campanhas no período?"],
    disclaimer: "Resultado hipotético sujeito a validação.",
  };
}

function memoryStorage() {
  const values = new Map();
  return {
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.has(String(key)) ? values.get(String(key)) : null;
    },
    key(index) {
      return Array.from(values.keys())[index] ?? null;
    },
    get length() {
      return values.size;
    },
    removeItem(key) {
      values.delete(String(key));
    },
    setItem(key, value) {
      values.set(String(key), String(value));
    },
  };
}

function loadTypeScriptModule(relativePath) {
  const filename = resolve(projectRoot, relativePath);
  const cached = moduleCache.get(filename);
  if (cached) return cached.exports;

  const source = readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
  const loadedModule = { exports: {} };
  moduleCache.set(filename, loadedModule);
  const nodeRequire = createRequire(filename);
  const localRequire = (specifier) => {
    if (specifier === "server-only") return {};
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

function restoreEnvironment(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
