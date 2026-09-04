"use client";

import * as React from "react";

import {
  getUserViewScopedStorageKey,
  readUserViewScopedStorageEntry,
} from "@/lib/master-company-scope";
import {
  requestUserGridSync,
  USER_GRID_HYDRATED_EVENT,
} from "@/lib/user-grid";
import { writeUserGridPreference } from "@/lib/user-grid-local";

export type ViewLinkPathname = "/views/dashboard/live" | "/views/live";

export type ViewLinkTarget = {
  pathname: ViewLinkPathname;
  search: string;
};

type StoredViewLinkReference = ViewLinkTarget & {
  createdAt: string;
  reference: string;
  updatedAt: string;
};

type StoredViewLinkRegistry = {
  references: StoredViewLinkReference[];
  version: 1;
};

export const VIEW_LINK_REFERENCES_UPDATED_EVENT =
  "ipxdata:view-link-references-updated";

const VIEW_LINK_REFERENCES_STORAGE_KEY =
  "ipxdata.view-link-references.v1";
const VIEW_REFERENCE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const VIEW_REFERENCE_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const ALLOWED_PATHNAMES = new Set<ViewLinkPathname>([
  "/views/dashboard/live",
  "/views/live",
]);

/**
 * Generates a random, URL-safe locator. It carries no tenant, scenario or
 * layout information; the authenticated user's grid owns the actual target.
 */
export function createViewLinkReference() {
  const bytes = new Uint8Array(18);
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  let reference = "";
  let buffer = 0;
  let bitCount = 0;
  bytes.forEach((byte) => {
    buffer = (buffer << 8) | byte;
    bitCount += 8;
    while (bitCount >= 6) {
      bitCount -= 6;
      reference += VIEW_REFERENCE_ALPHABET[(buffer >>> bitCount) & 63];
      buffer &= (1 << bitCount) - 1;
    }
  });
  if (bitCount) {
    reference += VIEW_REFERENCE_ALPHABET[(buffer << (6 - bitCount)) & 63];
  }
  return reference;
}

export function saveViewLinkTarget(
  targetValue: string | URL,
  userId?: string | null,
  requestedReference?: string | null,
) {
  if (typeof window === "undefined") return null;
  const cleanUserId = userId?.trim() ?? "";
  const target = normalizeViewLinkTarget(targetValue);
  if (!cleanUserId || !target) return null;

  const requested = requestedReference?.trim() ?? "";
  const reference = VIEW_REFERENCE_PATTERN.test(requested)
    ? requested
    : createViewLinkReference();
  const registry = readRegistry(cleanUserId);
  const existing = registry.references.find(
    (candidate) => candidate.reference === reference,
  );
  const now = new Date().toISOString();
  const entry: StoredViewLinkReference = {
    ...target,
    createdAt: existing?.createdAt ?? now,
    reference,
    updatedAt: now,
  };
  const references = existing
    ? registry.references.map((candidate) =>
        candidate.reference === reference ? entry : candidate,
      )
    : [entry, ...registry.references];

  writeUserGridPreference(
    storageKey(cleanUserId),
    JSON.stringify({ references, version: 1 } satisfies StoredViewLinkRegistry),
  );
  if (typeof CustomEvent === "function") {
    window.dispatchEvent(
      new CustomEvent(VIEW_LINK_REFERENCES_UPDATED_EVENT, {
        detail: { reference },
      }),
    );
  }
  requestUserGridSync();
  return reference;
}

export function loadViewLinkTarget(
  referenceValue: string | null | undefined,
  userId?: string | null,
  expectedPathname?: ViewLinkPathname,
) {
  const reference = referenceValue?.trim() ?? "";
  const cleanUserId = userId?.trim() ?? "";
  if (
    typeof window === "undefined" ||
    !cleanUserId ||
    !VIEW_REFERENCE_PATTERN.test(reference)
  ) {
    return null;
  }

  const entry = readRegistry(cleanUserId).references.find(
    (candidate) => candidate.reference === reference,
  );
  if (!entry || (expectedPathname && entry.pathname !== expectedPathname)) {
    return null;
  }
  return { pathname: entry.pathname, search: entry.search } satisfies ViewLinkTarget;
}

export function useViewLinkTarget(
  reference: string | null | undefined,
  userId: string | null | undefined,
  expectedPathname: ViewLinkPathname,
) {
  const [target, setTarget] = React.useState<ViewLinkTarget | null>(() =>
    loadViewLinkTarget(reference, userId, expectedPathname),
  );

  React.useEffect(() => {
    function syncTarget() {
      setTarget(loadViewLinkTarget(reference, userId, expectedPathname));
    }

    syncTarget();
    window.addEventListener(USER_GRID_HYDRATED_EVENT, syncTarget);
    window.addEventListener(VIEW_LINK_REFERENCES_UPDATED_EVENT, syncTarget);
    window.addEventListener("storage", syncTarget);
    return () => {
      window.removeEventListener(USER_GRID_HYDRATED_EVENT, syncTarget);
      window.removeEventListener(VIEW_LINK_REFERENCES_UPDATED_EVENT, syncTarget);
      window.removeEventListener("storage", syncTarget);
    };
  }, [expectedPathname, reference, userId]);

  return target;
}

export function buildOpaqueViewUrl(
  pathname: ViewLinkPathname,
  reference: string,
  origin: string,
) {
  if (!VIEW_REFERENCE_PATTERN.test(reference.trim())) return "";
  const url = new URL(pathname, origin);
  url.searchParams.set("view", reference.trim());
  return url.toString();
}

export function buildOpaqueViewPath(
  pathname: ViewLinkPathname,
  reference: string,
) {
  if (!VIEW_REFERENCE_PATTERN.test(reference.trim())) return "";
  return `${pathname}?view=${encodeURIComponent(reference.trim())}`;
}

export function ensureOpaqueViewPath(
  targetValue: string | URL,
  userId?: string | null,
) {
  const opaquePath = readExistingOpaqueViewPath(targetValue);
  if (opaquePath) return opaquePath;

  const target = normalizeViewLinkTarget(targetValue);
  if (!target) return "";

  const reference = saveViewLinkTarget(targetValue, userId);
  return reference ? buildOpaqueViewPath(target.pathname, reference) : "";
}

function readExistingOpaqueViewPath(value: string | URL) {
  try {
    const origin = window.location?.origin || "http://localhost";
    const url = value instanceof URL ? value : new URL(value, origin);
    const pathname = normalizePathname(url.pathname);
    const reference = url.searchParams.get("view")?.trim() ?? "";
    return pathname &&
      url.origin === origin &&
      url.searchParams.size === 1 &&
      VIEW_REFERENCE_PATTERN.test(reference)
      ? buildOpaqueViewPath(pathname, reference)
      : "";
  } catch {
    return "";
  }
}

function readRegistry(userId: string): StoredViewLinkRegistry {
  if (typeof window === "undefined") return emptyRegistry();
  try {
    const stored = readUserViewScopedStorageEntry(
      VIEW_LINK_REFERENCES_STORAGE_KEY,
      undefined,
      userId,
    );
    if (!stored?.value) return emptyRegistry();
    const parsed = JSON.parse(stored.value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return emptyRegistry();
    }
    const record = parsed as Record<string, unknown>;
    const values = Array.isArray(record.references) ? record.references : [];
    return {
      references: values
        .map(normalizeStoredReference)
        .filter(
          (entry): entry is StoredViewLinkReference => Boolean(entry),
        ),
      version: 1,
    };
  } catch {
    return emptyRegistry();
  }
}

function normalizeStoredReference(value: unknown): StoredViewLinkReference | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const reference =
    typeof record.reference === "string" ? record.reference.trim() : "";
  const target = normalizeViewLinkTarget({
    pathname: record.pathname,
    search: record.search,
  });
  if (!VIEW_REFERENCE_PATTERN.test(reference) || !target) return null;

  const now = new Date().toISOString();
  return {
    ...target,
    createdAt: validTimestamp(record.createdAt) ?? now,
    reference,
    updatedAt: validTimestamp(record.updatedAt) ?? now,
  };
}

function normalizeViewLinkTarget(value: unknown): ViewLinkTarget | null {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !(value instanceof URL)
  ) {
    const record = value as Record<string, unknown>;
    const pathname = normalizePathname(record.pathname);
    if (!pathname || typeof record.search !== "string") return null;
    const params = new URLSearchParams(record.search);
    params.delete("view");
    return { pathname, search: params.size ? `?${params.toString()}` : "" };
  }

  try {
    const origin = window.location?.origin || "http://localhost";
    const url = value instanceof URL ? value : new URL(String(value), origin);
    const pathname = normalizePathname(url.pathname);
    if (!pathname || url.origin !== origin) return null;
    const params = new URLSearchParams(url.search);
    params.delete("view");
    return { pathname, search: params.size ? `?${params.toString()}` : "" };
  } catch {
    return null;
  }
}

function normalizePathname(value: unknown): ViewLinkPathname | null {
  return typeof value === "string" &&
    ALLOWED_PATHNAMES.has(value as ViewLinkPathname)
    ? (value as ViewLinkPathname)
    : null;
}

function validTimestamp(value: unknown) {
  return typeof value === "string" && Number.isFinite(Date.parse(value))
    ? value
    : null;
}

function storageKey(userId: string) {
  return getUserViewScopedStorageKey(
    VIEW_LINK_REFERENCES_STORAGE_KEY,
    undefined,
    userId,
  );
}

function emptyRegistry(): StoredViewLinkRegistry {
  return { references: [], version: 1 };
}
