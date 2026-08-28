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
  AiInsightsReportSchema,
  type AiInsightModule,
  type AiInsightSurface,
  type AiInsightsReport,
} from "@/lib/ai-insights-contract";

const STORE_FORMAT = "ipxdata-ai-insights-latest-reports";
const STORE_VERSION = 1;
const MAX_REPORTS_PER_COMPANY = 6;
const MAX_PLAINTEXT_BYTES = 8 * 1024 * 1024;
const MAX_ENCRYPTED_FILE_BYTES = 12 * 1024 * 1024;
const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const ENCRYPTION_KEY_BYTES = 32;
const INITIALIZATION_VECTOR_BYTES = 12;
const AUTHENTICATION_TAG_BYTES = 16;
const FILE_MODE = 0o600;
const DIRECTORY_MODE = 0o700;
const LOCK_TIMEOUT_MS = 5_000;
const STALE_LOCK_MS = 30_000;
const LOCK_RETRY_MS = 50;

const dataDirectory = resolveReportsDirectory();
const dataFile = path.join(dataDirectory, "ai-insights-reports.v1.json");
const keyFile = path.join(dataDirectory, "ai-insights-reports.v1.key");
const lockFile = path.join(dataDirectory, "ai-insights-reports.v1.lock");

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

const StoredCompanyReportsSchema = z
  .object({
    companyId: CompanyIdSchema,
    reports: z.array(AiInsightsReportSchema).max(MAX_REPORTS_PER_COMPANY),
  })
  .strict()
  .superRefine((company, context) => {
    const scopes = new Set<string>();
    company.reports.forEach((report, index) => {
      const scope = reportScopeKey(
        report.insights.source.module,
        report.insights.source.surface,
      );
      if (scopes.has(scope)) {
        context.addIssue({
          code: "custom",
          message: "Escopo duplicado no cofre de relatórios IA.",
          path: ["reports", index],
        });
      }
      scopes.add(scope);
    });
  });

const PlaintextStoreSchema = z
  .object({
    companies: z.array(StoredCompanyReportsSchema).max(10_000),
    format: z.literal(STORE_FORMAT),
    version: z.literal(STORE_VERSION),
  })
  .strict()
  .superRefine((store, context) => {
    const companyIds = new Set<string>();
    store.companies.forEach((company, index) => {
      if (companyIds.has(company.companyId)) {
        context.addIssue({
          code: "custom",
          message: "Empresa duplicada no cofre de relatórios IA.",
          path: ["companies", index, "companyId"],
        });
      }
      companyIds.add(company.companyId);
    });
  });

const EncryptedStoreSchema = z
  .object({
    algorithm: z.literal(ENCRYPTION_ALGORITHM),
    authTag: z.string().min(1).max(128),
    ciphertext: z.string().min(1).max(MAX_ENCRYPTED_FILE_BYTES * 2),
    format: z.literal(STORE_FORMAT),
    iv: z.string().min(1).max(128),
    version: z.literal(STORE_VERSION),
  })
  .strict();

export class AiInsightsReportStorageError extends Error {
  readonly code:
    | "corrupt_report_store"
    | "report_encryption_key_unavailable"
    | "report_storage_unavailable";

  constructor(code: AiInsightsReportStorageError["code"]) {
    super("O armazenamento seguro dos relatórios do IA Advisor está indisponível.");
    this.name = "AiInsightsReportStorageError";
    this.code = code;
  }
}

let storeWriteQueue: Promise<void> = Promise.resolve();

export async function readLatestAiInsightsReport(
  companyId: string,
  module: AiInsightModule,
  surface: AiInsightSurface,
) {
  const normalizedCompanyId = CompanyIdSchema.parse(companyId);
  await storeWriteQueue;
  const store = await readEncryptedStore();
  const company = store.companies.find(
    (candidate) => candidate.companyId === normalizedCompanyId,
  );
  const report = company?.reports.find(
    (candidate) =>
      candidate.insights.source.module === module &&
      candidate.insights.source.surface === surface,
  );
  return report ? AiInsightsReportSchema.parse(report) : null;
}

export function saveLatestAiInsightsReport(
  companyId: string,
  report: AiInsightsReport,
): Promise<AiInsightsReport> {
  const normalizedCompanyId = CompanyIdSchema.parse(companyId);
  const normalizedReport = AiInsightsReportSchema.parse(report);

  return enqueueStoreWrite(async () => {
    const releaseLock = await acquireStoreLock();
    try {
      const store = await readEncryptedStore();
      const currentIndex = store.companies.findIndex(
        (company) => company.companyId === normalizedCompanyId,
      );
      const currentReports =
        currentIndex >= 0 ? store.companies[currentIndex].reports : [];
      const source = normalizedReport.insights.source;
      const currentScopedReport = currentReports.find(
        (candidate) =>
          candidate.insights.source.module === source.module &&
          candidate.insights.source.surface === source.surface,
      );
      if (
        currentScopedReport &&
        reportGeneratedAt(currentScopedReport) >= reportGeneratedAt(normalizedReport)
      ) {
        return AiInsightsReportSchema.parse(currentScopedReport);
      }
      const reports = currentReports.filter(
        (candidate) =>
          candidate.insights.source.module !== source.module ||
          candidate.insights.source.surface !== source.surface,
      );
      reports.push(normalizedReport);
      reports.sort((left, right) =>
        reportScopeKey(
          left.insights.source.module,
          left.insights.source.surface,
        ).localeCompare(
          reportScopeKey(
            right.insights.source.module,
            right.insights.source.surface,
          ),
        ),
      );

      const companies = [...store.companies];
      const nextCompany = StoredCompanyReportsSchema.parse({
        companyId: normalizedCompanyId,
        reports,
      });
      if (currentIndex >= 0) companies[currentIndex] = nextCompany;
      else companies.push(nextCompany);
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
      return AiInsightsReportSchema.parse(normalizedReport);
    } finally {
      await releaseLock();
    }
  });
}

function emptyStore(): z.infer<typeof PlaintextStoreSchema> {
  return { companies: [], format: STORE_FORMAT, version: STORE_VERSION };
}

async function readEncryptedStore(): Promise<
  z.infer<typeof PlaintextStoreSchema>
> {
  let fileContent: string;
  try {
    const stats = await fs.stat(dataFile);
    if (!stats.isFile() || stats.size > MAX_ENCRYPTED_FILE_BYTES) {
      throw new AiInsightsReportStorageError("corrupt_report_store");
    }
    fileContent = await fs.readFile(dataFile, "utf8");
    await fs.chmod(dataFile, FILE_MODE);
  } catch (error) {
    if (isFileSystemError(error, "ENOENT")) return emptyStore();
    if (error instanceof AiInsightsReportStorageError) throw error;
    throw new AiInsightsReportStorageError("report_storage_unavailable");
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
    if (Buffer.byteLength(plaintext, "utf8") > MAX_PLAINTEXT_BYTES) {
      throw new AiInsightsReportStorageError("corrupt_report_store");
    }
    return PlaintextStoreSchema.parse(JSON.parse(plaintext));
  } catch (error) {
    if (error instanceof AiInsightsReportStorageError) throw error;
    throw new AiInsightsReportStorageError("corrupt_report_store");
  }
}

async function writeEncryptedStore(
  store: z.infer<typeof PlaintextStoreSchema>,
  key: Buffer,
) {
  const plaintext = JSON.stringify(store);
  if (Buffer.byteLength(plaintext, "utf8") > MAX_PLAINTEXT_BYTES) {
    throw new AiInsightsReportStorageError("report_storage_unavailable");
  }
  const iv = randomBytes(INITIALIZATION_VECTOR_BYTES);
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  cipher.setAAD(encryptionAdditionalData());
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
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
  const serializedEnvelope = JSON.stringify(envelope);
  if (Buffer.byteLength(serializedEnvelope, "utf8") > MAX_ENCRYPTED_FILE_BYTES) {
    throw new AiInsightsReportStorageError("report_storage_unavailable");
  }
  await writeFileAtomically(dataFile, serializedEnvelope);
}

async function readEncryptionKey() {
  let key: Buffer;
  try {
    key = await fs.readFile(keyFile);
    await fs.chmod(keyFile, FILE_MODE);
  } catch (error) {
    if (isFileSystemError(error, "ENOENT")) {
      throw new AiInsightsReportStorageError(
        "report_encryption_key_unavailable",
      );
    }
    throw new AiInsightsReportStorageError("report_storage_unavailable");
  }
  if (key.byteLength !== ENCRYPTION_KEY_BYTES) {
    throw new AiInsightsReportStorageError(
      "report_encryption_key_unavailable",
    );
  }
  return key;
}

async function readOrCreateEncryptionKey() {
  try {
    return await readEncryptionKey();
  } catch (error) {
    if (
      !(error instanceof AiInsightsReportStorageError) ||
      error.code !== "report_encryption_key_unavailable"
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
    throw new AiInsightsReportStorageError("report_storage_unavailable");
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
        throw new AiInsightsReportStorageError("report_storage_unavailable");
      }
      const stats = await fs.stat(lockFile).catch(() => null);
      if (stats && Date.now() - stats.mtimeMs > STALE_LOCK_MS) {
        await fs.rm(lockFile, { force: true }).catch(() => undefined);
        continue;
      }
      if (Date.now() >= deadline) {
        throw new AiInsightsReportStorageError("report_storage_unavailable");
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
    throw new AiInsightsReportStorageError("report_storage_unavailable");
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
    throw new AiInsightsReportStorageError("corrupt_report_store");
  }
  return decoded;
}

function reportScopeKey(module: AiInsightModule, surface: AiInsightSurface) {
  return `${module}:${surface}`;
}

function reportGeneratedAt(report: AiInsightsReport) {
  return Date.parse(report.meta.generatedAt);
}

function isFileSystemError(error: unknown, code: string) {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === code
  );
}

function resolveReportsDirectory() {
  const configured = process.env.IPXDATA_AI_SETTINGS_DIRECTORY?.trim();
  return configured
    ? path.resolve(/* turbopackIgnore: true */ process.cwd(), configured)
    : path.join(process.cwd(), ".ipxdata");
}
