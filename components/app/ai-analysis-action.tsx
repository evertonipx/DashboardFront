"use client";

import * as React from "react";
import { BrainCircuit, Download, Loader2, RefreshCw } from "lucide-react";
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
  AiInsightsScopedStatusResponseSchema,
  AiInsightsStatusResponseSchema,
  type AiInsightModule,
  type AiInsightSurface,
  type AiInsightsReport,
  type AiInsightsStatusResponse,
} from "@/lib/ai-insights-contract";
import { exportAiInsightsToPdf } from "@/lib/ai-insights-pdf";
import { ApiError, apiFetch } from "@/lib/api";
import { hasMasterAccess } from "@/lib/access";
import { purgeLegacyAiInsightsLocalSettings } from "@/lib/ai-insights-local-settings";
import {
  getStoredCurrentCompanyScope,
  getStoredMasterCompanyScope,
  useEffectiveCompanyScopeId,
  useEffectiveCompanyTimeZoneResolution,
} from "@/lib/master-company-scope";
import type { ReportPayload } from "@/lib/report-export";
import type { CurrentUser } from "@/lib/types";

type AiAnalysisActionProps = {
  disabled?: boolean;
  getPayload?: (signal?: AbortSignal) => Promise<ReportPayload> | ReportPayload;
  manager?: boolean;
  payload: ReportPayload;
  source: {
    module: AiInsightModule;
    surface: AiInsightSurface;
  };
};

type ScopedReportState = {
  scopeKey: string;
  value: AiInsightsReport;
};

const LEGACY_AI_MAX_ROWS_PER_DATASET = 120;
const LEGACY_AI_MAX_TOTAL_CELLS = 6_000;

export function AiAnalysisAction({
  disabled = false,
  getPayload,
  payload,
  source,
}: AiAnalysisActionProps) {
  const { loading: authLoading, user } = useAuth();
  const companyScopeId = useEffectiveCompanyScopeId(user);
  const companyTimeZoneResolution =
    useEffectiveCompanyTimeZoneResolution(user);
  const [available, setAvailable] = React.useState(false);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);
  const [serviceLimits, setServiceLimits] = React.useState<
    AiInsightsStatusResponse["limits"] | null
  >(null);
  const [reportState, setReportState] = React.useState<ScopedReportState | null>(
    null,
  );
  const [analysisError, setAnalysisError] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  const availabilityRequestSequence = React.useRef(0);
  const analysisRequestSequence = React.useRef(0);
  const analysisControllerRef = React.useRef<AbortController | null>(null);
  const resultHeadingRef = React.useRef<HTMLHeadingElement>(null);
  const exportInFlightRef = React.useRef(false);
  const inFlightRef = React.useRef(false);
  const activeScopeKey = `${user?.id ?? ""}|${companyScopeId}|${source.module}|${source.surface}`;
  const report =
    reportState?.scopeKey === activeScopeKey ? reportState.value : null;
  const companyLabel = resolveCompanyLabel(user, companyScopeId);
  const currentContextRef = React.useRef({
    companyScopeId,
    timeZone: companyTimeZoneResolution.timeZone,
    userId: user?.id ?? "",
  });

  React.useEffect(() => {
    currentContextRef.current = {
      companyScopeId,
      timeZone: companyTimeZoneResolution.timeZone,
      userId: user?.id ?? "",
    };
  }, [companyScopeId, companyTimeZoneResolution.timeZone, user?.id]);

  React.useEffect(() => {
    if (!user?.id || !companyScopeId || hasMasterAccess(user)) return;
    purgeLegacyAiInsightsLocalSettings({
      companyId: companyScopeId,
      userId: user.id,
    });
  }, [companyScopeId, user]);

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

  const refreshAvailability = React.useCallback(async () => {
    const requestId = ++availabilityRequestSequence.current;
    if (authLoading || !user || !companyScopeId) {
      setAvailable(false);
      setServiceLimits(null);
      return null;
    }

    try {
      const statusPayload = await apiFetch<unknown>(
        `/ai/insights?module=${source.module}&surface=${source.surface}`,
        {
          companyScopeId,
        },
      );
      if (availabilityRequestSequence.current !== requestId) return;
      const scoped = AiInsightsScopedStatusResponseSchema.safeParse(statusPayload);
      const legacy = scoped.success
        ? null
        : AiInsightsStatusResponseSchema.safeParse(statusPayload);
      const status = scoped.success
        ? scoped.data.status
        : legacy?.success
          ? legacy.data
          : null;
      setAvailable(Boolean(status?.available));
      setServiceLimits(status?.limits ?? null);
      if (scoped.success && scoped.data.latestReport) {
        storeNewestScopedReport(scoped.data.latestReport);
      }
      if (status) setAnalysisError(null);
      return scoped.success ? scoped.data.latestReport : null;
    } catch (error) {
      if (availabilityRequestSequence.current === requestId) {
        if (
          error instanceof ApiError &&
          [401, 403, 404].includes(error.status)
        ) {
          setAvailable(false);
          setServiceLimits(null);
          setReportState(null);
        }
      }
      return null;
    }
  }, [
    authLoading,
    companyScopeId,
    source.module,
    source.surface,
    storeNewestScopedReport,
    user,
  ]);

  React.useEffect(() => {
    setAvailable(false);
    void refreshAvailability();
    const handleFocus = () => void refreshAvailability();
    window.addEventListener("focus", handleFocus);
    return () => {
      availabilityRequestSequence.current += 1;
      window.removeEventListener("focus", handleFocus);
    };
  }, [refreshAvailability]);

  React.useEffect(() => {
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
  }, [companyScopeId, companyTimeZoneResolution.timeZone, user?.id]);

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

  const hasData = reportPayloadHasAnalyzableData(payload);
  const generationUnavailableReason = disabled
    ? "Aguarde a conclusão e certificação dos dados desta visão."
    : authLoading || !user
      ? "A sessão autenticada ainda está sendo validada."
      : !companyScopeId
        ? "Selecione uma empresa antes de analisar esta visão."
        : companyTimeZoneResolution.fallback
          ? "O fuso IANA da empresa precisa estar certificado."
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
    availabilityRequestSequence.current += 1;
    const requestId = ++analysisRequestSequence.current;

    try {
      const configuredPayload = getPayload
        ? await getPayload(controller.signal)
        : payload;
      controller.signal.throwIfAborted();
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
          "A visão configurada ainda não possui dados certificados para análise.",
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
      setAnnouncement("Análise concluída.");
      toast.success("Insights gerados para esta visão.");
      window.requestAnimationFrame(() => resultHeadingRef.current?.focus());
      void refreshAvailability();
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
        companyId: companyScopeId,
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
    void refreshAvailability();
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
        className="h-8 w-8 shrink-0"
        aria-label="Abrir IA Advisor desta visão"
        title="Abrir IA Advisor"
        onClick={openAdvisor}
      >
        <BrainCircuit className="h-4 w-4" />
        <span className="sr-only">Abrir IA Advisor</span>
      </Button>

      <Dialog open={dialogOpen} onOpenChange={changeDialogOpen}>
        <DialogContent className="max-w-6xl gap-3 p-4 sm:p-5">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BrainCircuit className="h-5 w-5 text-primary" />
              IA Advisor
            </DialogTitle>
            <DialogDescription>
              Interpretação quantitativa dos dados e medidas concretas para esta visão.
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
                <BrainCircuit className="h-8 w-8 text-primary" />
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
  if (error instanceof ApiError || error instanceof Error) {
    return error.message || fallback;
  }
  return fallback;
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
    return user.company_trade_name || user.company_name || companyScopeId;
  }
  return companyScopeId;
}

function assertServiceAcceptsSnapshot(
  snapshot: ReturnType<typeof createAiAnalysisSnapshot>,
  requestPayload: ReturnType<typeof createLegacyCompatibleAiInsightsRequest>,
  limits: AiInsightsStatusResponse["limits"] | null,
) {
  if (!limits) {
    throw new Error(
      "Os limites do serviço de IA ainda não foram certificados. Feche e abra o IA Advisor para tentar novamente.",
    );
  }
  const largestDataset = snapshot.report.datasets.reduce(
    (maximum, dataset) => Math.max(maximum, dataset.rows.length),
    0,
  );
  if (snapshot.report.datasets.length > limits.maxDatasets) {
    throw new Error(
      "A instância disponível do serviço de IA ainda não suporta todos os conjuntos desta análise. Aguarde a conclusão da atualização e tente novamente.",
    );
  }
  if (largestDataset > limits.maxRowsPerDataset) {
    throw new Error(
      `O serviço de IA disponível ainda aceita somente ${limits.maxRowsPerDataset} dias por série. Aguarde a conclusão da atualização do serviço para analisar os ${largestDataset} dias sem amostragem.`,
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
      "A instância disponível do serviço de IA ainda não suporta o volume combinado dos conjuntos desta análise. Aguarde a conclusão da atualização e tente novamente.",
    );
  }
  const bodyBytes = new TextEncoder().encode(JSON.stringify(requestPayload)).byteLength;
  if (bodyBytes > limits.maxBodyBytes) {
    throw new Error(
      "A instância disponível do serviço de IA ainda não suporta o volume diário desta análise. Aguarde a conclusão da atualização e tente novamente.",
    );
  }
}
