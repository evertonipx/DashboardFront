import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  companyDateTimeLocalInstant,
  companyDateTimeLocalValue,
} from "../lib/company-time-zone.ts";
import { aggregateQueryIso } from "../lib/aggregate-time.ts";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("datetime-local representa o mesmo instante no IANA da empresa", () => {
  const instant = new Date("2026-09-18T18:20:00.000Z");

  assert.equal(
    companyDateTimeLocalValue(instant, "America/Sao_Paulo"),
    "2026-09-18T15:20",
  );
  assert.equal(
    companyDateTimeLocalInstant(
      "2026-09-18T15:20",
      "America/Sao_Paulo",
    )?.toISOString(),
    instant.toISOString(),
  );
  assert.equal(
    aggregateQueryIso(instant, "minute"),
    "2026-09-18T18:20:00.000Z",
    "o endpoint recebe RFC3339 UTC para o mesmo instante civil da empresa",
  );
  assert.equal(
    companyDateTimeLocalInstant(
      "2026-09-18T09:00",
      "Asia/Kathmandu",
    )?.toISOString(),
    "2026-09-18T03:15:00.000Z",
  );
});

test("datetime-local trata minutos repetidos e inexistentes no DST", () => {
  assert.equal(
    companyDateTimeLocalInstant(
      "2024-11-03T01:30",
      "America/New_York",
    )?.toISOString(),
    "2024-11-03T05:30:00.000Z",
    "a primeira ocorrência do minuto repetido deve ser determinística",
  );
  assert.equal(
    companyDateTimeLocalInstant(
      "2024-03-10T02:30",
      "America/New_York",
    ),
    null,
    "um horário civil inexistente não pode ser deslocado silenciosamente",
  );
});

test("construtor de Visões serializa o calendário da empresa, não o navegador", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/app/views-manager.tsx"),
    "utf8",
  );

  assert.match(source, /useEffectiveCompanyTimeZoneResolution\(user\)/);
  assert.match(source, /companyDateTimeLocalInstant\(/);
  assert.match(source, /companyDateTimeLocalValue\(/);
  assert.match(source, /startOfCompanyTimeZoneDay\(/);
  assert.doesNotMatch(source, /toDateTimeLocalValue/);
  assert.doesNotMatch(source, /function parseLocalDateTimeInput/);
  assert.match(
    source.slice(
      source.indexOf("function materializeGeneratedView()"),
      source.indexOf("if (!canAccessViews)"),
    ),
    /!companyTimeZoneReady/,
  );
});
