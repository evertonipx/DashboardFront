import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  isCertifiedOccupancyCompanyTimeZone,
  requireCertifiedOccupancyCompanyTimeZone,
} from "../lib/occupancy-company-time-zone.ts";

test("Ocupação aceita apenas um timezone associado à empresa", () => {
  const certified = {
    fallback: false,
    source: "selected-company" as const,
    timeZone: "America/Sao_Paulo",
  };

  assert.equal(isCertifiedOccupancyCompanyTimeZone(certified), true);
  assert.equal(
    requireCertifiedOccupancyCompanyTimeZone(certified),
    "America/Sao_Paulo",
  );
});

test("Ocupação não consulta usando fallback ou padrão do deployment", () => {
  for (const resolution of [
    {
      fallback: true,
      source: "fallback" as const,
      timeZone: "America/Sao_Paulo",
    },
    {
      fallback: false,
      source: "deployment-default" as const,
      timeZone: "America/Sao_Paulo",
    },
  ]) {
    assert.equal(isCertifiedOccupancyCompanyTimeZone(resolution), false);
    assert.throws(
      () => requireCertifiedOccupancyCompanyTimeZone(resolution),
      /Fuso horário da empresa indisponível/,
    );
  }
});

test("Ao Vivo, Análises e Relatórios preservam a origem certificada do timezone", () => {
  const liveSource = readFileSync(
    new URL("../components/app/occupancy-scenario-dashboard.tsx", import.meta.url),
    "utf8",
  );
  const reportSource = readFileSync(
    new URL("../components/app/occupancy-reports-dashboard.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    liveSource,
    /secondaryOccupancyQueriesEnabled\s*=\s*companyTimeZoneCertified\s*&&/,
  );
  assert.match(
    liveSource,
    /requireCertifiedOccupancyCompanyTimeZone\(\s*certifiedCompanyTimeZoneResolution/,
  );
  assert.match(
    reportSource,
    /const companyTimeZoneResolution =\s*useEffectiveCompanyTimeZoneResolution\(user\)/,
  );
  assert.doesNotMatch(
    reportSource,
    /source:\s*rawCompanyTimeZoneResolution\.fallback[\s\S]*?deployment-default/,
  );
  assert.equal(
    (reportSource.match(/companyTimeZoneCertified\s*&&/g) ?? []).length,
    4,
    "comparação, duração, permanência e insights históricos precisam do mesmo gate certificado",
  );
  assert.match(
    reportSource,
    /requireCertifiedOccupancyCompanyTimeZone\(\s*companyTimeZoneResolution/,
  );
  assert.match(
    reportSource,
    /sharedOccupancyCivilCapabilities\(companyScopeId, companyTimeZone\)/,
  );
  assert.match(
    reportSource,
    /const scheduleAiQuery = createOccupancyQueryScheduler\(signal\)/,
  );
});
