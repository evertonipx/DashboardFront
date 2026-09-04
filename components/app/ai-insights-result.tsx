"use client";

import * as React from "react";
import {
  AlertTriangle,
  ArrowRight,
  BrainCog,
  CalendarClock,
  CircleGauge,
  Lightbulb,
  Loader2,
  RefreshCw,
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
            Lendo a série completa e os comparativos
          </div>
          <CardDescription>
            A IA está examinando os dias disponíveis e vinculando cada medida a evidências numéricas.
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
  const primaryAction = actions[0] ?? null;
  const hasMaterialPremises =
    result.dataQuality.status !== "suficiente" ||
    result.dataQuality.notes.length > 0 ||
    result.questions.length > 0;

  return (
    <div className="min-w-0 space-y-4">
      <Card className="overflow-hidden border-primary/20 shadow-none">
        <CardHeader className="border-b border-border bg-primary/[0.035] p-4">
          <CardTitle
            ref={headingRef}
            tabIndex={-1}
            className="flex items-center gap-2 text-base focus:outline-none"
          >
            <BrainCog className="h-4 w-4 text-primary" />
            Direção recomendada
          </CardTitle>
          <CardDescription>
            {moduleLabel(result.source.module)} · {surfaceLabel(result.source.surface)} · {result.period.label}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-4">
          <p className="whitespace-pre-line text-sm leading-6 text-foreground">
            {result.summary}
          </p>
          {primaryAction ? (
            <div className="rounded-md border border-primary/20 bg-primary/[0.045] p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                Próximo movimento
              </p>
              <p className="mt-1 text-sm font-semibold leading-5 text-foreground">
                {primaryAction.title}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {primaryAction.expectedEffect} · Validar em {primaryAction.measurementWindow}.
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {result.findings.length ? (
        <section aria-labelledby="ai-findings-heading">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 id="ai-findings-heading" className="text-sm font-semibold text-foreground">
              Oportunidades de resultado
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
                      Sinal observado
                    </p>
                    <p className="mt-1 text-sm leading-5 text-foreground">
                      {finding.evidence}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      O que isso abre para o próximo ciclo
                    </p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {finding.interpretation}
                    </p>
                  </div>
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
              Plano para capturar o resultado
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              O que executar agora, como medir e quando escalar.
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
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Por que pode mover o resultado
                        </p>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                          {action.whyNow}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Execução
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
                            Condições para funcionar
                          </p>
                          <p className="mt-1 text-xs leading-5 text-amber-900/80 dark:text-amber-100/75">
                            {action.risks.join(" · ")}
                          </p>
                        </div>
                      ) : null}
                    </div>
                    <div className="min-w-0 border-t border-border bg-muted/20 p-4 lg:border-l lg:border-t-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Impacto e meta
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
                            label="Ponto de partida → meta"
                            value={`${action.baseline ?? "A medir"} → ${action.target ?? "Definir no piloto"}`}
                          />
                        ) : null}
                        <MetricRow icon={CalendarClock} label="Prazo de validação" value={action.measurementWindow} />
                        <MetricRow icon={CircleGauge} label="Esforço" value={capitalize(action.effort)} />
                        {action.owner ? (
                          <MetricRow icon={Target} label="Dono sugerido" value={action.owner} />
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

      {hasMaterialPremises ? (
        <details className="rounded-md border border-border bg-muted/15 px-4 py-3 text-sm">
          <summary className="cursor-pointer font-medium text-foreground">
            Base e premissas
          </summary>
          <div className="mt-3 space-y-3 text-xs leading-5 text-muted-foreground">
            {result.dataQuality.notes.length ? (
              <ul className="space-y-1">
                {result.dataQuality.notes.map((note, index) => (
                  <li key={`${index}-${note}`} className="flex items-start gap-2">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {result.questions.length ? (
              <div>
                <p className="font-semibold text-foreground">
                  O que destrava a próxima decisão
                </p>
                <ul className="mt-1 grid gap-1 md:grid-cols-2">
                  {result.questions.map((question, index) => (
                    <li key={`${index}-${question}`} className="flex items-start gap-2">
                      <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      <span>{question}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </details>
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
      Força do sinal · {value}
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
