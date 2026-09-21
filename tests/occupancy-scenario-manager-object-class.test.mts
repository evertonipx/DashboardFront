import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  initialOccupancyScenarioObjectClass,
  occupancyScenarioObjectClassOptions,
  retainAreasCompatibleWithObjectClass,
} from "../lib/occupancy-scenario-object-class.ts";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function option(
  areaId: string,
  objectClass?: string,
  cameraId = "camera-a",
) {
  return {
    area_id: areaId,
    camera_id: cameraId,
    key: JSON.stringify([cameraId, areaId]),
    label: areaId,
    object_class: objectClass,
  };
}

test("cenário novo deriva a classe do primeiro item do catálogo certificado", () => {
  const options = [
    option("sem-classe"),
    option("vaga", "vehicle"),
    option("pedestre", "Person"),
  ];

  assert.equal(initialOccupancyScenarioObjectClass(options, true), "vehicle");
  assert.equal(initialOccupancyScenarioObjectClass(options, false), "");
  assert.equal(initialOccupancyScenarioObjectClass([], true), "");
});

test("seletor contém somente a classe atual e as classes reais do catálogo", () => {
  const options = [
    option("vaga-a", "vehicle"),
    option("vaga-b", "vehicle"),
    option("pedestre", "Person"),
    option("sem-classe"),
  ];

  assert.deepEqual(
    occupancyScenarioObjectClassOptions(options, "legacy-class"),
    ["legacy-class", "vehicle", "Person"],
  );
  assert.deepEqual(occupancyScenarioObjectClassOptions(options), [
    "vehicle",
    "Person",
  ]);
});

test("troca de classe remove apenas áreas comprovadamente incompatíveis", () => {
  const areas = [
    { area_id: "vaga", camera_id: "camera-a" },
    { area_id: "pedestre", camera_id: "camera-a" },
    { area_id: "legada", camera_id: "camera-a" },
    { area_id: "sem-classe", camera_id: "camera-a" },
  ];
  const options = [
    option("vaga", "vehicle"),
    option("pedestre", "person"),
    option("sem-classe"),
  ];

  assert.deepEqual(
    retainAreasCompatibleWithObjectClass(areas, "vehicle", options),
    [areas[0], areas[2], areas[3]],
  );
});

test("editor não inventa person e preserva a classe validada pela API", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/app/occupancy-scenario-manager.tsx"),
    "utf8",
  );

  assert.match(source, /object_class:\s*scenario\.object_class/);
  assert.doesNotMatch(
    source,
    /object_class:\s*scenario\.object_class\s*\|\|/,
  );
  assert.doesNotMatch(source, /object_class:\s*["']person["']/);
  assert.doesNotMatch(source, /<SelectItem\s+value=["']person["']/);
  assert.match(source, /initialOccupancyScenarioObjectClass\(/);
  assert.match(source, /retainAreasCompatibleWithObjectClass\(/);
});
