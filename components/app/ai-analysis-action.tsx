"use client";

import * as React from "react";
import { BrainCircuit } from "lucide-react";
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
  reportPayloadHasAnalyzableData,
} from "@/lib/ai-analysis-snapshot";
import {
  AiInsightsApiResponseSchema,
  AiInsightsStatusResponseSchema,
  type AiInsightModule,
  type AiInsightSurface,
  type AiInsightsResponse,
} from "@/lib/ai-insights-contract";
import { ApiError, apiFetch } from "@/lib/api";
import { hasMasterAccess } from "@/lib/access";
import { purgeLegacyAiInsightsLocalSettings } from "@/lib/ai-insights-local-settings";
import {
  useEffectiveCompanyScopeId,
  useEffectiveCompanyTimeZoneResolution,
} from "@/lib/master-company-scope";
import type { ReportPayload } from "@/lib/report-export";

type AiAnalysisActionProps = {
  disabled?: boolean;
  getPayload?: () => Promise<ReportPayload> | ReportPayload;
  manager?: boolean;
  payload: ReportPayload;
  source: {
    module: AiInsightModule;
    surface: AiInsightSurface;
  };
};

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
  const [generating, setGenerating] = React.useState(false);
  const [result, setResult] = React.useState<AiInsightsResponse | null>(null);
  const [analysisError, setAnalysisError] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  const availabilityRequestSequence = React.useRef(0);
  const analysisRequestSequence = React.useRef(0);
  const analysisControllerRef = React.useRef<AbortController | null>(null);
  const resultHeadingRef = React.useRef<HTMLHeadingElement>(null);
  const inFlightRef = React.useRef(false);
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

  const refreshAvailability = React.useCallback(async () => {
    const requestId = ++availabilityRequestSequence.current;
    if (authLoading || !user || !companyScopeId) {
      setAvailable(false);
      return;
    }

    try {
      const statusPayload = await apiFetch<unknown>("/ai/insights", {
        companyScopeId,
      });
      if (availabilityRequestSequence.current !== requestId) return;
      const parsed = AiInsightsStatusResponseSchema.safeParse(statusPayload);
      setAvailable(parsed.success && parsed.data.available);
    } catch {
      if (availabilityRequestSequence.current === requestId) {
        setAvailable(false);
      }
    }
  }, [authLoading, companyScopeId, user]);

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
    setDialogOpen(false);
    setResult(null);
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
  const unavailableReason = disabled
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
    if (inFlightRef.current || unavailableReason || !available) {
      if (unavailableReason) toast.error(unavailableReason);
      return;
    }

    const requestedContext = currentContextRef.current;
    const controller = new AbortController();
    analysisControllerRef.current = controller;
    inFlightRef.current = true;
    setDialogOpen(true);
    setGenerating(true);
    setResult(null);
    setAnalysisError(null);
    setAnnouncement("Análise iniciada.");
    const requestId = ++analysisRequestSequence.current;

    try {
      const configuredPayload = getPayload ? await getPayload() : payload;
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
      const responsePayload = await apiFetch<unknown>("/ai/insights", {
        method: "POST",
        body: { snapshot },
        companyScopeId: requestedContext.companyScopeId,
        retry: false,
        signal: controller.signal,
      });
      if (analysisRequestSequence.current !== requestId) return;

      const parsed = AiInsightsApiResponseSchema.safeParse(responsePayload);
      if (!parsed.success) {
        throw new Error("A IA retornou uma análise em formato inválido.");
      }
      setResult(parsed.data.insights);
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
      setResult(null);
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
        aria-label="Gerar insights com IA para esta visão"
        title={unavailableReason || "Gerar insights com IA"}
        disabled={Boolean(unavailableReason) || generating}
        onClick={() => void generateInsights()}
      >
        <BrainCircuit className="h-4 w-4" />
        <span className="sr-only">
          {generating ? "Gerando insights" : "Gerar insights com IA"}
        </span>
      </Button>

      <Dialog open={dialogOpen} onOpenChange={changeDialogOpen}>
        <DialogContent className="max-w-6xl gap-3 p-4 sm:p-5">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BrainCircuit className="h-5 w-5 text-primary" />
              Insights da visão
            </DialogTitle>
            <DialogDescription>
              Diagnóstico e medidas práticas gerados a partir dos dados atualmente configurados na tela.
            </DialogDescription>
          </DialogHeader>
          <div className="min-w-0">
            {generating ? (
              <AiInsightsLoading />
            ) : analysisError ? (
              <AiInsightsFailure error={analysisError} onRetry={generateInsights} />
            ) : result ? (
              <AiInsightsResult headingRef={resultHeadingRef} result={result} />
            ) : null}
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
