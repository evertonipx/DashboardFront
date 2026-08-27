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
const bodyReader = loadTypeScriptModule("lib/ai-insights-body.ts");
const companySettings = loadTypeScriptModule(
  "lib/ai-insights-company-settings.ts",
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
  assert.equal(contract.AiInsightsResponseSchema.safeParse(insights).success, true);
  assert.equal(
    contract.AiInsightsApiResponseSchema.safeParse({
      insights,
      meta: {
        generatedAt: "2026-08-26T15:00:00.000Z",
        model: "gpt-5.6-terra",
        usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
      },
    }).success,
    true,
  );

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
  assert.match(source, /client\.responses\.parse\(/);
  assert.match(source, /zodTextFormat\([\s\S]*?AiInsightsResponseSchema/);
  assert.match(source, /store: false/);
  assert.match(source, /DEFAULT_OPENAI_MODEL = "gpt-5\.6-terra"/);
  assert.match(source, /safety_identifier: hashSafetyIdentifier/);
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
  assert.doesNotMatch(source, /NEXT_PUBLIC_OPENAI/);
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

test("ação consulta disponibilidade, envia só snapshot e abre resultado em diálogo", () => {
  const action = readFileSync(
    resolve(projectRoot, "components/app/ai-analysis-action.tsx"),
    "utf8",
  );
  const layout = readFileSync(resolve(projectRoot, "app/layout.tsx"), "utf8");

  assert.match(
    action,
    /apiFetch<unknown>\("\/ai\/insights", \{\s*companyScopeId,\s*\}\)/,
    "o ícone deve consultar o status no escopo selecionado",
  );
  assert.match(action, /AiInsightsStatusResponseSchema\.safeParse\(statusPayload\)/);
  assert.match(action, /setAvailable\(parsed\.success && parsed\.data\.available\)/);
  assert.match(action, /if \(!available\) return null/);
  assert.match(action, /createAiAnalysisSnapshot/);
  assert.match(action, /body: \{ snapshot \}/);
  assert.match(action, /<Dialog open=\{dialogOpen\}/);
  assert.match(action, /<AiInsightsResult[\s\S]*?result=\{result\}/);
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
  assert.doesNotMatch(layout, /AiAnalysisProvider|ai-analysis-provider/);

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
  assert.match(
    readFileSync(
      resolve(projectRoot, "components/app/realtime-dashboard.tsx"),
      "utf8",
    ),
    /<AiAnalysisAction[\s\S]*?getPayload=\{buildConfiguredLiveReportPayload\}/,
  );
  assert.match(
    readFileSync(
      resolve(projectRoot, "components/app/scenario-reports-dashboard.tsx"),
      "utf8",
    ),
    /<AiAnalysisAction[\s\S]*?getPayload=\{buildConfiguredScenarioReportPayload\}/,
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
  assert.match(dashboard, /findLegacyPrompt\(companyScopeId, userId\)/);
  assert.match(
    dashboard,
    /configuration\.configured[\s\S]*?loadAiInsightsLocalApiKey/,
  );
  assert.match(dashboard, /clearLegacyConfiguration\(companyScopeId, userId\)/);
  assert.doesNotMatch(dashboard, /saveAiInsightsLocalApiKey/);
  assert.doesNotMatch(dashboard, /saveAiInsightsLocalPrompt/);
  assert.doesNotMatch(
    dashboard,
    /window\.localStorage|sessionStorage|document\.cookie|URLSearchParams/,
  );
  assert.match(dashboard, /write-only/);
  assert.match(dashboard, /servidor do frontend/);
  assert.match(dashboard, /cifrada em repouso/);
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

test("menu e páginas mantêm configuração IA exclusiva do superadmin", () => {
  const appShell = readFileSync(
    resolve(projectRoot, "components/app/app-shell.tsx"),
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
  const clientNavigation = appShell.slice(
    appShell.indexOf("const clientNavItems"),
    appShell.indexOf("const managerNavItems"),
  );

  assert.doesNotMatch(clientNavigation, /insights|Configuração IA/);
  assert.match(
    appShell,
    /href: "\/manager\/insights",[\s\S]*?label: "Configuração IA",[\s\S]*?canShow: hasMasterAccess/,
  );
  assert.match(managerPage, /<AuthGuard requireManager requireMaster>/);
  assert.match(managerPage, /<AiInsightsDashboard \/>/);
  assert.match(clientPage, /hasMasterAccess\(user\)[\s\S]*?"\/manager\/insights"/);
  assert.match(clientPage, /isManager[\s\S]*?"\/manager\/live"[\s\S]*?"\/dashboard\/live"/);
  assert.doesNotMatch(clientPage, /AiInsightsDashboard/);
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
