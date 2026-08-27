"use client";

import {
  AiInsightsApiKeySchema,
  type AiInsightModule,
  type AiInsightSurface,
} from "@/lib/ai-insights-contract";
import { getUserViewScopedStorageKey } from "@/lib/master-company-scope";

export const AI_INSIGHTS_LOCAL_API_KEY_STORAGE_KEY =
  "ipxdata.ai-insights-api-key.v1";
export const AI_INSIGHTS_LOCAL_PROMPT_STORAGE_KEY =
  "ipxdata.ai-insights-prompt.v1";

const PROMPT_SCHEMA_VERSION = 1;
const PROMPT_TEXT_LIMIT = 500;

export type AiInsightsLocalPrompt = Readonly<{
  constraints: string;
  objective: string;
}>;

type LocalCredentialScope = Readonly<{
  companyId?: string | null;
  userId?: string | null;
}>;

type LocalPromptScope = LocalCredentialScope &
  Readonly<{
    module: AiInsightModule;
    surface: AiInsightSurface;
  }>;

type StoredPrompt = AiInsightsLocalPrompt & {
  schemaVersion: typeof PROMPT_SCHEMA_VERSION;
};

export function aiInsightsLocalApiKeyStorageKey({
  companyId,
  userId,
}: LocalCredentialScope) {
  return exactScopedStorageKey(
    AI_INSIGHTS_LOCAL_API_KEY_STORAGE_KEY,
    companyId,
    userId,
  );
}

export function aiInsightsLocalPromptStorageKey({
  companyId,
  module,
  surface,
  userId,
}: LocalPromptScope) {
  return exactScopedStorageKey(
    AI_INSIGHTS_LOCAL_PROMPT_STORAGE_KEY,
    companyId,
    userId,
    `${module}-${surface}`,
  );
}

export function loadAiInsightsLocalApiKey(scope: LocalCredentialScope) {
  const storageKey = aiInsightsLocalApiKeyStorageKey(scope);
  if (!storageKey || typeof window === "undefined") return "";

  try {
    const stored = window.localStorage.getItem(storageKey) ?? "";
    if (!stored) return "";
    if (AiInsightsApiKeySchema.safeParse(stored).success) return stored;
    window.localStorage.removeItem(storageKey);
  } catch {
    return "";
  }
  return "";
}

export function saveAiInsightsLocalApiKey(
  apiKey: string,
  scope: LocalCredentialScope,
) {
  const storageKey = aiInsightsLocalApiKeyStorageKey(scope);
  if (
    !storageKey ||
    typeof window === "undefined" ||
    !AiInsightsApiKeySchema.safeParse(apiKey).success
  ) {
    return false;
  }

  try {
    window.localStorage.setItem(storageKey, apiKey);
    return true;
  } catch {
    return false;
  }
}

export function clearAiInsightsLocalApiKey(scope: LocalCredentialScope) {
  const storageKey = aiInsightsLocalApiKeyStorageKey(scope);
  return removeExactLocalStorageEntry(storageKey);
}

export function loadAiInsightsLocalPrompt(
  scope: LocalPromptScope,
): AiInsightsLocalPrompt | null {
  const storageKey = aiInsightsLocalPromptStorageKey(scope);
  if (!storageKey || typeof window === "undefined") return null;

  try {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return null;
    const normalized = normalizeStoredPrompt(JSON.parse(stored) as unknown);
    if (normalized) return normalized;
    window.localStorage.removeItem(storageKey);
  } catch {
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Storage indisponível: a tela continua funcional somente em memória.
    }
  }
  return null;
}

export function saveAiInsightsLocalPrompt(
  prompt: AiInsightsLocalPrompt,
  scope: LocalPromptScope,
) {
  const storageKey = aiInsightsLocalPromptStorageKey(scope);
  const normalized = normalizeStoredPrompt({
    ...prompt,
    schemaVersion: PROMPT_SCHEMA_VERSION,
  });
  if (!storageKey || typeof window === "undefined" || !normalized) return false;

  const stored: StoredPrompt = {
    ...normalized,
    schemaVersion: PROMPT_SCHEMA_VERSION,
  };
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(stored));
    return true;
  } catch {
    return false;
  }
}

export function clearAiInsightsLocalPrompt(scope: LocalPromptScope) {
  const storageKey = aiInsightsLocalPromptStorageKey(scope);
  return removeExactLocalStorageEntry(storageKey);
}

/**
 * Removes credentials/prompts left by the former browser-managed flow. This
 * migration is intentionally exact-scoped and never enumerates unrelated
 * localStorage entries.
 */
export function purgeLegacyAiInsightsLocalSettings(
  scope: LocalCredentialScope,
) {
  const keyRemoved = clearAiInsightsLocalApiKey(scope);
  let promptsRemoved = true;
  for (const insightModule of ["counting", "occupancy"] as const) {
    for (const surface of ["live", "analysis", "reports"] as const) {
      promptsRemoved =
        clearAiInsightsLocalPrompt({
          ...scope,
          module: insightModule,
          surface,
        }) &&
        promptsRemoved;
    }
  }
  return keyRemoved && promptsRemoved;
}

function normalizeStoredPrompt(value: unknown): AiInsightsLocalPrompt | null {
  if (!value || typeof value !== "object") return null;
  const stored = value as Partial<StoredPrompt>;
  if (stored.schemaVersion !== PROMPT_SCHEMA_VERSION) return null;
  if (!isPromptText(stored.objective) || !isPromptText(stored.constraints)) {
    return null;
  }
  return {
    constraints: stored.constraints,
    objective: stored.objective,
  };
}

function isPromptText(value: unknown): value is string {
  return typeof value === "string" && value.length <= PROMPT_TEXT_LIMIT;
}

function exactScopedStorageKey(
  baseKey: string,
  companyId?: string | null,
  userId?: string | null,
  viewId?: string | null,
) {
  if (!companyId?.trim() || !userId?.trim()) return null;
  return getUserViewScopedStorageKey(baseKey, companyId, userId, viewId);
}

function removeExactLocalStorageEntry(storageKey: string | null) {
  if (!storageKey || typeof window === "undefined") return false;
  try {
    window.localStorage.removeItem(storageKey);
    return true;
  } catch {
    return false;
  }
}
