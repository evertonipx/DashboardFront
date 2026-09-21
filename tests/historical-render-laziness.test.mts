import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function source(pathname: string) {
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

test("CardLayout sinaliza demanda somente quando cada card é materializado", () => {
  const cardLayout = source("components/app/card-layout.tsx");
  const itemSection = cardLayout.slice(
    cardLayout.indexOf("function CardLayoutItem"),
    cardLayout.indexOf("function WidgetOrganizerDialog"),
  );

  assert.match(
    cardLayout,
    /onCardMaterialize\?: \(cardId: string\) => void/,
    "o layout deve expor um callback genérico por card",
  );
  assert.match(cardLayout, /onMaterialize=\{onCardMaterialize\}/);
  assert.match(itemSection, /const materializationNotifiedRef = React\.useRef\(false\)/);
  assert.match(
    itemSection,
    /if \(!onMaterialize \|\| materializationNotifiedRef\.current\) return;[\s\S]*?materializationNotifiedRef\.current = true;[\s\S]*?onMaterialize\(card\.id\)/,
    "cada id deve ser notificado no máximo uma vez por escopo",
  );
  assert.match(
    itemSection,
    /new IntersectionObserver\([\s\S]*?entry\.isIntersecting[\s\S]*?scheduleCardMaterialization\([\s\S]*?notifyMaterialized\(\)[\s\S]*?setContentReady\(true\)/,
    "a demanda deve acompanhar a materialização próxima ao viewport",
  );
});

test("CardLayout antecipa conteúdo sem manter consulta fora da viewport", () => {
  const cardLayout = source("components/app/card-layout.tsx");
  const itemSection = cardLayout.slice(
    cardLayout.indexOf("function CardLayoutItem"),
    cardLayout.indexOf("function WidgetOrganizerDialog"),
  );

  assert.match(
    cardLayout,
    /cardDemandRootMargin\?: string;[\s\S]*?cardDemandScopeKey\?: string;[\s\S]*?onCardDemand\?: \(cardId: string, demanded: boolean\) => void/,
  );
  assert.match(
    cardLayout,
    /cardDemandRootMargin = "800px 0px"[\s\S]*?onDemand=\{onCardDemand\}[\s\S]*?demandRootMargin=\{cardDemandRootMargin\}/,
  );
  assert.match(
    itemSection,
    /notifyDemanded\(entry\.isIntersecting\)[\s\S]*?rootMargin: demandRootMargin/,
    "a rede deve começar antes da viewport para não exibir um card aguardando dados durante a rolagem",
  );
  assert.match(
    itemSection,
    /observer\.disconnect\(\);\s*notifyDemanded\(false\)/,
    "ao sair da tela ou desmontar, o card deve retirar sua demanda",
  );
  assert.match(
    itemSection,
    /demandedRef\.current = null;[\s\S]*?materializationNotifiedRef\.current = false;\s*}, \[demandScopeKey\]\)/,
    "a troca de empresa/cenário deve reiniciar demanda e certificação da materialização",
  );
  assert.match(
    itemSection,
    /}, \[contentReady, demandScopeKey, notifyMaterialized\]\);/,
    "um card já renderizado deve notificar a materialização novamente no novo escopo",
  );
  assert.match(
    itemSection,
    /rootMargin: "600px 0px"/,
    "a preparação visual continua antecipada para preservar a rolagem fluida",
  );
  assert.equal(
    itemSection.includes("[content-visibility:auto]") ||
      itemSection.includes("[contain-intrinsic-size:"),
    false,
    "o navegador não deve descartar a pintura de canvases ao rolar",
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
