import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";

import {
  AiInsightsApiKeySchema,
  AiInsightsModelSchema,
} from "@/lib/ai-insights-contract";
import type { CurrentUser } from "@/lib/types";

export const AI_INSIGHTS_COMPANY_PROMPT_MAX_LENGTH = 4_000;
export const AI_INSIGHTS_COMPANY_CONSTRAINTS_MAX_LENGTH = 2_000;

const STORE_FORMAT = "ipxdata-ai-insights-company-settings";
const STORE_VERSION = 1;
const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const ENCRYPTION_KEY_BYTES = 32;
const INITIALIZATION_VECTOR_BYTES = 12;
const AUTHENTICATION_TAG_BYTES = 16;
const FILE_MODE = 0o600;
const DIRECTORY_MODE = 0o700;
const LOCK_TIMEOUT_MS = 5_000;
const STALE_LOCK_MS = 30_000;
const LOCK_RETRY_MS = 50;
const MAX_STORE_BYTES = 16 * 1024 * 1024;

const dataDirectory = resolveSettingsDirectory();
const dataFile = path.join(dataDirectory, "ai-insights-config.v1.json");
const keyFile = path.join(dataDirectory, "ai-insights-config.v1.key");
const lockFile = path.join(dataDirectory, "ai-insights-config.v1.lock");

const CompanyIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/)
  .refine(
    (value) => !["__proto__", "constructor", "prototype"].includes(value),
  )
  .transform((value) =>
    /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)
      ? value.toLowerCase()
      : value,
  );
const UpdatedBySchema = z.string().trim().min(1).max(160);
const PromptSchema = z
  .string()
  .max(AI_INSIGHTS_COMPANY_PROMPT_MAX_LENGTH);
const ConstraintsSchema = z
  .string()
  .max(AI_INSIGHTS_COMPANY_CONSTRAINTS_MAX_LENGTH);
const TimestampSchema = z.string().datetime({ offset: true }).max(64);

const CompanySettingsInputSchema = z
  .object({
    apiKey: AiInsightsApiKeySchema.nullable().optional(),
    constraints: ConstraintsSchema.optional(),
    enabledForAdmins: z.boolean().optional(),
    enabledForOperators: z.boolean().optional(),
    model: AiInsightsModelSchema.nullable().optional(),
    prompt: PromptSchema.optional(),
  })
  .strict();

const StoredCompanySettingsSchema = z
  .object({
    apiKey: AiInsightsApiKeySchema.nullable(),
    companyId: CompanyIdSchema,
    constraints: ConstraintsSchema,
    enabledForAdmins: z.boolean(),
    enabledForOperators: z.boolean(),
    model: AiInsightsModelSchema.nullable(),
    prompt: PromptSchema,
    updatedAt: TimestampSchema,
    updatedBy: UpdatedBySchema,
  })
  .strict();

const PlaintextStoreSchema = z
  .object({
    companies: z.array(StoredCompanySettingsSchema).max(10_000),
    format: z.literal(STORE_FORMAT),
    version: z.literal(STORE_VERSION),
  })
  .strict()
  .superRefine((store, context) => {
    const companyIds = new Set<string>();
    store.companies.forEach((settings, index) => {
      if (companyIds.has(settings.companyId)) {
        context.addIssue({
          code: "custom",
          message: "Empresa duplicada no armazenamento de Insights IA.",
          path: ["companies", index, "companyId"],
        });
      }
      companyIds.add(settings.companyId);
    });
  });

const EncryptedStoreSchema = z
  .object({
    algorithm: z.literal(ENCRYPTION_ALGORITHM),
    authTag: z.string().min(1).max(128),
    ciphertext: z.string().min(1).max(MAX_STORE_BYTES * 2),
    format: z.literal(STORE_FORMAT),
    iv: z.string().min(1).max(128),
    version: z.literal(STORE_VERSION),
  })
  .strict();

export type AiInsightsCompanySettingsInput = z.infer<
  typeof CompanySettingsInputSchema
>;

export type AiInsightsCompanySettings = Readonly<{
  apiKey: string | null;
  companyId: string;
  constraints: string;
  enabledForAdmins: boolean;
  enabledForOperators: boolean;
  model: string | null;
  prompt: string;
  updatedAt: string | null;
  updatedBy: string | null;
}>;

export type PublicAiInsightsCompanySettings = Readonly<
  Omit<AiInsightsCompanySettings, "apiKey"> & {
    configured: boolean;
  }
>;

export const DEFAULT_AI_INSIGHTS_COMPANY_CONFIG = Object.freeze({
  constraints: "",
  enabledForAdmins: false,
  enabledForOperators: false,
  model: null,
  prompt: "",
} satisfies Readonly<
  Pick<
    AiInsightsCompanySettings,
    | "constraints"
    | "enabledForAdmins"
    | "enabledForOperators"
    | "model"
    | "prompt"
  >
>);

export class AiInsightsCompanySettingsStorageError extends Error {
  readonly code:
    | "corrupt_store"
    | "encryption_key_unavailable"
    | "storage_unavailable";

  constructor(code: AiInsightsCompanySettingsStorageError["code"]) {
    super("O armazenamento seguro dos Insights IA está indisponível.");
    this.name = "AiInsightsCompanySettingsStorageError";
    this.code = code;
  }
}

let storeWriteQueue: Promise<void> = Promise.resolve();

/**
 * Server-internal read. The returned API key must never be serialized into an
 * HTTP response; use `toPublicAiInsightsCompanySettings` for response bodies.
 */
export async function readAiInsightsCompanySettings(
  companyId: string,
): Promise<AiInsightsCompanySettings> {
  const normalizedCompanyId = CompanyIdSchema.parse(companyId);
  await storeWriteQueue;
  const store = await readEncryptedStore();
  const stored = store.companies.find(
    (settings) => settings.companyId === normalizedCompanyId,
  );

  return stored
    ? toCompanySettings(stored)
    : defaultCompanySettings(normalizedCompanyId);
}

/**
 * Applies a partial update. `apiKey: undefined` preserves the credential and
 * `apiKey: null` explicitly removes it. The return value is always sanitized.
 */
export function saveAiInsightsCompanySettings(
  companyId: string,
  input: AiInsightsCompanySettingsInput,
  updatedBy: string,
): Promise<PublicAiInsightsCompanySettings> {
  const normalizedCompanyId = CompanyIdSchema.parse(companyId);
  const normalizedInput = CompanySettingsInputSchema.parse(input);
  const normalizedUpdatedBy = UpdatedBySchema.parse(updatedBy);

  return enqueueStoreWrite(async () => {
    const releaseLock = await acquireStoreLock();
    try {
      const store = await readEncryptedStore();
      const currentIndex = store.companies.findIndex(
        (settings) => settings.companyId === normalizedCompanyId,
      );
      const current =
        currentIndex >= 0
          ? store.companies[currentIndex]
          : defaultCompanySettings(normalizedCompanyId);
      const next = StoredCompanySettingsSchema.parse({
        apiKey:
          normalizedInput.apiKey === undefined
            ? current.apiKey
            : normalizedInput.apiKey,
        companyId: normalizedCompanyId,
        constraints:
          normalizedInput.constraints ?? current.constraints,
        enabledForAdmins:
          normalizedInput.enabledForAdmins ?? current.enabledForAdmins,
        enabledForOperators:
          normalizedInput.enabledForOperators ?? current.enabledForOperators,
        model:
          normalizedInput.model === undefined
            ? current.model
            : normalizedInput.model,
        prompt: normalizedInput.prompt ?? current.prompt,
        updatedAt: new Date().toISOString(),
        updatedBy: normalizedUpdatedBy,
      });

      const companies = [...store.companies];
      if (currentIndex >= 0) companies[currentIndex] = next;
      else companies.push(next);
      companies.sort((left, right) =>
        left.companyId.localeCompare(right.companyId),
      );

      const nextStore = PlaintextStoreSchema.parse({
        companies,
        format: STORE_FORMAT,
        version: STORE_VERSION,
      });
      const encryptionKey = await readOrCreateEncryptionKey();
      await writeEncryptedStore(nextStore, encryptionKey);

      return toPublicAiInsightsCompanySettings(toCompanySettings(next));
    } finally {
      await releaseLock();
    }
  });
}

export function toPublicAiInsightsCompanySettings(
  settings: AiInsightsCompanySettings,
): PublicAiInsightsCompanySettings {
  return {
    companyId: settings.companyId,
    configured: Boolean(settings.apiKey),
    constraints: settings.constraints,
    enabledForAdmins: settings.enabledForAdmins,
    enabledForOperators: settings.enabledForOperators,
    model: settings.model,
    prompt: settings.prompt,
    updatedAt: settings.updatedAt,
    updatedBy: settings.updatedBy,
  };
}

export function companySettingsAllowUser(
  settings: AiInsightsCompanySettings | PublicAiInsightsCompanySettings,
  user: Pick<CurrentUser, "is_master" | "role"> | null,
) {
  if (!user || !settingsHaveCredential(settings)) return false;
  const role = normalizeRole(user.role);
  if (user.is_master || role === "super-admin") return true;
  if (role === "admin") return settings.enabledForAdmins;
  if (role === "operator") return settings.enabledForOperators;
  return false;
}

function settingsHaveCredential(
  settings: AiInsightsCompanySettings | PublicAiInsightsCompanySettings,
) {
  return "configured" in settings
    ? settings.configured
    : Boolean(settings.apiKey);
}

function defaultCompanySettings(companyId: string): AiInsightsCompanySettings {
  return {
    apiKey: null,
    companyId,
    ...DEFAULT_AI_INSIGHTS_COMPANY_CONFIG,
    updatedAt: null,
    updatedBy: null,
  };
}

function toCompanySettings(
  settings: z.infer<typeof StoredCompanySettingsSchema>,
): AiInsightsCompanySettings {
  return { ...settings };
}

function emptyStore(): z.infer<typeof PlaintextStoreSchema> {
  return {
    companies: [],
    format: STORE_FORMAT,
    version: STORE_VERSION,
  };
}

async function readEncryptedStore(): Promise<
  z.infer<typeof PlaintextStoreSchema>
> {
  let fileContent: string;
  try {
    const stats = await fs.stat(dataFile);
    if (!stats.isFile() || stats.size > MAX_STORE_BYTES) {
      throw new AiInsightsCompanySettingsStorageError("corrupt_store");
    }
    fileContent = await fs.readFile(dataFile, "utf8");
    await fs.chmod(dataFile, FILE_MODE);
  } catch (error) {
    if (isFileSystemError(error, "ENOENT")) return emptyStore();
    if (error instanceof AiInsightsCompanySettingsStorageError) throw error;
    throw new AiInsightsCompanySettingsStorageError("storage_unavailable");
  }

  try {
    const envelope = EncryptedStoreSchema.parse(JSON.parse(fileContent));
    const key = await readEncryptionKey();
    const iv = decodeBase64(envelope.iv, INITIALIZATION_VECTOR_BYTES);
    const authTag = decodeBase64(
      envelope.authTag,
      AUTHENTICATION_TAG_BYTES,
    );
    const ciphertext = decodeBase64(envelope.ciphertext);
    const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAAD(encryptionAdditionalData());
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
    return PlaintextStoreSchema.parse(JSON.parse(plaintext));
  } catch (error) {
    if (error instanceof AiInsightsCompanySettingsStorageError) throw error;
    throw new AiInsightsCompanySettingsStorageError("corrupt_store");
  }
}

async function writeEncryptedStore(
  store: z.infer<typeof PlaintextStoreSchema>,
  key: Buffer,
) {
  const iv = randomBytes(INITIALIZATION_VECTOR_BYTES);
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  cipher.setAAD(encryptionAdditionalData());
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(store), "utf8"),
    cipher.final(),
  ]);
  const envelope = EncryptedStoreSchema.parse({
    algorithm: ENCRYPTION_ALGORITHM,
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    format: STORE_FORMAT,
    iv: iv.toString("base64"),
    version: STORE_VERSION,
  });

  await writeFileAtomically(dataFile, JSON.stringify(envelope));
}

async function readEncryptionKey() {
  let key: Buffer;
  try {
    key = await fs.readFile(keyFile);
    await fs.chmod(keyFile, FILE_MODE);
  } catch (error) {
    if (isFileSystemError(error, "ENOENT")) {
      throw new AiInsightsCompanySettingsStorageError(
        "encryption_key_unavailable",
      );
    }
    throw new AiInsightsCompanySettingsStorageError("storage_unavailable");
  }

  if (key.byteLength !== ENCRYPTION_KEY_BYTES) {
    throw new AiInsightsCompanySettingsStorageError(
      "encryption_key_unavailable",
    );
  }
  return key;
}

async function readOrCreateEncryptionKey() {
  try {
    return await readEncryptionKey();
  } catch (error) {
    if (
      !(error instanceof AiInsightsCompanySettingsStorageError) ||
      error.code !== "encryption_key_unavailable"
    ) {
      throw error;
    }
  }

  const key = randomBytes(ENCRYPTION_KEY_BYTES);
  await writeFileAtomically(keyFile, key);
  return key;
}

async function writeFileAtomically(
  destination: string,
  content: string | Uint8Array,
) {
  await ensureDataDirectory();
  const temporaryFile = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporaryFile, content, {
      flag: "wx",
      mode: FILE_MODE,
    });
    await fs.chmod(temporaryFile, FILE_MODE);
    await fs.rename(temporaryFile, destination);
    await fs.chmod(destination, FILE_MODE);
  } catch {
    throw new AiInsightsCompanySettingsStorageError("storage_unavailable");
  } finally {
    await fs.rm(temporaryFile, { force: true }).catch(() => undefined);
  }
}

function enqueueStoreWrite<T>(operation: () => Promise<T>) {
  const result = storeWriteQueue.then(operation, operation);
  storeWriteQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function acquireStoreLock() {
  await ensureDataDirectory();
  const deadline = Date.now() + LOCK_TIMEOUT_MS;

  while (true) {
    try {
      const handle = await fs.open(lockFile, "wx", FILE_MODE);
      await handle.chmod(FILE_MODE);
      return async () => {
        await handle.close().catch(() => undefined);
        await fs.rm(lockFile, { force: true }).catch(() => undefined);
      };
    } catch (error) {
      if (!isFileSystemError(error, "EEXIST")) {
        throw new AiInsightsCompanySettingsStorageError("storage_unavailable");
      }
      const stats = await fs.stat(lockFile).catch(() => null);
      if (stats && Date.now() - stats.mtimeMs > STALE_LOCK_MS) {
        await fs.rm(lockFile, { force: true }).catch(() => undefined);
        continue;
      }
      if (Date.now() >= deadline) {
        throw new AiInsightsCompanySettingsStorageError("storage_unavailable");
      }
      await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
    }
  }
}

async function ensureDataDirectory() {
  try {
    await fs.mkdir(dataDirectory, { mode: DIRECTORY_MODE, recursive: true });
    await fs.chmod(dataDirectory, DIRECTORY_MODE);
  } catch {
    throw new AiInsightsCompanySettingsStorageError("storage_unavailable");
  }
}

function encryptionAdditionalData() {
  return Buffer.from(`${STORE_FORMAT}:${STORE_VERSION}`, "utf8");
}

function decodeBase64(value: string, expectedBytes?: number) {
  const decoded = Buffer.from(value, "base64");
  if (
    decoded.byteLength === 0 ||
    (expectedBytes !== undefined && decoded.byteLength !== expectedBytes) ||
    decoded.toString("base64") !== value
  ) {
    throw new AiInsightsCompanySettingsStorageError("corrupt_store");
  }
  return decoded;
}

function isFileSystemError(error: unknown, code: string) {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === code
  );
}

function normalizeRole(value: string | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .replace(/^super-?admin$/, "super-admin");
}

function resolveSettingsDirectory() {
  const configured = process.env.IPXDATA_AI_SETTINGS_DIRECTORY?.trim();
  return configured
    ? path.resolve(/* turbopackIgnore: true */ process.cwd(), configured)
    : path.join(process.cwd(), ".ipxdata");
}
