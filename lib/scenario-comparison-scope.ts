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
    throw new Error("Empresa não certificada para esta comparação.");
  }

  const canonicalTimeZone = requireCompanyTimeZone(companyTimeZone);
  const foreignScenario = scenarios.find(
    (scenario) => scenario.company_id !== cleanCompanyScopeId,
  );
  if (foreignScenario) {
    throw new Error(
      `Comparativo bloqueado: o cenário "${foreignScenario.id}" pertence a outra empresa.`,
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
