"use client";

import {
  AI_INSIGHTS_CONFIGURATION_LIMITS,
} from "@/lib/ai-insights-limits";
import type {
  AiInsightModule,
  AiInsightSurface,
  AiInsightsStatusResponse,
} from "@/lib/ai-insights-contract";

export type AiInsightsAvailabilitySnapshot = {
  latestReport: unknown | null;
  scopeKey: string;
  status: AiInsightsStatusResponse;
};

type AiInsightsAvailabilityRequest = {
  abortTimer: ReturnType<typeof setTimeout> | null;
  controller: AbortController;
  promise: Promise<AiInsightsAvailabilitySnapshot>;
  subscribers: number;
};

type AiInsightsAvailabilityCacheEntry = {
  failedAt: number;
  failure: unknown;
  request: AiInsightsAvailabilityRequest | null;
  resolvedAt: number;
  value: AiInsightsAvailabilitySnapshot | null;
};

export type AiInsightsAvailabilitySubscription = {
  promise: Promise<AiInsightsAvailabilitySnapshot>;
  release: () => void;
};

export class AiInsightsAvailabilityPayloadError extends Error {
  constructor() {
    super("A disponibilidade do IA Advisor retornou um formato inválido.");
    this.name = "AiInsightsAvailabilityPayloadError";
  }
}

export const AI_INSIGHTS_AVAILABILITY_CACHE_TTL_MS = 30_000;
export const AI_INSIGHTS_AVAILABILITY_ERROR_TTL_MS = 5_000;
const AI_INSIGHTS_AVAILABILITY_ABORT_GRACE_MS = 0;

const aiInsightsAvailabilityCache = new Map<
  string,
  AiInsightsAvailabilityCacheEntry
>();

export function createAiInsightsAvailabilityScopeKey({
  companyScopeId,
  module,
  surface,
  userId,
}: {
  companyScopeId: string;
  module: AiInsightModule;
  surface: AiInsightSurface;
  userId: string;
}) {
  return JSON.stringify([userId, companyScopeId, module, surface]);
}

export function subscribeAiInsightsAvailability({
  companyScopeId,
  module,
  scopeKey,
  surface,
}: {
  companyScopeId: string;
  module: AiInsightModule;
  scopeKey: string;
  surface: AiInsightSurface;
}): AiInsightsAvailabilitySubscription {
  const now = Date.now();
  let entry = aiInsightsAvailabilityCache.get(scopeKey);
  if (!entry) {
    entry = {
      failedAt: 0,
      failure: null,
      request: null,
      resolvedAt: 0,
      value: null,
    };
    aiInsightsAvailabilityCache.set(scopeKey, entry);
  }

  if (
    entry.value &&
    now - entry.resolvedAt < AI_INSIGHTS_AVAILABILITY_CACHE_TTL_MS
  ) {
    return {
      promise: Promise.resolve(entry.value),
      release: () => undefined,
    };
  }

  if (
    entry.failedAt > 0 &&
    now - entry.failedAt < AI_INSIGHTS_AVAILABILITY_ERROR_TTL_MS
  ) {
    return {
      promise: Promise.reject(entry.failure),
      release: () => undefined,
    };
  }

  let request = entry.request;
  if (!request) {
    const controller = new AbortController();
    const sharedRequest = {
      abortTimer: null,
      controller,
      subscribers: 0,
    } as AiInsightsAvailabilityRequest;
    const promise = requestAiInsightsAvailability({
      companyScopeId,
      module,
      scopeKey,
      signal: controller.signal,
      surface,
    })
      .then((snapshot) => {
        const nextValue = {
          ...snapshot,
          latestReport: newestReport(
            entry?.value?.latestReport ?? null,
            snapshot.latestReport,
          ),
        };
        if (entry?.request === sharedRequest) {
          entry.value = nextValue;
          entry.resolvedAt = Date.now();
          entry.failure = null;
          entry.failedAt = 0;
        }
        return nextValue;
      })
      .catch((error: unknown) => {
        if (entry?.request === sharedRequest && !controller.signal.aborted) {
          entry.failure = error;
          entry.failedAt = Date.now();
        }
        throw error;
      })
      .finally(() => {
        if (entry?.request !== sharedRequest) return;
        if (sharedRequest.abortTimer) clearTimeout(sharedRequest.abortTimer);
        entry.request = null;
        if (!entry.value && entry.failedAt === 0) {
          aiInsightsAvailabilityCache.delete(scopeKey);
        }
      });
    sharedRequest.promise = promise;
    entry.request = sharedRequest;
    request = sharedRequest;
  }

  if (request.abortTimer) {
    clearTimeout(request.abortTimer);
    request.abortTimer = null;
  }
  request.subscribers += 1;

  let released = false;
  return {
    promise: request.promise,
    release: () => {
      if (released) return;
      released = true;
      request.subscribers = Math.max(0, request.subscribers - 1);
      if (request.subscribers > 0 || entry?.request !== request) return;
      request.abortTimer = setTimeout(() => {
        request.abortTimer = null;
        if (
          request.subscribers > 0 ||
          entry?.request !== request ||
          request.controller.signal.aborted
        ) {
          return;
        }
        request.controller.abort(
          new DOMException(
            "A consulta de disponibilidade não possui mais consumidores.",
            "AbortError",
          ),
        );
      }, AI_INSIGHTS_AVAILABILITY_ABORT_GRACE_MS);
    },
  };
}

export function storeAiInsightsAvailabilityReport(
  scopeKey: string,
  report: unknown,
) {
  const entry = aiInsightsAvailabilityCache.get(scopeKey);
  if (!entry?.value) return;
  entry.value = {
    ...entry.value,
    latestReport: newestReport(entry.value.latestReport, report),
  };
  entry.resolvedAt = Date.now();
  entry.failure = null;
  entry.failedAt = 0;
}

export function isAiInsightsFailClosedError(error: unknown) {
  if (error instanceof AiInsightsAvailabilityPayloadError) return true;
  if (!isRecord(error)) return false;
  return error.status === 401 || error.status === 403 || error.status === 404;
}

async function requestAiInsightsAvailability({
  companyScopeId,
  module,
  scopeKey,
  signal,
  surface,
}: {
  companyScopeId: string;
  module: AiInsightModule;
  scopeKey: string;
  signal: AbortSignal;
  surface: AiInsightSurface;
}) {
  // `apiFetch` carries the certified JWT/company scope. Keeping it behind the
  // asynchronous request prevents the status-only control from pulling the
  // complete authenticated API runtime into a page's initial module graph.
  const { apiFetch } = await import("@/lib/api");
  const payload = await apiFetch<unknown>(
    `/ai/insights?module=${module}&surface=${surface}`,
    { companyScopeId, signal },
  );
  const snapshot = parseAiInsightsAvailabilityPayload(payload, scopeKey);
  if (!snapshot) {
    throw new AiInsightsAvailabilityPayloadError();
  }
  return snapshot;
}

export function parseAiInsightsAvailabilityPayload(
  payload: unknown,
  scopeKey: string,
): AiInsightsAvailabilitySnapshot | null {
  if (!isRecord(payload)) return null;

  if (hasExactKeys(payload, STATUS_KEYS)) {
    const status = parseStatus(payload);
    return status ? { latestReport: null, scopeKey, status } : null;
  }

  if (!hasExactKeys(payload, ["latestReport", "status"])) return null;
  const status = parseStatus(payload.status);
  if (!status) return null;
  const latestReport = payload.latestReport;
  if (latestReport !== null && !isRecord(latestReport)) return null;
  if (latestReport !== null && !status.available) return null;
  return { latestReport, scopeKey, status };
}

const STATUS_KEYS = [
  "allowedModels",
  "available",
  "configuration",
  "configured",
  "limits",
  "model",
  "role",
] as const;

function parseStatus(value: unknown): AiInsightsStatusResponse | null {
  if (!isRecord(value) || !hasExactKeys(value, STATUS_KEYS)) return null;
  if (
    typeof value.available !== "boolean" ||
    typeof value.configured !== "boolean" ||
    !isAccessRole(value.role)
  ) {
    return null;
  }
  if (value.available && !value.configured) return null;

  const model = normalizeModel(value.model);
  if (!model || !Array.isArray(value.allowedModels)) return null;
  if (value.allowedModels.length < 1 || value.allowedModels.length > 16) {
    return null;
  }
  const allowedModels = value.allowedModels.map(normalizeModel);
  if (allowedModels.some((candidate) => candidate === null)) return null;
  const normalizedAllowedModels = allowedModels as string[];
  if (
    !normalizedAllowedModels.includes(model) ||
    new Set(normalizedAllowedModels).size !== normalizedAllowedModels.length
  ) {
    return null;
  }

  const configuration = parseConfiguration(value.configuration);
  if (value.configuration !== null && !configuration) return null;
  if (configuration && value.role !== "master") return null;
  if (configuration && configuration.configured !== value.configured) return null;

  const limits = parseLimits(value.limits);
  if (!limits) return null;

  return {
    allowedModels: normalizedAllowedModels,
    available: value.available,
    configuration,
    configured: value.configured,
    limits,
    model,
    role: value.role,
  };
}

function parseConfiguration(
  value: unknown,
): AiInsightsStatusResponse["configuration"] | null {
  if (value === null) return null;
  const keys = [
    "companyId",
    "configured",
    "constraints",
    "credentialFingerprint",
    "enabledForAdmins",
    "enabledForOperators",
    "model",
    "prompt",
    "updatedAt",
  ] as const;
  if (!isRecord(value) || !hasExactKeys(value, keys)) return null;
  const companyId = normalizeBoundedText(value.companyId, 1, 128);
  const model = normalizeModel(value.model);
  const prompt = normalizeBoundedText(
    value.prompt,
    1,
    AI_INSIGHTS_CONFIGURATION_LIMITS.prompt,
  );
  const fingerprint =
    value.credentialFingerprint === null
      ? null
      : normalizeBoundedText(value.credentialFingerprint, 8, 32);
  const updatedAt =
    value.updatedAt === null ? null : normalizeTimestamp(value.updatedAt);
  if (
    !companyId ||
    !model ||
    !prompt ||
    (value.credentialFingerprint !== null && !fingerprint) ||
    (value.updatedAt !== null && !updatedAt) ||
    typeof value.configured !== "boolean" ||
    typeof value.constraints !== "string" ||
    value.constraints.length > AI_INSIGHTS_CONFIGURATION_LIMITS.constraints ||
    typeof value.enabledForAdmins !== "boolean" ||
    typeof value.enabledForOperators !== "boolean"
  ) {
    return null;
  }
  return {
    companyId,
    configured: value.configured,
    constraints: value.constraints,
    credentialFingerprint: fingerprint,
    enabledForAdmins: value.enabledForAdmins,
    enabledForOperators: value.enabledForOperators,
    model,
    prompt,
    updatedAt,
  };
}

function parseLimits(value: unknown): AiInsightsStatusResponse["limits"] | null {
  const keys = [
    "maxBodyBytes",
    "maxDatasets",
    "maxRowsPerDataset",
    "requestsPerMinute",
  ] as const;
  if (!isRecord(value) || !hasExactKeys(value, keys)) return null;
  for (const key of keys) {
    if (!Number.isInteger(value[key]) || Number(value[key]) <= 0) return null;
  }
  return {
    maxBodyBytes: Number(value.maxBodyBytes),
    maxDatasets: Number(value.maxDatasets),
    maxRowsPerDataset: Number(value.maxRowsPerDataset),
    requestsPerMinute: Number(value.requestsPerMinute),
  };
}

function normalizeModel(value: unknown) {
  const model = normalizeBoundedText(value, 1, 128);
  return model && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(model) ? model : null;
}

function normalizeTimestamp(value: unknown) {
  if (typeof value !== "string" || value.length > 64) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    return null;
  }
  return Number.isFinite(Date.parse(value)) ? value : null;
}

function normalizeBoundedText(value: unknown, minimum: number, maximum: number) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length >= minimum && normalized.length <= maximum
    ? normalized
    : null;
}

function isAccessRole(
  value: unknown,
): value is AiInsightsStatusResponse["role"] {
  return (
    value === "master" ||
    value === "admin" ||
    value === "operator" ||
    value === "unknown"
  );
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
) {
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => key in value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function newestReport(current: unknown | null, candidate: unknown | null) {
  if (current === null) return candidate;
  if (candidate === null) return current;
  return reportGeneratedAt(current) > reportGeneratedAt(candidate)
    ? current
    : candidate;
}

function reportGeneratedAt(report: unknown) {
  if (!isRecord(report) || !isRecord(report.meta)) return 0;
  const generatedAt = report.meta.generatedAt;
  if (typeof generatedAt !== "string") return 0;
  const value = Date.parse(generatedAt);
  return Number.isFinite(value) ? value : 0;
}
