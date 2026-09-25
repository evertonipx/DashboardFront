export type LoginBranding = {
  accentColor: string;
  companyName: string;
  key: string;
  logoUrl?: string;
  subtitle: string;
};

export const DEFAULT_LOGIN_BRANDING: LoginBranding = {
  accentColor: "#0B4EA2",
  companyName: "IPXData",
  key: "default",
  subtitle: "IPExtreme Analytics",
};

const COMPANY_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const pendingPublishedBranding = new Map<string, Promise<LoginBranding | null>>();
let pendingDefaultBranding: Promise<LoginBranding | null> | null = null;
const RESERVED_HOST_KEYS = new Set([
  "app",
  "dashboard",
  "ipxdata",
  "localhost",
  "login",
  "www",
]);

export function resolveLoginBranding(location: Location) {
  const brands = configuredBrands();
  const requestedKey =
    searchBrandKey(location.search) ||
    hostBrandKey(location.hostname);
  const brand = requestedKey ? brands.get(normalizeKey(requestedKey)) : null;

  return brand ?? DEFAULT_LOGIN_BRANDING;
}

export function resolveLoginCompanyId(location: Location) {
  const requestedKey =
    searchBrandKey(location.search) || hostBrandKey(location.hostname);
  // A shared browser must never inherit the last tenant's branding. The
  // deployment default is used only when the URL does not select a tenant.
  const candidate = requestedKey ||
    process.env.NEXT_PUBLIC_IPXDATA_DEFAULT_LOGIN_COMPANY_ID?.trim() || "";
  return COMPANY_ID_PATTERN.test(candidate) ? candidate.toLowerCase() : "";
}

export function hasExplicitLoginBrandSelection(location: Location) {
  return Boolean(searchBrandKey(location.search) || hostBrandKey(location.hostname));
}

export function publishedLoginBranding(
  value: unknown,
  expectedCompanyId: string,
): LoginBranding | null {
  if (!COMPANY_ID_PATTERN.test(expectedCompanyId) || !value ||
      typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const companyId = stringValue(record.companyId).toLowerCase();
  const companyName = stringValue(record.companyName).slice(0, 120);
  const logoUrl = stringValue(record.logoUrl);
  const logoPath = `/api/login-branding/${encodeURIComponent(companyId)}/logo`;
  if (companyId !== expectedCompanyId.toLowerCase() || !companyName ||
      !logoUrl.startsWith(`${logoPath}?v=`) ||
      !/^[a-f0-9]{64}$/i.test(logoUrl.slice(logoPath.length + 3))) return null;
  return {
    accentColor: DEFAULT_LOGIN_BRANDING.accentColor,
    companyName,
    key: companyId,
    logoUrl,
    subtitle: "IPXData",
  };
}

export function fetchPublishedLoginBranding(companyId: string): Promise<LoginBranding | null> {
  if (!COMPANY_ID_PATTERN.test(companyId)) return Promise.resolve(null);
  const id = companyId.toLowerCase();
  const pending = pendingPublishedBranding.get(id);
  if (pending) return pending;
  const request = fetch(`/api/login-branding/${encodeURIComponent(id)}`, {
    cache: "no-store",
  }).then(async (response) => response.ok
    ? publishedLoginBranding(await response.json(), id)
    : null,
  ).finally(() => {
    if (pendingPublishedBranding.get(id) === request) {
      pendingPublishedBranding.delete(id);
    }
  });
  pendingPublishedBranding.set(id, request);
  return request;
}

export function fetchDefaultLoginBranding(): Promise<LoginBranding | null> {
  if (pendingDefaultBranding) return pendingDefaultBranding;
  const request = fetch("/api/login-branding/default", {
    cache: "no-store",
  }).then(async (response) => {
    if (!response.ok) return null;
    const value = await response.json() as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const companyId = stringValue((value as Record<string, unknown>).companyId);
    return publishedLoginBranding(value, companyId);
  }).finally(() => {
    if (pendingDefaultBranding === request) pendingDefaultBranding = null;
  });
  pendingDefaultBranding = request;
  return request;
}

export function loginBrandInitials(name: string) {
  if (name.trim().toLowerCase() === "ipxdata") return "IPX";
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  const initials = parts.map((part) => part[0]?.toUpperCase()).join("");
  return initials || "IPX";
}

export function readableLoginBrandColor(value: string) {
  const color = normalizeColor(value) || DEFAULT_LOGIN_BRANDING.accentColor;
  const rgb = parseHexColor(color);
  if (!rgb) return "#0B4EA2";

  const luminance = relativeLuminance(rgb);
  const contrastOnWhite = 1.05 / (luminance + 0.05);
  return contrastOnWhite >= 4.5 ? color : "#0F3B66";
}

export function loginBrandColorWithAlpha(value: string, alpha: number) {
  const color = normalizeColor(value) || DEFAULT_LOGIN_BRANDING.accentColor;
  const rgb = parseHexColor(color) ?? { blue: 162, green: 78, red: 11 };
  const safeAlpha = Math.min(1, Math.max(0, alpha));
  return `rgb(${rgb.red} ${rgb.green} ${rgb.blue} / ${safeAlpha})`;
}

function configuredBrands() {
  const brands = new Map<string, LoginBranding>();
  brands.set(DEFAULT_LOGIN_BRANDING.key, DEFAULT_LOGIN_BRANDING);

  parseEnvBrands().forEach((brand) => {
    brands.set(brand.key, brand);
  });

  return brands;
}

function parseEnvBrands() {
  const raw = process.env.NEXT_PUBLIC_IPXDATA_LOGIN_BRANDS;
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    const records = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object"
        ? Object.entries(parsed).map(([key, value]) => ({
            ...(value && typeof value === "object" ? value : {}),
            key,
          }))
        : [];

    return records
      .map(normalizeBrand)
      .filter((brand): brand is LoginBranding => Boolean(brand));
  } catch {
    return [];
  }
}

function normalizeBrand(value: unknown): LoginBranding | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const key = normalizeKey(stringValue(record.key));
  const companyName = stringValue(record.companyName || record.name).slice(0, 120);
  if (!key || !companyName) return null;

  return {
    accentColor: normalizeColor(stringValue(record.accentColor)) || "#0B4EA2",
    companyName,
    key,
    logoUrl: stringValue(record.logoUrl || record.logo),
    subtitle: stringValue(record.subtitle) || "IPXData",
  };
}

function searchBrandKey(search: string) {
  const params = new URLSearchParams(search);
  return (
    params.get("empresa") ||
    params.get("company") ||
    params.get("company_id") ||
    params.get("brand") ||
    ""
  );
}

function hostBrandKey(hostname: string) {
  const host = hostname.toLowerCase();
  if (!host || host === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    return "";
  }

  const [subdomain] = host.split(".");
  const key = normalizeKey(subdomain);
  return key && !RESERVED_HOST_KEYS.has(key) ? key : "";
}

function normalizeKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeColor(value: string) {
  const color = value.trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "";
}

function parseHexColor(value: string) {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value);
  if (!match) return null;
  return {
    blue: Number.parseInt(match[3], 16),
    green: Number.parseInt(match[2], 16),
    red: Number.parseInt(match[1], 16),
  };
}

function relativeLuminance({
  blue,
  green,
  red,
}: {
  blue: number;
  green: number;
  red: number;
}) {
  const linear = (channel: number) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
