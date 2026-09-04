"use client";

import { getUserViewScopedStorageKey } from "@/lib/master-company-scope";

export const AI_INSIGHTS_LOCAL_API_KEY_STORAGE_KEY =
  "ipxdata.ai-insights-api-key.v1";
export const AI_INSIGHTS_LOCAL_PROMPT_STORAGE_KEY =
  "ipxdata.ai-insights-prompt.v1";

/** Remove only the exact legacy keys owned by the authenticated user/company. */
export function purgeLegacyAiInsightsLocalSettings({
  companyId,
  userId,
}: {
  companyId?: string | null;
  userId?: string | null;
}) {
  if (!companyId?.trim() || !userId?.trim() || typeof window === "undefined") {
    return false;
  }

  const keys = [
    getUserViewScopedStorageKey(
      AI_INSIGHTS_LOCAL_API_KEY_STORAGE_KEY,
      companyId,
      userId,
    ),
  ];
  for (const insightModule of ["counting", "occupancy"] as const) {
    for (const surface of ["live", "analysis", "reports"] as const) {
      keys.push(
        getUserViewScopedStorageKey(
          AI_INSIGHTS_LOCAL_PROMPT_STORAGE_KEY,
          companyId,
          userId,
          `${insightModule}-${surface}`,
        ),
      );
    }
  }

  try {
    for (const key of keys) window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
