import { getUserViewScopedStorageKey } from "@/lib/master-company-scope";
import { requestUserGridSync } from "@/lib/user-grid";

export const DASHBOARD_FOCUS_STORAGE_KEY = "ipxdata.dashboard-focus.v1";

export type DashboardFocusSurface =
  | "live"
  | "reports"
  | "occupancy-live"
  | "occupancy-analysis"
  | "occupancy-reports";

export type DashboardFocusScopeMode =
  | "scenario"
  | "location"
  | "sub_location";

export type DashboardFocusPreference<
  Mode extends string = DashboardFocusScopeMode,
> = {
  scopeMode: Mode;
  selectedId: string;
};

export type DashboardFocusOption<Mode extends string> = {
  active?: boolean;
  id: string;
  mode: Mode;
};

type ResolveDashboardFocusOptions<Mode extends string> = {
  availableModes: readonly Mode[];
  current?: DashboardFocusPreference<Mode> | null;
  getOptions: (mode: Mode) => readonly DashboardFocusOption<Mode>[];
  stored?: DashboardFocusPreference<Mode> | null;
};

/**
 * Resolves the focus independently from the route rendering the dashboard.
 * A valid in-memory selection wins, followed by the persisted selection. Only
 * then is a fallback selected; scenario fallbacks prefer an active scenario so
 * opening a manager route cannot unexpectedly jump to the first inactive row.
 */
export function resolveDashboardFocus<Mode extends string>({
  availableModes,
  current,
  getOptions,
  stored,
}: ResolveDashboardFocusOptions<Mode>): DashboardFocusPreference<Mode> | null {
  const modes = Array.from(new Set(availableModes));
  const optionCache = new Map<Mode, readonly DashboardFocusOption<Mode>[]>();
  const optionsForMode = (mode: Mode) => {
    const cached = optionCache.get(mode);
    if (cached) return cached;
    const options = getOptions(mode);
    optionCache.set(mode, options);
    return options;
  };
  const validPreference = (
    preference?: DashboardFocusPreference<Mode> | null,
  ) => {
    if (!preference || !modes.includes(preference.scopeMode)) return null;
    return optionsForMode(preference.scopeMode).some(
      (option) => option.id === preference.selectedId,
    )
      ? preference
      : null;
  };

  const selected = validPreference(current) ?? validPreference(stored);
  if (selected) return selected;

  const fallbackModes = Array.from(
    new Set(
      [current?.scopeMode, stored?.scopeMode, ...modes].filter(
        (mode): mode is Mode => mode !== undefined && modes.includes(mode),
      ),
    ),
  );

  for (const mode of fallbackModes) {
    const options = optionsForMode(mode);
    const option =
      mode === "scenario"
        ? options.find((candidate) => candidate.active === true) ?? options[0]
        : options[0];
    if (option) return { scopeMode: mode, selectedId: option.id };
  }

  return null;
}

export function loadDashboardFocus<Mode extends DashboardFocusScopeMode>(
  companyId: string | null | undefined,
  userId: string | null | undefined,
  surface: DashboardFocusSurface,
): DashboardFocusPreference<Mode> | null {
  if (typeof window === "undefined" || !companyId?.trim() || !userId?.trim()) {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(
      getDashboardFocusStorageKey(companyId, userId, surface),
    );
    if (!stored) return null;
    const parsed = JSON.parse(stored) as Partial<
      DashboardFocusPreference<DashboardFocusScopeMode>
    >;
    if (
      !isDashboardFocusScopeMode(parsed.scopeMode) ||
      typeof parsed.selectedId !== "string" ||
      !parsed.selectedId.trim()
    ) {
      return null;
    }

    return {
      scopeMode: parsed.scopeMode as Mode,
      selectedId: parsed.selectedId.trim(),
    };
  } catch {
    return null;
  }
}

export function saveDashboardFocus<Mode extends DashboardFocusScopeMode>(
  preference: DashboardFocusPreference<Mode>,
  companyId: string | null | undefined,
  userId: string | null | undefined,
  surface: DashboardFocusSurface,
) {
  const cleanCompanyId = companyId?.trim() ?? "";
  const cleanUserId = userId?.trim() ?? "";
  const cleanSelectedId = preference.selectedId.trim();
  if (
    typeof window === "undefined" ||
    !cleanCompanyId ||
    !cleanUserId ||
    !cleanSelectedId ||
    !isDashboardFocusScopeMode(preference.scopeMode)
  ) {
    return false;
  }

  try {
    window.localStorage.setItem(
      getDashboardFocusStorageKey(cleanCompanyId, cleanUserId, surface),
      JSON.stringify({
        scopeMode: preference.scopeMode,
        selectedId: cleanSelectedId,
      }),
    );
    requestUserGridSync();
    return true;
  } catch {
    return false;
  }
}

export function getDashboardFocusStorageKey(
  companyId: string | null | undefined,
  userId: string | null | undefined,
  surface: DashboardFocusSurface,
) {
  return getUserViewScopedStorageKey(
    DASHBOARD_FOCUS_STORAGE_KEY,
    companyId,
    userId,
    surface,
  );
}

function isDashboardFocusScopeMode(
  value: unknown,
): value is DashboardFocusScopeMode {
  return (
    value === "scenario" || value === "location" || value === "sub_location"
  );
}
