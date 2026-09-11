import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const modules = new Map();
const catalog = load("lib/occupancy-area-options.ts");
const camera = (company_id = "selected", id = "camera-a") => ({ company_id, id, name: `Camera ${id}`, active: true });
const area = (company_id = "selected", camera_id = "camera-a", area_id = "region-a") => ({
  company_id, camera_id, area_id, area_name: `Area ${area_id}`, object_class: "person",
  source_kind: "region", active: true, last_seen_at: "2026-09-11T10:00:00Z",
});

function fetchCatalog(cameras, areas, overrides = {}) {
  return catalog.fetchOccupancyAreaCatalog({
    companyId: "selected", from: new Date("2026-09-11T09:00:00Z"), to: new Date("2026-09-11T11:00:00Z"),
    request: async (path) => {
      if (path === "/cameras") return cameras;
      if (path === "/occupancy/areas") return { complete: true, data: areas };
      throw new Error(`Unexpected fallback ${path}`);
    }, ...overrides,
  });
}

test("Master explícito separa catálogo por empresa antes de validar campos de outro tenant", async () => {
  const result = await fetchCatalog([camera(), { company_id: "foreign" }], [area(), { company_id: "foreign" }], { masterCrossCompanyScope: true });
  assert.equal(result.authoritative, true);
  assert.deepEqual(result.options.map(({ camera_id, area_id }) => ({ camera_id, area_id })), [{ camera_id: "camera-a", area_id: "region-a" }]);
});

test("usuário comum rejeita empresa estranha em câmeras ou áreas, sem ativação implícita", async () => {
  for (const masterCrossCompanyScope of [undefined, false]) {
    await assert.rejects(fetchCatalog([camera(), camera("foreign", "camera-b")], [area()], { masterCrossCompanyScope }), /fora da empresa autenticada/);
    await assert.rejects(fetchCatalog([camera()], [area(), area("foreign", "camera-b")], { masterCrossCompanyScope }), /fora da empresa autenticada/);
  }
});

test("Master não atribui à empresa selecionada IDs ausentes, nulos ou inválidos", async () => {
  for (const company of [undefined, null, "", " selected "]) {
    const cameraRow = camera(); cameraRow.company_id = company;
    await assert.rejects(fetchCatalog([cameraRow], [area()], { masterCrossCompanyScope: true }), /company_id/);
    const row = area(); row.company_id = company;
    await assert.rejects(fetchCatalog([camera()], [row], { masterCrossCompanyScope: true }), /company_id/);
  }
});

test("o contrato tenant-scoped comum continua aceitando company_id omitido", async () => {
  const ownCamera = camera(); delete ownCamera.company_id;
  const ownArea = area(); delete ownArea.company_id;
  assert.equal((await fetchCatalog([ownCamera], [ownArea])).options.length, 1);
});

test("filtragem Master não relaxa câmera, duplicação, classe ou completude do catálogo selecionado", async () => {
  const master = { masterCrossCompanyScope: true };
  await assert.rejects(fetchCatalog([camera()], [area("selected", "unknown-camera")], master), /câmera desconhecida/);
  await assert.rejects(fetchCatalog([camera()], [area(), area()], master), /duplicada/);
  await assert.rejects(fetchCatalog([camera()], [{ ...area(), object_class: "Person" }], master), /lowercase/);
  await assert.rejects(fetchCatalog([camera()], [], { ...master, request: async (path) => path === "/cameras" ? [camera()] : { complete: false, data: [area()] } }), /não concluiu/);
  const result = await fetchCatalog([camera()], [{ ...area(), active: false }], master);
  assert.deepEqual(result.options, []);
});

test("caller deriva a permissão explícita do usuário autenticado e mantém escopo HTTP", () => {
  const source = readFileSync(resolve("components/app/occupancy-scenario-manager.tsx"), "utf8");
  assert.match(source, /const masterCrossCompanyScope = usesMasterCrossCompanyScope\(\s*user,\s*companyScopeId/);
  assert.match(source, /fetchOccupancyAreaCatalog\(\{[\s\S]*?masterCrossCompanyScope,[\s\S]*?apiFetch<T>\(path, \{ companyScopeId \}\)/);
  const callback = source.slice(source.indexOf("const loadAreaOptions"), source.indexOf("React.useLayoutEffect", source.indexOf("const loadAreaOptions")));
  assert.match(callback, /\[companyScopeId, masterCrossCompanyScope\]/);
});

test("fallback 404 separa snapshots mistos pela relação explícita câmera/empresa apenas para Master", async () => {
  const row = { camera_id: "camera-a", area: "region-a", current_value: 0, avg: 0, min: 0, peak: 0, current_at: "2026-09-11T10:00:00Z" };
  const calls = [];
  const request = async (path) => {
    calls.push(path);
    if (path === "/cameras") return [camera(), camera("foreign", "camera-b")];
    if (path === "/occupancy/areas") throw Object.assign(new Error("missing"), { status: 404 });
    if (path.startsWith("/occupancy?")) return { data: [row, { camera_id: "camera-b" }] };
    if (path === "/cameras/camera-a/line-counts") return [];
    throw new Error(`Unexpected foreign request ${path}`);
  };
  const result = await fetchCatalog([], [], { masterCrossCompanyScope: true, request });
  assert.equal(result.authoritative, false);
  assert.deepEqual(result.options.map((option) => option.camera_id), ["camera-a"]);
  assert.ok(!calls.some((path) => path.includes("camera-b/")));
  await assert.rejects(fetchCatalog([], [], { masterCrossCompanyScope: false, request }), /fora da empresa autenticada/);
});

test("fallback Master não aceita câmera desconhecida, relação ambígua, ID ausente ou empresa contraditória", async () => {
  const row = { camera_id: "camera-a", area: "region-a", current_value: 0, avg: 0, min: 0, peak: 0, current_at: "2026-09-11T10:00:00Z" };
  for (const [cameras, snapshots, pattern] of [
    [[camera()], [{ ...row, camera_id: "unknown" }], /desconhecida/],
    [[camera()], [{ ...row, camera_id: undefined }], /camera_id/],
    [[camera(), camera("foreign", "camera-a")], [row], /duplicada/],
    [[camera(), { company_id: "foreign" }], [row], /id da câmera/],
    [[camera()], [{ ...row, company_id: "foreign" }], /contradiz/],
  ]) {
    await assert.rejects(fetchCatalog([], [], { masterCrossCompanyScope: true, request: async (path) => {
      if (path === "/cameras") return cameras;
      if (path === "/occupancy/areas") throw Object.assign(new Error("missing"), { status: 404 });
      if (path.startsWith("/occupancy?")) return snapshots;
      return [];
    } }), pattern);
  }
});

function load(path) {
  if (modules.has(path)) return modules.get(path);
  const loaded = { exports: {} }; modules.set(path, loaded.exports);
  const output = ts.transpileModule(readFileSync(resolve(path), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("module", "exports", "require", output)(loaded, loaded.exports, (name) => {
    if (name === "@/lib/api") return { apiFetch: () => { throw new Error("No production API in this fixture"); } };
    if (name === "@/lib/master-company-scope") return { filterScopedApiRows: (rows, companyId) => rows.filter((row) => row.company_id === companyId) };
    return name.startsWith("@/") ? load(`${name.slice(2)}.ts`) : require(name);
  });
  return loaded.exports;
}
