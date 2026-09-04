import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function source(pathname) {
  return readFileSync(resolve(projectRoot, pathname), "utf8");
}

test("Análises de Contagem materializam cada modelo somente perto do viewport", () => {
  const dashboard = source("components/app/period-analysis-dashboard.tsx");
  const cardLayout = source("components/app/card-layout.tsx");

  assert.match(cardLayout, /const cardNode = contentReady/);
  assert.match(
    dashboard,
    /node: \(\) => \(\s*<PeriodAnalysisCardRuntime/,
  );
  assert.match(
    dashboard,
    /function PeriodAnalysisCardRuntime[\s\S]*?const model = React\.useMemo\([\s\S]*?buildPeriodAnalysisWidgetModel/,
  );
  assert.doesNotMatch(
    dashboard,
    /const modelByWidgetId = React\.useMemo/,
    "o dashboard não deve construir todos os modelos no mesmo render",
  );
  assert.match(
    dashboard,
    /function buildPeriodAnalysisReportPayload\(\)[\s\S]*?buildPeriodAnalysisWidgetModel/,
    "a exportação continua materializando todos os widgets sob demanda",
  );
});

test("Ocupação adia pontos vazios e a série diária exclusiva da IA", () => {
  const dashboard = source("components/app/occupancy-reports-dashboard.tsx");
  const cardsSection = dashboard.slice(
    dashboard.indexOf("const occupancyReportLayoutCards"),
    dashboard.indexOf("const reportCardIds"),
  );
  const aiSection = dashboard.slice(
    dashboard.indexOf("const getOccupancyAiPayload"),
    dashboard.indexOf("const analysisDateRangeControl"),
  );

  assert.match(cardsSection, /definitions\.map[\s\S]*?node: \(\) => \(/);
  assert.match(cardsSection, /buildEmptyPoints\(definition\)/);
  assert.doesNotMatch(
    dashboard.slice(0, dashboard.indexOf("const getOccupancyAiPayload")),
    /const occupancyDailyAiBucketStarts/,
  );
  assert.match(
    aiSection,
    /listDefinitionQuerySegments\(dailyDefinition\)[\s\S]*?const occupancyDailyAiBucketStarts/,
  );
});

test("Demographics compõe o relatório somente ao exportar", () => {
  const dashboard = source("components/app/demographics-dashboard.tsx");

  assert.match(
    dashboard,
    /function buildDemographicsReportPayload\(\)[\s\S]*?buildDemographicsReport/,
  );
  assert.match(
    dashboard,
    /<ReportExportActions[\s\S]*?getPayload=\{buildDemographicsReportPayload\}/,
  );
  assert.doesNotMatch(dashboard, /const reportPayload = React\.useMemo/);
});
