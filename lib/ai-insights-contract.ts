import { z } from "zod";

export const AI_INSIGHTS_LIMITS = {
  bodyBytes: 200 * 1024,
  contextItems: 24,
  datasets: 16,
  datasetColumns: 12,
  datasetRows: 120,
  datasetStatistics: 16,
  metrics: 40,
  totalCells: 6_000,
  totalRows: 1_920,
} as const;

export const AI_INSIGHTS_CONFIGURATION_LIMITS = {
  constraints: 2_000,
  prompt: 4_000,
} as const;

export const DEFAULT_AI_INSIGHTS_PROMPT =
  "Analise os dados consolidados da visão, identifique evidências relevantes e proponha medidas práticas, priorizadas e mensuráveis para melhorar o resultado operacional sem inventar causas ou informações ausentes.";

export const AiInsightModuleSchema = z.enum(["counting", "occupancy"]);
export const AiInsightSurfaceSchema = z.enum([
  "live",
  "analysis",
  "reports",
]);

const identifierSchema = z.string().trim().min(1).max(128);
const shortTextSchema = z.string().trim().min(1).max(160);
const nullableShortTextSchema = z.string().trim().min(1).max(360).nullable();
const timestampSchema = z.string().datetime({ offset: true }).max(64);
const nullableCivilDateSchema = z.string().trim().min(1).max(64).nullable();

export const AiInsightCellSchema = z.union([
  z.string().max(240),
  z.number().finite(),
  z.null(),
]);

export const AiInsightsApiKeySchema = z
  .string()
  .min(20)
  .max(512)
  .regex(/^[\x21-\x7E]+$/);

export const AiInsightsModelSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);

const AiAnalysisBindingSchema = z
  .object({
    companyScopeId: identifierSchema,
    userId: identifierSchema,
    timeZone: z.string().trim().min(1).max(100),
  })
  .strict();

const AiAnalysisSourceSchema = z
  .object({
    module: AiInsightModuleSchema,
    surface: AiInsightSurfaceSchema,
    capturedAt: timestampSchema,
    dataCompleteUntil: timestampSchema.nullable(),
  })
  .strict();

const AiAnalysisPeriodSchema = z
  .object({
    label: z.string().trim().min(1).max(160),
    from: nullableCivilDateSchema,
    to: nullableCivilDateSchema,
  })
  .strict();

const AiAnalysisContextItemSchema = z
  .object({
    label: z.string().trim().min(1).max(80),
    value: AiInsightCellSchema,
  })
  .strict();

const AiAnalysisMetricSchema = z
  .object({
    label: z.string().trim().min(1).max(100),
    value: AiInsightCellSchema,
    description: z.string().trim().min(1).max(360).nullable(),
  })
  .strict();

const AiAnalysisDatasetColumnSchema = z
  .object({
    key: z.string().trim().min(1).max(80),
    label: z.string().trim().min(1).max(100),
    role: z.enum(["dimension", "measure", "context"]),
    unit: z.string().trim().min(1).max(40).nullable(),
  })
  .strict();

const AiAnalysisDatasetStatisticSchema = z
  .object({
    label: z.string().trim().min(1).max(100),
    value: AiInsightCellSchema,
    unit: z.string().trim().min(1).max(40).nullable(),
  })
  .strict();

const AiAnalysisDatasetCoverageSchema = z
  .object({
    originalRows: z.number().int().nonnegative().max(1_000_000_000),
    includedRows: z.number().int().nonnegative().max(
      AI_INSIGHTS_LIMITS.datasetRows,
    ),
    strategy: z.enum(["complete", "sampled", "aggregated", "statistics"]),
    notes: z.array(z.string().trim().min(1).max(240)).max(6),
  })
  .strict();

const AiAnalysisDatasetSchema = z
  .object({
    id: identifierSchema,
    title: shortTextSchema,
    description: nullableShortTextSchema,
    columns: z
      .array(AiAnalysisDatasetColumnSchema)
      .min(1)
      .max(AI_INSIGHTS_LIMITS.datasetColumns),
    rows: z
      .array(
        z.array(AiInsightCellSchema).max(AI_INSIGHTS_LIMITS.datasetColumns),
      )
      .max(AI_INSIGHTS_LIMITS.datasetRows),
    statistics: z
      .array(AiAnalysisDatasetStatisticSchema)
      .max(AI_INSIGHTS_LIMITS.datasetStatistics),
    coverage: AiAnalysisDatasetCoverageSchema,
  })
  .strict()
  .superRefine((dataset, context) => {
    if (dataset.coverage.includedRows !== dataset.rows.length) {
      context.addIssue({
        code: "custom",
        message: "includedRows deve corresponder às linhas enviadas.",
        path: ["coverage", "includedRows"],
      });
    }
    if (dataset.coverage.originalRows < dataset.rows.length) {
      context.addIssue({
        code: "custom",
        message: "originalRows não pode ser menor que as linhas enviadas.",
        path: ["coverage", "originalRows"],
      });
    }
    dataset.rows.forEach((row, rowIndex) => {
      if (row.length !== dataset.columns.length) {
        context.addIssue({
          code: "custom",
          message: "Cada linha deve ter uma célula para cada coluna.",
          path: ["rows", rowIndex],
        });
      }
    });
  });

const AiAnalysisReportSchema = z
  .object({
    title: shortTextSchema,
    subtitle: nullableShortTextSchema,
    period: AiAnalysisPeriodSchema,
    context: z
      .array(AiAnalysisContextItemSchema)
      .max(AI_INSIGHTS_LIMITS.contextItems),
    metrics: z
      .array(AiAnalysisMetricSchema)
      .max(AI_INSIGHTS_LIMITS.metrics),
    datasets: z
      .array(AiAnalysisDatasetSchema)
      .min(1)
      .max(AI_INSIGHTS_LIMITS.datasets),
  })
  .strict();

export const AiAnalysisSnapshotSchema = z
  .object({
    version: z.literal(1),
    binding: AiAnalysisBindingSchema,
    source: AiAnalysisSourceSchema,
    report: AiAnalysisReportSchema,
  })
  .strict()
  .superRefine((snapshot, context) => {
    let totalRows = 0;
    let totalCells = 0;
    for (const dataset of snapshot.report.datasets) {
      totalRows += dataset.rows.length;
      totalCells += dataset.rows.reduce(
        (count, row) => count + row.length,
        0,
      );
    }
    if (totalRows > AI_INSIGHTS_LIMITS.totalRows) {
      context.addIssue({
        code: "custom",
        message: `A captura excede ${AI_INSIGHTS_LIMITS.totalRows} linhas.`,
        path: ["report", "datasets"],
      });
    }
    if (totalCells > AI_INSIGHTS_LIMITS.totalCells) {
      context.addIssue({
        code: "custom",
        message: `A captura excede ${AI_INSIGHTS_LIMITS.totalCells} células.`,
        path: ["report", "datasets"],
      });
    }
  });

export const AiInsightsRequestSchema = z
  .object({
    snapshot: AiAnalysisSnapshotSchema,
  })
  .strict();

export const AiInsightsAccessRoleSchema = z.enum([
  "master",
  "admin",
  "operator",
  "unknown",
]);

export const AiInsightsAdminConfigurationSchema = z
  .object({
    companyId: identifierSchema,
    configured: z.boolean(),
    constraints: z
      .string()
      .max(AI_INSIGHTS_CONFIGURATION_LIMITS.constraints),
    credentialFingerprint: z.string().trim().min(8).max(32).nullable(),
    enabledForAdmins: z.boolean(),
    enabledForOperators: z.boolean(),
    model: AiInsightsModelSchema,
    prompt: z
      .string()
      .trim()
      .min(1)
      .max(AI_INSIGHTS_CONFIGURATION_LIMITS.prompt),
    updatedAt: timestampSchema.nullable(),
  })
  .strict();

export const AiInsightsConfigurationUpdateSchema = z
  .object({
    apiKey: AiInsightsApiKeySchema.nullable().optional(),
    constraints: z
      .string()
      .max(AI_INSIGHTS_CONFIGURATION_LIMITS.constraints),
    enabledForAdmins: z.boolean(),
    enabledForOperators: z.boolean(),
    model: AiInsightsModelSchema,
    prompt: z
      .string()
      .trim()
      .min(1)
      .max(AI_INSIGHTS_CONFIGURATION_LIMITS.prompt),
  })
  .strict();

const confidenceSchema = z.enum(["alta", "media", "baixa"]);

const AiInsightsPeriodSchema = z
  .object({
    label: z.string().max(160),
    from: z.string().max(64).nullable(),
    to: z.string().max(64).nullable(),
    timeZone: z.string().max(100),
  })
  .strict();

const AiInsightsSourceSchema = z
  .object({
    module: AiInsightModuleSchema,
    surface: AiInsightSurfaceSchema,
    reportTitle: z.string().max(160),
    capturedAt: z.string().max(64),
    dataCompleteUntil: z.string().max(64).nullable(),
  })
  .strict();

const AiInsightsDataQualitySchema = z
  .object({
    status: z.enum(["suficiente", "parcial", "insuficiente"]),
    notes: z.array(z.string().max(360)).max(8),
  })
  .strict();

const AiInsightsFindingSchema = z
  .object({
    title: z.string().max(140),
    evidence: z.string().max(600),
    interpretation: z.string().max(600),
    confidence: confidenceSchema,
    widget: z.string().max(160).nullable(),
  })
  .strict();

const AiInsightsActionSchema = z
  .object({
    priority: z.enum(["imediata", "alta", "media", "baixa"]),
    title: z.string().max(140),
    whyNow: z.string().max(500),
    steps: z.array(z.string().max(320)).min(1).max(6),
    expectedEffect: z.string().max(500),
    targetKpi: z.string().max(160).nullable(),
    baseline: z.string().max(160).nullable(),
    target: z.string().max(160).nullable(),
    measurementWindow: z.string().max(160),
    owner: z.string().max(120).nullable(),
    effort: z.enum(["alto", "medio", "baixo"]),
    confidence: confidenceSchema,
    risks: z.array(z.string().max(320)).max(5),
  })
  .strict();

export const AiInsightsResponseSchema = z
  .object({
    summary: z.string().max(1_200),
    period: AiInsightsPeriodSchema,
    source: AiInsightsSourceSchema,
    dataQuality: AiInsightsDataQualitySchema,
    findings: z.array(AiInsightsFindingSchema).max(8),
    actions: z.array(AiInsightsActionSchema).max(8),
    questions: z.array(z.string().max(360)).max(6),
    disclaimer: z.string().max(600),
  })
  .strict();

export const AiInsightsApiResponseSchema = z
  .object({
    insights: AiInsightsResponseSchema,
    meta: z
      .object({
        generatedAt: timestampSchema,
        model: z.string().trim().min(1).max(128),
        usage: z
          .object({
            inputTokens: z.number().int().nonnegative(),
            outputTokens: z.number().int().nonnegative(),
            totalTokens: z.number().int().nonnegative(),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

export const AiInsightsStatusResponseSchema = z
  .object({
    available: z.boolean(),
    configured: z.boolean(),
    role: AiInsightsAccessRoleSchema,
    model: AiInsightsModelSchema,
    allowedModels: z.array(AiInsightsModelSchema).min(1).max(16),
    configuration: AiInsightsAdminConfigurationSchema.nullable(),
    limits: z
      .object({
        maxBodyBytes: z.number().int().positive(),
        maxDatasets: z.number().int().positive(),
        maxRowsPerDataset: z.number().int().positive(),
        requestsPerMinute: z.number().int().positive(),
      })
      .strict(),
  })
  .strict()
  .superRefine((status, context) => {
    if (status.available && !status.configured) {
      context.addIssue({
        code: "custom",
        message: "A IA não pode estar disponível sem uma credencial configurada.",
        path: ["available"],
      });
    }
    if (status.configuration && status.role !== "master") {
      context.addIssue({
        code: "custom",
        message: "Somente o superadmin pode receber a configuração da empresa.",
        path: ["configuration"],
      });
    }
    if (
      status.configuration &&
      status.configuration.configured !== status.configured
    ) {
      context.addIssue({
        code: "custom",
        message: "O status da credencial diverge da configuração da empresa.",
        path: ["configured"],
      });
    }
    if (!status.allowedModels.includes(status.model)) {
      context.addIssue({
        code: "custom",
        message: "O modelo padrão precisa constar na allowlist.",
        path: ["model"],
      });
    }
    if (new Set(status.allowedModels).size !== status.allowedModels.length) {
      context.addIssue({
        code: "custom",
        message: "A allowlist de modelos não pode conter duplicatas.",
        path: ["allowedModels"],
      });
    }
  });

export type AiInsightModule = z.infer<typeof AiInsightModuleSchema>;
export type AiInsightSurface = z.infer<typeof AiInsightSurfaceSchema>;
export type AiInsightCell = z.infer<typeof AiInsightCellSchema>;
export type AiAnalysisSnapshot = z.infer<typeof AiAnalysisSnapshotSchema>;
export type AiInsightsAccessRole = z.infer<
  typeof AiInsightsAccessRoleSchema
>;
export type AiInsightsAdminConfiguration = z.infer<
  typeof AiInsightsAdminConfigurationSchema
>;
export type AiInsightsConfigurationUpdate = z.infer<
  typeof AiInsightsConfigurationUpdateSchema
>;
export type AiInsightsRequest = z.infer<typeof AiInsightsRequestSchema>;
export type AiInsightsResponse = z.infer<typeof AiInsightsResponseSchema>;
export type AiInsightsApiResponse = z.infer<
  typeof AiInsightsApiResponseSchema
>;
export type AiInsightsStatusResponse = z.infer<
  typeof AiInsightsStatusResponseSchema
>;
