import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");

function source(file: string) {
  return readFileSync(resolve(root, file), "utf8");
}

test("Ao Vivo exporta apenas widgets visíveis, na ordem salva, com título, tipo e paleta configurados", () => {
  const live = source("components/app/realtime-dashboard.tsx");
  assert.match(live, /const visibleLiveCardIds = React\.useMemo\([\s\S]*?preference\.visible[\s\S]*?return \[\.\.\.ordered, \.\.\.missing\]/);
  assert.match(live, /const visibleLiveCardIdSet = new Set\(visibleLiveCardIds\)/);
  assert.match(live, /if \(annualMonthlyReportModel\?\.liveAnnualComparisonModel\)/);
  assert.match(live, /if \(visibleLiveCardIdSet\.has\("live_month_hour_heatmap"\)\)/);
  assert.match(live, /visibleLiveCardIdSet\.has\(`live_custom_\$\{widget\.id\}`\)/);
  assert.match(live, /applyChartTypePreference\([\s\S]*?liveChartTypeByCardId\.get\(cardId\)/);
  assert.match(live, /applyCountingViewPalette\([\s\S]*?liveViewPaletteColors/);
  assert.match(live, /resolveLiveTitle\(cardId, chart\.title\)/);
  assert.match(live, /visibleLiveCardIds\s*\.map\(\(id\) => chartByCardId\.get\(id\)\)/);
  assert.match(live, /tables: visibleLiveCardIds\s*\.map\(\(id\) =>/);
  assert.match(live, /const missingCardId = visibleLiveCardIds\.find\([\s\S]*?!chartByCardId\.has\(cardId\)/);
});

test("Análises utiliza somente widgets exibidos e mantém configuração de cada gráfico", () => {
  const analysis = source("components/app/period-analysis-dashboard.tsx");
  assert.match(analysis, /const queryWidgets = React\.useMemo\([\s\S]*?orderByCardPreferences\(widgets, preferences\)/);
  assert.match(analysis, /models: queryWidgets\.flatMap\(\(widget\) =>/);
  assert.match(analysis, /chartType: widgetChartTypeById\.get\(widget\.id\)/);
  assert.match(analysis, /title: widgetTitleById\.get\(widget\.id\) \?\? widget\.title/);
  assert.match(analysis, /paletteColors: analysisViewPaletteColors/);
  assert.match(analysis, /applyChartTypePreference\(model\.option, chartType\)/);
});

test("Relatórios não incluem tabelas externas à visão e resolvem gráficos fora da tela", () => {
  const reports = source("components/app/scenario-reports-dashboard.tsx");
  assert.match(reports, /const visibleReportCardIds = React\.useMemo\([\s\S]*?preference\.visible[\s\S]*?return \[\.\.\.ordered, \.\.\.missing\]/);
  assert.match(reports, /visibleReportCardIds\.filter\([\s\S]*?cardId === "report_scenario_period_comparison"/);
  assert.match(reports, /visibleComparisonCardIds\s*\.map\(async \(cardId\) =>/);
  assert.match(reports, /reportScenarioComparisonStorageKey\(customWidget\.id\)[\s\S]*?loadScenarioComparisonSettings\(/);
  assert.doesNotMatch(reports, /comparisonReportCharts/);
  assert.match(reports, /tables: visibleReportCardIds\.flatMap\(/);
  assert.doesNotMatch(reports, /reportContextTableIds|Visões disponíveis|Visão selecionada"\s*,\s*columns:/);
  assert.match(reports, /charts: visibleReportCardIds\s*\.map\(\(id\) => chartByCardId\.get\(id\)\)/);
  assert.match(reports, /const missingCardId = visibleReportCardIds\.find\([\s\S]*?!chartByCardId\.has\(cardId\)/);
  assert.match(reports, /applyChartTypePreference\([\s\S]*?reportChartTypeByCardId\.get\(cardId\)/);
  assert.match(reports, /reportViewPaletteColors/);
});
