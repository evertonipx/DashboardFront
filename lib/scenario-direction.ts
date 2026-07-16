import type { Scenario } from "@/lib/types";

export type ScenarioDirection = "entry" | "exit";

export function inferDirectionFromText(
  value: string,
): ScenarioDirection | null {
  const words = normalizeText(value).split(/[^a-z0-9]+/).filter(Boolean);
  const hasEntry = words.some((word) =>
    matchesDirectionWord(word, [
      "entrada",
      "entradas",
      "entry",
      "enter",
      "inbound",
      "ingresso",
      "ent",
      "in",
    ]),
  );
  const hasExit = words.some((word) =>
    matchesDirectionWord(word, [
      "saida",
      "saidas",
      "exit",
      "outbound",
      "egresso",
      "sai",
      "out",
    ]),
  );

  if (hasEntry === hasExit) return null;
  return hasEntry ? "entry" : "exit";
}

export function inferScenarioDirection(
  scenario: Scenario,
): ScenarioDirection | null {
  const scenarioDirection = inferDirectionFromText(
    `${scenario.name} ${scenario.description ?? ""}`,
  );
  if (scenarioDirection) return scenarioDirection;

  const lineDirections = new Set(
    scenario.lines.flatMap((line) => {
      const direction = inferDirectionFromText(line.label ?? "");
      return direction ? [direction] : [];
    }),
  );
  if (lineDirections.size === 1) {
    return lineDirections.values().next().value ?? null;
  }

  const activeLines = scenario.lines.filter(
    (line) => line.action_multiplier !== 0,
  );
  if (
    activeLines.length &&
    activeLines.every((line) => line.action_multiplier < 0)
  ) {
    return "exit";
  }

  return null;
}

function matchesDirectionWord(word: string, aliases: string[]) {
  return aliases.some(
    (alias) => word === alias || new RegExp(`^${alias}\\d+$`).test(word),
  );
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
