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

const LOGIN_BRAND_STORAGE_KEY = "ipxdata-login-brand-key";
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
    hostBrandKey(location.hostname) ||
    readStoredBrandKey();
  const brand = requestedKey ? brands.get(normalizeKey(requestedKey)) : null;

  if (brand) {
    writeStoredBrandKey(brand.key);
    return brand;
  }

  return DEFAULT_LOGIN_BRANDING;
}

export function loginBrandInitials(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  const initials = parts.map((part) => part[0]?.toUpperCase()).join("");
  return initials || "IPX";
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
  const companyName = stringValue(record.companyName || record.name);
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

function readStoredBrandKey() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(LOGIN_BRAND_STORAGE_KEY) ?? "";
}

function writeStoredBrandKey(key: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOGIN_BRAND_STORAGE_KEY, key);
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

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
