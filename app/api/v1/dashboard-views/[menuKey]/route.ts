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
import { permissionsAllowWidgetManagement } from "@/lib/permissions";
import type { CurrentUser, UserPermission } from "@/lib/types";
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

  const session = await resolveSession(request, "read");
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

  const session = await resolveSession(request, "write");
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

async function resolveSession(request: NextRequest, mode: "read" | "write") {
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
        { error: "Configuração do backend inválida." },
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
  const user = rawUser
    ? reconcileCurrentUserWithAccessToken(rawUser, accessToken)
    : null;
  if (!user) {
    return {
      response: NextResponse.json(
        { error: "O backend retornou uma sessão inválida." },
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

  if (mode === "write" && !isMaster) {
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
    const permissions = Array.isArray(permissionResult.payload)
      ? (permissionResult.payload as UserPermission[])
      : null;
    if (!permissions) {
      return {
        response: NextResponse.json(
          { error: "O backend retornou permissões inválidas." },
          { status: 502 },
        ),
      };
    }

    if (!permissionsAllowWidgetManagement(permissions)) {
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
    { error: `Backend indisponível ao ${action}.` },
    { status: status === 0 ? 502 : 503 },
  );
}

function requireCurrentUser(payload: unknown): CurrentUser | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const user = payload as CurrentUser;
  return typeof user.id === "string" && user.id.trim() ? user : null;
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
