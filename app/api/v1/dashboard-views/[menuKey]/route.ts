import { promises as fs } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

import {
  normalizeCardPreferences,
  type CardMenuKey,
  type CardPreference,
} from "@/lib/view-preferences";
import { resolveBackendBaseUrl } from "@/lib/backend-routing";
import { permissionsAllowWidgetManagement } from "@/lib/permissions";
import type { CurrentUser, UserPermission } from "@/lib/types";

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

export async function GET(request: NextRequest, context: RouteContext) {
  const menuKey = await resolveMenuKey(context);
  if (!menuKey) {
    return NextResponse.json({ error: "Menu inválido." }, { status: 400 });
  }

  const session = await resolveSession(request, "read");
  if ("response" in session) return session.response;

  const store = await readStore();
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
  const store = await readStore();
  const companyViews = store[session.companyId] ?? {};
  companyViews[menuKey] = preferences;
  store[session.companyId] = companyViews;

  await writeStore(store);

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

  const user = await backendFetch<CurrentUser>(
    backendBaseUrl,
    "/api/v1/auth/me",
    authorization,
  );
  if (!user) {
    return {
      response: NextResponse.json({ error: "Sessão inválida." }, { status: 401 }),
    };
  }

  const isMaster = hasMasterAccess(user);
  const companyId = user.company_id;

  if (!companyId) {
    return {
      response: NextResponse.json(
        { error: "Empresa não definida para salvar a visão." },
        { status: 400 },
      ),
    };
  }

  if (mode === "write" && !isMaster) {
    const permissions =
      (await backendFetch<UserPermission[]>(
        backendBaseUrl,
        `/api/v1/users/${user.id}/permissions`,
        authorization,
      )) ?? [];

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

async function backendFetch<T>(
  backendBaseUrl: string,
  pathname: string,
  authorization: string,
) {
  const headers = new Headers({ Authorization: authorization });

  const response = await fetch(`${backendBaseUrl}${pathname}`, {
    headers,
    cache: "no-store",
  }).catch(() => null);

  if (!response?.ok) return null;

  return (await response.json()) as T;
}

async function readStore(): Promise<DashboardViewStore> {
  try {
    const content = await fs.readFile(dataFile, "utf8");
    const parsed = JSON.parse(content) as DashboardViewStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeStore(store: DashboardViewStore) {
  await fs.mkdir(dataDirectory, { recursive: true });
  await fs.writeFile(dataFile, JSON.stringify(store, null, 2), "utf8");
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
