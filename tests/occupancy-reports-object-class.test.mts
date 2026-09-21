import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const projectRoot = process.cwd();
const reportsSource = readFileSync(
  resolve(projectRoot, "components/app/occupancy-reports-dashboard.tsx"),
  "utf8",
);

test("Relatorios de Ocupacao nao presumem person no fallback por cameras", () => {
  assert.doesNotMatch(reportsSource, /DEFAULT_OBJECT_CLASS/);
  assert.doesNotMatch(reportsSource, /object_class\s*:\s*["']person["']/);

  const rawPath = reportsSource.match(
    /function occupancyPath\([\s\S]*?return `\/occupancy\?\$\{params\.toString\(\)\}`;\s*}/,
  )?.[0];
  assert.ok(rawPath, "a rota bruta de ocupacao deve continuar declarada");
  assert.doesNotMatch(rawPath, /object_class/);
  assert.match(rawPath, /from:\s*from\.toISOString\(\)/);
  assert.match(rawPath, /to:\s*to\.toISOString\(\)/);

  const snapshotValidation = reportsSource.match(
    /requireOccupancySnapshotRowsForCameras\(response,\s*{[\s\S]*?}\);/,
  )?.[0];
  assert.ok(
    snapshotValidation,
    "o retorno bruto deve continuar certificado pelas cameras esperadas",
  );
  assert.match(snapshotValidation, /expectedCameraIds:\s*scope\.cameraIds/);
  assert.doesNotMatch(snapshotValidation, /expectedObjectClass/);
});

test("Relatorios preservam as rotas certificadas de agregado e historico por cenario", () => {
  assert.match(
    reportsSource,
    /\/occupancy\/scenarios\/\$\{encodeURIComponent\(scenarioId\)\}\/aggregate\?/,
  );
  assert.match(
    reportsSource,
    /\/occupancy\/scenarios\/\$\{encodeURIComponent\(scenarioId\)\}\/history\?/,
  );
});
