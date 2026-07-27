import type { Scenario, ScenarioLine } from "@/lib/types";

type UnknownRecord = Record<string, unknown>;

/**
 * Certifica a estrutura usada nos cálculos de cenário.
 *
 * IDs com padding são rejeitados antes da verificação de unicidade para
 * impedir que identidades diferentes convirjam silenciosamente.
 */
export function requireScenarioRows(value: unknown): Scenario[] {
  if (!Array.isArray(value)) {
    throw new Error("A API retornou uma lista de cenários inválida.");
  }

  const scenarioIds = new Set<string>();

  return Array.from(value, (candidate, scenarioIndex) => {
    if (!isRecord(candidate)) {
      throw invalidScenario(scenarioIndex, "o item não é um objeto");
    }

    const id = requireCanonicalId(
      candidate.id,
      `cenário na posição ${scenarioIndex}`,
    );
    if (scenarioIds.has(id)) {
      throw invalidScenario(
        scenarioIndex,
        `o id "${id}" está duplicado`,
      );
    }
    scenarioIds.add(id);

    const companyId = requireCanonicalId(
      candidate.company_id,
      `empresa do cenário "${id}"`,
    );
    requireCanonicalString(
      candidate.name,
      `nome do cenário "${id}"`,
      false,
    );
    if (typeof candidate.active !== "boolean") {
      throw invalidScenario(
        scenarioIndex,
        'o campo "active" deve ser booleano',
      );
    }
    if (!Array.isArray(candidate.lines)) {
      throw invalidScenario(
        scenarioIndex,
        'o campo "lines" deve ser uma lista',
      );
    }
    requireOptionalCanonicalString(
      candidate.description,
      `description do cenário "${id}"`,
      true,
    );
    requireOptionalCanonicalString(
      candidate.scenario_type,
      `scenario_type do cenário "${id}"`,
      false,
    );
    requireOptionalCanonicalString(
      candidate.created_at,
      `created_at do cenário "${id}"`,
      false,
    );
    requireOptionalCanonicalString(
      candidate.updated_at,
      `updated_at do cenário "${id}"`,
      false,
    );
    if (
      candidate.config !== undefined &&
      (!Array.isArray(candidate.config) ||
        Array.from(candidate.config).some(
          (item) => typeof item !== "number" || !Number.isFinite(item),
        ))
    ) {
      throw invalidScenario(
        scenarioIndex,
        'o campo "config" deve ser uma lista de números finitos',
      );
    }

    const lineIds = new Set<string>();
    const lines = Array.from(candidate.lines, (line, lineIndex) =>
      requireScenarioLine(line, id, lineIndex, lineIds),
    );

    return {
      ...candidate,
      id,
      company_id: companyId,
      name: candidate.name,
      active: candidate.active,
      lines,
    } as Scenario;
  });
}

function requireScenarioLine(
  value: unknown,
  scenarioId: string,
  lineIndex: number,
  lineIds: Set<string>,
): ScenarioLine {
  if (!isRecord(value)) {
    throw new Error(
      `Linha inválida na posição ${lineIndex} do cenário "${scenarioId}": o item não é um objeto.`,
    );
  }

  const lineCountId = requireCanonicalId(
    value.line_count_id,
    `linha ${lineIndex} do cenário "${scenarioId}"`,
  );
  if (lineIds.has(lineCountId)) {
    throw new Error(
      `Linha inválida na posição ${lineIndex} do cenário "${scenarioId}": o line_count_id "${lineCountId}" está duplicado.`,
    );
  }
  lineIds.add(lineCountId);

  if (
    value.action_multiplier !== -1 &&
    value.action_multiplier !== 0 &&
    value.action_multiplier !== 1
  ) {
    throw new Error(
      `Linha inválida na posição ${lineIndex} do cenário "${scenarioId}": o action_multiplier deve ser -1, 0 ou 1.`,
    );
  }

  requireOptionalCanonicalString(
    value.label,
    `label da linha ${lineIndex} do cenário "${scenarioId}"`,
    false,
  );

  const line: ScenarioLine = {
    line_count_id: lineCountId,
    action_multiplier: value.action_multiplier,
  };
  if (typeof value.label === "string") {
    line.label = value.label;
  }

  return line;
}

function requireCanonicalId(value: unknown, context: string) {
  if (
    typeof value !== "string" ||
    !value ||
    value !== value.trim()
  ) {
    throw new Error(`ID inválido em ${context}.`);
  }

  return value;
}

function requireCanonicalString(
  value: unknown,
  context: string,
  allowEmpty: boolean,
) {
  if (
    typeof value !== "string" ||
    (!allowEmpty && !value) ||
    value !== value.trim()
  ) {
    throw new Error(`Texto inválido em ${context}.`);
  }

  return value;
}

function requireOptionalCanonicalString(
  value: unknown,
  context: string,
  allowEmpty: boolean,
) {
  if (value === undefined) return;
  requireCanonicalString(value, context, allowEmpty);
}

function invalidScenario(index: number, detail: string) {
  return new Error(`Cenário inválido na posição ${index}: ${detail}.`);
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
