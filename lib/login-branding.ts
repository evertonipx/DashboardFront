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
  logoUrl: "/jk.png",
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

function readStoredBrandKey() {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(LOGIN_BRAND_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeStoredBrandKey(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOGIN_BRAND_STORAGE_KEY, key);
  } catch {
    // Branding is presentation-only and must never block authentication.
  }
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
