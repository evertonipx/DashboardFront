export const AI_INSIGHTS_LIMITS = {
  bodyBytes: 384 * 1024,
  contextItems: 24,
  datasets: 24,
  datasetColumns: 12,
  dailyDatasetRows: 2_000,
  datasetRows: 2_000,
  datasetStatistics: 16,
  metrics: 40,
  sampledDatasetRows: 120,
  totalCells: 12_000,
  totalRows: 3_920,
} as const;

export const AI_INSIGHTS_CONFIGURATION_LIMITS = {
  constraints: 24_000,
  prompt: 4_000,
} as const;
