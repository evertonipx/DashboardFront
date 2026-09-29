import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = readFileSync(
  resolve(import.meta.dirname, "..", "components/app/audit-manager.tsx"),
  "utf8",
);

test("Auditoria Master não chama total global de total da empresa em páginas sem estrangeiros", () => {
  assert.doesNotMatch(source, /pageHadForeignRows/);
  assert.match(source, /label=\{masterCrossCompanyScope \? "Nesta página" : "Histórico"\}/);
  assert.match(source, /masterCrossCompanyScope\s*\? currentResponse\.data\.length\s*: currentResponse\.total/);
  assert.match(source, /<EmptyAuditState scopeFiltered=\{masterCrossCompanyScope\}/);
  assert.match(source, /masterCrossCompanyScope\s*\? `\$\{formatNumber\(currentResponse\.data\.length\)\} registro\(s\) da empresa nesta página`/);
});
