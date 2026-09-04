import { z } from "zod";

import {
  AI_INSIGHTS_CONFIGURATION_LIMITS,
  AI_INSIGHTS_LIMITS,
} from "@/lib/ai-insights-limits";

export {
  AI_INSIGHTS_CONFIGURATION_LIMITS,
  AI_INSIGHTS_LIMITS,
} from "@/lib/ai-insights-limits";

export const DEFAULT_AI_INSIGHTS_PROMPT =
  "Transforme os dados apresentados no relatório em uma tese de resultado e em poucas iniciativas futuras, concretas e mensuráveis. Cruze período, dia e horário, quantifique cada oportunidade contra uma base comparável e priorize alavancas repetíveis. Não descreva gráficos nem produza uma auditoria de qualidade; conecte mudança, oportunidade, próxima ação, meta e regra de validação sem inventar causas ou eventos.";

export const AI_INSIGHTS_CANONICAL_DAILY_NOTE_PREFIX =
  "Série diária canônica:";
export const AI_INSIGHTS_GRANULARITY_NOTE_PREFIX =
  "Granularidade certificada:";

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

const AiAnalysisDatasetGranularitySchema = z.enum([
  "minute",
  "hour",
  "day",
  "week",
  "month",
  "other",
]);

const AiAnalysisDatasetCoverageSchema = z
  .object({
    canonical: z.boolean().optional(),
    granularity: AiAnalysisDatasetGranularitySchema.optional(),
    originalRows: z.number().int().nonnegative().max(1_000_000_000),
    includedRows: z.number().int().nonnegative().max(
      AI_INSIGHTS_LIMITS.datasetRows,
    ),
    omittedRows: z.number().int().nonnegative().max(1_000_000_000).optional(),
    strategy: z.enum(["complete", "sampled", "aggregated", "statistics"]),
    notes: z.array(z.string().trim().min(1).max(240)).max(6),
  })
  .strict()
  .transform((coverage) => {
    // Clients from the previous contract do not send these three fields. The
    // canonical marker travels in the already-supported notes collection so a
    // mixed deployment can still be certified by the new server.
    const canonicalFromLegacyMarker = coverage.notes.some((note) =>
      note.startsWith(AI_INSIGHTS_CANONICAL_DAILY_NOTE_PREFIX),
    );
    const canonical = coverage.canonical ?? canonicalFromLegacyMarker;
    const granularityFromLegacyMarker = coverage.notes
      .find((note) => note.startsWith(AI_INSIGHTS_GRANULARITY_NOTE_PREFIX))
      ?.slice(AI_INSIGHTS_GRANULARITY_NOTE_PREFIX.length)
      .trim()
      .replace(/\.$/, "");
    const parsedLegacyGranularity =
      AiAnalysisDatasetGranularitySchema.safeParse(granularityFromLegacyMarker);
    return {
      ...coverage,
      canonical,
      granularity:
        coverage.granularity ??
        (parsedLegacyGranularity.success
          ? parsedLegacyGranularity.data
          : canonical
            ? ("day" as const)
            : ("other" as const)),
      omittedRows:
        coverage.omittedRows ??
        Math.max(0, coverage.originalRows - coverage.includedRows),
    };
  });

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
    if (
      dataset.coverage.omittedRows !==
      dataset.coverage.originalRows - dataset.coverage.includedRows
    ) {
      context.addIssue({
        code: "custom",
        message: "omittedRows deve corresponder às linhas não enviadas.",
        path: ["coverage", "omittedRows"],
      });
    }
    if (
      dataset.coverage.strategy === "complete" &&
      dataset.coverage.omittedRows !== 0
    ) {
      context.addIssue({
        code: "custom",
        message: "Cobertura completa não pode omitir linhas.",
        path: ["coverage", "strategy"],
      });
    }
    if (
      dataset.coverage.canonical &&
      (dataset.coverage.granularity !== "day" ||
        dataset.coverage.strategy !== "complete" ||
        dataset.coverage.omittedRows !== 0)
    ) {
      context.addIssue({
        code: "custom",
        message: "A série canônica deve conter todos os dias sem omissões.",
        path: ["coverage", "canonical"],
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
    let canonicalDatasets = 0;
    for (const dataset of snapshot.report.datasets) {
      totalRows += dataset.rows.length;
      totalCells += dataset.rows.reduce(
        (count, row) => count + row.length,
        0,
      );
      if (dataset.coverage.canonical) {
        canonicalDatasets += 1;
        validateCanonicalDatasetAgainstPeriod(snapshot, dataset, context);
      }
    }
    if (canonicalDatasets > 1) {
      context.addIssue({
        code: "custom",
        message: "A captura pode conter somente uma série diária canônica.",
        path: ["report", "datasets"],
      });
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

function validateCanonicalDatasetAgainstPeriod(
  snapshot: { report: z.infer<typeof AiAnalysisReportSchema> },
  dataset: z.infer<typeof AiAnalysisDatasetSchema>,
  context: z.RefinementCtx,
) {
  const fromOrdinal = civilDateOrdinal(snapshot.report.period.from);
  const toOrdinal = civilDateOrdinal(snapshot.report.period.to);
  const datasetIndex = snapshot.report.datasets.indexOf(dataset);
  const path = ["report", "datasets", datasetIndex] as const;
  if (
    fromOrdinal === null ||
    toOrdinal === null ||
    fromOrdinal > toOrdinal ||
    dataset.columns[0]?.role !== "dimension"
  ) {
    context.addIssue({
      code: "custom",
      message: "O período da análise está inconsistente.",
      path: [...path, "coverage", "canonical"],
    });
    return;
  }

  const expectedRows = toOrdinal - fromOrdinal + 1;
  if (dataset.rows.length !== expectedRows) {
    context.addIssue({
      code: "custom",
      message: "A série canônica deve conter exatamente uma linha por dia do período.",
      path: [...path, "rows"],
    });
    return;
  }

  dataset.rows.forEach((row, rowIndex) => {
    if (civilDateOrdinal(row[0]) !== fromOrdinal + rowIndex) {
      context.addIssue({
        code: "custom",
        message: "As datas da série canônica devem ser ISO, únicas, contíguas e ordenadas.",
        path: [...path, "rows", rowIndex, 0],
      });
    }
  });
}

function civilDateOrdinal(value: unknown) {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1900 || year > 2200) return null;
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return Math.floor(timestamp / 86_400_000);
}

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

const AiInsightsOutcomeSchema = z
  .object({
    summary: z.string().max(1_200),
    findings: z.array(AiInsightsFindingSchema).max(3),
    actions: z.array(AiInsightsActionSchema).max(3),
  })
  .strict();

export const AiInsightsModelOutputSchema = AiInsightsOutcomeSchema;

export const AiInsightsResponseSchema = AiInsightsOutcomeSchema.extend({
  dataQuality: AiInsightsDataQualitySchema,
  questions: z.array(z.string().max(360)).max(3),
  period: AiInsightsPeriodSchema,
  source: AiInsightsSourceSchema,
  disclaimer: z.string().max(600),
}).strict();

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

const AiInsightsCompatibleResponseSchema = z
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

/**
 * Accepts the response limits used by the previous deployment and normalizes
 * them to the current concise report. This is client-side rolling-deploy
 * compatibility; the current server still generates at most three items.
 */
export const AiInsightsCompatibleApiResponseSchema = z
  .object({
    insights: AiInsightsCompatibleResponseSchema,
    meta: AiInsightsApiResponseSchema.shape.meta,
  })
  .strict()
  .transform((response) =>
    AiInsightsApiResponseSchema.parse({
      ...response,
      insights: {
        ...response.insights,
        actions: response.insights.actions.slice(0, 3),
        findings: response.insights.findings.slice(0, 3),
        questions: response.insights.questions.slice(0, 3),
      },
    }),
  );

export const AiInsightsReportSchema = z
  .object({
    id: identifierSchema,
    insights: AiInsightsResponseSchema,
    meta: AiInsightsApiResponseSchema.shape.meta,
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

export const AiInsightsScopedStatusResponseSchema = z
  .object({
    latestReport: AiInsightsReportSchema.nullable(),
    status: AiInsightsStatusResponseSchema,
  })
  .strict()
  .superRefine((payload, context) => {
    if (payload.latestReport && !payload.status.available) {
      context.addIssue({
        code: "custom",
        message: "A última análise só pode ser entregue a um perfil habilitado.",
        path: ["latestReport"],
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
export type AiInsightsModelOutput = z.infer<
  typeof AiInsightsModelOutputSchema
>;
export type AiInsightsResponse = z.infer<typeof AiInsightsResponseSchema>;
export type AiInsightsApiResponse = z.infer<
  typeof AiInsightsApiResponseSchema
>;
export type AiInsightsReport = z.infer<typeof AiInsightsReportSchema>;
export type AiInsightsStatusResponse = z.infer<
  typeof AiInsightsStatusResponseSchema
>;
export type AiInsightsScopedStatusResponse = z.infer<
  typeof AiInsightsScopedStatusResponseSchema
>;
