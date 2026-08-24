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
import {
  WidgetTitleText,
  useWidgetColor,
} from "@/components/app/widget-appearance";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
      maxHeightLevel: 2 as const,
      maxWidthLevel: 3 as const,
      minHeightLevel: 1 as const,
      minWidthLevel: 1 as const,
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
      maxHeightLevel: 2 as const,
      maxWidthLevel: 3 as const,
      minHeightLevel: 1 as const,
      minWidthLevel: 1 as const,
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
      maxHeightLevel: 2 as const,
      maxWidthLevel: 3 as const,
      minHeightLevel: 1 as const,
      minWidthLevel: 1 as const,
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
      maxHeightLevel: 2 as const,
      maxWidthLevel: 3 as const,
      minHeightLevel: 1 as const,
      minWidthLevel: 1 as const,
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
      defaultHeight: "tall" as const,
      defaultSize: "full" as const,
      className: "sm:col-span-2 xl:col-span-4",
      maxHeightLevel: 6 as const,
      maxWidthLevel: 6 as const,
      minHeightLevel: 4 as const,
      minWidthLevel: 4 as const,
      node: (
        <AnnualComparisonCard loading={loading} model={model} period={periodLabel} />
      ),
    },
    {
      id: COUNTING_INTELLIGENCE_CARD_IDS.annualAccumulatedComparison,
      chartTypeEnabled: true,
      label: "Comparativo acumulado por ano",
      defaultHeight: "tall" as const,
      defaultSize: "full" as const,
      className: "sm:col-span-2 xl:col-span-4",
      maxHeightLevel: 6 as const,
      maxWidthLevel: 6 as const,
      minHeightLevel: 4 as const,
      minWidthLevel: 4 as const,
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
      colorEditable: false,
      defaultHeight: "tall" as const,
      defaultSize: "full" as const,
      className: "sm:col-span-2 xl:col-span-4",
      maxHeightLevel: 6 as const,
      maxWidthLevel: 6 as const,
      minHeightLevel: 4 as const,
      minWidthLevel: 6 as const,
      narrowMinHeightLevel: 5 as const,
      node: <YearOverYearMatrixCard loading={loading} model={model} />,
    },
    {
      id: COUNTING_INTELLIGENCE_CARD_IDS.directionalFlow,
      chartTypeEnabled: true,
      label: "Fluxo direcional por hora",
      defaultSize: "wide" as const,
      className: "sm:col-span-2 xl:col-span-2",
      maxHeightLevel: 6 as const,
      maxWidthLevel: 6 as const,
      minHeightLevel: 4 as const,
      minWidthLevel: 3 as const,
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
      defaultHeight: "tall" as const,
      defaultSize: "full" as const,
      className: "sm:col-span-2 xl:col-span-4",
      maxHeightLevel: 6 as const,
      maxWidthLevel: 6 as const,
      minHeightLevel: 5 as const,
      minWidthLevel: 4 as const,
      narrowMinHeightLevel: 5 as const,
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
  ].map((card) => ({ ...card, titleEditable: true as const }));
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
  const widgetColor = useWidgetColor();

  return (
    <Card className="h-full min-w-0 overflow-hidden">
      <CardHeader className="space-y-0 px-4 pb-1 pt-3">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
          <CardTitle className="min-w-0 text-xs font-semibold uppercase leading-4 text-muted-foreground">
            <WidgetTitleText fallback={label} />
          </CardTitle>
          <span className="shrink-0 self-start justify-self-end" style={{ color: widgetColor }}>
            <Icon className="h-4 w-4" />
          </span>
        </div>
      </CardHeader>
      <CardContent className="min-w-0 px-4 pb-3 pt-1">
        {loading ? (
          <Skeleton className="h-8 w-32" />
        ) : (
          <div
            className={cn(
              "min-w-0 break-words font-semibold leading-tight text-foreground [overflow-wrap:anywhere]",
              textValue
                ? "text-[clamp(1rem,7cqi,1.125rem)]"
                : "text-[clamp(1.25rem,9cqi,1.5rem)] tabular-nums",
            )}
            title={value}
          >
            {value}
          </div>
        )}
        <div className="mt-1 line-clamp-1 break-words text-[11px] leading-4 text-muted-foreground [overflow-wrap:anywhere]" title={period}>
          {period}
        </div>
        <div className="mt-1 flex min-w-0 items-start gap-1 text-[11px] leading-4 text-muted-foreground">
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
          <span className="line-clamp-1 min-w-0 break-words [overflow-wrap:anywhere]" title={description}>
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
      chartClassName="h-full min-h-0"
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
      chartClassName="h-full min-h-0"
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
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-2">
          <div className="min-w-0">
            <CardTitle className="text-sm">
              <WidgetTitleText fallback={title} />
            </CardTitle>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {description}
            </p>
          </div>
          <Badge
            variant="outline"
            className="w-fit max-w-full whitespace-normal break-words text-left text-[11px] leading-4 [overflow-wrap:anywhere]"
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
  return (
    <Card className="h-full min-w-0 overflow-hidden">
      <CardHeader className="border-b px-4 py-3">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-2">
          <div className="min-w-0">
            <CardTitle className="text-sm">
              <WidgetTitleText fallback="Ranking dos acessos" />
            </CardTitle>
            <CardDescription className="mt-1 text-[11px] leading-4">
              Cada acesso corresponde a um cenário; os picos horários consideram
              o período selecionado.
            </CardDescription>
          </div>
          <div className="flex shrink-0 flex-nowrap items-center justify-self-end gap-1.5">
            <div className="inline-flex shrink-0 overflow-hidden rounded-md border bg-card">
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
              className="h-8 w-8 shrink-0"
              onClick={() => setSettingsOpen(true)}
              aria-label="Selecionar cenários do ranking"
              title="Selecionar cenários"
            >
              <Settings2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="col-span-full flex min-w-0 flex-wrap items-center gap-1.5">
            <Badge
              variant="outline"
              className="max-w-full whitespace-normal break-words text-[11px] leading-4 [overflow-wrap:anywhere]"
              title={formatCountingIntelligencePeriod(model)}
            >
              {formatCountingIntelligencePeriod(model)}
            </Badge>
            <Badge variant="outline" className="text-[11px]">
              {model.accesses.length} acessos · 100%
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent
        className="min-h-0 flex-1 overflow-hidden p-3"
        data-echart-layout="natural"
      >
        {loading ? (
          <Skeleton className="h-full min-h-0 w-full" />
        ) : model.accesses.length ? (
          <div className="h-full min-h-0 min-w-0 flex-1 overflow-hidden">
            <EChart option={option} />
          </div>
        ) : (
          <div className="flex h-[180px] items-center justify-center px-4 text-center text-xs text-muted-foreground">
            Sem dados direcionais. Configure as linhas de entrada e saída nos
            cenários de acesso.
          </div>
        )}
      </CardContent>
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="grid max-h-[90dvh] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Selecionar cenários do ranking</DialogTitle>
            <DialogDescription>
              Escolha quais acessos participam do ranking. O gráfico permanece
              responsivo ao tamanho do widget.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto pr-1">
            <ScenarioPicker
              mode={selectionMode}
              onModeChange={onSelectionModeChange}
              onSelectedIdsChange={onScenarioIdsChange}
              scenarios={scenarios}
              selectedIds={scenarioIds}
            />
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setSettingsOpen(false)}>
              Concluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-2">
          <div className="min-w-0">
            <CardTitle className="text-sm">
              <WidgetTitleText fallback="Tabela mensal comparativa" />
            </CardTitle>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Anos, meses, acumulado e média; a variação usa sempre o ano mais
              recente contra o anterior.
            </p>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Badge variant="outline" className="max-w-full gap-1 whitespace-normal break-words bg-card text-[11px] leading-4 [overflow-wrap:anywhere]">
              <CalendarRange className="h-3.5 w-3.5" />
              {formatCountingIntelligencePeriod(model)}
            </Badge>
            <Badge variant="outline" className="text-[11px]">
              Var. {comparison.latestYear}/{comparison.comparisonYear}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent
        aria-label="Comparativo anual; role horizontalmente para ver todos os meses"
        className="enterprise-horizontal-scroll max-w-full overflow-x-auto px-2 pb-3 pt-2 sm:px-4"
        role="region"
        tabIndex={0}
      >
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
          <span className="ml-1 text-[10px] font-normal text-muted-foreground">
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
        "border-b px-1.5 py-2 text-right text-[11px] font-medium tabular-nums",
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
