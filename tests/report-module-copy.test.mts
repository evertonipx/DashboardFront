import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const root = resolve(import.meta.dirname, "..");

function payloadSource(file: string, start: string, end: string) {
  const source = readFileSync(resolve(root, file), "utf8");
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `${file}: payload não encontrado`);
  return source.slice(from, to);
}

test("Contagem usa título canônico e recorte curto nos PDFs de Relatórios e Análises", () => {
  const reports = payloadSource(
    "components/app/scenario-reports-dashboard.tsx",
    "function composeScenarioReportPayload({",
    "async function buildAiScenarioReportPayload(",
  );
  const analysis = payloadSource(
    "components/app/period-analysis-dashboard.tsx",
    "function composePeriodAnalysisReport({",
    "function periodAnalysisDataCompleteUntil(",
  );
  for (const payload of [reports, analysis]) {
    assert.match(payload, /title:\s*"Relatório IPXData - Contagem"/);
    assert.match(payload, /subtitle:\s*`Período analisado:/);
    assert.match(payload, /context:\s*\[\s*\]/);
  }
});

test("Ocupação não leva cenário nem metadados técnicos ao contexto do PDF", () => {
  const payload = payloadSource(
    "components/app/occupancy-reports-dashboard.tsx",
    "function buildOccupancyReportPayload(",
    "async function getOccupancyReportPayload(",
  );
  assert.match(payload, /title:\s*"Relatório IPXData - Ocupação"/);
  assert.match(payload, /subtitle:\s*`Período analisado:/);
  assert.match(payload, /context:\s*\[\s*\]/);
  assert.doesNotMatch(payload, /title:\s*selectedScope/);
});

test("Demografia mantém ressalva estatística sem poluir título ou período", () => {
  const payload = payloadSource(
    "components/app/demographics-dashboard.tsx",
    "function buildDemographicsReport({",
    "function distributionReportTable<",
  );
  assert.match(payload, /title:\s*"Relatório IPXData - Demografia"/);
  assert.match(payload, /subtitle:\s*`Período analisado:/);
  assert.match(payload, /context:\s*\[\s*"Percentuais sobre detecções classificadas; não representam visitantes únicos\."/);
  assert.doesNotMatch(payload, /context:\s*\[[\s\S]*?câmera\(s\) analisada\(s\)/);
});
