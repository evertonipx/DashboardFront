"use client";

import * as React from "react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CircleGauge,
  Lightbulb,
  Loader2,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { AiInsightsResponse } from "@/lib/ai-insights-contract";
import { cn } from "@/lib/utils";

const PRIORITY_ORDER = {
  imediata: 0,
  alta: 1,
  media: 2,
  baixa: 3,
} as const;

export function AiInsightsLoading() {
  return (
    <div className="space-y-4" aria-label="Gerando análise" aria-busy="true">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cruzando tendências e evidências
          </div>
          <CardDescription>
            A IA está estruturando um plano mensurável a partir desta visão.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-[92%]" />
          <Skeleton className="h-4 w-[78%]" />
        </CardContent>
      </Card>
      <div className="grid gap-3 md:grid-cols-2">
        {[0, 1, 2, 3].map((item) => (
          <Card key={item}>
            <CardContent className="space-y-3 p-4">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-8 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function AiInsightsFailure({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => Promise<void>;
}) {
  return (
    <Card className="border-destructive/30 shadow-none">
      <CardContent className="flex min-h-[240px] flex-col items-center justify-center p-6 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-md bg-destructive/10 text-destructive">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <h3 className="mt-4 text-base font-semibold">Análise não concluída</h3>
        <p className="mt-1 max-w-lg text-sm leading-6 text-muted-foreground">
          {error}
        </p>
        <Button className="mt-4" variant="outline" onClick={() => void onRetry()}>
          <RefreshCw className="h-4 w-4" />
          Tentar novamente
        </Button>
      </CardContent>
    </Card>
  );
}

export function AiInsightsResult({
  headingRef,
  result,
}: {
  headingRef?: React.Ref<HTMLHeadingElement>;
  result: AiInsightsResponse;
}) {
  const actions = [...result.actions].sort(
    (left, right) =>
      PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority],
  );

  return (
    <div className="min-w-0 space-y-4">
      <Card className="overflow-hidden border-primary/20 shadow-none">
        <CardHeader className="border-b border-border bg-primary/[0.035] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle
              ref={headingRef}
              tabIndex={-1}
              className="flex items-center gap-2 text-base focus:outline-none"
            >
              <Sparkles className="h-4 w-4 text-primary" />
              Diagnóstico executivo
            </CardTitle>
            <DataQualityBadge status={result.dataQuality.status} />
          </div>
          <CardDescription>
            {moduleLabel(result.source.module)} · {surfaceLabel(result.source.surface)} · {result.period.label}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-4">
          <p className="whitespace-pre-line text-sm leading-6 text-foreground">
            {result.summary}
          </p>
          {result.dataQuality.notes.length ? (
            <div className="rounded-md border border-border bg-muted/25 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Qualidade e limites dos dados
              </p>
              <ul className="mt-2 space-y-1 text-xs leading-5 text-muted-foreground">
                {result.dataQuality.notes.map((note, index) => (
                  <li key={`${index}-${note}`} className="flex items-start gap-2">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {result.findings.length ? (
        <section aria-labelledby="ai-findings-heading">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 id="ai-findings-heading" className="text-sm font-semibold text-foreground">
              Evidências e oportunidades
            </h3>
            <Badge variant="outline">{result.findings.length}</Badge>
          </div>
          <div className="grid min-w-0 gap-3 md:grid-cols-2">
            {result.findings.map((finding, index) => (
              <Card key={`${index}-${finding.title}`} className="min-w-0 shadow-none">
                <CardContent className="space-y-3 p-4">
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <h4 className="min-w-0 text-sm font-semibold leading-5 text-foreground">
                      {finding.title}
                    </h4>
                    <ConfidenceBadge value={finding.confidence} />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Evidência
                    </p>
                    <p className="mt-1 text-sm leading-5 text-foreground">
                      {finding.evidence}
                    </p>
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground">
                    {finding.interpretation}
                  </p>
                  {finding.widget ? (
                    <Badge variant="secondary" className="max-w-full truncate" title={finding.widget}>
                      {finding.widget}
                    </Badge>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="ai-actions-heading">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <h3 id="ai-actions-heading" className="text-sm font-semibold text-foreground">
              Plano de ação priorizado
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Valide o impacto por experimento e acompanhamento do KPI.
            </p>
          </div>
          <Badge variant="outline">{actions.length}</Badge>
        </div>
        {actions.length ? (
          <div className="space-y-3">
            {actions.map((action, index) => (
              <Card key={`${index}-${action.title}`} className="min-w-0 overflow-hidden shadow-none">
                <CardContent className="p-0">
                  <div className="grid min-w-0 lg:grid-cols-[minmax(0,1fr)_minmax(240px,0.34fr)]">
                    <div className="min-w-0 space-y-4 p-4">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-bold tabular-nums text-primary">
                          {index + 1}
                        </span>
                        <h4 className="min-w-0 flex-1 text-sm font-semibold leading-5 text-foreground">
                          {action.title}
                        </h4>
                        <PriorityBadge value={action.priority} />
                      </div>
                      <p className="text-sm leading-6 text-muted-foreground">
                        {action.whyNow}
                      </p>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Como executar
                        </p>
                        <ol className="mt-2 space-y-2">
                          {action.steps.map((step, stepIndex) => (
                            <li key={`${stepIndex}-${step}`} className="flex items-start gap-2 text-sm leading-5">
                              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-secondary-foreground">
                                {stepIndex + 1}
                              </span>
                              <span>{step}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                      {action.risks.length ? (
                        <div className="rounded-md border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-400/20 dark:bg-amber-400/[0.07]">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
                            Cuidados
                          </p>
                          <p className="mt-1 text-xs leading-5 text-amber-900/80 dark:text-amber-100/75">
                            {action.risks.join(" · ")}
                          </p>
                        </div>
                      ) : null}
                    </div>
                    <div className="min-w-0 border-t border-border bg-muted/20 p-4 lg:border-l lg:border-t-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Resultado e medição
                      </p>
                      <p className="mt-2 text-sm font-medium leading-5 text-foreground">
                        {action.expectedEffect}
                      </p>
                      <dl className="mt-4 space-y-3 text-xs">
                        {action.targetKpi ? (
                          <MetricRow icon={TrendingUp} label="KPI" value={action.targetKpi} />
                        ) : null}
                        {action.baseline || action.target ? (
                          <MetricRow
                            icon={ArrowRight}
                            label="Baseline → meta"
                            value={`${action.baseline ?? "A medir"} → ${action.target ?? "Definir no piloto"}`}
                          />
                        ) : null}
                        <MetricRow icon={CalendarClock} label="Janela" value={action.measurementWindow} />
                        <MetricRow icon={CircleGauge} label="Esforço" value={capitalize(action.effort)} />
                        {action.owner ? (
                          <MetricRow icon={Target} label="Responsável" value={action.owner} />
                        ) : null}
                      </dl>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="border-dashed shadow-none">
            <CardContent className="p-4 text-sm text-muted-foreground">
              Os dados disponíveis não sustentaram uma ação prática com confiança suficiente.
            </CardContent>
          </Card>
        )}
      </section>

      {result.questions.length ? (
        <Card className="shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Dados que aumentariam a precisão</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 text-sm leading-5 text-muted-foreground md:grid-cols-2">
              {result.questions.map((question, index) => (
                <li key={`${index}-${question}`} className="flex items-start gap-2">
                  <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{question}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <p className="px-1 text-[11px] leading-5 text-muted-foreground">
        {result.disclaimer}
      </p>
    </div>
  );
}

function MetricRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
      <div className="min-w-0">
        <dt className="text-muted-foreground">{label}</dt>
        <dd className="mt-0.5 break-words font-medium leading-5 text-foreground">{value}</dd>
      </div>
    </div>
  );
}

function DataQualityBadge({
  status,
}: {
  status: AiInsightsResponse["dataQuality"]["status"];
}) {
  if (status === "suficiente") {
    return <Badge variant="success">Dados suficientes</Badge>;
  }
  if (status === "parcial") {
    return <Badge variant="warning">Dados parciais</Badge>;
  }
  return <Badge variant="destructive">Dados insuficientes</Badge>;
}

function ConfidenceBadge({
  value,
}: {
  value: AiInsightsResponse["findings"][number]["confidence"];
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "shrink-0",
        value === "alta" && "border-emerald-300 text-emerald-700 dark:border-emerald-400/30 dark:text-emerald-300",
        value === "baixa" && "border-amber-300 text-amber-700 dark:border-amber-400/30 dark:text-amber-300",
      )}
    >
      Confiança {value}
    </Badge>
  );
}

function PriorityBadge({
  value,
}: {
  value: AiInsightsResponse["actions"][number]["priority"];
}) {
  const labels = {
    imediata: "Imediata",
    alta: "Alta",
    media: "Média",
    baixa: "Baixa",
  } as const;
  return (
    <Badge
      variant={value === "imediata" ? "default" : value === "alta" ? "warning" : "outline"}
      className="shrink-0"
    >
      {labels[value]}
    </Badge>
  );
}

function moduleLabel(module: AiInsightsResponse["source"]["module"]) {
  return module === "counting" ? "Contagem" : "Ocupação";
}

function surfaceLabel(surface: AiInsightsResponse["source"]["surface"]) {
  if (surface === "live") return "Ao Vivo";
  if (surface === "analysis") return "Análises";
  return "Relatórios";
}

function capitalize(value: string) {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}
