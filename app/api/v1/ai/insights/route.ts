import { createHash, randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { reconcileCurrentUserWithAccessToken } from "@/lib/access-token-claims";
import {
  AI_INSIGHTS_LIMITS,
  AiInsightModuleSchema,
  AiInsightSurfaceSchema,
  AiInsightsApiResponseSchema,
  AiInsightsConfigurationUpdateSchema,
  AiInsightsReportSchema,
  AiInsightsRequestSchema,
  AiInsightsScopedStatusResponseSchema,
  AiInsightsStatusResponseSchema,
  DEFAULT_AI_INSIGHTS_PROMPT,
  type AiInsightsRequest,
  type AiInsightsReport,
  type AiInsightsStatusResponse,
} from "@/lib/ai-insights-contract";
import {
  AI_INSIGHTS_REQUESTS_PER_MINUTE,
  aiInsightsRateLimiter,
} from "@/lib/ai-insights-rate-limit";
import {
  AiInsightsBodyError,
  readLimitedUtf8Body,
} from "@/lib/ai-insights-body";
import { resolveBackendBaseUrl } from "@/lib/backend-routing";
import { canonicalCompanyTimeZone } from "@/lib/company-time-zone";
import { resolveCurrentUserCompanyTimeZone } from "@/lib/company-time-zone-record";
import {
  AiInsightsServiceError,
  generateOpenAIInsights,
  getAiInsightsConfiguration,
} from "@/lib/openai-insights";
import {
  AiInsightsCompanySettingsStorageError,
  companySettingsAllowUser,
  readAiInsightsCompanySettings,
  saveAiInsightsCompanySettings,
  toPublicAiInsightsCompanySettings,
  type AiInsightsCompanySettings,
} from "@/lib/ai-insights-company-settings";
import {
  AiInsightsReportStorageError,
  readLatestAiInsightsReport,
  saveLatestAiInsightsReport,
} from "@/lib/ai-insights-report-store";
import { canViewCounting, canViewOccupancy } from "@/lib/permissions";
import type {
  CurrentUser,
  CurrentUserCompanyModule,
  UserPermission,
} from "@/lib/types";
import { isMasterUser, normalizeRole } from "@/lib/user-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BACKEND_TIMEOUT_MS = 15_000;
const AI_INSIGHTS_CONFIGURATION_BODY_BYTES = 16 * 1024;

type AuthenticatedRouteContext = {
  authorization: string;
  backendBaseUrl: string;
  companyId: string;
  isMaster: boolean;
  user: CurrentUser;
};

class RouteFailure extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number) {
    super(code);
    this.name = "RouteFailure";
    this.code = code;
    this.status = status;
  }
}

export async function GET(request: NextRequest) {
  const requestId = randomUUID();
  try {
    const authentication = await resolveAuthenticatedContext(request);
    const settings = await readAiInsightsCompanySettings(
      authentication.companyId,
    );
    const scope = readOptionalReportScope(request);
    const status = buildStatusResponse(authentication, settings);
    if (!scope) return jsonResponse(status, 200, requestId);

    let latestReport: AiInsightsReport | null = null;
    if (status.available) {
      await assertModuleAccess(authentication, scope.module, request.signal);
      latestReport = await readLatestAiInsightsReport(
        authentication.companyId,
        scope.module,
        scope.surface,
      );
    }
    const payload = AiInsightsScopedStatusResponseSchema.parse({
      latestReport,
      status,
    });
    return jsonResponse(payload, 200, requestId);
  } catch (error) {
    return routeErrorResponse(error, requestId);
  }
}

export async function PUT(request: NextRequest) {
  const requestId = randomUUID();
  try {
    const authentication = await resolveAuthenticatedContext(request);
    if (!authentication.isMaster) {
      throw new RouteFailure("ai_configuration_forbidden", 403);
    }
    const update = await readConfigurationPayload(request);
    const runtime = getAiInsightsConfiguration();
    if (!runtime.allowedModels.includes(update.model)) {
      throw new RouteFailure("model_not_allowed", 400);
    }

    await saveAiInsightsCompanySettings(
      authentication.companyId,
      update,
      authentication.user.id,
    );
    const settings = await readAiInsightsCompanySettings(
      authentication.companyId,
    );
    return jsonResponse(
      buildStatusResponse(authentication, settings),
      200,
      requestId,
    );
  } catch (error) {
    return routeErrorResponse(error, requestId);
  }
}

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  const startedAt = Date.now();
  let releaseCapacity: (() => void) | null = null;

  try {
    const authentication = await resolveAuthenticatedContext(request);
    const settings = await readAiInsightsCompanySettings(
      authentication.companyId,
    );
    if (!settings.apiKey || !settings.model || !settings.prompt.trim()) {
      throw new RouteFailure("ai_not_configured", 422);
    }
    if (!companySettingsAllowUser(settings, authentication.user)) {
      throw new RouteFailure("ai_access_disabled", 403);
    }
    const runtime = getAiInsightsConfiguration();
    if (!runtime.allowedModels.includes(settings.model)) {
      throw new RouteFailure("model_not_allowed", 400);
    }
    const analysisPayload = await readRequestPayload(request);
    const boundPayload = bindRequestToAuthentication(
      analysisPayload,
      authentication,
    );
    await assertModuleAccess(
      authentication,
      boundPayload.snapshot.source.module,
      request.signal,
    );

    const capacity = aiInsightsRateLimiter.acquire(
      rateLimitKey(authentication.user.id),
    );
    if (!capacity.allowed) {
      return errorResponse(
        "O limite de análises foi atingido. Aguarde antes de tentar novamente.",
        429,
        "rate_limited",
        requestId,
        capacity.retryAfterSeconds,
      );
    }
    releaseCapacity = capacity.release;

    const result = await generateOpenAIInsights({
      apiKey: settings.apiKey,
      constraints: settings.constraints.trim() || null,
      model: settings.model,
      objective: settings.prompt,
      requestId,
      safetyUserId: authentication.user.id,
      signal: request.signal,
      snapshot: boundPayload.snapshot,
    });
    const response = AiInsightsApiResponseSchema.parse(result);
    const report = AiInsightsReportSchema.parse({
      id: randomUUID(),
      ...response,
    });
    await saveLatestAiInsightsReport(authentication.companyId, report);
    // Preserve the original POST contract so an older client remains compatible
    // during rolling deployments. The report id is retrieved through scoped GET.
    return jsonResponse(response, 200, requestId);
  } catch (error) {
    const response = routeErrorResponse(error, requestId);
    if (response.status >= 500) {
      const diagnostic =
        error instanceof AiInsightsServiceError
          ? {
              incompleteReason: error.incompleteReason,
              upstreamCode: error.upstreamCode,
              upstreamRequestId: error.upstreamRequestId,
              upstreamStatus: error.upstreamStatus,
              usage: error.usage,
            }
          : null;
      console.error(
        "[ai-insights] request failed",
        JSON.stringify({
          code: errorCode(error),
          diagnostic,
          durationMs: Date.now() - startedAt,
          requestId,
          status: response.status,
        }),
      );
    }
    return response;
  } finally {
    releaseCapacity?.();
  }
}

function buildStatusResponse(
  authentication: AuthenticatedRouteContext,
  settings: AiInsightsCompanySettings,
): AiInsightsStatusResponse {
  const runtime = getAiInsightsConfiguration();
  const configured = Boolean(settings.apiKey);
  const modelAllowed = Boolean(
    settings.model && runtime.allowedModels.includes(settings.model),
  );
  const completeConfiguration = Boolean(
    configured && settings.prompt.trim() && modelAllowed,
  );
  const publicSettings = toPublicAiInsightsCompanySettings(settings);
  const normalizedRole = normalizeRole(authentication.user.role);
  const role = authentication.isMaster
    ? "master"
    : normalizedRole === "admin" || normalizedRole === "operator"
      ? normalizedRole
      : "unknown";

  return AiInsightsStatusResponseSchema.parse({
    allowedModels: runtime.allowedModels,
    available:
      completeConfiguration &&
      companySettingsAllowUser(settings, authentication.user),
    configured,
    configuration: authentication.isMaster
      ? {
          companyId: publicSettings.companyId,
          configured: publicSettings.configured,
          constraints: publicSettings.constraints,
          credentialFingerprint: settings.apiKey
            ? credentialFingerprint(settings.apiKey)
            : null,
          enabledForAdmins: publicSettings.enabledForAdmins,
          enabledForOperators: publicSettings.enabledForOperators,
          model:
            settings.model && runtime.allowedModels.includes(settings.model)
              ? settings.model
              : runtime.model,
          prompt: publicSettings.prompt.trim()
            ? publicSettings.prompt
            : DEFAULT_AI_INSIGHTS_PROMPT,
          updatedAt: publicSettings.updatedAt,
        }
      : null,
    limits: {
      maxBodyBytes: AI_INSIGHTS_LIMITS.bodyBytes,
      maxDatasets: AI_INSIGHTS_LIMITS.datasets,
      maxRowsPerDataset: AI_INSIGHTS_LIMITS.datasetRows,
      requestsPerMinute: AI_INSIGHTS_REQUESTS_PER_MINUTE,
    },
    model:
      settings.model && runtime.allowedModels.includes(settings.model)
        ? settings.model
        : runtime.model,
    role,
  });
}

function readOptionalReportScope(request: NextRequest) {
  const rawModule = request.nextUrl.searchParams.get("module");
  const rawSurface = request.nextUrl.searchParams.get("surface");
  if (rawModule === null && rawSurface === null) return null;
  const parsedModule = AiInsightModuleSchema.safeParse(rawModule);
  const surface = AiInsightSurfaceSchema.safeParse(rawSurface);
  if (!parsedModule.success || !surface.success) {
    throw new RouteFailure("invalid_report_scope", 400);
  }
  return { module: parsedModule.data, surface: surface.data };
}

function credentialFingerprint(apiKey: string) {
  return createHash("sha256").update(apiKey).digest("hex").slice(0, 12);
}

async function resolveAuthenticatedContext(
  request: NextRequest,
): Promise<AuthenticatedRouteContext> {
  const authorization = requireBearerAuthorization(request);
  let backendBaseUrl: string;
  try {
    backendBaseUrl = resolveBackendBaseUrl(request);
  } catch {
    throw new RouteFailure("backend_configuration", 500);
  }

  const userResult = await backendFetchJson(
    backendBaseUrl,
    "/api/v1/auth/me",
    authorization,
    request.signal,
  );
  if (!userResult.ok) {
    if (userResult.status === 401 || userResult.status === 403) {
      throw new RouteFailure("invalid_session", 401);
    }
    throw new RouteFailure("authentication_unavailable", 503);
  }

  const rawUser = requireCurrentUser(userResult.payload);
  const accessToken = authorization.replace(/^Bearer\s+/i, "").trim();
  const user = rawUser
    ? reconcileCurrentUserWithAccessToken(rawUser, accessToken)
    : null;
  if (!user) throw new RouteFailure("invalid_session_payload", 502);

  const isMaster = isMasterUser(user);
  const requestedCompanyId = request.headers.get("x-company-id")?.trim() ?? "";
  const authenticatedCompanyId =
    user.company_id?.trim() || user.company?.id?.trim() || "";
  if (isMaster && !requestedCompanyId) {
    throw new RouteFailure("master_company_required", 400);
  }
  if (
    !isMaster &&
    requestedCompanyId &&
    !sameIdentifier(requestedCompanyId, authenticatedCompanyId)
  ) {
    throw new RouteFailure("company_scope_mismatch", 403);
  }

  const companyId = isMaster ? requestedCompanyId : authenticatedCompanyId;
  if (!companyId) throw new RouteFailure("company_scope_missing", 400);

  return {
    authorization,
    backendBaseUrl,
    companyId,
    isMaster,
    user,
  };
}

function requireBearerAuthorization(request: NextRequest) {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) {
    throw new RouteFailure("authentication_required", 401);
  }
  return authorization;
}

async function readRequestPayload(request: NextRequest) {
  const rawPayload = await readJsonPayload(
    request,
    AI_INSIGHTS_LIMITS.bodyBytes,
  );
  const parsed = AiInsightsRequestSchema.safeParse(rawPayload);
  if (!parsed.success) throw new RouteFailure("invalid_payload", 400);
  return parsed.data;
}

async function readConfigurationPayload(request: NextRequest) {
  const rawPayload = await readJsonPayload(
    request,
    AI_INSIGHTS_CONFIGURATION_BODY_BYTES,
  );
  const parsed = AiInsightsConfigurationUpdateSchema.safeParse(rawPayload);
  if (!parsed.success) {
    if (parsed.error.issues.some((issue) => issue.path[0] === "apiKey")) {
      throw new RouteFailure("invalid_api_key", 422);
    }
    if (parsed.error.issues.some((issue) => issue.path[0] === "model")) {
      throw new RouteFailure("model_not_allowed", 400);
    }
    throw new RouteFailure("invalid_configuration", 400);
  }
  return parsed.data;
}

async function readJsonPayload(request: NextRequest, maxBytes: number) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  const mediaType = contentType.split(";", 1)[0]?.trim() ?? "";
  if (mediaType !== "application/json" && !mediaType.endsWith("+json")) {
    throw new RouteFailure("unsupported_media_type", 415);
  }

  const declaredLength = request.headers.get("content-length")?.trim();
  if (declaredLength) {
    const length = Number(declaredLength);
    if (!Number.isSafeInteger(length) || length < 0) {
      throw new RouteFailure("invalid_content_length", 400);
    }
    if (length > maxBytes) {
      throw new RouteFailure("payload_too_large", 413);
    }
  }

  let text: string;
  try {
    text = await readLimitedUtf8Body(request, maxBytes);
  } catch (error) {
    if (!(error instanceof AiInsightsBodyError)) throw error;
    throw new RouteFailure(error.code, bodyErrorStatus(error.code));
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new RouteFailure("invalid_json", 400);
  }
}

function bodyErrorStatus(code: AiInsightsBodyError["code"]) {
  if (code === "payload_too_large") return 413;
  if (code === "request_aborted") return 499;
  return 400;
}

function bindRequestToAuthentication(
  payload: AiInsightsRequest,
  authentication: AuthenticatedRouteContext,
): AiInsightsRequest {
  const { binding } = payload.snapshot;
  if (!sameIdentifier(binding.userId, authentication.user.id)) {
    throw new RouteFailure("user_binding_mismatch", 403);
  }
  if (!sameIdentifier(binding.companyScopeId, authentication.companyId)) {
    throw new RouteFailure("company_binding_mismatch", 403);
  }

  const canonicalTimeZone = canonicalCompanyTimeZone(binding.timeZone);
  if (!canonicalTimeZone) throw new RouteFailure("invalid_time_zone", 400);

  if (!authentication.isMaster) {
    const authenticatedTimeZone = resolveCurrentUserCompanyTimeZone(
      authentication.user,
    ).timeZone;
    if (authenticatedTimeZone && authenticatedTimeZone !== canonicalTimeZone) {
      throw new RouteFailure("time_zone_binding_mismatch", 403);
    }
  }

  return {
    ...payload,
    snapshot: {
      ...payload.snapshot,
      binding: {
        ...binding,
        companyScopeId: authentication.companyId,
        userId: authentication.user.id,
        timeZone: canonicalTimeZone,
      },
    },
  };
}

async function hydrateOperationalAccess(
  authentication: AuthenticatedRouteContext,
  signal: AbortSignal,
) {
  if (authentication.isMaster) return authentication.user;

  let permissions = requireUserPermissions(
    authentication.user.permissions,
    authentication.companyId,
  );
  if (authentication.user.permissions === undefined) {
    const permissionResult = await backendFetchJson(
      authentication.backendBaseUrl,
      `/api/v1/users/${encodeURIComponent(authentication.user.id)}/permissions`,
      authentication.authorization,
      signal,
    );
    if (!permissionResult.ok) {
      throw new RouteFailure("permissions_unavailable", 503);
    }
    permissions = requireUserPermissions(
      permissionResult.payload,
      authentication.companyId,
    );
  }
  if (!permissions) throw new RouteFailure("invalid_permissions", 502);

  const moduleResult = await backendFetchJson(
    authentication.backendBaseUrl,
    "/api/v1/company/modules",
    authentication.authorization,
    signal,
  );
  if (!moduleResult.ok) {
    throw new RouteFailure("company_modules_unavailable", 503);
  }
  const companyModules = requireCompanyModules(
    moduleResult.payload,
    authentication.companyId,
  );
  if (!companyModules) throw new RouteFailure("invalid_company_modules", 502);

  return {
    ...authentication.user,
    company_id: authentication.companyId,
    permissions,
    company_modules: companyModules,
  };
}

async function assertModuleAccess(
  authentication: AuthenticatedRouteContext,
  module: "counting" | "occupancy",
  signal: AbortSignal,
) {
  const authorizedUser = await hydrateOperationalAccess(
    authentication,
    signal,
  );
  const allowed =
    module === "counting"
      ? canViewCounting(authorizedUser)
      : canViewOccupancy(authorizedUser);
  if (!allowed) throw new RouteFailure("module_access_denied", 403);
}

async function backendFetchJson(
  backendBaseUrl: string,
  pathname: string,
  authorization: string,
  sourceSignal: AbortSignal,
) {
  const controller = new AbortController();
  const forwardAbort = () => controller.abort(sourceSignal.reason);
  if (sourceSignal.aborted) forwardAbort();
  else sourceSignal.addEventListener("abort", forwardAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(), BACKEND_TIMEOUT_MS);

  try {
    let response: Response | null = null;
    try {
      response = await fetch(`${backendBaseUrl}${pathname}`, {
        cache: "no-store",
        headers: { Authorization: authorization },
        signal: controller.signal,
      });
    } catch {
      if (sourceSignal.aborted) {
        throw new RouteFailure("request_aborted", 499);
      }
    }
    if (!response) return { ok: false as const, status: 0 };
    if (!response.ok) return { ok: false as const, status: response.status };
    const payload = await response.json().catch(() => null);
    if (payload === null) return { ok: false as const, status: 502 };
    return { ok: true as const, payload };
  } finally {
    clearTimeout(timeout);
    sourceSignal.removeEventListener("abort", forwardAbort);
  }
}

function requireCurrentUser(payload: unknown): CurrentUser | null {
  if (!isRecord(payload)) return null;
  const id = cleanString(payload.id);
  if (!id) return null;
  return payload as CurrentUser;
}

function requireUserPermissions(
  payload: unknown,
  companyId: string,
): UserPermission[] | null {
  if (!Array.isArray(payload)) return null;
  const permissions: UserPermission[] = [];
  for (const value of payload) {
    if (!isRecord(value) || !cleanString(value.slug)) return null;
    const permissionCompanyId = cleanString(value.company_id);
    if (
      permissionCompanyId &&
      !sameIdentifier(permissionCompanyId, companyId)
    ) {
      continue;
    }
    permissions.push({
      ...(value as UserPermission),
      ...(permissionCompanyId ? { company_id: companyId } : {}),
    });
  }
  return permissions;
}

function requireCompanyModules(
  payload: unknown,
  companyId: string,
): CurrentUserCompanyModule[] | null {
  if (!Array.isArray(payload)) return null;
  const modules: CurrentUserCompanyModule[] = [];
  for (const value of payload) {
    if (!isRecord(value) || typeof value.enabled !== "boolean") return null;
    const moduleRecord = isRecord(value.module) ? value.module : null;
    const moduleId = cleanString(value.module_id) || cleanString(moduleRecord?.id);
    if (!moduleId) return null;
    const assignmentCompanyId = cleanString(value.company_id);
    if (assignmentCompanyId && !sameIdentifier(assignmentCompanyId, companyId)) {
      continue;
    }
    modules.push({
      ...(value as CurrentUserCompanyModule),
      company_id: companyId,
    });
  }
  return modules;
}

function routeErrorResponse(error: unknown, requestId: string) {
  if (error instanceof RouteFailure) {
    return errorResponse(
      publicRouteErrorMessage(error.code),
      error.status,
      error.code,
      requestId,
    );
  }
  if (error instanceof AiInsightsServiceError) {
    const mapping = serviceErrorMapping(error);
    return errorResponse(
      mapping.message,
      mapping.status,
      error.code,
      requestId,
      error.retryAfterSeconds,
    );
  }
  if (error instanceof AiInsightsCompanySettingsStorageError) {
    return errorResponse(
      "A configuração segura dos Insights IA está indisponível neste momento.",
      503,
      error.code,
      requestId,
    );
  }
  if (error instanceof AiInsightsReportStorageError) {
    return errorResponse(
      "O histórico seguro do IA Advisor está indisponível neste momento.",
      503,
      error.code,
      requestId,
    );
  }
  return errorResponse(
    "Não foi possível gerar a análise neste momento.",
    500,
    "internal_error",
    requestId,
  );
}

function serviceErrorMapping(error: AiInsightsServiceError) {
  switch (error.code) {
    case "aborted":
      return { message: "A solicitação foi cancelada.", status: 499 };
    case "configuration":
      return {
        message: "A análise por IA não está configurada neste ambiente.",
        status: 503,
      };
    case "connection":
      return {
        message: "Não foi possível conectar ao serviço de IA. Tente novamente.",
        status: 502,
      };
    case "content_filtered":
      return {
        message: "A análise foi interrompida pelo filtro de conteúdo da IA.",
        status: 422,
      };
    case "context_too_large":
      return {
        message: "Os dados desta visão excedem a janela aceita pelo modelo configurado.",
        status: 422,
      };
    case "invalid_api_key":
      return {
        message: "A chave da OpenAI é inválida ou não está autorizada.",
        status: 422,
      };
    case "model_not_allowed":
      return {
        message: "O modelo solicitado não está permitido neste ambiente.",
        status: 400,
      };
    case "model_incompatible":
      return {
        message: "O modelo configurado não aceita o formato seguro exigido pela análise.",
        status: 422,
      };
    case "model_unavailable":
      return {
        message: "O modelo configurado não está disponível para esta chave ou projeto.",
        status: 422,
      };
    case "output_limit":
      return {
        message: "A IA atingiu o limite de geração antes de concluir a análise.",
        status: 502,
      };
    case "quota_exceeded":
      return {
        message: "A cota ou o faturamento da OpenAI não permite gerar esta análise.",
        status: 422,
      };
    case "rate_limited":
      return {
        message: "O limite temporário do serviço de IA foi atingido.",
        status: 429,
      };
    case "timeout":
      return {
        message: "A análise excedeu o tempo limite. Tente novamente.",
        status: 504,
      };
    case "refused":
      return {
        message: "A análise não pôde ser produzida para este conteúdo.",
        status: 422,
      };
    case "incomplete":
    case "invalid_response":
    case "upstream":
      return {
        message: "O serviço de IA não retornou uma análise válida.",
        status: 502,
      };
  }
}

function publicRouteErrorMessage(code: string) {
  const messages: Record<string, string> = {
    ai_not_configured: "A análise por IA não está configurada neste ambiente.",
    ai_access_disabled: "Os Insights IA não estão habilitados para o seu perfil nesta empresa.",
    ai_configuration_forbidden: "Somente o superadmin pode configurar os Insights IA.",
    authentication_required: "Não autenticado.",
    invalid_session: "Sessão inválida.",
    invalid_session_payload: "Não foi possível validar a sessão neste momento.",
    master_company_required: "Selecione uma empresa antes de usar a análise.",
    company_scope_missing: "Empresa autenticada não definida.",
    company_scope_mismatch: "A empresa solicitada diverge do contexto autenticado.",
    company_binding_mismatch: "A captura pertence a outra empresa.",
    user_binding_mismatch: "A captura pertence a outra sessão de usuário.",
    time_zone_binding_mismatch: "O fuso da captura diverge da empresa autenticada.",
    invalid_time_zone: "A configuração de horário desta análise é inválida.",
    invalid_api_key: "A chave da OpenAI é inválida ou não está autorizada.",
    model_not_allowed: "O modelo solicitado não está permitido neste ambiente.",
    module_access_denied: "Sem acesso ao módulo solicitado.",
    payload_too_large: "A seleção contém dados demais para uma única análise. Reduza o período.",
    unsupported_media_type: "Não foi possível ler os dados selecionados.",
    invalid_content_length: "O tamanho informado para a captura é inválido.",
    empty_body: "A captura está vazia.",
    invalid_json: "Não foi possível ler os dados selecionados.",
    invalid_payload: "Os dados selecionados não puderam ser analisados.",
    invalid_report_scope: "O módulo ou a tela solicitada para a análise é inválido.",
    invalid_configuration: "A configuração dos Insights IA é inválida.",
    invalid_body: "Não foi possível ler a captura.",
    request_aborted: "A solicitação foi cancelada.",
    permissions_unavailable: "Não foi possível confirmar o acesso neste momento.",
    company_modules_unavailable: "Os produtos desta empresa estão temporariamente indisponíveis.",
    invalid_permissions: "Não foi possível confirmar o acesso neste momento.",
    invalid_company_modules: "Os produtos desta empresa estão temporariamente indisponíveis.",
    authentication_unavailable: "Não foi possível validar a sessão neste momento.",
    backend_configuration: "O serviço de dados está temporariamente indisponível.",
  };
  return messages[code] ?? "Não foi possível processar a análise.";
}

function jsonResponse(payload: unknown, status: number, requestId: string) {
  return NextResponse.json(payload, {
    headers: responseHeaders(requestId),
    status,
  });
}

function errorResponse(
  message: string,
  status: number,
  code: string,
  requestId: string,
  retryAfterSeconds: number | null = null,
) {
  const headers = responseHeaders(requestId);
  if (retryAfterSeconds !== null) {
    headers.set("Retry-After", String(Math.max(1, retryAfterSeconds)));
  }
  return NextResponse.json(
    { error: message, code, requestId },
    { headers, status },
  );
}

function responseHeaders(requestId: string) {
  return new Headers({
    "Cache-Control": "no-store, max-age=0",
    Pragma: "no-cache",
    Vary: "Authorization, X-Company-ID",
    "X-Request-ID": requestId,
  });
}

function rateLimitKey(userId: string) {
  return createHash("sha256")
    .update(userId)
    .digest("hex");
}

function errorCode(error: unknown) {
  if (
    error instanceof RouteFailure ||
    error instanceof AiInsightsServiceError ||
    error instanceof AiInsightsCompanySettingsStorageError ||
    error instanceof AiInsightsReportStorageError
  ) {
    return error.code;
  }
  return "internal_error";
}

function sameIdentifier(left: string, right: string) {
  const normalizedLeft = left.trim();
  const normalizedRight = right.trim();
  if (normalizedLeft === normalizedRight) return true;
  return (
    isUuid(normalizedLeft) &&
    isUuid(normalizedRight) &&
    normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
  );
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
