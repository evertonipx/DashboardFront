import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const MIME_EXTENSIONS = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
} as const;

export type LoginLogoMimeType = keyof typeof MIME_EXTENSIONS;

type StoredBranding = {
  schemaVersion: 1;
  companyId: string;
  companyName: string;
  logoSha256: string | null;
  logoMimeType: LoginLogoMimeType | null;
};

type StoredDefaultBranding = {
  schemaVersion: 1;
  companyId: string;
};

export type PublicLoginBranding = {
  companyId: string;
  companyName: string;
  logoUrl: string | null;
};

export type LoginBrandingLogo = {
  bytes: Buffer;
  mimeType: LoginLogoMimeType;
  sha256: string;
};

export function normalizeLoginBrandingCompanyId(value: string) {
  const id = value.trim().toLowerCase();
  return UUID_PATTERN.test(id) ? id : null;
}

export function validateLoginBrandingLogo(
  bytes: Buffer,
  contentType: string,
): { mimeType: LoginLogoMimeType; sha256: string } {
  const mimeType = contentType.split(";", 1)[0]?.trim().toLowerCase();
  if (!mimeType || !isSupportedMimeType(mimeType)) {
    throw new Error("Formato de logo não permitido.");
  }
  if (!bytes.length || bytes.length > MAX_LOGO_BYTES) {
    throw new Error("O logo deve ter entre 1 byte e 5 MB.");
  }
  if (!matchesImageSignature(bytes, mimeType)) {
    throw new Error("O conteúdo do logo não corresponde ao formato informado.");
  }
  return {
    mimeType,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

export function publicLoginBranding(stored: StoredBranding): PublicLoginBranding {
  return {
    companyId: stored.companyId,
    companyName: stored.companyName,
    logoUrl: stored.logoSha256
      ? `/api/login-branding/${stored.companyId}/logo?v=${stored.logoSha256}`
      : null,
  };
}

export async function readLoginBranding(
  companyId: string,
  storageRoot = loginBrandingStorageRoot(),
): Promise<PublicLoginBranding | null> {
  const stored = await readStoredBranding(companyId, storageRoot);
  return stored ? publicLoginBranding(stored) : null;
}

export async function readDefaultLoginBranding(
  storageRoot = loginBrandingStorageRoot(),
): Promise<PublicLoginBranding | null> {
  const content = await readRegularFile(path.join(path.resolve(storageRoot), "default.json"));
  if (!content) return readSinglePublishedLogo(storageRoot);
  const value = JSON.parse(content.toString("utf8")) as unknown;
  if (!isStoredDefaultBranding(value)) {
    throw new Error("Identidade visual padrão inválida.");
  }
  return readLoginBranding(value.companyId, storageRoot);
}

export async function readLoginBrandingLogo(
  companyId: string,
  version: string | null,
  storageRoot = loginBrandingStorageRoot(),
): Promise<LoginBrandingLogo | null> {
  const stored = await readStoredBranding(companyId, storageRoot);
  if (!stored?.logoSha256 || !stored.logoMimeType) return null;
  if (version !== null && version !== stored.logoSha256) return null;

  const logoPath = path.join(
    companyDirectory(storageRoot, stored.companyId),
    logoFileName(stored.logoSha256, stored.logoMimeType),
  );
  const bytes = await readRegularFile(logoPath);
  if (!bytes) return null;
  const { sha256 } = validateLoginBrandingLogo(bytes, stored.logoMimeType);
  if (sha256 !== stored.logoSha256) {
    throw new Error("A imagem pública salva não passou na validação de integridade.");
  }
  return { bytes, mimeType: stored.logoMimeType, sha256 };
}

export async function saveLoginBranding(
  input: {
    companyId: string;
    companyName: string;
    logo: { bytes: Buffer; contentType: string } | null;
  },
  storageRoot = loginBrandingStorageRoot(),
  options: { makeDefault?: boolean } = {},
): Promise<PublicLoginBranding> {
  const companyId = normalizeLoginBrandingCompanyId(input.companyId);
  if (!companyId) throw new Error("Identificador de empresa inválido.");
  const companyName = input.companyName.trim();
  if (!companyName || companyName.length > 160 || /[\u0000-\u001f\u007f]/.test(companyName)) {
    throw new Error("Nome da empresa inválido.");
  }

  const logo = input.logo
    ? validateLoginBrandingLogo(input.logo.bytes, input.logo.contentType)
    : null;
  const directory = companyDirectory(storageRoot, companyId);
  await ensureCompanyDirectory(directory);

  if (logo && input.logo) {
    await writeAtomic(
      path.join(directory, logoFileName(logo.sha256, logo.mimeType)),
      input.logo.bytes,
    );
  }

  const stored: StoredBranding = {
    schemaVersion: 1,
    companyId,
    companyName,
    logoSha256: logo?.sha256 ?? null,
    logoMimeType: logo?.mimeType ?? null,
  };
  await writeAtomic(
    path.join(directory, "current.json"),
    Buffer.from(JSON.stringify(stored), "utf8"),
  );
  if (options.makeDefault && logo) {
    await writeAtomic(
      path.join(path.resolve(storageRoot), "default.json"),
      Buffer.from(JSON.stringify({ schemaVersion: 1, companyId } satisfies StoredDefaultBranding), "utf8"),
    );
  }
  return publicLoginBranding(stored);
}

export async function removeLoginBranding(
  companyId: string,
  storageRoot = loginBrandingStorageRoot(),
): Promise<void> {
  const id = normalizeLoginBrandingCompanyId(companyId);
  if (!id) throw new Error("Identificador de empresa inválido.");
  const root = path.resolve(storageRoot);
  const directory = companyDirectory(root, id);
  const info = await fs.lstat(directory).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (!info) {
    await clearDefaultLoginBrandingIfMatches(id, root);
    return;
  }
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error("Diretório da identidade visual inválido.");
  }
  // Resolve the final target before the only recursive removal in this store.
  const [actualRoot, actualDirectory] = await Promise.all([
    fs.realpath(root),
    fs.realpath(directory),
  ]);
  if (path.dirname(actualDirectory) !== actualRoot) {
    throw new Error("A identidade visual está fora do diretório esperado.");
  }
  await fs.rm(directory, { recursive: true, force: true });
  await clearDefaultLoginBrandingIfMatches(id, root);
}

export function loginBrandingStorageRoot() {
  const configured = process.env.IPXDATA_PUBLIC_BRANDING_DIR?.trim();
  if (configured) {
    if (!path.isAbsolute(configured)) {
      throw new Error("IPXDATA_PUBLIC_BRANDING_DIR deve ser um caminho absoluto.");
    }
    return path.resolve(configured);
  }
  return path.join(process.cwd(), ".ipxdata", "login-branding");
}

function companyDirectory(root: string, companyId: string) {
  const id = normalizeLoginBrandingCompanyId(companyId);
  if (!id) throw new Error("Identificador de empresa inválido.");
  const absoluteRoot = path.resolve(root);
  const directory = path.resolve(absoluteRoot, id);
  if (path.dirname(directory) !== absoluteRoot) {
    throw new Error("Diretório da identidade visual inválido.");
  }
  return directory;
}

function logoFileName(sha256: string, mimeType: LoginLogoMimeType) {
  if (!HASH_PATTERN.test(sha256) || !isSupportedMimeType(mimeType)) {
    throw new Error("Metadados do logo inválidos.");
  }
  return `logo-${sha256}.${MIME_EXTENSIONS[mimeType]}`;
}

async function readStoredBranding(companyId: string, root: string): Promise<StoredBranding | null> {
  const id = normalizeLoginBrandingCompanyId(companyId);
  if (!id) throw new Error("Identificador de empresa inválido.");
  const directory = companyDirectory(root, id);
  const directoryInfo = await fs.lstat(directory).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (!directoryInfo) return null;
  if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) {
    throw new Error("Diretório da identidade visual inválido.");
  }
  const content = await readRegularFile(path.join(directory, "current.json"));
  if (!content) return null;
  const value = JSON.parse(content.toString("utf8")) as unknown;
  if (!isStoredBranding(value, id)) {
    throw new Error("Metadados públicos da identidade visual inválidos.");
  }
  return value;
}

function isStoredBranding(value: unknown, id: string): value is StoredBranding {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Partial<StoredBranding>;
  return record.schemaVersion === 1 &&
    record.companyId === id &&
    typeof record.companyName === "string" &&
    Boolean(record.companyName.trim()) &&
    record.companyName.length <= 160 &&
    ((record.logoSha256 === null && record.logoMimeType === null) ||
      (typeof record.logoSha256 === "string" &&
        HASH_PATTERN.test(record.logoSha256) &&
        typeof record.logoMimeType === "string" &&
        isSupportedMimeType(record.logoMimeType)));
}

function isStoredDefaultBranding(value: unknown): value is StoredDefaultBranding {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Partial<StoredDefaultBranding>;
  return record.schemaVersion === 1 &&
    typeof record.companyId === "string" &&
    normalizeLoginBrandingCompanyId(record.companyId) === record.companyId;
}

async function readSinglePublishedLogo(storageRoot: string): Promise<PublicLoginBranding | null> {
  const root = path.resolve(storageRoot);
  const entries = await fs.readdir(root, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (!entries) return null;

  let found: PublicLoginBranding | null = null;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const companyId = normalizeLoginBrandingCompanyId(entry.name);
    if (!companyId || companyId !== entry.name) continue;
    try {
      const branding = await readLoginBranding(companyId, root);
      if (!branding?.logoUrl || !await readLoginBrandingLogo(companyId, null, root)) continue;
      if (found) return null;
      found = branding;
    } catch {
      // A damaged legacy mirror is not a published, valid login logo.
    }
  }
  return found;
}

async function clearDefaultLoginBrandingIfMatches(companyId: string, storageRoot: string) {
  const pointer = path.join(path.resolve(storageRoot), "default.json");
  const content = await readRegularFile(pointer);
  if (!content) return;
  const value = JSON.parse(content.toString("utf8")) as unknown;
  if (!isStoredDefaultBranding(value)) {
    throw new Error("Identidade visual padrão inválida.");
  }
  if (value.companyId === companyId) {
    await fs.rm(pointer, { force: true });
  }
}

async function ensureCompanyDirectory(directory: string) {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const info = await fs.lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error("Diretório da identidade visual inválido.");
  }
}

async function readRegularFile(file: string): Promise<Buffer | null> {
  const info = await fs.lstat(file).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (!info) return null;
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new Error("Arquivo da identidade visual inválido.");
  }
  return fs.readFile(file);
}

async function writeAtomic(target: string, contents: Buffer) {
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  try {
    const handle = await fs.open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(contents);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(temporary, target);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => undefined);
  }
}

function matchesImageSignature(bytes: Buffer, mimeType: LoginLogoMimeType) {
  if (mimeType === "image/png") {
    return bytes.length >= 8 && bytes.subarray(0, 8).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
  }
  if (mimeType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === "image/gif") {
    return bytes.length >= 6 &&
      (bytes.subarray(0, 6).toString("ascii") === "GIF87a" ||
        bytes.subarray(0, 6).toString("ascii") === "GIF89a");
  }
  return bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP";
}

function isSupportedMimeType(value: string): value is LoginLogoMimeType {
  return Object.prototype.hasOwnProperty.call(MIME_EXTENSIONS, value);
}
