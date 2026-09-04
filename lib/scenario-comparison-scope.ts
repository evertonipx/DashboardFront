import { requireCompanyTimeZone } from "@/lib/company-time-zone";

export type ScenarioComparisonSourceScope = {
  companyScopeId: string;
  companyTimeZone: string;
};

type ScenarioScopeIdentity = {
  company_id: string;
  id: string;
};

export function requireScenarioComparisonScope({
  companyScopeId,
  companyTimeZone,
  hourlySource,
  scenarios = [],
}: {
  companyScopeId: string | null | undefined;
  companyTimeZone: string;
  hourlySource?: ScenarioComparisonSourceScope;
  scenarios?: readonly ScenarioScopeIdentity[];
}) {
  const cleanCompanyScopeId = companyScopeId?.trim() ?? "";
  if (!cleanCompanyScopeId) {
    throw new Error("Empresa indisponível para esta comparação.");
  }

  const canonicalTimeZone = requireCompanyTimeZone(companyTimeZone);
  const foreignScenario = scenarios.find(
    (scenario) => scenario.company_id !== cleanCompanyScopeId,
  );
  if (foreignScenario) {
    throw new Error(
      "Comparativo indisponível: a seleção contém um cenário de outra empresa.",
    );
  }

  if (hourlySource) {
    if (hourlySource.companyScopeId.trim() !== cleanCompanyScopeId) {
      throw new Error(
        "Comparativo bloqueado: a fonte horária pertence a outra empresa.",
      );
    }
    if (
      requireCompanyTimeZone(hourlySource.companyTimeZone) !==
      canonicalTimeZone
    ) {
      throw new Error(
        "Comparativo bloqueado: a fonte horária usa outro fuso.",
      );
    }
  }

  return {
    companyScopeId: cleanCompanyScopeId,
    companyTimeZone: canonicalTimeZone,
  };
}
