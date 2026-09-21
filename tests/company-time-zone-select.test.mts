import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildCompanyTimeZoneOptions,
  companyTimeZoneLabel,
} from "../lib/company-time-zone-options.ts";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = (pathname: string) =>
  readFileSync(resolve(projectRoot, pathname), "utf8");

test("catálogo de fuso mantém Brasil, UTC e o valor IANA já cadastrado", () => {
  const options = buildCompanyTimeZoneOptions("Pacific/Honolulu", [
    "Europe/Amsterdam",
    "America/Sao_Paulo",
  ]);

  assert.equal(options[0], "America/Sao_Paulo");
  assert.ok(options.includes("UTC"));
  assert.ok(options.includes("Pacific/Honolulu"));
  assert.ok(options.includes("Europe/Amsterdam"));
  assert.equal(new Set(options).size, options.length);
  assert.equal(
    companyTimeZoneLabel("America/Sao_Paulo"),
    "Brasília / São Paulo — America/Sao_Paulo",
  );
});

test("catálogo ignora valores inválidos e canonicaliza aliases IANA", () => {
  const options = buildCompanyTimeZoneOptions("fuso-inválido", [
    "UTC",
    "US/Eastern",
    "também-inválido",
  ]);

  assert.ok(!options.includes("fuso-inválido"));
  assert.ok(!options.includes("também-inválido"));
  assert.ok(options.includes("America/New_York"));
});

test("CRUD de empresas usa seleção IANA obrigatória e envia o valor canônico", () => {
  const dashboard = source("components/app/super-admin-dashboard.tsx");
  const selector = source("components/app/company-time-zone-select.tsx");
  const publishSavedCompany = dashboard.slice(
    dashboard.indexOf("function publishSavedCompany("),
    dashboard.indexOf("async function saveCompany()"),
  );
  const saveCompany = dashboard.slice(
    dashboard.indexOf("async function saveCompany()"),
    dashboard.indexOf("async function deleteCompany("),
  );

  assert.match(dashboard, /<CompanyTimeZoneSelect/);
  assert.doesNotMatch(
    dashboard.slice(
      dashboard.indexOf('<FormField label="Fuso horário"'),
      dashboard.indexOf('<FormField label="Limite de usuários"'),
    ),
    /<Input/,
  );
  assert.match(selector, /aria-required="true"/);
  assert.match(selector, /data-company-time-zone-select/);
  assert.match(selector, /readRuntimeCompanyTimeZones\(\)/);
  assert.match(selector, /min-w-0 max-w-full/);
  assert.match(saveCompany, /canonicalCompanyTimeZone\(companyForm\.timezone\)/);
  assert.match(saveCompany, /timezone: timeZone/);
  assert.match(saveCompany, /name,/);
  assert.match(saveCompany, /publishSavedCompany\(/);
  assert.match(
    publishSavedCompany,
    /writeCompanyCache\(\[normalized\]\)/,
    "o IANA salvo deve atualizar o cache temporal imediatamente",
  );
  assert.match(
    publishSavedCompany,
    /setStoredMasterCompanyScope\(\{[\s\S]*timezone: normalized\.timezone/,
    "a empresa selecionada deve publicar o novo IANA sem exigir novo login",
  );
});
