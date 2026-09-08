import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import {
  normalizeCardPreferences,
  type CardMenuKey,
  type CardPreference,
} from "@/lib/view-preferences";
import { resolveBackendBaseUrl } from "@/lib/backend-routing";
import { canManageWidgets, canViewModuleSurface } from "@/lib/permissions";
import type { CurrentUser, CurrentUserCompanyModule, UserPermission } from "@/lib/types";
import { reconcileCurrentUserWithAccessToken } from "@/lib/access-token-claims";

type DashboardViewStore = Partial<
  Record<string, Partial<Record<CardMenuKey, CardPreference[]>>>
>;

type RouteContext = {
  params: Promise<{
    menuKey: string;
  }>;
};

const validMenuKeys = new Set<CardMenuKey>([
  "live",
  "reports",
  "analysis",
  "demographics",
  "occupancy",
]);
const dataDirectory = path.join(process.cwd(), ".ipxdata");
const dataFile = path.join(dataDirectory, "dashboard-views.json");
const lockFile = path.join(dataDirectory, "dashboard-views.lock");
const LOCK_TIMEOUT_MS = 5_000;
const STALE_LOCK_MS = 30_000;
let storeWriteQueue: Promise<void> = Promise.resolve();

export async function GET(request: NextRequest, context: RouteContext) {
  const menuKey = await resolveMenuKey(context);
  if (!menuKey) {
    return NextResponse.json({ error: "Menu inválido." }, { status: 400 });
  }

  const session = await resolveSession(request, "read", menuKey);
  if ("response" in session) return session.response;

  const store = await readStore().catch(() => null);
  if (!store) {
    return NextResponse.json(
      { error: "Não foi possível ler as visões salvas." },
      { status: 500 },
    );
  }
  const preferences = store[session.companyId]?.[menuKey];

  return NextResponse.json({
    menuKey,
    company_id: session.companyId,
    found: Boolean(preferences),
    preferences: preferences ?? [],
  });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const menuKey = await resolveMenuKey(context);
  if (!menuKey) {
    return NextResponse.json({ error: "Menu inválido." }, { status: 400 });
  }

  const session = await resolveSession(request, "write", menuKey);
  if ("response" in session) return session.response;

  const payload = (await request.json().catch(() => null)) as {
    preferences?: CardPreference[];
    card_ids?: string[];
  } | null;

  const preferences = normalizeCardPreferences(
    menuKey,
    Array.isArray(payload?.preferences) ? payload.preferences : [],
    Array.isArray(payload?.card_ids) ? payload.card_ids : undefined,
  );
  const saved = await updateStore((store) => {
    const companyViews = store[session.companyId] ?? {};
    companyViews[menuKey] = preferences;
    store[session.companyId] = companyViews;
  }).then(
    () => true,
    () => false,
  );
  if (!saved) {
    return NextResponse.json(
      { error: "Não foi possível salvar a visão." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    menuKey,
    company_id: session.companyId,
    preferences,
  });
}

async function resolveMenuKey(context: RouteContext) {
  const { menuKey } = await context.params;
  return validMenuKeys.has(menuKey as CardMenuKey)
    ? (menuKey as CardMenuKey)
    : null;
}

async function resolveSession(
  request: NextRequest,
  mode: "read" | "write",
  menuKey: CardMenuKey,
) {
  const authorization = request.headers.get("authorization");
  if (!authorization) {
    return {
      response: NextResponse.json({ error: "Não autenticado." }, { status: 401 }),
    };
  }

  let backendBaseUrl: string;
  try {
    backendBaseUrl = resolveBackendBaseUrl(request);
  } catch {
    return {
      response: NextResponse.json(
        { error: "O serviço de dados está temporariamente indisponível." },
        { status: 500 },
      ),
    };
  }

  const userResult = await backendFetch(
    backendBaseUrl,
    "/api/v1/auth/me",
    authorization,
    request.signal,
  );
  if (!userResult.ok) {
    return {
      response: backendFailureResponse(userResult.status, "validar a sessão"),
    };
  }
  const rawUser = requireCurrentUser(userResult.payload);
  const accessToken = authorization.replace(/^Bearer\s+/i, "").trim();
  let user = rawUser
    ? reconcileCurrentUserWithAccessToken(rawUser, accessToken)
    : null;
  if (!user) {
    return {
      response: NextResponse.json(
        { error: "Não foi possível validar a sessão neste momento." },
        { status: 502 },
      ),
    };
  }

  const isMaster = hasMasterAccess(user);
  const requestedCompanyId = request.headers.get("x-company-id")?.trim();
  const companyId = isMaster && requestedCompanyId
    ? requestedCompanyId
    : user.company_id;

  if (!companyId) {
    return {
      response: NextResponse.json(
        { error: "Empresa não definida para salvar a visão." },
        { status: 400 },
      ),
    };
  }

  if (!isMaster) {
    let permissions = requireUserPermissions(user.permissions);
    if (user.permissions === undefined) {
      const permissionResult = await backendFetch(
        backendBaseUrl,
        `/api/v1/users/${encodeURIComponent(user.id)}/permissions`,
        authorization,
        request.signal,
      );
      if (!permissionResult.ok) {
        return {
          response: backendFailureResponse(
            permissionResult.status,
            "validar as permissões",
          ),
        };
      }
      permissions = requireUserPermissions(permissionResult.payload);
    }
    if (!permissions) {
      return {
        response: NextResponse.json(
          { error: "Não foi possível confirmar o acesso neste momento." },
          { status: 502 },
        ),
      };
    }

    if (user.company_modules === undefined) {
      const moduleResult = await backendFetch(
        backendBaseUrl,
        "/api/v1/company/modules",
        authorization,
        request.signal,
      );
      if (!moduleResult.ok) {
        return { response: backendFailureResponse(moduleResult.status, "validar os módulos") };
      }
      const companyModules = requireCompanyModules(moduleResult.payload, companyId);
      if (!companyModules) {
        return { response: NextResponse.json(
          { error: "Não foi possível confirmar os módulos neste momento." },
          { status: 502 },
        ) };
      }
      user = { ...user, company_modules: companyModules };
    }

    if (!canAccessDashboardViewMenu({ ...user, permissions }, menuKey)) {
      return { response: NextResponse.json(
        { error: "Sem acesso a esta tela." },
        { status: 403 },
      ) };
    }

    if (mode === "write" && !canManageWidgets({ ...user, permissions })) {
      return {
        response: NextResponse.json(
          { error: "Sem permissão para configurar widgets." },
          { status: 403 },
        ),
      };
    }
  }

  return { user, companyId };
}

function canAccessDashboardViewMenu(user: CurrentUser, menuKey: CardMenuKey) {
  if (menuKey === "occupancy" || menuKey === "demographics") {
    // These two legacy records are shared by all surfaces of their module;
    // the old storage contract does not identify one specific surface.
    return (["live", "analytics", "reports"] as const).some(
      (surface) => canViewModuleSurface(user, menuKey, surface),
    );
  }
  return canViewModuleSurface(
    user,
    "counting",
    menuKey === "analysis" ? "analytics" : menuKey,
  );
}

function requireCompanyModules(
  payload: unknown,
  companyId: string,
): CurrentUserCompanyModule[] | null {
  if (!Array.isArray(payload)) return null;
  const modules = new Map<string, CurrentUserCompanyModule>();
  for (const value of payload) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    if (
      typeof value.enabled !== "boolean" ||
      typeof value.module_id !== "string" || !value.module_id.trim() ||
      (value.company_id !== undefined && typeof value.company_id !== "string")
    ) return null;
    if (value.company_id?.trim() && value.company_id.trim() !== companyId) continue;

    const moduleId = value.module_id.trim();
    if (value.module !== undefined && value.module !== null) {
      if (
        typeof value.module !== "object" || Array.isArray(value.module) ||
        (value.module.active !== undefined && typeof value.module.active !== "boolean") ||
        (value.module.id !== undefined && value.module.id !== moduleId) ||
        (value.module.slug !== undefined && typeof value.module.slug !== "string") ||
        (value.module.name !== undefined && typeof value.module.name !== "string")
      ) return null;
    }
    const previous = modules.get(moduleId);
    modules.set(moduleId, {
      ...value,
      company_id: companyId,
      module_id: moduleId,
      // Duplicate endpoint rows cannot override an explicit revocation.
      enabled: value.enabled && value.module?.active !== false &&
        (!previous || previous.enabled),
    });
  }
  return [...modules.values()];
}

async function backendFetch(
  backendBaseUrl: string,
  pathname: string,
  authorization: string,
  signal: AbortSignal,
) {
  const headers = new Headers({ Authorization: authorization });

  const response = await fetch(`${backendBaseUrl}${pathname}`, {
    headers,
    cache: "no-store",
    signal,
  }).catch(() => null);

  if (!response) return { ok: false as const, status: 0 };
  if (!response.ok) return { ok: false as const, status: response.status };

  const payload = await response.json().catch(() => null);
  if (payload === null) return { ok: false as const, status: 502 };

  return { ok: true as const, payload };
}

function backendFailureResponse(status: number, action: string) {
  if (status === 401 || status === 403) {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  }
  return NextResponse.json(
    { error: `Serviço temporariamente indisponível ao ${action}.` },
    { status: status === 0 ? 502 : 503 },
  );
}

function requireCurrentUser(payload: unknown): CurrentUser | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const user = payload as CurrentUser;
  return typeof user.id === "string" && user.id.trim() ? user : null;
}

function requireUserPermissions(payload: unknown): UserPermission[] | null {
  if (!Array.isArray(payload)) return null;
  return payload.every(isUserPermissionRow)
    ? (payload as UserPermission[])
    : null;
}

function isUserPermissionRow(value: unknown): value is UserPermission {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const slug = (value as Record<string, unknown>).slug;
  return typeof slug === "string" && Boolean(slug.trim());
}

async function readStore(): Promise<DashboardViewStore> {
  try {
    const content = await fs.readFile(dataFile, "utf8");
    const parsed = JSON.parse(content) as DashboardViewStore | null;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Armazenamento de visões inválido.");
    }
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

function updateStore(update: (store: DashboardViewStore) => void) {
  const operation = storeWriteQueue.then(async () => {
    const releaseLock = await acquireStoreLock();
    try {
      const store = await readStore();
      update(store);
      await writeStore(store);
    } finally {
      await releaseLock();
    }
  });
  storeWriteQueue = operation.catch(() => undefined);
  return operation;
}

async function acquireStoreLock() {
  await fs.mkdir(dataDirectory, { recursive: true });
  const deadline = Date.now() + LOCK_TIMEOUT_MS;

  while (true) {
    try {
      const handle = await fs.open(lockFile, "wx");
      return async () => {
        await handle.close().catch(() => undefined);
        await fs.rm(lockFile, { force: true }).catch(() => undefined);
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const stat = await fs.stat(lockFile).catch(() => null);
      if (stat && Date.now() - stat.mtimeMs > STALE_LOCK_MS) {
        await fs.rm(lockFile, { force: true });
        continue;
      }
      if (Date.now() >= deadline) {
        throw new Error("Tempo esgotado ao bloquear o armazenamento de visões.");
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

async function writeStore(store: DashboardViewStore) {
  await fs.mkdir(dataDirectory, { recursive: true });
  const temporaryFile = `${dataFile}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporaryFile, JSON.stringify(store, null, 2), "utf8");
    await fs.rename(temporaryFile, dataFile);
  } finally {
    await fs.rm(temporaryFile, { force: true }).catch(() => undefined);
  }
}

function hasMasterAccess(user: CurrentUser) {
  const role = normalizeRole(user.role);
  return Boolean(user.is_master || role === "super-admin");
}

function normalizeRole(value: string | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/^super-?admin$/, "super-admin");
}
