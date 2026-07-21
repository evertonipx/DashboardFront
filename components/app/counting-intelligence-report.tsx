"use client";

import * as React from "react";
import {
  ArrowDownRight,
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  CalendarRange,
  Clock3,
  Gauge,
  Settings2,
  Trophy,
} from "lucide-react";

import { EChart, type EnterpriseChartOption } from "@/components/app/echart";
import { ScenarioPicker } from "@/components/app/scenario-picker";
import { useWidgetColor } from "@/components/app/widget-appearance";
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
import {
  buildAnnualAccumulatedComparisonChartOption,
  buildAnnualComparisonChartOption,
  buildAccessShareChartOption,
  buildCountingMonthlyComparison,
  buildDirectionalHourlyChartOption,
  COUNTING_INTELLIGENCE_CARD_IDS,
  COUNTING_MONTH_LABELS,
  formatCountingIntelligencePeriod,
  formatDelta,
  formatPercentage,
  type CountingIntelligenceModel,
} from "@/lib/counting-intelligence";
import type { Scenario } from "@/lib/types";
import { cn, formatNumber } from "@/lib/utils";

type CountingIntelligenceWidgetsProps = {
  loading: boolean;
  model: CountingIntelligenceModel;
  onRankingScenarioIdsChange: (ids: string[]) => void;
  onRankingOrderChange: (order: "asc" | "desc") => void;
  onRankingSelectionModeChange: (mode: "all" | "custom") => void;
  rankingOrder: "asc" | "desc";
  rankingScenarioIds: string[];
  rankingSelectionMode: "all" | "custom";
  scenarios: Scenario[];
};

export function buildCountingIntelligenceWidgetCards({
  loading,
  model,
  onRankingScenarioIdsChange,
  onRankingOrderChange,
  onRankingSelectionModeChange,
  rankingOrder,
  rankingScenarioIds,
  rankingSelectionMode,
  scenarios,
}: CountingIntelligenceWidgetsProps) {
  const monthLabel = COUNTING_MONTH_LABELS[model.currentMonth];
  const leader = model.accesses[0];
  const periodLabel = formatCountingIntelligencePeriod(model);

  return [
    {
      id: COUNTING_INTELLIGENCE_CARD_IDS.periodTotal,
      label: "Total do período",
      defaultSize: "compact" as const,
      node: (
        <ExecutiveMetricCard
          description={
            comparisonDescription(
              model.periodDelta,
              "o mesmo período do ano anterior",
            )
          }
          icon={Gauge}
          label="Total do período"
          loading={loading}
          period={periodLabel}
          trend={model.periodDelta}
          value={formatNumber(model.periodValue)}
        />
      ),
    },
    {
      id: COUNTING_INTELLIGENCE_CARD_IDS.endMonth,
      label: "Mês final do período",
      defaultSize: "compact" as const,
      node: (
        <ExecutiveMetricCard
          description={
            comparisonDescription(
              model.currentMonthDelta,
              monthLabel + "/" + (model.currentYear - 1),
            )
          }
          icon={CalendarRange}
          label={monthLabel + "/" + model.currentYear}
          loading={loading}
          period="Mês final do período"
          trend={model.currentMonthDelta}
          value={formatNumber(model.currentMonthValue)}
        />
      ),
    },
    {
      id: COUNTING_INTELLIGENCE_CARD_IDS.monthlyAverage,
      label: "Média mensal",
      defaultSize: "compact" as const,
      node: (
        <ExecutiveMetricCard
          description={
            "Base anterior: " +
            formatNumber(model.previousPeriodAverage) +
            " por mês"
          }
          icon={Clock3}
          label="Média mensal"
          loading={loading}
          period={
            model.periodMonthCount +
            (model.periodMonthCount === 1
              ? " mês com dados"
              : " meses com dados")
          }
          value={formatNumber(model.periodAverage)}
        />
      ),
    },
    {
      id: COUNTING_INTELLIGENCE_CARD_IDS.accessLeader,
      label: "Acesso líder",
      defaultSize: "compact" as const,
      node: (
        <ExecutiveMetricCard
          description={
            leader
              ? formatPercentage(leader.share) + " do fluxo no período"
              : "Sem fluxo direcional no período"
          }
          icon={Trophy}
          label="Acesso líder"
          loading={loading}
          period={periodLabel}
          textValue
          value={leader?.name ?? "-"}
        />
      ),
    },
    {
      id: COUNTING_INTELLIGENCE_CARD_IDS.annualComparison,
      chartTypeEnabled: true,
      label: "Comparativo mensal por ano",
      defaultSize: "full" as const,
      className: "sm:col-span-2 xl:col-span-4",
      node: (
        <AnnualComparisonCard loading={loading} model={model} period={periodLabel} />
      ),
    },
    {
      id: COUNTING_INTELLIGENCE_CARD_IDS.annualAccumulatedComparison,
      chartTypeEnabled: true,
      label: "Comparativo acumulado por ano",
      defaultSize: "full" as const,
      className: "sm:col-span-2 xl:col-span-4",
      node: (
        <AnnualAccumulatedComparisonCard
          loading={loading}
          model={model}
          period={periodLabel}
        />
      ),
    },
    {
      id: COUNTING_INTELLIGENCE_CARD_IDS.yearOverYearMonth,
      label: "Tabela mensal comparativa",
      defaultSize: "full" as const,
      className: "sm:col-span-2 xl:col-span-4",
      node: <YearOverYearMatrixCard loading={loading} model={model} />,
    },
    {
      id: COUNTING_INTELLIGENCE_CARD_IDS.directionalFlow,
      chartTypeEnabled: true,
      label: "Fluxo direcional por hora",
      defaultSize: "wide" as const,
      className: "sm:col-span-2 xl:col-span-2",
      node: (
        <ExecutiveChartCard
          badge={formatCountingIntelligencePeriod(model)}
          description="Entradas e saídas consolidadas por hora e cenário no período selecionado."
          empty={!model.directionalHours.some((item) => item.total > 0)}
          loading={loading}
          option={buildDirectionalHourlyChartOption(model)}
          title="Fluxo direcional por hora"
        />
      ),
    },
    {
      id: COUNTING_INTELLIGENCE_CARD_IDS.accessRanking,
      label: "Ranking dos acessos",
      defaultSize: "full" as const,
      className: "sm:col-span-2 xl:col-span-4",
      node: (
        <AccessRankingCard
          loading={loading}
          model={model}
          onScenarioIdsChange={onRankingScenarioIdsChange}
          onOrderChange={onRankingOrderChange}
          onSelectionModeChange={onRankingSelectionModeChange}
          order={rankingOrder}
          scenarioIds={rankingScenarioIds}
          scenarios={scenarios}
          selectionMode={rankingSelectionMode}
        />
      ),
    },
  ];
}

function ExecutiveMetricCard({
  description,
  icon: Icon,
  label,
  loading,
  period,
  textValue = false,
  trend,
  value,
}: {
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  loading: boolean;
  period: string;
  textValue?: boolean;
  trend?: number | null;
  value: string;
}) {
  const TrendIcon =
    trend !== undefined && trend !== null && trend < 0
      ? ArrowDownRight
      : ArrowUpRight;

  return (
    <Card className="h-full min-w-0 overflow-hidden">
      <CardHeader className="space-y-0 px-4 pb-1 pt-3">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <CardTitle className="truncate text-[11px] font-semibold uppercase text-muted-foreground">
            {label}
          </CardTitle>
          <Icon className="h-4 w-4 shrink-0 text-primary" />
        </div>
      </CardHeader>
      <CardContent className="min-w-0 px-4 pb-3 pt-1">
        {loading ? (
          <Skeleton className="h-8 w-32" />
        ) : (
          <div
            className={cn(
              "truncate font-semibold text-foreground",
              textValue ? "text-lg" : "text-2xl tabular-nums",
            )}
            title={value}
          >
            {value}
          </div>
        )}
        <div
          className="mt-1 truncate text-[10px] text-muted-foreground"
          title={period}
        >
          {period}
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-1 text-[10px] text-muted-foreground">
          {trend !== undefined && trend !== null ? (
            <TrendIcon
              className={cn(
                "h-3 w-3 shrink-0",
                trend > 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : trend < 0
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-muted-foreground",
              )}
            />
          ) : null}
          <span className="truncate" title={description}>
            {description}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function AnnualComparisonCard({
  loading,
  model,
  period,
}: {
  loading: boolean;
  model: CountingIntelligenceModel;
  period: string;
}) {
  const widgetColor = useWidgetColor();
  const option = React.useMemo(
    () => buildAnnualComparisonChartOption(model, widgetColor),
    [model, widgetColor],
  );

  return (
    <ExecutiveChartCard
      badge={period}
      chartClassName="h-[320px]"
      description={`Anos lado a lado. Linha tracejada: média mensal de ${
        model.currentYear - 1
      } como média-base, quando houver dados.`}
      loading={loading}
      option={option}
      primarySeriesIndex={null}
      title="Comparativo mensal por ano"
    />
  );
}

function AnnualAccumulatedComparisonCard({
  loading,
  model,
  period,
}: {
  loading: boolean;
  model: CountingIntelligenceModel;
  period: string;
}) {
  const widgetColor = useWidgetColor();
  const option = React.useMemo(
    () => buildAnnualAccumulatedComparisonChartOption(model, widgetColor),
    [model, widgetColor],
  );

  return (
    <ExecutiveChartCard
      badge={period}
      chartClassName="h-[320px]"
      description="Soma progressiva mês a mês para comparar a trajetória acumulada de cada ano e identificar avanço ou atraso."
      loading={loading}
      option={option}
      primarySeriesIndex={null}
      title="Comparativo acumulado por ano"
    />
  );
}

function ExecutiveChartCard({
  badge,
  chartClassName = "h-[250px]",
  description,
  empty = false,
  loading,
  option,
  primarySeriesIndex = 0,
  title,
}: {
  badge: string;
  chartClassName?: string;
  description: string;
  empty?: boolean;
  loading: boolean;
  option: React.ComponentProps<typeof EChart>["option"];
  primarySeriesIndex?: number | null;
  title: string;
}) {
  const widgetColor = useWidgetColor();
  const coloredOption = React.useMemo(
    () =>
      primarySeriesIndex === null
        ? option
        : applyPrimaryBarColor(option, widgetColor, primarySeriesIndex),
    [option, primarySeriesIndex, widgetColor],
  );

  return (
    <Card className="h-full min-w-0 overflow-hidden">
      <CardHeader className="border-b px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-sm">{title}</CardTitle>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {description}
            </p>
          </div>
          <Badge
            variant="outline"
            className="max-w-full truncate text-[10px]"
            title={badge}
          >
            {badge}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3 pt-2">
        {loading ? (
          <Skeleton className={cn("w-full", chartClassName)} />
        ) : empty ? (
          <div className={cn("flex items-center justify-center rounded-md border border-dashed bg-muted/15 px-4 text-center text-xs text-muted-foreground", chartClassName)}>
            Sem fluxo de entrada ou saída registrado no período selecionado.
          </div>
        ) : (
          <EChart option={coloredOption} className={chartClassName} />
        )}
      </CardContent>
    </Card>
  );
}

function AccessRankingCard({
  loading,
  model,
  onScenarioIdsChange,
  onOrderChange,
  onSelectionModeChange,
  order,
  scenarioIds,
  scenarios,
  selectionMode,
}: {
  loading: boolean;
  model: CountingIntelligenceModel;
  onScenarioIdsChange: (ids: string[]) => void;
  onOrderChange: (order: "asc" | "desc") => void;
  onSelectionModeChange: (mode: "all" | "custom") => void;
  order: "asc" | "desc";
  scenarioIds: string[];
  scenarios: Scenario[];
  selectionMode: "all" | "custom";
}) {
  const widgetColor = useWidgetColor();
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const option = React.useMemo(
    () => buildAccessShareChartOption(model, widgetColor),
    [model, widgetColor],
  );
  const chartHeight = Math.max(260, model.accesses.length * 34 + 24);

  return (
    <Card className="h-full min-w-0 overflow-hidden">
      <CardHeader className="border-b px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-[min(100%,16rem)] flex-1">
            <CardTitle className="text-sm">Ranking dos acessos</CardTitle>
            <CardDescription className="mt-1 text-[10px] leading-4">
              Cada acesso corresponde a um cenário; os picos horários consideram
              o período selecionado.
            </CardDescription>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <Badge
              variant="outline"
              className="max-w-[180px] truncate text-[10px]"
              title={formatCountingIntelligencePeriod(model)}
            >
              {formatCountingIntelligencePeriod(model)}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {model.accesses.length} acessos · 100%
            </Badge>
            <div className="inline-flex overflow-hidden rounded-md border bg-card">
              <Button
                type="button"
                variant={order === "desc" ? "secondary" : "ghost"}
                size="icon"
                className="h-8 w-8 rounded-none border-0"
                onClick={() => onOrderChange("desc")}
                aria-label="Ordenar do maior para o menor"
                title="Ordenar do maior para o menor"
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant={order === "asc" ? "secondary" : "ghost"}
                size="icon"
                className="h-8 w-8 rounded-none border-0 border-l"
                onClick={() => onOrderChange("asc")}
                aria-label="Ordenar do menor para o maior"
                title="Ordenar do menor para o maior"
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Button
              type="button"
              variant={settingsOpen ? "default" : "outline"}
              size="icon"
              className="h-8 w-8"
              onClick={() => setSettingsOpen((current) => !current)}
              aria-label="Selecionar cenários do ranking"
              title="Selecionar cenários"
            >
              <Settings2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-3">
        {settingsOpen ? (
          <div className="rounded-md border bg-muted/20 p-3">
            <ScenarioPicker
              mode={selectionMode}
              onModeChange={onSelectionModeChange}
              onSelectedIdsChange={onScenarioIdsChange}
              scenarios={scenarios}
              selectedIds={scenarioIds}
            />
            <div className="mt-3 flex justify-end">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setSettingsOpen(false)}
              >
                Concluir
              </Button>
            </div>
          </div>
        ) : null}
        {loading ? (
          <Skeleton className="h-[300px] w-full" />
        ) : model.accesses.length ? (
          <div className="max-h-[640px] min-w-0 overflow-y-auto">
            <div style={{ height: chartHeight }}>
              <EChart option={option} />
            </div>
          </div>
        ) : (
          <div className="flex h-[180px] items-center justify-center px-4 text-center text-xs text-muted-foreground">
            Sem dados direcionais. Configure as linhas de entrada e saída nos
            cenários de acesso.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function YearOverYearMatrixCard({
  loading,
  model,
}: {
  loading: boolean;
  model: CountingIntelligenceModel;
}) {
  const comparison = React.useMemo(
    () => buildCountingMonthlyComparison(model),
    [model],
  );

  return (
    <Card className="h-full min-w-0 max-w-full overflow-hidden">
      <CardHeader className="border-b px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-sm">Tabela mensal comparativa</CardTitle>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Anos, meses, acumulado e média; a variação usa sempre o ano mais
              recente contra o anterior.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="gap-1 bg-card text-[10px]">
              <CalendarRange className="h-3.5 w-3.5" />
              {formatCountingIntelligencePeriod(model)}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              Var. {comparison.latestYear}/{comparison.comparisonYear}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="max-w-full overflow-x-auto px-2 pb-3 pt-2 sm:px-4">
        {loading ? (
          <Skeleton className="h-[190px] min-w-[1040px]" />
        ) : comparison.rows.length ? (
          <table className="w-full min-w-[1040px] table-fixed border-separate border-spacing-0 text-[11px]">
            <colgroup>
              <col className="w-[76px]" />
              {COUNTING_MONTH_LABELS.map((month) => (
                <col key={month} className="w-[64px]" />
              ))}
              <col className="w-[100px]" />
              <col className="w-[90px]" />
            </colgroup>
            <thead>
              <tr>
                <th className="sticky left-0 z-10 border-b border-r bg-muted/80 px-2 py-2 text-left font-semibold backdrop-blur">
                  Ano
                </th>
                {COUNTING_MONTH_LABELS.map((month) => (
                  <th
                    key={month}
                    className="border-b px-1 py-2 text-right font-semibold text-muted-foreground"
                  >
                    {month}
                  </th>
                ))}
                <th className="border-b border-l bg-primary/5 px-2 py-2 text-right font-semibold text-primary">
                  Acumulado
                </th>
                <th className="border-b bg-muted/35 px-2 py-2 text-right font-semibold text-muted-foreground">
                  Média
                </th>
              </tr>
            </thead>
            <tbody>
              {comparison.rows.map((row) => (
                <YearComparisonValueRow
                  accumulated={row.accumulated}
                  average={row.average}
                  baselineOnly={row.baselineOnly}
                  current={row.year === comparison.latestYear}
                  key={row.year}
                  label={String(row.year)}
                  values={row.months}
                />
              ))}
              <tr className="bg-muted/15">
                <th className="sticky left-0 z-10 border-b border-r bg-muted/80 px-2 py-2 text-left font-semibold text-muted-foreground backdrop-blur">
                  Var. {comparison.latestYear}/{comparison.comparisonYear}
                </th>
                {COUNTING_MONTH_LABELS.map((_, month) => (
                  <DeltaCell
                    key={month}
                    value={comparison.variation.months[month]}
                  />
                ))}
                <DeltaCell
                  className="border-l bg-primary/5 font-semibold"
                  value={comparison.variation.accumulated}
                />
                <DeltaCell
                  className="bg-muted/20"
                  value={comparison.variation.average}
                />
              </tr>
            </tbody>
          </table>
        ) : (
          <div className="flex h-[150px] min-w-[980px] items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
            Nenhum mês com dados dentro do período selecionado.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function YearComparisonValueRow({
  accumulated,
  average,
  baselineOnly,
  current = false,
  label,
  values,
}: {
  accumulated: number;
  average: number | null;
  baselineOnly: boolean;
  current?: boolean;
  label: string;
  values: Array<number | null>;
}) {
  return (
    <tr className={cn(current && "bg-primary/[0.035]")}>
      <th
        className={cn(
          "sticky left-0 z-10 border-b border-r px-2 py-2 text-left font-semibold tabular-nums backdrop-blur",
          current ? "bg-primary/10 text-primary" : "bg-card text-foreground",
        )}
      >
        {label}
        {baselineOnly ? (
          <span className="ml-1 text-[9px] font-normal text-muted-foreground">
            base
          </span>
        ) : null}
      </th>
      {values.map((value, month) => (
        <td key={month} className="border-b px-1.5 py-2 text-right tabular-nums">
          {value === null ? (
            <span className="text-muted-foreground/50">-</span>
          ) : (
            <span title={formatNumber(value)}>{compactMetric(value)}</span>
          )}
        </td>
      ))}
      <td className="border-b border-l bg-primary/5 px-2 py-2 text-right font-semibold tabular-nums">
        {compactMetric(accumulated)}
      </td>
      <td className="border-b bg-muted/20 px-2 py-2 text-right tabular-nums">
        {average === null ? "-" : compactMetric(average)}
      </td>
    </tr>
  );
}

function DeltaCell({
  className,
  value,
}: {
  className?: string;
  value: number | null;
}) {
  return (
    <td
      className={cn(
        "border-b px-1.5 py-2 text-right text-[10px] font-medium tabular-nums",
        value !== null && value > 0
          ? "text-emerald-600 dark:text-emerald-400"
          : value !== null && value < 0
            ? "text-rose-600 dark:text-rose-400"
            : "text-muted-foreground",
        className,
      )}
    >
      {formatDelta(value)}
    </td>
  );
}

function applyPrimaryBarColor(
  option: EnterpriseChartOption,
  color: string,
  seriesIndex: number,
): EnterpriseChartOption {
  const series = Array.isArray(option.series) ? option.series : [];

  return {
    ...option,
    series: series.map((item, index) => {
      if (index !== seriesIndex || !item || typeof item !== "object") {
        return item;
      }

      const record = item as Record<string, unknown>;
      if (record.type !== "bar") return item;
      const itemStyle =
        record.itemStyle && typeof record.itemStyle === "object"
          ? (record.itemStyle as Record<string, unknown>)
          : {};

      return {
        ...record,
        itemStyle: { ...itemStyle, color },
      };
    }),
  } as EnterpriseChartOption;
}

function compactMetric(value: number) {
  if (Math.abs(value) < 10_000) return formatNumber(value);
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 1,
    notation: "compact",
  }).format(value);
}

function comparisonDescription(value: number | null, reference: string) {
  return value === null
    ? "Sem base comparável em " + reference
    : formatDelta(value) + " vs. " + reference;
}
