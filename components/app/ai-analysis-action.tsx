"use client";

import * as React from "react";
import { BrainCog, Download, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import {
  AiInsightsFailure,
  AiInsightsLoading,
  AiInsightsResult,
} from "@/components/app/ai-insights-result";
import { useAuth } from "@/components/app/auth-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createAiAnalysisSnapshot,
  createLegacyCompatibleAiInsightsRequest,
  reportPayloadHasAnalyzableData,
} from "@/lib/ai-analysis-snapshot";
import {
  AiInsightsCompatibleApiResponseSchema,
  AiInsightsReportSchema,
  type AiInsightModule,
  type AiInsightSurface,
  type AiInsightsReport,
  type AiInsightsStatusResponse,
} from "@/lib/ai-insights-contract";
import { exportAiInsightsToPdf } from "@/lib/ai-insights-pdf";
import { apiFetch } from "@/lib/api";
import { userFacingErrorMessage } from "@/lib/user-facing-error";
import { hasMasterAccess } from "@/lib/access";
import {
  createAiInsightsAvailabilityScopeKey,
  storeAiInsightsAvailabilityReport,
  type AiInsightsAvailabilitySnapshot,
} from "@/lib/ai-insights-availability";
import {
  getStoredCurrentCompanyScope,
  getStoredMasterCompanyScope,
  useEffectiveCompanyScopeId,
  useEffectiveCompanyTimeZoneResolution,
} from "@/lib/master-company-scope";
import type { ReportPayload } from "@/lib/report-export";
import type { CurrentUser } from "@/lib/types";

export type AiAnalysisActionProps = {
  disabled?: boolean;
  getPayload?: (signal?: AbortSignal) => Promise<ReportPayload> | ReportPayload;
  manager?: boolean;
  payload?: ReportPayload;
  source: {
    module: AiInsightModule;
    surface: AiInsightSurface;
  };
};

export type AiAnalysisActionRuntimeProps = AiAnalysisActionProps & {
  availability: AiInsightsAvailabilitySnapshot;
  initialDialogOpen?: boolean;
};

type ScopedReportState = {
  scopeKey: string;
  value: AiInsightsReport;
};

const LEGACY_AI_MAX_ROWS_PER_DATASET = 120;
const LEGACY_AI_MAX_TOTAL_CELLS = 6_000;
export function AiAnalysisAction({
  availability,
  disabled = false,
  getPayload,
  initialDialogOpen = false,
  payload,
  source,
}: AiAnalysisActionRuntimeProps) {
  const { loading: authLoading, user } = useAuth();
  const companyScopeId = useEffectiveCompanyScopeId(user);
  const companyTimeZoneResolution =
    useEffectiveCompanyTimeZoneResolution(user);
  const userId = user?.id ?? "";
  const activeScopeKey = createAiInsightsAvailabilityScopeKey({
    companyScopeId,
    module: source.module,
    surface: source.surface,
    userId,
  });
  const available =
    availability.scopeKey === activeScopeKey && availability.status.available;
  const serviceLimits = available ? availability.status.limits : null;
  const initialReport = React.useMemo(() => {
    if (availability.scopeKey !== activeScopeKey) return null;
    const parsed = AiInsightsReportSchema.safeParse(availability.latestReport);
    return parsed.success ? parsed.data : null;
  }, [activeScopeKey, availability]);
  const [dialogOpen, setDialogOpen] = React.useState(initialDialogOpen);
  const [exporting, setExporting] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);
  const [reportState, setReportState] = React.useState<ScopedReportState | null>(
    () =>
      initialReport
        ? { scopeKey: activeScopeKey, value: initialReport }
        : null,
  );
  const [analysisError, setAnalysisError] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  const analysisRequestSequence = React.useRef(0);
  const analysisControllerRef = React.useRef<AbortController | null>(null);
  const resultHeadingRef = React.useRef<HTMLHeadingElement>(null);
  const exportInFlightRef = React.useRef(false);
  const inFlightRef = React.useRef(false);
  const report =
    reportState?.scopeKey === activeScopeKey ? reportState.value : null;
  const companyLabel = resolveCompanyLabel(user, companyScopeId);
  const analysisContextKey = JSON.stringify([
    userId,
    companyScopeId,
    companyTimeZoneResolution.timeZone,
  ]);
  const previousAnalysisContextKeyRef = React.useRef(analysisContextKey);
  const currentContextRef = React.useRef({
    companyScopeId,
    timeZone: companyTimeZoneResolution.timeZone,
    userId,
  });

  React.useEffect(() => {
    currentContextRef.current = {
      companyScopeId,
      timeZone: companyTimeZoneResolution.timeZone,
      userId,
    };
  }, [companyScopeId, companyTimeZoneResolution.timeZone, userId]);

  const storeNewestScopedReport = React.useCallback(
    (candidate: AiInsightsReport) => {
      setReportState((current) => {
        if (
          current?.scopeKey === activeScopeKey &&
          reportGeneratedAt(current.value) > reportGeneratedAt(candidate)
        ) {
          return current;
        }
        return { scopeKey: activeScopeKey, value: candidate };
      });
    },
    [activeScopeKey],
  );

  React.useEffect(() => {
    if (initialReport) storeNewestScopedReport(initialReport);
  }, [initialReport, storeNewestScopedReport]);

  React.useEffect(() => {
    if (previousAnalysisContextKeyRef.current === analysisContextKey) return;
    previousAnalysisContextKeyRef.current = analysisContextKey;
    analysisRequestSequence.current += 1;
    abortAnalysis(
      analysisControllerRef.current,
      "O usuário, a empresa ou o fuso da análise mudou.",
    );
    analysisControllerRef.current = null;
    inFlightRef.current = false;
    setGenerating(false);
    setExporting(false);
    exportInFlightRef.current = false;
    setDialogOpen(false);
    setReportState(null);
    setAnalysisError(null);
  }, [analysisContextKey]);

  React.useEffect(
    () => () => {
      analysisRequestSequence.current += 1;
      abortAnalysis(
        analysisControllerRef.current,
        "A visualização dos insights foi fechada.",
      );
      analysisControllerRef.current = null;
      inFlightRef.current = false;
    },
    [],
  );

  const hasData = payload
    ? reportPayloadHasAnalyzableData(payload)
    : Boolean(getPayload);
  const generationUnavailableReason = disabled
    ? "Aguarde a conclusão do carregamento desta visão."
    : authLoading || !user
      ? "Validando seu acesso."
      : !companyScopeId
        ? "Selecione uma empresa antes de analisar esta visão."
        : companyTimeZoneResolution.fallback
          ? "O fuso horário da empresa precisa estar configurado."
          : !hasData
            ? "A visão configurada ainda não possui dados para análise."
            : "";

  async function generateInsights() {
    if (inFlightRef.current || generationUnavailableReason || !available) {
      if (generationUnavailableReason) toast.error(generationUnavailableReason);
      return;
    }

    const requestedContext = currentContextRef.current;
    const controller = new AbortController();
    analysisControllerRef.current = controller;
    inFlightRef.current = true;
    setDialogOpen(true);
    setGenerating(true);
    setAnalysisError(null);
    setAnnouncement("Análise iniciada.");
    const requestId = ++analysisRequestSequence.current;

    try {
      const configuredPayload = getPayload
        ? await getPayload(controller.signal)
        : payload;
      controller.signal.throwIfAborted();
      if (!configuredPayload) {
        throw new Error(
          "A visão configurada ainda não possui dados disponíveis para análise.",
        );
      }
      const activeContext = currentContextRef.current;
      if (
        requestedContext.userId !== activeContext.userId ||
        requestedContext.companyScopeId !== activeContext.companyScopeId ||
        requestedContext.timeZone !== activeContext.timeZone
      ) {
        throw new Error(
          "O usuário, a empresa ou o fuso mudou durante a captura. Tente novamente.",
        );
      }
      if (!reportPayloadHasAnalyzableData(configuredPayload)) {
        throw new Error(
          "A visão configurada ainda não possui dados disponíveis para análise.",
        );
      }

      const snapshot = createAiAnalysisSnapshot({
        companyScopeId: requestedContext.companyScopeId,
        module: source.module,
        payload: configuredPayload,
        surface: source.surface,
        timeZone: requestedContext.timeZone,
        userId: requestedContext.userId,
      });
      const requestPayload = createLegacyCompatibleAiInsightsRequest(snapshot);
      assertServiceAcceptsSnapshot(snapshot, requestPayload, serviceLimits);
      const responsePayload = await apiFetch<unknown>("/ai/insights", {
        method: "POST",
        body: requestPayload,
        companyScopeId: requestedContext.companyScopeId,
        retry: false,
        signal: controller.signal,
      });
      if (analysisRequestSequence.current !== requestId) return;

      const reportResponse = AiInsightsReportSchema.safeParse(responsePayload);
      const legacyResponse = reportResponse.success
        ? null
        : AiInsightsCompatibleApiResponseSchema.safeParse(responsePayload);
      let generatedReport: AiInsightsReport;
      if (reportResponse.success) {
        generatedReport = reportResponse.data;
      } else if (legacyResponse?.success) {
        generatedReport = AiInsightsReportSchema.parse({
          id: `generated-${legacyResponse.data.meta.generatedAt}`,
          ...legacyResponse.data,
        });
      } else {
        throw new Error("A IA retornou uma análise em formato inválido.");
      }
      storeNewestScopedReport(generatedReport);
      storeAiInsightsAvailabilityReport(activeScopeKey, generatedReport);
      setAnnouncement("Análise concluída.");
      toast.success("Insights gerados para esta visão.");
      window.requestAnimationFrame(() => resultHeadingRef.current?.focus());
    } catch (error) {
      if (
        analysisRequestSequence.current !== requestId ||
        isAbortError(error, controller.signal)
      ) {
        return;
      }
      setAnalysisError(toUiError(error, "Não foi possível gerar os insights."));
      setAnnouncement("Análise não concluída.");
    } finally {
      if (analysisRequestSequence.current === requestId) {
        analysisControllerRef.current = null;
        inFlightRef.current = false;
        setGenerating(false);
      }
    }
  }

  async function exportReport() {
    if (!report || exportInFlightRef.current) return;
    exportInFlightRef.current = true;
    setExporting(true);
    setAnnouncement("Exportação do relatório iniciada.");
    try {
      const exported = await exportAiInsightsToPdf(report, {
        companyLabel,
      });
      setAnnouncement("Relatório exportado em PDF.");
      toast.success(`Relatório exportado: ${exported.filename}`);
    } catch (error) {
      setAnnouncement("Não foi possível exportar o relatório.");
      toast.error(toUiError(error, "Não foi possível exportar o PDF."));
    } finally {
      exportInFlightRef.current = false;
      setExporting(false);
    }
  }

  function changeDialogOpen(nextOpen: boolean) {
    if (!nextOpen && generating) {
      analysisRequestSequence.current += 1;
      abortAnalysis(
        analysisControllerRef.current,
        "A visualização dos insights foi fechada.",
      );
      analysisControllerRef.current = null;
      inFlightRef.current = false;
      setGenerating(false);
    }
    setDialogOpen(nextOpen);
  }

  function openAdvisor() {
    setDialogOpen(true);
    setAnalysisError(null);
  }

  if (!available) return null;

  return (
    <>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-8 w-8 shrink-0 border-primary/25 bg-primary/[0.045] text-primary shadow-sm transition-colors hover:border-primary/45 hover:bg-primary/10 hover:text-primary focus-visible:ring-primary/40"
        aria-label="Abrir IA Advisor desta visão"
        aria-haspopup="dialog"
        aria-expanded={dialogOpen}
        title="Abrir IA Advisor"
        onClick={openAdvisor}
      >
        <BrainCog className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
      </Button>

      <Dialog open={dialogOpen} onOpenChange={changeDialogOpen}>
        <DialogContent className="max-w-6xl gap-3 p-4 sm:p-5">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary ring-1 ring-primary/15">
                <BrainCog className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
              </span>
              IA Advisor
            </DialogTitle>
            <DialogDescription>
              Direção executiva e ações mensuráveis para esta visão.
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-w-0 flex-col gap-2 rounded-md border border-border bg-muted/20 p-2.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="min-w-0 text-xs leading-5 text-muted-foreground">
              {report
                ? `Última análise: ${formatLatestReportDateTime(report)}`
                : "Nenhuma análise foi gerada para este módulo e esta tela."}
            </p>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                disabled={generating || Boolean(generationUnavailableReason)}
                aria-describedby={
                  generationUnavailableReason
                    ? "ai-advisor-generation-unavailable"
                    : undefined
                }
                title={generationUnavailableReason || "Gerar um novo relatório"}
                onClick={() => void generateInsights()}
              >
                {generating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {generating ? "Gerando relatório" : "Gerar novo relatório"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!report || exporting}
                onClick={() => void exportReport()}
              >
                {exporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {exporting ? "Exportando" : "Exportar PDF"}
              </Button>
            </div>
          </div>
          {generationUnavailableReason ? (
            <p
              id="ai-advisor-generation-unavailable"
              className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-900 dark:text-amber-200"
              role="status"
            >
              {generationUnavailableReason} {report
                ? "O último relatório continua disponível para consulta e exportação."
                : "A geração será liberada assim que essa condição for resolvida."}
            </p>
          ) : null}
          <div className="min-w-0">
            {generating && !report ? (
              <AiInsightsLoading />
            ) : analysisError && !report ? (
              <AiInsightsFailure error={analysisError} onRetry={generateInsights} />
            ) : report ? (
              <div className="space-y-3">
                {generating ? (
                  <div
                    className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/[0.04] px-3 py-2 text-xs font-medium text-primary"
                    role="status"
                  >
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Gerando uma nova leitura; o último relatório permanece disponível.
                  </div>
                ) : null}
                {analysisError ? (
                  <div
                    className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                    role="alert"
                  >
                    {analysisError} O relatório anterior foi preservado.
                  </div>
                ) : null}
                <AiInsightsResult
                  headingRef={resultHeadingRef}
                  result={report.insights}
                />
              </div>
            ) : (
              <div className="flex min-h-52 flex-col items-center justify-center rounded-md border border-dashed border-border p-6 text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
                  <BrainCog className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                </span>
                <h3 className="mt-3 text-sm font-semibold text-foreground">
                  Nenhum relatório disponível
                </h3>
                <p className="mt-1 max-w-lg text-sm leading-6 text-muted-foreground">
                  Gere a primeira análise para registrar a conclusão, as evidências e o plano de ação desta visão.
                </p>
                <Button
                  type="button"
                  className="mt-4"
                  disabled={Boolean(generationUnavailableReason)}
                  aria-describedby={
                    generationUnavailableReason
                      ? "ai-advisor-generation-unavailable"
                      : undefined
                  }
                  title={generationUnavailableReason || undefined}
                  onClick={() => void generateInsights()}
                >
                  <RefreshCw className="h-4 w-4" />
                  Gerar primeiro relatório
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function toUiError(error: unknown, fallback: string) {
  return userFacingErrorMessage(error, fallback);
}

function abortAnalysis(controller: AbortController | null, message: string) {
  if (!controller || controller.signal.aborted) return;
  controller.abort(new DOMException(message, "AbortError"));
}

function isAbortError(error: unknown, signal: AbortSignal) {
  return (
    signal.aborted ||
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function formatLatestReportDateTime(report: AiInsightsReport) {
  const generatedAt = new Date(report.meta.generatedAt);
  if (!Number.isFinite(generatedAt.getTime())) return report.meta.generatedAt;
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: report.insights.period.timeZone,
    }).format(generatedAt);
  } catch {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(generatedAt);
  }
}

function reportGeneratedAt(report: AiInsightsReport) {
  const value = Date.parse(report.meta.generatedAt);
  return Number.isFinite(value) ? value : 0;
}

function resolveCompanyLabel(
  user: CurrentUser | null,
  companyScopeId: string,
) {
  const storedScope = hasMasterAccess(user)
    ? getStoredMasterCompanyScope()
    : getStoredCurrentCompanyScope();
  if (storedScope?.id === companyScopeId) {
    return storedScope.trade_name || storedScope.name;
  }
  if (user?.company?.id === companyScopeId) {
    return user.company.trade_name || user.company.name;
  }
  if (user?.company_id === companyScopeId) {
    return user.company_trade_name || user.company_name || "Empresa selecionada";
  }
  return "Empresa selecionada";
}

function assertServiceAcceptsSnapshot(
  snapshot: ReturnType<typeof createAiAnalysisSnapshot>,
  requestPayload: ReturnType<typeof createLegacyCompatibleAiInsightsRequest>,
  limits: AiInsightsStatusResponse["limits"] | null,
) {
  if (!limits) {
    throw new Error(
      "A análise ainda está sendo preparada. Feche e abra o IA Advisor para tentar novamente.",
    );
  }
  const largestDataset = snapshot.report.datasets.reduce(
    (maximum, dataset) => Math.max(maximum, dataset.rows.length),
    0,
  );
  if (snapshot.report.datasets.length > limits.maxDatasets) {
    throw new Error(
      "Esta visão reúne mais informações do que a análise comporta no momento. Reduza o período ou a quantidade de cenários e tente novamente.",
    );
  }
  if (largestDataset > limits.maxRowsPerDataset) {
    throw new Error(
      `Esta análise comporta até ${limits.maxRowsPerDataset} dias por série. Reduza o período de ${largestDataset} dias e tente novamente.`,
    );
  }
  const totalCells = snapshot.report.datasets.reduce(
    (total, dataset) =>
      total + dataset.rows.reduce((rows, row) => rows + row.length, 0),
    0,
  );
  if (
    limits.maxRowsPerDataset <= LEGACY_AI_MAX_ROWS_PER_DATASET &&
    totalCells > LEGACY_AI_MAX_TOTAL_CELLS
  ) {
    throw new Error(
      "Esta visão reúne informações demais para uma única análise. Reduza o período ou a quantidade de cenários e tente novamente.",
    );
  }
  const bodyBytes = new TextEncoder().encode(JSON.stringify(requestPayload)).byteLength;
  if (bodyBytes > limits.maxBodyBytes) {
    throw new Error(
      "O período selecionado reúne informações demais para uma única análise. Reduza o intervalo e tente novamente.",
    );
  }
}
